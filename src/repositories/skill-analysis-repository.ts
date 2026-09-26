// AI分析（依頼・レポート版・文字起こし・画像索引）の読み書き。生成時に tenant_id を固定し、
// 全クエリの WHERE に tenant_id を入れる（TenantScopedRepository と同じ方針・他テナントの ID は 0 件 → 404）
import { ACTIVE_STATUSES, type CreatedVia, type RequestStatus } from "../domain/analysis";
import type { TenantContext } from "../domain/tenant-context";

/** 待機中・実行中だけを対象にする IN 句（?from から ACTIVE_STATUSES の数だけ番号を振る） */
const activeIn = (from: number) => ACTIVE_STATUSES.map((_, i) => `?${from + i}`).join(", ");

export interface AnalysisRequestRow {
  request_id: string;
  channel_id: string;
  period_start: string;
  period_end: string;
  instruction: string;
  status: RequestStatus;
  progress: number;
  stage: number;
  error: string | null;
  report_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  retry_of: string | null;
  canceled_at: string | null;
  canceled_by: string | null;
  created_via: CreatedVia;
}

export interface ReportRow {
  report_id: string;
  channel_id: string;
  request_id: string;
  version: number;
  title: string;
  summary: string;
  conclusion: string;
  outcome: string;
  candidate_stage: string | null;
  candidate_metric: string | null;
  period_start: string;
  period_end: string;
  brief_json: string;
  results_json: string;
  history_review_json: string;
  ideas_json: string;
  actions_json: string;
  history_versions_used: string;
  idempotency_key: string;
  created_by: string;
  created_at: string;
}

export interface ActionRow {
  action_id: string;
  report_id: string;
  title: string;
  stage: string;
  metric: string;
  baseline_value: number | null;
  target_value: number | null;
  result_value: number | null;
  status: string;
  judgement: string | null;
  created_at: string;
}

export interface ExportRow {
  source: string;
  period: string;
  video_id: string | null;
  metric: string;
  value: number | null;
}

export interface TargetRow {
  metric_id: string;
  effective_from: string;
  target_value: number;
  min_sample: number | null;
}

/** 報告1件ぶんの書込内容（findings 等は report_id と番号を付けて追記する） */
export interface NewReport {
  reportId: string;
  channelId: string;
  requestId: string;
  version: number;
  title: string;
  summary: string;
  conclusion: string;
  outcome: string;
  candidateStage: string | null;
  candidateMetric: string | null;
  periodStart: string;
  periodEnd: string;
  briefJson: string;
  resultsJson: string;
  historyReviewJson: string;
  ideasJson: string;
  actionsJson: string;
  historyVersionsUsed: string;
  reportHtml: string;
  idempotencyKey: string;
  createdBy: string;
  now: string;
  findings: {
    kind: string;
    title: string;
    fact: string | null;
    interpretation: string | null;
    stage: string | null;
    metric: string | null;
    hypothesisId: string | null;
    falsifier: string | null;
    verdict: string | null;
    evidenceJson: string;
  }[];
  psych: {
    layer: string;
    claim: string;
    evidenceJson: string;
    counterHypothesis: string | null;
    confidence: number;
  }[];
  emotions: { commentId: string; emotion: string; intent: string | null }[];
}

const REPORT_COLUMNS = `report_id, channel_id, request_id, version, title, summary, conclusion, outcome,
  candidate_stage, candidate_metric, period_start, period_end, brief_json, results_json,
  history_review_json, ideas_json, actions_json, history_versions_used, idempotency_key,
  created_by, created_at`;

/** 境界テーブル（日次収集・CSV取込 feature が作る）がまだ無い環境では空として扱う */
function isMissingTable(err: unknown): boolean {
  return err instanceof Error && /no such (table|column)/i.test(err.message);
}

async function ifTableExists<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (err) {
    if (isMissingTable(err)) return null;
    throw err;
  }
}

/** 一覧・検索の対象はテナント内の新しい版から最大この数まで（backend 章 qa-093） */
export const REPORT_SEARCH_WINDOW = 200;

