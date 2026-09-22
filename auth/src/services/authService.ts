import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { User, Session, AuditLog, Role } from '../models';
import { 
  LoginCredentials, 
  RegisterData, 
  AuthTokens, 
  TokenPayload 
} from '../types';
import logger from '../utils/logger';
import redis from '../utils/redis';

const JWT_SECRET = process.env.JWT_SECRET || 'drs-secret-key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'drs-refresh-secret';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const ACCESS_TOKEN_EXPIRY_SECONDS = 900; // 15 minutes
const REFRESH_TOKEN_EXPIRY_SECONDS = 604800; // 7 days

export class AuthService {
  async register(data: RegisterData, ipAddress: string, userAgent: string): Promise<{ user: User; tokens: AuthTokens }> {
    const existingUser = await User.findOne({
      where: {
        $or: [
          { email: data.email },
          { username: data.username }
        ]
      }
    });

    if (existingUser) {
      throw new Error('User with this email or username already exists');
    }

    const user = await User.create({
      id: uuidv4(),
      email: data.email,
      username: data.username,
      passwordHash: data.password,
      role: 'user',
      isActive: true,
      isEmailVerified: false,
      twoFactorEnabled: false
    });

    await this.logAuditEvent(null, 'USER_REGISTERED', 'user', user.id, { email: user.email }, ipAddress, userAgent);

    const tokens = await this.generateTokens(user);
    
    return { user, tokens };
  }

  async login(credentials: LoginCredentials, ipAddress: string, userAgent: string): Promise<{ user: User; tokens: AuthTokens }> {
    const user = await User.findOne({
      where: { email: credentials.email }
    });

    if (!user || !user.isActive) {
      throw new Error('Invalid credentials');
    }

    const isValidPassword = await user.verifyPassword(credentials.password);
    if (!isValidPassword) {
      await this.logAuditEvent(user.id, 'LOGIN_FAILED', 'user', user.id, { reason: 'invalid_password' }, ipAddress, userAgent);
      throw new Error('Invalid credentials');
    }

    // Check 2FA if enabled
    if (user.twoFactorEnabled) {
      if (!credentials.twoFactorCode) {
        throw new Error('Two-factor authentication code required');
      }

      const isValidToken = speakeasy.totp.verify({
        secret: user.twoFactorSecret!,
        encoding: 'base32',
        token: credentials.twoFactorCode,
        window: 1
      });

      if (!isValidToken) {
        await this.logAuditEvent(user.id, '2FA_FAILED', 'user', user.id, {}, ipAddress, userAgent);
        throw new Error('Invalid two-factor authentication code');
      }
    }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    const tokens = await this.generateTokens(user, ipAddress, userAgent);

    await this.logAuditEvent(user.id, 'LOGIN_SUCCESS', 'user', user.id, {}, ipAddress, userAgent);

    return { user, tokens };
  }

  async logout(userId: string, token: string): Promise<void> {
    // Invalidate token in Redis
    await redis.setex(`blacklist:token:${token}`, ACCESS_TOKEN_EXPIRY_SECONDS, '1');
    
    // Remove session
    await Session.destroy({ where: { token } });

    logger.info(`User ${userId} logged out`);
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    try {
      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as TokenPayload;
      
      // Check if token is blacklisted
      const isBlacklisted = await redis.get(`blacklist:refresh:${refreshToken}`);
      if (isBlacklisted) {
        throw new Error('Refresh token has been revoked');
      }

      const user = await User.findByPk(decoded.userId);
      if (!user || !user.isActive) {
        throw new Error('User not found or inactive');
      }

      // Blacklist old refresh token
      await redis.setex(`blacklist:refresh:${refreshToken}`, REFRESH_TOKEN_EXPIRY_SECONDS, '1');

      return this.generateTokens(user);
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  async generateTokens(user: User, ipAddress?: string, userAgent?: string): Promise<AuthTokens> {
    const role = await Role.findOne({ where: { name: user.role } });
    const permissions = role?.permissions || [];

    const accessTokenPayload: Omit<TokenPayload, 'iat' | 'exp'> = {
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      permissions,
      type: 'access'
    };

    const refreshTokenPayload: Omit<TokenPayload, 'iat' | 'exp'> = {
      ...accessTokenPayload,
      type: 'refresh'
    };

    const accessToken = jwt.sign(accessTokenPayload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
    const refreshToken = jwt.sign(refreshTokenPayload, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });

    // Store session if IP and UA provided
    if (ipAddress && userAgent) {
      await Session.create({
        id: uuidv4(),
        userId: user.id,
        token: refreshToken,
        ipAddress,
        userAgent,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_SECONDS * 1000)
      });
    }

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
      tokenType: 'Bearer'
    };
  }

  async setupTwoFactor(userId: string): Promise<{ secret: string; qrCode: string }> {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const secret = speakeasy.generateSecret({
      name: `DRS AI:${user.email}`,
      length: 32
    });

    user.twoFactorSecret = secret.base32;
    await user.save();

    const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

    return { secret: secret.base32, qrCode };
  }

  async verifyAndEnableTwoFactor(userId: string, code: string): Promise<boolean> {
    const user = await User.findByPk(userId);
    if (!user || !user.twoFactorSecret) {
      throw new Error('Two-factor setup not initiated');
    }

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 1
    });

    if (isValid) {
      user.twoFactorEnabled = true;
      await user.save();
      return true;
    }

    return false;
  }

  async disableTwoFactor(userId: string, password: string): Promise<void> {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const isValidPassword = await user.verifyPassword(password);
    if (!isValidPassword) {
      throw new Error('Invalid password');
    }

    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    await user.save();
  }

  async validateToken(token: string): Promise<TokenPayload | null> {
    try {
      // Check blacklist
      const isBlacklisted = await redis.get(`blacklist:token:${token}`);
      if (isBlacklisted) {
        return null;
      }

      const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
      return decoded;
    } catch (error) {
      return null;
    }
  }

  async getUserSessions(userId: string): Promise<Session[]> {
    return Session.findAll({
      where: { userId },
      order: [['lastActivityAt', 'DESC']]
    });
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await Session.findOne({
      where: { id: sessionId, userId }
    });

    if (session) {
      await redis.setex(`blacklist:refresh:${session.token}`, REFRESH_TOKEN_EXPIRY_SECONDS, '1');
      await session.destroy();
    }
  }

  private async logAuditEvent(
    userId: string | null,
    action: string,
    resource: string,
    resourceId?: string,
    details?: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    try {
      await AuditLog.create({
        id: uuidv4(),
        userId: userId || undefined,
        action,
        resource,
        resourceId,
        details,
        ipAddress: ipAddress || 'unknown',
        userAgent: userAgent || 'unknown'
      });
    } catch (error) {
      logger.error('Failed to create audit log:', error);
    }
  }
}

export default new AuthService();
