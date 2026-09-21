#!/usr/bin/env python3
"""Validate cross-file repository invariants without modifying the repository."""

from __future__ import annotations

import json
import hashlib
import sys
from collections import Counter, deque
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
PACKAGE_DIR = (
    REPO_ROOT
    / ".dev-graph"
    / "published"
    / "feature-package-feat-platform-tenant-auth"
)
TASK_GRAPH_PATH = PACKAGE_DIR / "task-graph.json"
PLAN_MD_PATH = PACKAGE_DIR / "plan-structure.md"
PLAN_HTML_PATH = PACKAGE_DIR / "plan-structure-report.html"
ARCHITECTURE_GRAPH_PATH = REPO_ROOT / "architecture" / "graph.json"
ARCHITECTURE_DOC_PATH = REPO_ROOT / "architecture" / "youtube-analytics-system.md"
STATE_GRAPH_PATH = REPO_ROOT / ".dev-graph" / "state" / "graph.json"
README_PATH = REPO_ROOT / "README.md"
PROMPTS_DIR = REPO_ROOT / "docs" / "screens" / "prompts"
DASHBOARD_PROMPT_PATH = PROMPTS_DIR / "02-dashboard.prompt.txt"
AI_ANALYSIS_PROMPT_PATH = PROMPTS_DIR / "03-ai-analysis.prompt.txt"
ACTIONS_PROMPT_PATH = PROMPTS_DIR / "04-actions.prompt.txt"
SETTINGS_PROMPT_PATH = PROMPTS_DIR / "05-settings.prompt.txt"
ANALYSIS_CATALOG_PATH = REPO_ROOT / "docs" / "analysis" / "dashboard-analysis-catalog.md"
SPEC_STATE_PATH = REPO_ROOT / "system-spec" / "spec-state.json"
AGGREGATE_SPEC_PATH = REPO_ROOT / "specs" / "youtube-analytics-system.md"
PENDING_HISTORY_PATH = REPO_ROOT / "eval-log" / "pending-spec-change-analysis-history.json"
RESYNC_GATE_PATH = REPO_ROOT / "eval-log" / "dev-graph-resync-required-20260922.json"

EXPECTED_NODE_COUNT = 13
EXPECTED_EDGE_COUNT = 13
EXPECTED_ROOTS = ["SYS-PTA-P01"]


def relative(path: Path) -> str:
    """Return a stable repository-relative path for diagnostics."""

    try:
        return path.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def read_text(path: Path, errors: list[str]) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        errors.append(f"{relative(path)}: cannot read text: {exc}")
        return None


def read_json(path: Path, errors: list[str]) -> Any | None:
    text = read_text(path, errors)
    if text is None:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        errors.append(f"{relative(path)}: invalid JSON: {exc}")
        return None


