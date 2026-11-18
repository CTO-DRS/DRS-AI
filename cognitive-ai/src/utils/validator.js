const Joi = require('joi');
const { AppError } = require('./errorHandler');

// Request validation middleware
const requestValidator = (req, res, next) => {
  // Add request ID if not present
  req.id = req.headers['x-request-id'] || require('uuid').v4();
  
  // Log request
  if (process.env.NODE_ENV === 'development') {
    console.log(`[${req.id}] ${req.method} ${req.path}`);
  }
  
  next();
};

// Validation schemas
const schemas = {
  personaEvolve: Joi.object({
    userId: Joi.string().required(),
    interaction: Joi.object({
      type: Joi.string().valid('message', 'command', 'action').required(),
      text: Joi.string().allow('').default(''),
      intent: Joi.string().optional(),
      topics: Joi.array().items(Joi.string()).optional(),
      sentiment: Joi.string().valid('positive', 'negative', 'neutral').optional(),
      responseTime: Joi.number().optional(),
      sessionDuration: Joi.number().optional(),
    }).required(),
  }),

  visualAnalyze: Joi.object({
    image: Joi.alternatives().try(
      Joi.string().base64(),
      Joi.string().uri(),
      Joi.binary()
    ).required(),
    prompt: Joi.string().default('Describe this image in detail'),
    userId: Joi.string().required(),
    stream: Joi.boolean().default(false),
  }),

  visualQA: Joi.object({
    image: Joi.alternatives().try(
      Joi.string().base64(),
      Joi.string().uri(),
      Joi.binary()
    ).required(),
    question: Joi.string().required(),
    userId: Joi.string().required(),
  }),

  metaLearningRegister: Joi.object({
    taskId: Joi.string().required(),
    name: Joi.string().required(),
    type: Joi.string().valid('classification', 'generation', 'extraction', 'domain-adaptation').required(),
    examples: Joi.array().items(Joi.object({
      input: Joi.string().required(),
      output: Joi.string().required(),
    })).min(1).required(),
  }),

  fewShotAdapt: Joi.object({
    taskId: Joi.string().required(),
    supportSet: Joi.array().items(Joi.object({
      input: Joi.string().required(),
      output: Joi.string().required(),
    })).min(1).required(),
  }),

  embeddingUpdate: Joi.object({
    userId: Joi.string().required(),
    interaction: Joi.object().required(),
  }),

  findSimilar: Joi.object({
    userId: Joi.string().required(),
    k: Joi.number().integer().min(1).max(100).default(10),
  }),
};

// Validation middleware factory
const validate = (schemaName) => {
  return (req, res, next) => {
    const schema = schemas[schemaName];
    if (!schema) {
      return next(new AppError(`Unknown schema: ${schemaName}`, 500));
    }

    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const message = error.details.map(d => d.message).join(', ');
      return next(new AppError(message, 400, 'VALIDATION_ERROR'));
    }

    req.body = value;
    next();
  };
};

module.exports = { requestValidator, validate, schemas };
