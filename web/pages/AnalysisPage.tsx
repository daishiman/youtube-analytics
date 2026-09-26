// AI分析画面（docs/screens/03-ai-analysis.png・qa-089〜qa-097）。
// ①依頼 ②実行状況 ③レポート（一覧・取込 / 詳細）と下部の選択中の依頼バー。
// 選択中の依頼は ?request=A-xxxx、レポートは ?report=<id>&v=<版> で持ち、再読込でも復元する
import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router";
import { type AnalysisRequest, analysisApi } from "../api";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { useQueryPatch } from "../period";
import { isActive, useLatestFetch, useRequests, useVisiblePolling } from "./analysis/hooks";
import { ReportDetail } from "./analysis/ReportDetail";
import { ReportList } from "./analysis/ReportList";
import { RequestPanel } from "./analysis/RequestPanel";
import { RequestStatusTable } from "./analysis/RequestStatusTable";
import { ResultImportPanel } from "./analysis/ResultImportPanel";
import { SelectionBar } from "./analysis/SelectionBar";
import type { ShellContext } from "./shell-context";

export function AnalysisPage() {
  const { me } = useOutletContext<ShellContext>();
  const tenant = me.currentTenant;
  if (!tenant) return null;
  // テナントを切り替えたら画面の状態を作り直す
  return <AnalysisScreen key={tenant.tenantId} canWrite={tenant.role !== "viewer"} />;
}

function AnalysisScreen({ canWrite }: { canWrite: boolean }) {
  const [params, setQuery] = useQueryPatch();
  const requestId = params.get("request");
  const reportId = params.get("report");
  const vRaw = Number(params.get("v"));
  const version = Number.isInteger(vRaw) && vRaw > 0 ? vRaw : null;
  const { items, error, load } = useRequests();
  const [listKey, setListKey] = useState(0);
  const [detailKey, setDetailKey] = useState(0);
  const [howTo, setHowTo] = useState(false);
  // 一覧（最新20件）に無い依頼を ?request= で開いたときの補い
  const [extra, setExtra] = useState<AnalysisRequest | null>(null);
  const fetchExtra = useLatestFetch();

  const inList = items?.find((r) => r.requestId === requestId) ?? null;
  const selected = inList ?? (extra?.requestId === requestId ? extra : null);
  const listLoaded = items !== null;
  const listed = inList !== null;

  useEffect(() => {
    if (!requestId || !listLoaded || listed) return;
    void fetchExtra(
      (signal) => analysisApi.getRequest(requestId, signal),
      setExtra,
      () => setQuery({ request: null }),
    );
  }, [requestId, listLoaded, listed, fetchExtra, setQuery]);

  // 最新20件の外にある選択中の依頼も、実行中は可視タブでだけ更新する。
  // 一時的な取得失敗でも、選択と最後に取得した状態は残して次回再取得する
  const refreshExtra = useCallback(() => {
    if (requestId) void fetchExtra((signal) => analysisApi.getRequest(requestId, signal), setExtra);
  }, [requestId, fetchExtra]);
  useVisiblePolling(
    refreshExtra,
    requestId !== null && !listed && extra?.requestId === requestId && isActive(extra),
  );

  const selectRequest = (r: AnalysisRequest) => setQuery({ request: r.requestId });
  const openReportOf = (r: AnalysisRequest) =>
    r.reportId && setQuery({ request: r.requestId, report: r.reportId, v: null });

  return (
    <div className="page analysis-page">
      <PageHeader
        title="AI分析"
        lead="AIに分析を依頼し、根拠と版を確認しますか？ 依頼→実行状況→レポートの順に進みます。"
        actions={
          <button type="button" className="link-button" onClick={() => setHowTo(true)}>
            AI分析の使い方
          </button>
        }
      />
      <RequestPanel
        canWrite={canWrite}
        onCreated={(r) => {
          setQuery({ request: r.requestId });
          void load();
        }}
      />
      <RequestStatusTable
        items={items}
        error={error}
        canWrite={canWrite}
        selectedId={requestId}
        onSelect={selectRequest}
        onOpenReport={openReportOf}
        onChanged={async (r) => {
          if (r) setQuery({ request: r.requestId });
          await load();
        }}
      />
      <SectionCard id="analysis-reports" title="③ レポート">
        <div className="analysis-report-grid">
          <div className="stack">
            <ReportList
              selectedId={reportId}
              refreshKey={listKey}
              onSelect={(r) => setQuery({ report: r.reportId, v: null, request: r.requestId })}
            />
            {canWrite && (
              <ResultImportPanel
                selectedRequest={selected}
                onImported={async (report) => {
                  setQuery({ request: report.requestId, report: report.reportId, v: null });
                  setListKey((n) => n + 1);
                  await load();
                }}
              />
            )}
          </div>
          <div>
            {reportId ? (
              <ReportDetail
                reportId={reportId}
                version={version}
                canWrite={canWrite}
                refreshKey={detailKey}
                onOpenVersion={(id, v) => setQuery({ report: id, v: String(v) })}
                onChanged={() => {
                  setListKey((n) => n + 1);
                  setDetailKey((n) => n + 1);
                }}
              />
            ) : (
              <p className="muted">左の一覧からレポートを選ぶと、ここに詳細が出ます。</p>
            )}
          </div>
        </div>
      </SectionCard>
      <SelectionBar request={selected} onOpen={openReportOf} />
      <Modal
        open={howTo}
        title="AI分析の使い方"
        onClose={() => setHowTo(false)}
        closeLabel="閉じる"
      >
        <ol className="stack">
          <li>① 依頼で期間と補足指示を決め、「Claude Code用プロンプトをコピー」を押します。</li>
          <li>Claude Code に貼り付けて実行します（/yt-analyze）。進捗は ② 実行状況に出ます。</li>
          <li>
            結果は自動で届きます。届かないときは Claude Code が出した結果JSONを ③
            の「結果の取り込み」に貼り付けます。
          </li>
          <li>レポートの「次に取るべきアクション」を選んで、改善アクションに登録します。</li>
        </ol>
      </Modal>
    </div>
  );
}
