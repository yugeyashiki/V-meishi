/**
 * core/encoder.js
 * PMX (Three.js SkinnedMesh) → 独自バイナリフォーマット VMB1 への変換
 *
 * ## フォーマット: VMB1 (V-Meishi Binary v1)
 *
 * Three.js の SkinnedMesh が持つレンダリングデータのみを抽出する。
 * 元 PMX の骨名・モーフ・物理剛体・ジョイント・IKチェーン等は失われる（不可逆変換）。
 *
 * ## バイナリ構造
 *
 * HEADER (24 bytes)
 *   magic[4]      : "VMB1"
 *   version       : uint8   (1)
 *   flags         : uint8   (予約)
 *   vertexCount   : uint32
 *   indexCount    : uint32
 *   groupCount    : uint16
 *   matCount      : uint16
 *   boneCount     : uint16
 *   hasSkin       : uint8
 *   hasNormals    : uint8
 *   hasUVs        : uint8
 *   _pad          : uint8
 *
 * POSITIONS      : vertexCount × 12 bytes (xyz float32)
 * NORMALS        : vertexCount × 12 bytes (xyz float32) [hasNormals=1 のとき]
 * UVS            : vertexCount × 8 bytes  (uv  float32) [hasUVs=1 のとき]
 * SKIN_WEIGHTS   : vertexCount × 16 bytes (xyzw float32) [hasSkin=1 のとき]
 * SKIN_INDICES   : vertexCount × 16 bytes (xyzw float32) [hasSkin=1 のとき]
 *
 * INDICES        : indexCount  × 4 bytes  (uint32)
 *   ※ indexCount の値は直前に uint32 で書き込み済み (header に含む)
 *
 * GROUPS [groupCount]
 *   start         : uint32
 *   count         : uint32
 *   materialIndex : uint16
 *   _pad          : uint16
 *
 * BONES [boneCount]
 *   parentIndex   : int16  (-1 = ルート)
 *   posX/Y/Z      : float32 × 3  (ローカル座標)
 *   boneInverse   : float32 × 16 (逆バインド行列 column-major)
 *
 * MATERIALS [matCount]  ← 固定 24 bytes/entry（テクスチャデータは別セクション）
 *   colorR/G/B    : float32 × 3
 *   opacity       : float32
 *   transparent   : uint8
 *   alphaTest     : float32
 *   textureIndex  : int16   (-1 = テクスチャなし)
 *   side          : uint8   (0=FrontSide / 1=BackSide / 2=DoubleSide)
 *
 * texCount        : uint16
 * TEXTURES [texCount]
 *   texType       : uint8   (0=JPEG / 1=PNG)
 *   texWidth      : uint16
 *   texHeight     : uint16
 *   texDataSize   : uint32
 *   texData       : texDataSize bytes
 */

import * as THREE from 'three';

// ============================================================
// 定数
// ============================================================

/** フォーマット識別子 "VMB1" */
const MAGIC = new Uint8Array([0x56, 0x4D, 0x42, 0x31]);
const FORMAT_VERSION = 1;

const TEX_TYPE_JPEG = 0;
const TEX_TYPE_PNG  = 1;

// ============================================================
// 公開 API
// ============================================================

/**
 * Three.js SkinnedMesh を VMB1 バイナリに変換する
 *
 * @param {THREE.SkinnedMesh} mesh - MMDLoader でロード済みのメッシュ
 * @returns {Promise<ArrayBuffer>}  VMB1 フォーマットのバイナリ
 */
