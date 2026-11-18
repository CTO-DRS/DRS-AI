import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import _ from 'lodash';
import natural from 'natural';
import {
  ModelConfig,
  ModelCapability,
  ModelParameters,
  ModelPerformance,
  ModelRequest,
  ModelResponse,
  TaskType,
  TokenUsage,
  ResponseMetadata,
  EnsembleRequest,
  EnsembleStrategy,
  EnsembleResult,
  VotingConfig,
  AggregationConfig,
  AutoSelectConfig,
  ModelSelection,
  BenchmarkResult,
  RoutingDecision,
  QualityMetrics,
  ModelEvaluation
} from '../types';
import { Logger } from '../utils/logger';

export class MultiModelService {
  private models: Map<string, ModelConfig> = new Map();
  private performanceHistory: Map<string, ModelPerformance> = new Map();
  private benchmarkResults: Map<string, BenchmarkResult[]> = new Map();
  private requestHistory: Map<string, ModelResponse[]> = new Map();
  private logger: Logger;

  constructor() {
    this.logger = new Logger('MultiModelService');
    this.initializeDefaultModels();
  }

  private initializeDefaultModels(): void {
    const defaultModels: ModelConfig[] = [
      {
        id: 'llama3.2-3b',
        name: 'Llama 3.2 3B',
        provider: 'ollama',
        modelId: 'llama3.2:3b',
        capabilities: [
          ModelCapability.CHAT,
          ModelCapability.COMPLETION,
          ModelCapability.CODE,
          ModelCapability.ANALYSIS,
          ModelCapability.REASONING
        ],
        parameters: {
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
          maxTokens: 4096,
          repeatPenalty: 1.1
        },
        performance: {
          avgLatency: 500,
          successRate: 0.98,
          tokenThroughput: 50,
          qualityScore: 0.85,
          costPer1KTokens: 0,
          lastBenchmarked: new Date()
        },
        contextWindow: 128000,
        enabled: true,
        priority: 1
      },
      {
        id: 'llama3.2-1b',
        name: 'Llama 3.2 1B',
        provider: 'ollama',
        modelId: 'llama3.2:1b',
        capabilities: [
          ModelCapability.CHAT,
          ModelCapability.COMPLETION,
          ModelCapability.ANALYSIS
        ],
        parameters: {
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
          maxTokens: 2048,
          repeatPenalty: 1.1
        },
        performance: {
          avgLatency: 200,
          successRate: 0.99,
          tokenThroughput: 100,
          qualityScore: 0.75,
          costPer1KTokens: 0,
          lastBenchmarked: new Date()
        },
        contextWindow: 128000,
        enabled: true,
        priority: 2
      },
      {
        id: 'qwen2.5-3b',
        name: 'Qwen 2.5 3B',
        provider: 'ollama',
        modelId: 'qwen2.5:3b',
        capabilities: [
          ModelCapability.CHAT,
          ModelCapability.COMPLETION,
          ModelCapability.CODE,
          ModelCapability.ANALYSIS,
          ModelCapability.MULTILINGUAL
        ],
        parameters: {
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
          maxTokens: 4096,
          repeatPenalty: 1.1
        },
        performance: {
          avgLatency: 600,
          successRate: 0.97,
          tokenThroughput: 45,
          qualityScore: 0.83,
          costPer1KTokens: 0,
          lastBenchmarked: new Date()
        },
        contextWindow: 128000,
        enabled: true,
        priority: 3
      },
      {
        id: 'phi3-3.8b',
        name: 'Phi-3 3.8B',
        provider: 'ollama',
        modelId: 'phi3:3.8b',
        capabilities: [
          ModelCapability.CHAT,
          ModelCapability.COMPLETION,
          ModelCapability.CODE,
          ModelCapability.REASONING
        ],
        parameters: {
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
          maxTokens: 4096,
          repeatPenalty: 1.1
        },
        performance: {
          avgLatency: 450,
          successRate: 0.98,
          tokenThroughput: 55,
          qualityScore: 0.87,
          costPer1KTokens: 0,
          lastBenchmarked: new Date()
        },
        contextWindow: 128000,
        enabled: true,
        priority: 4
      },
      {
        id: 'gemma2-2b',
        name: 'Gemma 2 2B',
        provider: 'ollama',
        modelId: 'gemma2:2b',
        capabilities: [
          ModelCapability.CHAT,
          ModelCapability.COMPLETION,
          ModelCapability.CREATIVE
        ],
        parameters: {
          temperature: 0.8,
          topP: 0.95,
          topK: 50,
          maxTokens: 4096,
          repeatPenalty: 1.0
        },
        performance: {
          avgLatency: 350,
          successRate: 0.98,
          tokenThroughput: 60,
          qualityScore: 0.80,
          costPer1KTokens: 0,
          lastBenchmarked: new Date()
        },
        contextWindow: 8192,
        enabled: true,
        priority: 5
      },
      {
        id: 'nomic-embed',
        name: 'Nomic Embed Text',
        provider: 'ollama',
        modelId: 'nomic-embed-text',
        capabilities: [
          ModelCapability.EMBEDDING
        ],
        parameters: {
          temperature: 0,
          topP: 1,
          topK: 1,
          maxTokens: 512,
          repeatPenalty: 1
        },
        performance: {
          avgLatency: 100,
          successRate: 0.99,
          tokenThroughput: 200,
          qualityScore: 0.90,
          costPer1KTokens: 0,
          lastBenchmarked: new Date()
        },
        contextWindow: 2048,
        enabled: true,
        priority: 1
      }
    ];

    for (const model of defaultModels) {
      this.models.set(model.id, model);
      this.performanceHistory.set(model.id, model.performance);
    }

    this.logger.info(`Initialized ${defaultModels.length} default models`);
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const requestId = uuidv4();
    const startTime = Date.now();

    try {
      // Auto-select model if not specified
      let selectedModel: ModelConfig;

      if (request.preferredModels && request.preferredModels.length > 0) {
        const modelId = request.preferredModels[0];
        selectedModel = this.models.get(modelId)!;
      } else {
        const selection = this.autoSelectModel({
          taskType: request.taskType || TaskType.GENERAL,
          complexity: this.estimateComplexity(request.prompt),
          latencyRequirement: 'medium',
          qualityRequirement: 'medium',
          requiredCapabilities: request.capabilities
        });
        selectedModel = this.models.get(selection.selectedModels[0])!;
      }

      if (!selectedModel || !selectedModel.enabled) {
        throw new Error('No suitable model found');
      }

      // Generate response
      const response = await this.callModel(selectedModel, request);

      // Update performance metrics
      this.updatePerformanceMetrics(selectedModel.id, startTime, true);

      // Store in history
      this.storeRequestHistory(requestId, response);

      this.logger.info(`Generated response using ${selectedModel.name} in ${Date.now() - startTime}ms`);

      return response;
    } catch (error) {
      this.logger.error('Generation error:', error);
      throw error;
    }
  }

