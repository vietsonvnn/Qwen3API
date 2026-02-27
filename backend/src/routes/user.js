import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { getUserById, updateUserLastLogin } from '../services/database.js';

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

export default router;
