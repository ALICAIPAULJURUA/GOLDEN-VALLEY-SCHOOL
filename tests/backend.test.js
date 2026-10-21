import assert from 'node:assert/strict';
import test from 'node:test';
import { apiRequest, mediaUrl, schoolGreeting } from '../api.js';
import mongoApi, { normalizeVercelRequest } from '../api/index.js';
import { cleanEditorHtml, toSlug } from '../server/content.js';
import { getMongoConfig, MongoConfigurationError } from '../server/mongodb.js';
import { hasValidCsrfToken } from '../server/session.js';
import {
  accountPasswordSchema,
  admissionSchema,
  articleCommentSchema,
  articleCommentStatusSchema,
  contactMessageSchema,
  contactReplySchema,
  postSchema,
  settingsSchema,
  staffSchema,
} from '../server/validation.js';
import { DEFAULT_SITE_COLORS, DEFAULT_SITE_IMAGES, fillWhatsAppTemplate } from '../site-theme.js';

test('admin greeting follows Uganda time across morning, afternoon, and evening', () => {
  assert.equal(schoolGreeting(new Date('2026-10-16T02:00:00.000Z')), 'Good morning');
  assert.equal(schoolGreeting(new Date('2026-10-16T08:59:00.000Z')), 'Good morning');
  assert.equal(schoolGreeting(new Date('2026-10-16T09:00:00.000Z')), 'Good afternoon');
  assert.equal(schoolGreeting(new Date('2026-10-16T13:59:00.000Z')), 'Good afternoon');
  assert.equal(schoolGreeting(new Date('2026-10-16T14:00:00.000Z')), 'Good evening');
  assert.equal(schoolGreeting(new Date('2026-10-16T01:59:00.000Z')), 'Good evening');
});

test('published rich text drops executable markup and unsafe link protocols', async () => {
  const clean = await cleanEditorHtml(
    '<p onclick="alert(1)">Welcome <strong>families</strong></p><script>alert(1)</script><a href="javascript:alert(2)">bad link</a>',
  );

  assert.match(clean, /<strong>families<\/strong>/);
  assert.doesNotMatch(clean, /onclick|<script|javascript:/i);
});

test('rich text retains safe media embeds, images, and tables while removing unsafe markup', async () => {
  const clean = await cleanEditorHtml(
    '<p>News</p><img src="/uploads/school.png" alt="School" onerror="alert(1)"><table><tr><td>Term</td></tr></table><iframe src="https://www.youtube.com/embed/example"></iframe><iframe src="https://attacker.example/video"></iframe>',
  );
  assert.match(clean, /<img src="\/uploads\/school\.png" alt="School"\s*\/?>/);
  assert.match(clean, /<table>/);
  assert.match(clean, /www\.youtube\.com\/embed\/example/);
  assert.doesNotMatch(clean, /onerror|attacker\.example/);
});

test('post validation accepts search fields and complete event details', () => {
  const result = postSchema.safeParse({
    type: 'event',
    title: 'Family Open Day',
    summary: 'Come and visit.',
    content: '<p>We look forward to seeing you.</p>',
    eventDate: '2026-11-01',
    eventEndDate: '2026-11-02',
    eventTime: '10:00 AM',
    eventLocation: 'School grounds',
    eventRegistrationUrl: 'https://example.test/register',
    metaTitle: 'Open Day',
    metaDescription: 'Meet our teachers and learn about the school.',
    featuredImage: '/uploads/open-day.png',
    published: true,
  });
  assert.equal(result.success, true);
  assert.equal(result.data.eventLocation, 'School grounds');
  assert.equal(result.data.metaTitle, 'Open Day');
});

