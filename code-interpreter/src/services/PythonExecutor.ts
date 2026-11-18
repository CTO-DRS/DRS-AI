import { PythonShell } from 'python-shell';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || './workspace';
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
  /**
   * Import policy:
   *  - undefined           → default scientific-stdlib allowlist (os/sys blocked)
   *  - '*'                 → everything EXCEPT the dangerous blocklist below —
   *                          used only by the AST-gated /calculate endpoint
   *                          where the expression whitelist is the security
   *                          boundary and the scientific stack needs a wide
   *                          internal import graph (io, _ast, bisect, ...)
   *  - explicit string[]   → that allowlist minus dangerous modules
   */
  allowedModules?: string[] | '*';
  blockedModules?: string[];
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
      // SECURITY (V3): user code lives in its own file; the wrapper execs it
      // inside try/finally so captured output/error is always flushed.
      await fs.writeFile(path.join(workspacePath, 'user_code.py'), code);

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
    // SECURITY (V3): os/sys give direct filesystem/process access and are no
    // longer allowed by default. The hard-dangerous modules are ALWAYS blocked;
    // see ExecutionOptions.allowedModules for the three import policies.
    const dangerous = ['subprocess', 'pty', 'ctypes', 'socket', 'shutil'];
    const defaultAllow = [
      'pandas', 'numpy', 'matplotlib', 'json', 'math', 'random',
      'datetime', 'collections', 'itertools', 're', 'string', 'hashlib',
      'statistics', 'typing', 'decimal', 'fractions'
    ];
    const allowAll = options.allowedModules === '*';
    const allowedImports = (allowAll
      ? []
      : ((options.allowedModules as string[] | undefined) || defaultAllow))
      .filter((m: string) => !dangerous.includes(m));
    const blocked = [...dangerous, ...(options.blockedModules || [])];

    return `
# Security wrapper
import builtins
import io as _io
import sys as _sys   # captured BEFORE the import hook is installed
import os as _os     # captured BEFORE the import hook is installed (paths only)
import json

# Workspace path resolved from THIS script so input/output files work
# regardless of the process cwd (the old wrapper used bare relative paths).
_WS = _os.path.dirname(_os.path.abspath(__file__))

# Restrict imports — the original import hook is captured inside a closure so
# that user code can never reach it again (the old wrapper left
# original_import reachable as a module global, which was a trivial bypass).
_BLOCKED = frozenset([${blocked.map(m => `'${m}'`).join(', ')}])
_ALL_ALLOWED = ${allowAll ? 'True' : 'False'}
_ALLOWED = None if _ALL_ALLOWED else frozenset([${allowedImports.map(m => `'${m}'`).join(', ')}])

def _make_safe_import(_original_import, _blocked, _allowed, _all_allowed):
    def safe_import(name, *args, **kwargs):
        top = name.split('.')[0]
        if top in _blocked:
            raise ImportError(f"Import of '{name}' is not allowed")
        if not _all_allowed and top not in _allowed:
            raise ImportError(f"Import of '{name}' is not allowed")
        return _original_import(name, *args, **kwargs)
    return safe_import

builtins.__import__ = _make_safe_import(builtins.__import__, _BLOCKED, _ALLOWED, _ALL_ALLOWED)
del _make_safe_import

# Redirect output using the pre-captured module references
_captured_out = _io.StringIO()
_captured_err = _io.StringIO()
_ORIG_STDOUT = _sys.__stdout__
_ORIG_STDERR = _sys.__stderr__
_sys.stdout = _captured_out
_sys.stderr = _captured_err

# Drop the module handles so user code cannot reach sys/os/io through globals
del _sys, _io, _os, builtins

# Load input data if available (absolute path)
try:
    with open(_WS + '/input.json', 'r') as _f:
        input_data = json.load(_f)
except Exception:
    input_data = None

# User code — kept in a separate file so arbitrary multi-line strings and
# indentation survive intact. The wrapper ALWAYS reports the captured output
# and any user exception back through the real stdout (python-shell's message
# pipe): the original wrapper printed to the redirected sys.stdout, so the
# service never received any output at all, and an uncaught exception
# swallowed the captured error too.
_USER_ERROR = None
try:
    exec(compile(open(_WS + '/user_code.py').read(), 'user_code.py', 'exec'))
except BaseException as _e:
    _USER_ERROR = type(_e).__name__ + ((': ' + str(_e)) if str(_e) else '')
finally:
    output = _captured_out.getvalue()
    error = _captured_err.getvalue()
    _parts = []
    if output:
        _parts.append(output)
    if error:
        _parts.append(error)
    if _USER_ERROR:
        _parts.append('ERROR: ' + _USER_ERROR)
    if _parts:
        print(chr(10).join(_parts), file=_ORIG_STDOUT)
`;
  }

  private async collectOutputFiles(workspacePath: string): Promise<string[]> {
    try {
      const files = await fs.readdir(workspacePath);
      return files.filter(f => f !== 'script.py' && f !== 'input.json' && f !== 'user_code.py');
    } catch {
      return [];
    }
  }
}

export default new PythonExecutor();
