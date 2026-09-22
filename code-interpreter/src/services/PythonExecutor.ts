import { PythonShell } from 'python-shell';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';

const WORKSPACE_DIR = '/app/workspace';
const MAX_EXECUTION_TIME = 30000; // 30 seconds
const MAX_OUTPUT_SIZE = 100000; // 100KB

export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  executionTime: number;
  files?: string[];
  plots?: string[];
}

export interface ExecutionOptions {
  timeout?: number;
  allowedModules?: string[];
  inputData?: any;
}

export class PythonExecutor {
  constructor() {
    fs.ensureDirSync(WORKSPACE_DIR);
  }

  async executeCode(code: string, options: ExecutionOptions = {}): Promise<ExecutionResult> {
    const executionId = uuidv4();
    const workspacePath = path.join(WORKSPACE_DIR, executionId);
    
    try {
      await fs.ensureDir(workspacePath);

      // Prepare the code with safety wrappers
      const wrappedCode = this.wrapCode(code, options);
      const scriptPath = path.join(workspacePath, 'script.py');
      
      await fs.writeFile(scriptPath, wrappedCode);

      // Write input data if provided
      if (options.inputData) {
        await fs.writeFile(
          path.join(workspacePath, 'input.json'),
          JSON.stringify(options.inputData)
        );
      }

      const startTime = Date.now();

      const pythonOptions = {
        mode: 'text' as const,
        pythonPath: 'python3',
        pythonOptions: ['-u'],
        scriptPath: workspacePath,
        args: [],
        timeout: options.timeout || MAX_EXECUTION_TIME
      };

      let output = '';
      let error = '';

      await new Promise<void>((resolve, reject) => {
        const pyshell = new PythonShell('script.py', pythonOptions);

        pyshell.on('message', (message) => {
          output += message + '\n';
          if (output.length > MAX_OUTPUT_SIZE) {
            pyshell.terminate();
            reject(new Error('Output size exceeded maximum limit'));
          }
        });

        pyshell.on('stderr', (stderr) => {
          error += stderr + '\n';
        });

        pyshell.on('error', (err) => {
          reject(err);
        });

        pyshell.end((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      const executionTime = Date.now() - startTime;

      // Collect output files
      const files = await this.collectOutputFiles(workspacePath);
      const plots = files.filter(f => f.endsWith('.png') || f.endsWith('.jpg'));

      // Cleanup workspace
      await fs.remove(workspacePath);

      return {
        success: true,
        output: output.trim(),
        executionTime,
        files: files.filter(f => !f.endsWith('.png') && !f.endsWith('.jpg')),
        plots
      };
    } catch (err: any) {
      // Cleanup on error
      await fs.remove(workspacePath).catch(() => {});

      return {
        success: false,
        output: '',
        error: err.message || String(err),
        executionTime: 0
      };
    }
  }

  async executeWithData(code: string, data: any, options: ExecutionOptions = {}): Promise<ExecutionResult> {
    return this.executeCode(code, {
      ...options,
      inputData: data
    });
  }

  async analyzeCSV(csvContent: string, analysisType: string = 'summary'): Promise<ExecutionResult> {
    const code = `
import pandas as pd
import json
import sys

# Read CSV data
from io import StringIO
df = pd.read_csv(StringIO('''${csvContent.replace(/'/g, "\\'")}'''))

# Perform analysis
if '${analysisType}' == 'summary':
    result = {
        'shape': df.shape,
        'columns': list(df.columns),
        'dtypes': df.dtypes.to_dict(),
        'describe': df.describe().to_dict(),
        'missing': df.isnull().sum().to_dict(),
        'sample': df.head(5).to_dict('records')
    }
elif '${analysisType}' == 'correlation':
    numeric_df = df.select_dtypes(include=['number'])
    result = numeric_df.corr().to_dict()
elif '${analysisType}' == 'value_counts':
    result = {col: df[col].value_counts().head(10).to_dict() for col in df.columns}
else:
    result = {'data': df.to_dict('records')[:100]}

print(json.dumps(result, indent=2, default=str))
`;

    return this.executeCode(code);
  }

  async analyzeJSON(jsonContent: string, query?: string): Promise<ExecutionResult> {
    const code = `
import json

data = json.loads('''${jsonContent.replace(/'/g, "\\'")}''')

if isinstance(data, list) and len(data) > 0:
    print(f"Array with {len(data)} items")
    print(f"Sample item keys: {list(data[0].keys()) if isinstance(data[0], dict) else 'N/A'}")
elif isinstance(data, dict):
    print(f"Object with keys: {list(data.keys())}")
else:
    print(f"Type: {type(data).__name__}")

print(json.dumps(data, indent=2)[:5000])
`;

    return this.executeCode(code);
  }

  async generatePlot(data: any, plotType: string, options: any = {}): Promise<ExecutionResult> {
    const code = `
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import json
import numpy as np

data = json.loads('''${JSON.stringify(data).replace(/'/g, "\\'")}''')

fig, ax = plt.subplots(figsize=(10, 6))

if '${plotType}' == 'bar':
    ax.bar(data.get('labels', []), data.get('values', []))
elif '${plotType}' == 'line':
    ax.plot(data.get('x', []), data.get('y', []))
elif '${plotType}' == 'scatter':
    ax.scatter(data.get('x', []), data.get('y', []))
elif '${plotType}' == 'pie':
    ax.pie(data.get('values', []), labels=data.get('labels', []), autopct='%1.1f%%')
elif '${plotType}' == 'histogram':
    ax.hist(data.get('values', []), bins=data.get('bins', 10))

ax.set_title('${options.title || 'Plot'}')
ax.set_xlabel('${options.xLabel || ''}')
ax.set_ylabel('${options.yLabel || ''}')

plt.tight_layout()
plt.savefig('output.png', dpi=150, bbox_inches='tight')
plt.close()

print("Plot saved as output.png")
`;

    return this.executeCode(code);
  }

  private wrapCode(code: string, options: ExecutionOptions): string {
    const allowedImports = options.allowedModules || [
      'pandas', 'numpy', 'matplotlib', 'json', 'sys', 'os', 'math', 'random',
      'datetime', 'collections', 'itertools', 're', 'string', 'hashlib',
      'statistics', 'typing', 'decimal', 'fractions'
    ];

    return `
# Security wrapper
import sys
import builtins

# Restrict imports
original_import = builtins.__import__

def safe_import(name, *args, **kwargs):
    allowed = [${allowedImports.map(m => `'${m}'`).join(', ')}]
    if name.split('.')[0] not in allowed:
        raise ImportError(f"Import of '{name}' is not allowed")
    return original_import(name, *args, **kwargs)

builtins.__import__ = safe_import

# Redirect output
import io
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()

# Load input data if available
try:
    with open('input.json', 'r') as f:
        input_data = json.load(f)
except:
    input_data = None

# User code
${code}

# Print captured output
output = sys.stdout.getvalue()
error = sys.stderr.getvalue()
if output:
    print(output)
if error:
    print("ERROR:", error, file=sys.__stderr__)
`;
  }

  private async collectOutputFiles(workspacePath: string): Promise<string[]> {
    try {
      const files = await fs.readdir(workspacePath);
      return files.filter(f => f !== 'script.py' && f !== 'input.json');
    } catch {
      return [];
    }
  }
}

export default new PythonExecutor();
