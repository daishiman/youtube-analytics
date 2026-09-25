# feat-skill-analysis-reports 運用手順（SYS-SAR-P12）

最終更新: 2026-09-25。この文書に書いたコマンドは、この文書の作成時には実行していない（共有の dev サーバと D1 の状態を守るため）。

## 1. 出荷の条件（release-condition）

本番 launchctl bootstrap 有効化は feat-ai-analysis-screen が POST /api/skill/requests 本体を出荷した後の運用前提条件である。

- SAR と AIA は同時に出荷する（final-review.md 2節）ので、両方が本番に出ていればこの条件を満たす。
- SAR と AIA の依存を task-graph の edge として追加すると循環になるため、この条件は文書と運用で管理する。

## 2. 個人トークンを発行する

1. 設定画面の「Claude Code連携トークン」区画で、名前を付けて発行する（owner か editor）。平文（`yta_…`）は1回しか表示されない。
2. 運営者の Mac の環境変数に入れる。シェル履歴やリポジトリには書かない。

```bash
export YTA_BASE_URL=http://localhost:8791   # 本番では公開 URL
export YTA_SKILL_TOKEN=yta_...              # 必須
export YTA_WORK_ROOT=~/.youtube-analytics/yt-analyze-runs   # 既定値
```

viewer のトークンは export しかできず、書き込むと 403 になる。

## 3. /yt-analyze を実行する

```bash
# 画面で作った依頼を処理する
node .claude/skills/yt-analyze/scripts/yt-analyze.mjs --request-id A-0001
# 依頼も作る（依頼ID を渡さない。週次実行と同じ）
node .claude/skills/yt-analyze/scripts/yt-analyze.mjs --period-start 2026-08-29 --period-end 2026-09-25 --instruction "流入段を重点的に"
```

スキルの定義ファイルは `.claude/skills/yt-analyze/SKILL.md`。処理の流れは architecture.md の6節。進捗は画面の依頼一覧に 20 → 50 → 90 と出る。

終了コードは2系統ある。スキル（`yt-analyze.mjs`）の終了コードは SKILL.md、週次実行のランチャ（`ops/launchd/run-weekly-analysis.sh`）の終了コードは `ops/launchd/README.md` の「終了コードとトラブル時の対応」が正本。

## 4. 結果を取り込む

- スキルの最後に POST /api/skill/reports で送る。成功すると、分析フォルダ（`$YTA_WORK_ROOT/<request_id>-v<版>/<月>-<slug>/`）に `posted-result.json` が残り、依頼は「完了」になる。入力の export は同じ `<request_id>-v<版>/inputs/export.json` に残る。
- 送信に失敗したら、画面で依頼の状態を見る。「実行中」のままなら同じ request_id で再実行する。キーはサーバの export が返す `idempotency_key`（`request_id:v版`）なので、同じ内容を再送しても版は増えない（新規なら 201、既存なら 200）。「失敗」になっていたら、新しい依頼で実行し直す（6節の 409）。
- 再現性は `node scripts/skill-analysis/verify-analysis-reproducibility.mjs tests/fixtures/skill-analysis-sample --compare-with <分析フォルダ>/posted-result.json`（同じフォルダの export.json・brief.json があれば、そちらを入力にする） で確かめる。

## 5. launchd で週次実行する

ランチャ（`ops/launchd/run-weekly-analysis.sh`）は通常 request_id を渡さずに `/yt-analyze` を起動し、スキルが個人トークンで POST /api/skill/requests を呼んで依頼を作る。既存の依頼を処理する `--request-id A-0001` と、前提だけを確かめる `--dry-run` もある。

設置（plist のプレースホルダの置き換えと launchctl への登録）・解除・ログの確認は `ops/launchd/README.md` を正本とし、その手順で行う。本番で有効化するのは、1節の条件を満たした後にする。

## 6. 障害の切り分け

| 症状 | 見る所 | 対処 |
|---|---|---|
| 401 | トークンの失効、メンバーから外れた、テナント削除 | 設定画面で再発行し、環境変数を入れ替える |
| 400（版ヘッダ） | `X-Skill-Api-Version` | 応答が示す対応版にスキルを合わせる |
| 403 | 権限（content.write）。viewer への降格 | owner に権限を戻してもらう。export だけなら続けられる |
| 404 | 依頼が見つからない（他テナントの request_id を含む） | 表示されたエラーメッセージを見て、request_id とトークンのテナントを確かめる |
| 409 REQUEST_STATE_CONFLICT / REQUEST_CANCELED | 依頼が完了・失敗・取消済み | 新しい依頼を作って実行し直す |
| 409 REPORT_VERSION_CONFLICT | 別の実行が先に版を追加した | export からやり直す |
| 413 | 本文が 3.5MB を超えた、画像が 2MiB を超えた | 画像を縮める。report_html の埋め込みを減らす |
| 422 | JSON 構文（行番号付き）、形の誤り、存在しない history 版 | `issues` を見て brief.json・analysis.mjs を直す |
| 429 | 依頼の作成が10件/分を超えた | 1分待つ |
| 接続できない（終了コード3） | `YTA_BASE_URL` とサーバの起動 | ローカルなら `pnpm dev`（8791） |

途中で止まった依頼は、409 と 401 以外ならスキルが「失敗」にする。再実行の判断は4節。週次実行で失敗したときは、ランチャの終了コードから `ops/launchd/README.md` の「終了コードとトラブル時の対応」で切り分ける。

## 7. ロールバック

1. コード: 機能ブランチの merge を revert する（`git revert <merge commit>`）。report-design-system は vendoring なので、戻すときもフォルダごと入れ替える。
2. ローカル D1: `.wrangler/state` のローカル D1 を作り直してから、`pnpm db:migrate:local` と `pnpm db:seed:local` を流す。
3. 本番 D1 の 0008〜0012 は追記だけのテーブルなので、戻さずに残す。ルートを外せば使われなくなる。
4. launchd: `ops/launchd/README.md` の「解除」で止める。
