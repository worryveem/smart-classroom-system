// Nguon Function node; luat tu dong va phan quyen van nam o backend.
module.exports = function bridge(msg, node, context, clock = Date, timers = { setTimeout, clearTimeout }) {
  let state = context.get('smartclassControl');
  if (!state) {
    state = { relay: null, receivedAt: 0, connected: false, pending: null };
    context.set('smartclassControl', state);
  }
  const now = clock.now();
  const fresh = () => Boolean(state.connected && state.relay && now >= state.receivedAt && now - state.receivedAt < 10000);
  const response = (request, code, payload) => Object.assign(request, {
    statusCode: code,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    payload,
  });
  function finish(status, message) {
    const pending = state.pending;
    if (!pending) return;
    state.pending = null;
    timers.clearTimeout(pending.timer);
    const payload = { status, device_id: 'node2_actuator', target: pending.target,
      action: pending.action, command_id: pending.id, message };
    node.send([null, response(pending.request, 200, payload)]);
    node.status({ fill: status === 'SUCCESS' ? 'green' : 'yellow', shape: 'dot', text: status });
  }
  if (msg.controlEvent === 'broker-status') {
    state.connected = msg.status?.fill === 'green';
    if (!state.connected) {
      state.relay = null;
      finish('TIMEOUT', 'MQTT disconnected; command outcome is unconfirmed. Do not retry automatically.');
    }
    return null;
  }
  if (msg.controlEvent === 'publish-error') {
    finish('TIMEOUT', 'MQTT publish failed; command outcome is unconfirmed. Do not retry automatically.');
    return null;
  }
  if (msg.topic === 'smarthome/esp32/relay/state' && !msg.req) {
    if (msg.retain === true) return null;
    let relay = msg.payload;
    try { if (typeof relay === 'string') relay = JSON.parse(relay); } catch { return null; }
    if (!relay || typeof relay !== 'object' || Array.isArray(relay)
        || typeof relay.fan_on !== 'boolean' || typeof relay.light_on !== 'boolean') return null;
    state.relay = relay;
    state.receivedAt = now;
    state.connected = true;
    const pending = state.pending, ack = relay.command_ack;
    if (pending && now - pending.sentAt >= 12000) {
      finish('TIMEOUT', 'ESP32 ACK timed out. Do not retry automatically.');
      return null;
    }
    if (pending && relay.command_ack_supported === true && ack?.id === pending.id
        && ack.target === pending.target && ack.action === pending.action) {
      const key = pending.target === 'FAN' ? 'fan' : 'light';
      const expectedMode = pending.action === 'ON' ? 'MANUAL_ON' : 'MANUAL_OFF';
      const manual = ['MANUAL_ON', 'MANUAL_OFF'];
      if (relay[`${key}_on`] === (pending.action === 'ON') && relay[`${key}_mode`] === expectedMode
          && manual.includes(relay.fan_mode) && manual.includes(relay.light_mode)) {
        finish('SUCCESS', 'ESP32 applied the correlated command to its GPIO outputs.');
      }
    }
    return null;
  }
  if (!msg.req) return null;
  // Endpoint noi bo: khong cho thiet bi LAN bo qua phan quyen backend.
  const remote = msg.req.socket?.remoteAddress;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) {
    return [null, response(msg, 403, { status: 'FAILURE', message: 'Only the local backend may access this endpoint.' })];
  }
  if (msg.controlEvent === 'status') {
    return [null, response(msg, 200, { connected: Boolean(fresh()),
      commandAckSupported: fresh() && state.relay.command_ack_supported === true,
      manualSupported: fresh(),
      confirmationMode: fresh() && state.relay.command_ack_supported === true ? 'CORRELATED_ACK' : 'ACCEPTED_ONLY',
      pending: Boolean(state.pending), rulesOwner: 'BACKEND' })];
  }
  const input = msg.payload;
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).length !== 2 || !['FAN', 'LIGHT'].includes(input.target)
      || !['ON', 'OFF'].includes(input.action)) {
    return [null, response(msg, 400, { status: 'FAILURE', message: 'Expected only target FAN/LIGHT and action ON/OFF.' })];
  }
  if (state.pending) return [null, response(msg, 409, { status: 'FAILURE', message: 'A command is still awaiting ACK.' })];
  if (!fresh()) return [null, response(msg, 503, { status: 'FAILURE', message: 'No fresh relay state; no command was sent.' })];
  if (state.relay.command_ack_supported !== true) {
    // Firmware cu: cho phep lenh thu cong, chi xac nhan tiep nhan.
    // Khong suy dien SUCCESS tu trang thai dinh ky khong co ma doi chieu.
    const command = { topic: 'smarthome/esp32/relay/cmd', payload: `${input.target}_${input.action}`,
      qos: '0', retain: false };
    node.status({ fill: 'yellow', shape: 'dot', text: `Accepted: ${command.payload}` });
    return [command, response(msg, 202, { status: 'ACCEPTED', device_id: 'node2_actuator',
      target: input.target, action: input.action, confirmation_mode: 'ACCEPTED_ONLY',
      message: 'Command queued for MQTT. Check live relay state; execution is not confirmed by a correlated ACK.' })];
  }
  // ID tao o Node-RED, khong nhan ID hay danh tinh audit tu nguoi goi.
  const id = now.toString(16).padStart(12, '0').slice(-12)
    + Array.from({ length: 20 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const pending = { id, target: input.target, action: input.action, request: msg, sentAt: now };
  state.pending = pending;
  pending.timer = timers.setTimeout(() => finish('TIMEOUT', 'ESP32 ACK timed out. Do not retry automatically.'), 12000);
  node.status({ fill: 'yellow', shape: 'dot', text: `Waiting ACK: ${input.target} ${input.action}` });
  return [{ topic: 'smarthome/esp32/relay/cmd', payload: `CMD,${id},${input.target}_${input.action}`,
    qos: '0', retain: false }, null];
};
