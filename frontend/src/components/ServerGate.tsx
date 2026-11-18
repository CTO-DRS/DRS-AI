import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { gatewayOrigin, getApiUrl, normalizeApiUrl, setApiUrl } from '@/services/apiUrl';
import { useT } from '@/i18n';
import { Loader2, Server, RefreshCw } from 'lucide-react';

/**
 * Shown before anything else: the frontend is deployed as a static site and
 * needs a reachable backend. If the configured gateway does not answer
 * /health, the user gets a screen to enter their server address (persisted to
 * localStorage) instead of a cascade of failed requests.
 */
export default function ServerGate({ children }: { children: ReactNode }) {
  const t = useT();
  const [status, setStatus] = useState<'checking' | 'ok' | 'down'>('checking');
  const [url, setUrl] = useState(getApiUrl());
  const [testing, setTesting] = useState(false);
  const [failed, setFailed] = useState(false);

  const probe = useCallback(async (candidate: string, signal: AbortSignal): Promise<boolean> => {
    const res = await fetch(`${gatewayOrigin(candidate)}/health`, { signal });
    return res.ok;
  }, []);

  const checkCurrent = useCallback(async () => {
    setStatus('checking');
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const ok = await probe(getApiUrl(), ctrl.signal);
      clearTimeout(timer);
      setStatus(ok ? 'ok' : 'down');
    } catch {
      setStatus('down');
    }
  }, [probe]);

  useEffect(() => {
    checkCurrent();
  }, [checkCurrent]);

  const handleConnect = async () => {
    if (!url.trim()) return;
    setTesting(true);
    setFailed(false);
    const candidate = normalizeApiUrl(url);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const ok = await probe(candidate, ctrl.signal);
      clearTimeout(timer);
      if (ok) {
        setApiUrl(candidate);
        window.location.reload();
        return;
      }
    } catch {
      // fall through to the failure message
    }
    setFailed(true);
    setTesting(false);
  };

  if (status === 'ok') {
    return <>{children}</>;
  }

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background to-muted gap-3 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p>{t('server.checking')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center">
              <Server className="w-8 h-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-xl">{t('server.title')}</CardTitle>
          <CardDescription>{t('server.desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="server-url">{t('server.urlLabel')}</Label>
            <Input
              id="server-url"
              type="text"
              inputMode="url"
              placeholder={t('server.placeholder')}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground">
              {t('server.current')}: <code dir="ltr">{getApiUrl()}</code>
            </p>
          </div>

          {failed && (
            <p className="text-sm text-destructive" role="alert">
              {t('server.unreachable')}
            </p>
          )}

          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleConnect} disabled={testing || !url.trim()}>
              {testing ? (
                <>
                  <Loader2 className="w-4 h-4 me-2 animate-spin" />
                  {t('server.testing')}
                </>
              ) : (
                t('server.testAndSave')
              )}
            </Button>
            <Button variant="outline" size="icon" onClick={checkCurrent} aria-label={t('server.retry')}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
