# feat-dashboard-redesign テスト設計（SYS-DBR-P04）

最終更新: 2026-09-25。

## 1. 層の分け方

| 層 | 場所 | 実行 | 役割 |
|---|---|---|---|
| ドメインの単体テスト | `tests/dashboard/domain.test.ts`（11件） | `pnpm test` | 期間（JST の日付境界、365日）、入力検証、構成比、ファネル判定 |
| API の結合テスト | `tests/dashboard/dashboard-api.test.ts`（11ケース）、`funnel-api.test.ts`（4件）、`thumbnails.test.ts`（11件）。400 の検査は `it.each` で入力ごとに1件ずつ数えるので、Vitest の件数は4ファイルで44件 | `pnpm test`（Vitest、Workers プール、ローカル D1 と R2） | テナント境界、除外、空状態、権限、キャッシュ、Queue と Cron |
| 画面の E2E | `e2e/dashboard.spec.ts`（E1〜E8） | `pnpm e2e`（Playwright、3サイズ） | 区画順、期間と選択の保持、構成比、遅延取得、閲覧者、横スクロール |
| 既存の E2E | `e2e/shell-state.spec.ts` | 同上 | 共通ヘッダーの期間に 7日が増えたことへ追従させた |

データは `tests/dashboard/helpers.ts` が各テストの前に D1 へ入れる。外部の画像取得は `fetch` を差し替える。E2E は `scripts/seed-local.sql` の seed を使う。

## 2. 受入項目とテストの対応

| AC | 単体・結合 | E2E |
|---|---|---|
| AC1 区画順と配色 | — | E1 |
| AC2 期間 | domain「期間の解決」4件、dashboard-api「期間 7d/90d/1y/custom を解決し…」、400 の検査 | E2 |
| AC3 動画選択 | dashboard-api「既定は28日・チャンネル全体・直近10本…」「scope=videos は選んだ動画の合計…」 | E3（11本以上を選ぶ） |
| AC4 動画別の実績と構成比 | domain「構成比」2件、dashboard-api「構成比の分母はチャンネル全体の動画で…」 | E4 |
| AC5 出典バッジと M1 | dashboard-api「CSV 未取込なら M1 は null で noCsv を立てる」 | E1 |
| AC6 ファネル | funnel-api 4件、domain「ファネル判定」3件 | E5（開くまで要求しない） |
| AC7 空状態5種 | dashboard-api「チャンネル未連携なら notLinked…」「CSV 未取込なら…」「最新の完了レポート…」 | — |
| AC8 閲覧者、他テナント | dashboard-api「viewer は閲覧でき canEdit=false…」「video_ids は上限なしで受け付け、他テナント・存在しない ID は黙って除外する」 | E6、E7 |
| AC9 キャッシュ、CSP、サムネイル | thumbnails「自テナントの30日以内の画像を private キャッシュで返し…」「他テナント・30日超・未保存・不正な ID は 404…」、dashboard-api「既定は28日…」で `private, no-store` と CSP の `img-src`（`'self' data:` があり、`ytimg` が無い）を検査 | —（画面での表示は acceptance の手順とスクリーンショットで確認） |
| AC10 360px と3サイズ | — | E8、全テストを mobile 390×844、tablet 820×1180、desktop 1440×900 で実行 |
| AC11 101本以上 | dashboard-api「video_ids を101本以上選んでも 200…」（105本） | — |
| AC12 subrequest、取り直し、30日削除 | thumbnails「未保存→URL変更→古い順…」「1通の件数は上限までに切り詰める」「30日を超えた行と R2 オブジェクトだけを消す」「1回の実行は12テナントまで…」 | — |
| AC13 1,000本の上限 | thumbnails「1,100本を超えるテナントは公開日の新しい1,000本だけを対象にする（1,100本ちょうどは全件）」 | — |

## 3. 実行方法

```bash
pnpm test                    # 単体と結合（dashboard の4ファイルを含む全件）
pnpm e2e                     # 8791 で起動中の pnpm dev を再利用する
E2E_PORT=8792 pnpm e2e       # 8791 が別の作業ツリーで使われているとき
npx playwright test e2e/dashboard.spec.ts   # ダッシュボードだけ
```

E2E はローカル D1 を書き換える（owner@ のワークスペース切替など）ので、終わったら `pnpm db:seed:local` を流す。
