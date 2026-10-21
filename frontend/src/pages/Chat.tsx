import { useEffect, useRef, useState } from 'react';
import { Send, Plus, Trash2, Bot, User, Square, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useChat } from '@/contexts/ChatContext';
import { useT } from '@/i18n';
import { MarkdownMessage } from '@/components/chat/MarkdownMessage';
import { format } from 'date-fns';

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
    stop,
    createConversation,
    deleteConversation,
    setSelectedModel,
    loadModels
  } = useChat();

  const t = useT();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConversations();
    loadModels();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const content = input;
    setInput('');
    await sendMessage(content);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)]">
      {/* Conversations Sidebar */}
      <div className="w-64 border-e border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border">
          <Button onClick={createConversation} className="w-full">
            <Plus className="w-4 h-4 me-2" />
            {t('chat.newChat')}
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {conversations.map((conv) => (
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
        {/* Model Selector */}
        <div className="p-4 border-b border-border flex items-center justify-between">
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
              </div>
            )}

            {messages.map((message, index) => {
              const isLast = index === messages.length - 1;
              const isWaiting = isLast && isStreaming && message.role === 'assistant' && !message.content;

              return (
                <div
                  key={message.id}
                  className={`flex gap-4 ${
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
                    {message.metadata && (
                      <p className="text-xs opacity-70 mt-2">
                        {message.metadata.model} • {message.metadata.tokens} tokens
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="p-4 border-t border-border">
          <div className="max-w-3xl mx-auto flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder={t('chat.placeholder')}
              className="flex-1"
              disabled={isLoading}
            />
            {isStreaming ? (
              <Button
                onClick={stop}
                variant="destructive"
                title={t('chat.stop')}
                aria-label={t('chat.stop')}
              >
                <Square className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                title={t('chat.sendMessage')}
                aria-label={t('chat.sendMessage')}
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
