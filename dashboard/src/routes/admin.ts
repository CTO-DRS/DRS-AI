import { Router } from 'express';
import metricsService from '../services/metricsService';
import { query } from '../utils/db';
import logger from '../utils/logger';

const router = Router();

// Get dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await metricsService.getSystemStats();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    logger.error('Failed to get stats:', error);
    res.status(500).json({ success: false, error: { code: 'STATS_FAILED', message: error.message } });
  }
});

// Get service health
router.get('/health', async (req, res) => {
  try {
    const health = await metricsService.getServiceHealth();
    res.json({ success: true, data: health });
  } catch (error: any) {
    logger.error('Failed to get health:', error);
    res.status(500).json({ success: false, error: { code: 'HEALTH_FAILED', message: error.message } });
  }
});

// Get recent activity
router.get('/activity', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const activity = await metricsService.getRecentActivity(Number(limit));
    res.json({ success: true, data: { activity } });
  } catch (error: any) {
    logger.error('Failed to get activity:', error);
    res.status(500).json({ success: false, error: { code: 'ACTIVITY_FAILED', message: error.message } });
  }
});

// Get users
router.get('/users', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const result = await query(
      `SELECT id, email, username, role, is_active, last_login_at, created_at 
       FROM users 
       ORDER BY created_at DESC 
       LIMIT $1 OFFSET $2`,
      [Number(limit), Number(offset)]
    );
    res.json({ success: true, data: { users: result.rows } });
  } catch (error: any) {
    logger.error('Failed to get users:', error);
    res.status(500).json({ success: false, error: { code: 'USERS_FAILED', message: error.message } });
  }
});

// Update user
router.patch('/users/:id', async (req, res) => {
  try {
    const { role, isActive } = req.body;
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (role !== undefined) {
      updates.push(`role = $${paramIndex++}`);
      values.push(role);
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(isActive);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: { code: 'NO_UPDATES', message: 'No fields to update' } });
    }

    values.push(req.params.id);
    await query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex}`,
      values
    );

    res.json({ success: true, data: { message: 'User updated' } });
  } catch (error: any) {
    logger.error('Failed to update user:', error);
    res.status(500).json({ success: false, error: { code: 'UPDATE_FAILED', message: error.message } });
  }
});

export default router;
