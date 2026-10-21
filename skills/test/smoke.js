/**
 * End-to-end smoke test for the skills service.
 *
 * Boots the compiled service (dist/index.js) against an in-process fake Redis
 * (minimal RESP implementation covering the commands the service uses) and a
 * temporary SKILLS_DIR, then exercises every endpoint.
 *
 * Usage:  npm run build && node test/smoke.js   (or: npm run smoke)
 */
'use strict';

const net = require('net');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const tar = require('tar');

const PORT = process.env.SMOKE_PORT || 3144;
const REDIS_PORT = 6399;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// Minimal fake Redis (RESP2) — supports only the commands the service uses
// ---------------------------------------------------------------------------
class FakeRedis extends net.Server {
  constructor() {
    super();
    this.hashes = new Map();
    this.strings = new Map(); // key -> { value, expiresAt }
    this.buffers = new Map(); // socket -> Buffer
    this.on('connection', (socket) => this.onConnection(socket));
  }

  onConnection(socket) {
    this.buffers.set(socket, Buffer.alloc(0));
    socket.on('data', (chunk) => {
      const buf = Buffer.concat([this.buffers.get(socket), chunk]);
      this.buffers.set(socket, buf);
      this.tryParse(socket);
    });
    socket.on('error', () => this.buffers.delete(socket));
    socket.on('close', () => this.buffers.delete(socket));
  }

  tryParse(socket) {
    for (;;) {
      const buf = this.buffers.get(socket);
      const result = this.parseValue(buf, 0);
      if (!result) break;
      const [value, nextIdx] = result;
      this.buffers.set(socket, buf.slice(nextIdx));
      if (Array.isArray(value)) {
        this.dispatch(socket, value);
      }
      if (this.buffers.get(socket).length === 0) break;
    }
  }

  /** Returns [value, nextIndex] or null when the buffer holds an incomplete value. */
  parseValue(buf, i) {
    if (i >= buf.length) return null;
    const type = String.fromCharCode(buf[i]);
    const lineEnd = buf.indexOf('\r\n', i);
    if (lineEnd === -1) return null;
    const line = buf.slice(i + 1, lineEnd).toString();

    if (type === '$') {
      const len = Number(line);
      if (len === -1) return [[null], lineEnd + 2];
      const total = lineEnd + 2 + len + 2;
      if (buf.length < total) return null;
      return [[buf.slice(lineEnd + 2, lineEnd + 2 + len).toString()], total];
    }
    if (type === '*') {
      const count = Number(line);
      if (count === -1) return [[null], lineEnd + 2];
      let idx = lineEnd + 2;
      const arr = [];
      for (let n = 0; n < count; n++) {
        const child = this.parseValue(buf, idx);
        if (!child) return null;
        arr.push(child[0][0]);
        idx = child[1];
      }
      return [arr, idx];
    }
    // +simple, :int, -error: not expected in requests — skip
    return [[null], lineEnd + 2];
  }

  reply(socket, data) {
    socket.write(data);
  }

  bulk(str) {
    return str === null || str === undefined ? '$-1\r\n' : `$${Buffer.byteLength(str)}\r\n${str}\r\n`;
  }

