// End-to-end: a fake phone dials the hub; commands go through the Bridge
// (owning process) and through /rpc (a second process, like the CLI).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

process.env.AAB_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'aab-'));
process.env.AAB_PORT = String(18350 + Math.floor(Math.random() * 1000));
// no adb in tests: never touch a real phone that happens to be plugged in
process.env.ANDROID_SERIAL = '';
process.env.ANDROID_HOME = process.env.ANDROID_SDK_ROOT = process.env.LOCALAPPDATA = process.env.HOME = process.env.AAB_HOME;
process.env.PATH = '';
const { Bridge } = await import('../server/bridge.mjs');
const { loadConfig } = await import('../server/config.mjs');

const cfg = loadConfig();
let owner, phone;

function fakePhone(token, handlers) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${cfg.port}/phone`);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', token, info: { manufacturer: 'Test', model: 'Phone', release: '6.0', sdk: 23, screenW: 1080, screenH: 1920, gestures: false, screenshot: 'built-in' } })));
    ws.on('message', (d) => {
      const m = JSON.parse(String(d));
      if (m.type === 'welcome') return resolve(ws);
      if (m.type === 'rejected') return reject(new Error(m.error));
      const h = handlers[m.cmd];
      try { ws.send(JSON.stringify({ id: m.id, ok: true, result: h ? h(m.args) : {} })); }
      catch (e) { ws.send(JSON.stringify({ id: m.id, ok: false, error: e.message })); }
    });
    ws.on('error', reject);
  });
}

before(async () => {
  owner = new Bridge({ host: true });
  await owner.ensure();
  phone = await fakePhone(cfg.token, {
    elements: () => ({ outline: '[1] button "OK" @540,960' }),
    screen: (a) => ({ outline: 'mode ' + a.mode, image: 'aGk=', mime: 'image/jpeg' }),
    tap: (a) => {
      if (a.target === '1') return { x: 540, y: 960, via: 'action' };
      if (a.target === '444,2160') return { x: 444, y: 2160, via: 'gesture' };
      if (/^[A-Za-z ]+$/.test(a.target)) throw new Error(`nothing on screen matches "${a.target}". Use an element number, a grid cell like C7, or x,y.`);
      return { needsAdb: { op: 'tap', x: 5, y: 5, reason: 'Needs Android 7+.' }, x: 5, y: 5 };
    },
    ocr: () => ({ lines: [{ text: 'Home', x: 248, y: 2160 }, { text: 'Services', x: 444, y: 2160 }], outline: 'ocr' }),
    boom: () => { throw new Error('kaboom'); },
  });
});

after(() => { phone?.close(); owner?.close(); });

test('rejects a phone with the wrong token', async () => {
  await assert.rejects(fakePhone('nope', {}), /Scan the QR code again/);
});

test('status lists the phone', async () => {
  const s = await owner.run('status');
  assert.equal(s.phones.length, 1);
  assert.equal(s.phones[0].model, 'Phone');
  assert.equal(s.phones[0].via, 'usb'); // loopback = adb reverse
});

test('actions return the updated element list', async () => {
  const r = await owner.run('tap', { target: '1', settle: 0 });
  assert.equal(r.x, 540);
  assert.match(r.outline, /\[1\] button "OK"/);
});

test('second process goes through /rpc', async () => {
  const cli = new Bridge({ host: false });
  const r = await cli.run('screen', { mode: 'grid' });
  assert.equal(r.outline, 'mode grid');
  assert.equal(r.image, 'aGk=');
  await assert.rejects(cli.run('boom'), /kaboom/);
});

test('old-Android fallback explains that USB is needed when adb is missing', async () => {
  await assert.rejects(owner.run('tap', { target: 'C3' }), /Needs Android 7\+\..*USB/);
});

test('pair link carries hosts, port and token', async () => {
  const p = await owner.run('pair');
  const u = new URL(p.link);
  assert.equal(u.protocol, 'agentbridge:');
  assert.equal(u.searchParams.get('t'), cfg.token);
  assert.equal(u.searchParams.get('p'), String(cfg.port));
  assert.match(p.qr, /\S/);
});

test('pairing page and rpc are refused without the token', async () => {
  const page = await fetch(`http://127.0.0.1:${cfg.port}/pair`);
  assert.match(await page.text(), /Pair your phone/);
  const bad = await fetch(`http://127.0.0.1:${cfg.port}/rpc`, { method: 'POST', body: '{"cmd":"status"}' });
  assert.equal(bad.status, 401);
});

test('tap by text falls back to OCR when the app hides the control', async () => {
  const r = await owner.run('tap', { target: 'services', after: false });
  assert.equal(r.via, 'ocr');
  assert.equal(r.matched, 'Services');
  assert.equal(r.x, 444);
});

test('OCR fallback reports clearly when the text is nowhere on screen', async () => {
  await assert.rejects(owner.run('tap', { target: 'Wallet', after: false }), /nor in the screen text \(OCR\)/);
});

test('findText prefers exact, then starts-with, then contains', async () => {
  const { findText } = await import('../server/bridge.mjs');
  const lines = [{ text: 'Parcel Bike' }, { text: 'Bike' }, { text: 'Bike rentals' }];
  assert.equal(findText(lines, 'bike').text, 'Bike');
  assert.equal(findText(lines, 'bike r').text, 'Bike rentals');
  assert.equal(findText(lines, 'parcel').text, 'Parcel Bike');
  assert.equal(findText(lines, 'zzz'), null);
});