export async function encodeMesh(mesh) {
  const geo       = mesh.geometry;
  const skeleton  = mesh.skeleton;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

  // ── Geometry attributes ──
  const posAttr  = geo.attributes.position;
  const normAttr = geo.attributes.normal;
  const uvAttr   = geo.attributes.uv;
  const wgtAttr  = geo.attributes.skinWeight;
  const idxAttr  = geo.attributes.skinIndex;
  const indexBuf = geo.index;
  const groups   = geo.groups;

  const vertexCount = posAttr.count;
  const indexCount  = indexBuf ? indexBuf.count : 0;
  const groupCount  = groups.length;
  const matCount    = materials.length;
  const bones       = skeleton?.bones   ?? [];
  const boneInvs    = skeleton?.boneInverses ?? [];
  const boneCount   = bones.length;

  const hasNormals = !!normAttr;
  const hasUVs     = !!uvAttr;
  const hasSkin    = !!(wgtAttr && idxAttr && boneCount > 0);

  console.log(`[Encoder] 変換開始: 頂点=${vertexCount} インデックス=${indexCount} ` +
              `グループ=${groupCount} マテリアル=${matCount} 骨=${boneCount}`);

  // ── テクスチャを async で事前エンコード ──
  const textures = await Promise.all(materials.map((m) => encodeTexture(m)));
  console.log(`[Encoder] テクスチャ事前エンコード完了: ${textures.filter(Boolean).length}/${matCount}`);

  // ============================================================
  // バイナリ書き込み
  // ============================================================
  const w = new BinaryWriter();

  // HEADER
  w.writeBytes(MAGIC);                      // magic        4
  w.writeUint8(FORMAT_VERSION);             // version      1
  w.writeUint8(0);                          // flags        1
  w.writeUint32(vertexCount);               // vertexCount  4
  w.writeUint32(indexCount);                // indexCount   4
  w.writeUint16(groupCount);                // groupCount   2
  w.writeUint16(matCount);                  // matCount     2
  w.writeUint16(boneCount);                 // boneCount    2
  w.writeUint8(hasSkin    ? 1 : 0);         // hasSkin      1
  w.writeUint8(hasNormals ? 1 : 0);         // hasNormals   1
  w.writeUint8(hasUVs     ? 1 : 0);         // hasUVs       1
  w.writeUint8(0);                          // pad          1 → 計24 bytes

  // POSITIONS (vertexCount × 12)
  for (let i = 0; i < vertexCount; i++) {
    w.writeFloat32(posAttr.getX(i));
    w.writeFloat32(posAttr.getY(i));
    w.writeFloat32(posAttr.getZ(i));
  }

  // NORMALS (vertexCount × 12)
  if (hasNormals) {
    for (let i = 0; i < vertexCount; i++) {
      w.writeFloat32(normAttr.getX(i));
      w.writeFloat32(normAttr.getY(i));
      w.writeFloat32(normAttr.getZ(i));
    }
  }

  // UVS (vertexCount × 8)
  if (hasUVs) {
    for (let i = 0; i < vertexCount; i++) {
      w.writeFloat32(uvAttr.getX(i));
      w.writeFloat32(uvAttr.getY(i));
    }
  }

  // SKIN_WEIGHTS / SKIN_INDICES (各 vertexCount × 16)
  if (hasSkin) {
    for (let i = 0; i < vertexCount; i++) {
      w.writeFloat32(wgtAttr.getX(i));
      w.writeFloat32(wgtAttr.getY(i));
      w.writeFloat32(wgtAttr.getZ(i));
      w.writeFloat32(wgtAttr.getW(i));
    }
    for (let i = 0; i < vertexCount; i++) {
      w.writeFloat32(idxAttr.getX(i));
      w.writeFloat32(idxAttr.getY(i));
      w.writeFloat32(idxAttr.getZ(i));
      w.writeFloat32(idxAttr.getW(i));
    }
  }

  // INDICES
  for (let i = 0; i < indexCount; i++) {
    w.writeUint32(indexBuf.getX(i));
  }

  // GROUPS
  for (const g of groups) {
    w.writeUint32(g.start);
    w.writeUint32(g.count);
    w.writeUint16(g.materialIndex);
    w.writeUint16(0); // pad
  }

  // BONES
  for (let i = 0; i < boneCount; i++) {
    const bone = bones[i];
    // 親骨インデックス: bone.parent が別の骨なら配列内インデックス、それ以外は -1
    const parentIdx = bone.parent instanceof THREE.Bone
      ? bones.indexOf(bone.parent)
      : -1;
    w.writeInt16(parentIdx);
    w.writeFloat32(bone.position.x);
    w.writeFloat32(bone.position.y);
    w.writeFloat32(bone.position.z);

    // boneInverse (column-major 4×4)
    const inv = boneInvs[i] ?? new THREE.Matrix4();
    const e = inv.elements;
    for (let j = 0; j < 16; j++) w.writeFloat32(e[j]);
  }

  // ── テクスチャリストを構築（マテリアル順）──
  // textures[i] は materials[i] のエンコード結果 (null = テクスチャなし)
  const texList = [];
  const texIndexForMat = materials.map((_, i) => {
    const tex = textures[i];
    if (!tex) return -1;
    const idx = texList.length;
    texList.push(tex);
    return idx;
  });
  const texCount = texList.length;

  // MATERIALS（固定 24 bytes/entry）
  for (let i = 0; i < matCount; i++) {
    const mat  = materials[i];
    const col  = mat.color ?? new THREE.Color(1, 1, 1);
    const tIdx = texIndexForMat[i];

    // MMDToonMaterial はカスタムシェーダーで alpha を処理するため
    // transparent=false / alphaTest=0 のままでも PNG テクスチャにアルファがある場合がある。
    // encodeTexture() が検出した hasAlpha を使って transparent フラグを補完する。
    //
    // ※ alphaTest=0.5 (オペークパス) ではなく transparent=true (透明パス) を使う理由:
    //   Three.js はオペークパスを「前から後ろ」の順でレンダリングするため、
    //   フェイスメッシュが depth buffer を先に書き込み、
    //   目・まつ毛が depth test 失敗で消えてしまう。
    //   transparent=true にすることでオペーク全体の後に描画され、
    //   正しく顔の前に表示される（MMDLoader の本来の挙動と同じ）。
    const texHasAlpha    = textures[i]?.hasAlpha ?? false;
    const isTransparent  = mat.transparent ?? false;
    const origAlphaTest  = mat.alphaTest   ?? 0;
    // テクスチャにアルファがあり、かつ元の設定が完全に不透明の場合 → transparent=true に昇格
    const useTransparent = texHasAlpha && !isTransparent && origAlphaTest === 0;
    const transparentVal = useTransparent ? true : isTransparent;

    w.writeFloat32(col.r);                          // 4
    w.writeFloat32(col.g);                          // 4
    w.writeFloat32(col.b);                          // 4
    w.writeFloat32(mat.opacity  ?? 1.0);            // 4
    w.writeUint8(transparentVal ? 1 : 0);           // 1
    w.writeFloat32(origAlphaTest);                  // 4  alphaTest は変更しない
    w.writeInt16(tIdx);                             // 2  (-1 = テクスチャなし)
    w.writeUint8(mat.side ?? THREE.FrontSide);      // 1  side (0=Front/1=Back/2=Double)

    const texInfo = tIdx >= 0
      ? `texIdx=${tIdx} ${texList[tIdx].width}x${texList[tIdx].height} ${texList[tIdx].type === 0 ? 'JPEG' : 'PNG'} ${(texList[tIdx].data.byteLength / 1024).toFixed(0)}KB`
      : (mat.map?.image ? '⚠ エンコード失敗' : 'テクスチャなし');
    const alphaInfo = useTransparent ? ` [transparent false→true 自動昇格]` : '';
    console.log(`[Encoder] mat[${i}] "${mat.name ?? ''}" transparent=${transparentVal} alphaTest=${origAlphaTest}${alphaInfo} → ${texInfo}`);
  }
  console.log(`[Encoder] テクスチャ数: ${texCount}/${matCount}`);

  // texCount
  w.writeUint16(texCount);

  // TEXTURES（可変長）
  for (const tex of texList) {
    w.writeUint8(tex.type);
    w.writeUint16(tex.width);
    w.writeUint16(tex.height);
    w.writeUint32(tex.data.byteLength);
    w.writeBytes(tex.data);
  }

  const buf = w.toArrayBuffer();
  console.log(`[Encoder] 変換完了: ${(buf.byteLength / 1024).toFixed(1)} KB`);
  return buf;
}

