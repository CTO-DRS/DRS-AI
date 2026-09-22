export interface TelegramUser {
  id: number;
  username?: string;
  firstName?: string;
  lastName?: string;
}

export interface BotContext {
  userId: number;
  username?: string;
  chatId: number;
  messageId?: number;
  isAuthenticated: boolean;
  drsToken?: string;
}

export interface CommandHandler {
  command: string;
  description: string;
  handler: (ctx: any) => Promise<void>;
}

export interface FileUpload {
  fileId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileUrl?: string;
}

export interface ChatMessage {
  id: string;
  userId: number;
  chatId: number;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  metadata?: {
    model?: string;
    agent?: string;
    fileProcessed?: boolean;
  };
}

export interface AgentTask {
  id: string;
  agentId: string;
  input: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  createdAt: Date;
}
