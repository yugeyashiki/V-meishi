/**
 * core/decoder.js
 * VMB1 バイナリ → Three.js SkinnedMesh に変換するカスタムローダー
 *
 * encoder.js の逆変換。decrypt() で復号したバイナリを受け取り、
 * Three.js がそのまま描画できる SkinnedMesh を返す。
 *
 * ## 復元できるもの
 *   - 頂点座標 / 法線 / UV
 *   - スキンウェイト / スキンインデックス
 *   - 骨の親子階層・逆バインド行列
 *   - マテリアル（カラー・透過・アルファテスト・テクスチャ）
 *
 * ## 復元されないもの（不可逆変換のため）
 *   - 骨名・モーフターゲット・物理剛体・IKチェーン
 *   - 物理演算は利用不可（MMDAnimationHelper なし）
 */

import * as THREE from 'three';
import { validateVMB } from './encoder.js';
// MMDToonMaterial は ShaderMaterial のサブクラスで独自シェーダーを持つため
// three/addons からは export されない。静的表示には MeshToonMaterial で代用する。

// ============================================================
// 公開 API
// ============================================================

/**
 * VMB1 バイナリを Three.js SkinnedMesh に変換する
 *
 * @param {ArrayBuffer} buffer     - decrypt() の返り値（VMB1 形式）
 * @param {Function}    [onProgress] - (percent: 0-100) => void
 * @returns {Promise<THREE.SkinnedMesh>}
 * @throws {Error} フォーマット不正 / 復元失敗時
 */
