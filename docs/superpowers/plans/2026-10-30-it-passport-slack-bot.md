# ITパスポート出題Slack Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 毎朝7時(JST)に確認済みのITパスポート問題を1問Slackへ投稿し、スタンプ回答・夜のスレッド解説返信までを自動化し、運営がブラウザで問題とキューを管理できるようにする。

**Architecture:** 単一のNode.jsプロセスが Slack Bolt(HTTPモード、ExpressReceiver)・node-cron・管理画面(Express)を同居させ、SQLiteに問題/キュー/投稿履歴を保存する。Slack呼び出しは薄いインターフェース(`SlackPort`)越しにして、出題ロジックをSlackなしでテストできるようにする。

**Tech Stack:** Node.js 22, TypeScript, `@slack/bolt`, `better-sqlite3`, `node-cron`, `express` (Bolt の receiver 共用), `google-auth-library`, `vitest`。ホスティングは永続ディスク付きの低コストVM/PaaS(Fly.io 等。SQLiteファイルを置くため)。

**Spec:** `product.txt`(フェーズ1=Task 1–7、フェーズ2=Task 8–11。フェーズ3「改善」は本計画の対象外)

## Global Constraints

- 出題時刻は毎朝7時、タイムゾーンは `Asia/Tokyo`。
- 出題対象は `status = 'confirmed'` の問題のみ(下書きは絶対に出さない)。
- 選択肢は ア〜エ の4つ。スタンプは Bot が自動で付ける(`one`/`two`/`three`/`four` = ア/イ/ウ/エ)。
- 正解・解説は出題メッセージのスレッドへ返信。返信時刻は環境変数 `EXPLAIN_TIME`(既定 `20:00`、「例:同日20時」)。
- 問題には出典(`source`)欄を持つ。
- 出題・返信の失敗は運営用チャンネル(`OPS_CHANNEL_ID`)へ通知。
- Slack権限は `chat:write`・`reactions:write` のみ(DM・個人情報は扱わない)。
- 管理画面はGoogleログイン + 許可リスト(`ADMIN_EMAILS`)のメンバーのみ。
- 出題は同日1回のみ(再起動・手動再実行しても二重投稿しない)。

## Review Focus

- 確認済み問題が0件の日: 例外で落とさず、投稿せず運営へ「ストック切れ」通知。
- プロセスが7時ちょうどに停止/再起動していた: 起動時に「今日の分が未投稿かつ7時を過ぎている」場合は追いつき投稿。ただし二重投稿はしない。
- キューに入っている問題が後から「下書き」に戻された/削除された: スキップしてランダム選択へフォールバック。
- Slackの `reactions.add` が一部失敗(レート制限など): 投稿は成功扱いで記録し、失敗を運営へ通知。
- 管理画面で同じ問題を二重にキュー登録 / 同日に複数予約: 拒否する(日付は一意)。

---

## File Structure

```
package.json, tsconfig.json, vitest.config.ts, .env.example
src/config.ts            環境変数の読み込みと検証
src/db.ts                SQLite接続とスキーマ作成
src/questions.ts         問題のCRUD・状態遷移
src/queue.ts             出題予定キュー
src/selector.ts          今日の問題を選ぶ
src/format.ts            Slackメッセージ組み立て(純粋関数)
src/slack-port.ts        SlackPort インターフェースと Bolt 実装
src/daily.ts             postDailyQuestion / postExplanation / catchUp
src/scheduler.ts         cron登録(出題・解説・ストック警告)
src/admin/auth.ts        Googleログイン + 許可リスト
src/admin/routes.ts      管理画面API/HTML
src/index.ts             エントリポイント
scripts/import-questions.ts   JSON→draft問題の取り込み
scripts/pdf-to-json.ts        IPA PDF→JSON(Claude API)
docs/runbook.md          手順書・停止方法
tests/*.test.ts
```

---

### Task 1: プロジェクト雛形・設定・DB

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `src/config.ts`, `src/db.ts`
- Test: `tests/db.test.ts`, `tests/config.test.ts`

**Interfaces:**
- Produces:
  - `loadConfig(env: NodeJS.ProcessEnv): Config` — `Config = { slackBotToken, slackSigningSecret, quizChannelId, opsChannelId, explainTime: string /* "HH:mm" */, adminEmails: string[], googleClientId, googleClientSecret, baseUrl, dbPath, sessionSecret }`。必須変数が欠けたら変数名を含む `Error`。
  - `openDb(path: string): Database`(`:memory:` 可)。テーブル: `questions(id INTEGER PK, body TEXT, choices TEXT /*JSON 長さ4*/, answer INTEGER /*0-3*/, explanation TEXT, source TEXT, category TEXT, status TEXT CHECK IN ('draft','confirmed'), created_at, updated_at)`、`queue(id PK, question_id FK, scheduled_date TEXT UNIQUE /*YYYY-MM-DD*/)`、`posts(id PK, question_id FK, channel TEXT, ts TEXT, posted_date TEXT UNIQUE, explained_at TEXT NULL)`。

