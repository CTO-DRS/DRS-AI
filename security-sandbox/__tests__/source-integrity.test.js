/**
 * security-sandbox — source integrity regression test.
 *
 * Parses every TypeScript file under src/ with the TypeScript compiler API
 * (available as a devDependency) and fails on syntax-level diagnostics.
 * Does not require ts-jest; runs as plain CommonJS under Jest.
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('security-sandbox source integrity', () => {
  const srcDir = path.join(__dirname, '..', 'src');

  test('src/ directory exists', () => {
    expect(fs.existsSync(srcDir)).toBe(true);
  });

  test('every .ts file under src/ parses without syntax diagnostics', () => {
    const files = walk(srcDir);
    expect(files.length).toBeGreaterThan(0);

    const broken = [];
    for (const file of files) {
      const code = fs.readFileSync(file, 'utf8');
      const sf = ts.createSourceFile(file, code, ts.ScriptTarget.ES2020, /* setParentNodes */ true, ts.ScriptKind.TS);
      const diags = sf.parseDiagnostics || [];
      if (diags.length > 0) {
        broken.push(`${path.relative(srcDir, file)}: ${diags[0].messageText}`);
      }
    }
    expect(broken).toEqual([]);
  });
});