  async generateEnsemble(request: EnsembleRequest): Promise<EnsembleResult> {
    const startTime = Date.now();

    try {
      // Get model configurations
      const modelConfigs = request.models
        .map(id => this.models.get(id))
        .filter((m): m is ModelConfig => m !== undefined && m.enabled);

      if (modelConfigs.length === 0) {
        throw new Error('No valid models specified for ensemble');
      }

      // Generate responses from all models in parallel
      const modelRequests = modelConfigs.map(model =>
        this.callModel(model, {
          prompt: request.prompt,
          parameters: model.parameters
        })
      );

      const responses = await Promise.all(modelRequests);

      // Apply ensemble strategy
      let result: EnsembleResult;

      switch (request.strategy) {
        case EnsembleStrategy.VOTING:
          result = this.applyVoting(responses, request.votingConfig);
          break;
        case EnsembleStrategy.AVERAGE:
          result = this.applyAverage(responses);
          break;
        case EnsembleStrategy.WEIGHTED:
          result = this.applyWeighted(responses, request.aggregationConfig!);
          break;
        case EnsembleStrategy.CASCADE:
          result = await this.applyCascade(request.prompt, modelConfigs);
          break;
        case EnsembleStrategy.BEST_OF_N:
          result = this.applyBestOfN(responses);
          break;
        case EnsembleStrategy.CONSENSUS:
          result = this.applyConsensus(responses);
          break;
        default:
          result = this.applyVoting(responses);
      }

      result.processingTime = Date.now() - startTime;
      result.strategy = request.strategy;

      this.logger.info(`Ensemble generation completed in ${result.processingTime}ms`);

      return result;
    } catch (error) {
      this.logger.error('Ensemble generation error:', error);
      throw error;
    }
  }

