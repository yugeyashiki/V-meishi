/**
 * core/interaction.js
 * マウスドラッグ / タッチスワイプ によるモデル回転
 *
 * 流用元: D:\AI3DViewMMD\script.js
 *   - mousedown / mousemove / mouseup イベント処理（DRAG_SENSITIVITY 含む）
 * 追加:
 *   - touchstart / touchmove / touchend によるスマホタッチ対応
 */

const DRAG_SENSITIVITY = 0.4; // deg / px

/**
 * キャンバス要素にドラッグ・スワイプ操作を登録する
 *
 * @param {HTMLCanvasElement} canvas
 * @param {(deltaX: number, deltaY: number) => void} onDrag
 *   deltaX: 水平方向の移動量（度換算）、deltaY: 垂直方向
 * @returns {() => void} クリーンアップ関数
 */
export function initInteraction(canvas, onDrag) {
  let isDragging = false;
  let lastX = 0;
  let lastY = 0;

  // ============================================================
  // マウス操作（流用元: script.js setupThreeJS() のドラッグ処理）
  // ============================================================
  function onMouseDown(e) {
    if (e.button !== 0) return;
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.style.cursor = 'grabbing';
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    const dx = (e.clientX - lastX) * DRAG_SENSITIVITY;
    const dy = (e.clientY - lastY) * DRAG_SENSITIVITY;
    lastX = e.clientX;
    lastY = e.clientY;
    onDrag(dx, dy);
  }

  function onMouseUp(e) {
    if (e.button !== 0) return;
    isDragging = false;
    canvas.style.cursor = 'grab';
  }

  // ============================================================
  // タッチ操作（スマホ向け追加実装）
  // ============================================================
  function onTouchStart(e) {
    if (e.touches.length !== 1) return;
    isDragging = true;
    lastX = e.touches[0].clientX;
    lastY = e.touches[0].clientY;
  }

  function onTouchMove(e) {
    if (!isDragging || e.touches.length !== 1) return;
    e.preventDefault(); // スクロール防止
    const dx = (e.touches[0].clientX - lastX) * DRAG_SENSITIVITY;
    const dy = (e.touches[0].clientY - lastY) * DRAG_SENSITIVITY;
    lastX = e.touches[0].clientX;
    lastY = e.touches[0].clientY;
    onDrag(dx, dy);
  }

  function onTouchEnd() {
    isDragging = false;
  }

  // イベント登録
  canvas.style.cursor = 'grab';
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  // passive: false にすることで iOS Safari でも preventDefault が確実に効く
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd);

  // クリーンアップ
  return () => {
    canvas.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    canvas.removeEventListener('touchstart', onTouchStart);
    canvas.removeEventListener('touchmove', onTouchMove);
    canvas.removeEventListener('touchend', onTouchEnd);
  };
}
