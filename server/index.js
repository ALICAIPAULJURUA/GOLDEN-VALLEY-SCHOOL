import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import cookieSession from 'cookie-session';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import multer from 'multer';
import nodemailer from 'nodemailer';
import { cleanEditorHtml, toSlug } from './content.js';
import { all, closeDatabase, get, openDatabase, persistDatabase, run } from './database.js';
import { createCsrfToken, hasValidCsrfToken, requireAdmin, requireCsrf } from './session.js';
import { seedPosts } from './seed.js';
import { DEFAULT_COLOR_PALETTES, DEFAULT_SITE_COLORS, DEFAULT_SITE_IMAGES, DEFAULT_WHATSAPP_CONTACT_TEMPLATE, DEFAULT_WHATSAPP_WELCOME_MESSAGE } from '../site-theme.js';
import {
  admissionSchema,
  admissionStatusSchema,
  accountPasswordSchema,
  adminCreateSchema,
  adminUpdateSchema,
  articleCommentSchema,
  articleCommentStatusSchema,
  contactMessageSchema,
  contactReplySchema,
  loginSchema,
  mediaUpdateSchema,
  postSchema,
  settingsSchema,
  staffSchema,
  validationMessage,
} from './validation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distPath = path.join(projectRoot, 'dist');
const mediaPath = path.resolve(process.env.MEDIA_PATH || path.join(projectRoot, 'storage', 'media'));
const resultsPath = path.resolve(process.env.RESULTS_PATH || path.join(projectRoot, 'storage', 'admission-results'));
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET;

if (isProduction && (!sessionSecret || sessionSecret.length < 32)) {
  throw new Error('Set SESSION_SECRET to a random value with at least 32 characters before starting production.');
}
if (!fs.existsSync(path.join(distPath, 'index.html'))) {
  throw new Error('Production frontend is missing. Run `npm run build` before starting the server.');
}
if (!sessionSecret) {
  console.warn('SESSION_SECRET is unset. Development logins will expire when the server restarts.');
}

const app = express();
const port = Number(process.env.PORT || 3000);
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const publicPostColumns = `id, slug, type, title, summary, content, event_date AS eventDate,
  event_end_date AS eventEndDate, event_time AS eventTime, event_location AS eventLocation,
  event_registration_url AS eventRegistrationUrl, meta_title AS metaTitle,
  meta_description AS metaDescription, featured_image AS featuredImage,
  created_at AS createdAt, updated_at AS updatedAt`;
const published = 'published = 1';
const csrfSecret = sessionSecret || crypto.randomBytes(48).toString('hex');

app.disable('x-powered-by');
if (isProduction && process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      formAction: ["'self'", 'https://wa.me'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", 'https://cdn.tiny.cloud'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.tiny.cloud'],
      connectSrc: ["'self'", 'https://api.tiny.cloud', 'https://cdn.tiny.cloud'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://sp.tinymce.com'],
      frameSrc: ["'self'", 'blob:', 'https://cdn.tiny.cloud', 'https://www.youtube.com', 'https://www.youtube-nocookie.com', 'https://player.vimeo.com'],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: '1mb', type: 'application/json' }));
app.use(cookieSession({
  name: 'gv_session',
  keys: [csrfSecret],
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  maxAge: 8 * 60 * 60 * 1000,
  path: '/',
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please try again in 15 minutes.' },
});
const admissionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many applications from this connection. Please contact the school office.' },
});
const contactMessageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many messages from this connection. Please try again later.' },
});
const articleCommentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many comments from this connection. Please try again later.' },
});
const articleLikeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many like changes. Please try again later.' },
});
const requireAdminSession = requireAdmin((id) =>
  get('SELECT id, username, role FROM admins WHERE id = ?', [id]),
);
const requireSuperAdmin = (req, res, next) => {
  if (req.admin?.role !== 'superadmin') {
    res.status(403).json({ error: 'Super administrator access is required for this action.' });
    return;
  }
  next();
};
const imageExtensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, mediaPath),
    filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${imageExtensions[file.mimetype] || '.bin'}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, Boolean(imageExtensions[file.mimetype])),
});
const resultsUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, resultsPath),
    filename: (_req, _file, callback) => callback(null, `${crypto.randomUUID()}.upload`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype)) callback(null, true);
    else callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE'));
  },
});
fs.mkdirSync(mediaPath, { recursive: true });
fs.mkdirSync(resultsPath, { recursive: true });