  autoSelectModel(config: AutoSelectConfig): ModelSelection {
    const enabledModels = Array.from(this.models.values())
      .filter(m => m.enabled);

    // Filter by required capabilities
    let candidates = enabledModels;
    if (config.requiredCapabilities && config.requiredCapabilities.length > 0) {
      candidates = candidates.filter(model =>
        config.requiredCapabilities!.every(cap =>
          model.capabilities.includes(cap)
        )
      );
    }

    // Filter by preferred providers
    if (config.preferredProviders && config.preferredProviders.length > 0) {
      candidates = candidates.filter(model =>
        config.preferredProviders!.includes(model.provider)
      );
    }

    if (candidates.length === 0) {
      throw new Error('No models match the specified criteria');
    }

    // Score each model based on requirements
    const scored = candidates.map(model => {
      let score = 0;
      const reasoning: string[] = [];

      // Quality score
      const qualityWeight = config.qualityRequirement === 'high' ? 0.4 :
                           config.qualityRequirement === 'medium' ? 0.3 : 0.2;
      score += model.performance.qualityScore * qualityWeight;
      reasoning.push(`Quality: ${(model.performance.qualityScore * 100).toFixed(1)}%`);

      // Latency score
      const latencyWeight = config.latencyRequirement === 'high' ? 0.4 :
                           config.latencyRequirement === 'medium' ? 0.3 : 0.2;
      const latencyScore = Math.max(0, 1 - model.performance.avgLatency / 2000);
      score += latencyScore * latencyWeight;
      reasoning.push(`Latency: ${model.performance.avgLatency}ms`);

      // Success rate score
      score += model.performance.successRate * 0.2;
      reasoning.push(`Success: ${(model.performance.successRate * 100).toFixed(1)}%`);

      // Task-specific performance
      const taskPerformance = this.getTaskPerformance(model.id, config.taskType);
      score += taskPerformance * 0.2;
      reasoning.push(`Task match: ${(taskPerformance * 100).toFixed(1)}%`);

      return { model, score, reasoning };
    });

    // Sort by score
    scored.sort((a, b) => b.score - a.score);

    // Select top models
    const topModels = scored.slice(0, Math.min(3, scored.length));
    const selectedIds = topModels.map(s => s.model.id);

    // Determine strategy based on task and requirements
    let strategy: EnsembleStrategy;
    if (config.qualityRequirement === 'high' && selectedIds.length > 1) {
      strategy = EnsembleStrategy.CONSENSUS;
    } else if (config.latencyRequirement === 'high') {
      strategy = EnsembleStrategy.CASCADE;
    } else if (config.complexity === 'high') {
      strategy = EnsembleStrategy.VOTING;
    } else {
      strategy = EnsembleStrategy.BEST_OF_N;
    }

    const estimatedLatency = topModels[0].model.performance.avgLatency;
    const estimatedCost = topModels.reduce((sum, t) =>
      sum + t.model.performance.costPer1KTokens, 0
    );

    return {
      selectedModels: selectedIds,
      strategy,
      reasoning: `Selected ${topModels[0].model.name} based on: ${topModels[0].reasoning.join(', ')}`,
      estimatedLatency,
      estimatedCost,
      confidence: topModels[0].score
    };
  }