- [ ] **Step 1: Write the failing tests** — `loadConfig` が `OPS_CHANNEL_ID` 欠落でそのキー名を含むエラーを投げる / `EXPLAIN_TIME` 未指定で `"20:00"` / `openDb(':memory:')` 後に3テーブルが存在し、`status='x'` の挿入が失敗する。
- [ ] **Step 2: Run** `npx vitest run tests/db.test.ts tests/config.test.ts` — Expected: FAIL(モジュール未定義)
- [ ] **Step 3: 雛形と上記2モジュールを実装**(`"type": "module"`, scripts: `dev`/`build`/`test`/`start`)
- [ ] **Step 4: Run** 同コマンド — Expected: PASS
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: project scaffold, config, sqlite schema"`

### Task 2: 問題リポジトリ

**Files:** Create `src/questions.ts` / Test `tests/questions.test.ts`

**Interfaces:**
- Consumes: `openDb`
- Produces: `type Question = { id, body, choices: [string,string,string,string], answer: 0|1|2|3, explanation, source, category, status: 'draft'|'confirmed' }`
  - `createQuestion(db, input: Omit<Question,'id'|'status'>): Question`(常に `draft`)
  - `updateQuestion(db, id, patch: Partial<Omit<Question,'id'>>): Question`
  - `setStatus(db, id, status): void` — `confirmed` にするとき `source` が空なら `Error`
  - `listQuestions(db, filter?: { status?: Status }): Question[]`

- [ ] **Step 1: Write the failing tests** — 作成直後は `draft` / 選択肢が4つでないと拒否 / `answer=4` を拒否 / `source=''` で `setStatus('confirmed')` が拒否 / 内容を更新すると `updated_at` が進む。
- [ ] **Step 2: Run** `npx vitest run tests/questions.test.ts` — FAIL
- [ ] **Step 3: Implement** 上記4関数(入力検証はここに集約し、API層で重複させない)
- [ ] **Step 4: Run** — PASS
- [ ] **Step 5: Commit** `feat: question repository with draft/confirmed status`

### Task 3: キューと出題選択

**Files:** Create `src/queue.ts`, `src/selector.ts` / Test `tests/selector.test.ts`

**Interfaces:**
- Produces:
  - `enqueue(db, questionId: number, date: string): void` — 同日の既存予約があれば `Error`、`confirmed` でない問題も `Error`
  - `listQueue(db, from: string): { id, date, question }[]`
  - `pickToday(db, date: string, rng?: () => number): Question | null`

- [ ] **Step 1: Write the failing tests**
  - 今日の日付にキューがあればその問題を返す
  - キューの問題が `draft` に戻っていたら無視してランダム選択へフォールバック(Review Focus)
  - ランダム時は `posts` に履歴のある問題を除外し、`draft` も除外。`rng` 固定で決定的
  - 確認済みが0件、または全て出題済みなら `null`
  - 同日二重 `enqueue` は失敗
- [ ] **Step 2: Run** `npx vitest run tests/selector.test.ts` — FAIL
- [ ] **Step 3: Implement** 上記関数
- [ ] **Step 4: Run** — PASS
- [ ] **Step 5: Commit** `feat: queue and daily question selection`

### Task 4: メッセージ整形

**Files:** Create `src/format.ts` / Test `tests/format.test.ts`

**Interfaces:**
- Produces:
  - `REACTIONS = ['one','two','three','four'] as const`
  - `formatQuestion(q: Question, date: string): { text: string; blocks: unknown[] }` — 本文と `ア. … イ. … ウ. … エ. …` を表示し、各選択肢の横にスタンプ対応を明記
  - `formatExplanation(q: Question): { text: string; blocks: unknown[] }` — 「正解: ウ」+ 解説 + `出典: {source}`
  - `choiceLabel(i: 0|1|2|3): 'ア'|'イ'|'ウ'|'エ'`

- [ ] **Step 1: Write the failing tests** — `answer=2` の解説に「正解: ウ」と出典が含まれる / 問題文に4選択肢すべてが含まれる / Slackのmrkdwn特殊文字(`&`,`<`,`>`)がエスケープされる。
- [ ] **Step 2–4:** 実装し PASS を確認(`npx vitest run tests/format.test.ts`)
- [ ] **Step 5: Commit** `feat: slack message formatting`

