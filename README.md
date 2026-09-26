# youtube-analytics

YouTube の実績と週次の事業ファネルをつなぎ、目標差が最も大きい改善候補と次の打ち手を判断するための Web システムです。インプレッション、CTR、加重平均視聴率、導線誘導率、問い合わせから成約への転換率を原因指標として追い、売上・成約数を結果指標、登録者数を参考の結果指標として分けて扱います。これは因果推論ではなく、週次データと設定目標の比較です。

## 対象範囲

- 要件・技術仕様は確定済みです。最初の feature `feat-platform-tenant-auth` は Google ログイン、テナント、招待、役割、CI/CD の土台を提供します。受入条件と検証方法は `docs/feat-platform-tenant-auth/requirements.md` と `docs/feat-platform-tenant-auth/test-design.md` を正とします。
- 2 つ目の feature `feat-login-redesign` は `docs/screens/01-login.png` の配置・文言を基にログイン画面を刷新し（製品名 Channel Insight）、表示する権限と Google へ要求するスコープの一致、規約への同意の記録と改定時の再同意、YouTube の一部だけ許可されたときの再連携、画面のセキュリティヘッダを加えます。色・背景・ロゴと Google ボタンは既存のデザイン決定に従います。受入条件と検証は `docs/feat-login-redesign/requirements.md` と `docs/feat-login-redesign/test-design.md`、運用は `docs/feat-login-redesign/runbook.md` を正とします。
- ブランチ、作業ツリー、CI、公開環境の状態は変化するため、この README には複製しません。ローカルは下記コマンド、外部環境は GitHub Actions と `docs/setup/owner-manual-setup.mdx` の確認手順で判定してください。
- 3つ目の feature `feat-settings-channel-link` は、設定画面（YouTube チャンネルの連携、データ取込の履歴、Claude Code 連携トークン、メンバー、無料枠の使用状況、データの削除予約）と、全画面で共通のヘッダー、フッター、部品を提供します。受入条件は `docs/feat-settings-channel-link/requirements.md`、運用とローカルの画面テストは `docs/feat-settings-channel-link/runbook.md` を正とします。
- 4つ目の feature `feat-skill-analysis-reports` は、Claude Code の `yt-analyze` スキルが分析用データを取り出し、結果（レポート、所見、改善アクション、心理所見、コメント感情）を版つきで保存する経路です。保存は追記のみで、版番号はチャンネルごとの連番です。週次の自動実行（launchd）と手順は `docs/feat-skill-analysis-reports/runbook.md`、受入条件は同じフォルダの `requirements.md` を正とします。
- 5つ目の feature `feat-ai-analysis-screen` は、`docs/screens/03-ai-analysis.png` を基にした AI分析画面（①依頼 ②実行状況 ③レポート）です。依頼の作成とプロンプトのコピー、取消と再実行、結果JSONの取込、2つの版の比較、アーカイブ、改善アクションへの登録を扱います。利用者に見える表記は「チャンネル管理」にそろえています（コード上の識別子は tenant のまま）。受入条件と画面テストは `docs/feat-ai-analysis-screen/requirements.md` と `docs/feat-ai-analysis-screen/runbook.md` を正とします。
- 6つ目の feature `feat-dashboard-redesign` は、`docs/screens/02-dashboard.png` の配置でダッシュボードを刷新します（KPI 4枚、日次推移、動画別の実績と構成比、最新AI分析、改善アクション、「詳しく見る」に移したファネル）。期間は全画面共通のヘッダー（7日・28日・90日・1年・任意）で切り替え、動画は直近10本を既定に上限なしで選べます。サムネイルは自サイト経由で配り、30日で消します。YouTube の基本日次収集、Reporting 同期、Studio CSV の解析もこの feature に含みます。受入条件は `docs/feat-dashboard-redesign/requirements.md`、運用とローカルの画面テストは `docs/feat-dashboard-redesign/runbook.md` を正とします。
- 残りの業務機能（業務画面の残り、保持期間の運用）は未着手です。収集失敗時の運用、API データの保持期限、字幕の自動取得は、各 feature の受入状況を確認してから公開します。
- 週次の自動分析を本番の Mac で `launchctl bootstrap` するのは、AI分析画面の `POST /api/skill/requests` を含む版を本番へ出してからにします（それより前に有効にすると、依頼の登録先がなく失敗します）。
- 週次事業ファネルと分析履歴の追補は、対象3 featureのtask計画前に正式な dev-graph compile / decompose が必要です。現行 context と graph の内容は限定ローカル再投影で一致させました（`eval-log/dev-graph-targeted-resync-receipt-20260924.json`）。正式処理のgateは `eval-log/dev-graph-resync-required-20260922.json` に残しています。

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
| マイグレーションの適用確認（空 DB と、0015 まで適用済みの DB への差分） | `pnpm check:migrations` |

- `.dev.vars` に `DEV_LOGIN=1` を入れると、localhost に限り、メールアドレスだけでログインできる「開発用ログイン」が使えます。テストアカウントと画面テストの流れは `docs/feat-platform-tenant-auth/runbook.md` の 5 節（ログイン、招待）、YouTube 連携状態ごとのアカウント（`partial@example.com` など）は `docs/feat-login-redesign/runbook.md` の 7 節、設定画面は `docs/feat-settings-channel-link/runbook.md` の 6 節、AI分析画面は `docs/feat-ai-analysis-screen/runbook.md`、ダッシュボードは `docs/feat-dashboard-redesign/runbook.md` の 5 節を参照してください。ログイン画面では、同意にチェックしてから開発用ログインを押します。
- 規約を改定するときは `docs/feat-login-redesign/runbook.md` の 2 節（`LEGAL_VERSIONS` と規約 HTML の版を同時に上げる）に従ってください。
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
