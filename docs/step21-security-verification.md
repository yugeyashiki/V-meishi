# Step 21 検証レポート — Phase 3-A セキュリティ・動作確認

**実施日**: 2026-03-28
**対象フェーズ**: Phase 3-A（Steps 14–21）Supabase バックエンド統合
**検証者**: Claude Code (claude-sonnet-4-6)

---

## 概要

Phase 3-A で実装したアップロード→閲覧フロー全体について、以下の 3 点を検証した。

1. アップロード→閲覧の一連フロー確認
2. ネットワークログから暗号化前の生ファイルが取得困難なことの確認
3. 既存ローカル機能（モデル読み込み・テーマ切り替え・JSON エクスポートなど）の回帰確認

---

## 1. アップロード→閲覧フロー確認

### フロー全体図

```
[ユーザー操作]
    │
    ├─ PMX/VMD 読み込み（FileUploader.js）
    │       ↓ ObjectURL → MMDLoader → Three.js SkinnedMesh（メモリ内）
    │
    ├─ 「アップロードして QR を生成」ボタン（QRCodePanel.js）
    │       ↓ encoder.js    : SkinnedMesh → VMB1 バイナリ（メモリ内）
    │       ↓ crypto.js     : VMB1 → AES-GCM 暗号化（メモリ内）
    │       ↓ supabase.js   : 暗号文 → Storage upload（models/{uuid}.vmb）
    │       ↓ supabase.js   : プロフィール + 鍵 → cards テーブル insert
    │       ↓ QRCodePanel.js: /card/?id={uuid} を QR コード化・表示
    │
    └─ 閲覧者が QR スキャン → /card/?id={uuid}
            ↓ card.js: UUID を URL から取得
            ↓ supabase.js#loadCard : DB から cards レコード取得（鍵・パス含む）
            ↓ supabase.js#downloadModel : Storage から暗号文 ArrayBuffer を取得
            ↓ crypto.js#decrypt : メモリ上で AES-GCM 復号 → VMB1 平文
            ↓ AvatarViewer.js#loadFromVMB : VMB1 → Three.js シーンへ配置
            ↓ card.js: テーマ・プロフィール・SNS リンクを描画
```

### ステップ別確認結果

| ステップ | 担当モジュール | 確認内容 | 結果 |
|---|---|---|---|
| PMX 読み込み | `FileUploader.js` → MMDLoader | ObjectURL のみ使用、外部送信なし | ✅ |
| エンコード | `core/encoder.js` | Three.js mesh → VMB1 バイナリ（メモリ内完結） | ✅ |
| 暗号化 | `core/crypto.js` | AES-GCM 256-bit、IV+暗号文を連結 | ✅ |
| Storage アップロード | `core/supabase.js#uploadModel` | `encryptedBuffer` のみ送信（平文 VMB1 は送らない） | ✅ |
| DB 保存 | `core/supabase.js#saveCard` | プロフィール + encryption_key + model_storage_path | ✅ |
| QR 生成 | `components/QRCodePanel.js` | `/card/?id={uuid}` を QR コード化 | ✅ |
| 閲覧ページ表示 | `card.js` | UUID → DB 取得 → Storage DL → 復号 → Three.js 描画 | ✅ |

---

## 2. ネットワークセキュリティ検証

### DevTools Network タブで見えるもの（設計通り）

```
POST  https://{project}.supabase.co/storage/v1/object/model-data/models/{uuid}.vmb
  Content-Type: application/octet-stream
  Body: [12B IV][AES-GCM 暗号文]   ← 平文 PMX・VMB1 は含まれない

POST  https://{project}.supabase.co/rest/v1/cards
  Body (JSON): {
    "id": "{uuid}",
    "name": "...",
    "encryption_key": "{base64url 44文字}",
    "model_storage_path": "models/{uuid}.vmb",
    ...
  }
```

### DevTools Network タブで見えないもの（設計通り）

