#!/usr/bin/env node
/**
 * LocalShare — Zero-Dependency Local Network Signaling & In-Memory Relay Server
 * Uses only built-in Node.js modules (http, crypto). Never writes to disk.
 * Groups devices on the same local internet via CF-Connecting-IP / X-Forwarded-For.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.LOCALSHARE_PORT || 3080);
const HOST = process.env.LOCALSHARE_HOST || '127.0.0.1';
const MAX_PAYLOAD_BYTES = 256 * 1024; // 256 KB max per signaling/chunk frame

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/**
 * Determine the caller's network room from Cloudflare / Nginx headers.
 * Devices behind the same home/office router share the same public IP.
 */
function getClientNetworkIp(req) {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) {
    return cfIp.trim();
  }
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  const xReal = req.headers['x-real-ip'];
  if (typeof xReal === 'string' && xReal.trim()) {
    return xReal.trim();
  }
  const raw = req.socket?.remoteAddress || '127.0.0.1';
  // Normalize IPv4-mapped IPv6 addresses and localhost into a single local group
  if (raw === '::1' || raw === '127.0.0.1' || raw.startsWith('::ffff:127.')) {
    return 'local-network';
  }
  return raw.replace(/^::ffff:/, '');
}

function hashNetworkRoom(ip, customRoom = '') {
  const cleanRoom = String(customRoom || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 24);
  if (cleanRoom) {
    return `room:${cleanRoom}`;
  }
  const hash = crypto
    .createHash('sha256')
    .update(`localshare-lan:${ip}`)
    .digest('hex')
    .slice(0, 10);
  return `lan:${hash}`;
}

/**
 * Encode a UTF-8 JSON string into an RFC 6455 WebSocket text frame.
 */
function encodeWsTextFrame(str) {
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text frame
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function encodeWsPongFrame(payload = Buffer.alloc(0)) {
  const len = Math.min(payload.length, 125);
  const header = Buffer.from([0x8a, len]);
  return Buffer.concat([header, payload.subarray(0, len)]);
}

// Active rooms: Map<roomKey, Map<peerId, PeerClient>>
const rooms = new Map();

function broadcastRoomPeers(roomKey) {
  const room = rooms.get(roomKey);
  if (!room) return;
  const peerList = Array.from(room.values()).map((c) => ({
    id: c.id,
    name: c.name,
    deviceType: c.deviceType,
    joinedAt: c.joinedAt,
  }));

  for (const client of room.values()) {
    sendJson(client.socket, {
      type: 'peers',
      roomId: roomKey.replace(/^(lan|room):/, '').toUpperCase(),
      roomMode: roomKey.startsWith('room:') ? 'custom' : 'lan',
      selfId: client.id,
      peers: peerList.filter((p) => p.id !== client.id),
    });
  }
}

function sendJson(socket, obj) {
  if (!socket || socket.destroyed || !socket.writable) return;
  try {
    socket.write(encodeWsTextFrame(JSON.stringify(obj)));
  } catch {
    // Ignore socket write errors
  }
}

function removeClient(client) {
  const room = rooms.get(client.roomKey);
  if (!room) return;
  room.delete(client.id);
  if (room.size === 0) {
    rooms.delete(client.roomKey);
  } else {
    broadcastRoomPeers(client.roomKey);
  }
}

export function attachLocalShareWebSocket(server) {
  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (
      url.pathname !== '/localshare/ws' &&
      url.pathname !== '/textshare/ws' &&
      url.pathname !== '/ws'
    ) {
      return;
    }

    const key = req.headers['sec-websocket-key'];
    if (!key || typeof key !== 'string') {
      socket.destroy();
      return;
    }

    const accept = crypto
      .createHash('sha1')
      .update(key + WS_GUID)
      .digest('base64');

    socket.write(
      [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        '\r\n',
      ].join('\r\n')
    );

    socket.setNoDelay(true);

    const netIp = getClientNetworkIp(req);
    const initialRoom = url.searchParams.get('room') || '';
    const peerId = 'dev-' + crypto.randomBytes(5).toString('hex');
    const defaultNum = Math.floor(100 + Math.random() * 900);

    const client = {
      id: peerId,
      name: `Device #${defaultNum}`,
      deviceType: 'Desktop',
      netIp,
      roomKey: hashNetworkRoom(netIp, initialRoom),
      joinedAt: Date.now(),
      socket,
    };

    const joinRoom = (nextRoomKey) => {
      if (rooms.has(client.roomKey)) {
        const prev = rooms.get(client.roomKey);
        prev.delete(client.id);
        if (prev.size === 0) rooms.delete(client.roomKey);
        else broadcastRoomPeers(client.roomKey);
      }
      client.roomKey = nextRoomKey;
      if (!rooms.has(nextRoomKey)) {
        rooms.set(nextRoomKey, new Map());
      }
      rooms.get(nextRoomKey).set(client.id, client);
      broadcastRoomPeers(nextRoomKey);
    };

    joinRoom(client.roomKey);

    let buffer = Buffer.alloc(0);
    let fragmentedText = null;
    let fragmentedTextBytes = 0;

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > MAX_PAYLOAD_BYTES * 2) {
        socket.destroy();
        return;
      }

      while (buffer.length >= 2) {
        const firstByte = buffer[0];
        const secondByte = buffer[1];
        const isFinal = (firstByte & 0x80) !== 0;
        const opcode = firstByte & 0x0f;
        const isMasked = (secondByte & 0x80) !== 0;
        let payloadLen = secondByte & 0x7f;
        let offset = 2;

        if (payloadLen === 126) {
          if (buffer.length < 4) return;
          payloadLen = buffer.readUInt16BE(2);
          offset = 4;
        } else if (payloadLen === 127) {
          if (buffer.length < 10) return;
          const bigLen = buffer.readBigUInt64BE(2);
          if (bigLen > BigInt(MAX_PAYLOAD_BYTES)) {
            socket.destroy();
            return;
          }
          payloadLen = Number(bigLen);
          offset = 10;
        }

        if (payloadLen > MAX_PAYLOAD_BYTES) {
          socket.destroy();
          return;
        }

        const maskLen = isMasked ? 4 : 0;
        const totalFrameLen = offset + maskLen + payloadLen;
        if (buffer.length < totalFrameLen) return;

        const mask = isMasked ? buffer.subarray(offset, offset + 4) : null;
        const payload = Buffer.from(
          buffer.subarray(offset + maskLen, totalFrameLen)
        );
        buffer = buffer.subarray(totalFrameLen);

        if (isMasked && mask) {
          for (let i = 0; i < payload.length; i++) {
            payload[i] ^= mask[i & 3];
          }
        }

        if (opcode === 0x08) {
          // Close frame
          socket.end();
          return;
        }
        if (opcode === 0x09) {
          // Ping -> Pong
          socket.write(encodeWsPongFrame(payload));
          continue;
        }
        if (opcode === 0x01) {
          // A WebSocket message can be fragmented, including across UTF-8 characters.
          if (fragmentedText !== null) {
            socket.destroy();
            return;
          }
          if (isFinal) {
            handleClientMessage(client, payload.toString('utf8'), joinRoom);
          } else {
            fragmentedText = [payload];
            fragmentedTextBytes = payload.length;
          }
        } else if (opcode === 0x00) {
          if (fragmentedText === null) {
            socket.destroy();
            return;
          }
          fragmentedTextBytes += payload.length;
          if (fragmentedTextBytes > MAX_PAYLOAD_BYTES || fragmentedText.length >= 2048) {
            socket.destroy();
            return;
          }
          fragmentedText.push(payload);
          if (isFinal) {
            const text = Buffer.concat(fragmentedText, fragmentedTextBytes).toString('utf8');
            fragmentedText = null;
            fragmentedTextBytes = 0;
            handleClientMessage(client, text, joinRoom);
          }
        }
      }
    });

    const cleanup = () => removeClient(client);
    socket.on('close', cleanup);
    socket.on('error', cleanup);
    socket.on('end', cleanup);
  });
}