function uploadGuard(middleware) {
  return (req, res, next) => middleware(req, res, (error) => {
    if (error) {
      res.status(error instanceof multer.MulterError ? 400 : 415).json({
        error: error.code === 'LIMIT_FILE_SIZE'
          ? 'The selected file exceeds the upload size limit.'
          : 'Choose a supported file type and try again.',
      });
      return;
    }
    next();
  });
}

function validImageSignature(file) {
  const bytes = fs.readFileSync(file.path);
  const valid = (file.mimetype === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8)
    || (file.mimetype === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    || (file.mimetype === 'image/gif' && bytes.toString('ascii', 0, 3) === 'GIF')
    || (file.mimetype === 'image/webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP');
  if (!valid) fs.unlinkSync(file.path);
  return valid;
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/site-settings', (_req, res) => {
  const stored = Object.fromEntries(all('SELECT key, value FROM settings').map(({ key, value }) => [key, value]));
  res.json({
    schoolName: stored.schoolName,
    tagline: stored.tagline,
    phone: stored.phone,
    email: stored.email,
    whatsappNumber: stored.whatsappNumber,
    applicationsOpen: stored.applicationsOpen !== 'false',
    faviconUrl: stored.faviconUrl || '',
    appleTouchIconUrl: stored.appleTouchIconUrl || '',
    siteImages: JSON.parse(stored.siteImages || JSON.stringify(DEFAULT_SITE_IMAGES)),
    siteColors: JSON.parse(stored.siteColors || JSON.stringify(DEFAULT_SITE_COLORS)),
    savedColorPalettes: JSON.parse(stored.savedColorPalettes || JSON.stringify(DEFAULT_COLOR_PALETTES)),
    whatsappWelcomeMessage: stored.whatsappWelcomeMessage || DEFAULT_WHATSAPP_WELCOME_MESSAGE,
    whatsappContactTemplate: stored.whatsappContactTemplate || DEFAULT_WHATSAPP_CONTACT_TEMPLATE,
  });
});
app.post('/api/messages', contactMessageLimiter, (req, res) => {
  const parsed = contactMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }
  if (parsed.data.website) {
    res.status(201).json({ received: true });
    return;
  }
  const result = run(`INSERT INTO contact_messages (name, email, subject, message)
    VALUES (?, ?, ?, ?)`, [parsed.data.name, parsed.data.email, parsed.data.subject, parsed.data.message]);
  persistDatabase();
  res.status(201).json({ received: true, reference: `GV-M${String(result.lastInsertRowid).padStart(5, '0')}` });
});
app.get('/api/staff', (_req, res) => {
  res.json({
    staff: all(`SELECT id, name, role, bio, image, leadership, display_order AS displayOrder
      FROM staff WHERE published = 1 ORDER BY leadership DESC, display_order ASC, id ASC`),
  });
});
app.get('/api/gallery', (_req, res) => {
  res.json({
    media: all(`SELECT id, filename, original_name AS originalName, mime_type AS mimeType,
      alt_text AS altText, created_at AS createdAt FROM media
      WHERE gallery_visible = 1 ORDER BY created_at DESC`),
  });
});
app.use('/uploads', express.static(mediaPath, { fallthrough: false, maxAge: isProduction ? '1d' : 0 }));
app.use('/api/admin', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.get('/api/admin/messages', requireAdminSession, (_req, res) => {
  res.json({
    messages: all(`SELECT id, name, email, subject, message, status, reply_text AS replyText,
      created_at AS createdAt, replied_at AS repliedAt
      FROM contact_messages ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'read' THEN 1 ELSE 2 END,
      created_at DESC`),
  });
});

app.patch('/api/admin/messages/:id/read', requireAdminSession, requireCsrf, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(400).json({ error: 'Choose a valid message.' });
    return;
  }
  const result = run("UPDATE contact_messages SET status = 'read' WHERE id = ? AND status = 'new'", [id]);
  if (!result.changes && !get('SELECT id FROM contact_messages WHERE id = ?', [id])) {
    res.status(404).json({ error: 'That message could not be found.' });
    return;
  }
  if (result.changes) persistDatabase();
  res.json({ ok: true });
});