def validate_task_graph(errors: list[str]) -> None:
    graph = read_json(TASK_GRAPH_PATH, errors)
    if not isinstance(graph, dict):
        if graph is not None:
            errors.append(f"{relative(TASK_GRAPH_PATH)}: root must be an object")
        return

    nodes = graph.get("nodes")
    if not isinstance(nodes, list):
        errors.append(f"{relative(TASK_GRAPH_PATH)}: nodes must be an array")
        return

    node_ids: list[str] = []
    dependencies: dict[str, list[str]] = {}
    for index, node in enumerate(nodes):
        if not isinstance(node, dict):
            errors.append(
                f"{relative(TASK_GRAPH_PATH)}: nodes[{index}] must be an object"
            )
            continue
        node_id = node.get("id")
        depends_on = node.get("depends_on")
        if not isinstance(node_id, str) or not node_id:
            errors.append(
                f"{relative(TASK_GRAPH_PATH)}: nodes[{index}].id must be a non-empty string"
            )
            continue
        node_ids.append(node_id)
        if not isinstance(depends_on, list) or not all(
            isinstance(value, str) and value for value in depends_on
        ):
            errors.append(
                f"{relative(TASK_GRAPH_PATH)}: {node_id}.depends_on must be an array of non-empty strings"
            )
            continue
        duplicate_dependencies = sorted(
            value for value, count in Counter(depends_on).items() if count > 1
        )
        if duplicate_dependencies:
            errors.append(
                f"{relative(TASK_GRAPH_PATH)}: {node_id} repeats dependencies "
                f"{duplicate_dependencies}"
            )
        dependencies[node_id] = depends_on

    duplicate_ids = sorted(
        node_id for node_id, count in Counter(node_ids).items() if count > 1
    )
    if duplicate_ids:
        errors.append(
            f"{relative(TASK_GRAPH_PATH)}: duplicate node ids {duplicate_ids}"
        )

    node_id_set = set(node_ids)
    unknown_dependencies = sorted(
        (node_id, dependency)
        for node_id, values in dependencies.items()
        for dependency in values
        if dependency not in node_id_set
    )
    if unknown_dependencies:
        details = ", ".join(
            f"{node_id}->{dependency}"
            for node_id, dependency in unknown_dependencies
        )
        errors.append(f"{relative(TASK_GRAPH_PATH)}: unknown dependencies: {details}")

    node_count = len(nodes)
    edge_count = sum(len(values) for values in dependencies.values())
    roots = sorted(
        node_id for node_id in node_ids if not dependencies.get(node_id, [])
    )

    if node_count != EXPECTED_NODE_COUNT:
        errors.append(
            f"{relative(TASK_GRAPH_PATH)}: expected {EXPECTED_NODE_COUNT} nodes, "
            f"found {node_count}"
        )
    if edge_count != EXPECTED_EDGE_COUNT:
        errors.append(
            f"{relative(TASK_GRAPH_PATH)}: expected {EXPECTED_EDGE_COUNT} dependency "
            f"edges, found {edge_count}"
        )
    if roots != EXPECTED_ROOTS:
        errors.append(
            f"{relative(TASK_GRAPH_PATH)}: expected roots {EXPECTED_ROOTS}, found {roots}"
        )

    if not duplicate_ids and not unknown_dependencies and len(dependencies) == len(nodes):
        indegree = {node_id: len(values) for node_id, values in dependencies.items()}
        children = {node_id: [] for node_id in node_ids}
        for node_id, values in dependencies.items():
            for dependency in values:
                children[dependency].append(node_id)

        ready = deque(sorted(node_id for node_id, value in indegree.items() if value == 0))
        visited = 0
        while ready:
            node_id = ready.popleft()
            visited += 1
            for child in sorted(children[node_id]):
                indegree[child] -= 1
                if indegree[child] == 0:
                    ready.append(child)
        if visited != len(nodes):
            cyclic_nodes = sorted(
                node_id for node_id, value in indegree.items() if value > 0
            )
            errors.append(
                f"{relative(TASK_GRAPH_PATH)}: dependency cycle detected among "
                f"{cyclic_nodes}"
            )

    validate_thin_indexes(errors, node_count, edge_count, roots)


def validate_thin_indexes(
    errors: list[str], node_count: int, edge_count: int, roots: list[str]
) -> None:
    root_value = roots[0] if len(roots) == 1 else ",".join(roots)
    markdown = read_text(PLAN_MD_PATH, errors)
    if markdown is not None:
        required_markdown = [
            f"Nodes: `{node_count}`",
            f"Dependency edges: `{edge_count}`",
            f"Root task: `{root_value}`",
            "[task-graph.json](task-graph.json)",
            "[schedule-20260921-self.json](../../../eval-log/schedule-20260921-self.json)",
        ]
        for token in required_markdown:
            if token not in markdown:
                errors.append(
                    f"{relative(PLAN_MD_PATH)}: missing thin-index declaration {token!r}"
                )
        if "0 依存エッジ" in markdown:
            errors.append(
                f"{relative(PLAN_MD_PATH)}: retains the obsolete zero-edge claim"
            )

    html = read_text(PLAN_HTML_PATH, errors)
    if html is not None:
        required_html = [
            f'data-node-count="{node_count}"',
            f'data-edge-count="{edge_count}"',
            f'data-root-task="{root_value}"',
            'href="task-graph.json"',
            'href="../../../eval-log/schedule-20260921-self.json"',
        ]
        for token in required_html:
            if token not in html:
                errors.append(
                    f"{relative(PLAN_HTML_PATH)}: missing thin-index declaration {token!r}"
                )
        for forbidden in ("/Users/", "file://", "0 dependency edges"):
            if forbidden in html:
                errors.append(
                    f"{relative(PLAN_HTML_PATH)}: contains forbidden stale/absolute text "
                    f"{forbidden!r}"
                )


