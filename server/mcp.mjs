// MCP server: the phone as tools for AI agents. Actions return the updated
// element list (cheap text) so the agent only asks for a screenshot when it
// needs to see pixels.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createRequire } from 'node:module';
import { Bridge } from './bridge.mjs';

const { version: VERSION } = createRequire(import.meta.url)('../package.json');
const log = (...a) => process.stderr.write('[android-agent-bridge] ' + a.join(' ') + '\n');

const TARGET_HELP = 'what to act on: element number from the last screen ("12"), grid cell ("C7"), pixel coordinates ("540,1200") or visible text ("Sign in"; text missing from the element list is found by OCR)';
const after = {
  after: z.boolean().optional().describe('return the updated element list afterwards (default true)'),
  settle: z.number().int().optional().describe('max ms to wait for the screen to stop changing before reading it (default 2500)'),
};

const text = (s) => ({ content: [{ type: 'text', text: s }] });
const fail = (err) => ({ content: [{ type: 'text', text: 'Error: ' + (err?.message || String(err)) }], isError: true });
const wrap = (fn) => async (args) => { try { return await fn(args || {}); } catch (err) { return fail(err); } };

function actionResult(r, done) {
  const parts = [done + (r.via === 'adb' ? ' (through adb)' : '')];
  if (r.outline) parts.push(r.outline);
  return text(parts.join('\n\n'));
}

