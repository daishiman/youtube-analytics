# youtube-analytics

YouTube の実績と週次の事業ファネルをつなぎ、目標差が最も大きい改善候補と次の打ち手を判断するための Web システムです。インプレッション、CTR、加重平均視聴率、導線誘導率、問い合わせから成約への転換率を原因指標として追い、売上・成約数を結果指標、登録者数を参考の結果指標として分けて扱います。これは因果推論ではなく、週次データと設定目標の比較です。

## 現況

- 要件・技術仕様は確定済みで、アプリ実装コードはまだありません。
- 現在の公開 feature package は `feat-platform-tenant-auth`、進捗は `0/13` task です。
- 次に実行する task は `SYS-PTA-P01`（要件の実装単位への確定）です。
- 週次事業ファネルと分析履歴の追補は、対象3 featureのtask計画前に dev-graph compile / decompose で digest とstate graphを再同期します。必要なgateは `eval-log/dev-graph-resync-required-20260922.json` に固定しています。

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
