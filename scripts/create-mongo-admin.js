import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectMongo, closeMongo } from '../server/mongodb.js';

try {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!/^[a-zA-Z0-9._-]{3,80}$/.test(username || '')) {
    throw new Error('Set ADMIN_USERNAME to 3–80 letters, numbers, dots, underscores, or hyphens.');
  }
  if (!password || password.length < 14 || password.length > 200) {
    throw new Error('Set ADMIN_PASSWORD to a value between 14 and 200 characters.');
  }
  const { db } = await connectMongo();
  const admins = db.collection('admins');
  if (await admins.findOne({ username }, { projection: { _id: 1 } })) {
    throw new Error('That MongoDB administrator username already exists.');
  }
  const role = await admins.countDocuments() ? 'admin' : 'superadmin';
  await admins.insertOne({
    username,
    passwordHash: await bcrypt.hash(password, 12),
    role,
    createdAt: new Date().toISOString(),
  });
  console.log(`Created ${role} "${username}" for the MongoDB backend.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await closeMongo();
}
