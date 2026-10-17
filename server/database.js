import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';
import {
  DEFAULT_COLOR_PALETTES,
  DEFAULT_SITE_COLORS,
  DEFAULT_SITE_IMAGES,
  DEFAULT_WHATSAPP_CONTACT_TEMPLATE,
  DEFAULT_WHATSAPP_WELCOME_MESSAGE,
} from '../site-theme.js';

const require = createRequire(import.meta.url);
const databasePath = path.resolve(process.env.DATABASE_PATH || 'storage/golden-valley.sqlite');
const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');

let database;
let SQL;

export async function openDatabase() {
  if (database) return database;
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  SQL = await initSqlJs({ locateFile: () => wasmPath });
  database = fs.existsSync(databasePath)
    ? new SQL.Database(fs.readFileSync(databasePath))
    : new SQL.Database();
  database.run('PRAGMA foreign_keys = ON;');
  database.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'superadmin')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK (type IN ('news', 'update', 'event')),
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      content TEXT NOT NULL,
      event_date TEXT,
      event_time TEXT,
      event_end_date TEXT,
      event_location TEXT NOT NULL DEFAULT '',
      event_registration_url TEXT NOT NULL DEFAULT '',
      meta_title TEXT NOT NULL DEFAULT '',
      meta_description TEXT NOT NULL DEFAULT '',
      featured_image TEXT NOT NULL DEFAULT '',
      published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS post_likes (
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      visitor_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (post_id, visitor_id)
    );
    CREATE TABLE IF NOT EXISTS post_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS post_comments_public_order ON post_comments(post_id, status, created_at);
    CREATE INDEX IF NOT EXISTS posts_public_order ON posts(published, type, event_date, created_at);
    CREATE TABLE IF NOT EXISTS admissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      student_name TEXT NOT NULL,
      date_of_birth TEXT NOT NULL,
      gender TEXT NOT NULL,
      class_applied TEXT NOT NULL,
      parent_name TEXT NOT NULL,
      relationship TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      address TEXT NOT NULL,
      previous_school TEXT,
      previous_results_file TEXT,
      previous_results_name TEXT,
      additional_information TEXT,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'accepted', 'waitlisted', 'declined')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS admissions_recent ON admissions(created_at DESC);
    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'replied')),
      reply_text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      replied_at TEXT
    );
    CREATE INDEX IF NOT EXISTS contact_messages_recent ON contact_messages(status, created_at DESC);
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      bio TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '',
      leadership INTEGER NOT NULL DEFAULT 0 CHECK (leadership IN (0, 1)),
      display_order INTEGER NOT NULL DEFAULT 0,
      published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      alt_text TEXT NOT NULL DEFAULT '',
      gallery_visible INTEGER NOT NULL DEFAULT 0 CHECK (gallery_visible IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  const ensureColumn = (table, column, definition) => {
    const columns = database.exec(`PRAGMA table_info(${table})`)[0]?.values ?? [];
    if (!columns.some((entry) => entry[1] === column)) {
      database.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };
  ensureColumn('admins', 'role', "TEXT NOT NULL DEFAULT 'admin'");
  ensureColumn('posts', 'event_end_date', 'TEXT');
  ensureColumn('posts', 'event_location', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('posts', 'event_registration_url', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('posts', 'meta_title', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('posts', 'meta_description', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('posts', 'featured_image', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('admissions', 'previous_results_file', 'TEXT');
  ensureColumn('admissions', 'previous_results_name', 'TEXT');
  database.run("UPDATE admins SET role = 'superadmin' WHERE username = 'superadmin'");
  database.run(`INSERT OR IGNORE INTO settings (key, value) VALUES
    ('schoolName', 'Golden Valley School'),
    ('tagline', 'Kindergarten · Day Care · Primary'),
    ('phone', '0777 627 421'),
    ('email', 'i.abiriga@muni.ac.ug'),
    ('whatsappNumber', '256777627421'),
    ('applicationsOpen', 'true'),
    ('faviconUrl', ''),
    ('appleTouchIconUrl', ''),
    ('siteImages', '${JSON.stringify(DEFAULT_SITE_IMAGES)}'),
    ('siteColors', '${JSON.stringify(DEFAULT_SITE_COLORS)}'),
    ('savedColorPalettes', '${JSON.stringify(DEFAULT_COLOR_PALETTES)}'),
    ('whatsappWelcomeMessage', '${DEFAULT_WHATSAPP_WELCOME_MESSAGE.replaceAll("'", "''")}'),
    ('whatsappContactTemplate', '${DEFAULT_WHATSAPP_CONTACT_TEMPLATE.replaceAll("'", "''")}')`);
  if (get('SELECT value FROM settings WHERE key = ?', ['staffSeeded'])?.value !== 'true') {
    database.run(`INSERT INTO staff (name, role, leadership, display_order) VALUES
      ('Mr. Abiriga Bosco', 'Founder & Director', 1, 1),
      ('Mr. Dramaza George', 'Head Teacher', 1, 2),
      ('Our Nursery Team', 'Early Years Educators', 0, 3)`);
    database.run("INSERT INTO settings (key, value) VALUES ('staffSeeded', 'true') ON CONFLICT(key) DO UPDATE SET value = 'true'");
  }
  persistDatabase();
  return database;
}

export function all(sql, values = []) {
  const statement = database.prepare(sql);
  try {
    statement.bind(values);
    const rows = [];
    while (statement.step()) rows.push(statement.getAsObject());
    return rows;
  } finally {
    statement.free();
  }
}

export function get(sql, values = []) {
  return all(sql, values)[0] ?? null;
}

export function run(sql, values = []) {
  database.run(sql, values);
  return {
    changes: database.getRowsModified(),
    lastInsertRowid: get('SELECT last_insert_rowid() AS id').id,
  };
}

export function persistDatabase() {
  if (!database) return;
  const temporaryPath = `${databasePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, Buffer.from(database.export()));
  fs.renameSync(temporaryPath, databasePath);
}

export function closeDatabase() {
  if (database) {
    persistDatabase();
    database.close();
    database = undefined;
  }
}

export function databaseFile() {
  return databasePath;
}
