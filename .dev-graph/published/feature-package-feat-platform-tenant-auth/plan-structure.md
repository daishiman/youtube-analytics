# task progress index

このファイルは依存グラフを複製しない thin index です。タスク依存の正本は `task-graph.json` の `nodes[].depends_on` です。

## Canonical sources

- Dependency graph: [task-graph.json](task-graph.json)
- Schedule and ready set: [schedule-20260921-self.json](../../../eval-log/schedule-20260921-self.json)
- Current status overlay: [plan-structure-status.json](plan-structure-status.json)

## Dependency summary

- Nodes: `13`
- Dependency edges: `13`
- Root task: `SYS-PTA-P01`

`SYS-PTA-P01 → … → SYS-PTA-P10 → {SYS-PTA-P11, SYS-PTA-P12} → SYS-PTA-P13`

この要約は案内用です。完全な依存関係は canonical graph を参照してください。

## Current progress

- Completion: **0/13**
