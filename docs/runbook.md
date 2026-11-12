# 運用手順書 — ITパスポート出題Bot

## 1. 必要な環境変数

`.env.example` を参照。すべて必須だが、`EXPLAIN_TIME`(既定 `20:00`)、`DB_PATH`(既定 `./data/i-pass.db`)、`LOW_STOCK_THRESHOLD`(既定 `5`)、`PORT`(既定 `3000`)は省略可。

| 変数 | 内容 |
| --- | --- |
| `SLACK_BOT_TOKEN` / `SLACK_SIGNING_SECRET` | Slackアプリの Bot User OAuth Token / Signing Secret |
| `QUIZ_CHANNEL_ID` | 出題チャンネル(テスト時はテスト用、本番切替時に差し替え) |
| `OPS_CHANNEL_ID` | 失敗・ストック警告の通知先(運営用) |
| `ADMIN_EMAILS` | 管理画面に入れるGoogleアカウント(カンマ区切り) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth クライアント |
| `BASE_URL` | 公開URL(例 `https://ipass.example.com`)。Cookieの `Secure` は `https://` のとき有効 |
| `SESSION_SECRET` | Cookie署名用のランダム文字列(十分長く、公開しない) |
| `ANTHROPIC_API_KEY`(任意) | 設定すると管理画面にAI機能(問題の下書き生成、解説の生成・検証)が出る。未設定なら非表示。`ANTHROPIC_MODEL` でモデル変更可(既定 `claude-sonnet-5-5`) |

## 2. Slackアプリの作成

1. 同好会ワークスペースの管理者がアプリを作成し、Bot Token Scopes に **`chat:write` と `reactions:write` のみ** を付与してインストール。
2. Botを出題チャンネルと運営用チャンネルに招待する(未参加だと投稿・スタンプ付与に失敗する)。
3. イベント購読・スラッシュコマンドは使わない。個人情報・DMは扱わない。

## 3. Google ログイン

Google Cloud Console で OAuth クライアント(ウェブ)を作成し、承認済みリダイレクトURIに `{BASE_URL}/admin/callback` を登録。`ADMIN_EMAILS` に載っていてメール確認済みのアカウントだけが入れる。

## 4. デプロイ

- Node.js 22 以上。`npm ci && npm run build && npm start`。
- SQLite ファイル(`DB_PATH`)は**再起動で消えない永続ディスク**に置くこと。再起動してもデータが残ることを必ず確認する。
- プロセスは常時1つだけ起動する(複数起動すると定時実行が重複しうる。同日の二重投稿は、Slackへ投稿する前にDBで日付を先に確保することで防ぐ(プロセス内の同時実行に有効)。複数プロセスの同時起動までは保証しないので、運用上は1つに)。
- 起動時に「今日の7時を過ぎていて未投稿なら追いつき投稿」「解説時刻を過ぎていれば返信」を自動で行う。

## 5. 初期問題の投入

```
npx tsx scripts/pdf-to-json.ts <IPA公開問題.pdf> questions.json   # ANTHROPIC_API_KEY が必要
# questions.json を人の目で確認・修正
DB_PATH=... npx tsx scripts/import-questions.ts questions.json
```

同梱のオリジナル問題(`questions/original-001.json`、60問)は `DB_PATH=... npm run import -- questions/original-001.json --default-source="オリジナル問題"` で読み込める(内容は人が確認してから)。

取り込んだ問題はすべて**下書き**。管理画面で出典を確認し「確認済みにする」と出題対象になる。過去問の利用条件は運営と事前に確認すること。

## 6. 日々の運用

- 管理画面: `{BASE_URL}/admin`。問題の追加・修正、確認済み化、出題予定(日付指定)。
- キューの日付に予約がなければ、未出題の確認済み問題からランダムに出る。
- 「今すぐ出題」ボタンで今日の分を手動出題できる(投稿済みなら何もしない)。
- AI機能(任意): 一覧の「AIで下書き生成」で分野・テーマを指定すると、オリジナル問題を**下書き**で作る。出典は空なので、人が内容と出典を確認して入力するまで確認済みにできない。編集画面の「AIで解説を生成・検証」は解説案を入力欄に入れ(未保存)、正解が怪しい場合は警告する。AIの出力は必ず人が確認すること。
- 誤りの指摘が来たら管理画面で修正する。投稿済みの解説は自動では書き換わらないので、必要なら手動で訂正する。

## 7. 通知が来たとき(運営用チャンネル)

| 通知 | 対処 |
| --- | --- |
| 出題可能な問題がありません | 問題を追加・確認済みにして「今すぐ出題」 |
| 出題の投稿に失敗 | Botがチャンネルに参加しているか・トークンを確認し、「今すぐ出題」 |
| スタンプの付与に失敗 | 投稿自体は成功。Slackのレート制限が多い。手動でスタンプを足すか放置 |
| 解説の返信に失敗 | 原因解消後、翌日までに手動で返信(自動再試行はしない) |
| 残りが N 問 | 問題を追加する |

## 8. 緊急停止・引き継ぎ

- **停止**: ホスティング側でプロセス(またはアプリ)を停止する。停止中は出題されない。再開後の追いつき投稿は「当日7時以降・未投稿」の場合のみ。
- **手動運用に切り替える**: 停止したうえで、Slackに直接投稿する。
- **バックアップ**: 第9節の `deploy/backup.sh` で日次スナップショットを取る。
- **引き継ぎ**: ソースコード、この手順書、環境変数一覧、Slack/Google/ホスティングの管理者アカウントを運営と共有しておく。

## 9. 自宅Ubuntuサーバーへのデプロイ

Vercel等のサーバーレスは常駐プロセスとローカルSQLiteを前提とする本Botに向かないため、常駐できるサーバーに置く。Slackへは外向きの通信だけなので、Slack用のポート開放は不要。

1. Node.js 22 以上と `sqlite3` を入れる(`apt install sqlite3`)。専用ユーザーを作る: `sudo useradd -r -m -s /usr/sbin/nologin ipass`。
2. `/opt/i-pass` にソースを置き、`npm ci && npm run build` を実行。`sudo mkdir -p /var/lib/i-pass && sudo chown ipass: /var/lib/i-pass`。
3. `/etc/i-pass.env` に環境変数(第1節)を `KEY=value` で書く。`DB_PATH=/var/lib/i-pass/i-pass.db`、`chmod 600`、所有者は root。
4. `sudo cp deploy/i-pass.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now i-pass`。ログは `journalctl -u i-pass -f`。
5. **管理画面の公開**: Googleのリダイレクト先に `https://` のURLが必要(`localhost` 以外のhttpは不可)。Cloudflare Tunnel か Tailscale Funnel で `localhost:3000` を公開し、そのURLを `BASE_URL` に設定する(Google側の承認済みリダイレクトURIは `{BASE_URL}/admin/callback`)。
6. **バックアップ**: `deploy/backup.sh` を日次で実行する(例: `0 3 * * * /opt/i-pass/deploy/backup.sh`)。別ディスクや別マシンへもコピーすること。
7. 更新: `git pull && npm ci && npm run build && sudo systemctl restart i-pass`。再起動時は起動時追いつきが働く(第4節)。
