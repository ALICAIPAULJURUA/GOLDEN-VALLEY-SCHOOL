import { z } from 'zod';
import {
  DEFAULT_COLOR_PALETTES,
  DEFAULT_SITE_COLORS,
  DEFAULT_SITE_IMAGES,
  DEFAULT_WHATSAPP_CONTACT_TEMPLATE,
  DEFAULT_WHATSAPP_WELCOME_MESSAGE,
} from '../site-theme.js';

const cleanText = (max) => z.string().trim().min(1).max(max);

export const loginSchema = z.object({
  username: cleanText(80),
  password: z.string().min(1).max(200),
});

export const admissionSchema = z.object({
  studentName: cleanText(120),
  dateOfBirth: z.iso.date(),
  gender: z.enum(['female', 'male', 'prefer_not_to_say']),
  classApplied: z.enum(['baby', 'middle', 'top', 'primary_1', 'primary_2', 'primary_3', 'primary_4', 'primary_5', 'primary_6', 'primary_7']),
  parentName: cleanText(120),
  relationship: z.enum(['mother', 'father', 'guardian', 'other']),
  phone: z.string().trim().regex(/^[+()\d\s-]{7,25}$/),
  email: z.union([z.literal(''), z.email().max(254)]).optional().default(''),
  address: cleanText(300),
  previousSchool: z.string().trim().max(150).optional().default(''),
  additionalInformation: z.string().trim().max(1500).optional().default(''),
  consent: z.union([z.literal(true), z.literal('true')]).transform(() => true),
});

export const contactMessageSchema = z.object({
  name: cleanText(120),
  email: z.email().max(254),
  subject: cleanText(160),
  message: cleanText(5000),
  website: z.string().max(200).optional().default(''),
});

export const contactReplySchema = z.object({
  reply: cleanText(5000),
});

export const articleCommentSchema = z.object({
  name: cleanText(80),
  body: cleanText(2000),
  website: z.string().max(200).optional().default(''),
});

export const articleCommentStatusSchema = z.object({
  status: z.enum(['pending', 'approved']),
});

const optionalText = (max) => z.string().trim().max(max).optional().default('');
const optionalMediaPath = z.union([
  z.literal(''),
  z.string().regex(/^\/uploads\/(?:[a-f\d]{24}|[a-z\d-]+\.(?:jpg|jpeg|png|gif|webp))$/i),
]).optional().default('');
const optionalUrl = z.union([
  z.literal(''),
  z.url().max(2048).refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Use a valid HTTP or HTTPS link.'),
]).optional().default('');

const siteImagesSchema = z.object({
  heroClassroom: optionalMediaPath,
  heroPlayground: optionalMediaPath,
  heroStudentsGroup: optionalMediaPath,
  aboutSchool: optionalMediaPath,
  logoCrest: optionalMediaPath,
  logoFullWhite: optionalMediaPath,
}).default(DEFAULT_SITE_IMAGES);

export const postSchema = z.object({
  type: z.enum(['news', 'update', 'event']),
  title: cleanText(160),
  summary: cleanText(500),
  content: z.string().min(1).max(200000),
  eventDate: z.union([z.literal(''), z.iso.date()]).nullish().transform((value) => value ?? ''),
  eventEndDate: z.union([z.literal(''), z.iso.date()]).nullish().transform((value) => value ?? ''),
  eventTime: z.string().trim().max(80).nullish().transform((value) => value ?? ''),
  eventLocation: optionalText(200),
  eventRegistrationUrl: optionalUrl,
  metaTitle: optionalText(70),
  metaDescription: optionalText(180),
  featuredImage: optionalText(500),
  published: z.boolean().default(false),
}).superRefine((post, context) => {
  if (post.type === 'event' && !post.eventDate) {
    context.addIssue({
      code: 'custom',
      path: ['eventDate'],
      message: 'Choose a date for this event.',
    });
  }
  if (post.eventEndDate && post.eventDate && post.eventEndDate < post.eventDate) {
    context.addIssue({
      code: 'custom',
      path: ['eventEndDate'],
      message: 'The event end date must be on or after the start date.',
    });
  }
});

export const staffSchema = z.object({
  name: cleanText(120),
  role: cleanText(120),
  bio: optionalText(1000),
  image: optionalText(500),
  leadership: z.boolean().default(false),
  displayOrder: z.number().int().min(0).max(10000).default(0),
  published: z.boolean().default(true),
});

export const adminCreateSchema = z.object({
  username: z.string().trim().regex(/^[a-zA-Z0-9._-]{3,80}$/),
  password: z.string().min(14).max(200),
  role: z.enum(['admin', 'superadmin']).default('admin'),
});

export const adminUpdateSchema = z.object({
  password: z.union([z.literal(''), z.string().min(14).max(200)]).optional(),
  role: z.enum(['admin', 'superadmin']).optional(),
});

export const accountPasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(14).max(200),
});

export const settingsSchema = z.object({
  schoolName: cleanText(120),
  tagline: cleanText(160),
  phone: z.string().trim().min(7).max(25).regex(/^[+()\d\s-]+$/),
  email: z.email().max(254),
  whatsappNumber: z.string().trim().regex(/^\d{8,20}$/),
  applicationsOpen: z.boolean(),
  faviconUrl: optionalMediaPath,
  appleTouchIconUrl: optionalMediaPath,
  siteImages: siteImagesSchema,
  siteColors: z.object({
    primary: z.string().regex(/^#[\da-f]{6}$/i),
    secondary: z.string().regex(/^#[\da-f]{6}$/i),
    accent: z.string().regex(/^#[\da-f]{6}$/i),
    surface: z.string().regex(/^#[\da-f]{6}$/i),
  }).default(DEFAULT_SITE_COLORS),
  savedColorPalettes: z.array(z.object({
    name: cleanText(40),
    colors: z.object({
      primary: z.string().regex(/^#[\da-f]{6}$/i),
      secondary: z.string().regex(/^#[\da-f]{6}$/i),
      accent: z.string().regex(/^#[\da-f]{6}$/i),
      surface: z.string().regex(/^#[\da-f]{6}$/i),
    }),
  })).min(1).default(DEFAULT_COLOR_PALETTES).superRefine((palettes, context) => {
    const names = palettes.map(({ name }) => name.toLowerCase());
    if (new Set(names).size !== names.length) {
      context.addIssue({ code: 'custom', message: 'Saved color palette names must be unique.' });
    }
  }),
  whatsappWelcomeMessage: z.string().trim().min(1).max(500).default(DEFAULT_WHATSAPP_WELCOME_MESSAGE),
  whatsappContactTemplate: z.string().trim().min(1).max(1000).default(DEFAULT_WHATSAPP_CONTACT_TEMPLATE),
});

export const mediaUpdateSchema = z.object({
  altText: optionalText(300),
  galleryVisible: z.boolean(),
});

export const admissionStatusSchema = z.object({
  status: z.enum(['new', 'reviewing', 'accepted', 'waitlisted', 'declined']),
});

export function validationMessage(error) {
  return error.issues.map((issue) => issue.message).join(' ');
}