app.post('/api/admin/messages/:id/reply', requireAdminSession, requireCsrf, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const parsed = contactReplySchema.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id < 1 || !parsed.success) {
    res.status(400).json({ error: parsed.success ? 'Choose a valid message.' : validationMessage(parsed.error) });
    return;
  }
  const message = get('SELECT id, name, email, subject FROM contact_messages WHERE id = ?', [id]);
  if (!message) {
    res.status(404).json({ error: 'That message could not be found.' });
    return;
  }
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  const port = Number(process.env.SMTP_PORT || 587);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!host || !from || !smtpUser || !smtpPass || !Number.isInteger(port) || port < 1 || port > 65535) {
    res.status(503).json({ error: 'Email replies are not configured yet. Set SMTP_HOST, SMTP_FROM, SMTP_PORT, SMTP_USER, and SMTP_PASS in the server environment.' });
    return;
  }
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: { user: smtpUser, pass: smtpPass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  const safeSubject = message.subject.replace(/[\r\n]+/g, ' ').trim();
  const schoolName = get("SELECT value FROM settings WHERE key = 'schoolName'")?.value || 'Golden Valley School';
  const replyText = `${parsed.data.reply}\n\nWarm regards,\n${schoolName}`;
  try {
    await transporter.sendMail({
      from,
      to: message.email,
      replyTo: from,
      subject: `Re: ${safeSubject}`,
      text: replyText,
    });
  } catch (error) {
    console.error('Unable to send contact-message reply through SMTP.', error);
    res.status(502).json({ error: 'The reply could not be delivered. Check the SMTP configuration and try again.' });
    return;
  }
  run("UPDATE contact_messages SET status = 'replied', reply_text = ?, replied_at = datetime('now') WHERE id = ?",
    [replyText, id]);
  persistDatabase();
  res.json({ ok: true, repliedAt: get('SELECT replied_at AS repliedAt FROM contact_messages WHERE id = ?', [id]).repliedAt });
}));

app.delete('/api/admin/messages/:id', requireAdminSession, requireCsrf, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1 || !run('DELETE FROM contact_messages WHERE id = ?', [id]).changes) {
    res.status(404).json({ error: 'That message could not be found.' });
    return;
  }
  persistDatabase();
  res.status(204).end();
});

app.get('/api/posts', (req, res) => {
  const type = req.query.type;
  if (type && !['news', 'update', 'event'].includes(type)) {
    res.status(400).json({ error: 'Choose a valid post category.' });
    return;
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const typeClause = type ? 'AND type = ?' : '';
  const values = type ? [type, limit] : [limit];
  const eventOrder = type === 'event'
    ? "CASE WHEN event_date >= date('now') THEN 0 ELSE 1 END, event_date ASC, created_at DESC"
    : 'created_at DESC';
  res.json({
    posts: all(
      `SELECT ${publicPostColumns} FROM posts
       WHERE ${published} ${typeClause}
       ORDER BY ${eventOrder} LIMIT ?`,
      values,
    ),
  });
});

app.get('/api/posts/:slug', (req, res) => {
  const post = get(`SELECT ${publicPostColumns} FROM posts WHERE slug = ? AND ${published}`, [req.params.slug]);
  if (!post) {
    res.status(404).json({ error: 'That article could not be found.' });
    return;
  }
  const visitorId = req.session.visitorId;
  res.json({
    post,
    likes: Number(get('SELECT COUNT(*) AS count FROM post_likes WHERE post_id = ?', [post.id]).count),
    liked: visitorId ? Boolean(get('SELECT 1 FROM post_likes WHERE post_id = ? AND visitor_id = ?', [post.id, visitorId])) : false,
    comments: all(`SELECT id, name, body, created_at AS createdAt FROM post_comments
      WHERE post_id = ? AND status = 'approved' ORDER BY created_at ASC, id ASC`, [post.id]),
  });
});

app.post('/api/posts/:slug/likes', articleLikeLimiter, (req, res) => {
  const post = get(`SELECT id FROM posts WHERE slug = ? AND ${published}`, [req.params.slug]);
  if (!post) {
    res.status(404).json({ error: 'That article could not be found.' });
    return;
  }
  req.session.visitorId ||= crypto.randomUUID();
  const existing = get('SELECT 1 FROM post_likes WHERE post_id = ? AND visitor_id = ?', [post.id, req.session.visitorId]);
  if (existing) run('DELETE FROM post_likes WHERE post_id = ? AND visitor_id = ?', [post.id, req.session.visitorId]);
  else run('INSERT INTO post_likes (post_id, visitor_id) VALUES (?, ?)', [post.id, req.session.visitorId]);
  persistDatabase();
  res.json({
    liked: !existing,
    likes: Number(get('SELECT COUNT(*) AS count FROM post_likes WHERE post_id = ?', [post.id]).count),
  });
});

app.post('/api/posts/:slug/comments', articleCommentLimiter, (req, res) => {
  const parsed = articleCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }
  if (parsed.data.website) {
    res.status(201).json({ pending: true });
    return;
  }
  const post = get(`SELECT id FROM posts WHERE slug = ? AND ${published}`, [req.params.slug]);
  if (!post) {
    res.status(404).json({ error: 'That article could not be found.' });
    return;
  }
  run('INSERT INTO post_comments (post_id, name, body) VALUES (?, ?, ?)',
    [post.id, parsed.data.name, parsed.data.body]);
  persistDatabase();
  res.status(201).json({ pending: true });
});

