import { Hono } from 'hono';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { getAllUsers, adminUpdateUser, adminGetAllJobs, adminDeleteUser, adminGetStats, getAppSettings, upsertAppSetting } from '../services/database.js';
import { cleanupOldAudioFiles } from '../services/storageCleanup.js';

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

// POST /api/admin/users/:id/approve — approve pending user
router.post('/users/:id/approve', async (c) => {
  const id = c.req.param('id');
  const data = await adminUpdateUser(id, { status: 'active' });
  return c.json({ success: true, data });
});

// POST /api/admin/users/:id/reject — reject pending user (delete account)
router.post('/users/:id/reject', async (c) => {
  const id = c.req.param('id');
  const requesterId = c.get('userId');
  if (id === requesterId) return c.json({ error: 'Không thể từ chối chính mình' }, 400);
  await adminDeleteUser(id);
  return c.json({ success: true });
});

// GET /api/admin/settings — get all app settings
router.get('/settings', async (c) => {
  const settings = await getAppSettings();
  return c.json({ success: true, data: settings });
});

// PUT /api/admin/settings — update a setting
router.put('/settings', async (c) => {
  const { key, value, description } = await c.req.json();
  if (!key || value === undefined) return c.json({ error: 'key and value are required' }, 400);
  const data = await upsertAppSetting(key, value, description);
  return c.json({ success: true, data });
});

// POST /api/admin/cleanup — trigger manual storage cleanup
router.post('/cleanup', async (c) => {
  const result = await cleanupOldAudioFiles();
  return c.json({ success: true, data: result });
});

export default router;
