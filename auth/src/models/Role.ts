import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../database';

interface RoleAttributes {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface RoleCreationAttributes extends Optional<RoleAttributes, 'id' | 'createdAt' | 'updatedAt' | 'isSystem'> {}

class Role extends Model<RoleAttributes, RoleCreationAttributes> implements RoleAttributes {
  public id!: string;
  public name!: string;
  public description?: string;
  public permissions!: string[];
  public isSystem!: boolean;
  public createdAt!: Date;
  public updatedAt!: Date;
}

Role.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    permissions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: []
    },
    isSystem: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_system'
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
    tableName: 'roles',
    timestamps: true,
    underscored: true
  }
);

export default Role;
