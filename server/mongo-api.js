import 'dotenv/config';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import bcrypt from 'bcryptjs';
import cookieSession from 'cookie-session';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { ObjectId } from 'mongodb';
import multer from 'multer';
import nodemailer from 'nodemailer';
import { cleanEditorHtml, toSlug } from './content.js';
import { createCsrfToken, hasValidCsrfToken } from './session.js';
import { connectMongo, MongoConfigurationError } from './mongodb.js';
import {
  DEFAULT_COLOR_PALETTES,
  DEFAULT_SITE_COLORS,
  DEFAULT_SITE_IMAGES,
  DEFAULT_WHATSAPP_CONTACT_TEMPLATE,
  DEFAULT_WHATSAPP_WELCOME_MESSAGE,
} from '../site-theme.js';
import {
  accountPasswordSchema,
  admissionSchema,
  admissionStatusSchema,
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

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1, fields: 30 },
  fileFilter: (_req, file, callback) => {
    if (['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'].includes(file.mimetype)) callback(null, true);
    else callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE'));
  },
});
const imageExtensions = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
};
const limiter = (windowMs, limit, message) => rateLimit({
  windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: message },
});
const loginLimiter = limiter(15 * 60 * 1000, 10, 'Too many sign-in attempts. Please try again in 15 minutes.');
const admissionLimiter = limiter(60 * 60 * 1000, 5, 'Too many applications from this connection. Please contact the school office.');
const messageLimiter = limiter(15 * 60 * 1000, 5, 'Too many messages from this connection. Please try again later.');
const commentLimiter = limiter(15 * 60 * 1000, 5, 'Too many comments from this connection. Please try again later.');
const likeLimiter = limiter(15 * 60 * 1000, 60, 'Too many like changes. Please try again later.');
const now = () => new Date().toISOString();
const asId = (value) => ObjectId.isValid(String(value)) ? new ObjectId(String(value)) : null;
const asPublicPost = (post) => {
  const { _id, createdAt, updatedAt, ...fields } = post;
  return { id: String(_id), ...fields, createdAt, updatedAt };
};
const asMedia = (item) => ({
  id: String(item._id),
  filename: String(item.fileId),
  originalName: item.originalName,
  mimeType: item.mimeType,
  size: item.size,
  altText: item.altText || '',
  galleryVisible: Boolean(item.galleryVisible),
  createdAt: item.createdAt,
});
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

function logDiagnostic(context, error) {
  const details = {};
  if (typeof error?.name === 'string') details.name = error.name;
  if (typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)) details.code = error.code;
  else if (Number.isSafeInteger(error?.code)) details.code = error.code;
  if (typeof error?.codeName === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(error.codeName)) {
    details.codeName = error.codeName;
  }
  console.error(context, details);
}

function databaseErrorMessage(error) {
  if (error instanceof MongoConfigurationError) return error.message;
  if (error?.name === 'MongoParseError') return 'Database connection settings are invalid. Check MONGODB_URI and MONGODB_DB.';
  if (error?.code === 18 || error?.codeName === 'AuthenticationFailed') {
    return 'Database authentication failed. Check the Atlas database user credentials.';
  }
  if (error?.code === 13 || error?.codeName === 'Unauthorized') {
    return 'The Atlas database user lacks required database permissions.';
  }
  if (error?.name?.startsWith('Mongo')) {
    return 'The database is unreachable. Check Atlas Network Access, DNS, and the server connection settings.';
  }
  return 'The database is temporarily unavailable. Please try again later.';
}

function isMongoFailure(error) {
  return error instanceof MongoConfigurationError || error?.name?.startsWith('Mongo');
}

