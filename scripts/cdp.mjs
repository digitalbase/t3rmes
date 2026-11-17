#!/usr/bin/env node
// Drive the dev window over CDP (electron/main.cjs opens port 9333 in dev).
//   node scripts/cdp.mjs shot [file.png]        screenshot
//   node scripts/cdp.mjs eval '<js expression>'  evaluate in the page, print JSON
//   node scripts/cdp.mjs click '<css selector>'  real mouse click at the element's center
//   node scripts/cdp.mjs clickxy <x> <y>         real mouse click at CSS pixels
//   node scripts/cdp.mjs type '<text>'           type into the focused element
//   node scripts/cdp.mjs key <Key>               press a key, e.g. Escape, Control+1
import { writeFileSync } from 'node:fs';

const [cmd, ...args] = process.argv.slice(2);
const pages = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = pages.find((p) => p.type === 'page' && p.url.startsWith('http://127.0.0.1:5175'));
if (!page) throw new Error('t3rmes dev window not found on :9333');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
let nextId = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  const handler = pending.get(msg.id);
  if (!handler) return;
  pending.delete(msg.id);
  msg.error ? handler.reject(new Error(msg.error.message)) : handler.resolve(msg.result);
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

async function evaluate(expression) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return result.value;
}

async function clickAt(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (cmd === 'shot') {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const file = args[0] ?? '/tmp/opencode/t3rmes-shot.png';
  writeFileSync(file, Buffer.from(data, 'base64'));
  console.log(file);
} else if (cmd === 'eval') {
  console.log(JSON.stringify(await evaluate(args[0]), null, 2));
} else if (cmd === 'click') {
  const rect = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(args[0])}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!rect) throw new Error(`no element for ${args[0]}`);
  await clickAt(rect.x, rect.y);
  await sleep(250);
  console.log(`clicked ${args[0]} at ${Math.round(rect.x)},${Math.round(rect.y)}`);
} else if (cmd === 'clickxy') {
  await clickAt(Number(args[0]), Number(args[1]));
  await sleep(250);
} else if (cmd === 'type') {
  await send('Input.insertText', { text: args[0] });
} else if (cmd === 'key') {
  // Modifiers as a prefix, e.g. Control+Shift+ArrowDown.
  const parts = args[0].split('+');
  const key = parts.pop();
  const modifiers = parts.reduce((bits, name) => bits | ({ Alt: 1, Control: 2, Meta: 4, Shift: 8 }[name] ?? 0), 0);
  const code = /^[0-9]$/.test(key) ? `Digit${key}` : key;
  const windowsVirtualKeyCode = { Escape: 27, Enter: 13, ArrowUp: 38, ArrowDown: 40 }[key] ?? (/^[0-9]$/.test(key) ? key.charCodeAt(0) : 0);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers, windowsVirtualKeyCode });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers, windowsVirtualKeyCode });
  await sleep(250);
} else {
  console.error('usage: shot | eval <js> | click <selector> | clickxy <x> <y> | type <text> | key <Key>');
  process.exitCode = 2;
}
ws.close();