test('event registration links reject unsafe protocols and end dates before starts', () => {
  const result = postSchema.safeParse({
    type: 'event',
    title: 'Open Day',
    summary: 'Meet the school team.',
    content: '<p>Visit.</p>',
    eventDate: '2026-11-02',
    eventEndDate: '2026-11-01',
    eventRegistrationUrl: 'javascript:alert(1)',
  });
  assert.equal(result.success, false);
  assert.ok(result.error.issues.some((issue) => issue.path[0] === 'eventEndDate'));
  assert.ok(result.error.issues.some((issue) => issue.path[0] === 'eventRegistrationUrl'));
});

test('post validation requires a valid date for events', () => {
  const result = postSchema.safeParse({
    type: 'event',
    title: 'Open Day',
    summary: 'Meet our school team.',
    content: '<p>Visit the school.</p>',
    published: true,
  });
  assert.equal(result.success, false);
  assert.equal(result.error.issues[0].path[0], 'eventDate');
});

test('news posts accept empty database event fields when edited', () => {
  const result = postSchema.safeParse({
    type: 'news',
    title: 'School update',
    summary: 'A short update.',
    content: '<p>School news.</p>',
    eventDate: null,
    eventTime: null,
    published: true,
  });

  assert.equal(result.success, true);
  assert.equal(result.data.eventDate, '');
  assert.equal(result.data.eventTime, '');
});

test('admission validation requires parent consent and contact details', () => {
  const result = admissionSchema.safeParse({
    studentName: 'Sam Learner',
    dateOfBirth: '2020-06-12',
    gender: 'female',
    classApplied: 'top',
    parentName: 'A Parent',
    relationship: 'guardian',
    phone: '0777 627 421',
    email: '',
    address: 'Ewuata, Arua',
    consent: false,
  });

  assert.equal(result.success, false);
  assert.ok(result.error.issues.some((issue) => issue.path[0] === 'consent'));
});

test('slugs are normalized and CSRF tokens are compared exactly', () => {
  assert.equal(toSlug('Primary 3 Study Tour!'), 'primary-3-study-tour');
  assert.equal(hasValidCsrfToken({ csrfToken: 'a'.repeat(64) }, 'a'.repeat(64)), true);
  assert.equal(hasValidCsrfToken({ csrfToken: 'a'.repeat(64) }, 'b'.repeat(64)), false);
  assert.equal(hasValidCsrfToken({}, 'a'.repeat(64)), false);
});

test('staff, account password, and school settings validation enforce safe values', () => {
  assert.equal(staffSchema.safeParse({
    name: 'A Teacher', role: 'Class teacher', leadership: true, displayOrder: 0, published: true,
  }).success, true);
  assert.equal(accountPasswordSchema.safeParse({
    currentPassword: 'old', newPassword: 'a-new-password-with-fourteen-characters',
  }).success, true);
  assert.equal(settingsSchema.safeParse({
    schoolName: 'Golden Valley', tagline: 'Growing together', phone: '0777 627 421',
    email: 'school@example.test', whatsappNumber: '256777627421', applicationsOpen: true,
  }).success, true);
  assert.equal(settingsSchema.safeParse({
    schoolName: 'Golden Valley', tagline: 'Growing together', phone: '0777 627 421',
    email: 'school@example.test', whatsappNumber: '+256777627421', applicationsOpen: true,
  }).success, false);
});

test('site settings validate saved color palettes and reusable WhatsApp templates', () => {
  const result = settingsSchema.safeParse({
    schoolName: 'Golden Valley', tagline: 'Growing together', phone: '0777 627 421',
    email: 'school@example.test', whatsappNumber: '256777627421', applicationsOpen: true,
    siteColors: { primary: '#07594f', secondary: '#ed7754', accent: '#13887e', surface: '#fff8e9' },
    savedColorPalettes: [{ name: 'Golden Valley default', colors: DEFAULT_SITE_COLORS }],
    whatsappWelcomeMessage: 'Hello school!',
    whatsappContactTemplate: 'Hello {{name}}: {{message}}',
  });
  assert.equal(result.success, true);
  assert.equal(result.data.siteColors.primary, DEFAULT_SITE_COLORS.primary);
  assert.equal(settingsSchema.safeParse({
    schoolName: 'Golden Valley', tagline: 'Growing together', phone: '0777 627 421',
    email: 'school@example.test', whatsappNumber: '256777627421', applicationsOpen: true,
    siteColors: { ...DEFAULT_SITE_COLORS, primary: 'red' },
  }).success, false);
  assert.equal(fillWhatsAppTemplate('Hello {{name}}: {{message}}', { name: 'Amina', message: 'Please call me.' }),
    'Hello Amina: Please call me.');
});