app.disable('x-powered-by');
if (isProduction) app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], baseUri: ["'self'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      formAction: ["'self'", 'https://wa.me'], objectSrc: ["'none'"],
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
app.use(express.json({ limit: '1mb' }));
app.use(cookieSession({
  name: 'gv_session',
  keys: [sessionSecret || 'development-only-session-secret-change-before-deploy'],
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  maxAge: 8 * 60 * 60 * 1000,
  path: '/',
}));
app.use('/api/admin', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

async function db(req) {
  if (!req.mongo) req.mongo = await connectMongo();
  return req.mongo.db;
}

async function requireAdmin(req, res, next) {
  const id = asId(req.session?.adminId);
  if (!id) {
    res.status(401).json({ error: 'Sign in to access the admin area.' });
    return;
  }
  try {
    const admin = await (await db(req)).collection('admins').findOne(
      { _id: id },
      { projection: { username: 1, role: 1 } },
    );
    if (!admin) {
      req.session = null;
      res.status(401).json({ error: 'Sign in to access the admin area.' });
      return;
    }
    req.admin = { id: String(admin._id), username: admin.username, role: admin.role };
    next();
  } catch (error) {
    next(error);
  }
}

function requireSuperAdmin(req, res, next) {
  if (req.admin?.role !== 'superadmin') {
    res.status(403).json({ error: 'Super administrator access is required for this action.' });
    return;
  }
  next();
}

function requireCsrf(req, res, next) {
  if (!hasValidCsrfToken(req.session, req.get('x-csrf-token'))) {
    res.status(403).json({ error: 'Your session expired. Refresh and try again.' });
    return;
  }
  next();
}

function parseUpload(fieldName) {
  return (req, res, next) => upload.single(fieldName)(req, res, (error) => {
    if (!error) return next();
    res.status(error instanceof multer.MulterError ? 400 : 415).json({
      error: error.code === 'LIMIT_FILE_SIZE'
        ? 'The selected file exceeds the 4 MB server upload limit.'
        : 'Choose a supported file type and try again.',
    });
  });
}

function validImageSignature(file) {
  const bytes = file.buffer;
  return (file.mimetype === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8)
    || (file.mimetype === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    || (file.mimetype === 'image/gif' && bytes.toString('ascii', 0, 3) === 'GIF')
    || (file.mimetype === 'image/webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP');
}

function validResultsSignature(file) {
  return file.mimetype === 'application/pdf'
    ? file.buffer.subarray(0, 5).toString('ascii') === '%PDF-'
    : validImageSignature(file);
}

async function storeFile(req, file, kind, metadata = {}) {
  const { bucket } = req.mongo;
  const extension = imageExtensions[file.mimetype] || (file.mimetype === 'application/pdf' ? '.pdf' : '.bin');
  const filename = `${crypto.randomUUID()}${extension}`;
  const stream = bucket.openUploadStream(filename, {
    contentType: file.mimetype,
    metadata: { kind, ...metadata },
  });
  await pipeline(Readable.from([file.buffer]), stream);
  return stream.id;
}

async function sendGridFile(req, res, id, { downloadName, mediaOnly = false } = {}) {
  const objectId = asId(id);
  if (!objectId) {
    res.status(404).json({ error: 'The requested file could not be found.' });
    return;
  }
  const { db: database, bucket } = req.mongo;
  const file = await database.collection('uploads.files').findOne({ _id: objectId });
  if (!file || (mediaOnly && file.metadata?.kind !== 'media')) {
    res.status(404).json({ error: 'The requested file could not be found.' });
    return;
  }
  res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', mediaOnly ? 'public, max-age=86400' : 'private, no-store');
  if (downloadName) {
    const safeName = String(downloadName).replace(/[\r\n"]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`);
  }
  const stream = bucket.openDownloadStream(objectId);
  stream.on('error', (error) => {
    if (!res.headersSent) res.status(404).json({ error: 'The requested file could not be found.' });
    else res.destroy(error);
  });
  stream.pipe(res);
}

async function getSettings(database) {
  const stored = Object.fromEntries((await database.collection('settings').find().toArray())
    .map(({ _id, value }) => [String(_id), value]));
  const value = (key, fallback) => stored[key] === undefined ? fallback : stored[key];
  return {
    schoolName: value('schoolName', 'Golden Valley School'),
    tagline: value('tagline', 'Kindergarten · Day Care · Primary'),
    phone: value('phone', '0777 627 421'),
    email: value('email', 'i.abiriga@muni.ac.ug'),
    whatsappNumber: value('whatsappNumber', '256777627421'),
    applicationsOpen: value('applicationsOpen', true) !== false && value('applicationsOpen', true) !== 'false',
    faviconUrl: value('faviconUrl', ''),
    appleTouchIconUrl: value('appleTouchIconUrl', ''),
    siteImages: value('siteImages', DEFAULT_SITE_IMAGES),
    siteColors: value('siteColors', DEFAULT_SITE_COLORS),
    savedColorPalettes: value('savedColorPalettes', DEFAULT_COLOR_PALETTES),
    whatsappWelcomeMessage: value('whatsappWelcomeMessage', DEFAULT_WHATSAPP_WELCOME_MESSAGE),
    whatsappContactTemplate: value('whatsappContactTemplate', DEFAULT_WHATSAPP_CONTACT_TEMPLATE),
  };
}

async function seedPosts(database) {
  const posts = database.collection('posts');
  if (await posts.estimatedDocumentCount()) return;
  const samples = [
    ['news', 'Term 1, 2027 registration is now open', 'Contact the school office to ask about places in Baby, Middle, Top, and Primary 1, or to arrange a visit.', '<p>We welcome enquiries for the new term. Call the school office or visit us in Ewuata to find out about available classes and arrange a visit.</p>'],
    ['news', 'Primary 3 study tour a big success', 'Learners explored local landmarks and brought their questions back to class.', '<p>Our learners explored local landmarks and returned with notebooks full of questions to continue investigating in class.</p>'],
    ['update', 'Welcome to the new term', 'Get in touch with the school office for term dates, reporting information, and uniform guidance.', '<p>We look forward to welcoming our learners and families back to school. Please contact the office for reporting dates, uniform guidance, and timetable information.</p>'],
    ['event', 'Open Day for New Families', 'Meet the teachers, explore the classrooms, and get to know the school community.', '<p>Visit Golden Valley, meet the teachers, explore our classrooms, and ask us about learning and admissions.</p>', '2026-11-07', '10:00 AM – 1:00 PM'],
    ['event', 'End-of-Year Prize Giving', 'Celebrate learners’ achievements with families and the school community.', '<p>Join learners, families, and staff as we celebrate the achievements and growth of every class.</p>', '2026-12-04', '2:00 PM'],
    ['news', 'Learning grows through stories, songs and play', 'A look at how joyful, hands-on classroom experiences help young learners build confidence and curiosity.', '<p>At Golden Valley, children learn by asking questions, trying new things, and sharing ideas with one another. Stories, songs, puzzles, drawing, and guided play give learners different ways to explore new concepts.</p><p>Our teachers encourage every child to take part at their own pace. A new word, a completed puzzle, or the courage to speak in front of a group can all be important steps in a learner’s growth.</p><p>Families can support this learning at home by talking about the day, reading together, and celebrating each child’s effort as well as their achievements.</p>', '', '', 'Learning through stories, songs and play', 'Discover how stories, music, and guided play support curiosity and confidence at Golden Valley School.'],
    ['news', 'Small steps help learners build big confidence', 'Encouragement, practice, and a caring routine help children feel ready to take on new challenges.', '<p>Confidence develops over time. In class, learners are encouraged to try, ask for help, and have another go when something feels difficult.</p><p>Simple routines help children know what to expect, while kind feedback helps them notice the progress they are making. Whether a learner is practising a new sound, solving a problem, or working with a classmate, each small step matters.</p><p>We value the partnership between families and teachers. Sharing what a child enjoys and what they are practising helps us give every learner thoughtful support.</p>', '', '', 'Helping learners build confidence', 'Learn how encouragement and supportive routines help children grow in confidence at school.'],
    ['update', 'A welcome note for Golden Valley families', 'A friendly reminder that families can contact the school office for visit, enrolment, and school information.', '<p>Welcome to Golden Valley School. We are glad to be part of each learner’s journey and appreciate the trust families place in our school community.</p><p>If you are planning a visit, enquiring about enrolment, or looking for general school information, please contact the office before travelling so our team can help you plan.</p><p>Families can use the contact form on this website or call the school using the number shown on the Contact page. We look forward to hearing from you.</p>', '', '', 'A welcome note for Golden Valley families', 'Contact the Golden Valley School office for visit arrangements, enrolment enquiries, and general information.'],
    ['update', 'Working together to support every learner', 'Regular communication between families and teachers helps children feel supported at school and at home.', '<p>Children do their best when the important adults in their lives work together. Families know their children well, and teachers see how they learn and connect with others in class.</p><p>Please share questions or updates with the school office so the right staff member can follow up. When contacting us, include your name and a suitable way to reach you, and avoid sending sensitive student documents through the public contact form.</p><p>Thank you for helping us create a caring, respectful learning community for every child.</p>', '', '', 'Working together to support every learner', 'Golden Valley values communication between families and teachers to support each learner’s wellbeing and progress.'],
  ];
  const createdAt = now();
  try {
    await posts.insertMany(samples.map(([type, title, summary, content, eventDate = '', eventTime = '', metaTitle = '', metaDescription = '']) => ({
      slug: toSlug(title), type, title, summary, content: cleanEditorHtml(content),
      eventDate: eventDate || '', eventEndDate: '', eventTime, eventLocation: '',
      eventRegistrationUrl: '', metaTitle, metaDescription, featuredImage: '',
      published: true, createdAt, updatedAt: createdAt,
    })));
  } catch (error) {
    if (error.code !== 11000 && !error.writeErrors?.every(({ code }) => code === 11000)) throw error;
  }
}

app.get('/api/health', asyncRoute(async (req, res) => {
  try {
    const database = await db(req);
    await database.command({ ping: 1 });
    res.json({ status: 'ok', backend: 'mongodb' });
  } catch (error) {
    logDiagnostic('MongoDB health check failed.', error);
    res.status(503).json({ status: 'error', backend: 'mongodb', error: databaseErrorMessage(error) });
  }
}));

app.get('/api/site-settings', asyncRoute(async (req, res) => {
  res.json(await getSettings(await db(req)));
}));

app.post('/api/messages', messageLimiter, asyncRoute(async (req, res) => {
  const parsed = contactMessageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: validationMessage(parsed.error) });
  if (parsed.data.website) return res.status(201).json({ received: true });
  const createdAt = now();
  const result = await (await db(req)).collection('contact_messages').insertOne({
    ...parsed.data, status: 'new', replyText: '', createdAt, repliedAt: null,
  });
  res.status(201).json({ received: true, reference: `GV-M${result.insertedId.toString().slice(-5).toUpperCase()}` });
}));

app.get('/api/staff', asyncRoute(async (req, res) => {
  const database = await db(req);
  const settings = database.collection('settings');
  if (!await settings.findOne({ _id: 'staffSeeded' })) {
    const staffCollection = database.collection('staff');
    if (!await staffCollection.estimatedDocumentCount()) {
      const createdAt = now();
      await staffCollection.insertMany([
        { name: 'Mr. Abiriga Bosco', role: 'Founder & Director', leadership: true, displayOrder: 1, bio: '', image: '', published: true, createdAt },
        { name: 'Mr. Dramaza George', role: 'Head Teacher', leadership: true, displayOrder: 2, bio: '', image: '', published: true, createdAt },
        { name: 'Our Nursery Team', role: 'Early Years Educators', leadership: false, displayOrder: 3, bio: '', image: '', published: true, createdAt },
      ]);
    }
    await settings.updateOne({ _id: 'staffSeeded' }, { $set: { value: true } }, { upsert: true });
  }
  const staff = await database.collection('staff')
    .find({ published: true }).sort({ leadership: -1, displayOrder: 1, _id: 1 }).toArray();
  res.json({ staff: staff.map(({ _id, ...person }) => ({ id: String(_id), ...person })) });
}));

app.get('/api/gallery', asyncRoute(async (req, res) => {
  const media = await (await db(req)).collection('media')
    .find({ galleryVisible: true }).sort({ createdAt: -1 }).toArray();
  res.json({ media: media.map(asMedia) });
}));

app.get('/api/uploads/:fileId', asyncRoute(async (req, res) => {
  await db(req);
  await sendGridFile(req, res, req.params.fileId, { mediaOnly: true });
}));

app.use('/api/admin', (req, res, next) => {
  if (req.path === '/login') return next();
  return requireAdmin(req, res, next);
});

app.get('/api/admin/session', (req, res) => {
  req.session.csrfToken ||= createCsrfToken();
  res.json({ admin: req.admin, csrfToken: req.session.csrfToken });
});

app.post('/api/admin/login', loginLimiter, asyncRoute(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter your username and password.' });
  const admin = await (await db(req)).collection('admins').findOne({ username: parsed.data.username });
  if (!admin || !await bcrypt.compare(parsed.data.password, admin.passwordHash)) {
    return res.status(401).json({ error: 'The username or password is incorrect.' });
  }
  req.session = { adminId: String(admin._id), csrfToken: createCsrfToken() };
  res.json({ admin: { id: String(admin._id), username: admin.username, role: admin.role }, csrfToken: req.session.csrfToken });
}));

app.post('/api/admin/logout', requireCsrf, (_req, res) => {
  _req.session = null;
  res.clearCookie('gv_session', { path: '/' });
  res.status(204).end();
});

app.patch('/api/admin/account/password', requireCsrf, asyncRoute(async (req, res) => {
  const parsed = accountPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: validationMessage(parsed.error) });
  const database = await db(req);
  const admin = await database.collection('admins').findOne({ _id: asId(req.admin.id) });
  if (!await bcrypt.compare(parsed.data.currentPassword, admin.passwordHash)) {
    return res.status(403).json({ error: 'Your current password is incorrect.' });
  }
  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return res.status(400).json({ error: 'Choose a new password that differs from the current one.' });
  }
  await database.collection('admins').updateOne({ _id: admin._id }, { $set: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 12) } });
  res.json({ ok: true });
}));