/** LIKE の特殊文字（% _ \）をそのままの文字として扱う */
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export interface ReportListRow {
  report_id: string;
  channel_id: string;
  request_id: string;
  version: number;
  title: string;
  summary: string;
  outcome: string;
  period_start: string;
  period_end: string;
  created_at: string;
  archived: number;
}

export interface SourcedActionRow extends ActionRow {
  source_key: string | null;
}

export class AnalysisRepository {
  readonly tenantId: string;

  constructor(
    private readonly db: D1Database,
    ctx: Pick<TenantContext, "tenantId">,
  ) {
    this.tenantId = ctx.tenantId;
  }

  async getChannel(): Promise<{ channel_id: string; title: string } | null> {
    return this.db
      .prepare("SELECT channel_id, title FROM channels WHERE tenant_id = ?1")
      .bind(this.tenantId)
      .first();
  }

  /** テナント内連番 A-0001 を採番して1件作る（採番と挿入を1文にして競合でも番号が重ならない） */
  async insertRequest(input: {
    channelId: string;
    periodStart: string;
    periodEnd: string;
    instruction: string;
    createdBy: string;
    now: string;
    /** 画面は待機中、スキルの自動作成・画面の取込は実行中で作る */
    status?: (typeof ACTIVE_STATUSES)[number];
    createdVia?: CreatedVia;
    retryOf?: string | null;
  }): Promise<string> {
    const status = input.status ?? "待機中";
    const row = await this.db
      .prepare(
        `INSERT INTO analysis_requests
           (tenant_id, request_id, channel_id, period_start, period_end, instruction, status,
            progress, stage, created_by, created_at, updated_at, started_at, retry_of, created_via)
         SELECT ?1, printf('A-%04d', COALESCE(MAX(CAST(substr(request_id, 3) AS INTEGER)), 0) + 1),
                ?2, ?3, ?4, ?5, ?8, 0, 0, ?6, ?7, ?7, ?9, ?10, ?11
           FROM analysis_requests WHERE tenant_id = ?1
         RETURNING request_id`,
      )
      .bind(
        this.tenantId,
        input.channelId,
        input.periodStart,
        input.periodEnd,
        input.instruction,
        input.createdBy,
        input.now,
        status,
        status === "実行中" ? input.now : null,
        input.retryOf ?? null,
        input.createdVia ?? "web",
      )
      .first<{ request_id: string }>();
    if (!row) throw new Error("analysis request was not inserted");
    return row.request_id;
  }

  async getRequest(requestId: string): Promise<AnalysisRequestRow | null> {
    return this.db
      .prepare("SELECT * FROM analysis_requests WHERE tenant_id = ?1 AND request_id = ?2")
      .bind(this.tenantId, requestId)
      .first<AnalysisRequestRow>();
  }

  /** 新しい順。cursor は直前ページ最後の created_at|request_id */
  async listRequests(limit: number, cursor?: { createdAt: string; requestId: string }) {
    const { results } = await this.db
      .prepare(
        `SELECT * FROM analysis_requests
          WHERE tenant_id = ?1
            AND (?2 IS NULL OR created_at < ?2 OR (created_at = ?2 AND request_id < ?3))
          ORDER BY created_at DESC, request_id DESC LIMIT ?4`,
      )
      .bind(this.tenantId, cursor?.createdAt ?? null, cursor?.requestId ?? "", limit)
      .all<AnalysisRequestRow>();
    return results;
  }

  /**
   * 状態を条件付きで更新する。from に含まれる状態のときだけ書き、変更件数を返す
   * （読んでから書くまでの間に別の更新が入っても、終端の状態を上書きしない）
   */
  async updateRequestState(
    requestId: string,
    from: readonly string[],
    patch: {
      status?: string;
      progress?: number;
      stage?: number;
      error?: string | null;
      startedAt?: string;
      finishedAt?: string;
      now: string;
    },
  ): Promise<number> {
    const placeholders = from.map((_, i) => `?${i + 9}`).join(", ");
    const res = await this.db
      .prepare(
        `UPDATE analysis_requests SET
           status = COALESCE(?3, status),
           progress = COALESCE(?4, progress),
           stage = COALESCE(?5, stage),
           error = CASE WHEN ?6 = 1 THEN ?7 ELSE error END,
           started_at = COALESCE(started_at, ?8),
           finished_at = COALESCE(finished_at, ?2),
           updated_at = ?1
         WHERE tenant_id = ?${from.length + 9} AND request_id = ?${from.length + 10}
           AND status IN (${placeholders})`,
      )
      .bind(
        patch.now,
        patch.finishedAt ?? null,
        patch.status ?? null,
        patch.progress ?? null,
        patch.stage ?? null,
        patch.error === undefined ? 0 : 1,
        patch.error ?? null,
        patch.startedAt ?? null,
        ...from,
        this.tenantId,
        requestId,
      )
      .run();
    return res.meta.changes ?? 0;
  }

