# feat-settings-channel-link 最終レビュー（SYS-SCL-P13）

最終更新: 2026-09-24。`features/feat-settings-channel-link.context.json` の scope_in を、変更したファイルに対応付ける。

## 1. scope_in とファイルの対応

| # | scope_in | 主なファイル |
|---|---|---|
| S1 | 参照画像の5カードにメンバー管理を4番目に加えた6区画を指定順で作る | `web/pages/SettingsPage.tsx`、`web/pages/settings/*.tsx` |
| S2 | YouTube チャンネルの連携、候補の選択、再連携、解除 | `src/usecases/youtube.ts`、`src/adapters/google-youtube.ts`、`src/http/settings-routes.ts`、`web/pages/settings/YouTubeSection.tsx` |
| S3 | 字幕の自動取得（force-ssl の追加と revoke、機能フラグ） | `src/usecases/youtube.ts`、`src/env.ts`、`wrangler.toml`、`.dev.vars.example` |
| S4 | データ取込の履歴と R2 への保存、CSV の取得元リンク（利用者の追加要望） | `src/usecases/imports.ts`、`web/pages/settings/ImportSection.tsx`、`web/youtube-studio.ts`、`web/components/DropZone.tsx` |
| S5 | Claude Code 連携トークン（名前、5本、1回だけ表示） | `src/usecases/skill-tokens.ts`、`web/pages/settings/TokenSection.tsx` |
| S6 | 実測できる無料枠の使用状況（70% / 90%、1時間キャッシュ）。未計測の3行は「未取得」 | `src/usecases/usage.ts`、`src/adapters/cf-analytics.ts`、`web/components/UsageBar.tsx` |
| S7 | データの削除予約 | `src/usecases/settings.ts`、`web/pages/settings/DeleteSection.tsx` |
| S8 | 共通の AppShell、Header、Footer と部品 | `web/pages/Shell.tsx`、`web/components/*`（AppShell、PublicLayout、SiteFooter ほか）、`web/main.tsx`、`public/privacy.html`、`public/terms.html`、`web/styles.css` |
| S9 | 監査と CSRF | `src/http/middleware.ts`、`src/usecases/*`（`audit()`） |
| S10 | テーブルと削除待ち中の連携確定ガード | `migrations/0004_settings_channel_link.sql`、`migrations/0006_channel_deletion_gate.sql` |
| S11 | テストと証跡 | `tests/settings/*`、`e2e/settings.spec.ts`、`e2e/smoke.spec.ts`、`e2e/shell-state.spec.ts`、`playwright.config.ts`、`scripts/seed-local.sql`、`evidence/feat-settings-channel-link/*` |
| S13 | （qa-087）テナントごとの Google Cloud クライアント | `migrations/0005_tenant_google_client.sql`、`src/usecases/google-client.ts`、`src/repositories/settings-repository.ts`、`src/adapters/google-youtube.ts`、`src/lib/errors.ts`、`src/http/settings-routes.ts`、`web/pages/settings/GoogleClientPanel.tsx`、`web/pages/settings/YouTubeSection.tsx`、`tests/settings/google-client.test.ts` |
| S12 | 文書と仕様の投影 | `docs/feat-settings-channel-link/*`、`README.md`、`system-spec/frontend.md`（qa-061 の節を承認付きで戻した）、`system-spec/spec-state.json`（reopen → 同じ根拠で再確定。reopen_log に記録） |

## 2. scope_out を守ったこと

- 収集ジョブ、CSV の解析、スキル API、削除の実行には手を入れていない（テーブル、定数、予約だけを用意した）。
- 新しい色トークンは足していない。
- deploy はしていない。commit・push・draft PR までを行い、Beads のタスク（`yta-rh8` と `.1`〜`.13`）は main へのマージまで open のまま（PR のマージゲートを付ける）。

## 3. 残した事項

| 事項 | 扱い |
|---|---|
| `web/components/ShellFrame.tsx` がどこからも使われていない | AppShell への置換後に参照が0件であることを確認し、削除済み |
| check:repo | 解消済み（qa-report.md 3 節）。恒久策は harness 側の改修で、コンパイラに「現行技術決定」を出す機能を足す。そうすれば手作業の追補が要らなくなる |
| CSV 取得元リンクの仕様への反映 | system-spec には未記載（qa-report.md 3b 節）。次の仕様追補で書き足す |
| TODO(human) | 利用者から「全部完了させる」と指示があったため、作っていない |
| preview での確認 | deploy 後に acceptance.md の preview 列を埋める |
| 本番の既存テナント（qa-087） | deploy 後は、各テナントのオーナーが接続情報を登録するまで、再連携と字幕の設定ができない。保存済みトークンの更新にも登録したクライアントが要るので、deploy 前にオーナーへ案内する |
| 利用者向けの表記と準備手順（qa-088） | 画面・API エラー・規約の「テナント」を「ワークスペース」に変え、設定画面に Google Cloud の準備手順を追加。仕様へ正規フローで反映済み（eval-log/spec-reflection-receipt-feat-settings-channel-link-20260924.json）。DB に保存済みの名前（例「○○のテナント」）はデータなので変えていない |
| 仕様評価の深さ | MVP のため qa-087/qa-088 の追補は決定論ゲートだけで確認し、fork evaluator は再実行していない（r4 に明記） |
