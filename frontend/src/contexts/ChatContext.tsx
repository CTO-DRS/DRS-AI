import { createContext, useContext, useState, ReactNode } from 'react';
import { Message, Conversation, Model } from '@/types';
import { chatService } from '@/services/api';
import { toast } from 'sonner';

interface ChatContextType {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: Message[];
  isLoading: boolean;
  selectedModel: string;
  availableModels: Model[];
  loadConversations: () => Promise<void>;
  loadConversation: (id: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  createConversation: () => Promise<void>;
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
  const [selectedModel, setSelectedModel] = useState('llama3.2');
  const [availableModels, setAvailableModels] = useState<Model[]>([]);

  const loadModels = async () => {
    try {
      const response = await chatService.getModels();
      setAvailableModels(response.data.models);
    } catch (error) {
      toast.error('Failed to load models');
    }
  };

  const loadConversations = async () => {
    try {
      const response = await chatService.getConversations();
      setConversations(response.data.conversations);
    } catch (error) {
      toast.error('Failed to load conversations');
    }
  };

  const loadConversation = async (id: string) => {
    try {
      const response = await chatService.getConversation(id);
      setCurrentConversation(response.data.conversation);
      setMessages(response.data.conversation.messages.map((m: any) => ({
        ...m,
        timestamp: new Date(m.createdAt)
      })));
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

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const conversationId = currentConversation?.id;
      const response = await chatService.sendMessage(content, selectedModel, conversationId);
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.data.message.content,
        timestamp: new Date(),
        metadata: response.data.message.metadata
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      if (!conversationId && response.data.conversationId) {
        await loadConversations();
      }
    } catch (error) {
      toast.error('Failed to send message');
    } finally {
      setIsLoading(false);
    }
  };

  const createConversation = async () => {
    try {
      const response = await chatService.createConversation();
      await loadConversations();
      setCurrentConversation(response.data.conversation);
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
      selectedModel,
      availableModels,
      loadConversations,
      loadConversation,
      sendMessage,
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
