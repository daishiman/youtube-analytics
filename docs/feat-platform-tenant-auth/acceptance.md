# feat-platform-tenant-auth 受入確認（SYS-PTA-P07）

最終更新: 2026-09-22。確認環境は **ローカル**（`wrangler dev`、http://localhost:8791、ローカル D1 に `scripts/seed-local.sql` を投入）。

> **preview 環境（workers.dev と本物の Google OAuth）での確認は未実施。** この作業では commit、push、deploy を行わない約束のため、preview 環境を作れない。初回 deploy 後に、本書 3 節の手順を preview 環境でもう一度実施し、結果の列を埋める。

## 1. 受入6項目の結果

| # | 受入項目 | 自動テスト | ローカルの画面と API 確認 | 判定（ローカル） | preview |
|---|---|---|---|---|---|
| A1 | 未ログインで `/api/*` は 401 | 18 件成功（a1） | `curl -s localhost:8791/api/me` → 401 `UNAUTHENTICATED`。E2E「未ログインで保護画面を開くとログイン画面へ戻る」が 3 サイズで成功 | 合格 | 未実施 |
| A2 | 初回ログインで tenants と owner が1組だけ | 4 + 1 件成功（a2、auth-flow） | E2E で新規メールの初回ログイン → 「あなたの役割: オーナー」を表示。seed テストで 2 回目のログインは `existing` | 合格 | 未実施 |
| A3 | viewer の書込は 403、他テナントは 404 | 19 件成功（a3）、routes-coverage 成功 | E2E で viewer@example.com の設定画面に「外す」と招待欄が出ない（3 サイズ）。API の 403 と 404 は自動テストで網羅 | 合格 | 未実施 |
| A4 | 招待を別アカウントで開くと参加できない | 12 件成功（a4） | E2E（desktop）: owner が招待を発行 → 別アカウントで開くと「招待されたメールアドレスと異なるアカウントです」→ 本人でログインし直すと「あなたの役割: 編集者」 | 合格 | 未実施 |
| A5 | MAX_TENANTS で受付停止 | 5 件成功（a5） | 手順 3.5 で確認できる（`.dev.vars` に `MAX_TENANTS=2` を入れて再起動）。自動テストで同時ログインも確認済み | 合格（自動テスト） | 未実施 |
| A6 | main への push で migrate と deploy | 4 件成功（a6、ワークフローの静的検査） | push していないため **Actions の実行は未確認** | 静的検査のみ合格 | 未実施 |

**ローカルでの判定: A1〜A5 は合格。A6 は静的検査だけ合格で、実行の確認は初回 push 後に行う。**

## 2. 証跡

| 種類 | ファイル |
|---|---|
| 単体と結合テスト（76 件、verbose） | `evidence/P06-test-run.txt` |
| E2E（3 サイズ、13 成功と 2 件の意図的なスキップ） | `evidence/P07-e2e-run.txt` |
| 構成の dry-run | `evidence/P02-build-dry-run.txt` |
| マイグレーション（空の DB に適用、2 回目は差分なし） | `evidence/P08-migration-empty-db.txt` |
| 品質（lint、型、audit） | `evidence/P09-*.txt` |

## 3. 手動確認の手順（ローカルと preview で共通）

テストアカウントと起動手順は runbook.md の 5 節を参照。preview では「開発用ログイン」の代わりに本物の Google アカウントを2つ使う。

1. **A1**: ログアウト状態で `/settings` を開く → `/login` に戻る。`/api/me` を直接開く → `{"error":{"code":"UNAUTHENTICATED",…}}`。
2. **A2**: 同意にチェック → 未使用のメール（preview では未登録の Google アカウント）でログイン → ダッシュボードに「あなたの役割: オーナー」。ログアウトして同じアカウントで再ログインしても、テナント切替の選択肢は増えない。
3. **A3**: viewer@example.com でログイン → 設定画面に「外す」ボタンと「メンバーを招待」が出ない。owner@example.com でテナント切替を「別チャンネルB（閲覧者）」にすると、同様に出ない。
4. **A4**: owner で設定 → 招待するメールを入力 → 「招待リンクを発行」→ リンクをコピー → ログアウト → リンクを開いて別のメールでログイン → 拒否の文言が出る → 「別のアカウントでログインし直す」→ 招待したメールでログイン → 参加できる。同じリンクをもう一度開くと「この招待リンクは使えません」。
5. **A5**: `.dev.vars` に `MAX_TENANTS=2` を追記して `pnpm dev` を再起動する（seed だけでテナントが 2 件あるため、上限に達した状態になる）→ 未使用のメールで初回ログイン → 「現在新規の受付を停止しています。既存テナントのオーナーから招待を受けてください。」が出る。確認後は行を消して再起動する。
6. **A6**: PR を作ると `ci` の check と e2e が走る → main へ merge すると `deploy` が `pnpm db:migrate:remote` → `pnpm run deploy` の順で成功する（Actions のログで確認）。
