import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { getUserById } from '../services/database.js';

export async function authMiddleware(c, next) {
  const authorization = c.req.header('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authorization.slice(7);

  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret);
  } catch (err) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  c.set('userId', payload.id);
  c.set('userEmail', payload.email);

  const path = c.req.path;
  if (path !== '/api/user/me') {
    try {
      const profile = await getUserById(payload.id);
      if (profile?.status === 'pending') {
        return c.json({ error: 'Tài khoản đang chờ duyệt. Vui lòng liên hệ admin.', code: 'PENDING_APPROVAL' }, 403);
      }
      if (profile?.status === 'suspended') {
        return c.json({ error: 'Tài khoản đã bị khoá.', code: 'SUSPENDED' }, 403);
      }
    } catch {
      // Allow through if profile check fails
    }
  }

  await next();
}

export async function adminMiddleware(c, next) {
  try {
    const profile = await getUserById(c.get('userId'));
    if (!profile || profile.role !== 'admin') {
      return c.json({ error: 'Forbidden' }, 403);
    }
  } catch {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await next();
}
