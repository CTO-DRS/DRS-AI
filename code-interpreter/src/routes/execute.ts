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
// SECURITY (V3): the user expression is delivered to the interpreter through
// input.json (never interpolated into the generated source) and is validated
// against a strict numeric AST whitelist before it is evaluated. This replaces
// the old bare eval('''${expression}''') which allowed arbitrary code execution.
const CALC_TEMPLATE = `
import ast
import math
import statistics
import random
import numpy as np

_expr = (input_data or {}).get('expression', '')
if not _expr or not isinstance(_expr, str) or len(_expr) > 1000:
    raise ValueError('Invalid expression')

allowed_functions = {'abs', 'round', 'max', 'min', 'sum', 'len'}
allowed_modules = {'math', 'statistics', 'random', 'np'}
allowed_binops = {ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Pow, ast.Mod}
allowed_unaryops = {ast.UAdd, ast.USub}
_ALLOWED_NODES = (
    ast.Expression, ast.Constant, ast.Name, ast.Load, ast.Attribute, ast.BinOp,
    ast.UnaryOp, ast.Call, ast.Tuple, ast.List, ast.keyword
) + tuple(allowed_binops) + tuple(allowed_unaryops)

def _root_name(node):
    while isinstance(node, ast.Attribute):
        node = node.value
    if isinstance(node, ast.Name):
        return node.id
    return None

_tree = ast.parse(_expr, mode='eval')
for _node in ast.walk(_tree):
    if not isinstance(_node, _ALLOWED_NODES):
        raise ValueError(f'Disallowed syntax: {type(_node).__name__}')
    if isinstance(_node, ast.Constant):
        if not isinstance(_node.value, (int, float, bool, complex)):
            raise ValueError('Only numeric constants are allowed')
    elif isinstance(_node, ast.Name):
        if _node.id.startswith('_'):
            raise ValueError('Dunder names are not allowed')
    elif isinstance(_node, ast.Attribute):
        if _node.attr.startswith('_') or _root_name(_node) not in allowed_modules:
            raise ValueError('Disallowed attribute access')
    elif isinstance(_node, ast.Call):
        if isinstance(_node.func, ast.Name) and _node.func.id not in allowed_functions:
            raise ValueError(f'Function not allowed: {_node.func.id}')

_names = {
    'abs': abs, 'round': round, 'max': max, 'min': min,
    'sum': sum, 'len': len,
    'math': math, 'statistics': statistics, 'random': random, 'np': np
}
_result = eval(compile(_tree, '<expr>', 'eval'), {"__builtins__": {}}, _names)
print("Result:", _result)
`;

router.post('/calculate', async (req, res) => {
  try {
    const { expression } = req.body;

    if (!expression || typeof expression !== 'string' || expression.length > 1000) {
      return res.status(400).json({ success: false, error: { code: 'NO_EXPRESSION', message: 'A numeric expression (max 1000 chars) is required' } });
    }

    // SECURITY (V3): the AST whitelist below is the security boundary for this
    // endpoint (imports are unreachable from the evaluated expression), so the
    // import hook runs in '*' mode (deny dangerous modules only) to let the
    // numpy/math stack load its wide internal import graph.
    const result = await pythonExecutor.executeCode(CALC_TEMPLATE, {
      inputData: { expression },
      allowedModules: '*'
    });
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
