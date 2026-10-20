import 'dotenv/config';
import { mongoApiApp } from './mongo-api.js';
import { closeMongo } from './mongodb.js';

const port = Number(process.env.PORT || 3000);
const server = mongoApiApp.listen(port, '0.0.0.0', () => {
  console.log(`Golden Valley MongoDB API listening on http://localhost:${port}`);
});

async function shutdown() {
  server.close(async () => {
    await closeMongo();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