  async nextVersion(channelId: string): Promise<number> {
    const row = await this.db
      .prepare(
        "SELECT COALESCE(MAX(version), 0) + 1 AS next FROM reports WHERE tenant_id = ?1 AND channel_id = ?2",
      )
      .bind(this.tenantId, channelId)
      .first<{ next: number }>();
    return row?.next ?? 1;
  }

  async getReportByIdempotencyKey(key: string): Promise<ReportRow | null> {
    return this.db
      .prepare(
        `SELECT ${REPORT_COLUMNS} FROM reports WHERE tenant_id = ?1 AND idempotency_key = ?2`,
      )
      .bind(this.tenantId, key)
      .first<ReportRow>();
  }

  async getReport(reportId: string): Promise<(ReportRow & { report_html: string }) | null> {
    return this.db
      .prepare(
        `SELECT ${REPORT_COLUMNS}, report_html FROM reports WHERE tenant_id = ?1 AND report_id = ?2`,
      )
      .bind(this.tenantId, reportId)
      .first();
  }

  /** チャンネルの全版（新しい順・HTML 本体は読まない）。一覧の検索窓とは別に、件数で切らない */
  async listChannelVersions(channelId: string) {
    const { results } = await this.db
      .prepare(
        `SELECT r.report_id, r.version, r.created_at,
                CASE WHEN a.report_id IS NULL THEN 0 ELSE 1 END AS archived
           FROM reports r
           LEFT JOIN report_archives a ON a.tenant_id = r.tenant_id AND a.report_id = r.report_id
          WHERE r.tenant_id = ?1 AND r.channel_id = ?2
          ORDER BY r.version DESC`,
      )
      .bind(this.tenantId, channelId)
      .all<{ report_id: string; version: number; created_at: string; archived: number }>();
    return results;
  }

  /**
   * 同じテナント・チャンネルの完了済みレポートを新しい順に最大 limit 版（HTML 本体は読まない）。
   * reports は依頼が完了したときだけ作られるので、reports の行 = 完了済みの分析。
   * アーカイブした版（report_archives）は次の分析の履歴に使わない（qa-090）
   */
  async recentReports(channelId: string, limit: number): Promise<ReportRow[]> {
    const { results } = await this.db
      .prepare(
        `SELECT ${REPORT_COLUMNS} FROM reports r
          WHERE tenant_id = ?1 AND channel_id = ?2
            AND NOT EXISTS (SELECT 1 FROM report_archives a
                             WHERE a.tenant_id = r.tenant_id AND a.report_id = r.report_id)
          ORDER BY version DESC LIMIT ?3`,
      )
      .bind(this.tenantId, channelId, limit)
      .all<ReportRow>();
    return results;
  }

  async findingsFor(reportIds: string[]) {
    if (!reportIds.length) return [];
    const ph = reportIds.map((_, i) => `?${i + 2}`).join(", ");
    const { results } = await this.db
      .prepare(
        `SELECT report_id, finding_no, kind, title, stage, metric, hypothesis_id, verdict
           FROM findings WHERE tenant_id = ?1 AND report_id IN (${ph})
          ORDER BY report_id, finding_no`,
      )
      .bind(this.tenantId, ...reportIds)
      .all<{
        report_id: string;
        finding_no: number;
        kind: string;
        title: string;
        stage: string | null;
        metric: string | null;
        hypothesis_id: string | null;
        verdict: string | null;
      }>();
    return results;
  }

