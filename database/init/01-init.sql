-- Initialize DRS AI Database

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- Create default roles
INSERT INTO roles (id, name, description, permissions, is_system) VALUES
  (uuid_generate_v4(), 'admin', 'System Administrator', '["*"]', true),
  (uuid_generate_v4(), 'user', 'Standard User', '["chat:read", "chat:write", "files:read", "files:write", "memory:read", "memory:write"]', true),
  (uuid_generate_v4(), 'guest', 'Guest User', '["chat:read", "chat:write"]', true)
ON CONFLICT (name) DO NOTHING;

-- Create default admin user (password: admin123)
-- In production, change this immediately!
INSERT INTO users (id, email, username, password_hash, role, is_active, is_email_verified)
SELECT 
  uuid_generate_v4(),
  'admin@drs.ai',
  'admin',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKyNiAYMyzJ/I2m',
  'admin',
  true,
  true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin');
