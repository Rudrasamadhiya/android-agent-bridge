#!/usr/bin/env node
// android-agent-bridge (alias: phonectl)
//   (no command)      MCP server, launched by AI agents
//   start             run the bridge and show the pairing QR code
//   usb               set up a USB-connected phone (install, permissions, pair)
//   wifi              same, without a cable (Android 11+ wireless debugging)
//   init              add the MCP server + agent guide to the current project
//   status | screen | elements | tap | type | scroll | swipe | key | open | apps | wait
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Bridge } from './bridge.mjs';
import { loadConfig, resetToken, APP_ID } from './config.mjs';
import { lanAddresses, pairLink, qrTerminal } from './hub.mjs';
import { adb, devices, ensureAdb, pickSerial } from './adb.mjs';
import readline from 'node:readline/promises';
import { fmtSize } from './files.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const [cmd, ...rest] = process.argv.slice(2);

function parseArgs(list) {
  const pos = [], flags = {};
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    const key = a.slice(2);
    if (list[i + 1] != null && !list[i + 1].startsWith('--')) flags[key] = list[++i];
    else flags[key] = true;
  }
  return { pos, flags };
}

const num = (v) => (v == null || v === true ? undefined : Number(v));
const die = (msg) => { console.error(msg); process.exit(1); };

const HELP = `android-agent-bridge — let AI agents use your Android phone

Setup
  start                      run the bridge and show the QR code to pair over Wi-Fi
  usb                        set up a phone plugged in over USB (install app, permissions, pair)
  wifi [--code]              same without a cable: Android 11+ wireless debugging, pair by QR (--code: pairing code)
  init                       add the MCP server and agent guide to this project
  pair [--reset]             show the QR code again (--reset: new secret, phones must re-scan)
  (no command)               MCP server (what Claude Code / Cursor / Antigravity launch)

Control (needs a running bridge: \`start\`, \`usb\` or an agent session)
  status                     connected phone and what it can do
  screen [--mode marks|grid|both|plain] [--cols 12] [--out file]
                             screenshot with numbered elements (saved to a file) + element list
  elements [--all] [--ocr]   element list only (text); --all also lists elements hidden under sheets,
                             --ocr adds text read from the screen pixels
  ocr                        text read from the screen pixels, with positions (finds what apps hide)
  tap <target> [--long]      target: element "12", grid cell "C7", "x,y" or visible text
                             (text not in the element list is found by OCR automatically)
  type <text> [--into target] [--append] [--submit]
  scroll <up|down|left|right> [--in target] [--amount 0.6]
  swipe <from> <to> [--ms 300]
  key <back|home|recents|notifications|quick_settings|enter|lock|power_dialog>
  open <app> [--store]       open an app by name or package; --store: if not installed, show it in the Play Store
  launch <app> [--store]     same as open
  apps [filter]
  current                    which app is in front
  wait <text> [--timeout 10000]

Device (direct commands, no navigating Settings)
  volume [media|ring|notification|alarm|call|system] [get|up|down|mute|unmute|max|<level>|<n>%] [--show]
  ringer [normal|vibrate|silent]
  brightness [get|0-100|auto|manual]       needs "Modify system settings" once (permissions grant)
  rotation [get|auto|portrait|landscape]   needs "Modify system settings" once
  flashlight <on|off>
  dnd [get|on|alarms|total|off]            Do Not Disturb; needs DND access once (permissions grant)
  settings [page] [--app <package>]        open a settings page: wifi, bluetooth, display, sound, battery, apps, ...
  url <link> [--package <app>]             open a web page or deep link (myapp://..., geo:, mailto:)
  dial <number>                            open the dialer with the number filled in (never calls)
  search <query>                           web search on the phone
  store <app name> | --package <id>        Play Store page / search
  battery                                  level, charging, temperature, power saver
  wake                                     turn the screen on (a PIN lock stays locked)
  clipboard [set <text>]                   read / set the phone clipboard
  notifications [--limit 20] [--clear]     notifications seen since the service started
  permissions [grant]                      what the app may do; grant: allow the one-time permissions over USB
  stop <package>                           force-stop an app (USB)

Transfer (Wi-Fi or USB)
  send <file> [file...]                    send files to the phone (they land in Downloads/Agent Bridge)
  received                                 files the phone sent to this computer, and where they are
  drop                                     drag-and-drop page for sending files: http://localhost:8350/drop
`;