  async listActions(channelId: string): Promise<ActionRow[]> {
    const { results } = await this.db
      .prepare(
        `SELECT action_id, report_id, title, stage, metric, baseline_value, target_value, result_value,
                status, judgement, created_at
           FROM actions WHERE tenant_id = ?1 AND channel_id = ?2
          ORDER BY created_at DESC, action_id`,
      )
      .bind(this.tenantId, channelId)
      .all<ActionRow>();
    return results;
  }

  /** 週次集計・Studio CSV・事業実績の書き出し行（境界テーブル analysis_export_rows） */
  async exportRows(channelId: string, from: string, to: string): Promise<ExportRow[]> {
    const rows = await ifTableExists(async () => {
      const { results } = await this.db
        .prepare(
          `SELECT source, period, video_id, metric, value FROM analysis_export_rows
            WHERE tenant_id = ?1 AND channel_id = ?2 AND period BETWEEN ?3 AND ?4
            ORDER BY period, source, video_id, metric`,
        )
        .bind(this.tenantId, channelId, from, to)
        .all<ExportRow>();
      return results;
    });
    return rows ?? [];
  }

  /** 原因指標の目標（境界テーブル analysis_export_targets。effective_from 以降に有効） */
  async exportTargets(channelId: string): Promise<TargetRow[]> {
    const rows = await ifTableExists(async () => {
      const { results } = await this.db
        .prepare(
          `SELECT metric_id, effective_from, target_value, min_sample FROM analysis_export_targets
            WHERE tenant_id = ?1 AND channel_id = ?2 ORDER BY metric_id, effective_from`,
        )
        .bind(this.tenantId, channelId)
        .all<TargetRow>();
      return results;
    });
    return rows ?? [];
  }

