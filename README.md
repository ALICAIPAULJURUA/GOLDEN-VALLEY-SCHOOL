# Golden Valley School

A standalone React website and Node.js/Express backend for Golden Valley
Kindergarten, Day Care & Primary School. School admissions and published news,
updates, and events are stored in SQLite. Joomla is no longer required.

## Requirements

- Node.js 22.12 or newer
- npm

## Local development

```powershell
npm install
npm run admin:create
```

Run the API in one terminal:

```powershell
npm start
```

Run the frontend in a second terminal:

```powershell
npm run dev
```

Open the Vite URL shown in the terminal. Vite forwards `/api` requests to the
Express API on port 3000. Copy `.env.example` to `.env.local` and set
`VITE_TINYMCE_API_KEY` to your TinyMCE Cloud key before starting or rebuilding
the frontend. This key is intentionally public in the browser; restrict its
allowed domains in the TinyMCE account. For local Vite testing, open
`http://localhost:5173/#/admin` and allow the `localhost` domain in TinyMCE.
Restart Vite after changing `.env.local`. To create more staff accounts, use
the admin User Management section or run `npm run admin:create`.
Contact-form submissions are saved to the private Messages inbox. To reply
from the admin, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`,
and `SMTP_PASS` in the server environment using an email-provider app password;
set `SMTP_SECURE=true` for implicit TLS (usually port 465). Never commit or
share the SMTP password. Until SMTP is configured, messages can still be read,
but the server will explicitly report that replies are unavailable.

Super administrators can upload a PNG/GIF/WebP browser favicon and Apple
home-screen icon in Site Settings. The default school crest remains in use
until a custom icon is selected and saved.

The first staff administrator is created interactively; password entry is
hidden and passwords are hashed with bcrypt. They are never stored in source
control. The default database is `storage/golden-valley.sqlite`. Set
`DATABASE_PATH` to move it to a persistent location.

## Production

1. Set `NODE_ENV=production`.
2. Set `SESSION_SECRET` to a long, random value (at least 32 characters).
3. Set `VITE_WHATSAPP_NUMBER` to the school WhatsApp number in international
   format without `+` or spaces, for example `2567XXXXXXXX`.
4. Set `VITE_TINYMCE_API_KEY` before building the frontend; TinyMCE API keys are
   included in the client bundle, so restrict the key to your site domain.
5. Run `npm ci`, `npm run admin:create`, and `npm run build`.
6. Run `npm start` behind an HTTPS reverse proxy. If the proxy terminates TLS,
   set `TRUST_PROXY=1`.
7. Persist and back up the directory containing the SQLite database. Restrict
   database and backup access to the website operator.

The Express server serves the production React build and uploaded media. TinyMCE
is loaded from its Cloud CDN and requires the configured browser API key. There
is no Joomla dependency.

## Website features

- Public school, academics, staff, gallery, news, and admissions pages.
- Secure online admissions stored privately in SQLite, with optional private
  previous-school results uploads for transfer applicants.
- Password-protected `/#/admin` dashboard for admissions, staff, media, settings,
  and administrator account management.
- News, updates, and events with SEO fields, feature images, sharing links,
  event date/time, location and registration details, and TinyMCE Cloud editing.
- The first database setup includes sample news and school updates; an existing
  database receives these examples once, and administrators can edit or remove
  them from News & Updates.
- Contact messages are fetched independently from other admin data and the
  inbox refreshes automatically while open, when the admin window regains focus,
  or when an administrator chooses Refresh inbox.
- Individual article pages support sharing, likes, and moderated comments;
  comments are published only after an administrator approves them.
- Staff profiles, event posts, and news posts accept direct image uploads. If
  TinyMCE cannot connect, the editor explains the issue and keeps a plain-text
  content field available.
- Public staff profiles with leadership featured first, and a media-managed
  school photo gallery.
- Public school photos and logos can be replaced from Site Settings, while
  article, staff, and gallery images are managed in their respective sections.
- Light and dark admin themes and configurable school contact/admissions settings.
- Super administrators can select the existing Golden Valley color palette,
  customize primary/secondary/accent/surface colors, save reusable named
  palettes, and edit the prefilled WhatsApp welcome and contact messages from
  Site Settings. Visitors review and send the prepared WhatsApp message
  themselves; the school does not receive messages until they send them.
- WhatsApp links and a contact form that opens a ready-to-send WhatsApp
  message. Admission submissions remain in the school dashboard.
- Public APIs at `/api/posts` and `/api/admissions`; private admin APIs require
  a signed session and CSRF token.
- Private contact-message inbox with replies delivered over configured SMTP.

The content editor sanitizes HTML before saving, public routes expose published
posts only, and admissions records/results are never returned by public endpoints.
Uploaded public images are stored in `storage/media`; admission results are kept
separately in `storage/admission-results` and can only be downloaded by signed-in
administrators.
