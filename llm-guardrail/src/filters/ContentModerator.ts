/**
 * Content Moderator
 * Moderates content for harmful, toxic, or inappropriate material
 */

import { createLogger } from '../utils/logger';
import { ModerationResult, ContentCategory, ToxicityLevel } from '../models/types';

const logger = createLogger('ContentModerator');

// Toxicity keywords and patterns
const TOXICITY_PATTERNS = {
  // Hate speech
  hate_speech: [
    /\b(hate|hatred)\s+(?:against|towards?|for)\b/i,
    /\b(supremacist?|supremacy)\b/i,
    /\b(antisemit| islamophob| xenophob| homophob| transphob)\w*\b/i,
    /\b(nazi|fascist|kkk|klan)\w*\b/i
  ],
  
  // Harassment
  harassment: [
    /\b(stalk|stalking|harass|harassing|harassment)\w*\b/i,
    /\b(bully|bullying|intimidate|threaten)\w*\b/i,
    /\b(dox|doxx|doxing|swat|swatting)\w*\b/i,
    /\b(cyberbully|cyberstalk)\w*\b/i
  ],
  
  // Violence
  violence: [
    /\b(kill|murder|assassinate|execute)\s+(?:you|them|him|her|someone)\b/i,
    /\b(bomb|shoot|stab|attack)\s+(?:at|the|your|their)\b/i,
    /\b(terrorist|terrorism|mass\s+shooting)\w*\b/i,
    /\b(genocide|ethnic\s+cleansing|holocaust)\w*\b/i
  ],
  
  // Self-harm
  self_harm: [
    /\b(suicid|kill\s+myself|end\s+my\s+life)\w*\b/i,
    /\b(self\s*harm|self\s*injur|cutting\s+myself)\w*\b/i,
    /\b(overdose|poison\s+myself)\w*\b/i,
    /\b(want\s+to\s+die|better\s+off\s+dead)\b/i
  ],
  
  // Sexual content
  sexual: [
    /\b(pornograph|porn|xxx|adult\s+content)\w*\b/i,
    /\b(sexual\s+assault|rape|molest)\w*\b/i,
    /\b(child\s+abuse|csam|child\s+porn)\w*\b/i,
    /\b(revenge\s+porn|non\s*consensual)\w*\b/i
  ],
  
  // Dangerous content
  dangerous: [
    /\b(how\s+to\s+make|build|create)\s+(?:a\s+)?(bomb|weapon|explosive|poison)\b/i,
    /\b(meth|cocaine|heroin|fentanyl)\s+(?:recipe|synthesis|production)\b/i,
    /\b(hack|crack|bypass)\s+(?:into|security|password)\b/i,
    /\b(create|spread|release)\s+(?:a\s+)?(virus|malware|ransomware)\b/i
  ],
  
  // Misinformation
  misinformation: [
    /\b(fake\s+news|hoax|conspiracy)\w*\b/i,
    /\b(deepfake|synthetic\s+media)\w*\b/i,
    /\b(misinformation|disinformation)\w*\b/i
  ],
  
  // Spam
  spam: [
    /\b(buy\s+now|click\s+here|limited\s+time)\w*\b/i,
    /\b(click\s+below|visit\s+our|order\s+now)\w*\b/i,
    /\b(make\s+money\s+fast|earn\s+\$\d+\s+per)\w*\b/i,
    /\b(viagra|cialis|weight\s+loss)\s+(?:pill|supplement)\w*\b/i
  ]
};

// Profanity list (simplified)
const PROFANITY_LIST = [
  'damn', 'hell', 'crap', 'stupid', 'idiot', 'moron',
  // Add more as needed
];

export class ContentModerator {
  private categories: Map<string, ContentCategory>;

  constructor() {
    this.categories = new Map();
    this.initializeCategories();
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Content Moderator...');
    logger.info(`✅ Loaded ${Object.keys(TOXICITY_PATTERNS).length} toxicity categories`);
  }

  private initializeCategories(): void {
    const categoryConfigs: ContentCategory[] = [
      {
        name: 'hate_speech',
        severity: 'critical',
        description: 'Content promoting hatred against protected groups',
        action: 'block'
      },
      {
        name: 'harassment',
        severity: 'high',
        description: 'Content intended to harass or intimidate',
        action: 'block'
      },
      {
        name: 'violence',
        severity: 'critical',
        description: 'Content promoting or depicting violence',
        action: 'block'
      },
      {
        name: 'self_harm',
        severity: 'critical',
        description: 'Content promoting self-harm or suicide',
        action: 'block_with_resources'
      },
      {
        name: 'sexual',
        severity: 'high',
        description: 'Sexually explicit or harmful content',
        action: 'block'
      },
      {
        name: 'dangerous',
        severity: 'critical',
        description: 'Instructions for dangerous or illegal activities',
        action: 'block'
      },
      {
        name: 'misinformation',
        severity: 'medium',
        description: 'Potentially harmful misinformation',
        action: 'flag'
      },
      {
        name: 'spam',
        severity: 'low',
        description: 'Spam or promotional content',
        action: 'flag'
      }
    ];

    for (const category of categoryConfigs) {
      this.categories.set(category.name, category);
    }
  }