  dispatch(socket, args) {
    const cmd = String(args[0] || '').toUpperCase();
    const key = (k) => String(k);
    const getHash = (k) => {
      if (!this.hashes.has(k)) this.hashes.set(k, new Map());
      return this.hashes.get(k);
    };
    const alive = (k) => {
      const item = this.strings.get(k);
      if (!item) return null;
      if (item.expiresAt && Date.now() > item.expiresAt) {
        this.strings.delete(k);
        return null;
      }
      return item.value;
    };

    try {
      switch (cmd) {
        case 'INFO':
          return this.reply(socket, this.bulk('redis_version:7.2.0\r\nskill_smoke:1\r\n'));
        case 'PING':
          return this.reply(socket, '+PONG\r\n');
        case 'CLIENT':
        case 'SELECT':
        case 'HELLO':
          return this.reply(socket, '+OK\r\n');
        case 'HSET': {
          const map = getHash(key(args[1]));
          map.set(key(args[2]), key(args[3]));
          return this.reply(socket, ':1\r\n');
        }
        case 'HGET':
          return this.reply(socket, this.bulk(getHash(key(args[1])).get(key(args[2])) ?? null));
        case 'HGETALL': {
          const map = getHash(key(args[1]));
          const flat = [];
          for (const [k, v] of map.entries()) {
            flat.push(k, v);
          }
          const parts = flat.map((v) => this.bulk(v)).join('');
          return this.reply(socket, `*${flat.length}\r\n${parts}`);
        }
        case 'HDEL': {
          const map = getHash(key(args[1]));
          let n = 0;
          for (let i = 2; i < args.length; i++) {
            if (map.delete(key(args[i]))) n += 1;
          }
          return this.reply(socket, `:${n}\r\n`);
        }
        case 'HINCRBY': {
          const map = getHash(key(args[1]));
          const field = key(args[2]);
          const next = (Number(map.get(field) || '0') || 0) + Number(args[3]);
          map.set(field, String(next));
          return this.reply(socket, `:${next}\r\n`);
        }
        case 'GET':
          return this.reply(socket, this.bulk(alive(key(args[1]))));
        case 'SET': {
          const item = { value: key(args[2]), expiresAt: null };
          if (String(args[3]).toUpperCase() === 'EX') {
            item.expiresAt = Date.now() + Number(args[4]) * 1000;
          }
          this.strings.set(key(args[1]), item);
          return this.reply(socket, '+OK\r\n');
        }
        case 'DEL': {
          let n = 0;
          for (let i = 1; i < args.length; i++) {
            if (this.strings.delete(key(args[i]))) n += 1;
            if (this.hashes.delete(key(args[i]))) n += 1;
          }
          return this.reply(socket, `:${n}\r\n`);
        }
        default:
          return this.reply(socket, `-ERR unknown command '${cmd}'\r\n`);
      }
    } catch (err) {
      return this.reply(socket, `-ERR ${err.message}\r\n`);
    }
  }
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

async function getJson(pathname, headers = {}) {
  const res = await fetch(`${BASE}${pathname}`, { headers });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body, res };
}

async function sendJson(method, pathname, payload, headers = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: payload === null ? undefined : JSON.stringify(payload)
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body, res };
}

function skillMd(name, description, body, extra = '') {
  return `---\nname: ${name}\ndescription: ${description}\nversion: 1.0.0${extra}\n---\n\n${body}\n`;
}

function makeTarGz(files) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-src-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  const out = path.join(tmp, 'out.tar.gz');
  tar.c({ gzip: true, file: out, cwd: tmp, portable: true, sync: true }, ['./']);
  const data = fs.readFileSync(out);
  fs.rmSync(tmp, { recursive: true, force: true });
  return data;
}

function makeZip(files) {
  const zip = new AdmZip();
  for (const [rel, content] of Object.entries(files)) {
    zip.addFile(rel, Buffer.from(content, 'utf8'));
  }
  return zip.toBuffer();
}

/** Minimal ustar header (name must fit in 100 chars). */
function ustarHeader(name, size) {
  const buf = Buffer.alloc(512);
  buf.write(name, 0, Math.min(name.length, 100), 'utf8');
  buf.write('0000644\0', 100, 8, 'utf8');
  buf.write('0000000\0', 108, 8, 'utf8');
  buf.write('0000000\0', 116, 8, 'utf8');
  buf.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'utf8');
  buf.write(`${Math.floor(Date.now() / 1000).toString(8).padStart(11, '0')}\0`, 136, 12, 'utf8');
  buf.write('        ', 148, 8, 'utf8');
  buf.write('0', 156, 1, 'utf8');
  buf.write('ustar\0', 257, 6, 'utf8');
  buf.write('00', 263, 2, 'utf8');
  let sum = 0;
  for (const b of buf) sum += b;
  buf.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'utf8');
  return buf;
}

/** Hand-built tar.gz whose entries contain ".." path traversal segments. */
function makeEvilTarGz() {
  const md = Buffer.from(skillMd('tar-evil', 'evil traversal attempt', 'body'), 'utf8');
  const other = Buffer.from('pwned', 'utf8');
  const pad = (data) => {
    const rest = data.length % 512;
    return rest === 0 ? data : Buffer.concat([data, Buffer.alloc(512 - rest)]);
  };
  const raw = Buffer.concat([
    ustarHeader('SKILL.md', md.length), pad(md),
    ustarHeader('../evil.txt', other.length), pad(other),
    Buffer.alloc(1024)
  ]);
  return zlib.gzipSync(raw);
}