  /** 新しい版を追記し、依頼を完了にする（D1 の batch は1トランザクション）。 */
  async insertReport(r: NewReport): Promise<void> {
    const stmts: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO reports (tenant_id, report_id, channel_id, request_id, version, title, summary,
             conclusion, outcome, candidate_stage, candidate_metric, period_start, period_end,
             brief_json, results_json, history_review_json, ideas_json, actions_json,
             history_versions_used, report_html, idempotency_key, created_by, created_at)
           VALUES (?1, ?2, ?3,
                   (SELECT request_id FROM analysis_requests
                     WHERE tenant_id = ?1 AND request_id = ?4 AND status IN (${activeIn(24)})),
                   ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18,
                   ?19, ?20, ?21, ?22, ?23)`,
        )
        .bind(
          this.tenantId,
          r.reportId,
          r.channelId,
          r.requestId,
          r.version,
          r.title,
          r.summary,
          r.conclusion,
          r.outcome,
          r.candidateStage,
          r.candidateMetric,
          r.periodStart,
          r.periodEnd,
          r.briefJson,
          r.resultsJson,
          r.historyReviewJson,
          r.ideasJson,
          r.actionsJson,
          r.historyVersionsUsed,
          r.reportHtml,
          r.idempotencyKey,
          r.createdBy,
          r.now,
          ...ACTIVE_STATUSES,
        ),
      ...r.findings.map((f, i) =>
        this.db
          .prepare(
            `INSERT INTO findings (tenant_id, report_id, finding_no, kind, title, fact, interpretation,
               stage, metric, hypothesis_id, falsifier, verdict, evidence_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
          )
          .bind(
            this.tenantId,
            r.reportId,
            i + 1,
            f.kind,
            f.title,
            f.fact,
            f.interpretation,
            f.stage,
            f.metric,
            f.hypothesisId,
            f.falsifier,
            f.verdict,
            f.evidenceJson,
          ),
      ),
      ...r.psych.map((p, i) =>
        this.db
          .prepare(
            `INSERT INTO psych_findings (tenant_id, report_id, finding_no, layer, claim, evidence_json,
               counter_hypothesis, confidence) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
          )
          .bind(
            this.tenantId,
            r.reportId,
            i + 1,
            p.layer,
            p.claim,
            p.evidenceJson,
            p.counterHypothesis,
            p.confidence,
          ),
      ),
      ...r.emotions.map((e) =>
        this.db
          .prepare(
            `INSERT INTO comment_emotions (tenant_id, report_id, comment_id, emotion, intent)
             VALUES (?1, ?2, ?3, ?4, ?5)`,
          )
          .bind(this.tenantId, r.reportId, e.commentId, e.emotion, e.intent),
      ),
      this.db
        .prepare(
          `UPDATE analysis_requests SET status = '完了', progress = 100, stage = 3, error = NULL,
             report_id = ?3, started_at = COALESCE(started_at, ?4), finished_at = ?4, updated_at = ?4
           WHERE tenant_id = ?1 AND request_id = ?2 AND status IN (${activeIn(5)})`,
        )
        .bind(this.tenantId, r.requestId, r.reportId, r.now, ...ACTIVE_STATUSES),
    ];
    await this.db.batch(stmts);
  }

  /** 待機中・実行中の依頼だけを取消にする（終端からは動かさない・変更件数を返す） */
  async cancelRequest(requestId: string, by: string, now: string): Promise<number> {
    const res = await this.db
      .prepare(
        `UPDATE analysis_requests SET status = '取消', canceled_at = ?3, canceled_by = ?4,
           finished_at = ?3, updated_at = ?3
         WHERE tenant_id = ?1 AND request_id = ?2 AND status IN (${activeIn(5)})`,
      )
      .bind(this.tenantId, requestId, now, by, ...ACTIVE_STATUSES)
      .run();
    return res.meta.changes ?? 0;
  }

  /** 取込で作った依頼の後始末（結果が保存できなかったときだけ使う・完了済みは消さない） */
  async deleteUnfinishedRequest(requestId: string): Promise<void> {
    await this.db
      .prepare(
        `DELETE FROM analysis_requests
          WHERE tenant_id = ?1 AND request_id = ?2 AND status IN (${activeIn(3)})`,
      )
      .bind(this.tenantId, requestId, ...ACTIVE_STATUSES)
      .run();
  }

  async getReportByVersion(
    channelId: string,
    version: number,
  ): Promise<(ReportRow & { report_html: string }) | null> {
    return this.db
      .prepare(
        `SELECT ${REPORT_COLUMNS}, report_html FROM reports
          WHERE tenant_id = ?1 AND channel_id = ?2 AND version = ?3`,
      )
      .bind(this.tenantId, channelId, version)
      .first();
  }

  /**
   * レポート一覧（新しい版から最大 REPORT_SEARCH_WINDOW 版の中で、名前・要約の部分一致）。
   * includeArchived=false ならアーカイブした版を除く。cursor は直前ページ最後の版番号
   */
  async listReports(opts: {
    q: string;
    includeArchived: boolean;
    limit: number;
    beforeVersion?: number;
  }): Promise<ReportListRow[]> {
    const like = opts.q ? `%${escapeLike(opts.q)}%` : null;
    const { results } = await this.db
      .prepare(
        `SELECT w.*, CASE WHEN a.report_id IS NULL THEN 0 ELSE 1 END AS archived
           FROM (SELECT report_id, channel_id, request_id, version, title, summary, outcome,
                        period_start, period_end, created_at
                   FROM reports WHERE tenant_id = ?1
                  ORDER BY created_at DESC, version DESC LIMIT ?2) w
           LEFT JOIN report_archives a ON a.tenant_id = ?1 AND a.report_id = w.report_id
          WHERE (?3 IS NULL OR w.title LIKE ?3 ESCAPE '\\' OR w.summary LIKE ?3 ESCAPE '\\')
            AND (?4 = 1 OR a.report_id IS NULL)
            AND (?5 IS NULL OR w.version < ?5)
          ORDER BY w.version DESC LIMIT ?6`,
      )
      .bind(
        this.tenantId,
        REPORT_SEARCH_WINDOW,
        like,
        opts.includeArchived ? 1 : 0,
        opts.beforeVersion ?? null,
        opts.limit,
      )
      .all<ReportListRow>();
    return results;
  }

  async isArchived(reportId: string): Promise<boolean> {
    const row = await this.db
      .prepare("SELECT 1 AS x FROM report_archives WHERE tenant_id = ?1 AND report_id = ?2")
      .bind(this.tenantId, reportId)
      .first();
    return row !== null;
  }

  /** アーカイブ（既にあれば何もしない）。reports の行は変えない */
  async archiveReport(reportId: string, by: string, now: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO report_archives (tenant_id, report_id, archived_by, archived_at)
         VALUES (?1, ?2, ?3, ?4) ON CONFLICT (tenant_id, report_id) DO NOTHING`,
      )
      .bind(this.tenantId, reportId, by, now)
      .run();
  }