app.post('/api/admissions', admissionLimiter, uploadGuard(resultsUpload.single('previousSchoolResults')), (req, res, next) => {
  const body = req.body || {};
  const parsed = admissionSchema.safeParse(body);
  if (!parsed.success) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }
  if (typeof body.website === 'string' && body.website.trim()) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(201).json({ application: { received: true } });
    return;
  }
  try {
    if (get("SELECT value FROM settings WHERE key = 'applicationsOpen'")?.value === 'false') {
      if (req.file) fs.unlinkSync(req.file.path);
      res.status(403).json({ error: 'Online applications are currently closed. Please contact the school office.' });
      return;
    }
    if (req.file) {
      const data = fs.readFileSync(req.file.path);
      const valid = (req.file.mimetype === 'application/pdf' && data.subarray(0, 5).toString('ascii') === '%PDF-')
        || (req.file.mimetype === 'image/jpeg' && data[0] === 0xff && data[1] === 0xd8)
        || (req.file.mimetype === 'image/png' && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
      if (!valid) {
        fs.unlinkSync(req.file.path);
        res.status(415).json({ error: 'The results file does not appear to be a valid PDF, JPEG, or PNG.' });
        return;
      }
    }
    const application = parsed.data;
    const reference = `GV-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    run(
      `INSERT INTO admissions
        (reference, student_name, date_of_birth, gender, class_applied, parent_name,
         relationship, phone, email, address, previous_school, previous_results_file,
         previous_results_name, additional_information)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        reference,
        application.studentName,
        application.dateOfBirth,
        application.gender,
        application.classApplied,
        application.parentName,
        application.relationship,
        application.phone,
        application.email,
        application.address,
        application.previousSchool,
        req.file?.filename || null,
        req.file ? path.basename(req.file.originalname).slice(0, 200) : null,
        application.additionalInformation,
      ],
    );
    persistDatabase();
    res.status(201).json({ application: { reference } });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/login', loginLimiter, asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Enter your username and password.' });
    return;
  }
  const admin = get('SELECT id, username, role, password_hash AS passwordHash FROM admins WHERE username = ?', [
    parsed.data.username,
  ]);
  const valid = admin && await bcrypt.compare(parsed.data.password, admin.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'The username or password is incorrect.' });
    return;
  }
  req.session = { adminId: admin.id, csrfToken: createCsrfToken() };
  res.json({ admin: { id: admin.id, username: admin.username, role: admin.role }, csrfToken: req.session.csrfToken });
}));

app.get('/api/admin/session', requireAdminSession, (req, res) => {
  if (!req.session.csrfToken) req.session.csrfToken = createCsrfToken();
  res.json({ admin: req.admin, csrfToken: req.session.csrfToken });
});

app.post('/api/admin/logout', requireAdminSession, requireCsrf, (req, res) => {
  req.session = null;
  res.clearCookie('gv_session', { path: '/' });
  res.status(204).end();
});

