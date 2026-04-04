/**
 * core/mmd.js
 * MMDLoader / MMDAnimationHelper の初期化・ロードユーティリティ
 *
 * 流用元: D:\AI3DViewMMD\script.js
 *   - initPhysics()         → Ammo.js 初期化処理
 *   - loadMMDAsync()        → MMDLoader.loadWithAnimation() の Promise ラッパー
 *   - MMDAnimationHelper    → helper = new MMDAnimationHelper(...) の設定値
 */

import * as THREE from 'three';
import { MMDLoader } from 'three/addons/loaders/MMDLoader.js';
import { MMDAnimationHelper } from 'three/addons/animation/MMDAnimationHelper.js';

// ============================================================
// Physics (Ammo.js)
// 流用元: script.js initPhysics()
// ============================================================

/**
 * Ammo.js の WASM 初期化を待つ
 * index.html の CDN script タグで Ammo グローバルがロードされている前提
 * @returns {Promise<boolean>} 初期化成功なら true
 */
export async function initPhysics() {
  if (typeof Ammo === 'undefined') {
    console.warn('[Physics] ammo.js not found. Physics disabled.');
    return false;
  }
  try {
    await Ammo();
    console.log('[Physics] Ammo.js ready.');
    return true;
  } catch (e) {
    console.warn('[Physics] Failed to init Ammo.js:', e);
    return false;
  }
}

// ============================================================
// MMDAnimationHelper の生成
// 流用元: script.js setupScene() 内の helper 初期化
// ============================================================

/**
 * MMDAnimationHelper を生成して返す
 * @returns {MMDAnimationHelper}
 */
export function createHelper() {
  return new MMDAnimationHelper({
    sync: true,
    afterglow: 2.0,
    resetPhysicsOnLoop: true,
  });
}

// ============================================================
// PMX モデルのロード
// 流用元: script.js loadMMDAsync()
// ============================================================

/**
 * PMX モデルをロードする
 * ローカルファイルを File API で受け取り ObjectURL 経由でロード
 *
 * @param {Object} params
 * @param {string}   params.modelUrl       - PMX ファイルの URL（ObjectURL）
 * @param {Map}      params.textureUrlMap  - filename.toLowerCase() → ObjectURL のマップ
 * @param {Function} params.onProgress     - (percent: number) => void
 * @returns {Promise<THREE.SkinnedMesh>}
 */
export function loadModel({ modelUrl, textureUrlMap, onProgress }) {
  return new Promise((resolve, reject) => {
    const manager = new THREE.LoadingManager();
    manager.onError = (url) => console.error('[MMDLoader] Failed:', url);

    // URLModifier: テクスチャ名を ObjectURL にリダイレクト
    // blob: / data: URL はそのまま通す（PMX 本体の ObjectURL が改変されないよう保護）
    manager.setURLModifier((url) => {
      if (url.startsWith('blob:') || url.startsWith('data:')) return url;
      if (textureUrlMap && textureUrlMap.size > 0) {
        // パス区切り・URLエンコード・クエリ文字列を取り除いてファイル名だけを取り出す
        const basename = decodeURIComponent(url.split(/[/\\]/).pop().split('?')[0]);
        const objectUrl = textureUrlMap.get(basename.toLowerCase());
        if (objectUrl) return objectUrl;
      }
      return url;
    });

    const loader = new MMDLoader(manager);

    // loader.load() は URL の拡張子で PMX/PMD を判定するため、
    // 拡張子を持たない blob URL では動作しない。loadPMX() を直接使う。
    loader.loadPMX(
      modelUrl,
      (pmxData) => {
        // resourcePath = '' → テクスチャパスはそのまま URLModifier に任せる
        const mesh = loader.meshBuilder.build(pmxData, '', onProgress, (err) => {
          console.warn('[MMDLoader] Mesh build warning:', err);
        });

        // 透過マテリアルの修正（流用元: script.js loadMMDAsync 内の FIX ブロック）
        mesh.traverse((obj) => {
          if (!obj.isMesh) return;
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          let hasTransparent = false;
          materials.forEach((mat) => {
            const n = (mat.name || '').toLowerCase();
            if (
              n.includes('tranceparent') || n.includes('transparent') ||
              n.includes('highlight') || n.includes('ハイライト')
            ) {
              mat.transparent = true;
              mat.alphaTest = 0.5;
              mat.depthWrite = false;
              mat.reflectivity = 0;
              mat.needsUpdate = true;
              hasTransparent = true;
            }
          });
          if (hasTransparent) obj.renderOrder = 999;
        });

        resolve(mesh);
      },
      (xhr) => {
        if (xhr.lengthComputable && onProgress) {
          onProgress(Math.round((xhr.loaded / xhr.total) * 100));
        }
      },
      (err) => reject(new Error(`PMX load failed: ${err?.message ?? err}`))
    );
  });
}

// ============================================================
// VMD モーションのロード
// 流用元: script.js loadMMDAsync() の motionUrls 処理
// ============================================================

/**
 * VMD モーションをロードして helper に追加する
 *
 * @param {Object} params
 * @param {MMDAnimationHelper}    params.helper
 * @param {THREE.SkinnedMesh}     params.mesh
 * @param {string}                params.motionUrl - VMD ファイルの ObjectURL
 * @param {boolean}               params.usePhysics
 * @returns {Promise<void>}
 */
export function loadMotion({ helper, mesh, motionUrl, usePhysics }) {
  return new Promise((resolve, reject) => {
    const loader = new MMDLoader();
    loader.loadAnimation(
      motionUrl,
      mesh,
      (animation) => {
        // loadModelFile で physics のみで登録済みのため、一度削除してから animation 付きで再登録
        helper.remove(mesh);
        helper.add(mesh, { animation, physics: usePhysics });
        console.log('[Motion] モーション適用完了');
        console.log('[Motion] 再生開始');
        resolve();
      },
      null,
      (err) => reject(new Error(`VMD load failed: ${err?.message ?? err}`))
    );
  });
}