  async unarchiveReport(reportId: string): Promise<void> {
    await this.db
      .prepare("DELETE FROM report_archives WHERE tenant_id = ?1 AND report_id = ?2")
      .bind(this.tenantId, reportId)
      .run();
  }

  /** このレポート版から登録したアクション（source_key で版内のどのアクションかが分かる） */
  async actionsFromReport(reportId: string): Promise<SourcedActionRow[]> {
    const { results } = await this.db
      .prepare(
        `SELECT action_id, report_id, title, stage, metric, baseline_value, target_value, result_value,
                status, judgement, created_at, source_key
           FROM actions WHERE tenant_id = ?1 AND source_report_id = ?2
          ORDER BY source_key`,
      )
      .bind(this.tenantId, reportId)
      .all<SourcedActionRow>();
    return results;
  }

  /**
   * 選んだアクションを登録する。同じ版・同じキーは一意索引で弾かれ、既存の行を残す
   * （改善アクション集約だけを書き、レポート版は読むだけ）
   */
  async insertActionsFromReport(
    report: { report_id: string; channel_id: string },
    items: {
      actionId: string;
      key: string;
      title: string;
      stage: string;
      metric: string;
      baselineValue: number | null;
      targetValue: number | null;
    }[],
    by: string,
    now: string,
  ): Promise<void> {
    if (!items.length) return;
    await this.db.batch(
      items.map((a) =>
        this.db
          .prepare(
            `INSERT INTO actions (tenant_id, action_id, channel_id, report_id, title, stage, metric,
               baseline_value, target_value, created_by, created_at, updated_at, source_report_id,
               source_key)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11, ?4, ?12)
             ON CONFLICT (tenant_id, source_report_id, source_key) DO NOTHING`,
          )
          .bind(
            this.tenantId,
            a.actionId,
            report.channel_id,
            report.report_id,
            a.title,
            a.stage,
            a.metric,
            a.baselineValue,
            a.targetValue,
            by,
            now,
            a.key,
          ),
      ),
    );
  }

  /**
   * 分析に使うデータの件数と内訳（from〜to は YYYY-MM-DD）。
   * 依存 feature（日次収集・CSV取込）の表がまだ無い（または列が違う）項目は null（画面は「未取得」）
   */
  async dataSummary(channelId: string, from: string, to: string) {
    const t = this.tenantId;
    const count = (stmt: () => D1PreparedStatement) =>
      ifTableExists(async () => (await stmt().first<{ n: number }>())?.n ?? 0);
    const groups = (stmt: () => D1PreparedStatement) =>
      ifTableExists(async () => (await stmt().all<{ key: string; n: number }>()).results);
    const [dailyMetrics, videos, transcripts, sceneImages, comments, csvImports, exportRows] =
      await Promise.all([
        count(() =>
          this.db
            .prepare(
              `SELECT COUNT(*) AS n FROM daily_metrics
                WHERE tenant_id = ?1 AND channel_id = ?2 AND date BETWEEN ?3 AND ?4`,
            )
            .bind(t, channelId, from, to),
        ),
        count(() =>
          this.db
            .prepare("SELECT COUNT(*) AS n FROM videos WHERE tenant_id = ?1 AND channel_id = ?2")
            .bind(t, channelId),
        ),
        count(() =>
          this.db
            .prepare("SELECT COUNT(DISTINCT video_id) AS n FROM transcripts WHERE tenant_id = ?1")
            .bind(t),
        ),
        count(() =>
          this.db
            .prepare(
              "SELECT COUNT(*) AS n FROM media_assets WHERE tenant_id = ?1 AND kind = 'scene'",
            )
            .bind(t),
        ),
        count(() =>
          this.db
            .prepare(
              "SELECT COUNT(*) AS n FROM comments WHERE tenant_id = ?1 AND published_at BETWEEN ?2 AND ?3",
            )
            .bind(t, from, `${to}T23:59:59.999Z`),
        ),
        groups(() =>
          this.db
            .prepare(
              `SELECT kind AS key, COUNT(*) AS n FROM csv_imports
                WHERE tenant_id = ?1 GROUP BY kind ORDER BY kind`,
            )
            .bind(t),
        ),
        groups(() =>
          this.db
            .prepare(
              `SELECT source AS key, COUNT(*) AS n FROM analysis_export_rows
                WHERE tenant_id = ?1 AND channel_id = ?2 AND period BETWEEN ?3 AND ?4
                GROUP BY source ORDER BY source`,
            )
            .bind(t, channelId, from, to),
        ),
      ]);
    return {
      counts: { dailyMetrics, videos, transcripts, sceneImages, comments },
      csvImports,
      exportRows,
    };
  }

