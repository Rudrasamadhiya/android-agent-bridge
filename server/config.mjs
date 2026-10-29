// Pairing secret and port, kept in ~/.android-agent-bridge/config.json so a
// paired phone reconnects on its own after the computer restarts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export const CONFIG_DIR = process.env.AAB_HOME || path.join(os.homedir(), '.android-agent-bridge');
const FILE = path.join(CONFIG_DIR, 'config.json');
export const DEFAULT_PORT = Number(process.env.AAB_PORT) || 8350;
export const APP_ID = 'io.github.rudrasamadhiya.agentbridge';

function save(cfg) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
}

export function loadConfig() {
  let cfg = null;
  try { cfg = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
  if (!cfg?.token) {
    cfg = { token: crypto.randomBytes(16).toString('hex'), port: DEFAULT_PORT };
    save(cfg);
  }
  if (process.env.AAB_PORT) cfg.port = DEFAULT_PORT;
  cfg.port ||= DEFAULT_PORT;
  return cfg;
}

/** New secret: every paired phone has to scan again. */
export function resetToken() {
  const cfg = loadConfig();
  cfg.token = crypto.randomBytes(16).toString('hex');
  save(cfg);
  return cfg;
}