async function waitForHealth(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const fakeRedis = new FakeRedis();
  await new Promise((resolve) => fakeRedis.listen(REDIS_PORT, '127.0.0.1', resolve));

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-data-'));
  const serverEnv = {
    ...process.env,
    PORT: String(PORT),
    REDIS_URL: `redis://127.0.0.1:${REDIS_PORT}`,
    SKILLS_DIR: dataDir,
    NODE_ENV: 'development',
    LOG_LEVEL: 'error'
  };

  let child = spawn('node', ['dist/index.js'], {
    cwd: path.join(__dirname, '..'),
    env: serverEnv,
    stdio: ['ignore', 'ignore', 'pipe']
  });
  child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

  const stopAll = async () => {
    child.kill('SIGKILL');
    fakeRedis.close();
  };

  process.on('exit', () => {
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  try {
    check('server becomes healthy', await waitForHealth());

    const alice = { 'x-user-id': 'alice' };
    const mallory = { 'x-user-id': 'mallory' };
    const admin = { 'x-user-id': 'root', 'x-user-role': 'admin' };

    // --- upload (inline files) ---
    let r = await sendJson('POST', '/upload', {
      files: [
        { path: 'SKILL.md', content: skillMd('web-search-pro', 'Does structured web research', 'You are a research assistant. Search the web and cite sources.', '\nauthor: alice\ntags: [search, web]') },
        { path: 'scripts/run.sh', content: '#!/bin/sh\necho ok\n' },
        { path: 'references/style.md', content: '# Style\nBe concise.' }
      ]
    }, alice);
    check('upload inline files -> 201', r.status === 201 && r.body?.success === true, JSON.stringify(r.body));
    check('upload returns metadata', r.body?.data?.id === 'web-search-pro' && r.body.data.createdBy === 'alice' && r.body.data.fileCount === 3 && Array.isArray(r.body.data.tags) && r.body.data.tags.length === 2);
    check('SKILL.md written on disk', fs.existsSync(path.join(dataDir, 'web-search-pro', 'SKILL.md')));

    // --- duplicate name from another user -> 409 ---
    const dup = await sendJson('POST', '/upload', {
      files: [{ path: 'SKILL.md', content: skillMd('web-search-pro', 'Does structured web research', 'body') }]
    }, mallory);
    check('duplicate name from other user -> 409', dup.status === 409);

    // --- validation errors ---
    const badName = await sendJson('POST', '/upload', {
      files: [{ path: 'SKILL.md', content: skillMd('Bad Name!', 'x', 'body') }]
    }, alice);
    check('invalid slug -> 400 NAME_INVALID', badName.status === 400 && badName.body?.error?.code === 'NAME_INVALID');

    const noDesc = await sendJson('POST', '/upload', {
      files: [{ path: 'SKILL.md', content: '---\nname: no-desc\n---\nbody' }]
    }, alice);
    check('missing description -> 400', noDesc.status === 400);

    const noSkillMd = await sendJson('POST', '/upload', { files: [{ path: 'other.md', content: 'x' }] }, alice);
    check('missing SKILL.md -> 400', noSkillMd.status === 400);

    const noInput = await sendJson('POST', '/upload', {}, alice);
    check('no input -> 400', noInput.status === 400);

    const unauth = await sendJson('POST', '/upload', { files: [{ path: 'SKILL.md', content: skillMd('anon-skill', 'd', 'b') }] }, {});
    check('upload without auth -> 401', unauth.status === 401);

    // --- list & search ---
    await sendJson('POST', '/upload', {
      files: [{ path: 'SKILL.md', content: skillMd('code-reviewer', 'Reviews pull requests', 'Review code carefully.', '\ntags: [code]') }]
    }, alice);

    r = await getJson('/');
    check('list all -> 2 skills', r.body?.data?.count === 2, JSON.stringify(r.body?.data?.count));
    r = await getJson('/?tag=search');
    check('filter by tag', r.body?.data?.count === 1 && r.body.data.skills[0].id === 'web-search-pro');
    r = await getJson('/?q=review');
    check('search by q', r.body?.data?.count === 1 && r.body.data.skills[0].id === 'code-reviewer');
    r = await getJson('/?mine=true', alice);
    check('mine=true with auth', r.body?.data?.count === 2);
    r = await getJson('/?mine=true');
    check('mine=true without auth -> 401', r.status === 401);

    // --- detail / context / invoke / stats ---
    r = await getJson('/web-search-pro');
    check('detail includes body and files', r.status === 200 && typeof r.body?.data?.body === 'string' && r.body.data.body.includes('research assistant') && Array.isArray(r.body.data.files) && r.body.data.files.length === 3);

    r = await getJson('/web-search-pro/context');
    check('context shape', r.status === 200 && r.body?.data?.name === 'web-search-pro' && typeof r.body.data.body === 'string');

    r = await sendJson('POST', '/web-search-pro/invoke', {});
    check('invoke returns context', r.status === 200 && r.body?.data?.name === 'web-search-pro');
    r = await getJson('/web-search-pro/stats');
    check('stats invocations=1', r.body?.data?.invocations === 1 && r.body.data.downloads === 0);

    r = await getJson('/does-not-exist');
    check('unknown skill -> 404', r.status === 404 && r.body?.error?.code === 'SKILL_NOT_FOUND');

    // --- share links ---
    r = await sendJson('POST', '/web-search-pro/share', { expiresInDays: 2 }, alice);
    check('create share', r.status === 201 && typeof r.body?.data?.shareToken === 'string' && typeof r.body.data.url === 'string');
    const token = r.body?.data?.shareToken;
    const shared = await getJson(`/shared/${token}`);
    check('shared token resolves detail', shared.status === 200 && shared.body?.data?.id === 'web-search-pro');
    const badToken = await getJson('/shared/not-a-real-token');
    check('bad share token -> 404', badToken.status === 404 && badToken.body?.error?.code === 'SHARE_NOT_FOUND');
    const shareUnauth = await sendJson('POST', '/web-search-pro/share', {}, {});
    check('share without auth -> 401', shareUnauth.status === 401);

    // --- tags ---
    r = await getJson('/tags/list');
    check('tags list', r.status === 200 && Array.isArray(r.body?.data?.tags) && r.body.data.tags.includes('search') && r.body.data.tags.includes('code'));

    // --- tar.gz upload + download roundtrip ---
    const tarBuf = makeTarGz({
      'code-reviewer-v2/SKILL.md': skillMd('code-reviewer-v2', 'Reviews pull requests v2', 'Deep review checklist:\n1. Types\n2. Tests'),
      'code-reviewer-v2/references/guide.md': '# Guide\nCheck types first.'
    });
    let form = new FormData();
    form.append('file', new Blob([tarBuf], { type: 'application/gzip' }), 'code-reviewer-v2.tar.gz');
    r = await fetch(`${BASE}/upload`, { method: 'POST', headers: alice, body: form });
    let upBody = null;
    try { upBody = await r.json(); } catch { upBody = null; }
    check('upload wrapped tar.gz (folder prefix stripped)', r.status === 201 && upBody?.data?.id === 'code-reviewer-v2' && upBody.data.fileCount === 2, JSON.stringify(upBody));

    const dl = await fetch(`${BASE}/code-reviewer-v2/download`);
    const dlBuf = Buffer.from(await dl.arrayBuffer());
    const isGzip = dl.status === 200 && dlBuf.length > 2 && dlBuf[0] === 0x1f && dlBuf[1] === 0x8b && (dl.headers.get('content-disposition') || '').includes('.tar.gz');
    check('download is gzip stream', isGzip);
    if (isGzip) {
      const roundtrip = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-rt-'));
      fs.writeFileSync(path.join(roundtrip, 'dl.tar.gz'), dlBuf);
      await tar.x({ cwd: roundtrip, file: path.join(roundtrip, 'dl.tar.gz'), strict: true });
      check('downloaded tar.gz contains SKILL.md', fs.existsSync(path.join(roundtrip, 'code-reviewer-v2', 'SKILL.md')));
      fs.rmSync(roundtrip, { recursive: true, force: true });
    }
    r = await getJson('/code-reviewer-v2/stats');
    check('download incremented stats', r.body?.data?.downloads === 1, JSON.stringify(r.body));

    // --- zip upload ---
    const zipBuf = makeZip({ 'SKILL.md': skillMd('zip-skill', 'Uploaded as zip', 'Zip body.') });
    form = new FormData();
    form.append('file', new Blob([zipBuf], { type: 'application/zip' }), 'zip-skill.zip');
    r = await fetch(`${BASE}/upload`, { method: 'POST', headers: alice, body: form });
    upBody = null;
    try { upBody = await r.json(); } catch { upBody = null; }
    check('upload zip', r.status === 201 && upBody?.data?.id === 'zip-skill');

    // --- unsupported archive ---
    form = new FormData();
    form.append('file', new Blob([Buffer.from('not an archive')], { type: 'text/plain' }), 'data.txt');
    r = await fetch(`${BASE}/upload`, { method: 'POST', headers: alice, body: form });
    check('non-archive file -> 400', r.status === 400);

    // --- path traversal defenses ---
    // (a) inline file tree with traversal paths -> unsafe entries are dropped
    r = await sendJson('POST', '/upload', {
      files: [
        { path: 'SKILL.md', content: skillMd('inline-evil', 'Evil inline test', 'body') },
        { path: '../evil.txt', content: 'pwned' },
        { path: 'sub/../../outside.txt', content: 'pwned' }
      ]
    }, alice);
    check('inline traversal entries dropped, skill stored', r.status === 201 && r.body?.data?.fileCount === 1, JSON.stringify(r.body));
    r = await getJson('/inline-evil');
    check('inline evil skill contains only SKILL.md', r.body?.data?.files?.length === 1 && r.body.data.files[0].path === 'SKILL.md');

    // (b) tar.gz whose entries contain ".." -> rejected or sanitized, never escapes
    form = new FormData();
    form.append('file', new Blob([makeEvilTarGz()], { type: 'application/gzip' }), 'tar-evil.tar.gz');
    r = await fetch(`${BASE}/upload`, { method: 'POST', headers: alice, body: form });
    upBody = null;
    try { upBody = await r.json(); } catch { upBody = null; }
    check('evil tar.gz rejected or sanitized', r.status === 400 || (r.status === 201 && upBody?.data?.fileCount === 1), JSON.stringify(upBody));
    check('no file escaped skills dir', !fs.existsSync(path.join(dataDir, '..', 'evil.txt')) && !fs.existsSync(path.join(path.dirname(dataDir), 'evil.txt')) && !fs.existsSync(path.join(dataDir, 'outside.txt')) && !fs.existsSync(path.join(dataDir, '..', 'outside.txt')));

    // --- update / permissions ---
    r = await sendJson('PUT', '/web-search-pro', { description: 'Updated description', tags: ['search', 'research'], body: 'New instructions body.' }, mallory);
    check('update by non-owner -> 403', r.status === 403);

    r = await sendJson('PUT', '/web-search-pro', { description: 'Updated description', tags: ['search', 'research'], body: 'New instructions body.' }, alice);
    check('update by owner', r.status === 200 && r.body?.data?.description === 'Updated description' && r.body.data.body === 'New instructions body.');
    r = await getJson('/web-search-pro');
    check('SKILL.md rewritten on update', r.body?.data?.description === 'Updated description' && r.body.data.tags.includes('research'));

    r = await sendJson('PUT', '/web-search-pro', { description: 'Admin updated' }, admin);
    check('update by admin', r.status === 200 && r.body?.data?.description === 'Admin updated');

    // --- delete / permissions ---
    r = await sendJson('DELETE', '/zip-skill', null, mallory);
    check('delete by non-owner -> 403', r.status === 403);
    r = await sendJson('DELETE', '/zip-skill', null, admin);
    check('delete by admin', r.status === 200 && r.body?.data?.deleted === true);
    r = await getJson('/zip-skill');
    check('deleted skill gone -> 404', r.status === 404);
    check('files removed from disk', !fs.existsSync(path.join(dataDir, 'zip-skill')));

    // --- 404 route ---
    r = await getJson('/definitely/not/a/route');
    check('unknown route -> 404 NOT_FOUND', r.status === 404 && r.body?.error?.code === 'NOT_FOUND');

    // --- boot re-index from disk ---
    fakeRedis.hashes.delete('drs:skills:index');
    child.kill('SIGKILL');
    child = spawn('node', ['dist/index.js'], {
      cwd: path.join(__dirname, '..'),
      env: serverEnv,
      stdio: ['ignore', 'ignore', 'pipe']
    });
    child.stderr.on('data', () => {});
    check('server restarts', await waitForHealth());
    r = await getJson('/');
    check('index rebuilt from disk after restart', (r.body?.data?.count || 0) >= 2, JSON.stringify(r.body?.data?.count));
  } finally {
    await stopAll();
    await fsp.rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