app.get('/api/admin/messages', asyncRoute(async (req, res) => {
  const messages = await (await db(req)).collection('contact_messages')
    .find().sort({ createdAt: -1, _id: -1 }).toArray();
  const order = { new: 0, read: 1, replied: 2 };
  messages.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
  res.json({ messages: messages.map(({ _id, ...message }) => ({ id: String(_id), ...message })) });
}));

app.patch('/api/admin/messages/:id/read', requireCsrf, asyncRoute(async (req, res) => {
  const id = asId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Choose a valid message.' });
  const result = await (await db(req)).collection('contact_messages').updateOne({ _id: id, status: 'new' }, { $set: { status: 'read' } });
  if (!result.matchedCount) {
    if (!await (await db(req)).collection('contact_messages').findOne({ _id: id }, { projection: { _id: 1 } })) {
      return res.status(404).json({ error: 'That message could not be found.' });
    }
  }
  res.json({ ok: true });
}));

app.post('/api/admin/messages/:id/reply', requireCsrf, asyncRoute(async (req, res) => {
  const id = asId(req.params.id);
  const parsed = contactReplySchema.safeParse(req.body);
  if (!id || !parsed.success) return res.status(400).json({ error: parsed.success ? 'Choose a valid message.' : validationMessage(parsed.error) });
  const database = await db(req);
  const message = await database.collection('contact_messages').findOne({ _id: id });
  if (!message) return res.status(404).json({ error: 'That message could not be found.' });
  const { SMTP_HOST: host, SMTP_FROM: from, SMTP_USER: smtpUser, SMTP_PASS: smtpPass } = process.env;
  const port = Number(process.env.SMTP_PORT || 587);
  if (!host || !from || !smtpUser || !smtpPass || !Number.isInteger(port) || port < 1 || port > 65535) {
    return res.status(503).json({ error: 'Email replies are not configured yet. Set SMTP_HOST, SMTP_FROM, SMTP_PORT, SMTP_USER, and SMTP_PASS in the server environment.' });
  }
  const transporter = nodemailer.createTransport({
    host, port, secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: { user: smtpUser, pass: smtpPass },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
  });
  const replyText = `${parsed.data.reply}\n\nWarm regards,\n${(await getSettings(database)).schoolName}`;
  try {
    await transporter.sendMail({
      from, to: message.email, replyTo: from,
      subject: `Re: ${message.subject.replace(/[\r\n]+/g, ' ').trim()}`,
      text: replyText,
    });
  } catch (error) {
    logDiagnostic('Unable to send contact-message reply through SMTP.', error);
    return res.status(502).json({ error: 'The reply could not be delivered. Check the SMTP configuration and try again.' });
  }
  const repliedAt = now();
  await database.collection('contact_messages').updateOne({ _id: id }, { $set: { status: 'replied', replyText, repliedAt } });
  res.json({ ok: true, repliedAt });
}));

