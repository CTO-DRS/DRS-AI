import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../database';

interface AuditLogAttributes {
  id: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
}

interface AuditLogCreationAttributes extends Optional<AuditLogAttributes, 'id' | 'createdAt'> {}

class AuditLog extends Model<AuditLogAttributes, AuditLogCreationAttributes> implements AuditLogAttributes {
  public id!: string;
  public userId?: string;
  public action!: string;
  public resource!: string;
  public resourceId?: string;
  public details?: Record<string, any>;
  public ipAddress!: string;
  public userAgent!: string;
  public createdAt!: Date;
}

AuditLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'user_id'
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    resource: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    resourceId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'resource_id'
    },
    details: {
      type: DataTypes.JSONB,
      allowNull: true
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
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    }
  },
  {
    sequelize,
    tableName: 'audit_logs',
    timestamps: false,
    underscored: true,
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['action']
      },
      {
        fields: ['resource']
      },
      {
        fields: ['created_at']
      }
    ]
  }
);

export default AuditLog;
