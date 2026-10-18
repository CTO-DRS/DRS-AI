import type { User as AuthUser } from '../middleware/authTypes';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
