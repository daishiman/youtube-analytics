# feat-ai-analysis-screen 設計レビュー（SYS-AIA-P03）

最終更新: 2026-09-25。依頼の状態遷移、チャンネル管理の越境、スキル連携トークン、取込 JSON、HTML レポートの表示について、脅威ごとに対策と判定を記録する。根拠章は security と backend（qa-089、qa-090、qa-091、qa-094、qa-095）。

## 脅威 × 対策 × 判定

| # | 脅威 | 対策（実装箇所） | 判定 |
|---|---|---|---|
| T1 | 取消した依頼に、実行中のスキルが結果を書き込む | `activeRequest` が取消を `REQUEST_CANCELED`（409）、完了・失敗を `REQUEST_STATE_CONFLICT`（409）で拒否する。PATCH と `POST /api/skill/reports` が同じ関数を通る | 対策済み（結合。PATCH の取消後 409 は直接のテストなし。下の残るリスク） |
| T2 | 同時操作で終端の依頼が動く | 取消の UPDATE は `status IN ('待機中','実行中')` を条件にし、0件なら 409。再実行は元の行を変えず新しい行を作る | 対策済み（結合） |
| T3 | 他チャンネル管理の依頼・レポートを ID の推測で読む・書く | リポジトリがすべての SQL で `tenant_id` を固定する。見つからなければ 404（存在の有無を漏らさない） | 対策済み（結合） |
| T4 | 閲覧者が書込 API を直接呼ぶ | ユースケースの先頭で `requirePermission(ctx, "content.write")`。画面はボタンを出さない | 対策済み（結合・E2E） |
| T5 | 閲覧者へ降格した人の古いトークンで書き込む | 役割はトークン照合のたびに `tenant_members` から読む。`POST /api/skill/requests` も content.write を要求する（qa-095） | 対策済み（PATCH・reports は降格テストあり。skill/requests は下の残るリスク） |
| T6 | 別サイトからセッションで書込を送る（CSRF） | `csrfGuard` が `/api/*` の書込に `X-Requested-With: yta` と同一オリジンの Origin・Sec-Fetch-Site を求める | 対策済み（`tests/platform/routes.ts` に分析の書込7本を登録し、`tests/settings/settings.test.ts`「Origin 不一致の書込は拒否」で 403 `CSRF_REJECTED`） |
| T7 | 依頼の大量作成で利用枠を使い切る | 画面の作成・再実行・スキルの作成で `analysis-request:${userId}` を共有し、1分10件。11件目は 429 | 対策済み（結合） |
| T8 | 巨大な取込本文で Worker を止める | `readSkillJson` が `REPORT_BODY_MAX_BYTES` を超える本文を 413 で拒否する（スキルの送信とセッション取込で共通。値は 2026-09-25 のユーザー決定で 2,000,000 から 3,500,000 bytes に変更） | 対策済み（結合） |
| T9 | 形の崩れた JSON が一部だけ保存される | `parseReport`（`src/domain/report-schema.ts`）で形を検査してから保存する。失敗したら作りかけの依頼も `deleteUnfinishedRequest` で消す。422 に行番号 | 対策済み（結合） |
| T10 | HTML レポートの中のスクリプトが画面のセッションで動く | `srcDoc` の iframe に `sandbox=""`（allow-scripts なし） | 対策済み（コード確認・E2E で表示） |
| T11 | プロンプトのコピーでトークン平文が漏れる | プロンプトは環境変数 `YTA_SKILL_TOKEN` を案内するだけで、平文を入れない。トークンは SHA-256 のハッシュだけを保存する | 対策済み（結合） |
| T12 | 検索語で LIKE の意味が変わる、重い検索になる | `%` と `_` を ESCAPE し、検索語は100字まで、対象はチャンネル管理内の最新200版まで | 対策済み（結合） |
| T13 | 同じアクションを二重に登録する | UNIQUE (tenant_id, source_report_id, source_key) と `ON CONFLICT DO NOTHING`。応答で登録済みを返す | 対策済み（結合・E2E） |
| T14 | アーカイブで版の履歴が失われる | 別表 `report_archives` に行を足すだけで、reports は追記のみのまま。元に戻すと行を消す | 対策済み（結合） |
| T15 | 操作の記録が残らない | 依頼・取消・再実行・取込・アーカイブ・解除・アクション登録で audit_log に1行ずつ | 対策済み（結合） |

high 以上の未是正は0件。

## 残るリスク

- **qa-094 の具体値**（1分10件、2,000,000 bytes、sandbox、最新200版、10秒、SHA-256）は一括で承認されたもので、値ごとの個別確認はしていない。運用で詰まったら値を見直す。取込本文の上限は 2026-09-25 のユーザー決定で 3,500,000 bytes に見直した。
- **`PATCH /api/skill/requests/:id` の取消後 409** を直接確かめるテストが無い。実装は `POST /api/skill/reports` と同じ `activeRequest` を通るが、テストで押さえるのが望ましい。
- **降格した発行者のトークンで `POST /api/skill/requests` が 403** になることの直接のテストが無い。閲覧者はトークンを発行できないため、該当テストは分岐で実質スキップされる。
- **analysis_history からのアーカイブ除外**は SQL（`NOT EXISTS report_archives`）で入っているが、テストで確かめていない。
- → 2026-09-25: 上の3点（T1・T5 の判定欄が指す隙間を含む）は、テストを足して解消した（qa-report.md 5節の Q2〜Q4）。
- 取消は以後の送信を拒否するだけで、利用者の端末で動いている Claude Code は止まらない（scope_out）。