export function registerTools(server, bridge) {
  server.registerTool('phone_status', {
    description: 'Is a phone connected? Shows model, Android version, how it is connected and what it can do. Call first; if nothing is connected it explains how to pair.',
    inputSchema: {},
  }, wrap(async () => {
    const s = await bridge.run('status');
    if (!s.phones.length) {
      const p = await bridge.run('pair');
      return text(`No phone connected.\nAsk the user to open ${p.page} on this computer and scan the QR code with the Agent Bridge app (same Wi-Fi), or to plug the phone in and run \`npx android-agent-bridge usb\`.\n\n${p.qr}`);
    }
    return text(s.phones.map((p) => `${p.current ? '* ' : '  '}${p.manufacturer} ${p.model} — Android ${p.release} (API ${p.sdk}), ${p.screenW}x${p.screenH}, via ${p.via}; gestures: ${p.gestures ? 'yes' : 'element taps only (USB adds coordinate taps)'}; screenshots: ${p.screenshot}`).join('\n'));
  }));

  server.registerTool('phone_screen', {
    description: 'Screenshot of the phone with every tappable element boxed and numbered, plus the element list as text. mode "grid" overlays lettered cells (A1 top-left) for spots without an element (games, maps, images); "both" draws both. Use phone_elements instead when text is enough.',
    inputSchema: {
      mode: z.enum(['marks', 'grid', 'both', 'plain']).optional().describe('default "marks"'),
      cols: z.number().int().min(4).max(30).optional().describe('grid columns (default 12; rows follow the screen shape)'),
      maxSide: z.number().int().optional().describe('longest image side in px (default 1280)'),
    },
  }, wrap(async (a) => {
    const r = await bridge.run('screen', a, 30000);
    const content = [];
    if (r.image) content.push({ type: 'image', data: r.image, mimeType: r.mime || 'image/jpeg' });
    content.push({ type: 'text', text: [r.note || (r.captureError ? 'No screenshot: ' + r.captureError : ''), r.outline].filter(Boolean).join('\n\n') });
    return { content };
  }));

  server.registerTool('phone_elements', {
    description: 'Text list of what is on screen: numbered tappable elements, inputs, text and their positions. Cheaper than a screenshot. all=true also lists elements hidden under sheets or dialogs (for debugging).',
    inputSchema: { all: z.boolean().optional().describe('include elements covered by something on top') },
  }, wrap(async (a) => text((await bridge.run('elements', { all: !!a.all })).outline)));

  server.registerTool('phone_ocr', {
    description: 'Read the text drawn on the screen (on-device OCR) with positions. Use when something you can see in a screenshot is missing from phone_elements: many apps hide tab bars, rows or custom-drawn buttons from accessibility. phone_tap with that text also falls back to OCR automatically.',
    inputSchema: {},
  }, wrap(async () => text((await bridge.run('ocr', {}, 45000)).outline)));

  server.registerTool('phone_tap', {
    description: 'Tap (or long-press) something on the phone. ' + TARGET_HELP + '.',
    inputSchema: { target: z.string().describe(TARGET_HELP), long: z.boolean().optional().describe('long press'), ...after },
  }, wrap(async (a) => {
    const r = await bridge.run('tap', a);
    return actionResult(r, `${a.long ? 'Long-pressed' : 'Tapped'} ${a.target} at ${r.x},${r.y}${r.via === 'ocr' ? ` (found "${r.matched}" by reading the screen, it is not in the element list)` : ''}`);
  }));

  server.registerTool('phone_type', {
    description: 'Type text into an input (no keyboard tapping needed). Without target it types into the focused input. submit presses Enter/Search/Send afterwards.',
    inputSchema: {
      text: z.string(),
      target: z.string().optional().describe('input to type into: ' + TARGET_HELP),
      append: z.boolean().optional().describe('keep existing text (default replaces it)'),
      submit: z.boolean().optional().describe('press Enter afterwards'),
      ...after,
    },
  }, wrap(async (a) => actionResult(await bridge.run('type', a), `Typed "${a.text}"${a.submit ? ' and submitted' : ''}`)));

  server.registerTool('phone_scroll', {
    description: 'Scroll the screen or one scrollable element. direction is where the content moves into view: "down" shows what is below.',
    inputSchema: {
      direction: z.enum(['up', 'down', 'left', 'right']),
      target: z.string().optional().describe('scrollable element to scroll (default: the main scrollable area)'),
      amount: z.number().min(0.1).max(1).optional().describe('fraction of the area to scroll (default 0.6)'),
      ...after,
    },
  }, wrap(async (a) => actionResult(await bridge.run('scroll', a), `Scrolled ${a.direction}`)));

  server.registerTool('phone_swipe', {
    description: 'Drag from one point to another (sliders, swipe-to-dismiss, custom gestures). from/to take the same targets as phone_tap.',
    inputSchema: { from: z.string(), to: z.string(), ms: z.number().int().optional().describe('duration, default 300'), ...after },
  }, wrap(async (a) => actionResult(await bridge.run('swipe', a), `Swiped ${a.from} → ${a.to}`)));

  server.registerTool('phone_key', {
    description: 'System buttons and keys: back, home, recents, notifications, quick_settings, enter, lock, power_dialog.',
    inputSchema: { key: z.enum(['back', 'home', 'recents', 'notifications', 'quick_settings', 'enter', 'lock', 'power_dialog']), ...after },
  }, wrap(async (a) => actionResult(await bridge.run('key', a), `Pressed ${a.key}`)));

  server.registerTool('phone_open_app', {
    description: 'Open (launch) an installed app by its name ("WhatsApp") or package ("com.whatsapp"). With store=true, an app that is not installed is shown in the Play Store instead (nothing is installed automatically).',
    inputSchema: {
      name: z.string(),
      store: z.boolean().optional().describe('if not installed, open its Play Store search'),
      settle: z.number().int().optional().describe('max ms to wait for it to finish opening (default 5000)'),
      after: z.boolean().optional(),
    },
  }, wrap(async (a) => {
    const r = await bridge.run('open_app', { ...a, settle: a.settle ?? 5000 });
    return actionResult(r, r.installed === false ? `${a.name} is not installed; opened the Play Store` : `Opened ${r.label} (${r.package})`);
  }));

  // ---- direct device commands: no navigating Settings by hand ----
  const json = (r) => text(JSON.stringify(r, null, 1));

  server.registerTool('phone_volume', {
    description: 'Read or change volume. stream: media (default), ring, notification, alarm, call, system. action: get, up, down, mute, unmute, max, a level number, or a percentage like "40%". Returns every stream level and the ringer mode.',
    inputSchema: {
      stream: z.enum(['media', 'ring', 'notification', 'alarm', 'call', 'system']).optional(),
      action: z.string().optional().describe('get | up | down | mute | unmute | max | <level> | <n>%'),
      show: z.boolean().optional().describe('show the volume slider on screen'),
    },
  }, wrap(async (a) => json(await bridge.run('volume', { stream: a.stream || 'media', action: a.action || 'get', show: !!a.show }))));

  server.registerTool('phone_brightness', {
    description: 'Read or set screen brightness: "get", 0–100, "auto" or "manual". Needs "Modify system settings" once (phone_permissions grant=true over USB, or the phone opens that settings page).',
    inputSchema: { value: z.string().optional() },
  }, wrap(async (a) => json(await bridge.run('brightness', { value: a.value || 'get' }))));

  server.registerTool('phone_toggle', {
    description: 'Quick device switches. flashlight: on|off. rotation: get|auto|portrait|landscape (needs "Modify system settings" once). dnd (Do Not Disturb): get|on|alarms|total|off (needs DND access once). ringer: get|normal|vibrate|silent.',
    inputSchema: { setting: z.enum(['flashlight', 'rotation', 'dnd', 'ringer']), value: z.string().optional() },
  }, wrap(async (a) => {
    const v = a.value || 'get';
    if (a.setting === 'flashlight') return json(await bridge.run('torch', { state: v === 'get' ? 'on' : v }));
    if (a.setting === 'rotation') return json(await bridge.run('rotation', { value: v }));
    if (a.setting === 'dnd') return json(await bridge.run('dnd', { state: v }));
    return json(await bridge.run('ringer', { mode: v === 'get' ? '' : v }));
  }));

  server.registerTool('phone_settings', {
    description: 'Open a system settings page directly: settings, wifi, bluetooth, mobile-data, airplane, hotspot, nfc, location, display, sound, battery, storage, apps, notifications, security, privacy, accessibility, date, language, keyboard, developer, about, dnd, cast, vpn; Android 10+ panels: wifi-panel, internet-panel, volume-panel. Or app=<package> for an app\'s info page (permissions, storage, force stop).',
    inputSchema: { page: z.string().optional(), app: z.string().optional() },
  }, wrap(async (a) => actionResult(await bridge.run('settings_page', { page: a.page || (a.app ? '' : 'settings'), app: a.app || '' }), `Opened ${a.app ? 'app info for ' + a.app : a.page || 'settings'}`)));

  server.registerTool('phone_open_link', {
    description: 'Open a web page or a deep link on the phone (https://…, myapp://…, geo:lat,lng?q=…, mailto:…). package= forces a specific app (e.g. com.android.chrome).',
    inputSchema: { url: z.string(), package: z.string().optional() },
  }, wrap(async (a) => actionResult(await bridge.run('view_url', { url: a.url, package: a.package || '', settle: 4000 }), `Opened ${a.url}`)));

  server.registerTool('phone_dial', {
    description: 'Open the phone dialer with a number filled in. It never places the call; the user presses call. If several dialer apps are installed, Android shows "Complete action using": tap one.',
    inputSchema: { number: z.string() },
  }, wrap(async (a) => actionResult(await bridge.run('dial', { number: a.number, settle: 3000 }), `Dialer opened with ${a.number} (not calling)`)));

  server.registerTool('phone_web_search', {
    description: 'Run a web search on the phone (opens the default search app or browser).',
    inputSchema: { query: z.string() },
  }, wrap(async (a) => actionResult(await bridge.run('web_search', { query: a.query, settle: 4000 }), `Searched for ${a.query}`)));

  server.registerTool('phone_device_info', {
    description: 'Battery (level, charging, temperature, power saver, screen on), the app in front, and which permissions Agent Bridge has (system settings, Do Not Disturb, screen capture, gestures).',
    inputSchema: {},
  }, wrap(async () => json({ battery: await bridge.run('battery'), app: await bridge.run('current_app'), permissions: await bridge.run('permissions') })));

  server.registerTool('phone_notifications', {
    description: 'Notifications that arrived on the phone since the Agent Bridge service started (app, text, time), newest first.',
    inputSchema: { limit: z.number().int().optional(), clear: z.boolean().optional() },
  }, wrap(async (a) => json(await bridge.run('notifications', { limit: a.limit ?? 20, clear: !!a.clear }))));

  server.registerTool('phone_clipboard', {
    description: 'Read the phone clipboard, or set it (set="text"). Android 10+ may hide the clipboard from background apps, so reading can come back empty.',
    inputSchema: { set: z.string().optional() },
  }, wrap(async (a) => json(await bridge.run('clipboard', a.set != null ? { set: a.set } : {}))));

  server.registerTool('phone_wake', {
    description: 'Turn the screen on. A PIN, pattern or password lock stays locked: ask the user to unlock.',
    inputSchema: {},
  }, wrap(async () => json(await bridge.run('wake'))));

  server.registerTool('phone_permissions', {
    description: 'Check what Agent Bridge is allowed to do. grant=true switches on the one-time permissions (Modify system settings, Do Not Disturb access) over USB with adb.',
    inputSchema: { grant: z.boolean().optional() },
  }, wrap(async (a) => json(await bridge.run(a.grant ? 'grant_permissions' : 'permissions', {}, 30000))));

  server.registerTool('phone_send_files', {
    description: 'Send files from this computer to the phone (absolute paths). They are saved in Downloads/Agent Bridge on the phone. Works over Wi-Fi or USB.',
    inputSchema: { paths: z.array(z.string()).min(1) },
  }, wrap(async (a) => json(await bridge.run('send_files', { paths: a.paths }, 30 * 60 * 1000))));

  server.registerTool('phone_received_files', {
    description: 'Files the user sent from the phone to this computer (newest first) and the folder they are in, so you can open or read them.',
    inputSchema: { limit: z.number().int().optional() },
  }, wrap(async (a) => json(await bridge.run('received_files', { limit: a.limit ?? 20 }))));

  server.registerTool('phone_stop_app', {
    description: 'Force-stop an app by package (needs the phone on USB). Unsaved work in that app is lost.',
    inputSchema: { package: z.string() },
  }, wrap(async (a) => json(await bridge.run('force_stop', { package: a.package }))));

  server.registerTool('phone_apps', {
    description: 'List installed apps that can be opened (name and package).',
    inputSchema: { filter: z.string().optional().describe('only names/packages containing this') },
  }, wrap(async (a) => {
    const r = await bridge.run('apps', a);
    return text(r.apps.map((x) => `${x.label} — ${x.package}`).join('\n') || 'No apps match.');
  }));

  server.registerTool('phone_wait_for', {
    description: 'Wait until some text appears on screen (page loads, messages arriving). Returns the element list.',
    inputSchema: { text: z.string(), timeout: z.number().int().optional().describe('ms, default 10000') },
  }, wrap(async (a) => {
    const timeout = a.timeout ?? 10000;
    const r = await bridge.run('wait_text', { text: a.text, timeout }, timeout + 5000);
    return text(`${r.found ? 'Found' : 'Not found within ' + timeout + 'ms:'} "${a.text}"\n\n${r.outline}`);
  }));
}

export async function startServer() {
  const bridge = new Bridge({ log, host: true });
  const server = new McpServer({ name: 'android-agent-bridge', version: VERSION });
  registerTools(server, bridge);
  await server.connect(new StdioServerTransport());
  bridge.ensure().then(async () => {
    if (bridge.hub) {
      const p = await bridge.run('pair');
      log(`pair a phone at ${p.page}`);
    } else log('using the bridge already running on this computer');
  }).catch((err) => log(err.message));
  process.stdin.on('close', () => { bridge.close(); process.exit(0); });
}