  async routeRequest(request: ModelRequest): Promise<RoutingDecision> {
    const requestId = uuidv4();

    // Analyze request characteristics
    const taskType = request.taskType || this.classifyTask(request.prompt);
    const complexity = this.estimateComplexity(request.prompt);
    const contextLength = request.context ? request.context.length : 0;

    // Select routing strategy
    let strategy: 'single' | 'ensemble' | 'cascade';
    let selectedModels: string[];
    let fallbackModels: string[];

    if (complexity === 'high' || taskType === TaskType.REASONING) {
      // Use ensemble for complex tasks
      strategy = 'ensemble';
      const selection = this.autoSelectModel({
        taskType,
        complexity,
        latencyRequirement: 'medium',
        qualityRequirement: 'high'
      });
      selectedModels = selection.selectedModels;
      fallbackModels = this.getFallbackModels(selectedModels[0]);
    } else if (complexity === 'low' && contextLength < 1000) {
      // Use single fast model for simple tasks
      strategy = 'single';
      const selection = this.autoSelectModel({
        taskType,
        complexity,
        latencyRequirement: 'high',
        qualityRequirement: 'low'
      });
      selectedModels = [selection.selectedModels[0]];
      fallbackModels = selection.selectedModels.slice(1);
    } else {
      // Use cascade for medium complexity
      strategy = 'cascade';
      const selection = this.autoSelectModel({
        taskType,
        complexity,
        latencyRequirement: 'medium',
        qualityRequirement: 'medium'
      });
      selectedModels = [selection.selectedModels[0]];
      fallbackModels = selection.selectedModels.slice(1);
    }

    const primaryModel = this.models.get(selectedModels[0])!;

    return {
      requestId,
      selectedModel: selectedModels[0],
      fallbackModels,
      strategy,
      estimatedLatency: primaryModel.performance.avgLatency,
      confidence: this.calculateRoutingConfidence(taskType, complexity, primaryModel),
      reasoning: `Routed to ${primaryModel.name} for ${taskType} task with ${complexity} complexity using ${strategy} strategy`
    };
  }