/**
 * エンコード統計情報を返す（動作確認用）
 *
 * @param {THREE.SkinnedMesh} mesh
 * @returns {Promise<object>}
 */
export async function getEncodeStats(mesh) {
  const buf       = await encodeMesh(mesh);
  const geo       = mesh.geometry;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

  return {
    vertexCount:  geo.attributes.position.count,
    indexCount:   geo.index?.count ?? 0,
    groupCount:   geo.groups.length,
    matCount:     materials.length,
    boneCount:    mesh.skeleton?.bones.length ?? 0,
    textureCount: materials.filter((m) => m.map?.image).length,
    totalBytes:   buf.byteLength,
    totalKB:      +(buf.byteLength / 1024).toFixed(1),
    buffer:       buf,  // 呼び出し元で保持できるよう返す
  };
}

/**
 * VMB1 バイナリの先頭を検証してフォーマットが正しいか確認する（デコーダー用）
 *
 * @param {ArrayBuffer} buffer
 * @returns {{ valid: boolean, version?: number, error?: string }}
 */
export function validateVMB(buffer) {
  if (buffer.byteLength < 24) {
    return { valid: false, error: 'バッファが短すぎます' };
  }
  const view = new DataView(buffer);
  // magic "VMB1"
  if (
    view.getUint8(0) !== 0x56 || view.getUint8(1) !== 0x4D ||
    view.getUint8(2) !== 0x42 || view.getUint8(3) !== 0x31
  ) {
    return { valid: false, error: 'マジックナンバーが不一致 (VMB1 ではありません)' };
  }
  const version = view.getUint8(4);
  if (version !== FORMAT_VERSION) {
    return { valid: false, error: `バージョン不一致: expected ${FORMAT_VERSION}, got ${version}` };
  }
  return { valid: true, version };
}