export async function decodeMesh(buffer, onProgress) {
  const report = onProgress ?? (() => {});

  // ── フォーマット検証 ──
  const validation = validateVMB(buffer);
  if (!validation.valid) {
    throw new Error(`[Decoder] VMB1 検証失敗: ${validation.error}`);
  }

  report(5);

  const r = new BinaryReader(buffer);

  // ── HEADER ──
  r.skip(4);                                 // magic (検証済み)
  r.readUint8();                             // version
  r.readUint8();                             // flags
  const vertexCount = r.readUint32();
  const indexCount  = r.readUint32();
  const groupCount  = r.readUint16();
  const matCount    = r.readUint16();
  const boneCount   = r.readUint16();
  const hasSkin     = r.readUint8() === 1;
  const hasNormals  = r.readUint8() === 1;
  const hasUVs      = r.readUint8() === 1;
  r.readUint8();                             // pad

  console.log(
    `[Decoder] 頂点=${vertexCount} インデックス=${indexCount} ` +
    `グループ=${groupCount} マテリアル=${matCount} 骨=${boneCount}`,
  );

  report(10);

  // ── 頂点データ ──
  const positions = r.readFloat32Array(vertexCount * 3);
  report(20);

  const normals   = hasNormals ? r.readFloat32Array(vertexCount * 3) : null;
  const uvs       = hasUVs     ? r.readFloat32Array(vertexCount * 2) : null;

  let skinWeights = null;
  let skinIndices = null;
  if (hasSkin) {
    skinWeights = r.readFloat32Array(vertexCount * 4);
    skinIndices = r.readFloat32Array(vertexCount * 4);
  }
  report(35);

  // ── インデックス ──
  const indices = r.readUint32Array(indexCount);
  report(40);

  // ── グループ ──
  const groups = [];
  for (let i = 0; i < groupCount; i++) {
    const start        = r.readUint32();
    const count        = r.readUint32();
    const materialIndex = r.readUint16();
    r.readUint16();                          // pad
    groups.push({ start, count, materialIndex });
  }
  report(45);

  // ── 骨データ ──
  const boneData = [];
  for (let i = 0; i < boneCount; i++) {
    const parentIndex = r.readInt16();
    const px = r.readFloat32();
    const py = r.readFloat32();
    const pz = r.readFloat32();
    const invElements = r.readFloat32Array(16);
    boneData.push({ parentIndex, pos: [px, py, pz], invElements });
  }
  report(50);

  // ── マテリアル定義（固定 24 bytes/entry。テクスチャデータは後続セクション）──
  const matDefs = [];
  for (let i = 0; i < matCount; i++) {
    const cr           = r.readFloat32();
    const cg           = r.readFloat32();
    const cb           = r.readFloat32();
    const opacity      = r.readFloat32();
    const transparent  = r.readUint8() === 1;
    const alphaTest    = r.readFloat32();
    const textureIndex = r.readInt16();      // -1 = テクスチャなし
    const side         = r.readUint8();      // 0=Front / 1=Back / 2=Double
    matDefs.push({ color: [cr, cg, cb], opacity, transparent, alphaTest, textureIndex, side, texMeta: null });
  }
  report(55);

  // ── テクスチャセクション ──
  const texCount    = r.readUint16();
  const texDataList = [];
  for (let i = 0; i < texCount; i++) {
    const texType   = r.readUint8();
    const texWidth  = r.readUint16();
    const texHeight = r.readUint16();
    const texSize   = r.readUint32();
    const texBytes  = r.readBytes(texSize);
    texDataList.push({ type: texType, width: texWidth, height: texHeight, bytes: texBytes });
  }

  // textureIndex で matDefs に texMeta を紐付け
  for (const def of matDefs) {
    if (def.textureIndex >= 0 && def.textureIndex < texDataList.length) {
      def.texMeta = texDataList[def.textureIndex];
    }
  }

  console.log(`[Decoder] マテリアル=${matCount} テクスチャ=${texCount}`);

  // ============================================================
  // Three.js オブジェクトの構築
  // ============================================================

  // ── BufferGeometry ──
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  if (normals)     geo.setAttribute('normal',      new THREE.BufferAttribute(normals,     3));
  if (uvs)         geo.setAttribute('uv',          new THREE.BufferAttribute(uvs,         2));
  if (skinWeights) geo.setAttribute('skinWeight',  new THREE.BufferAttribute(skinWeights, 4));
  if (skinIndices) geo.setAttribute('skinIndex',   new THREE.BufferAttribute(skinIndices, 4));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  for (const g of groups) {
    geo.addGroup(g.start, g.count, g.materialIndex);
  }
  report(65);

  // ── 骨 / スケルトン ──
  const bones       = [];
  const boneInvs    = [];

  for (const bd of boneData) {
    const bone = new THREE.Bone();
    bone.position.set(...bd.pos);
    bones.push(bone);

    const inv = new THREE.Matrix4();
    inv.fromArray(Array.from(bd.invElements));
    boneInvs.push(inv);
  }

  // 親子関係を構築
  for (let i = 0; i < boneCount; i++) {
    const { parentIndex } = boneData[i];
    if (parentIndex >= 0 && parentIndex < boneCount) {
      bones[parentIndex].add(bones[i]);
    }
  }

  const skeleton = new THREE.Skeleton(bones, boneInvs);
  report(70);

  // ── マテリアル（テクスチャを非同期でロード） ──
  const texStep = matCount > 0 ? 20 / matCount : 0;
  const materials = await Promise.all(
    matDefs.map(async (def, idx) => {
      const mat = await buildMaterial(def);
      report(70 + Math.round((idx + 1) * texStep));
      return mat;
    }),
  );
  report(90);

  // ── SkinnedMesh ──
  const decodedMesh = new THREE.SkinnedMesh(geo, materials);
  decodedMesh.castShadow = true;

  // ルート骨をメッシュに追加してから bind
  for (let i = 0; i < boneCount; i++) {
    if (boneData[i].parentIndex < 0) {
      decodedMesh.add(bones[i]);
    }
  }

  decodedMesh.bind(skeleton);

  report(100);
  console.log('[Decoder] デコード完了');
  return decodedMesh;
}

// ============================================================
// マテリアル構築（内部）
// ============================================================

/**
 * マテリアル定義から MeshToonMaterial を生成する
 *
 * @param {{ color, opacity, transparent, alphaTest, side, texMeta }} def
 * @returns {Promise<THREE.MeshToonMaterial>}
 */
