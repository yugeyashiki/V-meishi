# V名刺 開発進捗レポート

> **作成日**: 2026-03-20
> **最終更新**: 2026-03-22
> **対象バージョン**: 0.3.0（フェーズ1・2完了 / フェーズ3設計待ち）
> **開発ツール**: Claude Code

---

## 完了済み Steps

### Step 1: プロジェクト初期設定

**ステータス**: ✅ 完了

#### 1-1. ディレクトリ・ファイル構成の作成

設計書（`docs/v-meishi-design.md`）通りのディレクトリ・空ファイルを作成。

```
v-meishi/
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.js
│   ├── style.css
│   ├── components/   (7ファイル)
│   ├── core/         (3ファイル)
│   ├── data/         (2ファイル)
│   └── utils/        (2ファイル)
```

#### 1-2. package.json の作成

| 項目 | 内容 |
|------|------|
| 流用元 | `D:\AI3DViewMMD\package.json` |
| dependencies | `three ^0.160.0` / `mmd-parser ^1.0.4` / `qrcode ^1.5.4` |
| devDependencies | `vite ^5.0.0` のみ |
| 除外 | MediaPipe / VRM 関連パッケージ（V名刺では不使用） |

#### 1-3. vite.config.js の作成

| 項目 | 内容 |
|------|------|
| 流用元 | `D:\AI3DViewMMD\vite.config.js` の `assetsInclude` 設定 |
| 内容 | PMX / VMD / BMP 等を静的アセットとして扱う最小構成 |
| 除外 | `mmdAssetWatcher` プラグイン（サーバー側ファイル監視は不要） |
| 追加 | `server.host: true`（スマホ実機確認用 LAN 公開） |

#### 1-4. index.html の骨格作成

- 文字コード・viewport（スマホ対応）
- ammo.wasm.js CDN 読み込み（流用元: `D:\AI3DViewMMD\index.html` と同じ CDN URL）
- 作成モード / プレビューモードの div 構造
- `<canvas id="avatar-canvas">` 配置

#### 1-5. style.css の骨格作成

- CSS リセット
- CSS 変数によるカラートークン定義（デフォルト: ダーク単色）
- カラープリセット 4 種をクラスで定義（`.theme-neon` 等）
- 名刺カード縦型レイアウト（390×700px）
- `@media (min-width: 769px)` で横型（760×440px）に切り替えるレスポンシブ骨格

#### npm install

- 42 パッケージをインストール
- moderate 脆弱性 2 件（esbuild 経由・開発サーバー限定・本番影響なし）→ 対応不要と判断

---

### Step 2: AvatarViewer の実装

**ステータス**: ✅ 完了

#### 実装ファイル

| ファイル | 役割 | 流用元 |
|----------|------|--------|
| `src/core/mmd.js` | MMDLoader / MMDAnimationHelper 初期化・ロードユーティリティ | `script.js` の `initPhysics` / `loadMMDAsync` |
| `src/core/interaction.js` | マウスドラッグ・タッチスワイプによるモデル回転 | `script.js` のマウスドラッグ処理（タッチ操作を新規追加） |
| `src/components/AvatarViewer.js` | Three.js シーン・カメラ・レンダラー・アニメーションループ | `script.js` の `setupScene` / `animate` |
| `src/main.js` | エントリーポイント（AvatarViewer 初期化） | 新規 |

#### 既存プロジェクトとの主な変更点

| 変更項目 | 既存 | V名刺 |
|----------|------|-------|
| 描画先 | 全画面（`document.body` に追加） | カード内 `<canvas>` 要素に固定 |
| サイズ追従 | `window.resize` イベント | `ResizeObserver` でコンテナ追従 |
| モデル操作 | カメラ移動（顔トラッキング） | `mesh.rotation` 直接変更（ドラッグ） |
| 背景 | `0x333333` 固定色 | `null`（CSS 背景を透過して見せる） |
| 顔トラッキング | MediaPipe 使用 | 削除（不要） |

#### 動作確認

`npm run dev` で Vite 開発サーバー（port 5174）が起動し HTTP 200 を返すことを確認済み。
（モデルはまだロードされない状態）

---

## 今後の予定 Steps

### Step 3: FileUploader の実装

**ステータス**: ✅ 完了

- 方針A（`webkitdirectory` フォルダ選択）で実装
- `loader.load()` → `loader.loadPMX()` に変更（blob URL の拡張子問題を解消）
- URLModifier によるテクスチャ ObjectURL 解決
- `MMDAnimationHelper` 二重登録バグ修正（`helper.remove(mesh)` を追加）
- ドラッグ&ドロップ対応・ファイルサイズ警告・プログレスバー実装

