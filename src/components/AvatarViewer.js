/**
 * components/AvatarViewer.js
 * MMDモデルの表示・操作を担うコアコンポーネント
 *
 * 流用元: D:\AI3DViewMMD\script.js
 *   - setupScene() → Three.js シーン・カメラ・レンダラー・ライト初期化
 *   - animate()    → requestAnimationFrame ループ
 *   - onWindowResize() → リサイズ処理
 * 変更点:
 *   - 全画面ではなくカード内の canvas 要素に描画
 *   - 顔トラッキング削除、ドラッグによるモデル回転に置き換え
 *   - ResizeObserver でコンテナサイズ変化に追従
 */

import * as THREE from 'three';
import { MMDLoader } from 'three/addons/loaders/MMDLoader.js';
import { initPhysics, createHelper, loadModel, loadMotion } from '../core/mmd.js';
import { initInteraction } from '../core/interaction.js';
import { decodeMesh } from '../core/decoder.js';

// ============================================================
// カメラ設定（流用元: script.js CONFIG）
// ============================================================
const CAMERA = {
  FOV: 20,
  NEAR: 0.1,
  FAR: 1000,
  POSITION: { x: 0, y: 12, z: 80 },
  LOOKAT:   { x: 0, y: 12, z: 0  },
};

// モデル回転の可動範囲（度）
const ROTATION_LIMIT_Y = 60;
const ROTATION_LIMIT_X = 30;

// ============================================================
// AvatarViewer の状態
// ============================================================
let canvas = null;
let scene, camera, renderer;
let helper = null;
let loader = null;
let mesh = null;
let clock = null;
let animFrameId = null;
let cleanupInteraction = null;

// ドラッグによるモデル回転量（度）
let rotationY = 0;
let rotationX = 0;

// 物理演算フラグ
let usePhysics = false;

// アップロード済み VMD の ArrayBuffer（エンコード時に参照）
let vmdBuffer = null;

// アップロード済み PMX の ArrayBuffer（エンコード時に参照）
let pmxBuffer = null;

// ============================================================
// 公開 API
// ============================================================

/**
 * AvatarViewer を初期化する
 * @param {HTMLCanvasElement} canvasEl
 */
export async function init(canvasEl) {
  canvas = canvasEl;

  // Three.js 初期化（流用元: script.js setupThreeJS / setupScene）
  setupScene();
  setupLights();
  setupRenderer();
  setupCamera();

  // Ammo.js 物理初期化
  usePhysics = await initPhysics();

  // アニメーションループ開始
  clock = new THREE.Clock();
  animate();

  // コンテナサイズ変化への追従
  // window resize でレスポンシブ対応、ResizeObserver でパネル開閉なども検知
  const resizeObserver = new ResizeObserver(() => onResize());
  resizeObserver.observe(canvas.parentElement);
  window.addEventListener('resize', onResize);

  // ドラッグ操作の登録（流用元: script.js のドラッグ処理）
  cleanupInteraction = initInteraction(canvas, (dx, dy) => {
    rotationY += dx;
    rotationX += dy;
    // 可動範囲クランプ
    rotationY = THREE.MathUtils.clamp(rotationY, -ROTATION_LIMIT_Y, ROTATION_LIMIT_Y);
    rotationX = THREE.MathUtils.clamp(rotationX, -ROTATION_LIMIT_X, ROTATION_LIMIT_X);
  });
}

/**
 * PMX モデルをロードする
 * @param {string}   modelUrl       - PMX ファイルの ObjectURL
 * @param {Map}      textureUrlMap  - filename.toLowerCase() → ObjectURL
 * @param {Function} [onProgress]   - (percent) => void
 */
export async function loadModelFile(modelUrl, textureUrlMap, onProgress) {
  // 既存モデルの破棄
  if (mesh) {
    scene.remove(mesh);
    if (helper) helper.remove(mesh);
    mesh = null;
  }

  mesh = await loadModel({ modelUrl, textureUrlMap, onProgress });
  mesh.castShadow = true;
  scene.add(mesh);

  // 新モデル読み込み時に前回のVMD/PMXバッファを破棄
  vmdBuffer = null;
  pmxBuffer = null;

  // MMDAnimationHelper を生成・モデル登録
  helper = createHelper();
  helper.add(mesh, { physics: usePhysics });
}

/**
 * VMD モーションをロードする
 * @param {string} motionUrl - ObjectURL
 */
export async function loadMotionFile(motionUrl) {
  if (!mesh || !helper) {
    console.warn('[AvatarViewer] loadMotionFile: model not loaded yet');
    return;
  }
  await loadMotion({ helper, mesh, motionUrl, usePhysics });
}

/**
 * 初期ポーズをセット
 * @param {{ rotationX?: number, rotationY?: number, zoom?: number }} pose
 */
export function setPose(pose) {
  if (pose.rotationY !== undefined) rotationY = pose.rotationY;
  if (pose.rotationX !== undefined) rotationX = pose.rotationX;
  if (pose.zoom !== undefined) {
    camera.position.z = CAMERA.POSITION.z / pose.zoom;
  }
}

/**
 * 現在のポーズを取得（保存用）
 * @returns {{ rotationX: number, rotationY: number, zoom: number }}
 */
export function getPose() {
  return {
    rotationX,
    rotationY,
    zoom: CAMERA.POSITION.z / camera.position.z,
  };
}

/**
 * 物理演算の ON / OFF を切り替える
 * @param {boolean} enabled
 */
export function setPhysics(enabled) {
  if (helper) helper.enable('physics', enabled);
}