app.delete('/api/admin/messages/:id', requireCsrf, asyncRoute(async (req, res) => {
  const id = asId(req.params.id);
  if (!id || !(await (await db(req)).collection('contact_messages').deleteOne({ _id: id })).deletedCount) {
    return res.status(404).json({ error: 'That message could not be found.' });
  }
  res.status(204).end();
}));

app.get('/api/posts', asyncRoute(async (req, res) => {
  const { type } = req.query;
  if (type && !['news', 'update', 'event'].includes(type)) return res.status(400).json({ error: 'Choose a valid post category.' });
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const database = await db(req);
  await seedPosts(database);
  let posts = await database.collection('posts').find({ published: true, ...(type ? { type } : {}) }).toArray();
  if (type === 'event') {
    const today = now().slice(0, 10);
    posts.sort((a, b) => {
      const aPast = a.eventDate && a.eventDate < today;
      const bPast = b.eventDate && b.eventDate < today;
      return Number(aPast) - Number(bPast) || String(a.eventDate || '').localeCompare(String(b.eventDate || ''))
        || String(b.createdAt).localeCompare(String(a.createdAt));
    });
  } else posts.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))
    || String(b._id).localeCompare(String(a._id)));
  res.json({ posts: posts.slice(0, limit).map(asPublicPost) });
}));

