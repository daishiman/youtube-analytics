---
acceptance: ["未ログインで /api/* を呼ぶと 401 になる", "初回ログインで tenants と owner の tenant_members が1組だけ作られる", "閲覧者の書込APIは 403、他テナントの資源IDは 404 になる(越境成功0件)", "招待リンクを別の Google アカウントで開くと参加できない", "テナント数が MAX_TENANTS に達すると新規テナントを作らず受付停止メッセージを返す", "main への push で D1 マイグレーションと deploy が完了する"]
architecture_refs: ["arch-youtube-analytics-system"]
artifact_kind: "feature"
artifact_subtypes: []
beads_linkage: null
classification_candidates: [{"artifact_kind": "feature", "confidence": 0.95, "candidate_path": "features/feat-platform-tenant-auth.md"}, {"artifact_kind": "issue", "confidence": 0.2, "candidate_path": "issues/feat-platform-tenant-auth.md"}]
classification_confidence: 0.95
classification_reason: "C14 macro 分解で確定仕様から導出した機能単位(purpose/goal/scope/acceptance を持つ)。phase task 粒度ではない"
completion_evidence: {"completed_at": null, "evidence_refs": [], "policy": "manual", "reconciled_at": null, "source": null, "status": "not_applicable"}
confirmation_evidence: {"evaluator": "dev-graph:dev-graph-integrity-auditor", "evidence_ref": "eval-log/dev-graph-decompose-audit-20260921.json", "evaluated_digest": "93222146ee6089f0c1ef0c6fcc62e9250c03338dfe9e49a328952d6fef7749b9"}
confirmation_status: "confirmed"
created_at: "2026-09-21T15:15:00Z"
depends_on: []
domain: "youtube-analytics"
evaluation_status: "pass"
execution_contexts: []
feature_package_id: null
file_path: "features/feat-platform-tenant-auth.md"
github_project_linkages: []
github_publication: {"labels": [], "milestone": null, "mode": "local_only", "project_aliases": []}
goal: "Googleでログインすると初回はテナントが作られ、招待リンクで追加したメンバーが owner/editor/viewer の権限の範囲でだけ操作でき、他テナントの資源には到達できない状態が、main への push で自動デプロイされる"
graph_node_id: "feat-platform-tenant-auth"
implementation_readiness: {"status": "complete", "missing_sections": [], "checked_at": "2026-09-21T15:15:00Z"}
issue_linkage: null
iteration: null
owners: ["daishiman"]
parent_feature: null
phase_ref: null
priority: null
project_id: "youtube-analytics"
pull_request_linkages: []
purpose: "全機能が載る Cloudflare Workers/D1/R2 の土台と、Googleログインでテナント単位に安全に分離されたアクセスを先に用意し、後続機能が tenant_id と役割を前提に作れるようにする"
related_nodes: ["spec-youtube-analytics-system"]
resource_scope: []
scope_in: ["Workers 1本(Hono v4)+D1(binding DB)+R2 1バケットの wrangler 構成と MAX_TENANTS=100", "D1 マイグレーション(users, tenants, tenant_members, tenant_invites, skill_tokens の土台)と TenantScopedRepository", "Google OAuth 2.0 Authorization Code+PKCE によるログイン(openid email)とセッションCookie(256bit・30日)", "初回ログイン時のテナント自動作成と上限到達時の受付停止", "招待リンク(ハッシュ保存・7日・1回限り・メール一致・取消)とメンバーの役割変更・削除・脱退", "TenantContext による usecase 入口での役割検査とエラー形式 {error:{code,message,hint}}", "プライバシーポリシー・利用規約の静的ページとログイン前同意", "GitHub Actions(PR で lint/test/dry-run、main で migrations→deploy)と Workers Secrets"]
scope_out: ["YouTube API の読取連携と収集(feat-youtube-daily-collection)", "CSV・字幕・画像の取込(feat-csv-media-ingest)", "Claude Code 連携API とレポート(feat-skill-analysis-reports)", "ダッシュボード等の業務画面(feat-web-screens-actions)", "保持期間の掃除と無料枠メーター(feat-retention-ops)"]
source_lineage: {"origin_kind": "generated", "source_plugin": "dev-graph", "source_path": "specs/youtube-analytics-system.md", "source_version": "1.0.0", "source_digest": "cd7db6eaf6be63b19ffc8bdd66d03c986abcc5473426f7762afc7dac9df8c486", "imported_at": "2026-09-21T15:15:00Z"}
start_date: null
status: "active"
tags: ["feature", "youtube-analytics"]
target_date: null
template_id: "feature"
template_version: "1.0.0"
title: "基盤・Googleログイン・マルチテナント"
tracker_binding: "beads"
updated_at: "2026-09-21T15:15:00Z"
---

# 目的

全機能が載る Cloudflare Workers/D1/R2 の土台と、Googleログインでテナント単位に安全に分離されたアクセスを先に用意し、後続機能が tenant_id と役割を前提に作れるようにする(資するゴール: G3, G4)

## 到達状態

Googleでログインすると初回はテナントが作られ、招待リンクで追加したメンバーが owner/editor/viewer の権限の範囲でだけ操作でき、他テナントの資源には到達できない状態が、main への push で自動デプロイされる

## スコープ

### 含む

- Workers 1本(Hono v4)+D1(binding DB)+R2 1バケットの wrangler 構成と MAX_TENANTS=100
- D1 マイグレーション(users, tenants, tenant_members, tenant_invites, skill_tokens の土台)と TenantScopedRepository
- Google OAuth 2.0 Authorization Code+PKCE によるログイン(openid email)とセッションCookie(256bit・30日)
- 初回ログイン時のテナント自動作成と上限到達時の受付停止
- 招待リンク(ハッシュ保存・7日・1回限り・メール一致・取消)とメンバーの役割変更・削除・脱退
- TenantContext による usecase 入口での役割検査とエラー形式 {error:{code,message,hint}}
- プライバシーポリシー・利用規約の静的ページとログイン前同意
- GitHub Actions(PR で lint/test/dry-run、main で migrations→deploy)と Workers Secrets

### 含まない

- YouTube API の読取連携と収集(feat-youtube-daily-collection)
- CSV・字幕・画像の取込(feat-csv-media-ingest)
- Claude Code 連携API とレポート(feat-skill-analysis-reports)
- ダッシュボード等の業務画面(feat-web-screens-actions)
- 保持期間の掃除と無料枠メーター(feat-retention-ops)

## 受入

- 未ログインで /api/* を呼ぶと 401 になる
- 初回ログインで tenants と owner の tenant_members が1組だけ作られる
- 閲覧者の書込APIは 403、他テナントの資源IDは 404 になる(越境成功0件)
- 招待リンクを別の Google アカウントで開くと参加できない
- テナント数が MAX_TENANTS に達すると新規テナントを作らず受付停止メッセージを返す
- main への push で D1 マイグレーションと deploy が完了する

## アーキテクチャ参照

- arch-youtube-analytics-system(architecture/youtube-analytics-system.md)
- spec-youtube-analytics-system(specs/youtube-analytics-system.md)
- 根拠章: system-spec/infrastructure.md, system-spec/auth.md, system-spec/security.md, system-spec/database.md, system-spec/maintenance-ops.md

## 機能間依存

- なし(最初に着手できる ready feature)

## Handoff

exact-13 の task 仕様は system-dev-planner が `--feature-id feat-platform-tenant-auth --feature-context features/feat-platform-tenant-auth.context.json` で生成する。本ノードは task を持たない。
