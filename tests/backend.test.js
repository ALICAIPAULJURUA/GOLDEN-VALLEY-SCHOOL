import assert from 'node:assert/strict';
import test from 'node:test';
import { schoolGreeting } from '../api.js';
import { cleanEditorHtml, toSlug } from '../server/content.js';
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

test('published rich text drops executable markup and unsafe link protocols', () => {
  const clean = cleanEditorHtml(
    '<p onclick="alert(1)">Welcome <strong>families</strong></p><script>alert(1)</script><a href="javascript:alert(2)">bad link</a>',
  );

  assert.match(clean, /<strong>families<\/strong>/);
  assert.doesNotMatch(clean, /onclick|<script|javascript:/i);
});

test('rich text retains safe media embeds, images, and tables while removing unsafe markup', () => {
  const clean = cleanEditorHtml(
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

test('site image settings accept uploaded media paths and reject external image URLs', () => {
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
    siteImages: { ...DEFAULT_SITE_IMAGES, heroClassroom: 'https://example.test/school.jpg' },
  }).success, false);
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
