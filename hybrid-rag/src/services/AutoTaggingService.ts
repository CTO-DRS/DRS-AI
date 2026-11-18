/**
 * Auto-Tagging Service
 * Automatic document tagging using lightweight classification
 */

import { createLogger } from '../utils/logger';
import nlp from 'compromise';
import { DocumentTags, TagCategory, TaggingConfig } from '../models/types';

const logger = createLogger('AutoTaggingService');

// Predefined tag categories
const TAG_CATEGORIES: TagCategory[] = [
  {
    name: 'programming',
    keywords: ['code', 'programming', 'software', 'development', 'api', 'function', 'class', 'variable'],
    patterns: [/\b(const|let|var|function|class|import|export)\b/g],
    weight: 1.0
  },
  {
    name: 'database',
    keywords: ['sql', 'database', 'query', 'table', 'schema', 'index', 'join', 'select', 'insert'],
    patterns: [/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN)\b/g],
    weight: 1.0
  },
  {
    name: 'security',
    keywords: ['security', 'authentication', 'authorization', 'encryption', 'vulnerability', 'exploit', 'hack'],
    patterns: [/\b(password|token|jwt|oauth|ssl|tls|cve)\b/gi],
    weight: 1.0
  },
  {
    name: 'cloud',
    keywords: ['cloud', 'aws', 'azure', 'gcp', 'kubernetes', 'docker', 'serverless', 'lambda'],
    patterns: [/\b(ec2|s3|rds|ecs|eks|gke|aks)\b/gi],
    weight: 1.0
  },
  {
    name: 'machine_learning',
    keywords: ['machine learning', 'ai', 'neural network', 'deep learning', 'model', 'training', 'inference'],
    patterns: [/\b(tensorflow|pytorch|sklearn|neural|dataset|classification)\b/gi],
    weight: 1.0
  },
  {
    name: 'web_development',
    keywords: ['web', 'frontend', 'backend', 'html', 'css', 'javascript', 'react', 'vue', 'angular'],
    patterns: [/\b(frontend|backend|fullstack|rest|graphql|http)\b/gi],
    weight: 1.0
  },
  {
    name: 'devops',
    keywords: ['devops', 'ci/cd', 'pipeline', 'deployment', 'infrastructure', 'monitoring', 'logging'],
    patterns: [/\b(jenkins|gitlab-ci|github-actions|terraform|ansible)\b/gi],
    weight: 1.0
  },
  {
    name: 'documentation',
    keywords: ['documentation', 'readme', 'guide', 'tutorial', 'manual', 'reference'],
    patterns: [/\b(documentation|readme\.md|changelog|api-docs)\b/gi],
    weight: 0.8
  },
  {
    name: 'configuration',
    keywords: ['config', 'configuration', 'settings', 'environment', 'env', 'yaml', 'json', 'xml'],
    patterns: [/\b(config\.|\.yaml|\.yml|\.json|\.env|\.toml)\b/gi],
    weight: 0.8
  },
  {
    name: 'testing',
    keywords: ['test', 'testing', 'unit test', 'integration test', 'e2e', 'jest', 'mocha'],
    patterns: [/\b(describe|it\(|test\(|expect\(|assert\()\b/g],
    weight: 0.9
  },
  {
    name: 'api',
    keywords: ['api', 'endpoint', 'rest', 'graphql', 'swagger', 'openapi'],
    patterns: [/\b(GET|POST|PUT|DELETE|PATCH)\s+\/\w+/g],
    weight: 1.0
  },
  {
    name: 'mobile',
    keywords: ['mobile', 'android', 'ios', 'flutter', 'react native', 'swift', 'kotlin'],
    patterns: [/\b(android|ios|flutter|react-native|xcode|gradle)\b/gi],
    weight: 0.9
  }
];

// Technical entity patterns
const ENTITY_PATTERNS = {
  languages: /\b(javascript|typescript|python|java|go|golang|rust|cpp|c\+\+|ruby|php|swift|kotlin)\b/gi,
  frameworks: /\b(react|vue|angular|svelte|next\.js|nuxt|django|flask|express|spring)\b/gi,
  databases: /\b(postgresql|mysql|mongodb|redis|elasticsearch|cassandra|dynamodb)\b/gi,
  tools: /\b(git|docker|kubernetes|jenkins|github|gitlab|vscode|vim)\b/gi
};

export class AutoTaggingService {
  private categories: TagCategory[];
  private config: TaggingConfig;

  constructor() {
    this.categories = TAG_CATEGORIES;
    this.config = {
      minConfidence: 0.3,
      maxTags: 10,
      includeEntities: true,
      includeKeywords: true
    };
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Auto-Tagging Service...');
    logger.info(`✅ Loaded ${this.categories.length} tag categories`);
  }

  async tagDocument(content: string, title?: string): Promise<DocumentTags> {
    const startTime = Date.now();
    
    const textToAnalyze = title ? `${title} ${content}` : content;
    
    // Category-based tagging
    const categoryTags = this.tagByCategory(textToAnalyze);
    
    // Entity extraction
    const entityTags = this.config.includeEntities 
      ? this.extractEntities(textToAnalyze)
      : [];
    
    // Keyword extraction
    const keywordTags = this.config.includeKeywords
      ? this.extractKeywords(textToAnalyze)
      : [];

    // Combine and deduplicate
    const allTags = [...categoryTags, ...entityTags, ...keywordTags];
    const uniqueTags = this.deduplicateTags(allTags);
    
    // Sort by confidence and limit
    const sortedTags = uniqueTags
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.config.maxTags);

    logger.info(`Tagged document in ${Date.now() - startTime}ms with ${sortedTags.length} tags`);

    return {
      tags: sortedTags.map(t => t.tag),
      detailed: sortedTags,
      categories: [...new Set(sortedTags.map(t => t.category))]
    };
  }

  private tagByCategory(text: string): Array<{ tag: string; confidence: number; category: string }> {
    const tags: Array<{ tag: string; confidence: number; category: string }> = [];
    const lowerText = text.toLowerCase();

    for (const category of this.categories) {
      let score = 0;
      let matches = 0;

      // Check keywords
      for (const keyword of category.keywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        const keywordMatches = text.match(regex);
        if (keywordMatches) {
          matches += keywordMatches.length;
          score += keywordMatches.length * 0.1;
        }
      }

      // Check patterns
      for (const pattern of category.patterns) {
        const patternMatches = text.match(pattern);
        if (patternMatches) {
          matches += patternMatches.length;
          score += patternMatches.length * 0.2;
        }
      }

      // Apply category weight
      score *= category.weight;

      // Normalize by text length
      score = score / (text.length / 1000);

      // Boost if multiple matches
      if (matches >= 3) {
        score *= 1.2;
      }

      if (score >= this.config.minConfidence) {
        tags.push({
          tag: category.name,
          confidence: Math.min(1, score),
          category: 'topic'
        });
      }
    }

    return tags;
  }

  private extractEntities(text: string): Array<{ tag: string; confidence: number; category: string }> {
    const tags: Array<{ tag: string; confidence: number; category: string }> = [];

    for (const [category, pattern] of Object.entries(ENTITY_PATTERNS)) {
      const matches = text.match(pattern);
      if (matches) {
        // Count occurrences
        const counts = new Map<string, number>();
        for (const match of matches) {
          const normalized = match.toLowerCase();
          counts.set(normalized, (counts.get(normalized) || 0) + 1);
        }

        // Add tags for frequently mentioned entities
        for (const [entity, count] of counts) {
          const confidence = Math.min(1, count * 0.2 + 0.3);
          tags.push({
            tag: entity,
            confidence,
            category
          });
        }
      }
    }

    return tags;
  }

  private extractKeywords(text: string): Array<{ tag: string; confidence: number; category: string }> {
    const tags: Array<{ tag: string; confidence: number; category: string }> = [];

    try {
      const doc = nlp(text);
      
      // Extract nouns and technical terms
      const nouns = doc.nouns().out('array');
      const terms = doc.terms().json();

      // Count term frequency
      const termCounts = new Map<string, number>();
      
      for (const term of terms) {
        const word = term.text?.toLowerCase();
        if (word && word.length > 3 && !this.isStopWord(word)) {
          termCounts.set(word, (termCounts.get(word) || 0) + 1);
        }
      }

      // Add frequent terms as tags
      for (const [term, count] of termCounts) {
        if (count >= 2) {
          tags.push({
            tag: term,
            confidence: Math.min(1, count * 0.15),
            category: 'keyword'
          });
        }
      }

      // Extract noun phrases
      const nounPhrases = doc.match('#Adjective+ #Noun+').out('array');
      for (const phrase of nounPhrases.slice(0, 5)) {
        tags.push({
          tag: phrase.toLowerCase(),
          confidence: 0.5,
          category: 'phrase'
        });
      }

    } catch (error) {
      logger.warn('Keyword extraction failed:', error);
    }

    return tags;
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
      'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his',
      'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'who', 'boy',
      'did', 'she', 'use', 'her', 'way', 'many', 'oil', 'sit', 'set', 'run',
      'eat', 'far', 'sea', 'eye', 'ago', 'off', 'too', 'any', 'say', 'man',
      'try', 'ask', 'end', 'why', 'let', 'put', 'say', 'she', 'try', 'way',
      'own', 'say', 'too', 'old', 'tell', 'very', 'when', 'much', 'would',
      'there', 'their', 'what', 'said', 'each', 'which', 'will', 'about',
      'could', 'other', 'after', 'first', 'never', 'these', 'think', 'where',
      'being', 'every', 'great', 'might', 'shall', 'still', 'those', 'while',
      'this', 'that', 'with', 'have', 'from', 'they', 'know', 'want', 'been',
      'good', 'much', 'some', 'time', 'very', 'when', 'come', 'here', 'just',
      'like', 'long', 'make', 'over', 'such', 'take', 'than', 'them', 'well',
      'were', 'what', 'your', 'also', 'back', 'call', 'came', 'come',
      'could', 'find', 'give', 'into', 'look', 'made', 'most', 'name',
      'only', 'part', 'should', 'still', 'such', 'take', 'than', 'them'
    ]);

    return stopWords.has(word.toLowerCase());
  }

  private deduplicateTags(
    tags: Array<{ tag: string; confidence: number; category: string }>
  ): Array<{ tag: string; confidence: number; category: string }> {
    const seen = new Map<string, { tag: string; confidence: number; category: string }>();

    for (const tag of tags) {
      const normalized = tag.tag.toLowerCase().replace(/[^a-z0-9]/g, '');
      const existing = seen.get(normalized);
      
      if (!existing || existing.confidence < tag.confidence) {
        seen.set(normalized, tag);
      }
    }

    return Array.from(seen.values());
  }

  async batchTag(documents: Array<{ content: string; title?: string }>): Promise<DocumentTags[]> {
    return Promise.all(
      documents.map(doc => this.tagDocument(doc.content, doc.title))
    );
  }

  addCategory(category: TagCategory): void {
    this.categories.push(category);
    logger.info(`Added tag category: ${category.name}`);
  }

  updateConfig(config: Partial<TaggingConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Tagging config updated:', this.config);
  }

  getCategories(): TagCategory[] {
    return this.categories;
  }
}
