import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DOCKER_API_URL,
  dockerCandidates,
  getApiUrl,
  getApiUrlSource,
  hasCustomApiUrl,
  normalizeApiUrl,
  probeGateway,
  setApiUrl,
  setApiUrlSource,
} from '@/services/apiUrl';
import { useT } from '@/i18n';
import { Check, Globe, Loader2, RefreshCw, Server } from 'lucide-react';

/**
 * Shown before anything else: the frontend is deployed as a static site and
 * needs a reachable backend. The docker-compose deployment is the default
 * option and is probed automatically on load (the origin the UI is served
 * from first — the stack's nginx proxies /api — then the published gateway
 * port); a custom address can be entered for remote servers. The chosen
 * address and its source are persisted to localStorage.
 */
export default function ServerGate({ children }: { children: ReactNode }) {
  const t = useT();
  const [status, setStatus] = useState<'checking' | 'ok' | 'down'>('checking');
  const [mode, setMode] = useState<'docker' | 'custom'>(() =>
    getApiUrlSource() === 'custom' ? 'custom' : 'docker',
  );
  const [url, setUrl] = useState(getApiUrl());
  const [testing, setTesting] = useState(false);
  const [failed, setFailed] = useState(false);

  /** Probe every docker-compose address; connect to the first one that answers. */
  const tryDocker = useCallback(async (): Promise<boolean> => {
    for (const candidate of dockerCandidates()) {
      if (await probeGateway(candidate)) {
        setApiUrlSource('docker');
        if (candidate !== getApiUrl()) {
          setApiUrl(candidate);
          window.location.reload();
        }
        return true;
      }
    }
    return false;
  }, []);

  const autoConnect = useCallback(async () => {
    setStatus('checking');
    setFailed(false);
    // a previously saved address always wins if it still answers
    if (hasCustomApiUrl() && (await probeGateway(getApiUrl()))) {
      setStatus('ok');
      return;
    }
    if (await tryDocker()) {
      setStatus('ok');
      return;
    }
    setFailed(true);
    setStatus('down');
  }, [tryDocker]);

  useEffect(() => {
    void autoConnect();
  }, [autoConnect]);

  const selectDocker = () => {
    setMode('docker');
    setUrl(DOCKER_API_URL);
  };

  const selectCustom = () => {
    setMode('custom');
    setUrl(getApiUrl());
  };

  const handleConnect = async () => {
    setTesting(true);
    setFailed(false);
    let ok = false;
    try {
      if (mode === 'docker') {
        ok = await tryDocker();
      } else if (url.trim()) {
        const candidate = normalizeApiUrl(url);
        ok = await probeGateway(candidate, 6000);
        if (ok) {
          setApiUrl(candidate);
          setApiUrlSource('custom');
          window.location.reload();
          return;
        }
      }
    } finally {
      setTesting(false);
    }
    if (!ok) setFailed(true);
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
          <div className="grid gap-2" role="radiogroup" aria-label={t('server.urlLabel')}>
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'docker'}
              onClick={selectDocker}
              className={`flex w-full items-start gap-3 rounded-lg border p-3 text-start transition-colors ${
                mode === 'docker' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
              }`}
            >
              <Server
                className={`mt-0.5 h-4 w-4 shrink-0 ${mode === 'docker' ? 'text-primary' : 'text-muted-foreground'}`}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {t('server.dockerOption')}
                  {mode === 'docker' && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{t('server.dockerHint')}</span>
                <code dir="ltr" className="mt-1 block truncate text-[11px] text-muted-foreground">
                  {dockerCandidates().join('  ·  ')}
                </code>
              </span>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={mode === 'custom'}
              onClick={selectCustom}
              className={`flex w-full items-start gap-3 rounded-lg border p-3 text-start transition-colors ${
                mode === 'custom' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
              }`}
            >
              <Globe
                className={`mt-0.5 h-4 w-4 shrink-0 ${mode === 'custom' ? 'text-primary' : 'text-muted-foreground'}`}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {t('server.customOption')}
                  {mode === 'custom' && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{t('server.customHint')}</span>
              </span>
            </button>
          </div>

          {mode === 'custom' && (
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
              <p className="text-xs text-muted-foreground">{t('server.httpsNote')}</p>
            </div>
          )}

          {failed && (
            <p className="text-sm text-destructive" role="alert">
              {t('server.unreachable')}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={handleConnect}
              disabled={testing || (mode === 'custom' && !url.trim())}
            >
              {testing ? (
                <>
                  <Loader2 className="w-4 h-4 me-2 animate-spin" />
                  {t('server.testing')}
                </>
              ) : mode === 'docker' ? (
                t('server.autoConnect')
              ) : (
                t('server.testAndSave')
              )}
            </Button>
            <Button variant="outline" size="icon" onClick={() => void autoConnect()} aria-label={t('server.retry')}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
