# Golden Valley School

The website is a standalone React/Vite application. Its production API is
Node.js/Express on Vercel, with MongoDB Atlas for application data and MongoDB
GridFS for uploaded media and private admissions documents. Static files already
in `media/` remain part of the frontend build. Joomla, Firebase, and Cloudinary
are not used.

## Requirements

- Node.js 22.12 or newer
- npm
- A MongoDB Atlas database for the production API and Mongo-backed local testing

## Environment variables

`.env.example` lists the variables read by the application and identifies
which are production/server settings, browser build settings, optional SMTP
settings, and legacy SQLite settings. Copy it to `.env` for the local Node
backend. The Node API and Mongo admin bootstrap import `dotenv/config`, which
loads `.env`; Vite also reads `.env.local` for browser build variables such as
the TinyMCE key. Keep private values in `.env`, never in a `VITE_` variable.

The `.gitignore` rules exclude `.env` and `.env.*` files while allowing
`.env.example` to be committed. Keep `.env.local` private as well.

## Configure MongoDB Atlas

1. Create an Atlas cluster and a database user with `readWrite` access only to
   the database used by this site.
2. Configure Atlas Network Access to permit connections from the deployment
   environment. Vercel's serverless functions do not have fixed outbound IPs
   unless the project uses Vercel Secure Compute/static egress.
3. Copy `.env.example` to `.env` for local development and replace the
   `MONGODB_URI` placeholder with the Atlas connection URI. The configured
   `MONGODB_DB=golden_valley_school` template value is passed to
   `MongoClient.db()`. It is an example configured name, not proof that a
   database with that name already exists in your Atlas cluster; Atlas creates
   the database when data is first written. Choose the actual database name
   that contains your intended site data and admin account, and configure the
   same name locally and in Vercel.
4. Set `SESSION_SECRET` to a randomly generated value of at least 32 characters
   in production. Keep all server credentials out of `VITE_` variables.

The Mongo API requires `MONGODB_URI`, `MONGODB_DB`, and a production
`SESSION_SECRET`. The configured database name is always selected explicitly;
the API will not silently fall back to a database path embedded in the URI.
`MONGODB_MAX_POOL_SIZE` is optional and defaults to 5.

The API creates only the collections required by existing site features:
administrators, posts, settings, admissions, contact messages, staff, media,
article comments, and likes. GridFS uses its standard `uploads.files` and
`uploads.chunks` collections. It creates unique indexes for admin usernames,
post slugs, and visitor/article likes.

If `/api/*` requests show the website page or return HTTP 405, check that the
latest Vercel deployment includes the `api/index.js` function and the API
rewrites in `vercel.json`. A successful static-site build alone does not
verify that the serverless API can initialize; inspect Vercel runtime logs if
API requests return `FUNCTION_INVOCATION_FAILED`.

## Local development

```powershell
npm install
```

Set `MONGODB_URI`, `MONGODB_DB`, and `SESSION_SECRET` in `.env`. The example
Mongo URI, session secret, and SMTP values are placeholders and must be replaced
before use. Create the first MongoDB superadministrator (the first account is
automatically assigned that role):

```powershell
$env:ADMIN_USERNAME = "schooladmin"
$env:ADMIN_PASSWORD = "use-a-unique-password-at-least-14-characters"
npm run admin:mongo:create
Remove-Item Env:ADMIN_USERNAME, Env:ADMIN_PASSWORD
```

Run the same MongoDB-backed Express API locally and start Vite in a second
terminal:

```powershell
npm run start:mongo
npm run dev
```

Open the Vite URL it prints. Vite proxies `/api` requests to port 3000. `npm
start` remains available for the existing SQLite development server; it is not
the production backend. The SQLite database and local uploads remain on disk
and are not automatically copied to Atlas. The current repository contains no
checked-in database or uploaded-file data to migrate.

The script requires `MONGODB_URI`, `MONGODB_DB`, `ADMIN_USERNAME`, and
`ADMIN_PASSWORD`; it reads them through `dotenv/config` from `.env` or from the
process environment. The
username must contain 3–80 allowed characters and the password must be
14–200 characters. For one-time use, enter them in the current PowerShell
session or temporarily in the ignored local `.env`; run the command, then
remove the variables from the shell/file. Do not commit or set bootstrap
credentials permanently in Vercel.

