# feat-ai-analysis-screen 運用手順（SYS-AIA-P12）

最終更新: 2026-09-25。基盤（Cloudflare の資源、Secrets）は `docs/feat-platform-tenant-auth/runbook.md`、連携トークンの発行は `docs/feat-settings-channel-link/runbook.md` を先に済ませておく。本書は AI分析画面で増えた作業だけを書く。

## 1. ふだんの流れ

1. **依頼する**: /analysis の①依頼で期間（最新28日・90日・1年・任意）を選び、必要なら補足指示（1000字まで）を書く。
2. **プロンプトをコピー**: 『Claude Code用プロンプトをコピー』を押すと、依頼 `A-xxxx` が待機中で作られ、プロンプトがクリップボードに入る。コピーに失敗したときは選択状態のテキスト欄が出るので、手でコピーする。
3. **Claude Code で実行**: 端末で環境変数 `YTA_SKILL_TOKEN` に個人トークンを、`YTA_BASE_URL` にプロンプトの「環境変数: YTA_BASE_URL=…」の行が示す接続先を入れ、コピーした `/yt-analyze A-xxxx` から始まる文を貼って実行する。プロンプトにトークンは入っていない。
4. **進み具合を見る**: ②実行状況の ProgressBar が進む。待機中・実行中がある間だけ10秒ごとに取り直す（タブを隠すと止まる）。
5. **結果を取り込む**: スキルが `POST /api/skill/reports` まで済ませれば、依頼は自動で完了になる。手元に結果 JSON だけがあるときは、③レポートの『結果を取り込む』に貼る。取込先は画面に「取込先: …」と出る。
   - 選択中の依頼が待機中・実行中なら、その依頼を完了にする。
   - 依頼を選んでいない（または完了などを選んでいる）なら、完了済みの依頼を `created_via=import` で1件作る。
6. **読む・つなげる**: 詳細の『前回からの変化』から読み、改善アクションにしたいものだけチェックして『改善アクションに登録』。初期チェックは主対象だけ。登録済みは『登録済み』と出て、二重には入らない。

週次の自動実行（launchd）から来た依頼は `POST /api/skill/requests` で実行中として作られ、一覧で『自動』が付く。

## 2. 取消・再実行・アーカイブ

| 操作 | できる状態 | 結果 | 元に戻すには |
|---|---|---|---|
| キャンセル | 待機中・実行中 | 取消になる。以後そのIDへのスキルの送信（PATCH・reports）は 409 `REQUEST_CANCELED` | 取消は戻せない。『再実行』で新しい依頼を作る |
| 再実行 | 失敗・取消 | 同じ期間・補足指示で新しい ID（`retry_of` に元の ID）。元の行は変わらない | 不要なら新しい依頼をキャンセルする |
| アーカイブ | 閲覧できる版すべて | 一覧と analysis_history（次回分析の参照）から外れる。reports の行は変わらない | 『アーカイブを表示』→ 版を開く → 『元に戻す』 |

どれも編集者以上の操作で、audit_log に1行ずつ残る（`analysis.cancel`・`analysis.retry`・`report.archive`・`report.unarchive`）。取消は端末の Claude Code を止めない。動いているスキルは、進捗や結果を送る段で 409 を受ける。

## 3. ローカルで確かめる

```bash
cp .dev.vars.example .dev.vars          # 初回だけ。TOKEN_ENC_KEY を入れる
pnpm db:migrate:local                   # 初回と migration を足したとき（0013〜0015 を含む）
pnpm build:web
pnpm wrangler dev --var DEV_LOGIN:1     # 使用中のポートがあれば --port で変える
pnpm db:seed:local                      # 別の端末で。何度流しても同じ状態に戻る
```

ブラウザで `/login` を開き、規約に同意して「開発用ログイン」にメールを入れる（パスワードなし）。

| メール | テストチャンネルA での役割 | AI分析画面で見えるもの |
|---|---|---|
| owner@example.com | オーナー | 全ボタン |
| editor@example.com | 編集者 | 全ボタン（依頼・取消・再実行・取込・アーカイブ・登録） |
| viewer@example.com | 閲覧者 | 表示だけ。書込ボタンの代わりに「閲覧者は依頼を作れません」 |

seed のチャンネルAには A-0001（完了・画面）、A-0002（完了・自動）、A-0003（失敗）、A-0004（実行中）、A-0005（待機中）と、2版のレポート（7月の全体診断・8月の振り返り）がある。v1 のアクション a1 は登録済み。E2E（`pnpm e2e`）はローカル D1 を書き換えるので、終わったら `pnpm db:seed:local` を流し直す。

