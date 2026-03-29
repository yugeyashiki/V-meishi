# V名刺 詳細設計書

> **ステータス**: フェーズ1・2・3-A完了
> **最終更新**: 2026-03-28
> **バージョン**: 0.5.0
> **開発ツール**: Claude Code

---

## 1. ファイル・ディレクトリ構成

```
v-meishi/
├── index.html
├── package.json
├── vite.config.js
├── public/
│   └── ammo.wasm.js          # 物理演算（CDNから取得 or 配置）
├── src/
│   ├── main.js               # エントリーポイント
│   ├── style.css             # グローバルスタイル
│   │
│   ├── components/
│   │   ├── AvatarViewer.js   # MMD表示・操作コア
│   │   ├── CardLayout.js     # 名刺レイアウト全体
│   │   ├── ProfileForm.js    # プロフィール入力フォーム
│   │   ├── ThemeSelector.js  # カラープリセット・カスタマイズUI
│   │   ├── SnsLinks.js       # SNSリンク入力・表示
│   │   ├── QRCodePanel.js    # QRコード生成・表示
│   │   └── FileUploader.js   # PMX/VMDファイル読み込み
│   │
│   ├── core/
│   │   ├── mmd.js            # MMDLoader / MMDAnimationHelper 初期化
│   │   ├── interaction.js    # マウス・タッチ操作による角度変更
│   │   ├── exporter.js       # JSONエクスポート/インポート（フェーズ2）
│   │   ├── encoder.js        # PMX→独自フォーマット変換（フェーズ3-A）
│   │   ├── crypto.js         # AES-GCM暗号化/復号（フェーズ3-A）
│   │   └── supabase.js       # Supabase連携（フェーズ3-A）
│   │
│   ├── data/
│   │   ├── presets.js        # カラープリセット定義
│   │   ├── schema.js         # 名刺JSONスキーマ・バリデーション
│   │   └── state.js          # CardState中央状態管理（フェーズ1 Step4で分離）
│   │
│   └── utils/
│       ├── color.js          # カラー変換・コントラスト自動計算
│       └── qrcode.js         # QRコードライブラリのラッパー
│
├── card/
│   └── index.html            # 閲覧専用ページ（/card/{UUID}）
│
└── .env                      # Supabase接続情報（Git管理外）
```

---

## 2. 画面・コンポーネント構成

### 画面一覧

```
[トップ画面 / index.html]
    │
    ├─ [作成モード]
    │   ├─ FileUploader      # ① モデル・モーションアップロード
    │   ├─ AvatarViewer      # ② 3Dプレビュー（常時表示）
    │   ├─ ProfileForm       # ③ プロフィール入力
    │   ├─ ThemeSelector     # ④ カラーカスタマイズ
    │   └─ SnsLinks          # ⑤ SNSリンク入力
    │
    ├─ [プレビューモード]
    │   ├─ CardLayout        # 名刺全体表示
    │   ├─ AvatarViewer      # 3D表示（操作可能）
    │   └─ QRCodePanel       # QRコード生成・表示
    │
    └─ [受け取りモード]（フェーズ2で追加）
        └─ ReceivePanel      # JSONインポート・名刺表示・コレクション保存
```

### 画面遷移

```
トップ（作成モード）
    └─→ 「プレビュー」ボタン → プレビューモード
                                    └─→ 「編集に戻る」ボタン → 作成モード
```

シングルページで作成モード・プレビューモードを切り替える構成とする（ページ遷移なし）。

---

## 3. コンポーネント詳細

### AvatarViewer.js

MMDモデルの読み込み・レンダリング・操作を担うコアコンポーネント。既存プロジェクトのMMD関連処理を流用・整理して実装する。

**担当機能**
- Three.js シーン・カメラ・レンダラーの初期化
- MMDLoader によるPMXファイルの読み込み
- MMDAnimationHelper によるVMDモーション再生
- ammo.wasmを使った物理演算
- マウスドラッグ / タッチスワイプによるモデル回転
- レンダリングループ（requestAnimationFrame）

**インターフェース**
```javascript
// 初期化
AvatarViewer.init(canvasElement)

// モデル読み込み
AvatarViewer.loadModel(pmxFile)

// モーション読み込み（任意）
AvatarViewer.loadMotion(vmdFile)

// 初期角度のセット
AvatarViewer.setPose({ rotationX, rotationY, zoom })

// 現在の角度を取得（保存用）
AvatarViewer.getPose()
```

