(function () {
  'use strict';

  // Small WebSocket frames keep the shared relay's memory usage bounded.
  const MAX_BYTES = 10 * 1024 * 1024;
  const CHUNK_BYTES = 32 * 1024;
  const MAX_CHUNKS = 1024;
  const MAX_INLINE_BYTES = 128 * 1024;
  const PREVIEW_CHARS = 100000;
  const ACK_TIMEOUT_MS = 15000;
  const INCOMING_TIMEOUT_MS = 60000;

  const $ = (id) => document.getElementById(id);
  const ui = {
    connection: $('connectionStatus'),
    roomStatus: $('roomStatus'),
    deviceName: $('deviceName'),
    saveName: $('saveName'),
    roomCode: $('roomCode'),
    joinRoom: $('joinRoom'),
    peerCount: $('peerCount'),
    devicesList: $('devicesList'),
    recipient: $('recipient'),
    textInput: $('textInput'),
    pasteText: $('pasteText'),
    sendText: $('sendText'),
    fileInput: $('fileInput'),
    sendFiles: $('sendFiles'),
    notice: $('notice'),
    history: $('history'),
    clearHistory: $('clearHistory'),
  };

  function readSetting(key) {
    try { return localStorage.getItem(key) || ''; } catch { return ''; }
  }
  function writeSetting(key, value) {
    try { localStorage.setItem(key, value); } catch { /* Settings are optional. */ }
  }
  function deviceType() {
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'Android';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
    if (/Mac/i.test(ua)) return 'Mac';
    if (/Win/i.test(ua)) return 'Windows';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'Device';
  }
  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KiB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MiB';
  }
  function safeFileName(value) {
    const name = String(value || 'shared-text.txt').replace(/[\\/\x00-\x1f\x7f]/g, '_').slice(0, 180);
    return name && name !== '.' && name !== '..' ? name : 'shared-text.txt';
  }
  function makeId() {
    return 'text-' + (typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
  }
  function showNotice(text, isError = false) {
    ui.notice.textContent = text;
    ui.notice.classList.toggle('error', isError);
  }

  const myDeviceType = deviceType();
  let myName = readSetting('localshare_device_name') || myDeviceType + ' #' + Math.floor(100 + Math.random() * 900);
  let room = readSetting('localshare_custom_room').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
  let socket = null;
  let connected = false;
  let peers = [];
  let sending = false;
  let reconnectTimer = null;
  const pendingAcks = new Map();
  const incoming = new Map();
  const activeOutgoing = new Set();
  const rejectedOutgoing = new Set();

  ui.deviceName.value = myName;
  ui.roomCode.value = room;

  function isPeerOnline(id) {
    return peers.some((peer) => peer.id === id);
  }
  function selectedTargets() {
    const value = ui.recipient.value;
    if (!connected || !value) return [];
    if (value === 'ALL') return peers.slice();
    return peers.filter((peer) => peer.id === value);
  }
  function refreshActions() {
    const canSend = !sending && selectedTargets().length > 0;
    ui.sendText.disabled = !canSend || ui.textInput.value.length === 0;
    ui.sendFiles.disabled = !canSend || !ui.fileInput.files || ui.fileInput.files.length === 0;
    ui.recipient.disabled = sending || !connected || peers.length === 0;
    ui.fileInput.disabled = sending;
    ui.joinRoom.disabled = sending;
    ui.roomCode.disabled = sending;
  }
  function makeOption(value, label) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  }
  function renderPeers() {
    const previous = ui.recipient.value;
    ui.peerCount.textContent = '(' + peers.length + ')';
    ui.recipient.replaceChildren(makeOption('', 'Choose a device'));
    if (peers.length) {
      ui.recipient.appendChild(makeOption('ALL', 'All devices (' + peers.length + ')'));
      for (const peer of peers) {
        ui.recipient.appendChild(makeOption(peer.id, peer.name + ' (' + (peer.deviceType || 'Device') + ')'));
      }
    }
    // Never silently switch from a disconnected individual device to a broadcast.
    ui.recipient.value = previous === 'ALL' || isPeerOnline(previous) ? previous : '';
    if (!ui.recipient.value) ui.recipient.value = '';

    ui.devicesList.replaceChildren();
    if (!peers.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = connected
        ? 'No other devices yet. Open TextShare or LocalShare on another device.'
        : 'Waiting for a connection…';
      ui.devicesList.appendChild(empty);
    } else {
      for (const peer of peers) {
        const row = document.createElement('div');
        row.className = 'device';
        const name = document.createElement('strong');
        name.textContent = peer.name + ' (' + (peer.deviceType || 'Device') + ')';
        const choose = document.createElement('button');
        choose.type = 'button';
        choose.textContent = 'Select';
        choose.disabled = sending;
        choose.addEventListener('click', () => {
          ui.recipient.value = peer.id;
          refreshActions();
          ui.textInput.focus();
        });
        row.append(name, choose);
        ui.devicesList.appendChild(row);
      }
    }
    refreshActions();
  }

  function wsUrl() {
    const url = new URL('/textshare/ws', location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    if (room) url.searchParams.set('room', room);
    return url.toString();
  }
  function sendPacket(packet) {
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('Connection lost');
    socket.send(JSON.stringify(packet));
  }
  function tryPacket(packet) {
    try { sendPacket(packet); return true; } catch { return false; }
  }
  function sendHello() {
    tryPacket({ type: 'hello', name: myName, deviceType: myDeviceType, room });
  }
  function setConnection(text, online) {
    ui.connection.textContent = text;
    ui.connection.classList.toggle('online', online);
  }
  function rejectAllAcks(reason) {
    for (const [key, pending] of pendingAcks) {
      clearTimeout(pending.timer);
      pendingAcks.delete(key);
      pending.reject(new Error(reason));
    }
  }
  function connect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    setConnection('Connecting…', false);
    let current;
    try {
      current = new WebSocket(wsUrl());
    } catch {
      setConnection('Reconnecting…', false);
      reconnectTimer = setTimeout(connect, 2000);
      return;
    }
    socket = current;
    current.addEventListener('open', () => {
      if (socket !== current) return;
      connected = true;
      setConnection('Connected', true);
      sendHello();
      refreshActions();
    });
    current.addEventListener('message', (event) => {
      if (socket !== current) return;
      try { handleMessage(JSON.parse(event.data)); } catch { /* Ignore invalid packets. */ }
    });
    current.addEventListener('close', () => {
      if (socket !== current) return;
      socket = null;
      connected = false;
      setConnection('Reconnecting…', false);
      ui.roomStatus.textContent = 'Connection lost';
      peers = [];
      rejectAllAcks('Connection lost');
      for (const state of Array.from(incoming.values())) failIncoming(state, 'Connection lost');
      renderPeers();
      reconnectTimer = setTimeout(connect, 2000);
    });
  }
  setInterval(() => tryPacket({ type: 'ping' }), 25000);

  function handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'peers': {
        peers = Array.isArray(msg.peers) ? msg.peers.filter((peer) =>
          peer && typeof peer.id === 'string' && typeof peer.name === 'string') : [];
        ui.roomStatus.textContent = (msg.roomMode === 'custom' ? 'Room: ' : 'Automatic room: ') + (msg.roomId || '—');
        for (const [key, pending] of pendingAcks) {
          if (!isPeerOnline(pending.peerId)) {
            clearTimeout(pending.timer);
            pendingAcks.delete(key);
            pending.reject(new Error('Device disconnected'));
          }
        }
        for (const state of Array.from(incoming.values())) {
          if (!isPeerOnline(state.fromId)) failIncoming(state, 'Device disconnected');
        }
        renderPeers();
        break;
      }
      case 'text-share':
        if (typeof msg.text === 'string' && msg.text.length) {
          const blob = new Blob([msg.text], { type: 'text/plain;charset=utf-8' });
          if (blob.size <= MAX_BYTES) {
            const item = createHistoryItem('Text from ' + (msg.fromName || 'Device'), 'Receiving…', true);
            showReceived(item, blob, 'shared-text.txt');
          }
        }
        break;
      case 'relay-meta': receiveMeta(msg); break;
      case 'relay-chunk': receiveChunk(msg); break;
      case 'relay-end': receiveEnd(msg); break;
      case 'relay-cancel': receiveCancel(msg); break;
      case 'relay-ack': {
        const key = String(msg.transferId) + ':' + String(msg.chunkIndex);
        const pending = pendingAcks.get(key);
        if (pending && pending.peerId === msg.fromId) {
          clearTimeout(pending.timer);
          pendingAcks.delete(key);
          pending.resolve();
        }
        break;
      }
    }
  }

  function createHistoryItem(title, status, active = false) {
    const empty = ui.history.querySelector('.empty');
    if (empty) empty.remove();
    const item = document.createElement('article');
    item.className = 'history-item';
    item.dataset.active = active ? 'true' : 'false';
    const heading = document.createElement('div');
    heading.className = 'history-heading';
    const label = document.createElement('strong');
    label.textContent = title;
    const state = document.createElement('span');
    state.className = 'history-status';
    state.textContent = status;
    heading.append(label, state);
    item.appendChild(heading);
    ui.history.prepend(item);
    return {
      item,
      state,
      finish(text) { state.textContent = text; item.dataset.active = 'false'; },
    };
  }
  function showEmptyHistory() {
    if (ui.history.children.length) return;
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Nothing shared yet.';
    ui.history.appendChild(empty);
  }
  async function copyText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return;
    }
    const temp = document.createElement('textarea');
    temp.value = text;
    temp.style.position = 'fixed';
    temp.style.opacity = '0';
    document.body.appendChild(temp);
    temp.select();
    try {
      if (!document.execCommand('copy')) throw new Error('Copy unavailable');
    } finally {
      temp.remove();
    }
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = safeFileName(name);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function showReceived(entry, blob, name) {
    try {
      const text = await blob.text();
      const preview = document.createElement('pre');
      preview.className = 'history-preview';
      preview.textContent = text.length ? text.slice(0, PREVIEW_CHARS) : '(Empty file)';
      entry.item.appendChild(preview);
      if (text.length > PREVIEW_CHARS) {
        const hint = document.createElement('p');
        hint.className = 'hint';
        hint.textContent = 'Preview shortened. Copy and download contain the complete text.';
        entry.item.appendChild(hint);
      }
      const actions = document.createElement('div');
      actions.className = 'history-actions';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = 'Copy text';
      copy.addEventListener('click', async () => {
        try {
          await copyText(text);
          showNotice('Text copied.');
        } catch {
          showNotice('Could not copy automatically. Select the preview or download the file.', true);
        }
      });
      const download = document.createElement('button');
      download.type = 'button';
      download.textContent = 'Download';
      download.addEventListener('click', () => {
        try { downloadBlob(blob, name); }
        catch { showNotice('Could not download this file in your browser.', true); }
      });
      actions.append(copy, download);
      entry.item.appendChild(actions);
      entry.finish('Received · ' + formatBytes(blob.size));
    } catch {
      entry.finish('Could not read the received file');
    }
  }

  function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }
  function fromBase64(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  function transferKey(fromId, transferId) { return fromId + '\u0000' + transferId; }
  function refreshIncomingTimer(state) {
    clearTimeout(state.timer);
    state.timer = setTimeout(() => failIncoming(state, 'Transfer timed out'), INCOMING_TIMEOUT_MS);
  }
  function failIncoming(state, reason) {
    clearTimeout(state.timer);
    incoming.delete(state.key);
    state.entry.finish(reason);
  }
  function rejectIncoming(msg, reason) {
    tryPacket({ type: 'relay-cancel', targetId: msg.fromId, transferId: msg.transferId, reason });
    const entry = createHistoryItem('File from ' + (msg.fromName || 'Device'), reason);
    entry.finish(reason);
  }
  function receiveMeta(msg) {
    if (typeof msg.fromId !== 'string' || typeof msg.transferId !== 'string' || msg.transferId.length > 128) return;
    const key = transferKey(msg.fromId, msg.transferId);
    if (incoming.has(key)) return;
    if (!Number.isSafeInteger(msg.fileSize) || msg.fileSize < 0 || msg.fileSize > MAX_BYTES ||
        !Number.isSafeInteger(msg.totalChunks) || msg.totalChunks < 1 || msg.totalChunks > MAX_CHUNKS) {
      rejectIncoming(msg, 'File is too large or invalid (maximum 10 MiB)');
      return;
    }
    if (incoming.size >= 5) {
      rejectIncoming(msg, 'Too many transfers at once');
      return;
    }
    const name = safeFileName(msg.fileName);
    const state = {
      key, fromId: msg.fromId, transferId: msg.transferId,
      fileName: name, fileSize: msg.fileSize,
      fileType: typeof msg.fileType === 'string' ? msg.fileType.slice(0, 120) : 'text/plain',
      totalChunks: msg.totalChunks, chunks: [], bytes: 0, timer: null,
      entry: createHistoryItem(name + ' from ' + (msg.fromName || 'Device'), 'Receiving 0%', true),
    };
    incoming.set(key, state);
    refreshIncomingTimer(state);
  }
  function receiveChunk(msg) {
    const state = incoming.get(transferKey(msg.fromId, msg.transferId));
    if (!state) return;
    if (!Number.isSafeInteger(msg.chunkIndex) || msg.chunkIndex !== state.chunks.length ||
        typeof msg.data !== 'string' || msg.data.length > 90000) {
      failIncoming(state, 'Invalid file data');
      tryPacket({ type: 'relay-cancel', targetId: state.fromId, transferId: state.transferId, reason: 'Invalid file data' });
      return;
    }
    let bytes;
    try { bytes = fromBase64(msg.data); } catch {
      failIncoming(state, 'Invalid file data');
      tryPacket({ type: 'relay-cancel', targetId: state.fromId, transferId: state.transferId, reason: 'Invalid file data' });
      return;
    }
    if (bytes.length > 65536 || state.bytes + bytes.length > state.fileSize || state.chunks.length >= state.totalChunks) {
      failIncoming(state, 'Invalid file data');
      tryPacket({ type: 'relay-cancel', targetId: state.fromId, transferId: state.transferId, reason: 'Invalid file data' });
      return;
    }
    state.bytes += bytes.length;
    state.chunks.push(bytes);
    state.entry.state.textContent = 'Receiving ' + Math.round(state.chunks.length / state.totalChunks * 100) + '%';
    refreshIncomingTimer(state);
    if (msg.chunkIndex % 4 === 3 || msg.chunkIndex === state.totalChunks - 1) {
      tryPacket({ type: 'relay-ack', targetId: state.fromId, transferId: state.transferId, chunkIndex: msg.chunkIndex });
    }
  }
  function receiveEnd(msg) {
    const state = incoming.get(transferKey(msg.fromId, msg.transferId));
    if (!state) return;
    clearTimeout(state.timer);
    incoming.delete(state.key);
    if (state.chunks.length !== state.totalChunks || state.bytes !== state.fileSize) {
      state.entry.finish('Incomplete transfer');
      return;
    }
    const blob = new Blob(state.chunks, { type: state.fileType });
    showReceived(state.entry, blob, state.fileName);
  }
  function receiveCancel(msg) {
    const state = incoming.get(transferKey(msg.fromId, msg.transferId));
    if (state) failIncoming(state, 'Transfer cancelled');
    const key = transferKey(msg.fromId, msg.transferId);
    if (!activeOutgoing.has(key)) return;
    rejectedOutgoing.add(key);
    for (const [ackKey, pending] of pendingAcks) {
      if (pending.peerId === msg.fromId && pending.transferId === msg.transferId) {
        clearTimeout(pending.timer);
        pendingAcks.delete(ackKey);
        pending.reject(new Error('The other device declined the transfer'));
      }
    }
  }
  function sendChunkAndWait(packet, peerId) {
    return new Promise((resolve, reject) => {
      const key = packet.transferId + ':' + packet.chunkIndex;
      const timer = setTimeout(() => {
        pendingAcks.delete(key);
        reject(new Error('The other device did not confirm the transfer'));
      }, ACK_TIMEOUT_MS);
      pendingAcks.set(key, { resolve, reject, timer, peerId, transferId: packet.transferId });
      try { sendPacket(packet); } catch (error) {
        clearTimeout(timer);
        pendingAcks.delete(key);
        reject(error);
      }
    });
  }
  async function sendBlobToPeer(blob, name, peer) {
    const transferId = makeId();
    const key = transferKey(peer.id, transferId);
    const totalChunks = Math.max(1, Math.ceil(blob.size / CHUNK_BYTES));
    const entry = createHistoryItem('Sending ' + safeFileName(name) + ' to ' + peer.name, 'Starting…', true);
    activeOutgoing.add(key);
    try {
      if (!isPeerOnline(peer.id)) throw new Error('Device disconnected');
      sendPacket({
        type: 'relay-meta', targetId: peer.id, transferId,
        fileName: safeFileName(name), fileSize: blob.size,
        fileType: blob.type || 'text/plain', totalChunks, transport: 'LAN Relay',
      });
      for (let i = 0; i < totalChunks; i++) {
        const buffer = await blob.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES).arrayBuffer();
        if (!isPeerOnline(peer.id)) throw new Error('Device disconnected');
        if (rejectedOutgoing.has(key)) throw new Error('The other device declined the transfer');
        const packet = { type: 'relay-chunk', targetId: peer.id, transferId, chunkIndex: i, data: toBase64(buffer) };
        if (i % 4 === 3 || i === totalChunks - 1) await sendChunkAndWait(packet, peer.id);
        else sendPacket(packet);
        entry.state.textContent = 'Sending ' + Math.round((i + 1) / totalChunks * 100) + '%';
      }
      sendPacket({ type: 'relay-end', targetId: peer.id, transferId });
      entry.finish('Sent · ' + formatBytes(blob.size));
      return true;
    } catch (error) {
      tryPacket({ type: 'relay-cancel', targetId: peer.id, transferId });
      entry.finish('Failed: ' + (error instanceof Error ? error.message : 'Transfer interrupted'));
      return false;
    } finally {
      activeOutgoing.delete(key);
      rejectedOutgoing.delete(key);
    }
  }
  async function sendBlobs(items, targets) {
    let succeeded = 0;
    for (const item of items) {
      for (const peer of targets) {
        if (await sendBlobToPeer(item.blob, item.name, peer)) succeeded++;
      }
    }
    return succeeded;
  }

  ui.saveName.addEventListener('click', () => {
    const value = ui.deviceName.value.trim();
    if (!value) { showNotice('Enter a device name.', true); return; }
    myName = value.slice(0, 40);
    ui.deviceName.value = myName;
    writeSetting('localshare_device_name', myName);
    sendHello();
    showNotice('Device name saved.');
  });
  ui.joinRoom.addEventListener('click', () => {
    const value = ui.roomCode.value.trim();
    if (value && !/^[a-z0-9_-]{1,24}$/i.test(value)) {
      showNotice('Room codes can contain letters, numbers, hyphens and underscores only.', true);
      return;
    }
    room = value.toLowerCase();
    ui.roomCode.value = room;
    writeSetting('localshare_custom_room', room);
    peers = [];
    renderPeers();
    ui.roomStatus.textContent = connected ? 'Joining…' : 'Waiting for connection…';
    sendHello();
    showNotice(room ? 'Joining room ' + room + '.' : 'Returning to automatic discovery.');
  });
  ui.recipient.addEventListener('change', refreshActions);
  ui.textInput.addEventListener('input', refreshActions);
  ui.fileInput.addEventListener('change', refreshActions);
  ui.pasteText.addEventListener('click', async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) throw new Error('Clipboard unavailable');
      const text = await navigator.clipboard.readText();
      const start = ui.textInput.selectionStart;
      const end = ui.textInput.selectionEnd;
      ui.textInput.setRangeText(text, start, end, 'end');
      ui.textInput.focus();
      refreshActions();
      showNotice('Text pasted.');
    } catch {
      ui.textInput.focus();
      showNotice('Click the text box and paste with Ctrl+V or Cmd+V.', true);
    }
  });
  ui.sendText.addEventListener('click', async () => {
    const targets = selectedTargets();
    const text = ui.textInput.value;
    if (!targets.length || !text.length || sending) return;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    if (blob.size > MAX_BYTES) { showNotice('Text exceeds the 10 MiB limit.', true); return; }
    sending = true;
    renderPeers();
    try {
      const targetId = ui.recipient.value === 'ALL' ? 'ALL' : targets[0].id;
      const packet = { type: 'text-share', targetId, text };
      if (new Blob([JSON.stringify(packet)]).size <= MAX_INLINE_BYTES) {
        sendPacket(packet);
        const label = targetId === 'ALL' ? 'all devices' : targets[0].name;
        createHistoryItem('Text to ' + label, 'Sent · no receipt confirmation');
        showNotice('Text sent to ' + label + '.');
      } else {
        const count = await sendBlobs([{ blob, name: 'shared-text.txt' }], targets);
        showNotice('Sent to ' + count + ' of ' + targets.length + ' devices as a text file.', count !== targets.length);
      }
    } catch (error) {
      showNotice('Could not send text: ' + (error instanceof Error ? error.message : 'connection lost'), true);
    } finally {
      sending = false;
      renderPeers();
    }
  });
  ui.sendFiles.addEventListener('click', async () => {
    const targets = selectedTargets();
    const files = Array.from(ui.fileInput.files || []);
    if (!targets.length || !files.length || sending) return;
    const tooLarge = files.find((file) => file.size > MAX_BYTES);
    if (tooLarge) { showNotice(tooLarge.name + ' exceeds the 10 MiB limit.', true); return; }
    sending = true;
    renderPeers();
    try {
      const count = await sendBlobs(files.map((file) => ({ blob: file, name: file.name })), targets);
      const total = files.length * targets.length;
      showNotice('Sent ' + count + ' of ' + total + ' file transfers.', count !== total);
      if (count === total) ui.fileInput.value = '';
    } finally {
      sending = false;
      renderPeers();
    }
  });
  ui.clearHistory.addEventListener('click', () => {
    for (const item of Array.from(ui.history.querySelectorAll('.history-item'))) {
      if (item.dataset.active !== 'true') item.remove();
    }
    showEmptyHistory();
  });

  renderPeers();
  connect();
})();
