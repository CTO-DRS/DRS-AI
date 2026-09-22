import { Router } from 'express';
import multer from 'multer';
import pythonExecutor from '../services/PythonExecutor';
import logger from '../utils/logger';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Execute Python code
router.post('/python', async (req, res) => {
  try {
    const { code, timeout, inputData } = req.body;
    
    if (!code) {
      return res.status(400).json({ success: false, error: { code: 'NO_CODE', message: 'No code provided' } });
    }

    const result = await pythonExecutor.executeCode(code, { timeout, inputData });
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Code execution failed:', error);
    res.status(500).json({ success: false, error: { code: 'EXECUTION_FAILED', message: error.message } });
  }
});

// Analyze CSV
router.post('/analyze/csv', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No file provided' } });
    }

    const csvContent = req.file.buffer.toString('utf-8');
    const analysisType = req.body.type || 'summary';

    const result = await pythonExecutor.analyzeCSV(csvContent, analysisType);
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('CSV analysis failed:', error);
    res.status(500).json({ success: false, error: { code: 'ANALYSIS_FAILED', message: error.message } });
  }
});

// Analyze JSON
router.post('/analyze/json', async (req, res) => {
  try {
    const { data, query } = req.body;
    
    if (!data) {
      return res.status(400).json({ success: false, error: { code: 'NO_DATA', message: 'No JSON data provided' } });
    }

    const jsonContent = typeof data === 'string' ? data : JSON.stringify(data);
    const result = await pythonExecutor.analyzeJSON(jsonContent, query);
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('JSON analysis failed:', error);
    res.status(500).json({ success: false, error: { code: 'ANALYSIS_FAILED', message: error.message } });
  }
});

// Generate plot
router.post('/plot', async (req, res) => {
  try {
    const { data, type, options } = req.body;
    
    if (!data || !type) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_PARAMS', message: 'Data and type are required' } });
    }

    const result = await pythonExecutor.generatePlot(data, type, options);
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Plot generation failed:', error);
    res.status(500).json({ success: false, error: { code: 'PLOT_FAILED', message: error.message } });
  }
});

// Calculate expression
router.post('/calculate', async (req, res) => {
  try {
    const { expression } = req.body;
    
    if (!expression) {
      return res.status(400).json({ success: false, error: { code: 'NO_EXPRESSION', message: 'No expression provided' } });
    }

    const code = `
import math
import statistics
import random
import numpy as np

# Safe evaluation
allowed_names = {
    'abs': abs, 'round': round, 'max': max, 'min': min,
    'sum': sum, 'len': len, 'range': range,
    'math': math, 'statistics': statistics, 'random': random,
    'np': np
}

result = eval('''${expression.replace(/'/g, "\\'")}''', {"__builtins__": {}}, allowed_names)
print(f"Result: {result}")
`;

    const result = await pythonExecutor.executeCode(code);
    res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Calculation failed:', error);
    res.status(500).json({ success: false, error: { code: 'CALCULATION_FAILED', message: error.message } });
  }
});

// Get available packages
router.get('/packages', async (req, res) => {
  const packages = [
    { name: 'pandas', version: '2.x', description: 'Data manipulation and analysis' },
    { name: 'numpy', version: '1.x', description: 'Numerical computing' },
    { name: 'matplotlib', version: '3.x', description: 'Plotting and visualization' },
    { name: 'scipy', version: '1.x', description: 'Scientific computing' },
    { name: 'scikit-learn', version: '1.x', description: 'Machine learning' },
    { name: 'requests', version: '2.x', description: 'HTTP requests' },
    { name: 'beautifulsoup4', version: '4.x', description: 'HTML parsing' }
  ];

  res.json({ success: true, data: { packages } });
});

export default router;
