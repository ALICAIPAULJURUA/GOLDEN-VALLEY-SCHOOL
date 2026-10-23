export const DEFAULT_SITE_COLORS = {
  primary: '#6A0D45',
  primaryDeep: '#4C0030',
  secondary: '#F2B277',
  accent: '#004B7A',
  surface: '#F9F8F6',
  background: '#FFFFFF',
  foreground: '#2E2A2D',
  muted: '#6C5F67',
  border: '#E9E5E7',
  success: '#249057',
  destructive: '#E7000B',
  highlight: '#F2B277',
};

export const LEGACY_SITE_COLORS = {
  primary: '#07594f',
  primaryDeep: '#123e38',
  secondary: '#ed7754',
  accent: '#13887e',
  surface: '#fff8e9',
  background: '#fffdf8',
  foreground: '#183f39',
  muted: '#63746c',
  border: '#e2e9e0',
  success: '#20b95c',
  destructive: '#a52c21',
  highlight: '#f3d762',
};

export const DEFAULT_SITE_IMAGES = {
  heroClassroom: '',
  heroPlayground: '',
  heroStudentsGroup: '',
  aboutSchool: '',
  logoCrest: '',
  logoFullWhite: '',
};

export const DEFAULT_COLOR_PALETTES = [
  { name: 'Golden Valley maroon', colors: DEFAULT_SITE_COLORS },
  { name: 'Golden Valley legacy', colors: LEGACY_SITE_COLORS },
];

export const DEFAULT_WHATSAPP_WELCOME_MESSAGE = 'Hello Golden Valley School! 👋 I would love to learn more about the school. Could someone from the school office please help me?';

export const DEFAULT_WHATSAPP_CONTACT_TEMPLATE = `Hello Golden Valley School! 👋

My name is {{name}} ({{email}}).
I am reaching out about: {{subject}}.

{{message}}

Could you please guide me on the next steps? Thank you.`;

export function fillWhatsAppTemplate(template, values) {
  return template.replace(/\{\{(name|email|subject|message)\}\}/g, (_match, key) => values[key] || '');
}

export function siteColorVariables(colors = DEFAULT_SITE_COLORS, theme = 'light') {
  const palette = { ...DEFAULT_SITE_COLORS, ...colors };
  const brand = {
    '--gv-green': palette.primary,
    '--gv-orange': palette.secondary,
    '--gv-teal': palette.accent,
    '--gv-cream': palette.surface,
    '--gv-yellow': palette.highlight,
  };
  if (theme === 'dark') return brand;
  return {
    ...brand,
    '--gv-deep': palette.primaryDeep,
    '--gv-bg': palette.background,
    '--gv-ink': palette.foreground,
    '--gv-muted': palette.muted,
    '--gv-border': palette.border,
    '--gv-success': palette.success,
    '--gv-danger': palette.destructive,
  };
}