app.patch('/api/admin/account/password', requireAdminSession, requireCsrf, asyncHandler(async (req, res) => {
  const parsed = accountPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }
  const account = get('SELECT password_hash AS passwordHash FROM admins WHERE id = ?', [req.admin.id]);
  if (!await bcrypt.compare(parsed.data.currentPassword, account.passwordHash)) {
    res.status(403).json({ error: 'Your current password is incorrect.' });
    return;
  }
  if (parsed.data.currentPassword === parsed.data.newPassword) {
    res.status(400).json({ error: 'Choose a new password that differs from the current one.' });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  run('UPDATE admins SET password_hash = ? WHERE id = ?', [passwordHash, req.admin.id]);
  persistDatabase();
  res.json({ ok: true });
}));

app.get('/api/admin/admissions', requireAdminSession, (_req, res) => {
  res.json({
    admissions: all(
      `SELECT id, reference, student_name AS studentName, date_of_birth AS dateOfBirth,
       gender, class_applied AS classApplied, parent_name AS parentName,
       relationship, phone, email, address, previous_school AS previousSchool,
       previous_results_file IS NOT NULL AS hasPreviousResults,
       previous_results_name AS previousResultsName,
       additional_information AS additionalInformation, status, created_at AS createdAt
       FROM admissions ORDER BY created_at DESC LIMIT 500`,
    ),
  });
});

app.get('/api/admin/admissions/:id/results', requireAdminSession, (req, res) => {
  const id = Number(req.params.id);
  const application = Number.isSafeInteger(id) && id > 0
    ? get('SELECT previous_results_file AS filename, previous_results_name AS originalName FROM admissions WHERE id = ?', [id])
    : null;
  if (!application?.filename) {
    res.status(404).json({ error: 'No previous-school results file is attached to this application.' });
    return;
  }
  const filePath = path.join(resultsPath, path.basename(application.filename));
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'The attached results file is no longer available.' });
    return;
  }
  res.download(filePath, path.basename(application.originalName || 'school-results'));
});

app.patch('/api/admin/admissions/:id', requireAdminSession, requireCsrf, (req, res) => {
  const id = Number(req.params.id);
  const parsed = admissionStatusSchema.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(400).json({ error: 'Choose a valid application.' });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }
  const result = run('UPDATE admissions SET status = ? WHERE id = ?', [parsed.data.status, id]);
  if (!result.changes) {
    res.status(404).json({ error: 'That application could not be found.' });
    return;
  }
  persistDatabase();
  res.json({ ok: true });
});

app.get('/api/admin/posts', requireAdminSession, (_req, res) => {
  res.json({
    posts: all(
      `SELECT ${publicPostColumns}, published FROM posts ORDER BY updated_at DESC, id DESC`,
    ),
  });
});

app.get('/api/admin/comments', requireAdminSession, (_req, res) => {
  res.json({
    comments: all(`SELECT post_comments.id, post_comments.post_id AS postId, posts.title AS postTitle,
      posts.slug AS postSlug, post_comments.name, post_comments.body, post_comments.status,
      post_comments.created_at AS createdAt
      FROM post_comments JOIN posts ON posts.id = post_comments.post_id
      ORDER BY CASE post_comments.status WHEN 'pending' THEN 0 ELSE 1 END,
      post_comments.created_at DESC, post_comments.id DESC`),
  });
});

app.patch('/api/admin/comments/:id', requireAdminSession, requireCsrf, (req, res) => {
  const id = Number(req.params.id);
  const parsed = articleCommentStatusSchema.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id < 1 || !parsed.success) {
    res.status(400).json({ error: parsed.success ? 'Choose a valid comment.' : validationMessage(parsed.error) });
    return;
  }
  const result = run('UPDATE post_comments SET status = ? WHERE id = ?', [parsed.data.status, id]);
  if (!result.changes) {
    res.status(404).json({ error: 'That comment could not be found.' });
    return;
  }
  persistDatabase();
  res.json({ ok: true, status: parsed.data.status });
});

app.delete('/api/admin/comments/:id', requireAdminSession, requireCsrf, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1 || !run('DELETE FROM post_comments WHERE id = ?', [id]).changes) {
    res.status(404).json({ error: 'That comment could not be found.' });
    return;
  }
  persistDatabase();
  res.status(204).end();
});

