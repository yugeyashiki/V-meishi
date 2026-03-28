/**
 * utils/qrcode.js
 * qrcode パッケージのラッパー
 * QRコードの生成・canvas への描画・PNG DataURL 出力を提供する
 */

import QRCode from 'qrcode';

/**
 * canvas 要素に QR コードを描画する
 * @param {HTMLCanvasElement} canvas
 * @param {string} text - QR に埋め込むテキスト
 * @param {object} [opts]
 * @param {number} [opts.size=200]       - canvas の一辺のサイズ（px）
 * @param {string} [opts.dark='#000000'] - モジュール色
 * @param {string} [opts.light='#ffffff'] - 背景色
 * @returns {Promise<void>}
 */
export async function renderToCanvas(canvas, text, opts = {}) {
  const { size = 200, dark = '#000000', light = '#ffffff' } = opts;
  await QRCode.toCanvas(canvas, text, {
    width: size,
    margin: 2,
    color: { dark, light },
    errorCorrectionLevel: 'M',
  });
}

/**
 * QR コードの PNG DataURL を返す
 * @param {string} text
 * @param {object} [opts]
 * @param {number} [opts.size=400]
 * @param {string} [opts.dark='#000000']
 * @param {string} [opts.light='#ffffff']
 * @returns {Promise<string>} DataURL
 */
export async function toDataURL(text, opts = {}) {
  const { size = 400, dark = '#000000', light = '#ffffff' } = opts;
  return QRCode.toDataURL(text, {
    width: size,
    margin: 2,
    color: { dark, light },
    errorCorrectionLevel: 'M',
    type: 'image/png',
  });
}
