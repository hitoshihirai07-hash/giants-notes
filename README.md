# 読売ジャイアンツ 良かったところメモ（投稿フォーム + お問い合わせフォーム）

「タイトル / 情報 / タグ / 本文」をフォーム入力して **投稿ボタンを押すだけ** で公開できる、最小構成の静的サイト + Cloudflare Pages Functions です。

- 公開ページ: `/`（一覧） と `/post.html?id=...`（個別）
- 管理ページ: `/admin.html`（フォーム投稿 + 受信箱）
- このサイトについて: `/about.html`（免責・プライバシー・お問い合わせフォーム）
- 保存先: Cloudflare KV（1回セットアップしたら、以後はブラウザから投稿するだけ）

---

## 使い方（最短）

### 1) Cloudflare KV を作成
Cloudflare ダッシュボード → **Workers & Pages** → **KV** → **Create a namespace**

例: `GIANTS_NOTES_KV`

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
- Value: 自分だけが知ってる長めの文字列（例: 32文字以上）
- Type: **Secret** を推奨

※ Production と Preview の両方に入れると、プレビュー環境でも投稿できます。

### 5) 投稿する
デプロイ後に
- `https://<your-site>.pages.dev/admin.html` を開く
- トークン入力 → タイトル/情報/タグ/本文 → 投稿

投稿後に返ってきた URL を開けば公開されてます。

---

## セキュリティ注意
- `/admin.html` には `noindex` を入れてますが、URLが漏れたら誰でも開けます。
- 投稿APIは `ADMIN_TOKEN` がないと通りません。
- トークンは **推測されない長さ** にして、使い回さないのが安全。

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

