import { createContext, useContext, useState, ReactNode } from 'react';
import { Message, Conversation, Model } from '@/types';
import { chatService, streamChat, unwrap } from '@/services/api';
import { toast } from 'sonner';

interface ChatContextType {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  selectedModel: string;
  availableModels: Model[];
  useRag: boolean;
  setUseRag: (v: boolean) => void;
  loadConversations: () => Promise<void>;
  loadConversation: (id: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  stopStreaming: () => void;
  createConversation: (title?: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  setSelectedModel: (model: string) => void;
  loadModels: () => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('selectedModel') || 'llama3.2');
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [useRag, setUseRag] = useState(false);
  const [cancelStream, setCancelStream] = useState<(() => void) | null>(null);

  const loadModels = async () => {
    try {
      const response = await chatService.getModels();
      const models = unwrap(response)?.models || [];
      setAvailableModels(models);
      // If the stored selection no longer exists, fall back to the first model
      setSelectedModel(prev => (models.some((m: Model) => m.id === prev) ? prev : models[0]?.id || prev));
    } catch (error) {
      toast.error('Failed to load models');
    }
  };

  const loadConversations = async () => {
    try {
      const response = await chatService.getConversations();
      setConversations(unwrap(response)?.conversations || []);
    } catch (error) {
      toast.error('Failed to load conversations');
    }
  };

  const loadConversation = async (id: string) => {
    try {
      const response = await chatService.getConversation(id);
      const conversation = unwrap(response)?.conversation;
      setCurrentConversation(conversation);
      setMessages(
        (conversation?.messages || []).map((m: any) => ({
          ...m,
          id: m.id?.toString() || Date.now().toString(),
          timestamp: new Date(m.createdAt || m.timestamp)
        }))
      );
    } catch (error) {
      toast.error('Failed to load conversation');
    }
  };

  const sendMessage = async (content: string) => {
    if (!content.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date()
    };

    const history = [...messages, userMessage];
    setMessages(history);
    setIsStreaming(true);

    const assistantId = (Date.now() + 1).toString();
    const conversationId = currentConversation?.id;

    // Seed an empty assistant message that we fill while streaming
    setMessages(prev => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '', timestamp: new Date() }
    ]);

    let accumulated = '';
    let finalMetadata: any = undefined;

    const cancel = await streamChat(
      {
        model: selectedModel,
        messages: history.map(m => ({ role: m.role, content: m.content })),
        conversationId,
        useRag
      },
      (data) => {
        // Ollama-style chunks: { message: { content }, done }
        const piece = data.message?.content ?? data.choices?.[0]?.delta?.content ?? '';
        if (piece) {
          accumulated += piece;
          setMessages(prev =>
            prev.map(m => (m.id === assistantId ? { ...m, content: accumulated } : m))
          );
        }
        if (data.done) {
          finalMetadata = {
            model: data.model || selectedModel,
            tokens: (data.eval_count ?? data.usage?.total_tokens) || undefined
          };
        }
      },
      () => {
        setMessages(prev =>
          prev.map(m => (m.id === assistantId ? { ...m, metadata: finalMetadata } : m))
        );
        setIsStreaming(false);
        if (!conversationId) loadConversations();
      },
      (err) => {
        toast.error('Failed to send message');
        setIsStreaming(false);
        if (!accumulated) {
          setMessages(prev => prev.filter(m => m.id !== assistantId));
        }
        console.error(err);
      }
    );

    setCancelStream(() => cancel);
  };

  const stopStreaming = () => {
    cancelStream?.();
    setIsStreaming(false);
  };

  const createConversation = async (title?: string) => {
    try {
      const response = await chatService.createConversation(title);
      await loadConversations();
      setCurrentConversation(unwrap(response)?.conversation);
      setMessages([]);
    } catch (error) {
      toast.error('Failed to create conversation');
    }
  };

  const deleteConversation = async (id: string) => {
    try {
      await chatService.deleteConversation(id);
      await loadConversations();
      if (currentConversation?.id === id) {
        setCurrentConversation(null);
        setMessages([]);
      }
    } catch (error) {
      toast.error('Failed to delete conversation');
    }
  };

  return (
    <ChatContext.Provider value={{
      conversations,
      currentConversation,
      messages,
      isLoading,
      isStreaming,
      selectedModel,
      availableModels,
      useRag,
      setUseRag,
      loadConversations,
      loadConversation,
      sendMessage,
      stopStreaming,
      createConversation,
      deleteConversation,
      setSelectedModel,
      loadModels
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChat must be used within ChatProvider');
  return context;
};