---

### Step 4: CardLayout の実装

**ステータス**: ✅ 完了

- `src/data/state.js`：cardState の一元管理 + pub/sub（B案：state.js 分離）
- `src/data/presets.js`：カラープリセット 5 種定義
- `src/components/CardLayout.js`：subscribe で状態変化をリアルタイム反映
- 作成モード ↔ プレビューモードの切り替えロジック（`main.js` 経由）

---

### Step 5: ProfileForm + SnsLinks の実装

**ステータス**: ✅ 完了

- `src/components/ProfileForm.js`：名前・キャッチコピー・活動ジャンルの入力フォーム（文字数カウンタ付き）
- `src/components/SnsLinks.js`：SNSリンクの追加・削除（最大5件、プラットフォーム選択付き）
- 入力 → `updateState()` → `CardLayout` リアルタイム反映

---

### Step 6: ThemeSelector の実装

**ステータス**: ✅ 完了

- `src/components/ThemeSelector.js`：プリセットサムネイル選択 + カスタムパネル
- カスタムパネル：単色 / グラデーション / 画像の3タブ構成
- CSS 変数（`--bg-color` 等）の上書きによるリアルタイム反映
- 画像背景は ObjectURL 生成 → CardLayout が backgroundImage で直接適用

---

### Step 7: スマホ対応の確認・修正

**ステータス**: ✅ 完了

**修正内容:**
- プレビューモードで 3D モデルが映らない問題を修正
  - `#preview-canvas`（未初期化）を削除し、`#avatar-canvas` を DOM 移動で共有
  - `AvatarViewer.onContainerChanged()` を追加し、移動後にレンダラーサイズを更新
  - `window.addEventListener('resize', onResize)` を追加し PC/スマホのリサイズに対応
- iOS Safari 向け touch 対応強化
  - `canvas` に `touch-action: none` を追加（CSS レベルでスクロール抑制）
  - `touchstart` を `{ passive: false }` に変更し、preventDefault が確実に効くよう修正
- `.mode` に `overscroll-behavior: none` を追加し iOS の バウンスを抑制

---

### Step 8: QRCodePanel の実装

**ステータス**: ✅ 完了

- `src/utils/qrcode.js`：qrcode パッケージのラッパー（canvas 描画・DataURL 生成）
- `src/components/QRCodePanel.js`：QR 生成・表示・ダウンロードボタン
- QR データ: profile / links / avatar.pose / meta（モデルファイル本体は含めない）
- プレビューモード切り替え時に自動再生成（`refresh()` を main.js から呼び出し）
- QRデータ確認用の JSON プレビュー（折りたたみ式）

---

### Step 9: 動作確認・バグ修正

**ステータス**: ✅ 完了

- 全機能の統合テスト
- スマホ実機での MMD 描画・タッチ操作の動作確認（問題なし）
- 各種モデル・モーションでの互換性確認

---

## フェーズ2 完了済み Steps

### Step 10: JSONエクスポート実装

**ステータス**: ✅ 完了

- `src/core/exporter.js`：名刺データのJSONシリアライズ・ファイルダウンロード
- プレビュー画面にダウンロードボタン追加
- モデルファイル本体はJSONに含めず、プロフィール・テーマ・ポーズ情報のみエクスポート

---

### Step 11: JSONインポート・名刺を受け取る画面実装

**ステータス**: ✅ 完了

- `src/components/ReceivePanel.js`：受け取りモード専用コンポーネントとして新規作成
- JSONファイルを読み込んで名刺データを表示
- 独立した受け取りモードとして UI に追加（作成・プレビューとは別モード）

---

### Step 12: 名刺コレクション機能

**ステータス**: ✅ 完了

- 受け取った名刺データを localStorage に保存
- 保存済み名刺の一覧表示（ReceivePanel 内）

---

### Step 13: フェーズ2動作確認・バグ修正

**ステータス**: ✅ 完了

- JSONエクスポート/インポートの動作確認
- コレクション保存・表示の動作確認

---

## 未決定事項

| 項目 | 状態 |
|------|------|
| 日本語対応フォントの選定（Webフォント or システムフォント） | 未決定 |
| VMD なしの場合のデフォルトポーズ・アイドルモーション | 未決定 |
| アプリロゴ・ファビコンの作成 | 未決定 |
| フェーズ3-A 詳細設計（3Dエンコード・サーバー方式） | 設計待ち |

---

## 参照ドキュメント

| ドキュメント | パス |
|-------------|------|
| 仕様書 | `docs/v-meishi-spec.md` |
| 詳細設計書 | `docs/v-meishi-design.md` |
| 本ファイル（進捗） | `docs/progress.md` |
