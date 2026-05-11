import { Hono } from 'hono';
import jwt from 'jsonwebtoken';
import { getUserByEmail, upsertUserProfile } from '../services/database.js';
import config from '../config/index.js';

const router = new Hono();

async function verifyGoogleToken(credential) {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
  );
  if (!res.ok) throw new Error('Failed to verify Google token');
  const payload = await res.json();
  if (payload.error) throw new Error(`Google token invalid: ${payload.error_description || payload.error}`);
  if (config.auth.googleClientId && payload.aud !== config.auth.googleClientId) {
    throw new Error('Token audience mismatch');
  }
  return payload;
}

router.post('/google', async (c) => {
  try {
    const { credential } = await c.req.json();
    if (!credential) return c.json({ error: 'Missing credential' }, 400);

    const googlePayload = await verifyGoogleToken(credential);
    if (!googlePayload.email_verified) return c.json({ error: 'Email not verified with Google' }, 400);

    const email = googlePayload.email;
    const displayName = googlePayload.name || email.split('@')[0];

    let user = await getUserByEmail(email);
    if (!user) {
      const { v4: uuidv4 } = await import('uuid');
      user = await upsertUserProfile(uuidv4(), email, displayName);
    } else {
      await upsertUserProfile(user.id, email, displayName);
      user = await getUserByEmail(email);
    }

    if (user.status === 'banned') return c.json({ error: 'Account has been banned' }, 403);
    if (user.status === 'suspended') return c.json({ error: 'Tài khoản đã bị khoá.' }, 403);

    const token = jwt.sign(
      { id: user.id, email: user.email },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    return c.json({
      token,
      user: { id: user.id, email: user.email, display_name: user.display_name, role: user.role, status: user.status },
    });
  } catch (error) {
    if (error.message?.includes('invalid') || error.message?.includes('mismatch')) {
      return c.json({ error: 'Authentication failed: ' + error.message }, 401);
    }
    return c.json({ error: 'Authentication failed' }, 500);
  }
});

export default router;