### Task 5: 毎朝の出題

**Files:** Create `src/slack-port.ts`, `src/daily.ts` / Test `tests/daily.test.ts`(FakeSlackPort 使用)

**Interfaces:**
- Produces:
  - `interface SlackPort { postMessage(channel, msg): Promise<{ts: string}>; addReaction(channel, ts, name): Promise<void>; replyInThread(channel, ts, msg): Promise<void>; notifyOps(text): Promise<void> }`
  - `boltSlackPort(client: WebClient, cfg: Config): SlackPort`
  - `postDailyQuestion(deps: {db, slack: SlackPort, cfg: Config}, date: string): Promise<'posted'|'already'|'no-stock'|'failed'>`

- [ ] **Step 1: Write the failing tests**
  - 正常系: 1回 `postMessage`、4つの `addReaction`(one→four の順)、`posts` に記録、`'posted'`
  - 同じ日付で2回呼ぶと2回目は `'already'` で投稿されない
  - 在庫なし: 投稿せず `notifyOps` が呼ばれ `'no-stock'`
  - `postMessage` が例外: `notifyOps` が呼ばれ `'failed'`、`posts` に何も残らない
  - `addReaction` が2件目で例外: 投稿は記録され `'posted'`、`notifyOps` が呼ばれる
- [ ] **Step 2: Run** `npx vitest run tests/daily.test.ts` — FAIL
- [ ] **Step 3: Implement.** 投稿成功直後に `posts` へINSERT(UNIQUE `posted_date` が二重投稿の最終防壁)。スタンプ付与は個別 try/catch。
- [ ] **Step 4: Run** — PASS
- [ ] **Step 5: Commit** `feat: daily question posting`

### Task 6: 解説返信

**Files:** Modify `src/daily.ts` / Test `tests/daily.test.ts`

**Interfaces:**
- Produces: `postExplanation(deps, date: string): Promise<'replied'|'already'|'no-post'|'failed'>`

- [ ] **Step 1: Write the failing tests** — 投稿済みの日に1回だけスレッド(`ts`)へ返信し `explained_at` が入る / 2回目は `'already'` / その日の投稿がなければ `'no-post'`(エラー通知はしない) / 返信失敗で `notifyOps` と `'failed'`、`explained_at` は未設定のまま(再試行可)。
- [ ] **Step 2–4:** 実装(`posts` と `questions` を結合して `formatExplanation`)、PASS確認
- [ ] **Step 5: Commit** `feat: threaded explanation reply`

### Task 7: スケジューラ・起動時追いつき・エントリポイント

**Files:** Create `src/scheduler.ts`, `src/index.ts` / Test `tests/scheduler.test.ts`

**Interfaces:**
- Produces:
  - `jstDate(now: Date): string`(`YYYY-MM-DD`、JST基準)
  - `catchUp(deps, now: Date): Promise<void>` — JST 7:00 以降で今日の出題が未実施なら `postDailyQuestion`、`EXPLAIN_TIME` 以降で未解説なら `postExplanation`
  - `startScheduler(deps): { stop(): void }` — `0 7 * * *` と `EXPLAIN_TIME` の cron(いずれも `Asia/Tokyo`)、毎朝の出題後に確認済み未出題が `LOW_STOCK_THRESHOLD`(既定5)以下なら `notifyOps`

- [ ] **Step 1: Write the failing tests** — `jstDate` が UTC 22:00 を翌日に変換 / `catchUp` を JST 6:59 で呼んでも投稿しない / 7:01 で未投稿なら投稿、投稿済みなら何もしない(Review Focus) / 在庫が閾値以下の出題後に警告通知。
- [ ] **Step 2–3:** 実装。`index.ts` は Bolt(ExpressReceiver, HTTPモード)起動 → `catchUp` → `startScheduler`
- [ ] **Step 4: Run** `npx vitest run` — 全PASS
- [ ] **Step 5: Manual verify(フェーズ1完了条件):** テスト用ワークスペース/チャンネルで `EXPLAIN_TIME` を数分後に設定して起動し、投稿・スタンプ4つ・スレッド返信を目視確認
- [ ] **Step 6: Commit** `feat: scheduler with startup catch-up`

### Task 8: 初期問題の取り込み

**Files:** Create `scripts/pdf-to-json.ts`, `scripts/import-questions.ts` / Test `tests/import.test.ts`

**Interfaces:**
- Produces:
  - `importQuestions(db, json: unknown): { imported: number; errors: {index: number; message: string}[] }` — 全件 `draft`、不正な1件は他を巻き込まず `errors` に記録
  - `scripts/pdf-to-json.ts <pdf> <out.json>` — IPA公開PDFをClaude APIで `{body, choices, answer, explanation, source, category}[]` に変換(モデルIDは `claude-sonnet-5-5`、`source` に回次を必ず入れる)