app.post('/api/admin/posts', requireAdminSession, requireCsrf, (req, res) => {
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }
  const post = { ...parsed.data, content: cleanEditorHtml(parsed.data.content) };
  if (!post.content) {
    res.status(400).json({ error: 'Add some article content before saving.' });
    return;
  }
  try {
    const baseSlug = toSlug(post.title) || `post-${Date.now()}`;
    let slug = baseSlug;
    for (let suffix = 2; get('SELECT id FROM posts WHERE slug = ?', [slug]); suffix += 1) {
      slug = `${baseSlug}-${suffix}`;
    }
    const result = run(
      `INSERT INTO posts
        (slug, type, title, summary, content, event_date, event_end_date, event_time,
         event_location, event_registration_url, meta_title, meta_description, featured_image, published)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [slug, post.type, post.title, post.summary, post.content, post.eventDate || null,
        post.eventEndDate || null, post.eventTime, post.eventLocation, post.eventRegistrationUrl,
        post.metaTitle, post.metaDescription, post.featuredImage, Number(post.published)],
    );
    persistDatabase();
    res.status(201).json({
      post: get(`SELECT ${publicPostColumns}, published FROM posts WHERE id = ?`, [result.lastInsertRowid]),
    });
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/posts/:id', requireAdminSession, requireCsrf, (req, res, next) => {
  const id = Number(req.params.id);
  const parsed = postSchema.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(400).json({ error: 'Choose a valid post.' });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }
  const post = { ...parsed.data, content: cleanEditorHtml(parsed.data.content) };
  if (!post.content) {
    res.status(400).json({ error: 'Add some article content before saving.' });
    return;
  }
  try {
    const existing = get('SELECT id FROM posts WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'That post could not be found.' });
      return;
    }
    const baseSlug = toSlug(post.title) || `post-${id}`;
    let slug = baseSlug;
    for (let suffix = 2; get('SELECT id FROM posts WHERE slug = ? AND id != ?', [slug, id]); suffix += 1) {
      slug = `${baseSlug}-${suffix}`;
    }
    run(
      `UPDATE posts SET slug = ?, type = ?, title = ?, summary = ?, content = ?,
       event_date = ?, event_end_date = ?, event_time = ?, event_location = ?,
       event_registration_url = ?, meta_title = ?, meta_description = ?,
       featured_image = ?, published = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [slug, post.type, post.title, post.summary, post.content, post.eventDate || null,
        post.eventEndDate || null, post.eventTime, post.eventLocation, post.eventRegistrationUrl,
        post.metaTitle, post.metaDescription, post.featuredImage, Number(post.published), id],
    );
    persistDatabase();
    res.json({ post: get(`SELECT ${publicPostColumns}, published FROM posts WHERE id = ?`, [id]) });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/posts/:id', requireAdminSession, requireCsrf, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(400).json({ error: 'Choose a valid post.' });
    return;
  }
  const result = run('DELETE FROM posts WHERE id = ?', [id]);
  if (!result.changes) {
    res.status(404).json({ error: 'That post could not be found.' });
    return;
  }
  persistDatabase();
  res.status(204).end();
});

app.get('/api/admin/staff', requireAdminSession, (_req, res) => {
  res.json({
    staff: all(`SELECT id, name, role, bio, image, leadership, display_order AS displayOrder, published
      FROM staff ORDER BY leadership DESC, display_order ASC, id ASC`),
  });
});

