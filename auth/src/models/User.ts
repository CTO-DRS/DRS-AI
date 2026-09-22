import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../database';
import bcrypt from 'bcryptjs';

interface UserAttributes {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  role: string;
  isActive: boolean;
  isEmailVerified: boolean;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'createdAt' | 'updatedAt' | 'isActive' | 'isEmailVerified' | 'twoFactorEnabled'> {}

class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  public id!: string;
  public email!: string;
  public username!: string;
  public passwordHash!: string;
  public role!: string;
  public isActive!: boolean;
  public isEmailVerified!: boolean;
  public twoFactorEnabled!: boolean;
  public twoFactorSecret?: string;
  public lastLoginAt?: Date;
  public createdAt!: Date;
  public updatedAt!: Date;

  public async verifyPassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.passwordHash);
  }

  public async setPassword(password: string): Promise<void> {
    this.passwordHash = await bcrypt.hash(password, 12);
  }

  public toJSON(): object {
    const values = { ...this.get() };
    delete (values as any).passwordHash;
    delete (values as any).twoFactorSecret;
    return values;
  }
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      validate: {
        len: [3, 50],
        isAlphanumeric: true
      }
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'password_hash'
    },
    role: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'user'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active'
    },
    isEmailVerified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_email_verified'
    },
    twoFactorEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'two_factor_enabled'
    },
    twoFactorSecret: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'two_factor_secret'
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_login_at'
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
    tableName: 'users',
    timestamps: true,
    underscored: true,
    hooks: {
      beforeCreate: async (user) => {
        if (user.passwordHash) {
          user.passwordHash = await bcrypt.hash(user.passwordHash, 12);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('passwordHash')) {
          user.passwordHash = await bcrypt.hash(user.passwordHash, 12);
        }
      }
    }
  }
);

export default User;
