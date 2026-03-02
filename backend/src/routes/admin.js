import { Hono } from 'hono';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { getAllUsers, adminUpdateUser } from '../services/database.js';

const router = new Hono();
router.use('*', authMiddleware, adminMiddleware);

// GET /api/admin/users
router.get('/users', async (c) => {
  const users = await getAllUsers();
  return c.json({ success: true, data: users });
});

// PATCH /api/admin/users/:id
router.patch('/users/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const data = await adminUpdateUser(id, body);
  return c.json({ success: true, data });
});

export default router;
