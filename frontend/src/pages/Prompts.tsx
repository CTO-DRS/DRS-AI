import { useEffect, useState } from 'react';
import { FileText, Plus, Trash2, Wand2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { promptsService, unwrap } from '@/services/api';
import { toast } from 'sonner';

interface Prompt {
  id: string;
  name: string;
  description?: string;
  template: string;
  variables: string[];
  tags: string[];
}

export default function Prompts() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [template, setTemplate] = useState('');

  const [renderVars, setRenderVars] = useState<Record<string, Record<string, string>>>({});
  const [rendered, setRendered] = useState<Record<string, string>>({});
  const [rendering, setRendering] = useState<string | null>(null);

  const loadPrompts = async () => {
    try {
      setIsLoading(true);
      const response = await promptsService.list();
      setPrompts(unwrap(response)?.prompts || []);
    } catch {
      toast.error('Failed to load prompts');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadPrompts(); }, []);

  const create = async () => {
    if (!name.trim() || !template.trim()) {
      toast.error('Name and template are required');
      return;
    }
    try {
      await promptsService.create({ name: name.trim(), template, description });
      toast.success('Prompt saved');
      setName(''); setDescription(''); setTemplate('');
      setDialogOpen(false);
      await loadPrompts();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to create prompt');
    }
  };

  const remove = async (prompt: Prompt) => {
    try {
      await promptsService.remove(prompt.id);
      await loadPrompts();
    } catch {
      toast.error('Failed to delete prompt');
    }
  };

  const render = async (prompt: Prompt) => {
    try {
      setRendering(prompt.id);
      const vars = renderVars[prompt.id] || {};
      const response = await promptsService.render(prompt.id, vars);
      setRendered(prev => ({ ...prev, [prompt.id]: unwrap(response)?.rendered || '' }));
    } catch {
      toast.error('Failed to render prompt');
    } finally {
      setRendering(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Prompt Library</h1>
          <p className="text-muted-foreground mt-2">
            Reusable prompt templates with {'{{variables}}'} — render and copy
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Prompt
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Prompt Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" />
              <Textarea
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                placeholder={'You are a {{role}} assistant. Summarize the following {{topic}}:\n\n{{content}}'}
                className="min-h-[200px] font-mono text-sm"
              />
              <Button onClick={create}>
                <FileText className="w-4 h-4 mr-2" />
                Save Prompt
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading prompts…</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {prompts.map((prompt) => (
            <Card key={prompt.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{prompt.name}</CardTitle>
                    <CardDescription>{prompt.description || 'No description'}</CardDescription>
                  </div>
                  <Button variant="outline" size="icon" className="text-destructive h-8 w-8" onClick={() => remove(prompt)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {prompt.variables?.map((v) => (
                    <Badge key={v} variant="secondary" className="font-mono text-xs">{`{{${v}}}`}</Badge>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto max-h-32 whitespace-pre-wrap">{prompt.template}</pre>

                {prompt.variables?.length > 0 && (
                  <div className="space-y-2">
                    {prompt.variables.map((v) => (
                      <Input
                        key={v}
                        placeholder={v}
                        value={renderVars[prompt.id]?.[v] || ''}
                        onChange={(e) =>
                          setRenderVars(prev => ({
                            ...prev,
                            [prompt.id]: { ...(prev[prompt.id] || {}), [v]: e.target.value }
                          }))
                        }
                        className="h-8 text-sm"
                      />
                    ))}
                  </div>
                )}

                <Button size="sm" variant="outline" onClick={() => render(prompt)} disabled={rendering === prompt.id}>
                  {rendering === prompt.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                  Render
                </Button>

                {rendered[prompt.id] && (
                  <div className="text-sm bg-primary/5 border border-primary/20 rounded-lg p-3 whitespace-pre-wrap">
                    {rendered[prompt.id]}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {!isLoading && prompts.length === 0 && (
            <p className="text-muted-foreground col-span-full">No prompts yet. Create one above.</p>
          )}
        </div>
      )}
    </div>
  );
}
