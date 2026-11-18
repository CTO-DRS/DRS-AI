declare global {
  namespace Express {
    interface Request {
      /** Gateway-injected authenticated user id (set by requireAuth). */
      userId?: string;
      /** Gateway-injected user role, e.g. "user" | "admin" (set by requireAuth). */
      userRole?: string;
    }
  }
}

export {};
