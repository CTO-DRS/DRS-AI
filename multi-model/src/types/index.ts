export interface ModelConfig {
  id: string;
  name: string;
  provider: 'ollama' | 'openai' | 'anthropic' | 'local';
  modelId: string;
  endpoint?: string;
  capabilities: ModelCapability[];
  parameters: ModelParameters;
  performance: ModelPerformance;
  contextWindow: number;
  enabled: boolean;
  priority: number;
}

export enum ModelCapability {
  CHAT = 'chat',
  COMPLETION = 'completion',
  EMBEDDING = 'embedding',
  VISION = 'vision',
  CODE = 'code',
  ANALYSIS = 'analysis',
  CREATIVE = 'creative',
  REASONING = 'reasoning',
  MULTILINGUAL = 'multilingual',
  FUNCTION_CALLING = 'function_calling',
  JSON_MODE = 'json_mode'
}

export interface ModelParameters {
  temperature: number;
  topP: number;
  topK: number;
  maxTokens: number;
  repeatPenalty: number;
  seed?: number;
  stopSequences?: string[];
}

export interface ModelPerformance {
  avgLatency: number;
  successRate: number;
  tokenThroughput: number;
  qualityScore: number;
  costPer1KTokens: number;
  lastBenchmarked: Date;
}

export interface ModelRequest {
  prompt: string;
  systemPrompt?: string;
  capabilities?: ModelCapability[];
  preferredModels?: string[];
  parameters?: Partial<ModelParameters>;
  timeout?: number;
  streaming?: boolean;
  context?: string;
  taskType?: TaskType;
}

export enum TaskType {
  GENERAL = 'general',
  CODE = 'code',
  ANALYSIS = 'analysis',
  CREATIVE = 'creative',
  SUMMARIZATION = 'summarization',
  TRANSLATION = 'translation',
  CLASSIFICATION = 'classification',
  EXTRACTION = 'extraction',
  REASONING = 'reasoning',
  CONVERSATION = 'conversation'
}

export interface ModelResponse {
  modelId: string;
  modelName: string;
  content: string;
  usage: TokenUsage;
  latency: number;
  finishReason: string;
  metadata: ResponseMetadata;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ResponseMetadata {
  generatedAt: Date;
  parameters: ModelParameters;
  confidence?: number;
  alternatives?: string[];
}

export interface EnsembleRequest {
  prompt: string;
  models: string[];
  strategy: EnsembleStrategy;
  votingConfig?: VotingConfig;
  aggregationConfig?: AggregationConfig;
}

export enum EnsembleStrategy {
  VOTING = 'voting',
  AVERAGE = 'average',
  WEIGHTED = 'weighted',
  CASCADE = 'cascade',
  BEST_OF_N = 'best_of_n',
  CONSENSUS = 'consensus'
}

export interface VotingConfig {
  minAgreement: number;
  tieBreaker: 'first' | 'random' | 'quality' | 'confidence';
  includeDissenting?: boolean;
}

export interface AggregationConfig {
  weights: Record<string, number>;
  normalization: 'softmax' | 'linear' | 'none';
  diversityBonus?: number;
}

export interface EnsembleResult {
  responses: ModelResponse[];
  consensus: string;
  confidence: number;
  agreementScore: number;
  dissentingResponses?: ModelResponse[];
  processingTime: number;
  strategy: EnsembleStrategy;
}

export interface AutoSelectConfig {
  taskType: TaskType;
  complexity: 'low' | 'medium' | 'high';
  latencyRequirement: 'low' | 'medium' | 'high';
  qualityRequirement: 'low' | 'medium' | 'high';
  budgetConstraint?: number;
  requiredCapabilities?: ModelCapability[];
  preferredProviders?: string[];
}

export interface ModelSelection {
  selectedModels: string[];
  strategy: EnsembleStrategy;
  reasoning: string;
  estimatedLatency: number;
  estimatedCost: number;
  confidence: number;
}

export interface BenchmarkResult {
  modelId: string;
  taskType: TaskType;
  dataset: string;
  accuracy: number;
  latency: number;
  tokensUsed: number;
  qualityScore: number;
  timestamp: Date;
}

export interface ModelComparison {
  models: string[];
  taskType: TaskType;
  results: BenchmarkResult[];
  winner: string;
  analysis: string;
}

export interface RoutingDecision {
  requestId: string;
  selectedModel: string;
  fallbackModels: string[];
  strategy: 'single' | 'ensemble' | 'cascade';
  estimatedLatency: number;
  confidence: number;
  reasoning: string;
}

export interface QualityMetrics {
  coherence: number;
  relevance: number;
  accuracy: number;
  creativity: number;
  fluency: number;
  overall: number;
}

export interface ModelEvaluation {
  response: ModelResponse;
  metrics: QualityMetrics;
  feedback?: string;
  evaluatedAt: Date;
}
