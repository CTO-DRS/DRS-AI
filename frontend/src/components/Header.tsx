import { Moon, Sun, Bell, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/theme-provider';
import { useAuth } from '@/contexts/AuthContext';

export default function Header() {
  const { theme, setTheme } = useTheme();
  const { logout } = useAuth();

  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6">
      <div>
        <h2 className="text-lg font-semibold">Welcome back</h2>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </Button>

        <Button variant="ghost" size="icon">
          <Bell className="w-5 h-5" />
        </Button>

        <Button variant="ghost" size="icon" onClick={logout}>
          <LogOut className="w-5 h-5" />
        </Button>
      </div>
    </header>
  );
}
