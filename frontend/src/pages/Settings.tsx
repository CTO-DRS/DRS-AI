import { useState } from 'react';
import { User, Shield, Bell, Moon, Globe } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/components/theme-provider';
import { useI18n, LANGS } from '@/i18n';
import { toast } from 'sonner';

export default function Settings() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const { lang, setLang, t } = useI18n();
  const [notifications, setNotifications] = useState(true);

  const handleSaveProfile = () => {
    toast.success(t('settings.profileUpdated'));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('settings.title')}</h1>
        <p className="text-muted-foreground mt-2">{t('settings.subtitle')}</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="w-4 h-4" />
            {t('settings.tabProfile')}
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            {t('settings.tabSecurity')}
          </TabsTrigger>
          <TabsTrigger value="preferences" className="flex items-center gap-2">
            <Bell className="w-4 h-4" />
            {t('settings.tabPreferences')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.profileTitle')}</CardTitle>
              <CardDescription>{t('settings.profileSubtitle')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('settings.username')}</Label>
                  <Input defaultValue={user?.username} />
                </div>
                <div className="space-y-2">
                  <Label>{t('settings.email')}</Label>
                  <Input defaultValue={user?.email} type="email" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t('settings.displayName')}</Label>
                <Input placeholder={t('settings.displayNamePlaceholder')} />
              </div>
              <Button onClick={handleSaveProfile}>{t('settings.saveChanges')}</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.securityTitle')}</CardTitle>
              <CardDescription>{t('settings.securitySubtitle')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t('settings.currentPassword')}</Label>
                <Input type="password" />
              </div>
              <div className="space-y-2">
                <Label>{t('settings.newPassword')}</Label>
                <Input type="password" />
              </div>
              <div className="space-y-2">
                <Label>{t('settings.confirmPassword')}</Label>
                <Input type="password" />
              </div>
              <Button>{t('settings.changePassword')}</Button>

              <div className="pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{t('settings.twoFactor')}</p>
                    <p className="text-sm text-muted-foreground">
                      {user?.twoFactorEnabled ? t('settings.enabled') : t('settings.notEnabled')}
                    </p>
                  </div>
                  <Button variant="outline">
                    {user?.twoFactorEnabled ? t('settings.disable') : t('settings.enable')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.prefsTitle')}</CardTitle>
              <CardDescription>{t('settings.prefsSubtitle')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Moon className="w-5 h-5" />
                  <div>
                    <p className="font-medium">{t('settings.darkMode')}</p>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.darkModeDesc')}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={theme === 'dark'}
                  onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5" />
                  <div>
                    <p className="font-medium">{t('settings.notifications')}</p>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.notificationsDesc')}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={notifications}
                  onCheckedChange={setNotifications}
                />
              </div>

              {/* Real language switcher — wired to I18nProvider (persists + RTL flip) */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5" />
                  <div>
                    <p className="font-medium">{t('settings.language')}</p>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.languageDesc')}
                    </p>
                  </div>
                </div>
                <Select value={lang} onValueChange={(v) => setLang(v as typeof lang)}>
                  <SelectTrigger className="w-40" aria-label={t('settings.language')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        <span aria-hidden="true">{l.flag}</span>
                        <span className="ms-2">{l.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
