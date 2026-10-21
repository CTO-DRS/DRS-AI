import { Moon, Sun, Bell, LogOut, Globe, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/components/theme-provider';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n, LANGS } from '@/i18n';

export default function Header() {
  const { theme, setTheme } = useTheme();
  const { logout } = useAuth();
  const { lang, setLang, t } = useI18n();

  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6">
      <div>
        <h2 className="text-lg font-semibold">{t('header.welcome')}</h2>
      </div>

      <div className="flex items-center gap-2">
        {/* Language switcher (ar / en / fr / de, RTL-aware) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              title={t('common.language')}
              aria-label={t('common.language')}
            >
              <Globe className="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuLabel>{t('common.language')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {LANGS.map((l) => (
              <DropdownMenuItem key={l.value} onClick={() => setLang(l.value)}>
                <span aria-hidden="true">{l.flag}</span>
                <span className="ms-2">{l.label}</span>
                {l.value === lang && <Check className="w-4 h-4 ms-auto text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          title={t('header.toggleTheme')}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </Button>

        <Button variant="ghost" size="icon" title={t('header.notifications')}>
          <Bell className="w-5 h-5" />
        </Button>

        <Button variant="ghost" size="icon" title={t('auth.logout')} onClick={logout}>
          <LogOut className="w-5 h-5" />
        </Button>
      </div>
    </header>
  );
}