function handleClientMessage(client, rawText, joinRoom) {
  let msg;
  try {
    msg = JSON.parse(rawText);
  } catch {
    return;
  }
  if (!msg || typeof msg !== 'object') return;

  switch (msg.type) {
    case 'hello': {
      if (typeof msg.name === 'string' && msg.name.trim()) {
        client.name = msg.name.trim().slice(0, 40);
      }
      if (typeof msg.deviceType === 'string' && msg.deviceType.trim()) {
        client.deviceType = msg.deviceType.trim().slice(0, 24);
      }
      if (typeof msg.room === 'string') {
        const nextKey = hashNetworkRoom(client.netIp, msg.room);
        if (nextKey !== client.roomKey) {
          joinRoom(nextKey);
          return;
        }
      }
      broadcastRoomPeers(client.roomKey);
      break;
    }

    case 'signal':
    case 'relay-meta':
    case 'relay-chunk':
    case 'relay-ack':
    case 'relay-end':
    case 'relay-cancel':
    case 'text-share': {
      const room = rooms.get(client.roomKey);
      if (!room) return;
      const targetId = msg.targetId;
      const outPayload = {
        ...msg,
        fromId: client.id,
        fromName: client.name,
        fromDeviceType: client.deviceType,
      };

      if (targetId === '*' || targetId === 'ALL') {
        for (const peer of room.values()) {
          if (peer.id !== client.id) {
            sendJson(peer.socket, outPayload);
          }
        }
      } else if (typeof targetId === 'string') {
        const peer = room.get(targetId);
        if (peer) {
          sendJson(peer.socket, outPayload);
        }
      }
      break;
    }

    case 'ping': {
      sendJson(client.socket, { type: 'pong', ts: Date.now() });
      break;
    }
  }
}

// Run standalone HTTP + WebSocket server if executed directly
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const indexHtmlPath = path.join(__dirname, 'index.html');
  const httpServer = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    try {
      const html = fs.readFileSync(indexHtmlPath, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
      res.end(html);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  attachLocalShareWebSocket(httpServer);

  httpServer.listen(PORT, HOST, () => {
    console.log(`LocalShare signaling server listening on http://${HOST}:${PORT}`);
  });
}
