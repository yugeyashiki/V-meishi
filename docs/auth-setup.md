# Supabase Auth OAuth設定手順

## 事前準備

Supabase管理画面の **Authentication → URL Configuration** で以下を設定:

- **Site URL**: `https://your-app.vercel.app`
- **Redirect URLs** に追加: `https://your-app.vercel.app`

---

## Google OAuth設定

### 1. Google Cloud Console での設定

1. [Google Cloud Console](https://console.cloud.google.com/) を開く
2. プロジェクトを選択（または新規作成）
3. **APIとサービス → 認証情報** を開く
4. **+ 認証情報を作成 → OAuthクライアントID** をクリック
5. アプリケーションの種類: **ウェブアプリケーション**
6. 承認済みリダイレクト URI に以下を追加:
   ```
   https://[supabase-project-ref].supabase.co/auth/v1/callback
   ```
7. **クライアントID** と **クライアントシークレット** をメモする

### 2. Supabase での設定

1. Supabase Dashboard → **Authentication → Providers**
2. **Google** を選択して有効化
3. 上記で取得した **Client ID** と **Client Secret** を入力
4. **Save** をクリック

---

## X（Twitter）OAuth設定

### 1. Twitter Developer Portal での設定

1. [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard) を開く
2. **Projects & Apps → New App**（または既存アプリを選択）
3. **App settings → Authentication settings** を開く
4. **OAuth 2.0** を有効化
5. **Callback URI / Redirect URL** に以下を追加:
   ```
   https://[supabase-project-ref].supabase.co/auth/v1/callback
   ```
6. **Website URL**: `https://your-app.vercel.app`
7. **Keys and tokens** から **API Key** と **API Key Secret** をメモする

### 2. Supabase での設定

1. Supabase Dashboard → **Authentication → Providers**
2. **Twitter** を選択して有効化
3. 上記で取得した **API Key** と **API Secret Key** を入力
4. **Save** をクリック

---

## 動作確認

設定完了後、アプリのログインボタンをクリックして OAuth フローが起動することを確認する。

- Google: Googleアカウント選択画面が表示される
- X: X のログイン画面が表示される

ログイン後、ヘッダーにアカウント名が表示されれば成功。
