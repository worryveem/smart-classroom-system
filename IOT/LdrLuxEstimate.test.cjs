const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const estimate = require('./LdrLuxEstimate.cjs');
const demo = require('./LdrLuxDemo.cjs');

test('model reference and inverse light direction', () => {
  assert.equal(estimate(2457).lux, 10);
  assert(estimate(1000).lux > estimate(2000).lux);
  assert(estimate(2000).lux > estimate(3000).lux);
  assert(estimate(1000, { adcHighIsBright: true }).lux < estimate(3000, { adcHighIsBright: true }).lux);
});
test('saturated and invalid input never fabricate a lux value', () => {
  for (const value of [0, 4095, -1, 4096, null, NaN, Infinity, '1000', 1.2]) {
    assert.equal(estimate(value).lux, null);
  }
  assert.equal(estimate(2000, { gamma: 0 }).lux, null);
});
test('demo anchors and direction are explicit and invalid input remains unknown', () => {
  assert.equal(demo(4095).lux, 100);
  assert.equal(demo(2850).lux, 700);
  assert.equal(demo(3916).lux, 400);
  assert(demo(2000).lux > demo(3000).lux);
  assert.equal(demo(null).lux, null);
  assert.equal(demo(4095).quality, 'DEMO_ADC_LIMIT');
});
test('flow keeps demo provenance and stores the agreed lux value in telemetry', () => {
  const flow = JSON.parse(fs.readFileSync(path.join(__dirname, 'SmartClass_Backend_Data.json'), 'utf8'));
  const fn = new Function('msg', 'flow', flow.find(n => n.id === 'sc_normalize').func);
  const store = new Map(), context = { get: k => store.get(k), set: (k, v) => store.set(k, v) };
  const sample = { topic: 'smarthome/esp32/sensor/state', payload: {
    dht_ok: true, temperature: 25, humidity: 50, motion: 1, pir_ready: true, ldr_adc: 2850, light_percent: 69,
  } };
  const result = fn(sample, context);
  assert.equal(result[0].payload.lux, 700);
  assert.equal(result[0].payload.lux_estimated, true);
  assert.equal(result[0].payload.lux_demo, true);
  assert.equal(result[0].payload.lux_quality, 'DEMO_ASSUMPTION');
  assert.equal(result[1].payload[3], 700);
  const saturated = fn({ ...sample, payload: { ...sample.payload, ldr_adc: 4095 } }, context);
  assert.equal(saturated[0].payload.lux, 100);
  assert.equal(saturated[0].payload.lux_quality, 'DEMO_ADC_LIMIT');
  assert.equal(saturated[1].payload[3], 100);
});