## 4. 障害時の切り分け

画面のエラーは `{error:{code,message,hint}}` で出る。まず code を見る。

| 症状（code） | 考えられる原因 | 確かめ方・対処 |
|---|---|---|
| スキルの送信が 409 `REQUEST_CANCELED` | その依頼が取消済み | 下の SQL で `status`・`canceled_at`・`canceled_by` を見る。audit_log の `analysis.cancel` で誰がいつ取り消したか分かる。続けるなら画面で『再実行』し、新しい ID でスキルを流す |
| 409 `REQUEST_STATE_CONFLICT` | 依頼がすでに完了・失敗 | 完了なら結果は取込済み。失敗なら `error` 列の原因を読み、『再実行』 |
| 409 `CHANNEL_NOT_CONNECTED` | チャンネル未連携 | 設定画面の YouTube連携を確認する |
| 409 `REPORT_VERSION_CONFLICT` | 取込 JSON の version が次の版番号と合わない | 詳細の版一覧で最新版を見て、version を最新+1 にする |
| 403 | 閲覧者、または発行者が閲覧者に変わったトークン | 設定画面のメンバーで役割を確認する |
| 404 `NOT_FOUND` | 別のチャンネル管理を選んでいる、ID の誤り | ヘッダーのチャンネル管理の切替を確認する |
| 413 | 取込本文が 3,500,000 bytes（`REPORT_BODY_MAX_BYTES`。スキルの送信と共通）を超えた | `report_html` の大きさを確認する |
| 422 `INVALID_REPORT_JSON` | JSON の構文か形（`src/domain/report-schema.ts` の parseReport。report_html 単体が 2,000,000 bytes を超えたときもここ）の誤り | 構文の誤りは「JSONの形式が正しくありません N行目」の行を見る。形の誤りはメッセージの括弧内に項目の場所が出る（`details.issues` に最大20件） |
| 429 `RATE_LIMITED` | 1ユーザー1分10件（画面・再実行・スキル合算）を超えた | 1分待つ |
| 進捗が動かない | スキルが PATCH を送っていない、タブが隠れている | 依頼の `progress`・`stage`・`updated_at` を見る。タブを表に戻すとすぐ取り直す |
| レポートが一覧に無い | アーカイブ済み、検索が最新200版の外 | 『アーカイブを表示』を入れる。`report_archives` を見る |

```bash
# ローカルは --local、本番は --remote
pnpm wrangler d1 execute youtube-analytics-db --remote --command \
  "SELECT request_id, status, progress, stage, error, retry_of, canceled_at, canceled_by, created_via, updated_at
     FROM analysis_requests WHERE tenant_id = '<tenant_id>' AND request_id = 'A-0012'"
pnpm wrangler d1 execute youtube-analytics-db --remote --command \
  "SELECT user_id, action, detail, at FROM audit_log WHERE tenant_id = '<tenant_id>'
     AND (action LIKE 'analysis.%' OR action LIKE 'report.%') ORDER BY at DESC LIMIT 20"
```

**アーカイブの誤操作**は画面の『元に戻す』で直す。画面が使えないときは `DELETE FROM report_archives WHERE tenant_id = '<tenant_id>' AND report_id = '<report_id>'` でも同じになる（reports の行には触れない）。

## 5. ロールバック

1. **コードを戻す**: 本 feature のマージコミットを `git revert -m 1 <マージコミット>` で打ち消す PR を作り、通常の deploy で出す。ブランチを消したり force push したりはしない。
2. **本番 D1**: migration は前進のみ。0013〜0015 はコードを戻しても残る。追加列は既定値を持ち、`report_archives` と actions の UNIQUE は旧コードからは使われないが、旧コードとの組み合わせは戻す前に preview で確かめる。データまで戻す必要があるときは、D1 の Time Travel（`pnpm wrangler d1 time-travel restore youtube-analytics-db --timestamp=<migration 前の時刻>`）を最後の手段にする。
3. **ローカル D1 を作り直す**: `wrangler dev` を止め、`.wrangler/state/v3/d1` を削除してから、`pnpm db:migrate:local` → `pnpm db:seed:local` を流す。migration の番号を付け替えた後（0008〜0010 → 0013〜0015）に古い番号で適用済みのローカル D1 が残っているときも、この手順で作り直す。