test('article comments require bounded text and moderator approval states', () => {
  assert.equal(articleCommentSchema.safeParse({
    name: 'Amina Okello',
    body: 'Congratulations to the school community!',
    website: '',
  }).success, true);
  assert.equal(articleCommentSchema.safeParse({
    name: ' ',
    body: 'A comment',
  }).success, false);
  assert.equal(articleCommentSchema.safeParse({
    name: 'Amina',
    body: 'x'.repeat(2001),
  }).success, false);
  assert.equal(articleCommentStatusSchema.safeParse({ status: 'approved' }).success, true);
  assert.equal(articleCommentStatusSchema.safeParse({ status: 'rejected' }).success, false);
});

test('site image settings accept local and GridFS uploads and reject external URLs', () => {
  const result = settingsSchema.safeParse({
    schoolName: 'Golden Valley', tagline: 'Growing together', phone: '0777 627 421',
    email: 'school@example.test', whatsappNumber: '256777627421', applicationsOpen: true,
    siteImages: { ...DEFAULT_SITE_IMAGES, heroClassroom: '/uploads/123e4567-e89b-12d3-a456-426614174000.webp' },
  });
  assert.equal(result.success, true);
  assert.equal(result.data.siteImages.heroPlayground, '');
  assert.equal(settingsSchema.safeParse({
    schoolName: 'Golden Valley', tagline: 'Growing together', phone: '0777 627 421',
    email: 'school@example.test', whatsappNumber: '256777627421', applicationsOpen: true,
    faviconUrl: '/uploads/507f1f77bcf86cd799439011',
  }).success, true);
  assert.equal(settingsSchema.safeParse({
    schoolName: 'Golden Valley', tagline: 'Growing together', phone: '0777 627 421',
    email: 'school@example.test', whatsappNumber: '256777627421', applicationsOpen: true,
    siteImages: { ...DEFAULT_SITE_IMAGES, heroClassroom: 'https://example.test/school.jpg' },
  }).success, false);
});

test('media URLs support local SQLite filenames and absolute media URLs', () => {
  assert.equal(mediaUrl({ filename: 'school-crest.png' }), '/uploads/school-crest.png');
  assert.equal(mediaUrl({ filename: 'https://example.test/image/crest.png' }),
    'https://example.test/image/crest.png');
  assert.equal(mediaUrl({ url: 'https://example.test/image/crest.png' }),
    'https://example.test/image/crest.png');
});

test('MongoDB configuration requires an explicit database and validates pool size', () => {
  assert.deepEqual(getMongoConfig({
    MONGODB_URI: 'mongodb://localhost:27017/from-uri',
    MONGODB_DB: 'golden_valley_school',
  }), {
    uri: 'mongodb://localhost:27017/from-uri',
    databaseName: 'golden_valley_school',
    maxPoolSize: 5,
  });
  assert.throws(() => getMongoConfig({
    MONGODB_URI: 'mongodb://localhost:27017/from-uri',
  }), (error) => error instanceof MongoConfigurationError && /MONGODB_DB/.test(error.message));
  assert.throws(() => getMongoConfig({
    MONGODB_URI: 'mongodb://localhost:27017/from-uri',
    MONGODB_DB: 'school',
    MONGODB_MAX_POOL_SIZE: '0',
  }), (error) => error instanceof MongoConfigurationError && /MONGODB_MAX_POOL_SIZE/.test(error.message));
});

