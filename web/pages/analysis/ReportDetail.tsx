// ③右: レポート詳細。見出し（版・作成日時・対象期間・作成元）とタブ
// （要約/視聴者心理/コメント感情/離脱場面/根拠データ/HTMLレポート）。各タブの中身は report/ に置く
import { useCallback, useState } from "react";
import { CREATED_VIA_LABELS } from "../../../src/domain/analysis";
import { analysisApi } from "../../api";
import { formatDateTime } from "../../components/AppShell";
import { StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../components/Toast";
import { errorText } from "../shell-context";
import { formatRange } from "./format";
import { useLoad } from "./hooks";
import { DropoffTab } from "./report/DropoffTab";
import { EmotionTab } from "./report/EmotionTab";
import { EvidenceTab } from "./report/EvidenceTab";
import { PsychTab } from "./report/PsychTab";
import { SummaryTab } from "./report/SummaryTab";

const TABS = [
  "要約",
  "視聴者心理",
  "コメント感情",
  "離脱場面",
  "根拠データ",
  "HTMLレポート",
] as const;
type Tab = (typeof TABS)[number];

export function ReportDetail({
  reportId,
  version,
  canWrite,
  refreshKey,
  onOpenVersion,
  onChanged,
}: {
  reportId: string;
  version: number | null;
  canWrite: boolean;
  refreshKey: number;
  onOpenVersion: (reportId: string, version: number) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey は読み直しの合図
  const fetchReport = useCallback(
    (signal: AbortSignal) => analysisApi.getReport(reportId, version ?? undefined, signal),
    [reportId, version, refreshKey],
  );
  const { data: detail, error, reload } = useLoad(fetchReport);
  const [tab, setTab] = useState<Tab>("要約");
  const [busy, setBusy] = useState(false);
  const [archiveError, setArchiveError] = useState("");

  async function toggleArchive() {
    if (!detail || busy) return;
    setBusy(true);
    setArchiveError("");
    try {
      if (detail.archived) {
        await analysisApi.unarchive(detail.reportId);
        toast(`v${detail.version} を一覧に戻しました。`);
      } else {
        await analysisApi.archive(detail.reportId);
        toast(`v${detail.version} をアーカイブしました。次の分析の履歴にも使いません。`);
      }
      void reload();
      onChanged();
    } catch (err) {
      setArchiveError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (error)
    return (
      <p role="alert" className="alert">
        {error}
      </p>
    );
  if (!detail) return <p className="muted">読み込み中…</p>;

  return (
    <article className="report-detail stack" aria-labelledby="report-title">
      <header className="report-head">
        <div>
          <h3 id="report-title">{detail.title}</h3>
          <p className="row tight wrap">
            <span>v{detail.version}</span>
            {detail.isLatest && <StatusBadge tone="ok">最新版</StatusBadge>}
            {detail.archived && <StatusBadge tone="neutral">アーカイブ</StatusBadge>}
          </p>
          <dl className="meta">
            <div>
              <dt>作成日時</dt>
              <dd>{formatDateTime(detail.createdAt)}</dd>
            </div>
            <div>
              <dt>対象期間</dt>
              <dd>{formatRange(detail.periodStart, detail.periodEnd)}</dd>
            </div>
            <div>
              <dt>作成元</dt>
              <dd>
                {detail.createdVia ? CREATED_VIA_LABELS[detail.createdVia] : "—"}（依頼{" "}
                {detail.requestId}）
              </dd>
            </div>
            <div>
              <dt>ステータス</dt>
              <dd>{detail.requestStatus ?? "—"}</dd>
            </div>
          </dl>
        </div>
        {canWrite && (
          <button
            type="button"
            className="button"
            onClick={() => void toggleArchive()}
            disabled={busy}
          >
            {detail.archived ? "元に戻す" : "アーカイブ"}
          </button>
        )}
      </header>
      {archiveError && (
        <p role="alert" className="alert">
          {archiveError}
        </p>
      )}

      <div className="tabs" role="tablist" aria-label="レポートの内容">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={`report-tab-${t}`}
            aria-selected={tab === t}
            aria-controls="report-tabpanel"
            className={tab === t ? "tab active" : "tab"}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div id="report-tabpanel" role="tabpanel" aria-labelledby={`report-tab-${tab}`}>
        {tab === "要約" && (
          <SummaryTab
            key={detail.reportId}
            detail={detail}
            canWrite={canWrite}
            onRegistered={() => void reload()}
            onOpenVersion={onOpenVersion}
          />
        )}
        {tab === "視聴者心理" && <PsychTab detail={detail} />}
        {tab === "コメント感情" && <EmotionTab detail={detail} />}
        {tab === "離脱場面" && <DropoffTab />}
        {tab === "根拠データ" && <EvidenceTab detail={detail} />}
        {tab === "HTMLレポート" && (
          <iframe
            title={`${detail.title} のHTMLレポート`}
            className="report-frame"
            sandbox=""
            srcDoc={detail.reportHtml}
          />
        )}
      </div>
    </article>
  );
}
