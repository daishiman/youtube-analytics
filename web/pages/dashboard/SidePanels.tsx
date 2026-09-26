// 右カラム: 最新AI分析と実施中の改善アクション（qa-101）。AI の文章はテキストとしてだけ描く（HTML として解釈しない）
import { Link } from "react-router";
import type { DashboardResponse } from "../../api";
import { SectionCard } from "../../components/SectionCard";
import { StatusBadge } from "../../components/StatusBadge";
import { formatDate } from "../../format";
import { fmtMetric } from "./format";

// カードだけを見ても、上の選択で中身が変わると誤解しないように各カードで明示する
const NOT_LINKED = "期間・動画の選択には連動しません。";

export function LatestReport({ data }: { data: DashboardResponse }) {
  const report = data.latestReport;
  return (
    <SectionCard id="latest-report" title="最新のAI分析" description={NOT_LINKED}>
      {report ? (
        <>
          <p className="report-title">
            <strong>{report.title}</strong> <span className="badge">第{report.version}版</span>
          </p>
          <p className="small muted">{formatDate(report.createdAt)} 作成</p>
          {report.conclusion && <p className="report-conclusion">{report.conclusion}</p>}
          {report.findings.length > 0 && (
            <>
              <h3>主な発見</h3>
              <ol className="findings">
                {report.findings.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ol>
            </>
          )}
          <p className="small">
            <Link to={`/analysis?report=${encodeURIComponent(report.reportId)}`}>
              レポートの詳細を見る
            </Link>
          </p>
        </>
      ) : (
        <EmptyNote
          title="まだAI分析のレポートがありません"
          body="AI分析の画面から分析を依頼すると、ここに最新の結論が出ます。"
          to="/analysis"
          action="AI分析を開く"
        />
      )}
    </SectionCard>
  );
}

export function ActiveActions({ data }: { data: DashboardResponse }) {
  return (
    <SectionCard id="active-actions" title="実施中の改善アクション" description={NOT_LINKED}>
      {data.actions.length === 0 ? (
        <EmptyNote
          title="実施中の改善アクションはありません"
          body="改善アクションの登録画面は準備中です。"
        />
      ) : (
        <>
          <ul className="action-list">
            {data.actions.map((a) => (
              <li key={a.actionId} className="action-item">
                <div className="action-head">
                  <StatusBadge tone={a.status === "実施中" ? "ok" : "warn"}>{a.status}</StatusBadge>
                </div>
                <p className="action-title">{a.title}</p>
                {a.metricLabel && (
                  <p className="small">
                    {a.metricLabel}: {fmtMetric(a.baselineValue, a.unit)} →{" "}
                    <strong>{fmtMetric(a.latestValue, a.unit)}</strong>
                  </p>
                )}
              </li>
            ))}
          </ul>
          <p className="small muted">内容の編集と状態の更新は準備中です。</p>
        </>
      )}
    </SectionCard>
  );
}

/** 空状態（何が無いか＋次の一手）。qa-101 の5種で共通の形 */
export function EmptyNote({
  title,
  body,
  to,
  action,
  external,
}: {
  title: string;
  body: string;
  to?: string;
  action?: string;
  external?: boolean;
}) {
  return (
    <div className="empty-note">
      <p className="empty-title">{title}</p>
      <p className="muted small">{body}</p>
      {to &&
        action &&
        (external ? (
          <a className="button empty-action" href={to}>
            {action}
          </a>
        ) : (
          <Link className="button empty-action" to={to}>
            {action}
          </Link>
        ))}
    </div>
  );
}
