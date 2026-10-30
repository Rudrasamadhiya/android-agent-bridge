// adb over USB (or `adb connect`): used for setup (`usb` command) and as a
// fallback for what the app cannot do on old Android (taps by coordinate
// before Android 7, Enter key before Android 11, screenshots without capture).
import { execFile } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Where platform-tools is downloaded when the computer has no Android SDK.
const OWN_TOOLS = path.join(os.homedir(), '.android-agent-bridge', 'platform-tools');

export const KEYCODES = {
  back: 4, home: 3, recents: 187, enter: 66, tab: 61, delete: 67, escape: 111,
  volume_up: 24, volume_down: 25, mute: 164, power: 26, menu: 82, search: 84,
};

export function adbPath() {
  const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';
  for (const root of [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
    process.env.HOME && path.join(process.env.HOME, 'Library', 'Android', 'sdk'),
    process.env.HOME && path.join(process.env.HOME, 'Android', 'Sdk')]) {
    if (root && existsSync(path.join(root, 'platform-tools', exe))) return path.join(root, 'platform-tools', exe);
  }
  if (existsSync(path.join(OWN_TOOLS, exe))) return path.join(OWN_TOOLS, exe);
  return 'adb';
}

/**
 * Makes sure adb exists. Without an Android SDK or adb on PATH, downloads Google's
 * platform-tools (about 7 MB) into ~/.android-agent-bridge once.
 */
export async function ensureAdb(log = console.log) {
  try { await adb(['version'], { serial: null }); return; } catch (e) { if (!/adb not found/.test(e.message)) return; }
  const plat = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux';
  const url = `https://dl.google.com/android/repository/platform-tools-latest-${plat}.zip`;
  log('adb (Android platform-tools) not found; downloading it from Google, one time only…');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't download platform-tools (${res.status}). Install it yourself: https://developer.android.com/tools/releases/platform-tools`);
  const base = path.dirname(OWN_TOOLS);
  mkdirSync(base, { recursive: true });
  const zip = path.join(base, 'platform-tools.zip');
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  rmSync(OWN_TOOLS, { recursive: true, force: true });
  await new Promise((resolve, reject) => {
    const [bin, args] = process.platform === 'win32'
      ? ['powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${base}' -Force`]]
      : ['unzip', ['-q', '-o', zip, '-d', base]];
    execFile(bin, args, { windowsHide: true, timeout: 120000 }, (err) => (err ? reject(new Error('Couldn\'t unpack platform-tools: ' + err.message)) : resolve()));
  });
  rmSync(zip, { force: true });
  if (process.platform !== 'win32') chmodSync(path.join(OWN_TOOLS, 'adb'), 0o755);
  log('✔ adb ready');
}

export function adb(args, { timeout = 15000, binary = false, serial = process.env.ANDROID_SERIAL } = {}) {
  const full = serial ? ['-s', serial, ...args] : args;
  return new Promise((resolve, reject) => {
    // ADB_MDNS_OPENSCREEN lets adb find phones over Wi-Fi (wireless debugging) on every platform
    execFile(adbPath(), full, { timeout, windowsHide: true, encoding: binary ? 'buffer' : 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ADB_MDNS_OPENSCREEN: '1' } }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(err.code === 'ENOENT'
          ? 'adb not found. Install Android platform-tools (https://developer.android.com/tools/releases/platform-tools) or set ANDROID_HOME.'
          : String(stderr || err.message).trim()));
      } else resolve(binary ? stdout : String(stdout).trim());
    });
  });
}

/** Serials of phones attached and authorized. */
export async function devices() {
  const out = await adb(['devices', '-l'], { serial: null });
  return out.split('\n').slice(1).map((l) => l.trim().split(/\s+/)).filter((p) => p[1] === 'device')
    .map((p) => ({ serial: p[0], model: (p.find((x) => x.startsWith('model:')) || '').slice(6) }));
}

/** Pick the adb serial for the connected phone (matching model when several are plugged in). */
export async function pickSerial(model) {
  if (process.env.ANDROID_SERIAL) return process.env.ANDROID_SERIAL;
  let list;
  try { list = await devices(); } catch { return null; }
  if (!list.length) return null;
  if (list.length === 1 || !model) return list[0].serial;
  const norm = (s) => String(s).replace(/[\s_]/g, '').toLowerCase();
  return (list.find((d) => norm(d.model) === norm(model)) || list[0]).serial;
}

export const shell = (serial, ...cmd) => adb(['shell', ...cmd], { serial });
