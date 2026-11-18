/**
 * human-interaction — source integrity regression test.
 *
 * The service declares "npm test" but previously shipped with zero test files,
 * which made `npm test` exit non-zero (broken test suite). This smoke test
 * compiles every JavaScript source file under src/ to catch corrupted or
 * syntactically broken files before they reach runtime or Docker build.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

describe('human-interaction source integrity', () => {
  const srcDir = path.join(__dirname, '..', 'src');

  test('src/ directory exists', () => {
    expect(fs.existsSync(srcDir)).toBe(true);
  });

  test('every .js file under src/ compiles without syntax errors', () => {
    const files = walk(srcDir);
    expect(files.length).toBeGreaterThan(0);

    const broken = [];
    for (const file of files) {
      try {
        const code = fs.readFileSync(file, 'utf8');
        // eslint-disable-next-line no-new
        new vm.Script(code, { filename: file });
      } catch (err) {
        broken.push(`${path.relative(srcDir, file)}: ${err.message}`);
      }
    }
    expect(broken).toEqual([]);
  });
});
