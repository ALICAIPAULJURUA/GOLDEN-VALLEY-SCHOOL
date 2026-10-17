import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { emitKeypressEvents } from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { closeDatabase, get, openDatabase, persistDatabase, run } from '../server/database.js';

function readHiddenPassword() {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Set ADMIN_PASSWORD when running without an interactive terminal.');
  }
  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  stdout.write('Admin password (at least 14 characters): ');
  return new Promise((resolve, reject) => {
    let value = '';
    function finish(error) {
      stdin.removeListener('keypress', onKeypress);
      stdin.setRawMode(false);
      stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    }
    function onKeypress(character, key) {
      if (key?.ctrl && (key.name === 'c' || key.name === 'd')) {
        finish(new Error('Admin creation cancelled.'));
      } else if (key?.name === 'return' || key?.name === 'enter') {
        finish();
      } else if (key?.name === 'backspace' || key?.name === 'delete') {
        value = value.slice(0, -1);
      } else if (character && !key?.ctrl && !key?.meta) {
        value += character;
      }
    }
    stdin.on('keypress', onKeypress);
  });
}

try {
  if (!process.env.ADMIN_USERNAME && !stdin.isTTY) {
    throw new Error('Set ADMIN_USERNAME and ADMIN_PASSWORD or run this command in an interactive terminal.');
  }
  await openDatabase();
  const prompt = createInterface({ input: stdin, output: stdout });
  const username = (process.env.ADMIN_USERNAME || await prompt.question('Admin username: ')).trim();
  prompt.close();
  if (!/^[a-zA-Z0-9._-]{3,80}$/.test(username)) {
    throw new Error('Use a username with 3–80 letters, numbers, dots, underscores, or hyphens. Spaces are not allowed.');
  }
  if (get('SELECT id FROM admins WHERE username = ?', [username])) {
    throw new Error('That admin username already exists. Choose another username.');
  }
  const password = process.env.ADMIN_PASSWORD || await readHiddenPassword();
  if (password.length < 14 || password.length > 200) {
    throw new Error('Choose a password between 14 and 200 characters long.');
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const role = get('SELECT id FROM admins LIMIT 1') ? 'admin' : 'superadmin';
  run('INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)', [username, passwordHash, role]);
  persistDatabase();
  console.log(`Created ${role} "${username}". Use the /#/admin page to sign in.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  closeDatabase();
}