Set browser-only settings such as `VITE_TINYMCE_API_KEY` and
`VITE_WHATSAPP_NUMBER` in `.env.local` or another Vite environment file.
TinyMCE's key is public browser configuration and should be restricted to the
site's domains. Preserve any existing `.env.local`; the template placeholder
is not a replacement for your real restricted browser key.

## Deploy on Vercel

The project builds the existing React site to `dist`. The `api/index.js`
serverless function runs the same Express API used for Mongo-backed local
development. `vercel.json` explicitly rewrites API and uploaded-file requests
to this function before applying the existing SPA fallback.

Add the following variables separately in Vercel **Project → Settings →
Environment Variables**. Vercel does not read your local `.env` file:

| Variable | Use |
| --- | --- |
| `MONGODB_URI` | **Required, server-only secret.** Atlas connection URI. |
| `MONGODB_DB` | **Required.** Explicit Atlas database name; set to the database containing the intended site data and admin account. |
| `SESSION_SECRET` | **Required, server-only secret.** Random value with at least 32 characters. |
| `MONGODB_MAX_POOL_SIZE` | Optional MongoDB connection pool size; defaults to `5`. |
| `SMTP_HOST` | Required for email replies. |
| `SMTP_FROM` | Required for email replies; sender address/name. |
| `SMTP_USER` | Required for email replies. |
| `SMTP_PASS` | Required server-only SMTP credential. |
| `SMTP_PORT` | Optional SMTP port; defaults to `587`. |
| `SMTP_SECURE` | Optional; `true` forces secure SMTP. Port `465` is secure automatically. |
| `VITE_TINYMCE_API_KEY` | Browser/build variable; TinyMCE key restricted to the site domains. |
| `VITE_WHATSAPP_NUMBER` | Optional browser/build variable; international digits. |

Do not permanently set `ADMIN_USERNAME` or `ADMIN_PASSWORD` in Vercel. They are
used only by the one-time bootstrap command in an environment that can connect
to the same Atlas database. Set `MONGODB_URI`, `MONGODB_DB`, `ADMIN_USERNAME`,
and `ADMIN_PASSWORD` in the local process for the command, then remove the two
bootstrap variables. The bootstrap command inserts one administrator and
stores only its bcrypt password hash.

After setting Vercel's production variables, deploy/redeploy. Only if the
configured database does not already contain an administrator, create the
first administrator using the one-off command with the Atlas variables
available locally. Do not run this bootstrap again for an existing account:

```powershell
$env:MONGODB_URI = "your-atlas-uri"
$env:MONGODB_DB = "your-configured-atlas-database-name"
$env:ADMIN_USERNAME = "schooladmin"
$env:ADMIN_PASSWORD = "use-a-unique-password-at-least-14-characters"
npm run admin:mongo:create
Remove-Item Env:ADMIN_USERNAME, Env:ADMIN_PASSWORD
```

Never commit `.env` or enter database/SMTP credentials into browser variables.
The command refuses to create a duplicate username and does not print or
persist the password outside MongoDB's bcrypt hash. Additional administrators
and role changes are managed in the existing admin interface; public
registration is not available.

Vercel serverless requests are limited to approximately 4.5 MB. To remain
compatible, the production API enforces a 4 MB file limit, which matches the
existing upload guidance. Uploaded media is validated and stored in GridFS.
Admission results are stored in GridFS as private files and can only be
retrieved by an authenticated administrator. Existing bundled site images are
not uploaded or changed.

## Data and defaults

When the MongoDB content collections are empty, the API seeds the website's
existing sample news, updates, events, and default staff profiles. Site settings
continue to use the existing frontend defaults until an administrator saves
custom values. This does not import a prior SQLite database: back up any
deployment database and its `storage/` uploads before changing backends, and
contact the project maintainer for a migration if that data exists outside this
repository.

## Verification

```powershell
npm test
npm run build
```

`GET /api/health` pings Atlas and reports the active MongoDB backend. A local
Atlas connection must be configured to verify database reads/writes and GridFS
uploads; those cloud operations cannot be verified without Atlas credentials.

## Existing website features

- Public school, academics, staff, gallery, news, events, and admissions pages.
- Online admissions with optional private previous-school results uploads.
- Admin CMS for content, SEO, feature images, events, staff, media, comments,
  admissions, messages, site colors, settings, and users.
- News and article pages with sharing, likes, and administrator-moderated
  comments.
- TinyMCE Cloud editor, with a plain-text fallback when the editor cannot load.
- Dark/light admin themes, editable school color palettes, WhatsApp links, and
  SMTP replies from the admin inbox.