app.get('/api/posts/:slug', asyncRoute(async (req, res) => {
  const database = await db(req);
  const post = await database.collection('posts').findOne({ slug: req.params.slug, published: true });
  if (!post) return res.status(404).json({ error: 'That article could not be found.' });
  req.session.visitorId ||= crypto.randomUUID();
  const [likes, liked, comments] = await Promise.all([
    database.collection('post_likes').countDocuments({ postId: post._id }),
    database.collection('post_likes').findOne({ postId: post._id, visitorId: req.session.visitorId }),
    database.collection('post_comments').find({ postId: post._id, status: 'approved' }).sort({ createdAt: 1, _id: 1 }).toArray(),
  ]);
  res.json({
    post: asPublicPost(post), likes, liked: Boolean(liked),
    comments: comments.map(({ _id, name, body, createdAt }) => ({ id: String(_id), name, body, createdAt })),
  });
}));

app.post('/api/posts/:slug/likes', likeLimiter, asyncRoute(async (req, res) => {
  const database = await db(req);
  const post = await database.collection('posts').findOne({ slug: req.params.slug, published: true }, { projection: { _id: 1 } });
  if (!post) return res.status(404).json({ error: 'That article could not be found.' });
  req.session.visitorId ||= crypto.randomUUID();
  const likes = database.collection('post_likes');
  const existing = await likes.findOne({ postId: post._id, visitorId: req.session.visitorId });
  if (existing) await likes.deleteOne({ _id: existing._id });
  else await likes.insertOne({ postId: post._id, visitorId: req.session.visitorId, createdAt: now() });
  res.json({ liked: !existing, likes: await likes.countDocuments({ postId: post._id }) });
}));

app.post('/api/posts/:slug/comments', commentLimiter, asyncRoute(async (req, res) => {
  const parsed = articleCommentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: validationMessage(parsed.error) });
  if (parsed.data.website) return res.status(201).json({ pending: true });
  const database = await db(req);
  const post = await database.collection('posts').findOne({ slug: req.params.slug, published: true }, { projection: { _id: 1 } });
  if (!post) return res.status(404).json({ error: 'That article could not be found.' });
  await database.collection('post_comments').insertOne({
    postId: post._id, name: parsed.data.name, body: parsed.data.body, status: 'pending', createdAt: now(),
  });
  res.status(201).json({ pending: true });
}));