---

### ProfileForm.js

プロフィール情報の入力フォーム。入力内容はリアルタイムにCardLayoutへ反映する。

**入力項目**
```
・名前（必須・最大20文字）
・キャッチコピー（任意・最大40文字）
・活動ジャンル（任意・最大20文字）
```

---

### SnsLinks.js

SNSリンクの追加・削除・並び替えを管理する。

**対応プラットフォーム（初期）**
```
X / YouTube / TikTok / Twitch / Instagram / その他
```

**UI仕様**
- 「＋ SNSを追加」ボタンでプラットフォーム選択 → URL入力
- 最大5件まで
- 各行に削除ボタン

---

### ThemeSelector.js

カラープリセットの選択とカスタマイズUIを管理する。

**UI仕様**
- プリセットをサムネイル形式で横並び表示
- 「カスタム」を選択するとカラーピッカーが展開
- 背景タイプ（単色 / グラデーション / 画像）をタブで切り替え

---

### CardLayout.js

名刺全体のレイアウトを構成するコンポーネント。ProfileForm・SnsLinks・ThemeSelector の入力をリアルタイムに反映する。

**レイアウト仕様**
```
┌──────────────────────┐
│                      │  ← 背景色 / グラデーション
│   [AvatarViewer]     │  ← 上部 60%
│                      │
├──────────────────────┤
│  名前                │  ← 28px Bold
│  ────────────        │  ← アクセントライン 2px
│  キャッチコピー      │  ← 14px Regular
│                      │
│  [X]  xxxxxxx.com    │  ← SNSアイコン + URL
│  [YT] youtube.com/xx │
└──────────────────────┘
```

**レスポンシブ対応**
- スマホ（〜768px）：縦型カード（390×700px基準）
- PC（769px〜）：横型カード（左アバター60% / 右テキスト40%）

---

### QRCodePanel.js

名刺データのQRコードを生成・表示する。

**仕様**
- 表示するデータ：プロフィール情報（名前・キャッチコピー・SNSリンク）のJSON文字列
- モデルファイル本体はQRに含めない
- QRコードライブラリ：qrcode.js（`npm install qrcode`）
- QR画像のダウンロードボタンを併設

---

### ReceivePanel.js

名刺の受け取り・表示・コレクション保存を担うコンポーネント。フェーズ2で追加。

**担当機能**
- JSONファイルのインポート
- 受け取った名刺データの表示
- localStorageへの保存
- 保存済み名刺のコレクション一覧表示

---

### FileUploader.js

PMX / VMD ファイルのローカル読み込みを担う。

**仕様**
- PMX：必須・単一ファイル
- VMD：任意・単一ファイル
- ドラッグ&ドロップ対応
- ファイルサイズ上限の警告表示（目安：PMX 50MB / VMD 10MB）

---

## 4. データフロー

```
[FileUploader]
    │ pmxFile, vmdFile
    ▼
[AvatarViewer] ←─────────────── [interaction.js]
    │ pose情報                      マウス/タッチ操作
    │
[CardState]  ←── [ProfileForm]
（中央状態）  ←── [SnsLinks]
             ←── [ThemeSelector]
             ←── [AvatarViewer].getPose()
    │
    ▼
[CardLayout]     ← リアルタイム反映
[QRCodePanel]    ← プレビュー時に生成
[exporter.js]    ← JSONエクスポート（フェーズ2）
```

**CardState（中央状態オブジェクト）**
```javascript
const cardState = {
  profile: {
    name: '',
    catchphrase: '',
    genre: '',
  },
  links: [],          // { platform, url, label }
  theme: {
    preset: 'dark',
    bgType: 'solid',  // 'solid' | 'gradient' | 'image'
    bgColor: '#0D0D0D',
    bgGradient: ['#1a1a2e', '#16213e'],
    bgImage: null,
    textColor: '#FFFFFF',
    accentColor: '#9B59B6',
  },
  avatar: {
    modelFileName: '',
    motionFileName: '',
    pose: { rotationX: 0, rotationY: 0, zoom: 1.0 },
  }
}
```

---

## 5. 既存コードからの流用箇所

