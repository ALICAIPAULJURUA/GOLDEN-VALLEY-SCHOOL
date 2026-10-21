import { mongoApiHandler } from '../server/mongo-api.js';

export const config = { api: { bodyParser: false } };

export function normalizeVercelRequest(req) {
  const requestUrl = new URL(req.url || '/', 'http://localhost');
  const apiPath = requestUrl.searchParams.get('_gv_route');
  if (apiPath === null) return req;

  requestUrl.searchParams.delete('_gv_route');
  const query = requestUrl.searchParams.toString();
  req.url = `/api/${apiPath.replace(/^\/+/, '')}${query ? `?${query}` : ''}`;
  return req;
}

export default function handler(req, res) {
  return mongoApiHandler(normalizeVercelRequest(req), res);
}
