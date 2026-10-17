import { randomBytes, timingSafeEqual } from 'node:crypto';

export function createCsrfToken() {
  return randomBytes(32).toString('hex');
}

export function hasValidCsrfToken(session, token) {
  if (!session?.csrfToken || typeof token !== 'string') return false;
  const expected = Buffer.from(session.csrfToken);
  const supplied = Buffer.from(token);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function requireAdmin(getAdmin) {
  return (req, res, next) => {
    const adminId = Number(req.session?.adminId);
    const admin = Number.isSafeInteger(adminId) && adminId > 0
      ? getAdmin(adminId)
      : null;
    if (!admin) {
      res.status(401).json({ error: 'Sign in to access the admin area.' });
      return;
    }
    req.admin = admin;
    next();
  };
}

export function requireCsrf(req, res, next) {
  if (!hasValidCsrfToken(req.session, req.get('x-csrf-token'))) {
    res.status(403).json({ error: 'Your session expired. Refresh and try again.' });
    return;
  }
  next();
}