| 流用元（既存プロジェクト） | 流用先（V名刺） | 備考 |
|--------------------------|----------------|------|
| MMDLoader / MMDAnimationHelper の初期化処理 | core/mmd.js | そのまま流用・整理 |
| ammo.wasm読み込み処理 | core/mmd.js | index.htmlのscriptタグから移植 |
| マウスドラッグによる角度変更 | core/interaction.js | タッチ操作を追加 |
| PMX / VMDファイルのinput処理 | FileUploader.js | UI部分を刷新 |
| requestAnimationFrameループ | AvatarViewer.js | そのまま流用 |

---

## 6. 実装フェーズ詳細

### フェーズ1 実装順序 ✅ 完了

```
✅ Step 1: プロジェクト初期設定
✅ Step 2: AvatarViewer の実装
✅ Step 3: FileUploader の実装
✅ Step 4: CardLayout の実装
✅ Step 5: ProfileForm + SnsLinks の実装
✅ Step 6: ThemeSelector の実装
✅ Step 7: スマホ対応（実機確認済み・問題なし）
✅ Step 8: QRCodePanel の実装
✅ Step 9: 動作確認・バグ修正
```

### フェーズ2 実装順序 ✅ 完了

> JSONエクスポート/インポート方式で実装済み（サーバーなし）

```
✅ Step 10: JSONエクスポート実装
    └─ プレビュー画面にダウンロードボタン追加
✅ Step 11: JSONインポート・名刺を受け取る画面実装
    └─ 独立した受け取りモードとしてUI追加
✅ Step 12: 名刺コレクション機能
    └─ 受け取った名刺のlocalStorage保存・一覧表示
✅ Step 13: フェーズ2動作確認・バグ修正
```

> **フェーズ3への積み残し**
> 3Dエンコード＋サーバー方式による本格共有はフェーズ3-Aで実装予定。

### フェーズ3-A 実装順序 ✅ 完了

```
✅ Step 14: Supabaseプロジェクト作成・環境変数設定
    └─ cardsテーブル・model-dataバケット・RLSポリシー設定済み

✅ Step 15: encoder.js の実装
    └─ VMB1独自フォーマットでPMX→バイナリ変換
    └─ マテリアル・テクスチャ・ジオメトリの不可逆変換

✅ Step 16: crypto.js の実装
    └─ AES-GCM暗号化/復号・往復テスト確認済み

✅ Step 17: supabase.js の実装
    └─ Storage アップロード/ダウンロード・DB保存・UUID発行
    └─ 全7ステップの往復テスト確認済み

✅ Step 18: カスタムMMDローダーの実装
    └─ 暗号化バイナリ復号→Three.js描画
    └─ 既知の問題: 透過テクスチャ（目・まつ毛）の欠落
      → フェーズ3-B以降で対応予定

✅ Step 19: 閲覧専用URLページの実装（card/index.html）
    └─ UUID付きURLでモデル・プロフィール表示確認済み

✅ Step 20: QRコード対応の更新
    └─ QRコードにUUID付きURL埋め込み・URLコピー機能
    └─ Webで共有セクションとローカルQRを分離

✅ Step 21: 動作確認・セキュリティ検証
    └─ アップロード→閲覧の一連フロー確認済み
    └─ ネットワークログから生ファイル取得が困難なことを確認済み
    └─ 既存機能（ローカル読み込み・テーマ・JSONエクスポート）の動作確認済み
```

---

## 7. 未決定事項・TODO

### 完了済み
- [x] フェーズ1全ステップ実装・スマホ実機確認
- [x] フェーズ2全ステップ実装（JSONエクスポート/インポート・コレクション）

### フェーズ3-A（完了済み）
- [x] サーバーインフラ → Supabase
- [x] 暗号化方式 → AES-GCM（Web Crypto API）
- [x] 閲覧方式 → QRコードUUID付きURL
- [x] DBスキーマ設計・実装
- [x] VMB1独自フォーマット実装
- [x] Step 14〜21 全実装・動作確認完了

### フェーズ3-B以降で対応
- [ ] 透過テクスチャ（目・まつ毛）の欠落修正
- [ ] モデルファイルサイズ上限の実装
- [ ] データ保持期限・削除ポリシーの実装
- [ ] ホスティング・ドメインの選定・デプロイ
- [ ] 本番環境でのスマホQRコード読み取り確認

### その他
- [ ] アプリロゴ・ファビコンの作成

---

## 8. 参照ドキュメント

| ドキュメント | パス |
|-------------|------|
| 仕様書 | `docs/v-meishi-spec.md` |
| ロードマップ | `docs/roadmap.md` |
