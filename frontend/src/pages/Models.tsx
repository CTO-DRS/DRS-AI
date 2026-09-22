import { useEffect, useState } from 'react';
import { Cpu, Download, Trash2, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { chatService } from '@/services/api';
import { Model } from '@/types';
import { toast } from 'sonner';

export default function Models() {
  const [models, setModels] = useState<Model[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      setIsLoading(true);
      const response = await chatService.getModels();
      setModels(response.data.models);
    } catch (error) {
      toast.error('Failed to load models');
    } finally {
      setIsLoading(false);
    }
  };

  const formatSize = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(2)} GB`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Models</h1>
        <p className="text-muted-foreground mt-2">
          Manage your local AI models
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {models.map((model) => (
          <Card key={model.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                    <Cpu className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{model.name}</CardTitle>
                    <CardDescription>{model.family}</CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{model.description}</p>

              <div className="flex flex-wrap gap-2">
                {model.capabilities.chat && (
                  <Badge variant="secondary">Chat</Badge>
                )}
                {model.capabilities.code && (
                  <Badge variant="secondary">Code</Badge>
                )}
                {model.capabilities.reasoning && (
                  <Badge variant="secondary">Reasoning</Badge>
                )}
                {model.capabilities.vision && (
                  <Badge variant="secondary">Vision</Badge>
                )}
                {model.capabilities.embedding && (
                  <Badge variant="secondary">Embedding</Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Size</p>
                  <p className="font-medium">{formatSize(model.size)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Parameters</p>
                  <p className="font-medium">{model.parameters}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Quantization</p>
                  <p className="font-medium">{model.quantization}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">
                  <Check className="w-4 h-4 mr-2" />
                  Use
                </Button>
                <Button variant="outline" size="sm" className="flex-1">
                  <Download className="w-4 h-4 mr-2" />
                  Update
                </Button>
                <Button variant="outline" size="sm" className="text-destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
