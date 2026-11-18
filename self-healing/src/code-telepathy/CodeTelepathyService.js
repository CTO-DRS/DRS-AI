/**
 * Code Telepathy Service
 *
 * Intent-aware code generation and suggestion:
 * - Read programmer's intent from comments/patterns
 * - Generate completions before typing
 * - Context-aware suggestions
 * - Natural language to code translation
 * - Predict next edits
 *
 * @class CodeTelepathyService
 * @version 1.0.0
 */

const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { getRedisClient } = require('../utils/redis');

class CodeTelepathyService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.config = {
      enabled: options.enabled !== false,
      maxSuggestions: options.maxSuggestions || 5,
      confidenceThreshold: options.confidenceThreshold || 0.7,
      ...options,
    };
    this.redis = null;
    this.isInitialized = false;
    this.userPatterns = new Map();
    this.codeTemplates = new Map();
  }

  async initialize() {
    try {
      logger.info('🧠 Initializing Code Telepathy Service...');
      this.redis = await getRedisClient();
      await this.loadTemplates();
      this.isInitialized = true;
      logger.info('✅ Code Telepathy Service initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize Code Telepathy:', error);
      throw error;
    }
  }

  async loadTemplates() {
    // Code templates for common patterns
    this.codeTemplates.set('api_endpoint', {
      pattern: /create (?:a |an )?(?:GET|POST|PUT|DELETE|PATCH) endpoint/i,
      template: (matches) => `
// {{METHOD}} {{PATH}}
app.{{methodLower}}('{{path}}', async (req, res) => {
  try {
    // TODO: Implement logic
    const result = await service.handle{{Method}}(req.body);
    res.json({ status: 'success', data: result });
  } catch (error) {
    logger.error('Error in {{path}}:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});`,
    });

    this.codeTemplates.set('database_model', {
      pattern: /create (?:a |an )?(?:model|schema|table) for/i,
      template: (entity) => `
const { DataTypes } = require('sequelize');

const {{Entity}} = sequelize.define('{{entity}}', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

module.exports = {{Entity}};`,
    });

    this.codeTemplates.set('auth_middleware', {
      pattern: /(?:create|add) (?:auth|authentication|authorization) middleware/i,
      template: () => `
const jwt = require('jsonwebtoken');

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ status: 'error', message: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ status: 'error', message: 'Invalid token' });
  }
};

module.exports = authMiddleware;`,
    });

    this.codeTemplates.set('error_handler', {
      pattern: /(?:create|add) (?:error handler|error handling)/i,
      template: () => `
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = \`\${statusCode}\`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';
  
  res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
  });
};

module.exports = { AppError, errorHandler };`,
    });

    this.codeTemplates.set('test_file', {
      pattern: /(?:create|write) (?:test|spec|unit test) for/i,
      template: (entity) => `
const request = require('supertest');
const app = require('../src/app');

describe('{{Entity}} API', () => {
  let authToken;
  
  beforeAll(async () => {
    // Setup test data
  });
  
  describe('POST /api/{{entities}}', () => {
    it('should create a new {{entity}}', async () => {
      const response = await request(app)
        .post('/api/{{entities}}')
        .set('Authorization', \`Bearer \${authToken}\`)
        .send({ name: 'Test {{Entity}}' });
      
      expect(response.status).toBe(201);
      expect(response.body.status).toBe('success');
    });
    
    it('should return 400 for invalid data', async () => {
      const response = await request(app)
        .post('/api/{{entities}}')
        .set('Authorization', \`Bearer \${authToken}\`)
        .send({});
      
      expect(response.status).toBe(400);
    });
  });
});`,
    });

    logger.info(`📚 Loaded ${this.codeTemplates.size} code templates`);
  }

  /**
   * Read intent from comment or partial code
   * @param {Object} params - Input parameters
   * @returns {Promise<Object>} Detected intent with suggestions
   */
  async readIntent(params) {
    const { comment, partialCode, language = 'javascript', userId, context } = params;
    const sessionId = uuidv4();

    logger.info(`🧠 Reading intent for user ${userId || 'anonymous'}`);

    const intent = {
      sessionId,
      originalInput: comment || partialCode,
      detectedIntents: [],
      suggestions: [],
      confidence: 0,
    };

    // Check against code templates
    for (const [templateId, template] of this.codeTemplates) {
      const match = (comment || partialCode).match(template.pattern);
      if (match) {
        const generated = this.fillTemplate(template.template(match), match, comment, partialCode);
        intent.detectedIntents.push({
          templateId,
          confidence: this.calculateConfidence(match, comment, partialCode),
          match,
        });
        intent.suggestions.push({
          type: 'template',
          templateId,
          code: generated,
          description: `Generate ${templateId.replace(/_/g, ' ')}`,
          confidence: this.calculateConfidence(match, comment, partialCode),
        });
      }
    }

    // Generate completion suggestions
    if (partialCode) {
      const completions = await this.generateCompletions(partialCode, language, context);
      intent.suggestions.push(...completions);
    }

    // Generate from natural language
    if (comment) {
      const nlSuggestions = await this.naturalLanguageToCode(comment, language);
      intent.suggestions.push(...nlSuggestions);
    }

    // Sort by confidence
    intent.suggestions.sort((a, b) => b.confidence - a.confidence);
    intent.suggestions = intent.suggestions.slice(0, this.config.maxSuggestions);

    intent.confidence = intent.suggestions.length > 0
      ? Math.max(...intent.suggestions.map(s => s.confidence))
      : 0;

    // Store intent for learning
    if (userId) {
      await this.storeUserPattern(userId, intent);
    }

    return intent;
  }

  /**
   * Predict next code edits
   * @param {Object} params - Current code state
   * @returns {Promise<Object>} Predicted edits
   */
  async predictNextEdits(params) {
    const { currentCode, cursorPosition, language = 'javascript', userId, recentEdits } = params;

    logger.info(`🔮 Predicting next edits at position ${cursorPosition}`);

    const predictions = {
      cursorPosition,
      predictedEdits: [],
      confidence: 0,
    };

    // Analyze recent edit patterns
    const pattern = this.analyzeEditPattern(recentEdits);

    // Predict based on cursor position
    if (currentCode) {
      const lines = currentCode.split('\n');
      const currentLine = lines[cursorPosition.line - 1] || '';
      const trimmed = currentLine.trim();

      // Predict closing brackets
      const openBrackets = (currentCode.match(/\{/g) || []).length;
      const closeBrackets = (currentCode.match(/\}/g) || []).length;
      if (openBrackets > closeBrackets) {
        predictions.predictedEdits.push({
          type: 'insertion',
          description: 'Close open block',
          code: '\n}',
          position: { line: cursorPosition.line, column: currentLine.length },
          confidence: 0.95,
        });
      }

      // Predict semicolons
      if (trimmed && !trimmed.endsWith(';') && !trimmed.endsWith('{') &&
          !trimmed.endsWith('}') && !trimmed.startsWith('//') &&
          !trimmed.startsWith('if') && !trimmed.startsWith('for') &&
          !trimmed.startsWith('while')) {
        predictions.predictedEdits.push({
          type: 'insertion',
          description: 'Add semicolon',
          code: ';',
          position: { line: cursorPosition.line, column: currentLine.length },
          confidence: 0.85,
        });
      }

      // Predict imports
      if (currentCode.includes('require(') && !currentCode.includes("require('express')")) {
        const usedModules = this.extractUsedModules(currentCode);
        for (const mod of usedModules) {
          if (!currentCode.includes(`require('${mod}')`)) {
            predictions.predictedEdits.push({
              type: 'insertion',
              description: `Add import for ${mod}`,
              code: `const ${this.camelCase(mod)} = require('${mod}');\n`,
              position: { line: 1, column: 0 },
              confidence: 0.8,
            });
          }
        }
      }

      // Predict based on user patterns
      if (userId) {
        const userPattern = this.userPatterns.get(userId);
        if (userPattern && pattern.repetitive) {
          predictions.predictedEdits.push({
            type: 'repetition',
            description: 'Based on your editing pattern',
            code: pattern.nextLikelyEdit,
            position: cursorPosition,
            confidence: 0.75,
          });
        }
      }
    }

    predictions.confidence = predictions.predictedEdits.length > 0
      ? predictions.predictedEdits.reduce((sum, e) => sum + e.confidence, 0) / predictions.predictedEdits.length
      : 0;

    return predictions;
  }

  /**
   * Complete partial code
   * @param {Object} params - Completion parameters
   * @returns {Promise<Object>} Completions
   */
  async completeCode(params) {
    const { partialCode, language = 'javascript', userId, maxCompletions = 3 } = params;
    const completions = [];

    logger.info(`✍️ Completing code: ${partialCode.slice(-50)}...`);

    // Variable completions
    const variables = this.extractVariables(partialCode);
    for (const variable of variables) {
      completions.push({
        type: 'variable',
        code: variable,
        description: `Variable: ${variable}`,
        confidence: 0.9,
      });
    }

    // Function completions
    const functions = this.extractFunctions(partialCode);
    for (const func of functions) {
      completions.push({
        type: 'function',
        code: `${func}()`,
        description: `Function: ${func}()`,
        confidence: 0.85,
      });
    }

    // Template completions
    const templateCompletions = await this.matchTemplates(partialCode, language);
    completions.push(...templateCompletions);

    // Sort and limit
    completions.sort((a, b) => b.confidence - a.confidence);

    return {
      completions: completions.slice(0, maxCompletions),
      totalAvailable: completions.length,
    };
  }

  fillTemplate(template, match, comment, partialCode) {
    let filled = template;

    // Extract entity name from comment
    const entityMatch = (comment || partialCode)?.match(/for\s+(\w+)|called\s+(\w+)|named\s+(\w+)/i);
    const entity = entityMatch ? (entityMatch[1] || entityMatch[2] || entityMatch[3]) : 'Example';
    const Entity = entity.charAt(0).toUpperCase() + entity.slice(1);
    const entities = entity.toLowerCase() + 's';
    const entityLower = entity.toLowerCase();

    filled = filled.replace(/\{\{Entity\}\}/g, Entity);
    filled = filled.replace(/\{\{entity\}\}/g, entityLower);
    filled = filled.replace(/\{\{entities\}\}/g, entities);

    // HTTP method
    const methodMatch = comment?.match(/(GET|POST|PUT|DELETE|PATCH)/i);
    if (methodMatch) {
      filled = filled.replace(/\{\{METHOD\}\}/g, methodMatch[1]);
      filled = filled.replace(/\{\{methodLower\}\}/g, methodMatch[1].toLowerCase());
      filled = filled.replace(/\{\{Method\}\}/g, methodMatch[1].charAt(0) + methodMatch[1].slice(1).toLowerCase());
    }

    // Path
    const pathMatch = comment?.match(/['"\/]?\/([\w\/]+)['"]??/);
    if (pathMatch) {
      filled = filled.replace(/\{\{path\}\}/g, '/' + pathMatch[1]);
    }

    return filled;
  }

  calculateConfidence(match, comment, partialCode) {
    let confidence = 0.6;
    if (match && match[0]) confidence += 0.2;
    if (comment && comment.length > 10) confidence += 0.1;
    if (partialCode && partialCode.length > 50) confidence += 0.1;
    return Math.min(confidence, 0.99);
  }

  async generateCompletions(partialCode, language, context) {
    const completions = [];

    // Detect what user is trying to write
    if (partialCode.endsWith('req.')) {
      completions.push({
        type: 'property',
        code: 'req.body',
        description: 'Request body',
        confidence: 0.9,
      });
      completions.push({
        type: 'property',
        code: 'req.params',
        description: 'URL parameters',
        confidence: 0.85,
      });
      completions.push({
        type: 'property',
        code: 'req.query',
        description: 'Query parameters',
        confidence: 0.85,
      });
    }

    if (partialCode.endsWith('res.')) {
      completions.push({
        type: 'method',
        code: 'res.json({})',
        description: 'Send JSON response',
        confidence: 0.9,
      });
      completions.push({
        type: 'method',
        code: 'res.status(200)',
        description: 'Set status code',
        confidence: 0.85,
      });
    }

    if (partialCode.endsWith('async ')) {
      completions.push({
        type: 'keyword',
        code: 'async function',
        description: 'Async function declaration',
        confidence: 0.9,
      });
    }

    return completions;
  }

  async naturalLanguageToCode(comment, language) {
    const suggestions = [];

    // Simple NL to code mappings
    const mappings = [
      {
        pattern: /(?:get|fetch|retrieve)\s+(?:all |the )?(\w+)/i,
        code: (match) => `const ${match[1]} = await db.${match[1]}.findAll();`,
        description: 'Fetch all records',
      },
      {
        pattern: /(?:create|add|insert)\s+(?:a |an |new )?(\w+)/i,
        code: (match) => `const ${match[1]} = await db.${match[1]}.create(req.body);`,
        description: 'Create new record',
      },
      {
        pattern: /(?:update|modify|change)\s+(?:the )?(\w+)/i,
        code: (match) => `const ${match[1]} = await db.${match[1]}.update(req.body, { where: { id: req.params.id } });`,
        description: 'Update record',
      },
      {
        pattern: /(?:delete|remove)\s+(?:the )?(\w+)/i,
        code: (match) => `await db.${match[1]}.destroy({ where: { id: req.params.id } });`,
        description: 'Delete record',
      },
      {
        pattern: /(?:validate|check)\s+(?:the )?(.+)/i,
        code: () => `if (!req.body || Object.keys(req.body).length === 0) {
  return res.status(400).json({ status: 'error', message: 'Invalid input' });
}`,
        description: 'Validate input',
      },
    ];

    for (const mapping of mappings) {
      const match = comment.match(mapping.pattern);
      if (match) {
        suggestions.push({
          type: 'nl_to_code',
          code: mapping.code(match),
          description: mapping.description,
          confidence: 0.82,
        });
      }
    }

    return suggestions;
  }

  analyzeEditPattern(recentEdits) {
    if (!recentEdits || recentEdits.length < 3) {
      return { repetitive: false };
    }

    // Check for repetitive patterns
    const types = recentEdits.map(e => e.type);
    const uniqueTypes = [...new Set(types)];

    return {
      repetitive: uniqueTypes.length <= 2,
      dominantType: uniqueTypes[0],
      nextLikelyEdit: recentEdits[recentEdits.length - 1].code,
    };
  }

  extractUsedModules(code) {
    const modules = [];
    const patterns = [
      /new\s+(\w+)\(/g,
      /(\w+)\.\w+/g,
      /from\s+['"](\w+)['"]/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        if (!['const', 'let', 'var', 'return', 'if', 'for', 'while'].includes(match[1])) {
          modules.push(match[1].toLowerCase());
        }
      }
    }

    return [...new Set(modules)];
  }

  camelCase(str) {
    return str.replace(/[-_](.)/g, (_, char) => char.toUpperCase());
  }

  extractVariables(code) {
    const variables = new Set();
    const matches = code.matchAll(/(?:const|let|var)\s+(\w+)\s*=/g);
    for (const match of matches) {
      variables.add(match[1]);
    }
    return [...variables];
  }

  extractFunctions(code) {
    const functions = new Set();
    const matches = code.matchAll(/(?:function|=>)\s*(\w+)\s*\(/g);
    for (const match of matches) {
      functions.add(match[1]);
    }
    // Also extract method calls
    const methodMatches = code.matchAll(/(\w+)\.\w+\s*\(/g);
    for (const match of methodMatches) {
      functions.add(match[1]);
    }
    return [...functions];
  }

  async matchTemplates(partialCode, language) {
    const completions = [];

    for (const [templateId, template] of this.codeTemplates) {
      if (template.pattern.test(partialCode)) {
        const generated = this.fillTemplate(template.template(), null, partialCode, partialCode);
        completions.push({
          type: 'template',
          code: generated,
          description: `Complete ${templateId}`,
          confidence: 0.88,
        });
      }
    }

    return completions;
  }

  async storeUserPattern(userId, intent) {
    try {
      const key = `telepathy:user:${userId}:patterns`;
      await this.redis.lpush(key, JSON.stringify(intent));
      await this.redis.ltrim(key, 0, 99);
    } catch (error) {
      logger.warn('⚠️ Could not store user pattern');
    }
  }

  getStats() {
    return {
      templates: this.codeTemplates.size,
      userPatterns: this.userPatterns.size,
      isInitialized: this.isInitialized,
    };
  }

  async shutdown() {
    logger.info('🛑 Shutting down Code Telepathy Service...');
    this.userPatterns.clear();
    this.codeTemplates.clear();
    if (this.redis) await this.redis.quit();
    logger.info('✅ Code Telepathy Service shutdown complete');
  }
}

module.exports = CodeTelepathyService;
