# 開発グラフの限定再同期プレビュー（2026-09-24）

この節は適用前の調査記録。調査時に `pnpm check:repo` に残った2件の原因は、旧3機能の graph node が旧仕様 digest `cd7db6ea…` を指していること。現行の仕様文書と feature context/Markdown は同期済みで、現行 digest は `d6de2598…`。ログイン機能の graph node も `scope_in` に旧部品名が2項目残る。

| graph_node_id | context と異なる内容フィールド | 予定する扱い |
|---|---|---|
| `feat-csv-media-ingest` | purpose、goal、scope_in、acceptance | 同じ ID の context を正とし、他の node metadata と依存を保持 |
| `feat-skill-analysis-reports` | purpose、goal、scope_in、acceptance | 同上 |
| `feat-web-screens-actions` | purpose、goal、scope_in、acceptance | 同上 |
| `feat-login-redesign` | scope_in の旧 ReadOnlyBadge・TrustFooter/ロゴ説明 | 同じ ID の context を正とし、`depends_on` は graph の既存値を保持 |

対象は `.dev-graph/state/graph.json` の上記4ノード、`architecture/graph.json` の revision、独立監査と更新 receipt。`eval-log/dev-graph-resync-required-20260922.json` の現行 digest は照合対象とし、既に一致している場合は変更しない。Beads/GitHub や feature の task package は対象外。適用前後に graph schema、context/Markdown 一致、node 差分の対象 ID、依存 DAG、`pnpm check:repo` を検証する。

正式な C14/C02 Skill は graph の単一 writer と C14 由来 feature を要求する。一方、この環境の Claude CLI は `/dev-graph` を `Unknown skill` として拒否し、C14 に feature ID の許可リスト引数もない。直接 JSON を置換して digest だけ合わせることは gate の `non_action` に反する。このプレビュー時点では未適用で、外部 tracker への書込みは行っていない。

その後、利用者が限定ローカル再投影を承認し、内容の再生成、別の読み取り専用監査、4ノードだけの適用を実施した。結果と残る正式ゲートは [再同期記録](dev-graph-targeted-resync-receipt-20260924.json) に記録した。
