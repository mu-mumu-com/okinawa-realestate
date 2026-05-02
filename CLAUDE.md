# 沖縄不動産 新着まとめ

## プロジェクト概要

沖縄の不動産情報サイト（アットホーム・HOME'S・SUUMO・健美家）から届くメール通知を自動収集し、一覧表示するダッシュボード。

## 技術構成

| 役割 | 技術 | URL |
|------|------|-----|
| フロントエンド | 静的HTML（Vercel） | https://okinawa-realestate.vercel.app |
| API サーバー | Node.js / Express（Railway） | https://okinawa-realestate-production.up.railway.app |
| データベース | Supabase（テーブル：properties） | - |
| メール取得 | Gmail IMAP（mail.js） | - |
| GitHub | mu-mumu-com/okinawa-realestate | - |

## ファイル構成

```
index.js          - Expressサーバー（APIエンドポイント・認証・古いデータ自動削除cron）
mail.js           - Gmail IMAPでメール取得→Supabaseに保存（単体実行スクリプト）
crypto-utils.js   - AES-256-GCM暗号化ユーティリティ（Gmailパスワード暗号化用）
check.js          - デバッグ用スクリプト
public/
  index.html      - フロントエンド（ログイン・フィルター・物件一覧・お気に入り・成約管理）
```

## 環境変数

```
SUPABASE_URL        - SupabaseプロジェクトのURL
SUPABASE_KEY        - Supabaseのanonキー
SUPABASE_SERVICE_KEY - SupabaseのServiceキー（RLSバイパス用）
ENCRYPTION_KEY      - Gmailパスワード暗号化キー（64文字hex）※RailwayのExpressとCron両方に設定必須
```

## 完成している機能

- 物件一覧表示（サイト別バッジ・価格・住所・日付）
- フィルター（状態・サイト・日付）
- お気に入り登録
- 成約済みマーク・解除
- 新着取得ボタン（手動でmail.jsを実行、5分レート制限あり）
- 古いデータ自動削除（1ヶ月以上経過したものを毎日JST 01:00に削除）
- Railway Cronジョブ（毎朝JST 08:00にmail.jsを自動実行）
- Supabase Auth（メール/パスワード・Googleログイン・パスワードリセット）
- マルチテナント（ユーザーごとにGmail設定・物件データを分離、RLS）
- Gmailアプリパスワードの暗号化保存（AES-256-GCM）
- セキュリティ対策（XSS対策・CORS制限・TLS有効・入力バリデーション）
- モバイルレスポンシブ対応
- カスタムSMTP（Resend経由でパスワードリセットメール送信）

## 対応サイト（mail.js）

| サイト | 判定条件 | 解析内容 |
|--------|----------|----------|
| アットホーム | fromにathome | ブロック単位で物件を分割 |
| HOME'S | fromにhomes/lifull | 件名から価格・タイトル抽出 |
| SUUMO | fromにsuumo/recruit | HTMLからリンク・価格・住所抽出 |
| 健美家 | fromにkenbiya | 件名から物件名・価格抽出 |

## Railway構成

- **沖縄不動産**：Expressサーバー（常時起動）
- **詩的な全体性**：Cronジョブ（`node mail.js`、スケジュール：`0 23 * * *` UTC = JST 08:00）

## タスク

| 状態 | タスク |
|------|--------|
| ✅ 完了 | Railway Cronジョブで毎朝mail.jsを自動実行 |
| ✅ 完了 | ログイン機能（Supabase Auth・Google OAuth・パスワードリセット） |
| ✅ 完了 | マルチテナント対応（ユーザーごとのGmail設定・RLS） |
| ✅ 完了 | セキュリティ強化（XSS・CORS・TLS・暗号化・レート制限） |
| ✅ 完了 | モバイルレスポンシブ対応 |
| ⬜ 未着手 | Stripe決済 |
| ⬜ 未着手 | グーホーム・うちなーらいふ対応 |

## 注意点

- `mail.js`は最新50件のメールを取得する。取得後`process.exit()`で終了する設計。
- `index.js`のcron（UTC 16:00）はSupabaseから直接削除するため、Railway環境変数が必須。
- フロントエンドのAPIのURLはハードコードされている（`okinawa-realestate-production.up.railway.app`）。
- RailwayのタイムゾーンはUTCのため、JST 08:00 = UTC 23:00（`0 23 * * *`）。
- `ENCRYPTION_KEY`はRailwayのExpressサービスとCronサービス両方に設定が必要。
- GmailパスワードはAES-256-GCMで暗号化して保存。移行期は平文フォールバックあり（再保存で暗号化）。
- Google OAuth同意画面は「外部」・テスト中のため、テストユーザーの追加が必要な場合あり。
- カスタムSMTPはGmail（smtp.gmail.com:587）を使用。Resendは無料プランで送信制限あり。
- パスワードリセットリンクのURLハッシュに`type=recovery`が含まれる場合、自動ログインをスキップしてパスワード設定画面を表示する。
