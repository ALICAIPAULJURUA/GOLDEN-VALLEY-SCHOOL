import { mongoApiHandler } from '../server/mongo-api.js';

export const config = { api: { bodyParser: false } };

export default mongoApiHandler;