test('API client turns non-JSON platform errors and network failures into useful messages', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('NOT_FOUND', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    });
    await assert.rejects(apiRequest('/api/health'), /school service endpoint is unavailable/i);

    globalThis.fetch = async () => { throw new TypeError('network details are not shown'); };
    await assert.rejects(apiRequest('/api/health'), /unable to reach the school service/i);

    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Check the Atlas network access settings.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
    await assert.rejects(apiRequest('/api/health'), /Atlas network access settings/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Vercel Mongo API reports missing configuration without exposing sensitive details', async () => {
  async function request(method, path) {
    const state = { statusCode: 200, body: null };
    const response = {
      setHeader() {},
      status(code) { state.statusCode = code; return this; },
      json(body) { state.body = body; return this; },
      end() { return this; },
      redirect(code, location) { state.statusCode = code; state.location = location; return this; },
    };
    await mongoApi({ method, url: path, headers: {} }, response);
    return state;
  }
  const required = [
    'MONGODB_URI', 'MONGODB_DB', 'MONGODB_MAX_POOL_SIZE', 'SESSION_SECRET',
  ];
  const previous = Object.fromEntries(required.map((key) => [key, process.env[key]]));
  required.forEach((key) => { delete process.env[key]; });
  let health;
  const results = [];
  try {
    health = await request('GET', '/api/health');
    for (const [method, path] of [
      ['GET', '/api/admin/session'],
      ['POST', '/api/admin/login'],
      ['POST', '/api/messages'],
      ['PATCH', '/api/admin/admissions/507f1f77bcf86cd799439011'],
    ]) {
      results.push(await request(method, path));
    }
  } finally {
    required.forEach((key) => {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    });
  }
  assert.equal(health.statusCode, 503);
  assert.equal(health.body.status, 'error');
  for (const result of results) {
    assert.equal(result.statusCode, 503);
    assert.match(result.body.error, /MONGODB_URI/i);
    assert.doesNotMatch(JSON.stringify(result.body), /mongodb\+srv|password|username/i);
  }
});

test('Vercel API rewrites restore Express paths and preserve endpoint query parameters', () => {
  const request = { url: '/api/index?_gv_route=posts&limit=10&type=news' };
  assert.equal(normalizeVercelRequest(request), request);
  assert.equal(request.url, '/api/posts?limit=10&type=news');

  const uploadRequest = { url: '/api/index?_gv_route=uploads%2F507f1f77bcf86cd799439011' };
  normalizeVercelRequest(uploadRequest);
  assert.equal(uploadRequest.url, '/api/uploads/507f1f77bcf86cd799439011');

  const directRequest = { url: '/api/admin/login' };
  normalizeVercelRequest(directRequest);
  assert.equal(directRequest.url, '/api/admin/login');
});

test('contact message and reply validation enforce safe sender details and message sizes', () => {
  assert.equal(contactMessageSchema.safeParse({
    name: 'Amina Okello',
    email: 'amina@example.test',
    subject: 'Admissions question',
    message: 'How can I apply?',
    website: '',
  }).success, true);
  assert.equal(contactMessageSchema.safeParse({
    name: 'Amina Okello',
    email: 'not-an-email',
    subject: 'Admissions question',
    message: 'How can I apply?',
  }).success, false);
  assert.equal(contactReplySchema.safeParse({ reply: 'Thank you for contacting the school.' }).success, true);
  assert.equal(contactReplySchema.safeParse({ reply: '  ' }).success, false);
  assert.equal(settingsSchema.safeParse({
    schoolName: 'Golden Valley', tagline: 'Growing together', phone: '0777 627 421',
    email: 'school@example.test', whatsappNumber: '256777627421', applicationsOpen: true,
    faviconUrl: 'javascript:alert(1)',
  }).success, false);
});
