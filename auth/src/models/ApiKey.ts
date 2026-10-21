import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../database';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/**
 * ApiKey — machine-to-machine authentication (drSai user_api_key_manager parity).
 *
 * Keys look like:  drsk_<43 chars base64url>
 * - Only the SHA-256 hash is stored (bcrypt is intentionally avoided here so
 *   high-frequency gateway validation stays cheap and stateless).
 * - `prefix` (first 12 chars) is kept for display/identification in the UI.
 */

interface ApiKeyAttributes {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  keyHash: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

type ApiKeyCreation = Optional<ApiKeyAttributes, 'id' | 'createdAt' | 'updatedAt' | 'isActive' | 'scopes'>;

class ApiKey extends Model<ApiKeyAttributes, ApiKeyCreation> implements ApiKeyAttributes {
  public id!: string;
  public userId!: string;
  public name!: string;
  public prefix!: string;
  public keyHash!: string;
  public scopes!: string[];
  public isActive!: boolean;
  public lastUsedAt?: Date;
  public expiresAt?: Date;
  public createdAt!: Date;
  public updatedAt!: Date;

  public toJSON(): object {
    const values = { ...this.get() };
    delete (values as any).keyHash;
    return values;
  }
}

ApiKey.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    prefix: {
      type: DataTypes.STRING(16),
      allowNull: false
    },
    keyHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'key_hash'
    },
    scopes: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: ['chat', 'tasks', 'files', 'memory']
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active'
    },
    lastUsedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_used_at'
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expires_at'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    }
  },
  {
    sequelize,
    tableName: 'api_keys',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['key_hash'] },
      { fields: ['user_id'] }
    ]
  }
);

/** Generate a new API key pair (plaintext returned exactly once). */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('base64url');
  const key = `drsk_${raw}`;
  const prefix = key.slice(0, 12);
  const hash = hashApiKey(key);
  return { key, prefix, hash };
}

/** SHA-256 hash used for lookup (fast, constant per key). */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export default ApiKey;
