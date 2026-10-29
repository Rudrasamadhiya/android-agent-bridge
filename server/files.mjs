// File transfer between this computer and the paired phone, over the bridge's own port.
//   POST /files/in?name=…     phone → computer (token header). Saved in the received folder.
//   GET  /files/out/<id>      computer → phone (token header). The phone downloads a staged file.
//   POST /files/drop?name=…   drop page on this computer → staged and sent to the phone.
//   GET  /files/received      what has arrived from the phone (this computer only).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';

export const RECEIVED_DIR = process.env.AAB_RECEIVED || path.join(os.homedir(), 'Downloads', 'Agent Bridge');
const DROP_DIR = path.join(os.tmpdir(), 'agent-bridge-outbox');

/** A name that is safe on every OS and does not overwrite an existing file. */
export function uniquePath(dir, name) {
  const clean = (path.basename(String(name || 'file')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'file').slice(0, 180);
  const ext = path.extname(clean);
  const stem = clean.slice(0, clean.length - ext.length);
  let p = path.join(dir, clean);
  for (let i = 2; fs.existsSync(p); i++) p = path.join(dir, `${stem} (${i})${ext}`);
  return p;
}

export class Files {
  constructor({ log = () => {} } = {}) {
    this.log = log;
    this.staged = new Map(); // id -> { path, name, size, expires }
    this.onDrop = null; // set by the bridge: (paths) => send them to the phone
  }

  /** Make files downloadable by the phone for a while; returns what to tell the phone. */
  stage(paths) {
    const now = Date.now();
    for (const [id, f] of this.staged) if (f.expires < now) this.staged.delete(id);
    return paths.map((p) => {
      const st = fs.statSync(p);
      if (!st.isFile()) throw new Error(`${p} is not a file`);
      const id = crypto.randomBytes(9).toString('hex');
      const f = { path: p, name: path.basename(p), size: st.size, expires: now + 30 * 60 * 1000 };
      this.staged.set(id, f);
      return { id, name: f.name, size: f.size };
    });
  }

  received(limit = 30) {
    if (!fs.existsSync(RECEIVED_DIR)) return { folder: RECEIVED_DIR, files: [] };
    const files = fs.readdirSync(RECEIVED_DIR)
      .map((name) => { const st = fs.statSync(path.join(RECEIVED_DIR, name)); return { name, size: st.size, time: st.mtimeMs, file: st.isFile() }; })
      .filter((f) => f.file)
      .sort((a, b) => b.time - a.time)
      .slice(0, limit)
      .map(({ file, ...f }) => f);
    return { folder: RECEIVED_DIR, files };
  }

  /** Handles /files/* requests. authed: token header matched; local: request came from this computer. */
  async handle(req, res, url, { authed, local }) {
    const json = (code, body) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(body));
    const name = url.searchParams.get('name') || 'file';

    if (req.method === 'POST' && url.pathname === '/files/in') {
      if (!authed) return json(401, { ok: false, error: 'bad token' });
      fs.mkdirSync(RECEIVED_DIR, { recursive: true });
      const dest = uniquePath(RECEIVED_DIR, name);
      const part = dest + '.part';
      try {
        await pipeline(req, fs.createWriteStream(part));
        fs.renameSync(part, dest);
      } catch (err) {
        fs.rmSync(part, { force: true });
        return json(500, { ok: false, error: err.message });
      }
      const size = fs.statSync(dest).size;
      this.log(`received ${path.basename(dest)} (${fmtSize(size)}) from the phone → ${dest}`);
      return json(200, { ok: true, path: dest, name: path.basename(dest), size });
    }

    const out = url.pathname.match(/^\/files\/out\/([0-9a-f]+)$/);
    if (req.method === 'GET' && out) {
      if (!authed) return json(401, { ok: false, error: 'bad token' });
      const f = this.staged.get(out[1]);
      if (!f || !fs.existsSync(f.path)) return json(404, { ok: false, error: 'not staged' });
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': f.size,
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      });
      await pipeline(fs.createReadStream(f.path), res);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/files/drop') {
      if (!local) return json(403, { ok: false, error: 'only reachable from this computer' });
      fs.mkdirSync(DROP_DIR, { recursive: true });
      const dest = uniquePath(DROP_DIR, name);
      await pipeline(req, fs.createWriteStream(dest));
      try {
        const [result] = await this.onDrop([dest]);
        return json(200, { ok: true, result });
      } catch (err) {
        return json(200, { ok: false, error: err.message });
      }
    }

    if (req.method === 'GET' && url.pathname === '/files/received') {
      if (!local) return json(403, { ok: false, error: 'only reachable from this computer' });
      return json(200, { ok: true, result: this.received() });
    }
    json(404, { ok: false, error: 'not found' });
  }
}

export function fmtSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