app.post('/api/admin/staff', requireAdminSession, requireCsrf, (req, res) => {
  const parsed = staffSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }
  const person = parsed.data;
  const result = run(`INSERT INTO staff (name, role, bio, image, leadership, display_order, published)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, [person.name, person.role, person.bio, person.image,
    Number(person.leadership), person.displayOrder, Number(person.published)]);
  persistDatabase();
  res.status(201).json({ staff: get(`SELECT id, name, role, bio, image, leadership,
    display_order AS displayOrder, published FROM staff WHERE id = ?`, [result.lastInsertRowid]) });
});

app.put('/api/admin/staff/:id', requireAdminSession, requireCsrf, (req, res) => {
  const id = Number(req.params.id);
  const parsed = staffSchema.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id < 1 || !parsed.success) {
    res.status(400).json({ error: parsed.success ? 'Choose a valid staff member.' : validationMessage(parsed.error) });
    return;
  }
  const person = parsed.data;
  const result = run(`UPDATE staff SET name = ?, role = ?, bio = ?, image = ?, leadership = ?,
    display_order = ?, published = ? WHERE id = ?`, [person.name, person.role, person.bio,
    person.image, Number(person.leadership), person.displayOrder, Number(person.published), id]);
  if (!result.changes) {
    res.status(404).json({ error: 'That staff profile could not be found.' });
    return;
  }
  persistDatabase();
  res.json({ staff: get(`SELECT id, name, role, bio, image, leadership,
    display_order AS displayOrder, published FROM staff WHERE id = ?`, [id]) });
});

app.delete('/api/admin/staff/:id', requireAdminSession, requireCsrf, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1 || !run('DELETE FROM staff WHERE id = ?', [id]).changes) {
    res.status(404).json({ error: 'That staff profile could not be found.' });
    return;
  }
  persistDatabase();
  res.status(204).end();
});

app.get('/api/admin/media', requireAdminSession, (_req, res) => {
  res.json({
    media: all(`SELECT id, filename, original_name AS originalName, mime_type AS mimeType,
      size, alt_text AS altText, gallery_visible AS galleryVisible, created_at AS createdAt
      FROM media ORDER BY created_at DESC`),
  });
});

app.post('/api/admin/media', requireAdminSession, requireCsrf,
  uploadGuard(mediaUpload.single('file')), (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Choose a JPG, PNG, GIF, or WebP image to upload.' });
      return;
    }
    if (!validImageSignature(req.file)) {
      res.status(415).json({ error: 'The uploaded file is not a valid image.' });
      return;
    }
    const result = run(`INSERT INTO media (filename, original_name, mime_type, size, alt_text, gallery_visible)
      VALUES (?, ?, ?, ?, ?, ?)`, [req.file.filename, path.basename(req.file.originalname).slice(0, 200),
      req.file.mimetype, req.file.size, String(req.body.altText || '').slice(0, 300),
      req.body.galleryVisible === 'true' ? 1 : 0]);
    persistDatabase();
    res.status(201).json({ media: get(`SELECT id, filename, original_name AS originalName,
      mime_type AS mimeType, size, alt_text AS altText, gallery_visible AS galleryVisible,
      created_at AS createdAt FROM media WHERE id = ?`, [result.lastInsertRowid]) });
  });

app.patch('/api/admin/media/:id', requireAdminSession, requireCsrf, (req, res) => {
  const id = Number(req.params.id);
  const parsed = mediaUpdateSchema.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id < 1 || !parsed.success) {
    res.status(400).json({ error: parsed.success ? 'Choose a valid media item.' : validationMessage(parsed.error) });
    return;
  }
  const result = run('UPDATE media SET alt_text = ?, gallery_visible = ? WHERE id = ?',
    [parsed.data.altText, Number(parsed.data.galleryVisible), id]);
  if (!result.changes) {
    res.status(404).json({ error: 'That media item could not be found.' });
    return;
  }
  persistDatabase();
  res.json({ ok: true });
});

app.delete('/api/admin/media/:id', requireAdminSession, requireCsrf, (req, res) => {
  const id = Number(req.params.id);
  const item = Number.isSafeInteger(id) && id > 0
    ? get('SELECT filename FROM media WHERE id = ?', [id])
    : null;
  if (!item) {
    res.status(404).json({ error: 'That media item could not be found.' });
    return;
  }
  const url = `/uploads/${item.filename}`;
  const siteImages = JSON.parse(get("SELECT value FROM settings WHERE key = 'siteImages'")?.value || '{}');
  if (get('SELECT id FROM posts WHERE featured_image = ? OR content LIKE ? LIMIT 1', [url, `%${url}%`])
    || get('SELECT id FROM staff WHERE image = ? LIMIT 1', [url])
    || Object.values(siteImages).includes(url)
    || ['faviconUrl', 'appleTouchIconUrl'].some((key) => get('SELECT value FROM settings WHERE key = ? AND value = ?', [key, url]))) {
    res.status(409).json({ error: 'This image is currently used on the website. Replace it in the relevant settings or content before deleting.' });
    return;
  }
  fs.unlinkSync(path.join(mediaPath, path.basename(item.filename)));
  run('DELETE FROM media WHERE id = ?', [id]);
  persistDatabase();
  res.status(204).end();
});

app.put('/api/admin/settings', requireAdminSession, requireCsrf, requireSuperAdmin, (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }
  for (const [key, value] of Object.entries(parsed.data)) {
    const storedValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
    run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, storedValue]);
  }
  persistDatabase();
  res.json({ settings: parsed.data });
});

app.get('/api/admin/users', requireAdminSession, requireSuperAdmin, (_req, res) => {
  res.json({ users: all('SELECT id, username, role, created_at AS createdAt FROM admins ORDER BY id ASC') });
});

app.post('/api/admin/users', requireAdminSession, requireCsrf, requireSuperAdmin, asyncHandler(async (req, res) => {
  const parsed = adminCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: validationMessage(parsed.error) });
    return;
  }
  if (get('SELECT id FROM admins WHERE username = ?', [parsed.data.username])) {
    res.status(409).json({ error: 'That username is already in use.' });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const result = run('INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)',
    [parsed.data.username, passwordHash, parsed.data.role]);
  persistDatabase();
  res.status(201).json({ user: get('SELECT id, username, role, created_at AS createdAt FROM admins WHERE id = ?', [result.lastInsertRowid]) });
}));

app.patch('/api/admin/users/:id', requireAdminSession, requireCsrf, requireSuperAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const parsed = adminUpdateSchema.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id < 1 || !parsed.success) {
    res.status(400).json({ error: parsed.success ? 'Choose a valid account.' : validationMessage(parsed.error) });
    return;
  }
  const target = get('SELECT id, role FROM admins WHERE id = ?', [id]);
  if (!target) {
    res.status(404).json({ error: 'That account could not be found.' });
    return;
  }
  if (id === req.admin.id && parsed.data.role === 'admin') {
    res.status(409).json({ error: 'You cannot remove super administrator access from your current account.' });
    return;
  }
  if (target.role === 'superadmin' && parsed.data.role === 'admin'
    && all("SELECT id FROM admins WHERE role = 'superadmin'").length < 2) {
    res.status(409).json({ error: 'At least one super administrator account must remain.' });
    return;
  }
  const fields = [];
  const values = [];
  if (parsed.data.password) {
    fields.push('password_hash = ?');
    values.push(await bcrypt.hash(parsed.data.password, 12));
  }
  if (parsed.data.role) {
    fields.push('role = ?');
    values.push(parsed.data.role);
  }
  if (!fields.length) {
    res.status(400).json({ error: 'Choose a new password or role.' });
    return;
  }
  values.push(id);
  run(`UPDATE admins SET ${fields.join(', ')} WHERE id = ?`, values);
  persistDatabase();
  res.json({ ok: true });
}));

app.delete('/api/admin/users/:id', requireAdminSession, requireCsrf, requireSuperAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    res.status(400).json({ error: 'Choose a valid account.' });
    return;
  }
  if (id === req.admin.id) {
    res.status(409).json({ error: 'You cannot delete the account you are currently signed in with.' });
    return;
  }
  const target = get('SELECT id, role FROM admins WHERE id = ?', [id]);
  if (!target) {
    res.status(404).json({ error: 'That account could not be found.' });
    return;
  }
  if (target.role === 'superadmin' && all("SELECT id FROM admins WHERE role = 'superadmin'").length < 2) {
    res.status(409).json({ error: 'At least one super administrator account must remain.' });
    return;
  }
  run('DELETE FROM admins WHERE id = ?', [id]);
  persistDatabase();
  res.status(204).end();
});

app.use(express.static(distPath, {
  index: false,
  maxAge: isProduction ? '1d' : 0,
}));
app.get('/{*path}', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'That endpoint could not be found.' });
    return;
  }
  res.sendFile(path.join(distPath, 'index.html'), (error) => {
    if (error) next(error);
  });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  if (res.headersSent) return;
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
    ? error.status
    : 500;
  const message = status === 400
    ? 'The request body must be valid JSON.'
    : status === 413
      ? 'The request is too large.'
      : 'Something went wrong. Please try again or contact the school office.';
  res.status(status).json({ error: message });
});

await openDatabase();
seedPosts();
persistDatabase();

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Golden Valley School listening on http://localhost:${port}`);
});

function shutdown() {
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

export { app };