- [ ] **Step 1: Write the failing tests** — 有効2件+選択肢3つの不正1件 → `imported=2`、`errors[0].index=2` / 取り込み後はすべて `draft` / 同一 `body` の再取り込みは重複させない。
- [ ] **Step 2–4:** 実装し PASS
- [ ] **Step 5: Manual:** PDF→JSON を実行し、運営と著作権・利用条件を確認(企画書リスク欄)したうえで30問程度を取り込む
- [ ] **Step 6: Commit** `feat: question import scripts`

### Task 9: 管理画面の認証

**Files:** Create `src/admin/auth.ts` / Test `tests/auth.test.ts`

**Interfaces:**
- Produces: `isAllowed(email: string, cfg: Config): boolean`(大文字小文字無視)、`requireAdmin: express.RequestHandler`(未ログインは `/admin/login` へ、許可外は403)、`GET /admin/login`・`/admin/callback`(Google OIDC、`email_verified` 必須、署名付きCookieセッション)

- [ ] **Step 1: Write the failing tests** — `isAllowed('A@x.jp')` が `ADMIN_EMAILS=a@x.jp` で真 / 許可外は偽 / `requireAdmin` が未ログインで302、許可外セッションで403、許可内で `next()`。
- [ ] **Step 2–4:** 実装し PASS
- [ ] **Step 5: Commit** `feat: admin google login with allowlist`

### Task 10: 管理画面(問題・キュー)

**Files:** Create `src/admin/routes.ts`, `src/admin/views/*.html` / Test `tests/admin-routes.test.ts`(supertest)

**Interfaces:**
- Consumes: Task 2/3 の関数、`requireAdmin`
- Produces(すべて `requireAdmin` 配下): `GET /admin/questions`、`POST /admin/questions`、`POST /admin/questions/:id`(修正)、`POST /admin/questions/:id/status`、`GET /admin/queue`、`POST /admin/queue`(`{questionId, date}`)、`POST /admin/queue/:id/delete`

- [ ] **Step 1: Write the failing tests** — 未認証は全ルートで302 / 問題作成→一覧に `draft` で出る / `source` 空での確認済み化は400 / `draft` 問題のキュー登録は400 / 同日二重登録は409。
- [ ] **Step 2–4:** 実装(HTMLはサーバーレンダリングの簡素なフォーム。状態変更POSTにはCSRFトークン)、PASS
- [ ] **Step 5: Manual:** ブラウザで Googleログイン → 問題追加 → 確認済み化 → 翌日分のキュー登録 → 翌朝その問題が出ることを確認
- [ ] **Step 6: Commit** `feat: admin UI for questions and queue`

### Task 11: 手動出題・運用手順書・デプロイ

**Files:** Create `docs/runbook.md`; Modify `src/admin/routes.ts`

**Interfaces:**
- Produces: `POST /admin/post-now`(今日の分を `postDailyQuestion` で手動実行。既に投稿済みなら 409)

- [ ] **Step 1: Write the failing test** — 未投稿なら200で投稿、投稿済みなら409。
- [ ] **Step 2–4:** 実装し PASS
- [ ] **Step 5:** `docs/runbook.md` に記載: 必要な環境変数、Slackアプリ作成手順と権限(`chat:write`, `reactions:write`)、デプロイ手順、SQLiteのバックアップ、緊急停止方法(`scripts`ではなくホスティング側の停止手順と `post-now` による手動出題)、運営への引き継ぎ
- [ ] **Step 6: Deploy** ホスティングにデプロイし、永続ディスクにDBが残ることを再起動で確認、本番チャンネルで運用開始
- [ ] **Step 7: Commit** `feat: manual post trigger and runbook`

---

## Self-Review

- **Spec coverage:** 自動出題=T3/5/7、スタンプ=T4/5、解説返信=T6、管理画面=T9/10、下書き/確認済み・出典=T2、運営通知・ストック警告=T5/7、初期問題投入=T8、手順書・手動出題=T11。評価指標のうち「回答者数・正答率」の集計はフェーズ3(対象外)。
- **未決事項(計画側で既定値を置いたもの):** ホスティング先、`EXPLAIN_TIME=20:00`、スタンプ絵文字(`one`〜`four`)。運営との合意後に環境変数/定数のみで変更可能。
- **Type consistency:** `Question`, `SlackPort`, `Config`, `postDailyQuestion`/`postExplanation` のシグネチャはタスク間で一致。