def validate_graph_revision(errors: list[str]) -> None:
    architecture = read_json(ARCHITECTURE_GRAPH_PATH, errors)
    state = read_json(STATE_GRAPH_PATH, errors)
    if not isinstance(architecture, dict) or not isinstance(state, dict):
        return
    derived_revision = architecture.get("derived_graph_revision")
    state_revision = state.get("graph_revision")
    if derived_revision != state_revision:
        errors.append(
            f"{relative(ARCHITECTURE_GRAPH_PATH)}: derived_graph_revision "
            f"{derived_revision!r} does not match {relative(STATE_GRAPH_PATH)} "
            f"graph_revision {state_revision!r}"
        )
    nodes = architecture.get("nodes")
    if isinstance(nodes, list):
        doc_node = next(
            (
                node
                for node in nodes
                if isinstance(node, dict)
                and node.get("id") == "arch-youtube-analytics-system"
            ),
            None,
        )
        if isinstance(doc_node, dict):
            try:
                actual_digest = hashlib.sha256(ARCHITECTURE_DOC_PATH.read_bytes()).hexdigest()
            except OSError as exc:
                errors.append(
                    f"{relative(ARCHITECTURE_DOC_PATH)}: cannot hash architecture: {exc}"
                )
            else:
                if doc_node.get("sha256") != actual_digest:
                    errors.append(
                        f"{relative(ARCHITECTURE_GRAPH_PATH)}: architecture SHA is stale"
                    )

    doc = read_text(ARCHITECTURE_DOC_PATH, errors)
    if doc is not None:
        for token in (
            "source=api|studio_csv|business_csv",
            "business_funnel_weekly",
            "funnel_targets",
            "history_versions_used",
            "完了済み直近5版",
        ):
            if token not in doc:
                errors.append(
                    f"{relative(ARCHITECTURE_DOC_PATH)}: missing current projection {token!r}"
                )


def validate_readme(errors: list[str]) -> None:
    readme = read_text(README_PATH, errors)
    if readme is not None and "要件定義・技術選定はこれから" in readme:
        errors.append(
            f"{relative(README_PATH)}: retains obsolete project-status wording"
        )


def validate_dashboard_prompt(errors: list[str]) -> None:
    prompt = read_text(DASHBOARD_PROMPT_PATH, errors)
    if prompt is None:
        return
    required_metrics = [
        "インプレッション",
        "CTR",
        "視聴継続率",
        "LINE誘導率",
        "問い合わせ→成約率",
    ]
    for metric in required_metrics:
        if metric not in prompt:
            errors.append(
                f"{relative(DASHBOARD_PROMPT_PATH)}: missing cause metric {metric!r}"
            )
    for schedule_token in ("毎日", "3:00"):
        if schedule_token not in prompt:
            errors.append(
                f"{relative(DASHBOARD_PROMPT_PATH)}: missing schedule token "
                f"{schedule_token!r}"
            )
    if "毎週日曜 毎時" in prompt:
        errors.append(
            f"{relative(DASHBOARD_PROMPT_PATH)}: retains obsolete collection schedule"
        )
    for contract_token in (
        "actual",
        "target",
        "target_gap",
        "同一週の「Studio CSV」",
        "「YouTube API」の値をこの5段へ混ぜない",
        "週次事業CSV",
    ):
        if contract_token not in prompt:
            errors.append(
                f"{relative(DASHBOARD_PROMPT_PATH)}: missing weekly funnel contract "
                f"{contract_token!r}"
            )


def validate_screen_specific_contracts(errors: list[str]) -> None:
    contracts = {
        AI_ANALYSIS_PROMPT_PATH: (
            '"brief"',
            '"results"',
            '"history_review"',
            '"psych_findings"',
            '"ideas"',
            '"actions"',
            '"report_html"',
        ),
        ACTIONS_PROMPT_PATH: (
            "対象ファネル段",
            "売上・成約数",
            "baseline/result",
            "因果関係は断定せず",
        ),
        SETTINGS_PROMPT_PATH: (
            "テナント切替",
            "メンバー一覧",
            "週次事業CSV",
            "route_visits",
            "closed_deals",
            "revenue_jpy",
        ),
    }
    for path, tokens in contracts.items():
        text = read_text(path, errors)
        if text is None:
            continue
        for token in tokens:
            if token not in text:
                errors.append(f"{relative(path)}: missing screen contract {token!r}")

    aggregate = read_text(AGGREGATE_SPEC_PATH, errors)
    if aggregate is not None and "source=api|studio_csv|business_csv" not in aggregate:
        errors.append(
            f"{relative(AGGREGATE_SPEC_PATH)}: export source enum is not canonical"
        )


def validate_prompt_composition(errors: list[str]) -> None:
    shared_prompt = PROMPTS_DIR / "_shared.prompt.txt"
    shared_text = read_text(shared_prompt, errors)
    if shared_text is not None and not shared_text.strip():
        errors.append(f"{relative(shared_prompt)}: shared prompt must not be empty")

    screen_prompts = sorted(PROMPTS_DIR.glob("[0-9][0-9]-*.prompt.txt"))
    if not screen_prompts:
        errors.append(f"{relative(PROMPTS_DIR)}: no screen prompts found")
        return
    for prompt_path in screen_prompts:
        prompt = read_text(prompt_path, errors)
        if prompt is None:
            continue
        if "共通デザイン:" in prompt:
            errors.append(
                f"{relative(prompt_path)}: duplicates the shared design body"
            )


