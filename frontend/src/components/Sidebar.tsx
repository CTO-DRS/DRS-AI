import { NavLink } from 'react-router-dom';
import { 
  MessageSquare, 
  Users,
  FolderOpen, 
  FileText, 
  Mic, 
  Cpu, 
  BarChart3, 
  Settings, 
  Shield,
  Sparkles
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useT } from '@/i18n';

const navItems = [
  { path: '/chat', icon: MessageSquare, labelKey: 'nav.chat' },
  { path: '/agents', icon: Users, labelKey: 'nav.agents' },
  { path: '/projects', icon: FolderOpen, labelKey: 'nav.projects' },
  { path: '/files', icon: FileText, labelKey: 'nav.files' },
  { path: '/voice', icon: Mic, labelKey: 'nav.voice' },
  { path: '/models', icon: Cpu, labelKey: 'nav.models' },
  { path: '/analytics', icon: BarChart3, labelKey: 'nav.analytics' },
  { path: '/settings', icon: Settings, labelKey: 'nav.settings' },
];

export default function Sidebar() {
  const { user } = useAuth();
  const t = useT();
  const isAdmin = user?.role === 'admin';

  return (
    <aside className="w-64 bg-card border-e border-border flex flex-col">
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg">DRS AI</h1>
            <p className="text-xs text-muted-foreground">Enterprise AI Platform</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span>{t(item.labelKey)}</span>
          </NavLink>
        ))}

        {isAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`
            }
          >
            <Shield className="w-5 h-5" />
            <span>{t('nav.admin')}</span>
          </NavLink>
        )}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.username}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
