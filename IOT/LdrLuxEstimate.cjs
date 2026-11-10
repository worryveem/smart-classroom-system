// Mo hinh thu nghiem, CHUA hieu chuan voi mach thuc te.
module.exports = function estimateLdrLux(adc, options = {}) {
  const config = { fixedOhms: 10000, resistanceAt10Lux: 15000, gamma: 0.7,
    adcHighIsBright: false, adcMax: 4095, ...options };
  if (!Number.isInteger(adc) || adc < 0 || adc > config.adcMax) {
    return { lux: null, quality: 'INVALID_ADC' };
  }
  if (![config.fixedOhms, config.resistanceAt10Lux, config.gamma, config.adcMax]
      .every(v => typeof v === 'number' && Number.isFinite(v) && v > 0)
      || typeof config.adcHighIsBright !== 'boolean') return { lux: null, quality: 'INVALID_CONFIG' };
  // Khong gan 0 lux hay mot so huu han cho dau vao cham tran/day ADC.
  if (adc === 0 || adc === config.adcMax) return { lux: null, quality: 'ADC_SATURATED' };
  const ratio = adc / config.adcMax;
  const resistance = config.adcHighIsBright
    ? config.fixedOhms * (1 - ratio) / ratio
    : config.fixedOhms * ratio / (1 - ratio);
  const lux = 10 * Math.pow(config.resistanceAt10Lux / resistance, 1 / config.gamma);
  if (!Number.isFinite(lux) || lux > 100000) return { lux: null, quality: 'MODEL_OUT_OF_RANGE' };
  return { lux: Number(lux.toFixed(2)), quality: 'MODEL_ESTIMATE' };
};
