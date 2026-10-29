// adb over USB (or `adb connect`): used for setup (`usb` command) and as a
// fallback for what the app cannot do on old Android (taps by coordinate
// before Android 7, Enter key before Android 11, screenshots without capture).
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

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
  return 'adb';
}

export function adb(args, { timeout = 15000, binary = false, serial = process.env.ANDROID_SERIAL } = {}) {
  const full = serial ? ['-s', serial, ...args] : args;
  return new Promise((resolve, reject) => {
    execFile(adbPath(), full, { timeout, windowsHide: true, encoding: binary ? 'buffer' : 'utf8', maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
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
