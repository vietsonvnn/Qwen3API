import { createClient } from '@supabase/supabase-js';
import config from '../config/index.js';
import { getUserById } from '../services/database.js';

const supabase = createClient(config.supabase.url, config.supabase.anonKey);

/**
 * Hono middleware: verify Supabase JWT and attach user to context
 */
export async function authMiddleware(c, next) {
  const authorization = c.req.header('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authorization.slice(7);

  let userData, authError;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    userData = data;
    authError = error;
  } catch (err) {
    // Network / timeout error connecting to Supabase
    console.error('Auth: Supabase unreachable:', err.message);
    return c.json({ error: 'Service temporarily unavailable — please try again' }, 503);
  }

  if (authError || !userData?.user) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  c.set('userId', userData.user.id);
  c.set('userEmail', userData.user.email);
  await next();
}

/**
 * Hono middleware: ensure authenticated user has role='admin'
 * Must run after authMiddleware
 */
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
