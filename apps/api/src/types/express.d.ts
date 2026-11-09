import type { CustomerProfile, Role } from '../generated/client/client.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  profile: CustomerProfile | null;
  sessionId: string;
  emailVerified: boolean;
  hasPassword: boolean;
  reauthenticatedAt: Date | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