async function control() {
  const { pos, flags } = parseArgs(rest);
  const bridge = new Bridge({ host: false });
  const run = (c, a, t) => bridge.run(c, a, t);
  const outline = (r) => r.outline && console.log(r.outline);
  const via = (r) => (r.via === 'adb' ? ' (through adb)' : '');
  const chooser = async () => {
    const c = await run('current_app');
    if (c.package === 'android') console.log('Android is asking which app to use ("Complete action using"): tap one, e.g. `tap Phone`.');
  };
  switch (cmd) {
    case 'status': {
      const s = await run('status');
      if (!s.phones.length) return console.log(`No phone connected. Pair at http://localhost:${s.port}/pair`);
      for (const p of s.phones) console.log(`${p.manufacturer} ${p.model} — Android ${p.release} (API ${p.sdk}), ${p.screenW}x${p.screenH}, via ${p.via}, gestures: ${p.gestures}, screenshots: ${p.screenshot}`);
      return;
    }
    case 'screen': {
      const r = await run('screen', { mode: flags.mode, cols: num(flags.cols), maxSide: num(flags['max-side']) }, 30000);
      if (r.image) {
        const out = path.resolve(typeof flags.out === 'string' ? flags.out : 'phone-screen.' + (r.mime === 'image/png' ? 'png' : 'jpg'));
        fs.writeFileSync(out, Buffer.from(r.image, 'base64'));
        console.log('Screenshot: ' + out);
      }
      if (r.note || r.captureError) console.log(r.note || 'No screenshot: ' + r.captureError);
      return outline(r);
    }
    case 'elements': {
      outline(await run('elements', { all: !!flags.all }));
      if (flags.ocr) console.log('\n' + (await run('ocr')).outline);
      return;
    }
    case 'ocr': return console.log((await run('ocr', {}, 45000)).outline);
    case 'tap': {
      if (!pos[0]) die('usage: tap <target> [--long]');
      const r = await run('tap', { target: pos.join(' '), long: !!flags.long });
      console.log(`Tapped at ${r.x},${r.y}${r.via === 'ocr' ? ` (found "${r.matched}" by reading the screen)` : via(r)}`);
      return outline(r);
    }
    case 'type': {
      if (!pos.length) die('usage: type <text> [--into target] [--append] [--submit]');
      const r = await run('type', { text: pos.join(' '), target: flags.into, append: !!flags.append, submit: !!flags.submit });
      console.log('Typed' + via(r));
      return outline(r);
    }
    case 'scroll': {
      if (!pos[0]) die('usage: scroll <up|down|left|right> [--in target]');
      const r = await run('scroll', { direction: pos[0], target: flags.in, amount: num(flags.amount) });
      console.log('Scrolled ' + pos[0] + via(r));
      return outline(r);
    }
    case 'swipe': {
      if (pos.length < 2) die('usage: swipe <from> <to> [--ms 300]');
      const r = await run('swipe', { from: pos[0], to: pos[1], ms: num(flags.ms) });
      console.log('Swiped' + via(r));
      return outline(r);
    }
    case 'key': {
      if (!pos[0]) die('usage: key <name>');
      const r = await run('key', { key: pos[0] });
      console.log('Pressed ' + pos[0] + via(r));
      return outline(r);
    }
    case 'open':
    case 'launch': {
      if (!pos.length) die('usage: open <app> [--store]');
      const r = await run('open_app', { name: pos.join(' '), settle: 5000, store: !!flags.store });
      console.log(r.installed === false ? `${pos.join(' ')} is not installed; opened the Play Store so you can install it` : `Opened ${r.label} (${r.package})`);
      return outline(r);
    }
    case 'current': {
      const r = await run('current_app');
      return console.log(r.package ? `${r.label} (${r.package})` : 'No app in front');
    }
    case 'volume': {
      const streams = ['media', 'ring', 'notification', 'alarm', 'call', 'system'];
      const stream = streams.includes(pos[0]) ? pos.shift() : 'media';
      const r = await run('volume', { stream, action: pos[0] || 'get', show: !!flags.show });
      console.log(`${r.stream} volume ${r.level}/${r.max} · ringer ${r.ringer}`);
      return console.log(Object.entries(r.all).map(([k, v]) => `  ${k.padEnd(13)}${v.level}/${v.max}`).join('\n'));
    }
    case 'ringer': { const r = await run('ringer', { mode: pos[0] || '' }); return console.log('Ringer: ' + r.ringer); }
    case 'brightness': { const r = await run('brightness', { value: pos[0] || 'get' }); return console.log(`Brightness ${r.percent}%${r.auto ? ' (auto)' : ''}`); }
    case 'rotation': { const r = await run('rotation', { value: pos[0] || 'get' }); return console.log(r.auto ? 'Rotation: auto' : `Rotation: locked ${r.locked}`); }
    case 'flashlight':
    case 'torch': { if (!pos[0]) die('usage: flashlight <on|off>'); const r = await run('torch', { state: pos[0] }); return console.log('Flashlight ' + r.flashlight); }
    case 'dnd': { const r = await run('dnd', { state: pos[0] || 'get' }); return console.log('Do Not Disturb: ' + r.dnd); }
    case 'settings': {
      const app = typeof flags.app === 'string' ? flags.app : '';
      const r = await run('settings_page', { page: pos[0] || (app ? '' : 'settings'), app });
      return console.log('Opened ' + r.opened);
    }
    case 'url': { if (!pos[0]) die('usage: url <link>'); const r = await run('view_url', { url: pos[0], package: typeof flags.package === 'string' ? flags.package : '' }); console.log('Opened ' + r.opened); return chooser(); }
    case 'dial': { if (!pos[0]) die('usage: dial <number>'); const r = await run('dial', { number: pos.join('') }); console.log(`Dialer open with ${r.dialer} (not calling)`); return chooser(); }
    case 'search': { if (!pos.length) die('usage: search <query>'); const r = await run('web_search', { query: pos.join(' ') }); console.log('Searching for ' + r.searched); return chooser(); }
    case 'store': { const r = await run('store', { query: pos.join(' '), package: typeof flags.package === 'string' ? flags.package : '' }); return console.log('Opened ' + r.opened); }
    case 'battery': {
      const r = await run('battery');
      return console.log(`Battery ${r.percent}% · ${r.charging ? 'charging' : 'not charging'} (plugged: ${r.plugged}) · ${r.temperature_c}°C · power saver ${r.power_saver ? 'on' : 'off'} · screen ${r.screen_on ? 'on' : 'off'}`);
    }
    case 'wake': { await run('wake'); return console.log('Screen on (a PIN or pattern lock stays locked)'); }
    case 'clipboard': {
      const r = await run('clipboard', pos[0] === 'set' ? { set: pos.slice(1).join(' ') } : {});
      return console.log(pos[0] === 'set' ? 'Clipboard set' : r.clipboard == null ? '(clipboard empty or not readable: Android 10+ hides it from background apps)' : r.clipboard);
    }
    case 'notifications': {
      const r = await run('notifications', { limit: num(flags.limit) ?? 20, clear: !!flags.clear });
      if (!r.notifications.length) return console.log('No notifications seen since the service started.');
      return console.log(r.notifications.map((n) => `${new Date(n.time).toLocaleTimeString()}  ${n.app}  ${n.text}`).join('\n'));
    }
    case 'permissions': {
      const r = await run(pos[0] === 'grant' ? 'grant_permissions' : 'permissions', {}, 30000);
      if (r.granted) console.log('Granted over USB: ' + (r.granted.join(', ') || 'nothing'));
      const p = r.permissions || r;
      return console.log(Object.entries(p).map(([k, v]) => `  ${k.replace(/_/g, ' ').padEnd(24)}${v === true ? 'yes' : v === false ? 'NO' : v}`).join('\n'));
    }
    case 'send': {
      if (!pos.length) die('usage: send <file> [file...]');
      const files = pos.map((p) => path.resolve(p));
      for (const f of files) if (!fs.existsSync(f) || !fs.statSync(f).isFile()) die(`not a file: ${f}`);
      const r = await run('send_files', { paths: files }, 30 * 60 * 1000);
      return console.log(r.map((x) => `Sent ${x.name} (${fmtSize(x.size)}) → phone: ${x.saved}`).join('\n'));
    }
    case 'received': {
      const r = await run('received_files', { limit: num(flags.limit) ?? 20 });
      console.log('Folder: ' + r.folder);
      return console.log(r.files.length ? r.files.map((f) => `  ${new Date(f.time).toLocaleString()}  ${fmtSize(f.size).padStart(9)}  ${f.name}`).join('\n') : '  (nothing yet)');
    }
    case 'drop': return console.log(`Open http://localhost:${loadConfig().port}/drop in your browser to drag files to the phone.`);
    case 'stop': { if (!pos[0]) die('usage: stop <package>'); const r = await run('force_stop', { package: pos[0] }); return console.log('Stopped ' + r.stopped); }
    case 'apps': {
      const r = await run('apps', { filter: pos.join(' ') || undefined });
      return console.log(r.apps.map((x) => `${x.label} — ${x.package}`).join('\n'));
    }
    case 'wait': {
      const timeout = num(flags.timeout) ?? 10000;
      const r = await run('wait_text', { text: pos.join(' '), timeout }, timeout + 5000);
      console.log(r.found ? 'Found' : 'Not found');
      return outline(r);
    }
  }
}

