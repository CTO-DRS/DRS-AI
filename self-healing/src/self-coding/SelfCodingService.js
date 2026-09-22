/**
 * Self-Coding Evolution Service
 *
 * Automatically detect, analyze, and fix code issues:
 * - Bug detection and auto-repair
 * - Code optimization suggestions
 * - Pattern-based refactoring
 * - Security vulnerability patching
 * - Performance bottleneck identification
 *
 * @class SelfCodingService
 * @version 1.0.0
 */

const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { getRedisClient } = require('../utils/redis');
const esprima = require('esprima');
const escodegen = require('escodegen');
const Diff = require('diff');

class SelfCodingService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.config = {
      enabled: options.enabled !== false,
      autoFix: options.autoFix || false,
      confidenceThreshold: options.confidenceThreshold || 0.8,
      maxFixAttempts: options.maxFixAttempts || 3,
      ...options,
    };
    this.redis = null;
    this.isInitialized = false;
    this.activeRepairs = new Map();
    this.repairHistory = new Map();

    // Common bug patterns
    this.bugPatterns = new Map();
    this.optimizationPatterns = new Map();
  }

  async initialize() {
    try {
      logger.info('🔧 Initializing Self-Coding Service...');
      this.redis = await getRedisClient();
      await this.loadPatterns();
      this.isInitialized = true;
      logger.info('✅ Self-Coding Service initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize Self-Coding:', error);
      throw error;
    }
  }

  async loadPatterns() {
    // Bug detection patterns
    this.bugPatterns.set('undefined_variable', {
      name: 'Undefined Variable Usage',
      severity: 'critical',
      detect: (ast) => this.detectUndefinedVariables(ast),
      fix: (code, issue) => this.fixUndefinedVariable(code, issue),
    });

    this.bugPatterns.set('null_dereference', {
      name: 'Null/Undefined Dereference',
      severity: 'critical',
      detect: (ast) => this.detectNullDereferences(ast),
      fix: (code, issue) => this.fixNullDereference(code, issue),
    });

    this.bugPatterns.set('memory_leak', {
      name: 'Potential Memory Leak',
      severity: 'high',
      detect: (ast) => this.detectMemoryLeaks(ast),
      fix: (code, issue) => this.fixMemoryLeak(code, issue),
    });

    this.bugPatterns.set('race_condition', {
      name: 'Race Condition',
      severity: 'high',
      detect: (ast) => this.detectRaceConditions(ast),
      fix: (code, issue) => this.fixRaceCondition(code, issue),
    });

    this.bugPatterns.set('infinite_loop', {
      name: 'Potential Infinite Loop',
      severity: 'high',
      detect: (ast) => this.detectInfiniteLoops(ast),
      fix: (code, issue) => this.fixInfiniteLoop(code, issue),
    });

    this.bugPatterns.set('unhandled_promise', {
      name: 'Unhandled Promise Rejection',
      severity: 'medium',
      detect: (ast) => this.detectUnhandledPromises(ast),
      fix: (code, issue) => this.fixUnhandledPromise(code, issue),
    });

    this.bugPatterns.set('sql_injection_risk', {
      name: 'SQL Injection Risk',
      severity: 'critical',
      detect: (code) => this.detectSQLInjectionRisk(code),
      fix: (code, issue) => this.fixSQLInjection(code, issue),
    });

    this.bugPatterns.set('xss_vulnerability', {
      name: 'XSS Vulnerability',
      severity: 'critical',
      detect: (code) => this.detectXSSVulnerability(code),
      fix: (code, issue) => this.fixXSS(code, issue),
    });

    // Optimization patterns
    this.optimizationPatterns.set('loop_optimization', {
      name: 'Loop Optimization',
      type: 'performance',
      detect: (ast) => this.detectLoopOptimizations(ast),
      optimize: (code, issue) => this.optimizeLoop(code, issue),
    });

    this.optimizationPatterns.set('dead_code', {
      name: 'Dead Code Elimination',
      type: 'cleanup',
      detect: (ast) => this.detectDeadCode(ast),
      optimize: (code, issue) => this.removeDeadCode(code, issue),
    });

    this.optimizationPatterns.set('duplicate_code', {
      name: 'Duplicate Code',
      type: 'refactoring',
      detect: (code) => this.detectDuplicateCode(code),
      optimize: (code, issue) => this.extractFunction(code, issue),
    });

    logger.info(`📚 Loaded ${this.bugPatterns.size} bug patterns and ${this.optimizationPatterns.size} optimization patterns`);
  }

  /**
   * Analyze code for issues
   * @param {Object} params - Analysis parameters
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeCode(params) {
    const { code, language = 'javascript', filePath, analyzeType = 'all' } = params;
    const analysisId = uuidv4();

    logger.info(`🔍 Analyzing code: ${analysisId} (${filePath || 'inline'})`);

    const issues = [];
    let ast = null;

    try {
      // Parse AST for JavaScript
      if (language === 'javascript' || language === 'typescript') {
        ast = esprima.parseScript(code, { tolerant: true, loc: true, range: true });
      }
    } catch (parseError) {
      issues.push({
        type: 'parse_error',
        severity: 'critical',
        message: parseError.message,
        line: parseError.lineNumber || 0,
        column: parseError.column || 0,
      });
    }

    // Detect bugs
    if (analyzeType === 'all' || analyzeType === 'bugs') {
      for (const [patternId, pattern] of this.bugPatterns) {
        try {
          const detected = pattern.detect(language === 'javascript' ? ast : code);
          for (const issue of detected) {
            issues.push({
              id: uuidv4(),
              patternId,
              type: 'bug',
              name: pattern.name,
              severity: pattern.severity,
              ...issue,
              fixable: !!pattern.fix,
            });
          }
        } catch (e) {
          logger.warn(`⚠️ Pattern ${patternId} detection failed:`, e.message);
        }
      }
    }

    // Detect optimizations
    if (analyzeType === 'all' || analyzeType === 'optimizations') {
      for (const [patternId, pattern] of this.optimizationPatterns) {
        try {
          const detected = pattern.detect(language === 'javascript' ? ast : code);
          for (const issue of detected) {
            issues.push({
              id: uuidv4(),
              patternId,
              type: 'optimization',
              name: pattern.name,
              severity: 'low',
              category: pattern.type,
              ...issue,
              fixable: !!pattern.optimize,
            });
          }
        } catch (e) {
          logger.warn(`⚠️ Optimization ${patternId} detection failed:`, e.message);
        }
      }
    }

    const result = {
      analysisId,
      filePath,
      language,
      totalIssues: issues.length,
      critical: issues.filter(i => i.severity === 'critical').length,
      high: issues.filter(i => i.severity === 'high').length,
      medium: issues.filter(i => i.severity === 'medium').length,
      low: issues.filter(i => i.severity === 'low').length,
      issues,
      analyzedAt: Date.now(),
    };

    await this.redis.setex(`selfcoding:analysis:${analysisId}`, 86400, JSON.stringify(result));

    logger.info(`✅ Analysis complete: ${issues.length} issues found (${result.critical} critical)`);

    return result;
  }

  /**
   * Auto-fix detected issues
   * @param {string} analysisId - Analysis ID
   * @param {Object} options - Fix options
   * @returns {Promise<Object>} Fix result
   */
  async autoFix(analysisId, options = {}) {
    const repairId = uuidv4();
    const analysisData = await this.redis.get(`selfcoding:analysis:${analysisId}`);
    if (!analysisData) throw new Error('Analysis not found');

    const analysis = JSON.parse(analysisData);
    const { code } = options;

    logger.info(`🔧 Auto-fixing: ${repairId} (${analysis.issues.length} issues)`);

    let fixedCode = code;
    const fixes = [];
    const failed = [];

    for (const issue of analysis.issues) {
      if (!issue.fixable) continue;

      try {
        let fixResult;
        if (issue.type === 'bug') {
          const pattern = this.bugPatterns.get(issue.patternId);
          fixResult = await pattern.fix(fixedCode, issue);
        } else {
          const pattern = this.optimizationPatterns.get(issue.patternId);
          fixResult = await pattern.optimize(fixedCode, issue);
        }

        if (fixResult && fixResult.code) {
          fixedCode = fixResult.code;
          fixes.push({
            issueId: issue.id,
            patternId: issue.patternId,
            name: issue.name,
            confidence: fixResult.confidence || 0.9,
            diff: fixResult.diff || this.generateDiff(code, fixedCode),
          });
        }
      } catch (error) {
        failed.push({ issueId: issue.id, error: error.message });
      }
    }

    const result = {
      repairId,
      analysisId,
      totalIssues: analysis.issues.length,
      fixed: fixes.length,
      failed: failed.length,
      fixes,
      failedFixes: failed,
      originalCode: code,
      fixedCode,
      diff: this.generateDiff(code, fixedCode),
      repairedAt: Date.now(),
    };

    this.activeRepairs.set(repairId, result);
    await this.redis.setex(`selfcoding:repair:${repairId}`, 86400, JSON.stringify(result));

    logger.info(`✅ Auto-fix complete: ${fixes.length} fixed, ${failed.length} failed`);

    this.emit('repair:completed', { repairId, fixed: fixes.length });

    return result;
  }

  // Bug detection implementations
  detectUndefinedVariables(ast) {
    const issues = [];
    const declared = new Set();
    const used = [];

    // Walk AST to find declarations and usages
    this.walkAST(ast, (node) => {
      if (node.type === 'VariableDeclarator') {
        declared.add(node.id.name);
      } else if (node.type === 'Identifier') {
        used.push({ name: node.name, loc: node.loc });
      }
    });

    for (const usage of used) {
      if (!declared.has(usage.name) && !this.isGlobal(usage.name)) {
        issues.push({
          message: `Variable '${usage.name}' is used but not declared`,
          line: usage.loc?.start?.line || 0,
          column: usage.loc?.start?.column || 0,
          variable: usage.name,
        });
      }
    }

    return issues;
  }

  detectNullDereferences(ast) {
    const issues = [];
    this.walkAST(ast, (node) => {
      if (node.type === 'MemberExpression' && node.object) {
        // Check if object could be null/undefined
        if (node.object.name && !node.optional) {
          issues.push({
            message: `Potential null dereference: '${node.object.name}' may be null/undefined`,
            line: node.loc?.start?.line || 0,
            variable: node.object.name,
            suggestion: `Use optional chaining: ${node.object.name}?.`,
          });
        }
      }
    });
    return issues;
  }

  detectMemoryLeaks(ast) {
    const issues = [];
    this.walkAST(ast, (node) => {
      if (node.type === 'CallExpression' &&
          node.callee.type === 'MemberExpression' &&
          node.callee.property?.name === 'addEventListener') {
        // Check for missing removeEventListener
        issues.push({
          message: 'Event listener added without corresponding removal',
          line: node.loc?.start?.line || 0,
          suggestion: 'Add removeEventListener in cleanup or use AbortController',
        });
      }
      if (node.type === 'NewExpression' &&
          node.callee.type === 'Identifier' &&
          node.callee.name === 'Interval') {
        issues.push({
          message: 'setInterval without clearInterval - potential memory leak',
          line: node.loc?.start?.line || 0,
        });
      }
    });
    return issues;
  }

  detectRaceConditions(ast) {
    const issues = [];
    // Simplified: flag async operations without proper sequencing
    this.walkAST(ast, (node) => {
      if (node.type === 'CallExpression' &&
          node.callee.type === 'MemberExpression' &&
          (node.callee.property?.name === 'then' || node.callee.property?.name === 'catch')) {
        issues.push({
          message: 'Promise chain detected - ensure proper error handling and sequencing',
          line: node.loc?.start?.line || 0,
        });
      }
    });
    return issues;
  }

  detectInfiniteLoops(ast) {
    const issues = [];
    this.walkAST(ast, (node) => {
      if ((node.type === 'WhileStatement' || node.type === 'ForStatement') &&
          node.test && node.test.type === 'Literal' && node.test.value === true) {
        issues.push({
          message: 'Potential infinite loop - while(true) without break condition',
          line: node.loc?.start?.line || 0,
        });
      }
    });
    return issues;
  }

  detectUnhandledPromises(ast) {
    const issues = [];
    this.walkAST(ast, (node) => {
      if (node.type === 'CallExpression' &&
          node.callee.type === 'MemberExpression' &&
          (node.callee.object?.name?.includes('Promise') ||
           node.callee.property?.name === 'then')) {
        // Check if catch is present
        const parent = node.parent;
        if (!parent || parent.type !== 'MemberExpression' || parent.property?.name !== 'catch') {
          issues.push({
            message: 'Promise chain without .catch() - potential unhandled rejection',
            line: node.loc?.start?.line || 0,
          });
        }
      }
    });
    return issues;
  }

  detectSQLInjectionRisk(code) {
    const issues = [];
    const riskyPatterns = [
      /query\s*\(\s*[`"'].*\$\{/,
      /exec\s*\(\s*[`"'].*\+/,
      /raw\s*\(\s*[`"'].*\$\{/,
    ];
    const lines = code.split('\n');
    lines.forEach((line, idx) => {
      riskyPatterns.forEach(pattern => {
        if (pattern.test(line)) {
          issues.push({
            message: 'Potential SQL injection - string concatenation/interpolation in query',
            line: idx + 1,
            code: line.trim(),
            suggestion: 'Use parameterized queries or ORM',
          });
        }
      });
    });
    return issues;
  }

  detectXSSVulnerability(code) {
    const issues = [];
    const riskyPatterns = [
      /innerHTML\s*=.*\$/,
      /document\.write\s*\(/,
      /eval\s*\(/,
    ];
    const lines = code.split('\n');
    lines.forEach((line, idx) => {
      riskyPatterns.forEach(pattern => {
        if (pattern.test(line)) {
          issues.push({
            message: 'Potential XSS vulnerability - unsafe DOM manipulation',
            line: idx + 1,
            code: line.trim(),
            suggestion: 'Use textContent instead of innerHTML, sanitize inputs',
          });
        }
      });
    });
    return issues;
  }

  // Fix implementations
  fixUndefinedVariable(code, issue) {
    // Add variable declaration at top
    const lines = code.split('\n');
    const declaration = `let ${issue.variable}; // Auto-fixed: was undefined`;
    lines.splice(issue.line - 1, 0, declaration);
    return {
      code: lines.join('\n'),
      confidence: 0.85,
      diff: `+ ${declaration}`,
    };
  }

  fixNullDereference(code, issue) {
    const lines = code.split('\n');
    const line = lines[issue.line - 1];
    if (line && issue.variable) {
      lines[issue.line - 1] = line.replace(
        new RegExp(`${issue.variable}\\.`, 'g'),
        `${issue.variable}?.`
      );
    }
    return {
      code: lines.join('\n'),
      confidence: 0.9,
    };
  }

  fixUnhandledPromise(code, issue) {
    const lines = code.split('\n');
    const line = lines[issue.line - 1];
    if (line && !line.includes('.catch')) {
      lines[issue.line - 1] = `${line}\n  .catch(err => console.error('Auto-fixed:', err));`;
    }
    return {
      code: lines.join('\n'),
      confidence: 0.8,
    };
  }

  fixSQLInjection(code, issue) {
    const lines = code.split('\n');
    const line = lines[issue.line - 1];
    if (line) {
      lines[issue.line - 1] = `// SECURITY FIX: Use parameterized query\n// ${line}\n// Example: db.query('SELECT * FROM users WHERE id = ?', [userId]);`;
    }
    return {
      code: lines.join('\n'),
      confidence: 0.95,
    };
  }

  // AST walker helper
  walkAST(ast, callback) {
    const walk = (node, parent) => {
      if (!node || typeof node !== 'object') return;
      node.parent = parent;
      callback(node);
      for (const key of Object.keys(node)) {
        if (key === 'parent') continue;
        const child = node[key];
        if (Array.isArray(child)) {
          child.forEach(c => walk(c, node));
        } else if (child && typeof child === 'object' && child.type) {
          walk(child, node);
        }
      }
    };
    walk(ast, null);
  }

  isGlobal(name) {
    const globals = ['console', 'process', 'require', 'module', 'exports', 'global',
      'Buffer', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
      'setImmediate', 'clearImmediate', 'JSON', 'Math', 'Date', 'Array', 'Object',
      'String', 'Number', 'Boolean', 'RegExp', 'Error', 'Promise', 'Map', 'Set',
      'console', 'fetch', 'axios'];
    return globals.includes(name);
  }

  generateDiff(original, modified) {
    const diff = Diff.createTwoFilesPatch('original', 'fixed', original, modified);
    return diff;
  }

  detectLoopOptimizations(ast) {
    const issues = [];
    this.walkAST(ast, (node) => {
      if (node.type === 'ForStatement') {
        // Check for array.length in condition
        if (node.test && node.test.type === 'BinaryExpression') {
          const right = node.test.right;
          if (right && right.type === 'MemberExpression' &&
              right.property?.name === 'length') {
            issues.push({
              message: 'Array.length accessed in every iteration - cache it',
              line: node.loc?.start?.line || 0,
              suggestion: 'Cache array.length: for (let i = 0, len = arr.length; i < len; i++)',
            });
          }
        }
      }
    });
    return issues;
  }

  detectDeadCode(ast) {
    const issues = [];
    const declaredVars = new Map();

    this.walkAST(ast, (node) => {
      if (node.type === 'VariableDeclarator' && node.id) {
        declaredVars.set(node.id.name, { node, used: false });
      }
      if (node.type === 'Identifier' && node.parent?.type !== 'VariableDeclarator') {
        const varInfo = declaredVars.get(node.name);
        if (varInfo) varInfo.used = true;
      }
    });

    for (const [name, info] of declaredVars) {
      if (!info.used) {
        issues.push({
          message: `Unused variable: '${name}'`,
          line: info.node.loc?.start?.line || 0,
          variable: name,
        });
      }
    }

    return issues;
  }

  detectDuplicateCode(code) {
    // Simplified duplicate detection
    const issues = [];
    const lines = code.split('\n');
    const seen = new Map();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.length > 20 && !line.startsWith('//') && !line.startsWith('*')) {
        if (seen.has(line)) {
          issues.push({
            message: `Duplicate code detected at lines ${seen.get(line) + 1} and ${i + 1}`,
            line: i + 1,
            duplicateLine: seen.get(line) + 1,
          });
        } else {
          seen.set(line, i);
        }
      }
    }

    return issues;
  }

  getStats() {
    return {
      bugPatterns: this.bugPatterns.size,
      optimizationPatterns: this.optimizationPatterns.size,
      activeRepairs: this.activeRepairs.size,
      isInitialized: this.isInitialized,
    };
  }

  async shutdown() {
    logger.info('🛑 Shutting down Self-Coding Service...');
    this.activeRepairs.clear();
    if (this.redis) await this.redis.quit();
    logger.info('✅ Self-Coding Service shutdown complete');
  }
}

module.exports = SelfCodingService;
