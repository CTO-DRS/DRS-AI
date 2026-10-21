import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Message, Conversation, Model } from '@/types';
import { chatService, API_URL } from '@/services/api';
import { toast } from 'sonner';
import { useT } from '@/i18n';

interface ChatContextType {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: Message[];
  isLoading: boolean;
  /** True while an assistant reply is being streamed via SSE. */
  isStreaming: boolean;
  selectedModel: string;
  availableModels: Model[];
  loadConversations: () => Promise<void>;
  loadConversation: (id: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  /** Aborts the in-flight stream; partial content is kept. */
  stop: () => void;
  createConversation: () => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  setSelectedModel: (model: string) => void;
  loadModels: () => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

/** One Ollama NDJSON chunk forwarded by the router as an SSE frame. */
interface StreamChunk {
  message?: { content?: string };
  done?: boolean;
  error?: string;
}

/** Batch streamed deltas into one state update every `FLUSH_MS`. */
const FLUSH_MS = 50;

export function ChatProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedModel, setSelectedModel] = useState('llama3.2');
  const [availableModels, setAvailableModels] = useState<Model[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(false);

  const loadModels = async () => {
    try {
      const response = await chatService.getModels();
      setAvailableModels(response.data.models);
    } catch {
      toast.error(t('chat.loadModelsFailed'));
    }
  };

  const loadConversations = async () => {
    try {
      const response = await chatService.getConversations();
      setConversations(response.data.conversations);
    } catch {
      toast.error(t('chat.loadConversationsFailed'));
    }
  };

  const loadConversation = async (id: string) => {
    try {
      const response = await chatService.getConversation(id);
      setCurrentConversation(response.data.conversation);
      const persisted = response.data.conversation.messages as Array<
        Omit<Message, 'timestamp'> & { createdAt: string }
      >;
      setMessages(persisted.map(m => ({
        ...m,
        timestamp: new Date(m.createdAt)
      })));
    } catch {
      toast.error(t('chat.loadConversationFailed'));
    }
  };

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const buildAuthHeaders = (): Record<string, string> => {
    try {
      const tokens = localStorage.getItem('tokens');
      if (tokens) {
        const { accessToken } = JSON.parse(tokens);
        return { Authorization: `Bearer ${accessToken}` };
      }
    } catch {
      /* fall through without auth header */
    }
    return {};
  };

  /**
   * POST /api/v1/chat with stream:true and parse the SSE response.
   * Frames look like `data: {"message":{"content":"delta"},"done":false}\n\n`,
   * terminated by `data: [DONE]`.
   * Resolves to 'ok' on completion, 'aborted' when stopped via stop(),
   * and throws on real errors (caller falls back to non-streaming).
   */
  const streamChat = async (
    history: Array<{ role: string; content: string }>,
    assistantId: string
  ): Promise<'ok' | 'aborted'> => {
    const controller = new AbortController();
    abortRef.current = controller;

    let pendingDelta = '';
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      flushTimer = null;
      if (!pendingDelta) return;
      const delta = pendingDelta;
      pendingDelta = '';
      setMessages(prev =>
        prev.map(m => (m.id === assistantId ? { ...m, content: m.content + delta } : m))
      );
    };

    const queueDelta = (delta: string) => {
      pendingDelta += delta;
      if (flushTimer === null) {
        flushTimer = setTimeout(flush, FLUSH_MS);
      }
    };

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { ...buildAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel, messages: history, stream: true }),
        signal: controller.signal
      });

      if (!response.ok || !response.body) {
        throw new Error(`Streaming request failed with status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let finished = false;

      while (!finished) {
        const { value, done: readerDone } = await reader.read();
        if (readerDone) break;
        sseBuffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line (handle \n\n and \r\n\r\n).
        const frames = sseBuffer.split(/\r?\n\r?\n/);
        sseBuffer = frames.pop() ?? '';

        for (const frame of frames) {
          for (const line of frame.split(/\r?\n/)) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            if (payload === '[DONE]') {
              finished = true;
              break;
            }

            let chunk: StreamChunk;
            try {
              chunk = JSON.parse(payload) as StreamChunk;
            } catch {
              continue; // ignore malformed frames
            }

            if (typeof chunk.error === 'string' && chunk.error) {
              throw new Error(chunk.error);
            }
            if (typeof chunk.message?.content === 'string' && chunk.message.content) {
              queueDelta(chunk.message.content);
            }
            if (chunk.done === true) {
              finished = true;
              break;
            }
          }
          if (finished) break;
        }
      }

      flush();
      return 'ok';
    } catch (error) {
      const isAbort = error instanceof Error && error.name === 'AbortError';
      if (isAbort) return 'aborted';
      throw error;
    } finally {
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flush();
      }
      abortRef.current = null;
    }
  };

  const sendMessage = async (content: string) => {
    if (!content.trim()) return;
    if (isStreamingRef.current) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date()
    };

    const assistantId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date()
    };

    const conversationId = currentConversation?.id;
    const history = [...messages, userMessage]
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role as string, content: m.content }));

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setIsLoading(true);
    isStreamingRef.current = true;
    setIsStreaming(true);

    let streamed = false;
    try {
      const result = await streamChat(history, assistantId);
      streamed = true;
      if (result === 'aborted') {
        // User pressed Stop — keep the partial content.
        toast.info(t('chat.streamingStopped'));
      }
    } catch {
      // Fall back to the plain (non-streaming) POST.
      try {
        const response = await chatService.sendMessage(content, selectedModel, conversationId);
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: response.data.message.content, metadata: response.data.message.metadata }
              : m
          )
        );
        streamed = true;
      } catch {
        toast.error(t('chat.sendFailed'));
        // Remove the empty assistant placeholder on total failure.
        setMessages(prev => prev.filter(m => m.id !== assistantId));
      }
    } finally {
      isStreamingRef.current = false;
      setIsStreaming(false);
      setIsLoading(false);
      // Keep persistence behavior unchanged: refresh the sidebar when this
      // message may have created a new conversation server-side.
      if (streamed && !conversationId) {
        await loadConversations();
      }
    }
  };

  const createConversation = async () => {
    try {
      const response = await chatService.createConversation();
      await loadConversations();
      setCurrentConversation(response.data.conversation);
      setMessages([]);
    } catch {
      toast.error(t('chat.createConversationFailed'));
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
    } catch {
      toast.error(t('chat.deleteConversationFailed'));
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
      loadConversations,
      loadConversation,
      sendMessage,
      stop,
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
