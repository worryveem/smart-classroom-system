const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const bridge = require('./SmartClass_Backend_Control.cjs');

function fixture() {
  let now = 100000;
  const sent = [], timers = new Map(), cache = new Map();
  const context = {get:k=>cache.get(k),set:(k,v)=>cache.set(k,v)};
  const node = { send: output => sent.push(output), status() {} };
  const clock = { now: () => now };
  const timerAPI = { setTimeout: callback => { const id = timers.size + 1; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id) };
  return { node, sent, timers, context, advance: ms => { now += ms; },
    run: msg => bridge(msg, { ...node }, context, clock, timerAPI) };
}
const request = (payload = { target: 'FAN', action: 'ON' }) => ({
  req: { socket: { remoteAddress: '::ffff:127.0.0.1' } }, res: {}, payload,
});
const relay = extra => ({ topic: 'smarthome/esp32/relay/state',
  payload: { fan_on: false, light_on: false, fan_mode: 'MANUAL_OFF', light_mode: 'MANUAL_OFF',
    command_ack_supported: true, ...extra } });

test('no command is sent with missing/stale state or malformed input', () => {
  const f = fixture();
  assert.equal(f.run(request())[0], null);
  f.run(relay({})); f.advance(10001);
  assert.equal(f.run(request())[1].statusCode, 503);
  f.run(relay({}));
  for (const body of [null, [], { target: 'AUTO', action: 'ON' },
    { target: 'FAN', action: 'ON', username: 'admin' }, { target: 'FAN', action: 'OFF', extra: true }]) {
    assert.equal(f.run(request(body))[1].statusCode, 400);
  }
});

test('legacy firmware receives manual commands with ACCEPTED only, never fake SUCCESS', () => {
  for (const target of ['FAN', 'LIGHT']) for (const action of ['ON', 'OFF']) {
    const f = fixture(); f.run(relay({ command_ack_supported: false }));
    const msg = request({ target, action }), req = msg.req, res = msg.res;
    const [mqtt, http] = f.run(msg);
    assert.equal(mqtt.payload, `${target}_${action}`);
    assert.equal(mqtt.retain, false); assert.equal(mqtt.qos, '0');
    assert.equal(http.statusCode, 202); assert.equal(http.payload.status, 'ACCEPTED');
    assert.equal(http.payload.target, target); assert.equal(http.payload.action, action);
    assert.equal(http.req, req); assert.equal(http.res, res);
    assert.equal(f.context.get('smartclassControl').pending, null);
    assert.equal(f.timers.size, 0);
    f.run(relay({ command_ack_supported: false, fan_on: true, light_on: true }));
    f.run({ controlEvent: 'broker-status', status: { fill: 'red' } });
    f.run({ controlEvent: 'broker-status', status: { fill: 'green' } });
    assert.equal(f.sent.length, 0);
  }
});

test('LAN clients cannot bypass backend access checks', () => {
  const f = fixture(); f.run(relay({}));
  const msg = request(); msg.req.socket.remoteAddress = '10.203.24.82';
  assert.equal(f.run(msg)[1].statusCode, 403);
});

test('only a matching ACK plus output state and manual modes yields SUCCESS', () => {
  const f = fixture(); f.run(relay({}));
  const msg = request(), req = msg.req, res = msg.res;
  const output = f.run(msg), id = f.context.get('smartclassControl').pending.id;
  assert.match(output[0].payload, /^CMD,[a-f0-9]{32},FAN_ON$/);
  assert.equal(output[0].retain, false); assert.equal(output[0].qos, '0');
  assert.equal(output[1], null); assert.equal(f.sent.length, 0);
  assert.equal(f.run(request())[1].statusCode, 409);
  f.run(relay({ fan_on: true, fan_mode: 'MANUAL_ON' }));
  f.run(relay({ command_ack: { id: 'old', target: 'FAN', action: 'ON' } }));
  const ack = { id, target: 'FAN', action: 'ON' };
  f.run(relay({ fan_on: true, fan_mode: 'AUTO', command_ack: ack }));
  f.run(relay({ fan_on: false, fan_mode: 'MANUAL_OFF', command_ack: ack }));
  f.run({ ...relay({ fan_on: true, fan_mode: 'MANUAL_ON', command_ack: ack }), retain: true });
  assert.equal(f.sent.length, 0);
  f.run(relay({ fan_on: true, fan_mode: 'MANUAL_ON', command_ack: ack }));
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0][1].payload.status, 'SUCCESS');
  assert.equal(f.sent[0][1].payload.device_id, 'node2_actuator');
  assert.equal(f.sent[0][1].req, req); assert.equal(f.sent[0][1].res, res);
  assert.equal(f.context.get('smartclassControl').pending, null); assert.equal(f.timers.size, 0);
});

test('timeout, late ACK and disconnect never retry or fabricate success', () => {
  for (const event of ['timeout', 'disconnect', 'publish-error']) {
    const f = fixture(); f.run(relay({})); const out = f.run(request());
    const id = f.context.get('smartclassControl').pending.id;
    if (event === 'timeout') [...f.timers.values()][0]();
    else f.run(event === 'disconnect' ? { controlEvent: 'broker-status', status: { fill: 'red' } }
      : { controlEvent: 'publish-error' });
    assert.equal(f.sent.length, 1); assert.equal(f.sent[0][0], null);
    assert.equal(f.sent[0][1].payload.status, 'TIMEOUT');
    f.run(relay({ fan_on: true, fan_mode: 'MANUAL_ON', command_ack: { id, target: 'FAN', action: 'ON' } }));
    assert.equal(f.sent.length, 1); assert.equal(out[0].retain, false);
  }
});

test('status is read-only and malformed or retained MQTT never refreshes cache', () => {
  const f = fixture();
  for (const msg of [{ topic: 'smarthome/esp32/relay/state', payload: '{' },
    { ...relay({}), retain: true }, relay({ fan_on: 'true' })]) f.run(msg);
  assert.equal(f.context.get('smartclassControl').relay, null);
  const out = f.run({ ...request(), controlEvent: 'status' });
  assert.equal(out[0], null); assert.equal(out[1].payload.commandAckSupported, false);
  assert.equal(out[1].payload.rulesOwner, 'BACKEND');
});

test('exported flow matches source, wires resolve, and deploy cannot send a command', () => {
  const flow = JSON.parse(fs.readFileSync(path.join(__dirname, 'SmartClass_Backend_Control.json'), 'utf8'));
  const engine = flow.find(n => n.id === 'sc_control_engine');
  assert.equal(engine.func, `return (${bridge.toString()})(msg,node,context);`);
  const ids = new Set(flow.map(n => n.id));
  for (const n of flow) for (const w of n.wires || []) for (const id of w) assert(ids.has(id));
  assert(!flow.some(n => n.type === 'inject'));
  assert(!flow.some(n => n.type === 'mysql'));
  const f = fixture(); new Function('context', engine.initialize)(f.context);
  assert.equal(f.sent.length, 0); assert.equal(f.context.get('smartclassControl').pending, null);
});