def validate_analysis_catalog(errors: list[str]) -> None:
    catalog = read_text(ANALYSIS_CATALOG_PATH, errors)
    if catalog is None:
        return
    for identifier in (
        "lead_route_rate",
        "inquiry_close_rate",
        "business_funnel_weekly",
        "sample_count",
        "全指標目標達成",
        "same_week_snapshot",
        "analysis_history",
    ):
        if identifier not in catalog:
            errors.append(
                f"{relative(ANALYSIS_CATALOG_PATH)}: missing {identifier!r}"
            )


def validate_spec_state(errors: list[str]) -> None:
    state = read_json(SPEC_STATE_PATH, errors)
    if not isinstance(state, dict):
        return
    foundation = state.get("requirements_foundation")
    if not isinstance(foundation, dict):
        errors.append(f"{relative(SPEC_STATE_PATH)}: requirements_foundation missing")
        return

    serialized = json.dumps(foundation, ensure_ascii=False)
    for token in (
        "インプレッション",
        "導線誘導率",
        "問い合わせ→成約率",
        "売上・成約数",
        "登録者数を参考",
        "全指標目標達成",
    ):
        if token not in serialized:
            errors.append(
                f"{relative(SPEC_STATE_PATH)}: canonical requirements missing {token!r}"
            )

    approval_ref = foundation.get("approval_ref")
    approvals = state.get("approval_log")
    approval_ids = {
        item.get("id")
        for item in approvals
        if isinstance(approvals, list) and isinstance(item, dict)
    } if isinstance(approvals, list) else set()
    if approval_ref not in approval_ids:
        errors.append(
            f"{relative(SPEC_STATE_PATH)}: approval_ref {approval_ref!r} is not in approval_log"
        )

    qa_log = state.get("qa_log")
    qa_ids = {
        item.get("id")
        for item in qa_log
        if isinstance(qa_log, list) and isinstance(item, dict)
    } if isinstance(qa_log, list) else set()
    if "qa-060" not in qa_ids:
        errors.append(f"{relative(SPEC_STATE_PATH)}: qa-060 lineage is missing")


def validate_pending_history_applied(errors: list[str]) -> None:
    pending = read_json(PENDING_HISTORY_PATH, errors)
    if not isinstance(pending, dict):
        return
    if pending.get("status") != "applied":
        errors.append(
            f"{relative(PENDING_HISTORY_PATH)}: expected applied status, "
            f"found {pending.get('status')!r}"
        )
    evidence = pending.get("apply_evidence")
    if not isinstance(evidence, list) or not evidence:
        errors.append(f"{relative(PENDING_HISTORY_PATH)}: apply_evidence missing")


def validate_resync_gate(errors: list[str]) -> None:
    gate = read_json(RESYNC_GATE_PATH, errors)
    if not isinstance(gate, dict):
        return
    source_path = REPO_ROOT / str(gate.get("canonical_source", ""))
    try:
        current_digest = hashlib.sha256(source_path.read_bytes()).hexdigest()
    except OSError as exc:
        errors.append(f"{relative(source_path)}: cannot hash canonical source: {exc}")
        return
    if gate.get("current_source_digest") != current_digest:
        errors.append(
            f"{relative(RESYNC_GATE_PATH)}: current_source_digest is stale; "
            f"expected {current_digest}"
        )
    if gate.get("status") != "required_before_affected_feature_planning":
        errors.append(f"{relative(RESYNC_GATE_PATH)}: resync gate is not active")
    affected = gate.get("affected_features")
    if not isinstance(affected, list) or not affected:
        errors.append(f"{relative(RESYNC_GATE_PATH)}: affected_features missing")
    try:
        architecture_digest = hashlib.sha256(ARCHITECTURE_DOC_PATH.read_bytes()).hexdigest()
    except OSError as exc:
        errors.append(f"{relative(ARCHITECTURE_DOC_PATH)}: cannot hash architecture: {exc}")
    else:
        if gate.get("current_architecture_digest") != architecture_digest:
            errors.append(
                f"{relative(RESYNC_GATE_PATH)}: current_architecture_digest is stale"
            )
    projections = gate.get("affected_projections")
    required_projections = {
        "architecture/youtube-analytics-system.md",
        "architecture/graph.json",
        ".dev-graph/state/graph.json",
    }
    if not isinstance(projections, list) or not required_projections.issubset(projections):
        errors.append(f"{relative(RESYNC_GATE_PATH)}: affected_projections incomplete")


def main() -> int:
    errors: list[str] = []
    validate_task_graph(errors)
    validate_graph_revision(errors)
    validate_readme(errors)
    validate_dashboard_prompt(errors)
    validate_screen_specific_contracts(errors)
    validate_prompt_composition(errors)
    validate_analysis_catalog(errors)
    validate_spec_state(errors)
    validate_pending_history_applied(errors)
    validate_resync_gate(errors)

    if errors:
        print(f"repository consistency: FAILED ({len(errors)} issue(s))", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("repository consistency: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