async function start({ quiet = false } = {}) {
  const bridge = new Bridge({ host: true, log: (m) => console.log(`[${new Date().toLocaleTimeString()}] ${m}`) });
  await bridge.ensure();
  const cfg = bridge.cfg;
  const link = pairLink(cfg);
  if (!bridge.hub) {
    console.log(`A bridge is already running on port ${cfg.port}. Pairing page: http://localhost:${cfg.port}/pair`);
    if (!quiet) process.exit(0);
    return bridge;
  }
  if (quiet) return bridge;
  console.log('\nScan with the Agent Bridge app (phone on the same Wi-Fi):\n');
  console.log(await qrTerminal(link));
  console.log(`Bigger QR code: http://localhost:${cfg.port}/pair`);
  if (!lanAddresses().length) console.log('No Wi-Fi/LAN address found on this computer; use `usb` instead.');
  console.log('Agents (MCP or CLI) on this computer now share this bridge. Ctrl+C to stop.\n');
  return bridge;
}

function findApk() {
  return [
    path.join(here, '..', 'apk', 'agent-bridge.apk'),
    path.join(here, '..', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
    path.join(here, '..', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
  ].find((f) => fs.existsSync(f));
}

async function usb() {
  await ensureAdb().catch((e) => die(e.message));
  const list = await devices().catch((e) => die(e.message));
  if (!list.length) {
    die('No phone found over USB.\n1. Settings → About phone → tap "Build number" 7 times (developer mode).\n2. Settings → Developer options → turn on USB debugging.\n3. Plug the phone in and accept the "Allow USB debugging?" prompt.\n\nNo cable? Android 11+ can do this over Wi-Fi: npx android-agent-bridge wifi');
  }
  await setUp(await pickSerial());
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wireless-debugging services the phone announces on the network: [{ name, type, addr }]. */
async function mdnsServices() {
  const out = await adb(['mdns', 'services'], { serial: null }).catch(() => '');
  return out.split('\n').map((l) => l.trim().split(/\s+/)).filter((p) => p.length >= 3 && p[1].startsWith('_adb-tls'))
    .map(([name, type, addr]) => ({ name, type, addr }));
}

/**
 * Same as `usb`, but without a cable: Android 11+ "Wireless debugging". The phone scans a QR code
 * from this terminal (or types a pairing code), then adb installs and sets up the app over Wi-Fi.
 * Installs through adb are not blocked by Play Protect.
 */
async function wifi() {
  const { flags } = parseArgs(rest);
  await ensureAdb().catch((e) => die(e.message));
  console.log('\nInstall Agent Bridge over Wi-Fi (Android 11 or newer, phone on the same Wi-Fi as this computer)\n');
  console.log('On the phone:');
  console.log('  1. Settings → About phone → tap "Build number" 7 times (once, turns on developer options)');
  console.log('  2. Settings → Developer options → Wireless debugging → turn it on');

  let paired = false;
  if (!flags.code) {
    const name = 'agentbridge-' + Math.random().toString(36).slice(2, 7);
    const pass = String(Math.floor(100000 + Math.random() * 900000));
    console.log('  3. Tap "Pair device with QR code" and scan this:\n');
    console.log(await qrTerminal(`WIFI:T:ADB;S:${name};P:${pass};;`));
    console.log('Waiting for the phone… (no QR option? Ctrl+C and run: npx android-agent-bridge wifi --code)');
    for (let i = 0; i < 180 && !paired; i++) {
      const svc = (await mdnsServices()).find((s) => s.name === name && s.type.startsWith('_adb-tls-pairing'));
      if (svc) {
        const out = await adb(['pair', svc.addr, pass], { serial: null, timeout: 30000 }).catch((e) => e.message);
        if (!/Successfully paired/i.test(out)) die('Pairing failed: ' + out);
        paired = true;
      } else await wait(1000);
    }
    if (!paired) die('The phone did not show up. Check both are on the same Wi-Fi, or try: npx android-agent-bridge wifi --code');
  } else {
    console.log('  3. Tap "Pair device with pairing code"\n');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const addr = (await rl.question('IP address & port shown in that dialog (e.g. 192.168.1.5:37000): ')).trim();
    const code = (await rl.question('Wi-Fi pairing code: ')).trim();
    rl.close();
    const out = await adb(['pair', addr, code], { serial: null, timeout: 30000 }).catch((e) => e.message);
    if (!/Successfully paired/i.test(out)) die('Pairing failed: ' + out);
  }
  console.log('✔ Paired with the phone for wireless debugging');

  // after pairing the phone announces a connect service; adb usually connects to it by itself
  let serial = null;
  for (let i = 0; i < 30 && !serial; i++) {
    const list = await devices().catch(() => []);
    const wireless = list.find((d) => d.serial.includes('_adb-tls-connect') || /:\d+$/.test(d.serial));
    if (wireless) { serial = wireless.serial; break; }
    for (const s of (await mdnsServices()).filter((x) => x.type.startsWith('_adb-tls-connect'))) {
      await adb(['connect', s.addr], { serial: null }).catch(() => {});
    }
    await wait(1000);
  }
  if (!serial) die('Paired, but could not connect. On the phone, check Wireless debugging is still on and run this again.');
  console.log('✔ Connected over Wi-Fi');
  await setUp(serial);
}

/** Installs the app if needed, switches on its accessibility service, pairs it and runs the bridge. */
async function setUp(serial) {
  const { flags } = parseArgs(rest);
  const sh = (...c) => adb(['shell', ...c], { serial });
  const cfg = loadConfig();
  const sdk = Number(await sh('getprop', 'ro.build.version.sdk'));
  const model = await sh('getprop', 'ro.product.model');
  console.log(`Phone: ${model} (API ${sdk}), serial ${serial}`);
  if (sdk < 21) die('Android 5.0 (API 21) or newer is required.');

  const installed = (await sh('pm', 'path', APP_ID).catch(() => '')).includes('package:');
  if (!installed || flags.reinstall) {
    const apk = typeof flags.apk === 'string' ? flags.apk : findApk();
    if (!apk) die('The Agent Bridge app is not installed and no APK was found. Install it on the phone first (see README), or pass --apk <file>.');
    console.log('Installing ' + path.basename(apk) + ' …');
    await adb(['install', '-r', apk], { serial, timeout: 120000 });
  }

  // bridge first, so the phone connects the moment it is paired
  const bridge = await start({ quiet: true });
  await adb(['reverse', `tcp:${cfg.port}`, `tcp:${cfg.port}`], { serial });
  console.log(`✔ USB tunnel on port ${cfg.port}`);

  const comp = `${APP_ID}/${APP_ID}.AgentService`;
  const cur = (await sh('settings', 'get', 'secure', 'enabled_accessibility_services')).trim();
  if (!cur.includes(comp)) {
    const next = cur && cur !== 'null' ? `${cur}:${comp}` : comp;
    await sh('settings', 'put', 'secure', 'enabled_accessibility_services', next);
    await sh('settings', 'put', 'secure', 'accessibility_enabled', '1');
  }
  console.log('✔ Accessibility service on');

  const link = pairLink(cfg, ['127.0.0.1', ...lanAddresses()]);
  await sh('am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'${link}'`, APP_ID);
  console.log('✔ Paired (USB first, Wi-Fi when unplugged)');
  if (sdk < 24) console.log('• Android ' + sdk + ': taps by coordinate and grid go through adb, so keep USB plugged in for those.');
  if (sdk < 30) console.log('• For screenshots over Wi-Fi tap "Allow screen capture" in the app (over USB they work anyway).');
  if (!bridge.hub) process.exit(0);
  console.log('\nBridge running. Agents (MCP or CLI) on this computer use it. Ctrl+C to stop.\n');
}

function writeMcpConfig(file) {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  cfg.mcpServers ||= {};
  // run from a source checkout (not installed from npm): point at this copy
  const local = !/node_modules|[\\/]_npx[\\/]/.test(here);
  cfg.mcpServers.phone = local
    ? { command: 'node', args: [path.join(here, 'cli.mjs')] }
    : process.platform === 'win32'
      ? { command: 'cmd', args: ['/c', 'npx', '-y', 'android-agent-bridge'] }
      : { command: 'npx', args: ['-y', 'android-agent-bridge'] };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
}

function init() {
  const root = process.cwd();
  const done = [];
  writeMcpConfig(path.join(root, '.mcp.json'));
  done.push('.mcp.json                                 (Claude Code)');
  if (fs.existsSync(path.join(root, '.cursor')) || rest.includes('--cursor')) {
    writeMcpConfig(path.join(root, '.cursor', 'mcp.json'));
    done.push('.cursor/mcp.json                          (Cursor)');
  }
  const skillSrc = path.join(here, '..', 'skill', 'SKILL.md');
  const skillDst = path.join(root, '.claude', 'skills', 'phone-control', 'SKILL.md');
  fs.mkdirSync(path.dirname(skillDst), { recursive: true });
  fs.copyFileSync(skillSrc, skillDst);
  done.push('.claude/skills/phone-control/SKILL.md     (how the agent uses the phone)');
  const agents = path.join(root, 'AGENTS.md');
  const guide = fs.readFileSync(skillSrc, 'utf8').replace(/^---[\s\S]*?---\n/, '');
  const section = `<!-- phone-control:start -->\n${guide.trim()}\n<!-- phone-control:end -->\n`;
  const existing = fs.existsSync(agents) ? fs.readFileSync(agents, 'utf8') : '';
  fs.writeFileSync(agents, existing.includes('<!-- phone-control:start -->')
    ? existing.replace(/<!-- phone-control:start -->[\s\S]*?<!-- phone-control:end -->\n?/, section)
    : (existing ? existing.trimEnd() + '\n\n' : '') + section);
  done.push('AGENTS.md (phone-control section)         (Antigravity, Cursor, others)');
  console.log('\n✔ android-agent-bridge set up:\n  ' + done.join('\n  '));
  console.log('\nNext: restart your agent, then pair the phone (`npx android-agent-bridge start` or `usb`).\n');
}

try {
  if (!cmd || cmd === 'mcp') {
    const { startServer } = await import('./mcp.mjs');
    await startServer();
  } else if (cmd === 'help' || cmd === '--help' || cmd === '-h') console.log(HELP);
  else if (cmd === 'start') await start();
  else if (cmd === 'usb') await usb();
  else if (cmd === 'wifi') await wifi();
  else if (cmd === 'init') init();
  else if (cmd === 'pair') {
    const cfg = parseArgs(rest).flags.reset ? resetToken() : loadConfig();
    const link = pairLink(cfg);
    console.log(await qrTerminal(link));
    console.log(link + `\n\nThe bridge must be running (\`start\`) for the phone to connect. Page: http://localhost:${cfg.port}/pair`);
  } else if (['status', 'screen', 'elements', 'ocr', 'tap', 'type', 'scroll', 'swipe', 'key', 'open', 'launch', 'apps', 'current', 'wait', 'volume', 'ringer', 'brightness', 'rotation', 'flashlight', 'torch', 'dnd', 'settings', 'url', 'dial', 'search', 'store', 'battery', 'wake', 'clipboard', 'notifications', 'permissions', 'stop', 'send', 'received', 'drop'].includes(cmd)) await control();
  else die(`Unknown command "${cmd}".\n\n` + HELP);
} catch (err) {
  die('Error: ' + err.message);
}
