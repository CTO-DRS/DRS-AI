import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import authService from '../services/authService';
import logger from '../utils/logger';

const router = Router();

const handleValidationErrors = (req: Request, res: Response, next: Function) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: errors.array()
      }
    });
  }
  next();
};

// Register
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('username').isAlphanumeric().isLength({ min: 3, max: 50 }),
    body('password').isLength({ min: 8 }),
    body('firstName').optional().trim(),
    body('lastName').optional().trim()
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { user, tokens } = await authService.register(
        req.body,
        req.ip || 'unknown',
        req.get('user-agent') || 'unknown'
      );

      res.status(201).json({
        success: true,
        data: {
          user,
          tokens
        }
      });
    } catch (error: any) {
      logger.error('Registration error:', error);
      res.status(400).json({
        success: false,
        error: {
          code: 'REGISTRATION_FAILED',
          message: error.message
        }
      });
    }
  }
);

// Login
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').exists(),
    body('twoFactorCode').optional().isLength({ min: 6, max: 6 })
  ],
  handleValidationErrors,
  async (req: Request, res: Response) => {
    try {
      const { user, tokens } = await authService.login(
        req.body,
        req.ip || 'unknown',
        req.get('user-agent') || 'unknown'
      );

      res.json({
        success: true,
        data: {
          user,
          tokens
        }
      });
    } catch (error: any) {
      logger.error('Login error:', error);
      res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_FAILED',
          message: error.message
        }
      });
    }
  }
);

// Logout
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const userId = req.headers['x-user-id'] as string;
      if (userId) {
        await authService.logout(userId, token);
      }
    }

    res.json({
      success: true,
      data: { message: 'Logged out successfully' }
    });
  } catch (error: any) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'LOGOUT_FAILED',
        message: error.message
      }
    });
  }
});

// Refresh token
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Refresh token is required'
        }
      });
    }

    const tokens = await authService.refreshToken(refreshToken);

    res.json({
      success: true,
      data: { tokens }
    });
  } catch (error: any) {
    logger.error('Token refresh error:', error);
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: error.message
      }
    });
  }
});

// Setup 2FA
router.post('/2fa/setup', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
    }

    const { secret, qrCode } = await authService.setupTwoFactor(userId);

    res.json({
      success: true,
      data: { secret, qrCode }
    });
  } catch (error: any) {
    logger.error('2FA setup error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: '2FA_SETUP_FAILED',
        message: error.message
      }
    });
  }
});

// Verify and enable 2FA
router.post('/2fa/verify', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const { code } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
    }

    const success = await authService.verifyAndEnableTwoFactor(userId, code);

    if (success) {
      res.json({
        success: true,
        data: { message: 'Two-factor authentication enabled successfully' }
      });
    } else {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CODE',
          message: 'Invalid verification code'
        }
      });
    }
  } catch (error: any) {
    logger.error('2FA verification error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: '2FA_VERIFICATION_FAILED',
        message: error.message
      }
    });
  }
});

// Disable 2FA
router.post('/2fa/disable', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const { password } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
    }

    await authService.disableTwoFactor(userId, password);

    res.json({
      success: true,
      data: { message: 'Two-factor authentication disabled successfully' }
    });
  } catch (error: any) {
    logger.error('2FA disable error:', error);
    res.status(400).json({
      success: false,
      error: {
        code: '2FA_DISABLE_FAILED',
        message: error.message
      }
    });
  }
});

// Get current user
router.get('/me', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
    }

    const { User } = await import('../models');
    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    res.json({
      success: true,
      data: { user }
    });
  } catch (error: any) {
    logger.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message
      }
    });
  }
});

// Get user sessions
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
    }

    const sessions = await authService.getUserSessions(userId);

    res.json({
      success: true,
      data: { sessions }
    });
  } catch (error: any) {
    logger.error('Get sessions error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message
      }
    });
  }
});

// Revoke session
router.delete('/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const { sessionId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
    }

    await authService.revokeSession(userId, sessionId);

    res.json({
      success: true,
      data: { message: 'Session revoked successfully' }
    });
  } catch (error: any) {
    logger.error('Revoke session error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message
      }
    });
  }
});

export default router;
