import { useEffect, useRef, useState } from 'react';
import { Send, Plus, Trash2, Bot, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useChat } from '@/contexts/ChatContext';
import { format } from 'date-fns';

export default function Chat() {
  const {
    conversations,
    messages,
    isLoading,
    selectedModel,
    availableModels,
    loadConversations,
    loadConversation,
    sendMessage,
    createConversation,
    deleteConversation,
    setSelectedModel,
    loadModels
  } = useChat();

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
    await sendMessage(input);
    setInput('');
  };

  return (
    <div className="flex h-[calc(100vh-8rem)]">
      {/* Conversations Sidebar */}
      <div className="w-64 border-r border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border">
          <Button onClick={createConversation} className="w-full">
            <Plus className="w-4 h-4 mr-2" />
            New Chat
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
                    {conv.title || 'New Conversation'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(conv.updatedAt), 'MMM d, h:mm a')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 h-8 w-8"
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
      <div className="flex-1 flex flex-col">
        {/* Model Selector */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select model" />
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
                <h3 className="text-lg font-medium">How can I help you today?</h3>
                <p className="text-muted-foreground mt-2">
                  Start a conversation with the AI assistant
                </p>
              </div>
            )}

            {messages.map((message) => (
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
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.metadata && (
                    <p className="text-xs opacity-70 mt-2">
                      {message.metadata.model} • {message.metadata.tokens} tokens
                    </p>
                  )}
                </div>
              </div>
            ))}
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
              placeholder="Type your message..."
              className="flex-1"
              disabled={isLoading}
            />
            <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
