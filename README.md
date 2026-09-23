# youtube-analytics

YouTube の実績と週次の事業ファネルをつなぎ、目標差が最も大きい改善候補と次の打ち手を判断するための Web システムです。インプレッション、CTR、加重平均視聴率、導線誘導率、問い合わせから成約への転換率を原因指標として追い、売上・成約数を結果指標、登録者数を参考の結果指標として分けて扱います。これは因果推論ではなく、週次データと設定目標の比較です。

## 現況

- 要件・技術仕様は確定済みです。最初の feature `feat-platform-tenant-auth`（Google ログイン、テナント、招待、役割、CI/CD の土台）を実装済みで、ローカルで受入 A1〜A5 が合格、A6 はワークフローの静的検査が合格です（`docs/feat-platform-tenant-auth/acceptance.md`）。
- `feat-platform-tenant-auth` の 13 task（`SYS-PTA-P01`〜`P13`）は作業ツリー上で実施済みで、未コミットです。Beads（`yta-c8g.1`〜`.13`）は PR が main へ merge された時点で close します。preview 環境と GitHub Actions の実行確認は、初回 deploy の後に行います。
- 業務機能（YouTube 収集、CSV と画像の取込、分析レポート、業務画面、保持期間の運用）の 5 feature は未着手です。
- 週次事業ファネルと分析履歴の追補は、対象3 featureのtask計画前に dev-graph compile / decompose で digest とstate graphを再同期します。必要なgateは `eval-log/dev-graph-resync-required-20260922.json` に固定しています。

## セットアップ

前提: Node 22（`.node-version`）、pnpm 10。

```bash
pnpm install
cp .dev.vars.example .dev.vars   # TOKEN_ENC_KEY などを記入する（コミットしない）
pnpm db:migrate:local            # ローカル D1 にテーブルを作る
pnpm db:seed:local               # ローカル画面テスト用のアカウントとテナントを入れる
pnpm dev                         # http://localhost:8791
```

| 目的 | コマンド |
|---|---|
| 静的検査 | `pnpm lint && pnpm typecheck` |
| API の結合テスト（Workers ランタイム上） | `pnpm test` |
| 画面の E2E（3 サイズ） | `pnpm e2e` |
| 画面の再ビルド（`pnpm dev` の起動中に画面を変えたとき） | `pnpm build:web` |
| 構成の確認（deploy の dry-run） | `pnpm build` |

- `.dev.vars` に `DEV_LOGIN=1` を入れると、localhost に限り、メールアドレスだけでログインできる「開発用ログイン」が使えます。テストアカウントと画面テストの流れは `docs/feat-platform-tenant-auth/runbook.md` の 5 節を参照してください。
- 公開までに利用者が手で行う設定は、まず `docs/setup/README.md`（入口。作業一覧と現在の状態）を開いてください。1 手順ずつの詳細は `docs/setup/owner-manual-setup.mdx` にあります。
- Cloudflare の資源作成、Google OAuth クライアント、Secrets の登録、preview（本番）環境の構築と運用は `docs/feat-platform-tenant-auth/runbook.md`、開発環境の現況は `docs/setup/environment.md` にあります。

## リポジトリの見方

| 区分 | 場所 | 役割 |
|---|---|---|
| 正本 | `system-spec/` | 上位要件と技術章。仕様変更はここから始める |
| 集約・分解 | `specs/` `architecture/` `features/` | 正本から生成・要約された仕様、構成、feature |
| 実行計画 | `.dev-graph/published/` `tasks/` | 公開 package と実行登録用 task。source_lineage で対応付ける |
| AIDD 編集原本 | `aidd-agent-kit/` | Skill・agent・installer の編集元 |
| project runtime | `.claude/` `.agents/` `.codex/` | 編集原本から manifest 付きで同期された実行時配置 |
| 履歴・証跡 | `eval-log/` `.dev-graph/state/` | 評価、生成、登録、同期の追跡記録 |
| 引き渡し記録 | `docs/delivery/` | PR 単位の変更内容・task と Beads の対応・残課題 |

公開 package と `tasks/`、AIDD編集原本とruntimeは、同じ内容を異なる責務で保持する意図的な投影です。重複して見えても直接編集・物理削除せず、正本と同期手順から更新します。

## 注意

OAuth クライアントシークレットやトークンなどの認証情報はコミットしません（`.env` などは `.gitignore` 済み）。
