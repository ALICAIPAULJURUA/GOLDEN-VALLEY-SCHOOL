import { GridFSBucket, MongoClient } from 'mongodb';

let client;
let connection;

export class MongoConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MongoConfigurationError';
    this.code = 'MONGO_CONFIG';
  }
}

export function getMongoConfig(env = process.env) {
  const uri = env.MONGODB_URI?.trim();
  if (!uri) throw new MongoConfigurationError('Set MONGODB_URI in the server environment.');

  const databaseName = env.MONGODB_DB?.trim();
  if (!databaseName) throw new MongoConfigurationError('Set MONGODB_DB to the intended Atlas database name.');

  const maxPoolSize = env.MONGODB_MAX_POOL_SIZE === undefined
    ? 5
    : Number(env.MONGODB_MAX_POOL_SIZE);
  if (!Number.isSafeInteger(maxPoolSize) || maxPoolSize < 1) {
    throw new MongoConfigurationError('MONGODB_MAX_POOL_SIZE must be a positive whole number.');
  }

  return { uri, databaseName, maxPoolSize };
}

export async function connectMongo() {
  if (connection) return connection;
  const { uri, databaseName, maxPoolSize } = getMongoConfig();

  client = new MongoClient(uri, {
    maxPoolSize,
    serverSelectionTimeoutMS: 10000,
  });
  connection = client.connect()
    .then((connectedClient) => {
      const db = connectedClient.db(databaseName);
      return Promise.all([
        db.collection('admins').createIndex({ username: 1 }, { unique: true }),
        db.collection('posts').createIndex({ slug: 1 }, { unique: true }),
        db.collection('post_likes').createIndex({ postId: 1, visitorId: 1 }, { unique: true }),
      ]).then(() => ({ client: connectedClient, db, bucket: new GridFSBucket(db, { bucketName: 'uploads' }) }));
    })
    .catch(async (error) => {
      const failedClient = client;
      connection = undefined;
      client = undefined;
      if (failedClient) {
        await failedClient.close().catch((closeError) => {
          const details = {};
          if (typeof closeError?.name === 'string') details.name = closeError.name;
          if (typeof closeError?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(closeError.code)) details.code = closeError.code;
          else if (Number.isSafeInteger(closeError?.code)) details.code = closeError.code;
          console.error('Failed to close the unavailable MongoDB client cleanly.', details);
        });
      }
      throw error;
    });
  return connection;
}

export async function closeMongo() {
  if (!client) return;
  await client.close();
  client = undefined;
  connection = undefined;
}
