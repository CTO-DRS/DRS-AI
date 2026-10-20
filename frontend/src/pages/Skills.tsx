import { useEffect, useState } from 'react';
import { Sparkles, Upload, Trash2, Power, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { skillsService, unwrap } from '@/services/api';
import { toast } from 'sonner';

interface Skill {
  id: string;
  meta: { name: string; description: string; version: string; tags: string[]; tools: string[] };
  enabled: boolean;
  source: string;
  body?: string;
}

export default function Skills() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newSkill, setNewSkill] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadSkills = async () => {
    try {
      setIsLoading(true);
      const response = await skillsService.marketplace();
      setSkills(unwrap(response)?.skills || []);
    } catch (error) {
      toast.error('Failed to load skills');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadSkills(); }, []);

  const toggle = async (skill: Skill) => {
    try {
      await skillsService.toggle(skill.id, !skill.enabled);
      await loadSkills();
    } catch {
      toast.error('Failed to update skill');
    }
  };

  const remove = async (skill: Skill) => {
    try {
      await skillsService.remove(skill.id);
      toast.success(`Skill ${skill.meta.name} removed`);
      await loadSkills();
    } catch {
      toast.error('Failed to remove skill');
    }
  };

  const install = async () => {
    try {
      await skillsService.install(newSkill);
      toast.success('Skill installed');
      setNewSkill('');
      setDialogOpen(false);
      await loadSkills();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Invalid SKILL.md content');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Skills</h1>
          <p className="text-muted-foreground mt-2">
            SKILL.md library — inject expert instructions into agent teams
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Upload className="w-4 h-4 mr-2" />
              Install Skill
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Install a SKILL.md</DialogTitle>
            </DialogHeader>
            <Textarea
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              placeholder={`---\nname: "my-skill"\ndescription: "What this skill teaches the agent"\nversion: "1.0.0"\ntags: ["example"]\ntools: ["web_search"]\n---\n\n# My Skill\n(instructions for the agent)`}
              className="min-h-[300px] font-mono text-sm"
            />
            <Button onClick={install} disabled={!newSkill.trim()}>
              <Check className="w-4 h-4 mr-2" />
              Install
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading skills…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {skills.map((skill) => (
            <Card key={skill.id} className={skill.enabled ? '' : 'opacity-60'}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{skill.meta.name}</CardTitle>
                      <CardDescription>v{skill.meta.version} · {skill.source}</CardDescription>
                    </div>
                  </div>
                  <Switch checked={skill.enabled} onCheckedChange={() => toggle(skill)} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{skill.meta.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  {skill.meta.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">{tag}</Badge>
                  ))}
                  {skill.meta.tools.map((tool) => (
                    <Badge key={tool} variant="outline">{tool}</Badge>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="text-destructive w-full" onClick={() => remove(skill)}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Remove
                </Button>
              </CardContent>
            </Card>
          ))}
          {skills.length === 0 && (
            <p className="text-muted-foreground col-span-full">No skills installed yet. Install one above.</p>
          )}
        </div>
      )}
    </div>
  );
}
