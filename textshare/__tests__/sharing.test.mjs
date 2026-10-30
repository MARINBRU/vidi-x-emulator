import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { File } from 'node:buffer';
import { JSDOM, VirtualConsole } from 'jsdom';
import WebSocket from 'ws';
import { attachLocalShareWebSocket } from '../../localshare/server.mjs';

const textHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const textScript = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const localHtml = readFileSync(new URL('../../localshare/index.html', import.meta.url), 'utf8');
const localScript = localHtml.match(/<script>([\s\S]*?)<\/script>/)[1];
let server;
let base;
let networkSockets = new Set();
let clients = [];
let rawClients = [];
let sequence = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => res.end('test'));
  server.on('connection', socket => {
    networkSockets.add(socket);
    socket.on('close', () => networkSockets.delete(socket));
  });
  attachLocalShareWebSocket(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterEach(() => {
  for (const client of rawClients) client.socket.close();
  rawClients = [];
  for (const client of clients) {
    for (const socket of client.sockets) socket.close();
    client.dom.window.close();
  }
  clients = [];
});

afterAll(async () => {
  for (const socket of networkSockets) socket.destroy();
  await new Promise(resolve => server.close(resolve));
});

function openClient(kind, name, room) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(kind === 'text' ? textHtml : localHtml, {
    url: base + (kind === 'text' ? '/textshare/' : '/localshare/'),
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;
  const sockets = [];
  const OriginalWebSocket = window.WebSocket;
  window.WebSocket = class TrackingWebSocket extends OriginalWebSocket {
    constructor(...args) { super(...args); sockets.push(this); }
  };
  window.Blob = globalThis.Blob;
  window.File = File;
  let copied = '';
  Object.defineProperty(window.navigator, 'clipboard', {
    value: {
      async readText() { return copied; },
      async writeText(value) { copied = value; },
    },
    configurable: true,
  });
  const downloads = [];
  window.URL.createObjectURL = blob => { downloads.push(blob); return 'blob:share-test'; };
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function () {};
  window.localStorage.setItem('localshare_device_name', name);
  window.localStorage.setItem('localshare_custom_room', room);
  window.eval(kind === 'text' ? textScript : localScript);
  const client = { dom, window, document: window.document, sockets, downloads, errors, copied: () => copied };
  clients.push(client);
  return client;
}

function roomName() { return 'sharing-test-' + ++sequence; }
function change(client, element, value) {
  element.value = value;
  element.dispatchEvent(new client.window.Event('input', { bubbles: true }));
  element.dispatchEvent(new client.window.Event('change', { bubbles: true }));
}
function chooseTextRecipient(client, name) {
  const select = client.document.querySelector('#recipient');
  const option = Array.from(select.options).find(item => item.textContent.startsWith(name + ' ('));
  expect(option).toBeDefined();
  change(client, select, option.value);
}
function setFiles(client, input, files) {
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  input.dispatchEvent(new client.window.Event('change', { bubbles: true }));
}
async function ready(client, names) {
  await vi.waitFor(() => {
    const list = client.document.querySelector('#devicesList').textContent;
    for (const name of names) expect(list).toContain(name);
  }, { timeout: 5000, interval: 10 });
}
async function received(client, expected) {
  await vi.waitFor(() => {
    const previews = Array.from(client.document.querySelectorAll('#history .history-preview'));
    expect(previews.some(pre => pre.textContent === expected)).toBe(true);
  }, { timeout: 5000, interval: 10 });
}

async function openRaw(path, headers = {}) {
  const socket = new WebSocket(base.replace('http:', 'ws:') + path, { headers });
  const client = { socket, messages: [] };
  rawClients.push(client);
  socket.on('message', data => client.messages.push(JSON.parse(data.toString())));
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  await vi.waitFor(() => expect(client.messages.some(msg => msg.type === 'peers')).toBe(true));
  client.id = client.messages.find(msg => msg.type === 'peers').selfId;
  return client;
}
function latestPeers(client) {
  return client.messages.filter(msg => msg.type === 'peers').at(-1)?.peers || [];
}

describe('TextShare and LocalShare', () => {
  it('groups connections by the Cloudflare IP and keeps broadcasts inside their room', async () => {
    const first = await openRaw('/textshare/ws', {
      'CF-Connecting-IP': '203.0.113.10', 'X-Forwarded-For': '192.0.2.1',
    });
    const sameNetwork = await openRaw('/localshare/ws', {
      'CF-Connecting-IP': '203.0.113.10', 'X-Forwarded-For': '192.0.2.2',
    });
    const otherNetwork = await openRaw('/textshare/ws', {
      'CF-Connecting-IP': '203.0.113.11', 'X-Forwarded-For': '192.0.2.1',
    });
    first.socket.send(JSON.stringify({ type: 'hello', name: 'First PC' }));
    await vi.waitFor(() => {
      expect(latestPeers(sameNetwork).find(peer => peer.id === first.id)?.name).toBe('First PC');
    });
    expect(latestPeers(first).map(peer => peer.id)).toContain(sameNetwork.id);
    expect(latestPeers(first).map(peer => peer.id)).not.toContain(otherNetwork.id);

    first.socket.send(JSON.stringify({
      type: 'text-share', targetId: 'ALL', text: 'test', fromId: 'spoofed', fromName: 'spoofed',
    }));
    await vi.waitFor(() => expect(sameNetwork.messages.some(msg => msg.type === 'text-share')).toBe(true));
    const packet = sameNetwork.messages.find(msg => msg.type === 'text-share');
    expect(packet).toMatchObject({ text: 'test', fromId: first.id, fromName: 'First PC' });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(otherNetwork.messages.some(msg => msg.type === 'text-share')).toBe(false);

    const codedA = await openRaw('/textshare/ws?room=Same-Code', { 'CF-Connecting-IP': '203.0.113.10' });
    const codedB = await openRaw('/localshare/ws?room=same-code', { 'CF-Connecting-IP': '203.0.113.11' });
    await vi.waitFor(() => expect(latestPeers(codedA).map(peer => peer.id)).toContain(codedB.id));
  });

  it('reassembles fragmented messages and rejects oversized fragmented payloads', async () => {
    const room = roomName();
    const sender = await openRaw('/textshare/ws?room=' + room);
    const receiver = await openRaw('/localshare/ws?room=' + room);
    const text = 'Fragmented UTF-8: 🐙';
    const payload = Buffer.from(JSON.stringify({ type: 'text-share', targetId: receiver.id, text }));
    const split = payload.indexOf(Buffer.from('🐙')) + 2;
    sender.socket.send(payload.subarray(0, split), { binary: false, fin: false });
    sender.socket.ping('keepalive');
    sender.socket.send(payload.subarray(split), { binary: false, fin: true });
    await vi.waitFor(() => expect(receiver.messages.some(msg => msg.type === 'text-share' && msg.text === text)).toBe(true));

    const oversized = await openRaw('/textshare/ws?room=' + room);
    oversized.socket.on('error', () => {});
    oversized.socket.send(Buffer.alloc(200 * 1024, 65), { binary: false, fin: false });
    oversized.socket.send(Buffer.alloc(100 * 1024, 65), { binary: false, fin: true });
    await vi.waitFor(() => expect(oversized.socket.readyState).toBe(WebSocket.CLOSED), { timeout: 5000, interval: 10 });
  });

  it('discovers peers, sends exact text to one or all, and isolates other rooms', async () => {
    const room = roomName();
    const a = openClient('text', 'Alpha', room);
    const b = openClient('text', 'Beta', room);
    const c = openClient('text', 'Gamma', room);
    const other = openClient('text', 'Other', roomName());
    await ready(a, ['Beta', 'Gamma']);
    await ready(b, ['Alpha', 'Gamma']);
    expect(a.document.querySelector('#devicesList').textContent).not.toContain('Other');

    chooseTextRecipient(a, 'Beta');
    const text = '  Hello čžš 😄\n\n<script>not executable</script>  ';
    change(a, a.document.querySelector('#textInput'), text);
    a.document.querySelector('#sendText').click();
    await received(b, text);
    expect(b.document.querySelector('#history script')).toBeNull();
    expect(c.document.querySelectorAll('#history .history-item')).toHaveLength(0);
    expect(other.document.querySelectorAll('#history .history-item')).toHaveLength(0);

    change(a, a.document.querySelector('#recipient'), 'ALL');
    change(a, a.document.querySelector('#textInput'), 'everyone');
    a.document.querySelector('#sendText').click();
    await Promise.all([received(b, 'everyone'), received(c, 'everyone')]);
    expect(other.document.querySelectorAll('#history .history-item')).toHaveLength(0);

    const input = a.document.querySelector('#textInput');
    change(a, input, 'before after');
    input.setSelectionRange(7, 7);
    await a.window.navigator.clipboard.writeText('pasted ');
    a.document.querySelector('#pasteText').click();
    await vi.waitFor(() => expect(input.value).toBe('before pasted after'));

    // A selected peer leaving must not silently change the target to everyone.
    chooseTextRecipient(a, 'Beta');
    b.sockets[0].close();
    await vi.waitFor(() => expect(a.document.querySelector('#devicesList').textContent).not.toContain('Beta'));
    expect(a.document.querySelector('#recipient').value).toBe('');
    expect(a.document.querySelector('#sendText').disabled).toBe(true);
    expect([...a.errors, ...b.errors, ...c.errors, ...other.errors]).toEqual([]);
  });

  it('sends large pasted text in chunks and preserves downloaded file bytes', async () => {
    const room = roomName();
    const a = openClient('text', 'Alpha', room);
    const b = openClient('text', 'Beta', room);
    await ready(a, ['Beta']);
    chooseTextRecipient(a, 'Beta');

    const largeText = 'long text 🐙 '.repeat(12000);
    change(a, a.document.querySelector('#textInput'), largeText);
    a.document.querySelector('#sendText').click();
    await vi.waitFor(() => {
      expect(b.document.querySelector('#history .history-actions button')).not.toBeNull();
    }, { timeout: 10000, interval: 10 });
    expect(b.document.querySelector('#history').textContent).toContain('Preview shortened');
    b.document.querySelector('#history .history-actions button').click();
    await vi.waitFor(() => expect(b.copied()).toBe(largeText), { timeout: 5000, interval: 10 });

    const bytes = Buffer.from('First\r\nčžš\r\n\r\n', 'utf8');
    const file = new File([bytes], 'original.txt', { type: 'text/plain' });
    setFiles(a, a.document.querySelector('#fileInput'), [file]);
    await vi.waitFor(() => expect(a.document.querySelector('#sendFiles').disabled).toBe(false));
    a.document.querySelector('#sendFiles').click();
    await vi.waitFor(() => {
      expect(b.document.querySelector('#history').textContent).toContain('original.txt from Alpha');
      const latest = b.document.querySelector('#history .history-item');
      expect(latest.querySelectorAll('button')).toHaveLength(2);
    }, { timeout: 10000, interval: 10 });
    b.document.querySelector('#history .history-item .history-actions button:last-child').click();
    expect(Buffer.from(await b.downloads.at(-1).arrayBuffer())).toEqual(bytes);

    setFiles(a, a.document.querySelector('#fileInput'), [new File([], 'empty.txt', { type: 'text/plain' })]);
    await vi.waitFor(() => expect(a.document.querySelector('#sendFiles').disabled).toBe(false));
    a.document.querySelector('#sendFiles').click();
    await vi.waitFor(() => {
      const latest = b.document.querySelector('#history .history-item');
      expect(latest.textContent).toContain('empty.txt from Alpha');
      expect(latest.querySelectorAll('button')).toHaveLength(2);
    }, { timeout: 10000, interval: 10 });
    b.document.querySelector('#history .history-item .history-actions button:last-child').click();
    expect((await b.downloads.at(-1).arrayBuffer()).byteLength).toBe(0);
    expect([...a.errors, ...b.errors]).toEqual([]);
  });

  it('exchanges text and files with LocalShare in both directions and rejects oversized files', async () => {
    const room = roomName();
    const text = openClient('text', 'Text PC', room);
    const local = openClient('local', 'Local PC', room);
    local.document.querySelector('#autoDownloadToggle').checked = false;
    await ready(text, ['Local PC']);
    await ready(local, ['Text PC']);

    chooseTextRecipient(text, 'Local PC');
    change(text, text.document.querySelector('#textInput'), 'From TextShare');
    text.document.querySelector('#sendText').click();
    await vi.waitFor(() => expect(local.document.querySelector('#transfersList').textContent).toContain('From TextShare'));

    const targetSelect = local.document.querySelector('#textTargetSelect');
    const option = Array.from(targetSelect.options).find(item => item.textContent.startsWith('Text PC ('));
    change(local, targetSelect, option.value);
    change(local, local.document.querySelector('#textShareInput'), 'From LocalShare');
    local.document.querySelector('#sendTextBtn').click();
    await received(text, 'From LocalShare');

    const toLocal = Buffer.from('TextShare bytes\r\n🦊');
    setFiles(text, text.document.querySelector('#fileInput'), [new File([toLocal], 'to-local.txt', { type: 'text/plain' })]);
    text.document.querySelector('#sendFiles').click();
    await vi.waitFor(() => expect(local.document.querySelector('a[download="to-local.txt"]')).not.toBeNull(), { timeout: 10000, interval: 10 });
    expect(Buffer.from(await local.downloads.at(-1).arrayBuffer())).toEqual(toLocal);

    const fromLocal = Buffer.from('LocalShare bytes\r\nč');
    const peerRow = Array.from(local.document.querySelectorAll('.device-row')).find(row => row.textContent.includes('Text PC'));
    peerRow.querySelector('button.primary').click();
    const fileInput = local.document.querySelector('#fileInputSingle');
    setFiles(local, fileInput, [new File([fromLocal], 'from-local.txt', { type: 'text/plain' })]);
    await vi.waitFor(() => {
      const row = Array.from(text.document.querySelectorAll('#history .history-item')).find(item => item.textContent.includes('from-local.txt from Local PC'));
      expect(row?.querySelectorAll('button')).toHaveLength(2);
    }, { timeout: 10000, interval: 10 });
    text.document.querySelector('#history .history-item .history-actions button:last-child').click();
    expect(Buffer.from(await text.downloads.at(-1).arrayBuffer())).toEqual(fromLocal);

    setFiles(local, fileInput, [new File([Buffer.alloc(10 * 1024 * 1024 + 1)], 'too-big.txt', { type: 'text/plain' })]);
    await vi.waitFor(() => {
      const row = Array.from(local.document.querySelectorAll('#transfersList .transfer-item')).find(item => item.textContent.includes('too-big.txt'));
      expect(row?.textContent).toContain('Failed');
      expect(row?.textContent).toMatch(/too large|maximum/i);
    }, { timeout: 10000, interval: 10 });
    expect([...text.errors, ...local.errors]).toEqual([]);
  });
});
