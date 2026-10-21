import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Plus,
  Trash2,
  Loader2,
  Search,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { knowledgeService } from '@/services/api';
import { useT } from '@/i18n';
import { toast } from 'sonner';

/* ---------- Minimal shapes (backend envelope { success, data }) ---------- */

interface KnowledgeDocMeta {
  id: string;
  title: string;
  source?: string;
  chunkCount?: number;
  sizeBytes?: number;
  isEnabled?: boolean;
  createdAt?: string;
}

interface SearchHit {
  docId: string;
  docTitle: string;
  chunkIndex: number;
  text: string;
  score: number;
}

function formatBytes(bytes?: number): string {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function Knowledge() {
  const t = useT();

  /* ---------------- State ---------------- */
  const [docs, setDocs] = useState<KnowledgeDocMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [creating, setCreating] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await knowledgeService.list();
      setDocs(res.data?.data?.docs ?? res.data?.docs ?? []);
    } catch {
      toast.error(t('knowledge.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- mount-time data fetch; loader owns its loading flag */
    loadDocs();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadDocs]);

  /* ---------------- Actions ---------------- */

  const handleIngest = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    setCreating(true);
    try {
      await knowledgeService.ingest({
        title: newTitle.trim(),
        content: newContent,
        source: 'paste',
      });
      setAddOpen(false);
      setNewTitle('');
      setNewContent('');
      await loadDocs();
      toast.success(t('knowledge.added'));
    } catch {
      toast.error(t('knowledge.actionFailed'));
    } finally {
      setCreating(false);
    }
  };

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) {
      setHits(null);
      return;
    }
    setSearching(true);
    try {
      const res = await knowledgeService.search(q, 6);
      setHits(res.data?.data?.results ?? res.data?.results ?? []);
    } catch {
      toast.error(t('knowledge.actionFailed'));
    } finally {
      setSearching(false);
    }
  };

  const handleToggle = async (doc: KnowledgeDocMeta, enabled: boolean) => {
    setBusyId(doc.id);
    try {
      await knowledgeService.toggle(doc.id, enabled);
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, isEnabled: enabled } : d)));
    } catch {
      toast.error(t('knowledge.actionFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      await knowledgeService.delete(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch {
      toast.error(t('knowledge.actionFailed'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="w-6 h-6" />
            {t('knowledge.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('knowledge.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={loadDocs} title={t('common.refresh')}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 me-2" />
            {t('knowledge.add')}
          </Button>
        </div>
      </div>

      {/* Search / retrieval preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('knowledge.searchTitle')}</CardTitle>
          <CardDescription>{t('knowledge.searchHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={t('knowledge.searchPlaceholder')}
            />
            <Button onClick={handleSearch} disabled={searching || !searchQuery.trim()}>
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>
          {hits !== null && (
            <ScrollArea className="max-h-72">
              {hits.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">{t('knowledge.noResults')}</p>
              ) : (
                <div className="space-y-2">
                  {hits.map((hit, i) => (
                    <div key={`${hit.docId}-${hit.chunkIndex}-${i}`} className="border rounded-lg p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold flex items-center gap-1.5">
                          <FileText className="w-3 h-3" />
                          {hit.docTitle}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {hit.score.toFixed(2)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6">{hit.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Documents */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('knowledge.docsTitle')}</CardTitle>
          <CardDescription>{t('knowledge.docsHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : docs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">{t('knowledge.empty')}</p>
          ) : (
            docs.map((doc) => (
              <div key={doc.id} className="border rounded-lg p-3 flex items-center gap-3">
                <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('knowledge.chunks')}: {doc.chunkCount ?? '—'} · {formatBytes(doc.sizeBytes)}
                    {doc.createdAt ? ` · ${new Date(doc.createdAt).toLocaleDateString()}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant={doc.isEnabled ? 'default' : 'secondary'} className="text-xs">
                    {doc.isEnabled ? t('knowledge.enabled') : t('knowledge.disabled')}
                  </Badge>
                  <Switch
                    checked={Boolean(doc.isEnabled)}
                    disabled={busyId === doc.id}
                    onCheckedChange={(v) => handleToggle(doc, v)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-500 hover:text-red-600"
                    disabled={busyId === doc.id}
                    title={t('knowledge.delete')}
                    onClick={() => handleDelete(doc.id)}
                  >
                    {busyId === doc.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Add document dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('knowledge.add')}</DialogTitle>
            <DialogDescription>{t('knowledge.addHint')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('knowledge.docTitle')}</Label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={t('knowledge.docTitlePlaceholder')}
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('knowledge.docContent')}</Label>
              <Textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder={t('knowledge.docContentPlaceholder')}
                rows={10}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                {formatBytes(new TextEncoder().encode(newContent).length)}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleIngest} disabled={creating || !newTitle.trim() || !newContent.trim()}>
              {creating && <Loader2 className="w-4 h-4 me-2 animate-spin" />}
              {t('knowledge.ingest')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
