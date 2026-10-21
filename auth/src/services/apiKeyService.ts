import { User, ApiKey } from '../models';
import { generateApiKey, hashApiKey } from '../models/ApiKey';
import logger from '../utils/logger';

export interface ApiKeyValidationResult {
  valid: boolean;
  userId?: string;
  email?: string;
  username?: string;
  role?: string;
  permissions?: string[];
  scopes?: string[];
  reason?: string;
}

export class ApiKeyService {
  /**
   * Create a new API key. The plaintext key is returned exactly once.
   */
  async createKey(data: {
    userId: string;
    name: string;
    scopes?: string[];
    expiresInDays?: number;
  }): Promise<{ apiKey: ApiKey; key: string }> {
    const { key, prefix, hash } = generateApiKey();

    const apiKey = await ApiKey.create({
      userId: data.userId,
      name: data.name || 'Default key',
      prefix,
      keyHash: hash,
      scopes: data.scopes || ['chat', 'tasks', 'files', 'memory'],
      expiresAt: data.expiresInDays
        ? new Date(Date.now() + data.expiresInDays * 24 * 3600 * 1000)
        : undefined
    } as any);

    logger.info(`API key ${apiKey.id} created for user ${data.userId}`);
    return { apiKey, key };
  }

  async listKeys(userId: string): Promise<ApiKey[]> {
    return ApiKey.findAll({ where: { userId }, order: [['createdAt', 'DESC']] });
  }

  async revokeKey(keyId: string, userId: string, isAdmin: boolean): Promise<boolean> {
    const apiKey = await ApiKey.findByPk(keyId);
    if (!apiKey) return false;
    if (apiKey.userId !== userId && !isAdmin) {
      throw Object.assign(new Error('Access denied'), { statusCode: 403 });
    }
    await apiKey.update({ isActive: false } as any);
    return true;
  }

  async deleteKey(keyId: string, userId: string, isAdmin: boolean): Promise<boolean> {
    const apiKey = await ApiKey.findByPk(keyId);
    if (!apiKey) return false;
    if (apiKey.userId !== userId && !isAdmin) {
      throw Object.assign(new Error('Access denied'), { statusCode: 403 });
    }
    await apiKey.destroy();
    return true;
  }

  /**
   * Validate a plaintext API key. Called by the Gateway on every
   * API-key-authenticated request — deliberately fast (single indexed
   * lookup + SHA-256) and returns the user context to embed downstream.
   */
  async validateKey(key: string): Promise<ApiKeyValidationResult> {
    if (!key || !key.startsWith('drsk_')) {
      return { valid: false, reason: 'Malformed API key' };
    }

    const keyHash = hashApiKey(key);
    const apiKey = await ApiKey.findOne({ where: { keyHash } });

    if (!apiKey) return { valid: false, reason: 'Unknown API key' };
    if (!apiKey.isActive) return { valid: false, reason: 'API key revoked' };
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return { valid: false, reason: 'API key expired' };
    }

    const user = await User.findByPk(apiKey.userId);
    if (!user || !user.isActive) {
      return { valid: false, reason: 'Owner account is inactive' };
    }

    // Fire-and-forget last-used update
    apiKey.update({ lastUsedAt: new Date() } as any).catch(() => {});

    return {
      valid: true,
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      permissions: ['*'], // role permissions are resolved at gateway level
      scopes: apiKey.scopes
    };
  }
}

export default new ApiKeyService();
