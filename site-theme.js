export const DEFAULT_SITE_COLORS = {
  primary: '#07594f',
  secondary: '#ed7754',
  accent: '#13887e',
  surface: '#fff8e9',
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
  { name: 'Golden Valley default', colors: DEFAULT_SITE_COLORS },
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

export function siteColorVariables(colors = DEFAULT_SITE_COLORS) {
  return {
    '--gv-green': colors.primary,
    '--gv-orange': colors.secondary,
    '--gv-teal': colors.accent,
    '--gv-cream': colors.surface,
  };
}