// ============================================================
// テクスチャエンコード（内部）
// ============================================================

/**
 * Three.js マテリアルのテクスチャを JPEG または PNG バイナリに変換する
 *
 * @param {THREE.Material} mat
 * @returns {Promise<{ type:number, width:number, height:number, data:ArrayBuffer }|null>}
 */
async function encodeTexture(mat) {
  const texture = mat.map;
  if (!texture || !texture.image) return null;

  const img  = texture.image;
  // image が HTMLImageElement か ImageBitmap か確認
  const srcW = img.width  ?? img.naturalWidth;
  const srcH = img.height ?? img.naturalHeight;
  if (!srcW || !srcH) return null;

  try {
    // マテリアルフラグによる基本判定
    let hasAlpha = (mat.transparent === true) || (mat.alphaTest ?? 0) > 0;

    // MMDToonMaterial はカスタムシェーダーで alpha を処理するため
    // transparent=false / alphaTest=0 のままでもテクスチャにアルファがある場合がある。
    // 縮小キャンバスで実ピクセルをスキャンして判定する（PNG/JPEG 問わず）。
    if (!hasAlpha) {
      hasAlpha = await hasRealAlphaPixels(img);
    }

    const mimeType = hasAlpha ? 'image/png' : 'image/jpeg';
    const texType  = hasAlpha ? TEX_TYPE_PNG : TEX_TYPE_JPEG;

    // 保存用フルサイズ canvas に描画
    const canvas = document.createElement('canvas');
    canvas.width  = srcW;
    canvas.height = srcH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, srcW, srcH);

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, mimeType, hasAlpha ? undefined : 0.92)
    );
    if (!blob) return null;

    const data = await blob.arrayBuffer();
    return { type: texType, width: srcW, height: srcH, data, hasAlpha };
  } catch (e) {
    console.warn('[Encoder] テクスチャエンコード失敗:', mat.name ?? '(unnamed)', e);
    return null;
  }
}

/**
 * 縮小キャンバスで実ピクセルを検査し、アルファが存在するか確認する。
 *
 * - 最大 128×128 に縮小してスキャンすることで大テクスチャのコストを抑える。
 * - 閾値を 250 とすることで JPEG 圧縮ノイズによる誤検出を防ぐ。
 * - getImageData に失敗した場合（CORS 等）は不透明扱いとして false を返す。
 *
 * @param {HTMLImageElement|ImageBitmap} image
 * @returns {Promise<boolean>}
 */
async function hasRealAlphaPixels(image) {
  const w = Math.min(image.width  ?? image.naturalWidth  ?? 1, 128);
  const h = Math.min(image.height ?? image.naturalHeight ?? 1, 128);

  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, w, h);

  let imageData;
  try {
    imageData = ctx.getImageData(0, 0, w, h);
  } catch (e) {
    console.warn('[Encoder] getImageData 失敗（CORS？）→ 不透明扱い:', e);
    return false;
  }

  const data = imageData.data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) return true;
  }
  return false;
}

// ============================================================
// BinaryWriter（内部ユーティリティ）
// ============================================================

/**
 * バイナリデータを chunk ベースで蓄積し、最終的に一つの ArrayBuffer にまとめる。
 * DataView を逐次使う方式より GC 効率は劣るが、実装がシンプルで安全。
 */
class BinaryWriter {
  constructor() {
    this._chunks = [];
    this._size   = 0;
  }

  writeUint8(v) {
    const b = new Uint8Array(1);
    b[0] = v & 0xFF;
    this._push(b);
  }

  writeUint16(v) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, v, true);
    this._push(b);
  }

  writeUint32(v) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v, true);
    this._push(b);
  }

  writeInt16(v) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setInt16(0, v, true);
    this._push(b);
  }

  writeFloat32(v) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setFloat32(0, v, true);
    this._push(b);
  }

  /** ArrayBuffer または TypedArray を追記する */
  writeBytes(bytes) {
    const u8 = ArrayBuffer.isView(bytes)
      ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      : new Uint8Array(bytes);
    this._push(u8);
  }

  _push(u8) {
    this._chunks.push(u8);
    this._size += u8.byteLength;
  }

  toArrayBuffer() {
    const result = new Uint8Array(this._size);
    let offset = 0;
    for (const chunk of this._chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result.buffer;
  }
}
