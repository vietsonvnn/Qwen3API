import { Hono } from 'hono';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { getAllUsers, adminUpdateUser, adminGetAllJobs, adminDeleteUser, adminGetStats } from '../services/database.js';

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

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (c) => {
  const id = c.req.param('id');
  const requesterId = c.get('userId');
  if (id === requesterId) return c.json({ error: 'Không thể xóa chính mình' }, 400);
  await adminDeleteUser(id);
  return c.json({ success: true });
});

// GET /api/admin/stats
router.get('/stats', async (c) => {
  const stats = await adminGetStats();
  return c.json({ success: true, data: stats });
});

// GET /api/admin/jobs
router.get('/jobs', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  const userId = c.req.query('userId') || null;
  const result = await adminGetAllJobs({ limit, offset, userId });
  return c.json({ success: true, data: result.jobs, total: result.total });
});

export default router;
