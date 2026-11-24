// Thang gia dinh de demo giao dien, KHONG phai phep do hay hieu chuan lux.
module.exports = function demoLux(adc) {
  if (!Number.isInteger(adc) || adc < 0 || adc > 4095) return { lux: null, quality: 'INVALID_ADC' };
  // Moc phong bat den 10/11/2026: trung vi ADC 3916 -> 400 lux gia dinh.
  // Giu chieu ADC giam khi sang hon; noi suy giua cac moc trinh dien.
  const points = [[0, 1500], [2850, 700], [3916, 400], [4095, 100]];
  const index = points.findIndex((point, i) => i > 0 && adc <= point[0]);
  const [a, lowerLux] = points[index - 1];
  const [b, upperLux] = points[index];
  const lux = lowerLux + (adc - a) * (upperLux - lowerLux) / (b - a);
  return { lux: Number(lux.toFixed(2)), quality: adc === 0 || adc === 4095 ? 'DEMO_ADC_LIMIT' : 'DEMO_ASSUMPTION' };
};