| 見えないもの | 理由 |
|---|---|
| `.pmx` ファイル本体 | ローカル ObjectURL → MMDLoader → Three.js mesh で完結。サーバーへ一切送信しない |
| 復号前の VMB1 平文 | `decrypt()` はメモリ上のみ。返り値 `ArrayBuffer` を `loadFromVMB()` へ直接渡す |
| 暗号化鍵の平文バイト | Storage バイナリには鍵が含まれない。DB には base64url で保存 |

### 暗号化仕様

| 項目 | 値 |
|---|---|
| アルゴリズム | AES-GCM |
| 鍵長 | 256-bit |
| IV | 12 bytes（暗号化ごとにランダム生成、NIST 推奨） |
| 認証タグ | 128-bit（GCM タグ付き → 改ざん検知） |
| バイナリ構造 | `[IV: 12B][ciphertext: N bytes]` |

### セキュリティ上の既知トレードオフ

> `encryption_key` が `cards` テーブル（Supabase DB）に base64url 文字列として保存されている。
>
> - Storage のバイナリ単体では復号不可（鍵がなければ AES-GCM タグ検証で失敗）
> - ただし、DB へのアクセス権を持つ攻撃者は鍵とバイナリの両方を取得できる
> - **実質的な防衛線は Supabase の RLS（Row Level Security）ポリシー**
>
> 現フェーズでは「難読化＋アクセス分散」の効果として許容。必要に応じて将来的に鍵管理の強化（KMS 等）を検討する。

---

## 3. 既存ローカル機能の回帰確認

Phase 3-A（Steps 14–21）で変更したファイルを棚卸しし、既存機能への影響を確認した。

### 変更なし（無影響）

| 機能 | 主担当ファイル |
|---|---|
| PMX/VMD モデル読み込み | `components/FileUploader.js`, `components/AvatarViewer.js` |
| テーマ切り替え | `components/ThemeSelector.js`, `components/CardLayout.js` |
| プロフィール編集 | `components/ProfileForm.js` |
| SNS リンク管理 | `components/LinksForm.js` |
| JSON エクスポート / インポート | `components/ExportPanel.js` |
| アプリ状態管理 | `data/state.js` |

### 変更あり（影響範囲を限定）

| ファイル | 変更内容 | 既存機能への影響 |
|---|---|---|
| `components/QRCodePanel.js` | 「🌐 Web で共有」セクションを追加 | 既存の「📋 プロフィール情報 QR」ロジック（`generateProfileQR`・`subscribe` フック）は完全に保持。影響なし |
| `src/style.css` | QR 共有セクション用スタイルを末尾追加 | 既存セレクタとの衝突なし |
| `vite.config.js` | マルチページ対応（`card/index.html` を追加） | `main` エントリーポイントへの影響なし |

### 新規追加ファイル（既存に干渉しない）

| ファイル | 用途 |
|---|---|
| `card/index.html` | 閲覧専用ページ |
| `src/card.js` | 閲覧専用ページのエントリーポイント |
| `src/card.css` | 閲覧専用ページのスタイル |
| `src/core/encoder.js` | VMB1 エンコーダー |
| `src/core/decoder.js` | VMB1 デコーダー |
| `src/core/crypto.js` | AES-GCM 暗号化/復号 |
| `src/core/supabase.js` | Supabase クライアント + Storage/DB 操作 |

---

## 4. 既知の未解決課題

| 課題 | 詳細 | 優先度 |
|---|---|---|
| 透過テクスチャの表示欠落 | 目・まつ毛など `MeshToonMaterial` の `transparent + alphaTest` が MMD 本来の `MMDToonMaterial`（ShaderMaterial サブクラス）と挙動が異なる | 低（機能に影響なし） |

---

## 5. 結論

Phase 3-A の全実装（Steps 14–21）について、以下を確認した。

- **フロー**: アップロード→QR 生成→閲覧 URL 表示→モデル表示の全フローが正常動作
- **セキュリティ**: 平文 PMX ファイルはネットワークに出ない。暗号化バイナリのみが Storage に保存される
- **回帰**: 既存のローカル機能（モデル読み込み・テーマ・プロフィール・JSON 入出力）に影響なし

**Phase 3-A 完了。**
