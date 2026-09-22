import { useState, useCallback } from 'react';
import { Upload, FileText, X, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fileService } from '@/services/api';
import { toast } from 'sonner';

export default function Files() {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      await uploadFile(file);
    }
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      await uploadFile(file);
    }
  };

  const uploadFile = async (file: File) => {
    try {
      setIsUploading(true);
      const response = await fileService.upload(file);
      setUploadedFiles(prev => [...prev, response.data]);
      toast.success(`Uploaded ${file.name}`);
    } catch (error) {
      toast.error(`Failed to upload ${file.name}`);
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Files</h1>
        <p className="text-muted-foreground mt-2">
          Upload and process documents for AI analysis
        </p>
      </div>

      <Card
        className={`border-2 border-dashed ${
          isDragging ? 'border-primary bg-primary/5' : 'border-border'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <CardContent className="p-12">
          <div className="text-center">
            <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              Drag and drop files here
            </h3>
            <p className="text-muted-foreground mb-4">
              or click to browse (PDF, DOCX, TXT, CSV)
            </p>
            <input
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.csv"
              onChange={handleFileSelect}
              className="hidden"
              id="file-input"
            />
            <label htmlFor="file-input">
              <Button variant="outline" asChild disabled={isUploading}>
                <span>
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    'Browse Files'
                  )}
                </span>
              </Button>
            </label>
          </div>
        </CardContent>
      </Card>

      {uploadedFiles.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Uploaded Files</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {uploadedFiles.map((file, index) => (
              <Card key={index}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="w-8 h-8 text-blue-500" />
                      <div>
                        <p className="font-medium">{file.originalName}</p>
                        <p className="text-sm text-muted-foreground">
                          {(file.size / 1024).toFixed(2)} KB
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFile(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  {file.processed && (
                    <div className="mt-4 p-3 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        {file.processed.text.substring(0, 200)}...
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
