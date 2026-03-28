/**
 * data/schema.js
 * 名刺 JSON のスキーマ定義・正規化・バリデーション
 */

const CURRENT_VERSION = '1.0';

/**
 * 生の JSON オブジェクトを正規化された cardData に変換する
 * 不足フィールドはデフォルト値で補完
 * @param {object} raw
 * @returns {object} normalized card
 */
export function normalizeCard(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid card data');

  const profile = raw.profile ?? {};
  const theme   = raw.theme   ?? {};
  const avatar  = raw.avatar  ?? {};
  const meta    = raw.meta    ?? {};

  return {
    version: CURRENT_VERSION,
    profile: {
      name:         String(profile.name         ?? ''),
      catchphrase:  String(profile.catchphrase  ?? ''),
      genre:        String(profile.genre        ?? ''),
      organization: String(profile.organization ?? ''),
      links: Array.isArray(profile.links)
        ? profile.links.map(normalizeLink).filter(Boolean)
        : [],
    },
    theme: {
      bgType:      ['solid', 'gradient', 'image'].includes(theme.bgType) ? theme.bgType : 'solid',
      bgColor:     String(theme.bgColor     ?? '#0D0D0D'),
      bgGradient:  Array.isArray(theme.bgGradient) && theme.bgGradient.length === 2
        ? [String(theme.bgGradient[0]), String(theme.bgGradient[1])]
        : ['#0D0D0D', '#1a0a2e'],
      textColor:   String(theme.textColor   ?? '#FFFFFF'),
      accentColor: String(theme.accentColor ?? '#9B59B6'),
    },
    avatar: {
      modelFileName:  String(avatar.modelFileName  ?? ''),
      motionFileName: String(avatar.motionFileName ?? ''),
      pose: {
        rotationX: Number(avatar.pose?.rotationX ?? 0),
        rotationY: Number(avatar.pose?.rotationY ?? 0),
        zoom:      Number(avatar.pose?.zoom      ?? 1),
      },
    },
    meta: {
      id:         String(meta.id         ?? generateId()),
      createdAt:  String(meta.createdAt  ?? new Date().toISOString()),
      savedAt:    new Date().toISOString(),
      appVersion: String(meta.appVersion ?? '0.1.0'),
    },
  };
}

/**
 * @param {object} card - normalizeCard の出力
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCard(card) {
  const errors = [];

  if (!card?.profile?.name && !card?.profile?.links?.length) {
    errors.push('名前またはSNSリンクが必要です');
  }
  if ((card?.profile?.name?.length ?? 0) > 50) {
    errors.push('名前は50文字以内にしてください');
  }
  if ((card?.profile?.catchphrase?.length ?? 0) > 100) {
    errors.push('キャッチコピーは100文字以内にしてください');
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================
// 内部ヘルパー
// ============================================================

function normalizeLink(link) {
  if (!link || typeof link !== 'object') return null;
  const url = String(link.url ?? '').trim();
  if (!url) return null;
  return {
    platform: String(link.platform ?? 'other'),
    url,
    label: String(link.label ?? ''),
  };
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