  async moderate(content: string): Promise<ModerationResult> {
    const startTime = Date.now();
    const violations: Array<{
      category: string;
      severity: string;
      confidence: number;
      matches: string[];
    }> = [];

    // Check each category
    for (const [categoryName, patterns] of Object.entries(TOXICITY_PATTERNS)) {
      const matches = this.checkPatterns(content, patterns);
      
      if (matches.length > 0) {
        const category = this.categories.get(categoryName);
        const confidence = this.calculateConfidence(matches, content);
        
        violations.push({
          category: categoryName,
          severity: category?.severity || 'medium',
          confidence,
          matches: matches.slice(0, 5) // Limit matches
        });
      }
    }

    // Check profanity
    const profanityMatches = this.checkProfanity(content);
    if (profanityMatches.length > 0) {
      violations.push({
        category: 'profanity',
        severity: 'low',
        confidence: profanityMatches.length / 10,
        matches: profanityMatches
      });
    }

    // Calculate overall toxicity
    const toxicity = this.calculateToxicity(violations);
    
    // Determine action
    const action = this.determineAction(violations);

    // Generate explanation
    const explanation = this.generateExplanation(violations);

    return {
      allowed: action !== 'block' && action !== 'block_with_resources',
      action,
      toxicity,
      violations: violations.map(v => ({
        category: v.category,
        severity: v.severity as any,
        confidence: v.confidence,
        matches: v.matches
      })),
      explanation,
      metadata: {
        processingTime: Date.now() - startTime,
        timestamp: Date.now()
      }
    };
  }

  private checkPatterns(content: string, patterns: RegExp[]): string[] {
    const matches: string[] = [];
    
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        matches.push(match[0]);
      }
    }
    
    return matches;
  }

  private checkProfanity(content: string): string[] {
    const matches: string[] = [];
    const lowerContent = content.toLowerCase();
    
    for (const word of PROFANITY_LIST) {
      if (lowerContent.includes(word)) {
        matches.push(word);
      }
    }
    
    return matches;
  }

  private calculateConfidence(matches: string[], content: string): number {
    // Simple confidence calculation based on match density
    const matchLength = matches.reduce((sum, m) => sum + m.length, 0);
    const ratio = matchLength / content.length;
    
    // Boost confidence for multiple matches
    const matchBoost = Math.min(matches.length * 0.1, 0.3);
    
    return Math.min(1, ratio * 5 + matchBoost);
  }

  private calculateToxicity(violations: Array<{ severity: string; confidence: number }>): ToxicityLevel {
    if (violations.length === 0) return 'none';

    const weights = {
      critical: 1.0,
      high: 0.7,
      medium: 0.4,
      low: 0.1
    };

    let score = 0;
    for (const violation of violations) {
      const weight = weights[violation.severity as keyof typeof weights] || 0;
      score += weight * violation.confidence;
    }

    // Normalize
    score = Math.min(1, score);

    if (score >= 0.8) return 'severe';
    if (score >= 0.5) return 'high';
    if (score >= 0.2) return 'medium';
    return 'low';
  }

  private determineAction(violations: Array<{ category: string; severity: string }>): string {
    const hasCritical = violations.some(v => v.severity === 'critical');
    const hasHigh = violations.some(v => v.severity === 'high');
    
    if (hasCritical) {
      // Check if it's self-harm
      const hasSelfHarm = violations.some(v => v.category === 'self_harm');
      if (hasSelfHarm) return 'block_with_resources';
      return 'block';
    }
    
    if (hasHigh) return 'flag';
    
    return 'allow';
  }

  private generateExplanation(violations: Array<{ category: string; severity: string }>): string {
    if (violations.length === 0) {
      return 'Content appears safe.';
    }

    const critical = violations.filter(v => v.severity === 'critical');
    const high = violations.filter(v => v.severity === 'high');
    
    if (critical.length > 0) {
      const categories = critical.map(v => v.category.replace('_', ' ')).join(', ');
      return `Content blocked due to critical violations: ${categories}. This type of content violates our safety policies.`;
    }
    
    if (high.length > 0) {
      const categories = high.map(v => v.category.replace('_', ' ')).join(', ');
      return `Content flagged for review due to: ${categories}.`;
    }
    
    return 'Content contains minor policy concerns and has been flagged.';
  }

  async batchModerate(contents: string[]): Promise<ModerationResult[]> {
    return Promise.all(contents.map(content => this.moderate(content)));
  }

  getCategories(): ContentCategory[] {
    return Array.from(this.categories.values());
  }

  updateCategory(name: string, updates: Partial<ContentCategory>): void {
    const category = this.categories.get(name);
    if (category) {
      this.categories.set(name, { ...category, ...updates });
      logger.info(`Updated category ${name}:`, updates);
    }
  }
}
