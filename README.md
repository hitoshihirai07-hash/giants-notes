# 読売ジャイアンツ 良かったところメモ（投稿フォーム + お問い合わせフォーム）

「タイトル / 情報 / タグ / 本文」をフォーム入力して **投稿ボタンを押すだけ** で公開できる、最小構成の静的サイト + Cloudflare Pages Functions です。

- 公開ページ: `/`（一覧） と `/post?id=...`（個別）
- 管理ページ: `/admin`（フォーム投稿 + 受信箱）
- このサイトについて: `/about`（免責・プライバシー・お問い合わせフォーム）
- サイトマップ: `/sitemap.xml`（自動生成）
- 保存先: Cloudflare KV（1回セットアップしたら、以後はブラウザから投稿するだけ）

---

## 使い方（最短）

### 1) Cloudflare KV を作成
Cloudflare ダッシュボード → **Workers & Pages** → **KV** → **Create a namespace**

### 2) Cloudflare Pages にデプロイ
このフォルダ一式を GitHub に上げて、Cloudflare Pages で **Connect to Git** でデプロイ。

Pages 設定（Framework preset: None）
- Build command: なし（空）
- Build output directory: `public`

### 3) KV バインディングを追加
Pages → プロジェクト → Settings → Functions → **KV namespace bindings**

- Variable name: `POSTS`
- KV namespace: さっき作った `GIANTS_NOTES_KV`

#### よくあるミス
- `POSTS` を **Environment variables** 側に作ってしまう → KVが使えず `/api/posts` が 500 になります
- Production/Preview の片方だけ設定している → もう片方の環境では動きません

### 4) 管理トークン（必須）を設定
Pages → Settings → Environment variables → **Add variable**

- Name: `ADMIN_TOKEN`
- Value: 自分だけが知ってる長めの文字列（32文字以上を推奨）
- Type: **Secret** を推奨

※ Production と Preview の両方に入れると、プレビュー環境でも投稿できます。

### 5) 投稿する
デプロイ後に
- `https://<your-site>.pages.dev/admin` を開く
- トークン入力 → タイトル/情報/タグ/本文 → 投稿

投稿後に返ってきた URL を開けば公開されてます。

---

## お問い合わせフォームのスパム対策（Turnstile）

### 1) Turnstile を作成
Cloudflare ダッシュボード → **Turnstile** → **Add widget**

- **ドメイン**: あなたの Pages ドメイン（例: `giants-notes.pages.dev`）
- **ウィジェットモード**: 迷ったら "Managed" のままでOK

作成すると **Site key** と **Secret key** が表示されます。

### 2) Pages の環境変数を追加
Pages → Settings → Environment variables → Add variable

- Name: `TURNSTILE_SITEKEY`（Site key / 公開OK）
- Name: `TURNSTILE_SECRET`（Secret key / **Secret推奨**）

※ Production と Preview の両方に入れると、プレビューでもフォームが動きます。

---

## 検索に強くする（sitemap / canonical / IndexNow）

### sitemap.xml
- `/sitemap.xml` は **KVの一覧から自動生成** します。
- `public/robots.txt` に Sitemap を追記しています。

※独自ドメインにしたら、`public/robots.txt` の Sitemap 行はドメインに合わせて書き換えてください。

### canonical
- `public/assets/seo.js` が canonical を自動で統一します（`/post` と `/post.html` のような重複を避けます）。

### IndexNow（任意）
投稿した直後に、Bing などへ「このURLが更新されたよ」を通知できます（IndexNow）。

1) Pages の環境変数を追加
- Name: `INDEXNOW_KEY`（Bing Webmaster Tools で生成したキー、または自分で作ったキー）

2) 確認
- `https://<your-site>.pages.dev/indexnow-key.txt` を開くと、キーがそのまま表示されます。

3) 動作
- 新規投稿すると、サーバー側で `api.indexnow.org` に通知します。
  - 通知対象: `投稿ページ / トップ / sitemap.xml`

※ `INDEXNOW_KEY` を入れていない場合はスキップします（投稿自体は普通に成功します）。

## セキュリティ注意
- `/admin` には `noindex` を入れてますが、URLが漏れたら誰でも開けます。
- 投稿APIは `ADMIN_TOKEN` がないと通りません。
- トークンは **推測されない長さ** にして、使い回さないのが安全。

### レート制限
お問い合わせフォームは **同一IPから1分に3回まで** に制限しています（スパム対策）。

---

## 仕組み
- `POSTS` (KV) に以下を保存
  - `posts:index` : 一覧用のメタデータ配列
  - `post:<id>` : 個別記事データ
  - `inbox:index` : お問い合わせ（受信箱）一覧
  - `inbox:<id>` : お問い合わせ本文

※お問い合わせは「メール送信」ではなく、管理ページの **受信箱** に届きます（Cloudflareだけで完結させるため）。

---

## カスタムしたい場合
- サイト名や説明文: `public/index.html` の見出し
- デザイン: `public/assets/style.css`