  private async callModel(
    model: ModelConfig,
    request: ModelRequest
  ): Promise<ModelResponse> {
    const startTime = Date.now();

    const parameters = { ...model.parameters, ...request.parameters };

    try {
      const response = await axios.post(
        `http://ollama:11434/api/generate`,
        {
          model: model.modelId,
          prompt: request.systemPrompt
            ? `${request.systemPrompt}\n\n${request.prompt}`
            : request.prompt,
          stream: false,
          options: {
            temperature: parameters.temperature,
            top_p: parameters.topP,
            top_k: parameters.topK,
            num_predict: parameters.maxTokens,
            repeat_penalty: parameters.repeatPenalty,
            seed: parameters.seed,
            stop: parameters.stopSequences
          }
        },
        { timeout: request.timeout || 60000 }
      );

      const latency = Date.now() - startTime;
      const content = response.data.response;

      // Estimate token usage
      const promptTokens = this.estimateTokens(request.prompt);
      const completionTokens = this.estimateTokens(content);

      return {
        modelId: model.id,
        modelName: model.name,
        content,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens
        },
        latency,
        finishReason: response.data.done ? 'stop' : 'length',
        metadata: {
          generatedAt: new Date(),
          parameters
        }
      };
    } catch (error) {
      this.logger.error(`Model call failed for ${model.name}:`, error);
      throw error;
    }
  }

  private applyVoting(
    responses: ModelResponse[],
    config?: VotingConfig
  ): EnsembleResult {
    const minAgreement = config?.minAgreement || 0.5;
    const tieBreaker = config?.tieBreaker || 'quality';

    // Group similar responses
    const groups: ModelResponse[][] = [];
    const used = new Set<number>();

    for (let i = 0; i < responses.length; i++) {
      if (used.has(i)) continue;

      const group = [responses[i]];
      used.add(i);

      for (let j = i + 1; j < responses.length; j++) {
        if (used.has(j)) continue;

        const similarity = this.calculateSimilarity(
          responses[i].content,
          responses[j].content
        );

        if (similarity >= minAgreement) {
          group.push(responses[j]);
          used.add(j);
        }
      }

      groups.push(group);
    }

    // Find the largest group (consensus)
    groups.sort((a, b) => b.length - a.length);
    const consensusGroup = groups[0];
    const dissenting = groups.slice(1).flat();

    // Select best response from consensus group
    let bestResponse: ModelResponse;

    switch (tieBreaker) {
      case 'quality':
        bestResponse = this.selectByQuality(consensusGroup);
        break;
      case 'confidence':
        bestResponse = consensusGroup.reduce((best, current) =>
          (current.metadata.confidence || 0) > (best.metadata.confidence || 0)
            ? current
            : best
        );
        break;
      case 'random':
        bestResponse = consensusGroup[Math.floor(Math.random() * consensusGroup.length)];
        break;
      default:
        bestResponse = consensusGroup[0];
    }

    const agreementScore = consensusGroup.length / responses.length;

    return {
      responses,
      consensus: bestResponse.content,
      confidence: agreementScore,
      agreementScore,
      dissentingResponses: config?.includeDissenting ? dissenting : undefined,
      processingTime: 0,
      strategy: EnsembleStrategy.VOTING
    };
  }

  private applyAverage(responses: ModelResponse[]): EnsembleResult {
    // For text generation, we can't truly average
    // Instead, we select the response closest to the centroid

    // Calculate pairwise similarities
    const similarities: number[][] = [];
    for (let i = 0; i < responses.length; i++) {
      similarities[i] = [];
      for (let j = 0; j < responses.length; j++) {
        similarities[i][j] = this.calculateSimilarity(
          responses[i].content,
          responses[j].content
        );
      }
    }

    // Find the response with highest average similarity (centroid)
    let bestIndex = 0;
    let bestAvgSimilarity = 0;

    for (let i = 0; i < responses.length; i++) {
      const avgSim = similarities[i].reduce((a, b) => a + b, 0) / responses.length;
      if (avgSim > bestAvgSimilarity) {
        bestAvgSimilarity = avgSim;
        bestIndex = i;
      }
    }

    return {
      responses,
      consensus: responses[bestIndex].content,
      confidence: bestAvgSimilarity,
      agreementScore: bestAvgSimilarity,
      processingTime: 0,
      strategy: EnsembleStrategy.AVERAGE
    };
  }

  private applyWeighted(
    responses: ModelResponse[],
    config: AggregationConfig
  ): EnsembleResult {
    // Normalize weights
    let weights: Record<string, number>;

    switch (config.normalization) {
      case 'softmax':
        weights = this.softmaxNormalize(config.weights);
        break;
      case 'linear':
        const sum = Object.values(config.weights).reduce((a, b) => a + b, 0);
        weights = Object.fromEntries(
          Object.entries(config.weights).map(([k, v]) => [k, v / sum])
        );
        break;
      default:
        weights = config.weights;
    }

    // Score each response by weighted quality
    const scored = responses.map(response => {
      const weight = weights[response.modelId] || 1 / responses.length;
      const model = this.models.get(response.modelId)!;
      const qualityScore = model.performance.qualityScore;

      return {
        response,
        score: weight * qualityScore
      };
    });

    scored.sort((a, b) => b.score - a.score);

    return {
      responses,
      consensus: scored[0].response.content,
      confidence: scored[0].score,
      agreementScore: scored[0].score,
      processingTime: 0,
      strategy: EnsembleStrategy.WEIGHTED
    };
  }

  private async applyCascade(
    prompt: string,
    models: ModelConfig[]
  ): Promise<EnsembleResult> {
    // Sort models by speed
    const sortedModels = [...models].sort(
      (a, b) => a.performance.avgLatency - b.performance.avgLatency
    );

    const responses: ModelResponse[] = [];

    // Try models in order until one succeeds
    for (const model of sortedModels) {
      try {
        const response = await this.callModel(model, { prompt });
        responses.push(response);

        // If response quality is good enough, stop
        if (this.evaluateQuality(response).overall > 0.8) {
          break;
        }
      } catch (error) {
        this.logger.warn(`Cascade: ${model.name} failed, trying next`);
        continue;
      }
    }

    if (responses.length === 0) {
      throw new Error('All models in cascade failed');
    }

    return {
      responses,
      consensus: responses[responses.length - 1].content,
      confidence: 1 / responses.length,
      agreementScore: 1,
      processingTime: 0,
      strategy: EnsembleStrategy.CASCADE
    };
  }

  private applyBestOfN(responses: ModelResponse[]): EnsembleResult {
    // Select the best response based on quality metrics
    const scored = responses.map(response => ({
      response,
      quality: this.evaluateQuality(response)
    }));

    scored.sort((a, b) => b.quality.overall - a.quality.overall);

    return {
      responses,
      consensus: scored[0].response.content,
      confidence: scored[0].quality.overall,
      agreementScore: 1,
      processingTime: 0,
      strategy: EnsembleStrategy.BEST_OF_N
    };
  }

  private applyConsensus(responses: ModelResponse[]): EnsembleResult {
    // Similar to voting but requires higher agreement
    return this.applyVoting(responses, {
      minAgreement: 0.7,
      tieBreaker: 'quality'
    });
  }

  private evaluateQuality(response: ModelResponse): QualityMetrics {
    const content = response.content;

    // Coherence: check for grammatical correctness
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const coherence = Math.min(sentences.length / 3, 1);

    // Relevance: check content length and structure
    const relevance = Math.min(content.length / 100, 1);

    // Accuracy: based on model's historical performance
    const model = this.models.get(response.modelId);
    const accuracy = model?.performance.qualityScore || 0.5;

    // Creativity: measure vocabulary diversity
    const words = content.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);
    const creativity = uniqueWords.size / words.length;

    // Fluency: check for repetition
    const repeatedWords = words.filter((w, i) => words.indexOf(w) !== i);
    const fluency = 1 - (repeatedWords.length / words.length);

    return {
      coherence,
      relevance,
      accuracy,
      creativity,
      fluency,
      overall: (coherence + relevance + accuracy + creativity + fluency) / 5
    };
  }

  private selectByQuality(responses: ModelResponse[]): ModelResponse {
    const scored = responses.map(r => ({
      response: r,
      quality: this.evaluateQuality(r)
    }));

    scored.sort((a, b) => b.quality.overall - a.quality.overall);
    return scored[0].response;
  }

  private calculateSimilarity(text1: string, text2: string): number {
    const tokens1 = new Set(text1.toLowerCase().split(/\s+/));
    const tokens2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);

    return intersection.size / union.size;
  }

  private softmaxNormalize(weights: Record<string, number>): Record<string, number> {
    const values = Object.values(weights);
    const maxVal = Math.max(...values);
    const expValues = values.map(v => Math.exp(v - maxVal));
    const sumExp = expValues.reduce((a, b) => a + b, 0);

    const keys = Object.keys(weights);
    return Object.fromEntries(
      keys.map((k, i) => [k, expValues[i] / sumExp])
    );
  }

  private classifyTask(prompt: string): TaskType {
    const prompt_lower = prompt.toLowerCase();

    if (/\b(code|program|function|script|debug|error)\b/.test(prompt_lower)) {
      return TaskType.CODE;
    }
    if (/\b(analyze|analysis|compare|evaluate|assess)\b/.test(prompt_lower)) {
      return TaskType.ANALYSIS;
    }
    if (/\b(write|create|story|poem|creative|imagine)\b/.test(prompt_lower)) {
      return TaskType.CREATIVE;
    }
    if (/\b(summarize|summary|tl;dr|brief)\b/.test(prompt_lower)) {
      return TaskType.SUMMARIZATION;
    }
    if (/\b(translate|translation|in\s+\w+\s+language)\b/.test(prompt_lower)) {
      return TaskType.TRANSLATION;
    }
    if (/\b(classify|categorize|label|tag)\b/.test(prompt_lower)) {
      return TaskType.CLASSIFICATION;
    }
    if (/\b(extract|pull|get|find)\b/.test(prompt_lower)) {
      return TaskType.EXTRACTION;
    }
    if (/\b(think|reason|why|how|explain|logic)\b/.test(prompt_lower)) {
      return TaskType.REASONING;
    }
    if (/\b(chat|talk|conversation|discuss)\b/.test(prompt_lower)) {
      return TaskType.CONVERSATION;
    }

    return TaskType.GENERAL;
  }

  private estimateComplexity(prompt: string): 'low' | 'medium' | 'high' {
    const factors = {
      length: prompt.length,
      questions: (prompt.match(/\?/g) || []).length,
      instructions: (prompt.match(/\b(write|create|analyze|explain|describe)\b/gi) || []).length,
      context: (prompt.match(/\b(context|background|given|provided)\b/gi) || []).length
    };

    const score =
      (factors.length > 500 ? 2 : factors.length > 200 ? 1 : 0) +
      (factors.questions > 2 ? 2 : factors.questions > 0 ? 1 : 0) +
      (factors.instructions > 2 ? 2 : factors.instructions > 0 ? 1 : 0) +
      (factors.context > 0 ? 1 : 0);

    if (score >= 5) return 'high';
    if (score >= 2) return 'medium';
    return 'low';
  }

  private getTaskPerformance(modelId: string, taskType: TaskType): number {
    const benchmarks = this.benchmarkResults.get(modelId);
    if (!benchmarks) return 0.5;

    const taskBenchmarks = benchmarks.filter(b => b.taskType === taskType);
    if (taskBenchmarks.length === 0) return 0.5;

    const avgScore = taskBenchmarks.reduce((sum, b) => sum + b.qualityScore, 0) /
                     taskBenchmarks.length;
    return avgScore;
  }

  private getFallbackModels(primaryModelId: string): string[] {
    const primary = this.models.get(primaryModelId);
    if (!primary) return [];

    return Array.from(this.models.values())
      .filter(m =>
        m.id !== primaryModelId &&
        m.enabled &&
        m.capabilities.some(c => primary.capabilities.includes(c))
      )
      .sort((a, b) => b.performance.qualityScore - a.performance.qualityScore)
      .slice(0, 2)
      .map(m => m.id);
  }

  private calculateRoutingConfidence(
    taskType: TaskType,
    complexity: string,
    model: ModelConfig
  ): number {
    const taskPerf = this.getTaskPerformance(model.id, taskType);
    const complexityFactor = complexity === 'high' ? 0.8 :
                            complexity === 'medium' ? 0.9 : 1.0;

    return taskPerf * complexityFactor * model.performance.successRate;
  }

  private updatePerformanceMetrics(
    modelId: string,
    startTime: number,
    success: boolean
  ): void {
    const current = this.performanceHistory.get(modelId);
    if (!current) return;

    const latency = Date.now() - startTime;

    // Update with exponential moving average
    const alpha = 0.1;
    current.avgLatency = current.avgLatency * (1 - alpha) + latency * alpha;
    current.successRate = current.successRate * (1 - alpha) + (success ? 1 : 0) * alpha;

    this.performanceHistory.set(modelId, current);
  }

  private storeRequestHistory(requestId: string, response: ModelResponse): void {
    const history = this.requestHistory.get(requestId) || [];
    history.push(response);
    this.requestHistory.set(requestId, history);
  }

  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  // Public API methods

  getModels(): ModelConfig[] {
    return Array.from(this.models.values());
  }

  getModel(id: string): ModelConfig | undefined {
    return this.models.get(id);
  }

  addModel(model: ModelConfig): void {
    this.models.set(model.id, model);
    this.performanceHistory.set(model.id, model.performance);
    this.logger.info(`Added model: ${model.name}`);
  }

  updateModel(id: string, updates: Partial<ModelConfig>): void {
    const model = this.models.get(id);
    if (model) {
      Object.assign(model, updates);
      this.models.set(id, model);
    }
  }

  removeModel(id: string): void {
    this.models.delete(id);
    this.performanceHistory.delete(id);
  }

  getPerformanceHistory(modelId: string): ModelPerformance | undefined {
    return this.performanceHistory.get(modelId);
  }

  recordBenchmark(result: BenchmarkResult): void {
    const benchmarks = this.benchmarkResults.get(result.modelId) || [];
    benchmarks.push(result);
    this.benchmarkResults.set(result.modelId, benchmarks);
  }
}
