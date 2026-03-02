import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { getUserById, updateUserLastLogin, updateUserProfile } from '../services/database.js';

const router = new Hono();
router.use('*', authMiddleware);

// GET /api/user/me
router.get('/me', async (c) => {
  const userId = c.get('userId');
  const user = await getUserById(userId);
  if (!user) return c.json({ error: 'User not found' }, 404);

  await updateUserLastLogin(userId);
  return c.json({ data: user });
});

// PATCH /api/user/me
router.patch('/me', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  if (!body.display_name?.trim()) return c.json({ error: 'Tên không được để trống' }, 400);
  const data = await updateUserProfile(userId, { display_name: body.display_name.trim() });
  return c.json({ success: true, data });
});

export default router;
