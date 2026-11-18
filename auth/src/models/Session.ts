import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../database';

interface SessionAttributes {
  id: string;
  userId: string;
  token: string;
  ipAddress: string;
  userAgent: string;
  expiresAt: Date;
  createdAt: Date;
  lastActivityAt: Date;
}

interface SessionCreationAttributes extends Optional<SessionAttributes, 'id' | 'createdAt' | 'lastActivityAt'> {}

class Session extends Model<SessionAttributes, SessionCreationAttributes> implements SessionAttributes {
  public id!: string;
  public userId!: string;
  public token!: string;
  public ipAddress!: string;
  public userAgent!: string;
  public expiresAt!: Date;
  public createdAt!: Date;
  public lastActivityAt!: Date;

  /**
   * SECURITY (V2): the raw refresh-token JWT is stored in `token` for
   * revocation lookups, but it must NEVER leave the server. This override
   * strips it (and the owner reference) from every serialized response,
   * including GET /sessions.
   */
  public toJSON(): Record<string, unknown> {
    const values = { ...this.get() } as Record<string, unknown>;
    delete values.token;
    delete values.user_id;
    delete values.userId;
    return values;
  }
}

Session.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    token: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: false,
      field: 'ip_address'
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'user_agent'
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    lastActivityAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'last_activity_at'
    }
  },
  {
    sequelize,
    tableName: 'sessions',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['token']
      },
      {
        fields: ['expires_at']
      }
    ]
  }
);

export default Session;