app.post('/api/admissions', admissionLimiter, parseUpload('previousSchoolResults'), asyncRoute(async (req, res) => {
  const body = req.body || {};
  const parsed = admissionSchema.safeParse(body);
  if (!parsed.success) return res.status(400).json({ error: validationMessage(parsed.error) });
  if (typeof body.website === 'string' && body.website.trim()) return res.status(201).json({ application: { received: true } });
  if (req.file && (!['application/pdf', 'image/jpeg', 'image/png'].includes(req.file.mimetype) || !validResultsSignature(req.file))) {
    return res.status(415).json({ error: 'The results file does not appear to be a valid PDF, JPEG, or PNG.' });
  }
  const database = await db(req);
  const settings = await database.collection('settings').findOne({ _id: 'applicationsOpen' });
  if (settings?.value === false || settings?.value === 'false') {
    return res.status(403).json({ error: 'Online applications are currently closed. Please contact the school office.' });
  }
  const application = parsed.data;
  const reference = `GV-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const resultsFileId = req.file ? await storeFile(req, req.file, 'admission-result') : null;
  await database.collection('admissions').insertOne({
    reference, studentName: application.studentName, dateOfBirth: application.dateOfBirth,
    gender: application.gender, classApplied: application.classApplied, parentName: application.parentName,
    relationship: application.relationship, phone: application.phone, email: application.email,
    address: application.address, previousSchool: application.previousSchool,
    previousResultsFileId: resultsFileId, previousResultsName: req.file ? req.file.originalname.split(/[\\/]/).pop().slice(0, 200) : '',
    additionalInformation: application.additionalInformation, status: 'new', createdAt: now(),
  });
  res.status(201).json({ application: { reference } });
}));

app.get('/api/admin/admissions', asyncRoute(async (req, res) => {
  const admissions = await (await db(req)).collection('admissions').find()
    .sort({ createdAt: -1 }).limit(500).toArray();
  res.json({ admissions: admissions.map((item) => ({
    id: String(item._id), reference: item.reference, studentName: item.studentName,
    dateOfBirth: item.dateOfBirth, gender: item.gender, classApplied: item.classApplied,
    parentName: item.parentName, relationship: item.relationship, phone: item.phone,
    email: item.email, address: item.address, previousSchool: item.previousSchool,
    hasPreviousResults: Boolean(item.previousResultsFileId),
    previousResultsName: item.previousResultsName,
    additionalInformation: item.additionalInformation, status: item.status, createdAt: item.createdAt,
  })) });
}));

app.get('/api/admin/admissions/:id/results', asyncRoute(async (req, res) => {
  const id = asId(req.params.id);
  const application = id ? await (await db(req)).collection('admissions').findOne({ _id: id }) : null;
  if (!application?.previousResultsFileId) return res.status(404).json({ error: 'No previous-school results file is attached to this application.' });
  await sendGridFile(req, res, application.previousResultsFileId, { downloadName: application.previousResultsName || 'school-results' });
}));

app.patch('/api/admin/admissions/:id', requireCsrf, asyncRoute(async (req, res) => {
  const id = asId(req.params.id);
  const parsed = admissionStatusSchema.safeParse(req.body);
  if (!id) return res.status(400).json({ error: 'Choose a valid application.' });
  if (!parsed.success) return res.status(400).json({ error: validationMessage(parsed.error) });
  const result = await (await db(req)).collection('admissions').updateOne({ _id: id }, { $set: { status: parsed.data.status } });
  if (!result.matchedCount) return res.status(404).json({ error: 'That application could not be found.' });
  res.json({ ok: true });
}));

app.get('/api/admin/posts', asyncRoute(async (req, res) => {
  const posts = await (await db(req)).collection('posts').find().sort({ updatedAt: -1, _id: -1 }).toArray();
  res.json({ posts: posts.map(asPublicPost) });
}));

app.get('/api/admin/comments', asyncRoute(async (req, res) => {
  const database = await db(req);
  const comments = await database.collection('post_comments').find().sort({ createdAt: -1 }).toArray();
  const postIds = [...new Set(comments.map((comment) => String(comment.postId)))].map(asId).filter(Boolean);
  const posts = await database.collection('posts').find({ _id: { $in: postIds } }, { projection: { title: 1, slug: 1 } }).toArray();
  const byId = new Map(posts.map((post) => [String(post._id), post]));
  comments.sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1)
    || String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ comments: comments.map((comment) => ({
    id: String(comment._id), postId: String(comment.postId),
    postTitle: byId.get(String(comment.postId))?.title || '',
    postSlug: byId.get(String(comment.postId))?.slug || '',
    name: comment.name, body: comment.body, status: comment.status, createdAt: comment.createdAt,
  })) });
}));

app.patch('/api/admin/comments/:id', requireCsrf, asyncRoute(async (req, res) => {
  const id = asId(req.params.id);
  const parsed = articleCommentStatusSchema.safeParse(req.body);
  if (!id || !parsed.success) return res.status(400).json({ error: parsed.success ? 'Choose a valid comment.' : validationMessage(parsed.error) });
  const result = await (await db(req)).collection('post_comments').updateOne({ _id: id }, { $set: { status: parsed.data.status } });
  if (!result.matchedCount) return res.status(404).json({ error: 'That comment could not be found.' });
  res.json({ ok: true, status: parsed.data.status });
}));

app.delete('/api/admin/comments/:id', requireCsrf, asyncRoute(async (req, res) => {
  const id = asId(req.params.id);
  if (!id || !(await (await db(req)).collection('post_comments').deleteOne({ _id: id })).deletedCount) {
    return res.status(404).json({ error: 'That comment could not be found.' });
  }
  res.status(204).end();
}));

app.post('/api/admin/posts', requireCsrf, asyncRoute(async (req, res) => {
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: validationMessage(parsed.error) });
  const post = { ...parsed.data, content: cleanEditorHtml(parsed.data.content) };
  if (!post.content) return res.status(400).json({ error: 'Add some article content before saving.' });
  const database = await db(req);
  const baseSlug = toSlug(post.title) || `post-${Date.now()}`;
  let slug = baseSlug;
  for (let suffix = 2; await database.collection('posts').findOne({ slug }); suffix += 1) slug = `${baseSlug}-${suffix}`;
  const createdAt = now();
  const result = await database.collection('posts').insertOne({
    ...post, slug, eventDate: post.eventDate || '', eventEndDate: post.eventEndDate || '',
    published: Boolean(post.published), createdAt, updatedAt: createdAt,
  });
  res.status(201).json({ post: asPublicPost(await database.collection('posts').findOne({ _id: result.insertedId })) });
}));

app.put('/api/admin/posts/:id', requireCsrf, asyncRoute(async (req, res) => {
  const id = asId(req.params.id);
  const parsed = postSchema.safeParse(req.body);
  if (!id) return res.status(400).json({ error: 'Choose a valid post.' });
  if (!parsed.success) return res.status(400).json({ error: validationMessage(parsed.error) });
  const post = { ...parsed.data, content: cleanEditorHtml(parsed.data.content) };
  if (!post.content) return res.status(400).json({ error: 'Add some article content before saving.' });
  const database = await db(req);
  if (!await database.collection('posts').findOne({ _id: id }, { projection: { _id: 1 } })) {
    return res.status(404).json({ error: 'That post could not be found.' });
  }
  const baseSlug = toSlug(post.title) || `post-${id}`;
  let slug = baseSlug;
  for (let suffix = 2; await database.collection('posts').findOne({ slug, _id: { $ne: id } }); suffix += 1) slug = `${baseSlug}-${suffix}`;
  await database.collection('posts').updateOne({ _id: id }, {
    $set: { ...post, slug, eventDate: post.eventDate || '', eventEndDate: post.eventEndDate || '', updatedAt: now() },
  });
  res.json({ post: asPublicPost(await database.collection('posts').findOne({ _id: id })) });
}));

app.delete('/api/admin/posts/:id', requireCsrf, asyncRoute(async (req, res) => {
  const id = asId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Choose a valid post.' });
  if (!(await (await db(req)).collection('posts').deleteOne({ _id: id })).deletedCount) {
    return res.status(404).json({ error: 'That post could not be found.' });
  }
  res.status(204).end();
}));

app.get('/api/admin/staff', asyncRoute(async (req, res) => {
  const staff = await (await db(req)).collection('staff').find()
    .sort({ leadership: -1, displayOrder: 1, _id: 1 }).toArray();
  res.json({ staff: staff.map(({ _id, ...person }) => ({ id: String(_id), ...person })) });
}));

app.post('/api/admin/staff', requireCsrf, asyncRoute(async (req, res) => {
  const parsed = staffSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: validationMessage(parsed.error) });
  const person = { ...parsed.data, createdAt: now() };
  const database = await db(req);
  const result = await database.collection('staff').insertOne(person);
  res.status(201).json({ staff: { id: String(result.insertedId), ...person } });
}));

app.put('/api/admin/staff/:id', requireCsrf, asyncRoute(async (req, res) => {
  const id = asId(req.params.id);
  const parsed = staffSchema.safeParse(req.body);
  if (!id || !parsed.success) return res.status(400).json({ error: parsed.success ? 'Choose a valid staff member.' : validationMessage(parsed.error) });
  const database = await db(req);
  const result = await database.collection('staff').updateOne({ _id: id }, { $set: parsed.data });
  if (!result.matchedCount) return res.status(404).json({ error: 'That staff profile could not be found.' });
  res.json({ staff: { id: String(id), ...parsed.data } });
}));

app.delete('/api/admin/staff/:id', requireCsrf, asyncRoute(async (req, res) => {
  const id = asId(req.params.id);
  if (!id || !(await (await db(req)).collection('staff').deleteOne({ _id: id })).deletedCount) {
    return res.status(404).json({ error: 'That staff profile could not be found.' });
  }
  res.status(204).end();
}));

app.get('/api/admin/media', asyncRoute(async (req, res) => {
  const media = await (await db(req)).collection('media').find().sort({ createdAt: -1 }).toArray();
  res.json({ media: media.map(asMedia) });
}));

app.post('/api/admin/media', requireCsrf, parseUpload('file'), asyncRoute(async (req, res) => {
  if (!req.file || !imageExtensions[req.file.mimetype]) return res.status(400).json({ error: 'Choose a JPG, PNG, GIF, or WebP image to upload.' });
  if (!validImageSignature(req.file)) return res.status(415).json({ error: 'The uploaded file is not a valid image.' });
  const database = await db(req);
  const fileId = await storeFile(req, req.file, 'media');
  const item = {
    fileId, originalName: req.file.originalname.split(/[\\/]/).pop().slice(0, 200),
    mimeType: req.file.mimetype, size: req.file.size, altText: String(req.body.altText || '').slice(0, 300),
    galleryVisible: req.body.galleryVisible === 'true', createdAt: now(),
  };
  const result = await database.collection('media').insertOne(item);
  res.status(201).json({ media: asMedia({ _id: result.insertedId, ...item }) });
}));

app.patch('/api/admin/media/:id', requireCsrf, asyncRoute(async (req, res) => {
  const id = asId(req.params.id);
  const parsed = mediaUpdateSchema.safeParse(req.body);
  if (!id || !parsed.success) return res.status(400).json({ error: parsed.success ? 'Choose a valid media item.' : validationMessage(parsed.error) });
  const result = await (await db(req)).collection('media').updateOne({ _id: id }, { $set: {
    altText: parsed.data.altText, galleryVisible: parsed.data.galleryVisible,
  } });
  if (!result.matchedCount) return res.status(404).json({ error: 'That media item could not be found.' });
  res.json({ ok: true });
}));

app.delete('/api/admin/media/:id', requireCsrf, asyncRoute(async (req, res) => {
  const id = asId(req.params.id);
  const database = await db(req);
  const media = id ? await database.collection('media').findOne({ _id: id }) : null;
  if (!media) return res.status(404).json({ error: 'That media item could not be found.' });
  const url = `/uploads/${media.fileId}`;
  const [usedPost, usedStaff, settings] = await Promise.all([
    database.collection('posts').findOne({ $or: [{ featuredImage: url }, { content: { $regex: url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') } }] }, { projection: { _id: 1 } }),
    database.collection('staff').findOne({ image: url }, { projection: { _id: 1 } }),
    database.collection('settings').find({ _id: { $in: ['siteImages', 'faviconUrl', 'appleTouchIconUrl'] } }).toArray(),
  ]);
  const siteImages = settings.find((setting) => setting._id === 'siteImages')?.value || {};
  if (usedPost || usedStaff || Object.values(siteImages).includes(url)
    || settings.some((setting) => ['faviconUrl', 'appleTouchIconUrl'].includes(setting._id) && setting.value === url)) {
    return res.status(409).json({ error: 'This image is currently used on the website. Replace it in the relevant settings or content before deleting.' });
  }
  await Promise.all([
    database.collection('media').deleteOne({ _id: id }),
    req.mongo.bucket.delete(media.fileId),
  ]);
  res.status(204).end();
}));

app.put('/api/admin/settings', requireCsrf, requireSuperAdmin, asyncRoute(async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: validationMessage(parsed.error) });
  const database = await db(req);
  await database.collection('settings').bulkWrite(Object.entries(parsed.data).map(([key, value]) => ({
    updateOne: { filter: { _id: key }, update: { $set: { value } }, upsert: true },
  })));
  res.json({ settings: parsed.data });
}));

app.get('/api/admin/users', requireSuperAdmin, asyncRoute(async (req, res) => {
  const users = await (await db(req)).collection('admins')
    .find({}, { projection: { username: 1, role: 1, createdAt: 1 } }).sort({ createdAt: 1 }).toArray();
  res.json({ users: users.map(({ _id, username, role, createdAt }) => ({ id: String(_id), username, role, createdAt })) });
}));

app.post('/api/admin/users', requireCsrf, requireSuperAdmin, asyncRoute(async (req, res) => {
  const parsed = adminCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: validationMessage(parsed.error) });
  const database = await db(req);
  if (await database.collection('admins').findOne({ username: parsed.data.username }, { projection: { _id: 1 } })) {
    return res.status(409).json({ error: 'That username is already in use.' });
  }
  const user = { username: parsed.data.username, passwordHash: await bcrypt.hash(parsed.data.password, 12), role: parsed.data.role, createdAt: now() };
  try {
    const result = await database.collection('admins').insertOne(user);
    res.status(201).json({ user: { id: String(result.insertedId), username: user.username, role: user.role, createdAt: user.createdAt } });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'That username is already in use.' });
    throw error;
  }
}));

app.patch('/api/admin/users/:id', requireCsrf, requireSuperAdmin, asyncRoute(async (req, res) => {
  const id = asId(req.params.id);
  const parsed = adminUpdateSchema.safeParse(req.body);
  if (!id || !parsed.success) return res.status(400).json({ error: parsed.success ? 'Choose a valid account.' : validationMessage(parsed.error) });
  const database = await db(req);
  const admins = database.collection('admins');
  const target = await admins.findOne({ _id: id }, { projection: { role: 1 } });
  if (!target) return res.status(404).json({ error: 'That account could not be found.' });
  if (String(id) === req.admin.id && parsed.data.role === 'admin') {
    return res.status(409).json({ error: 'You cannot remove super administrator access from your current account.' });
  }
  if (target.role === 'superadmin' && parsed.data.role === 'admin'
    && await admins.countDocuments({ role: 'superadmin' }) < 2) {
    return res.status(409).json({ error: 'At least one super administrator account must remain.' });
  }
  const changes = {};
  if (parsed.data.password) changes.passwordHash = await bcrypt.hash(parsed.data.password, 12);
  if (parsed.data.role) changes.role = parsed.data.role;
  if (!Object.keys(changes).length) return res.status(400).json({ error: 'Choose a new password or role.' });
  await admins.updateOne({ _id: id }, { $set: changes });
  res.json({ ok: true });
}));

app.delete('/api/admin/users/:id', requireCsrf, requireSuperAdmin, asyncRoute(async (req, res) => {
  const id = asId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Choose a valid account.' });
  if (String(id) === req.admin.id) return res.status(409).json({ error: 'You cannot delete the account you are currently signed in with.' });
  const database = await db(req);
  const admins = database.collection('admins');
  const target = await admins.findOne({ _id: id }, { projection: { role: 1 } });
  if (!target) return res.status(404).json({ error: 'That account could not be found.' });
  if (target.role === 'superadmin' && await admins.countDocuments({ role: 'superadmin' }) < 2) {
    return res.status(409).json({ error: 'At least one super administrator account must remain.' });
  }
  await admins.deleteOne({ _id: id });
  res.status(204).end();
}));

app.use((_req, res) => res.status(404).json({ error: 'That endpoint could not be found.' }));
app.use((error, _req, res, _next) => {
  logDiagnostic('MongoDB API request failed.', error);
  if (res.headersSent) return;
  if (isMongoFailure(error)) {
    res.status(503).json({ error: databaseErrorMessage(error) });
    return;
  }
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
  const message = status === 413 ? 'The request is too large.'
    : status === 500 ? 'Something went wrong. Please try again or contact the school office.'
      : error.message || 'The request could not be completed.';
  res.status(status).json({ error: message });
});

export async function mongoApiHandler(req, res) {
  if (isProduction && (!sessionSecret || sessionSecret.length < 32)) {
    res.status(503).json({ error: 'Set SESSION_SECRET to a random value with at least 32 characters.' });
    return;
  }
  try {
    const mongo = await connectMongo();
    req.mongo = mongo;
  } catch (error) {
    logDiagnostic('MongoDB connection failed.', error);
    const message = databaseErrorMessage(error);
    res.status(503).json(req.url?.startsWith('/api/health')
      ? { status: 'error', backend: 'mongodb', error: message }
      : { error: message });
    return;
  }
  app(req, res);
}

export { app as mongoApiApp };
