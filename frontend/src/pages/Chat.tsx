import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Send,
  Plus,
  Trash2,
  Bot,
  User,
  Square,
  Loader2,
  Copy,
  Check,
  Download,
  Mic,
  RefreshCw,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useChat } from '@/contexts/ChatContext';
import { useT } from '@/i18n';
import { MarkdownMessage } from '@/components/chat/MarkdownMessage';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { voiceService } from '@/services/api';

export default function Chat() {
  const {
    conversations,
    messages,
    isLoading,
    isStreaming,
    selectedModel,
    availableModels,
    loadConversations,
    loadConversation,
    sendMessage,
    regenerate,
    stop,
    createConversation,
    deleteConversation,
    setSelectedModel,
    loadModels
  } = useChat();

  const t = useT();
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    loadConversations();
    loadModels();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize the textarea up to ~6 rows.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const content = input;
    setInput('');
    await sendMessage(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = useCallback(async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast.error(t('chat.copyFailed'));
    }
  }, [t]);

  const handleExport = useCallback(() => {
    if (messages.length === 0) return;
    try {
      const lines = [
        `# DRS AI — ${t('chat.exportChat')}`,
        `_${format(new Date(), 'PPP p')}_`,
        '',
        ...messages.map((m) =>
          m.role === 'user' ? `**${'👤 User'}:**\n\n${m.content}\n` : `**🤖 Assistant:**\n\n${m.content}\n`
        ),
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `drs-chat-${format(new Date(), 'yyyy-MM-dd-HHmm')}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t('chat.exportFailed'));
    }
  }, [messages, t]);

  /* ------------------------- Voice input (STT) ------------------------- */

  const stopRecording = useCallback(() => {
    try {
      mediaRecorderRef.current?.stop();
    } catch { /* already stopped */ }
    // Release the microphone immediately.
    mediaRecorderRef.current?.stream?.getTracks().forEach((track) => track.stop());
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const audioChunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        try {
          const response = await voiceService.transcribe(audioBlob);
          const text: string = response.data?.text ?? response.data?.data?.text ?? '';
          if (text) {
            setInput((prev) => (prev ? `${prev} ${text}` : text));
          } else {
            toast.error(t('chat.transcribeFailed'));
          }
        } catch {
          toast.error(t('chat.transcribeFailed'));
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      toast.error(t('chat.micDenied'));
    }
  }, [t]);

  useEffect(() => () => stopRecording(), [stopRecording]);

  const suggestions = [t('chat.sugg1'), t('chat.sugg2'), t('chat.sugg3'), t('chat.sugg4')];
  const filteredConversations = conversations.filter((conv) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (conv.title || '').toLowerCase().includes(q);
  });
  // Regenerate is offered on the trailing assistant reply when idle.
  const lastMessage = messages[messages.length - 1];
  const canRegenerate = !isStreaming && !isLoading && lastMessage?.role === 'assistant' && !!lastMessage.content;

  return (
    <div className="flex h-[calc(100vh-8rem)]">
      {/* Conversations Sidebar */}
      <div className="w-64 border-e border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border space-y-2">
          <Button onClick={createConversation} className="w-full">
            <Plus className="w-4 h-4 me-2" />
            {t('chat.newChat')}
          </Button>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('chat.searchConversations')}
              className="h-9 ps-9 text-sm"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {filteredConversations.map((conv) => (
              <div
                key={conv.id}
                className="group flex items-center justify-between p-3 rounded-lg hover:bg-accent cursor-pointer"
                onClick={() => loadConversation(conv.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {conv.title || t('chat.newConversation')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(conv.updatedAt), 'MMM d, h:mm a')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 h-8 w-8"
                  title={t('common.delete')}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(conv.id);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Model selector + export */}
        <div className="p-4 border-b border-border flex items-center justify-between gap-2">
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder={t('chat.selectModel')} />
            </SelectTrigger>
            <SelectContent>
              {availableModels.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={messages.length === 0}
            title={t('chat.exportChat')}
            aria-label={t('chat.exportChat')}
          >
            <Download className="w-4 h-4 me-2" />
            {t('chat.exportChat')}
          </Button>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <Bot className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">{t('chat.emptyTitle')}</h3>
                <p className="text-muted-foreground mt-2">
                  {t('chat.emptySubtitle')}
                </p>
                {/* Suggested prompts */}
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      className="text-sm px-3 py-2 rounded-full border border-border bg-card hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message, index) => {
              const isLast = index === messages.length - 1;
              const isWaiting = isLast && isStreaming && message.role === 'assistant' && !message.content;

              return (
                <div
                  key={message.id}
                  className={`group flex gap-4 ${
                    message.role === 'user' ? 'flex-row-reverse' : ''
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      message.role === 'user'
                        ? 'bg-gradient-to-br from-green-400 to-blue-500'
                        : 'bg-gradient-to-br from-blue-500 to-purple-600'
                    }`}
                  >
                    {message.role === 'user' ? (
                      <User className="w-4 h-4 text-white" />
                    ) : (
                      <Bot className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    {isWaiting ? (
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {t('chat.thinking')}
                      </p>
                    ) : message.role === 'assistant' ? (
                      <MarkdownMessage content={message.content} />
                    ) : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      {message.metadata && (
                        <p className="text-xs opacity-70">
                          {message.metadata.model} • {message.metadata.tokens} {t('chat.tokens')}
                        </p>
                      )}
                      {/* Copy button — visible on hover */}
                      {!isWaiting && message.content && (
                        <button
                          onClick={() => handleCopy(message.id, message.content)}
                          title={t('chat.copy')}
                          aria-label={t('chat.copy')}
                          className="opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity text-muted-foreground"
                        >
                          {copiedId === message.id ? (
                            <Check className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                      {/* Regenerate — only on the trailing assistant reply */}
                      {!isWaiting && isLast && message.role === 'assistant' && canRegenerate && (
                        <button
                          onClick={regenerate}
                          title={t('chat.regenerate')}
                          aria-label={t('chat.regenerate')}
                          className="opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity text-muted-foreground"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input — multiline (Shift+Enter for newline, Enter to send) + voice */}
        <div className="p-4 border-t border-border">
          <div className="max-w-3xl mx-auto flex gap-2 items-end">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isRecording ? t('chat.recording') : t('chat.placeholder')}
              className="flex-1 min-h-[44px] max-h-40 resize-none"
              rows={1}
              disabled={isLoading}
            />
            <Button
              onClick={isRecording ? stopRecording : startRecording}
              variant={isRecording ? 'destructive' : 'outline'}
              title={isRecording ? t('chat.recording') : t('chat.voiceInput')}
              aria-label={isRecording ? t('chat.recording') : t('chat.voiceInput')}
              className={`h-11 ${isRecording ? 'animate-pulse' : ''}`}
              disabled={isLoading}
            >
              <Mic className="w-4 h-4" />
            </Button>
            {isStreaming ? (
              <Button
                onClick={stop}
                variant="destructive"
                title={t('chat.stop')}
                aria-label={t('chat.stop')}
                className="h-11"
              >
                <Square className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                title={t('chat.sendMessage')}
                aria-label={t('chat.sendMessage')}
                className="h-11"
              >
                <Send className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
