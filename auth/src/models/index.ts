import User from './User';
import Role from './Role';
import Session from './Session';
import AuditLog from './AuditLog';

// Define associations
User.hasMany(Session, { foreignKey: 'userId', as: 'sessions' });
Session.belongsTo(User, { foreignKey: 'userId', as: 'user' });

export { User, Role, Session, AuditLog };
export default { User, Role, Session, AuditLog };