  async psychFor(reportId: string) {
    const { results } = await this.db
      .prepare(
        `SELECT finding_no, layer, claim, evidence_json, counter_hypothesis, confidence
           FROM psych_findings WHERE tenant_id = ?1 AND report_id = ?2 ORDER BY finding_no`,
      )
      .bind(this.tenantId, reportId)
      .all<{
        finding_no: number;
        layer: string;
        claim: string;
        evidence_json: string;
        counter_hypothesis: string | null;
        confidence: number;
      }>();
    return results;
  }

  async emotionsFor(reportId: string) {
    const { results } = await this.db
      .prepare(
        `SELECT comment_id, emotion, intent FROM comment_emotions
          WHERE tenant_id = ?1 AND report_id = ?2 ORDER BY comment_id`,
      )
      .bind(this.tenantId, reportId)
      .all<{ comment_id: string; emotion: string; intent: string | null }>();
    return results;
  }

  async findingsDetail(reportId: string) {
    const { results } = await this.db
      .prepare(
        `SELECT finding_no, kind, title, fact, interpretation, stage, metric, hypothesis_id, falsifier,
                verdict, evidence_json
           FROM findings WHERE tenant_id = ?1 AND report_id = ?2 ORDER BY finding_no`,
      )
      .bind(this.tenantId, reportId)
      .all<{
        finding_no: number;
        kind: string;
        title: string;
        fact: string | null;
        interpretation: string | null;
        stage: string | null;
        metric: string | null;
        hypothesis_id: string | null;
        falsifier: string | null;
        verdict: string | null;
        evidence_json: string;
      }>();
    return results;
  }

  /** 文字起こしは取り直しで丸ごと置き換える（同じ動画・同じ取得元の以前の行を消してから入れる） */
  async replaceTranscript(input: {
    videoId: string;
    source: string;
    segments: { start_ms: number; end_ms: number; text: string }[];
    requestId: string | null;
    now: string;
  }): Promise<void> {
    const stmts: D1PreparedStatement[] = [
      this.db
        .prepare("DELETE FROM transcripts WHERE tenant_id = ?1 AND video_id = ?2 AND source = ?3")
        .bind(this.tenantId, input.videoId, input.source),
      ...input.segments.map((s, i) =>
        this.db
          .prepare(
            `INSERT INTO transcripts (tenant_id, video_id, source, seq, start_ms, end_ms, text,
               request_id, fetched_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
          )
          .bind(
            this.tenantId,
            input.videoId,
            input.source,
            i + 1,
            s.start_ms,
            s.end_ms,
            s.text,
            input.requestId,
            input.now,
          ),
      ),
    ];
    await this.db.batch(stmts);
  }

  async insertMediaAsset(input: {
    assetId: string;
    videoId: string;
    kind: string;
    atMs: number | null;
    r2Key: string;
    contentType: string;
    width: number | null;
    height: number | null;
    bytes: number;
    requestId: string | null;
    now: string;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO media_assets (tenant_id, asset_id, video_id, kind, at_ms, r2_key, content_type,
           width, height, bytes, request_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
      )
      .bind(
        this.tenantId,
        input.assetId,
        input.videoId,
        input.kind,
        input.atMs,
        input.r2Key,
        input.contentType,
        input.width,
        input.height,
        input.bytes,
        input.requestId,
        input.now,
      )
      .run();
  }
}