/**
 * 物理演算が現在 ON かどうかを返す
 * @returns {boolean}
 */
export function getPhysics() {
  return usePhysics;
}

/**
 * VMB1 バイナリを復号・デコードしてシーンに表示する
 * card/index.html の閲覧フローで使用。ローカルファイル読み込みとは独立。
 *
 * @param {ArrayBuffer} vmbBuffer  - decrypt() の返り値（VMB1 形式）
 * @param {Function}    [onProgress] - (percent: 0-100) => void
 */
export async function loadFromVMB(vmbBuffer, onProgress) {
  // 既存メッシュを破棄（ローカルロード中のものも含む）
  if (mesh) {
    scene.remove(mesh);
    if (helper) { helper.remove(mesh); helper = null; }
    mesh = null;
  }

  const { mesh: decodedMesh, vmdBuffer: decodedVmd, pmxBuffer: decodedPmx } = await decodeMesh(vmbBuffer, onProgress);
  mesh = decodedMesh;
  scene.add(mesh);

  if (decodedVmd) {
    // decoder.js で userData.MMD を設定済みのため、PMX再読み込みは不要。
    // physics:false で登録してから loadAnimation コールバックで animation を追加する。
    console.log(`[Motion] VMDデータ検出: ${decodedVmd.byteLength} bytes`);

    helper = createHelper();
    helper.add(mesh, { physics: false });

    const vmdUrl = URL.createObjectURL(new Blob([decodedVmd]));
    new MMDLoader().loadAnimation(
      vmdUrl,
      mesh,
      (vmd) => {
        helper.add(mesh, { animation: vmd });
        console.log('[Motion] モーション適用完了');
        URL.revokeObjectURL(vmdUrl);
      },
      null,
      (err) => {
        console.error('[Motion] VMD読み込み失敗:', err);
        URL.revokeObjectURL(vmdUrl);
      },
    );
  }
  // decodedVmd=null の場合は helper=null のまま → 静止表示
}

/**
 * 現在ロード済みのメッシュを返す（開発・エンコード用）
 * @returns {THREE.SkinnedMesh|null}
 */
export function getMesh() {
  return mesh;
}

/**
 * アップロードされた VMD の ArrayBuffer を保存する
 * @param {ArrayBuffer} buf
 */
export function setVmdBuffer(buf) {
  vmdBuffer = buf;
}

/**
 * 保存済み VMD バッファを返す（エンコード用）
 * @returns {ArrayBuffer|null}
 */
export function getVmdBuffer() {
  return vmdBuffer;
}

/**
 * アップロードされた PMX の ArrayBuffer を保存する
 * @param {ArrayBuffer} buf
 */
export function setPmxBuffer(buf) {
  pmxBuffer = buf;
}

/**
 * 保存済み PMX バッファを返す（エンコード用）
 * @returns {ArrayBuffer|null}
 */
export function getPmxBuffer() {
  return pmxBuffer;
}

/**
 * canvas が別コンテナへ移動した後に呼ぶ（ResizeObserver 更新 + 即時リサイズ）
 * CardLayout のモード切り替えから呼ばれる
 */
export function onContainerChanged() {
  onResize();
}

/**
 * AvatarViewer を破棄する
 */
export function dispose() {
  if (animFrameId) cancelAnimationFrame(animFrameId);
  if (cleanupInteraction) cleanupInteraction();
  if (renderer) renderer.dispose();
}

// ============================================================
// 内部: Three.js セットアップ（流用元: script.js setupScene / setupThreeJS）
// ============================================================

function setupScene() {
  scene = new THREE.Scene();
  scene.background = null; // カード背景色を CSS に委ねるため透明
}

function setupLights() {
  // 流用元: script.js setupScene() のライト設定
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
  hemi.position.set(0, 20, 0);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 1.5);
  dir.position.set(5, 20, 10);
  dir.castShadow = true;
  scene.add(dir);

  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambient);

  const point = new THREE.PointLight(0xffffff, 1.0);
  point.position.set(0, 15, 5);
  scene.add(point);
}

function setupCamera() {
  const { width, height } = getCanvasSize();
  camera = new THREE.PerspectiveCamera(CAMERA.FOV, width / height, CAMERA.NEAR, CAMERA.FAR);
  camera.position.set(CAMERA.POSITION.x, CAMERA.POSITION.y, CAMERA.POSITION.z);
  camera.lookAt(CAMERA.LOOKAT.x, CAMERA.LOOKAT.y, CAMERA.LOOKAT.z);
}

function setupRenderer() {
  const { width, height } = getCanvasSize();
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
}

// ============================================================
// 内部: アニメーションループ（流用元: script.js animate()）
// ============================================================

function animate() {
  animFrameId = requestAnimationFrame(animate);
  const delta = clock.getDelta();

  // モデル回転を反映（ドラッグ操作で更新された値）
  if (mesh) {
    mesh.rotation.y = THREE.MathUtils.degToRad(rotationY);
    mesh.rotation.x = THREE.MathUtils.degToRad(rotationX);
  }

  if (helper) {
    helper.update(delta);
  }

  renderer.render(scene, camera);
}

// ============================================================
// 内部: リサイズ処理（流用元: script.js onWindowResize()）
// ============================================================

function onResize() {
  const { width, height } = getCanvasSize();
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function getCanvasSize() {
  const parent = canvas?.parentElement;
  if (parent) {
    return { width: parent.clientWidth, height: parent.clientHeight };
  }
  return { width: 390, height: 420 }; // フォールバック（カード上部 60% 相当）
}