async function buildMaterial(def) {
  const mat = new THREE.MeshToonMaterial({
    color:       new THREE.Color(def.color[0], def.color[1], def.color[2]),
    opacity:     def.opacity,
    transparent: def.transparent,
    alphaTest:   def.alphaTest,
    // transparent=true のとき depthWrite を切る（alphaTest のみのマテリアルは書き込む）
    depthWrite:  !def.transparent,
    side:        def.side ?? THREE.FrontSide,  // DoubleSide を正しく復元
  });

  if (def.texMeta) {
    try {
      const texture = await loadTextureFromBytes(def.texMeta);
      mat.map = texture;
      // PNG テクスチャで透過設定が未指定の場合は transparent=true に昇格する（安全対策）。
      // encoder 側で hasAlpha 検出して transparent=true を書き込むが、
      // 旧データや edge case のフォールバックとして残す。
      // alphaTest=0.5 (オペークパス) ではなく transparent=true (透明パス) を使うことで
      // フェイスメッシュによる depth test 失敗を回避する。
      if (def.texMeta.type === 1 /* PNG */ && !def.transparent && def.alphaTest === 0) {
        mat.transparent = true;
        mat.depthWrite  = false;
      }
      mat.needsUpdate = true;
    } catch (e) {
      console.warn('[Decoder] テクスチャロード失敗:', e);
    }
  }

  return mat;
}

/**
 * 埋め込み JPEG / PNG バイトから THREE.Texture を生成する
 *
 * @param {{ type:number, width:number, height:number, bytes:ArrayBuffer }} meta
 * @returns {Promise<THREE.Texture>}
 */
function loadTextureFromBytes(meta) {
  return new Promise((resolve, reject) => {
    const mimeType = meta.type === 0 ? 'image/jpeg' : 'image/png';
    const blob     = new Blob([meta.bytes], { type: mimeType });
    const url      = URL.createObjectURL(blob);

    new THREE.TextureLoader().load(
      url,
      (texture) => {
        URL.revokeObjectURL(url);
        texture.colorSpace = THREE.SRGBColorSpace;
        // MMDLoader と同じテクスチャ設定を適用する
        texture.flipY  = false;               // PMX UV は画像座標系（V=0 が上）なので反転しない
        texture.wrapS  = THREE.RepeatWrapping; // UV が [0,1] 外に出るタイリングに対応
        texture.wrapT  = THREE.RepeatWrapping;
        texture.needsUpdate = true;
        resolve(texture);
      },
      undefined,
      (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      },
    );
  });
}

// ============================================================
// BinaryReader（内部ユーティリティ）
// ============================================================

class BinaryReader {
  constructor(buffer) {
    this._view   = new DataView(buffer);
    this._buffer = buffer;
    this._offset = 0;
  }

  skip(n)       { this._offset += n; }

  readUint8()   { return this._view.getUint8(this._offset++); }

  readUint16() {
    const v = this._view.getUint16(this._offset, true);
    this._offset += 2;
    return v;
  }

  readUint32() {
    const v = this._view.getUint32(this._offset, true);
    this._offset += 4;
    return v;
  }

  readInt16() {
    const v = this._view.getInt16(this._offset, true);
    this._offset += 2;
    return v;
  }

  readFloat32() {
    const v = this._view.getFloat32(this._offset, true);
    this._offset += 4;
    return v;
  }

  /**
   * Float32Array を一括読み取りする
   * 4-byte アライン済みの場合は typed array view でコピー（高速）
   */
  readFloat32Array(count) {
    const bytes = count * 4;
    const out   = new Float32Array(count);
    if (this._offset % 4 === 0) {
      out.set(new Float32Array(this._buffer, this._offset, count));
    } else {
      for (let i = 0; i < count; i++) {
        out[i] = this._view.getFloat32(this._offset + i * 4, true);
      }
    }
    this._offset += bytes;
    return out;
  }

  /**
   * Uint32Array を一括読み取りする
   */
  readUint32Array(count) {
    const bytes = count * 4;
    const out   = new Uint32Array(count);
    if (this._offset % 4 === 0) {
      out.set(new Uint32Array(this._buffer, this._offset, count));
    } else {
      for (let i = 0; i < count; i++) {
        out[i] = this._view.getUint32(this._offset + i * 4, true);
      }
    }
    this._offset += bytes;
    return out;
  }

  /**
   * 指定バイト数を ArrayBuffer としてコピーして返す
   */
  readBytes(count) {
    const out = this._buffer.slice(this._offset, this._offset + count);
    this._offset += count;
    return out;
  }
}
