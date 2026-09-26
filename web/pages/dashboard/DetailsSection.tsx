// 「詳しく見る」: 週次ファネル（遅延取得）とデータ品質。構成比の再掲はしない。
import type { EChartsCoreOption } from "echarts/core";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  api,
  type DashboardResponse,
  type FunnelResponse,
  type PendingReason,
  type ReportingReportsResponse,
  type ReportingSyncSummary,
  type ReportTypesResponse,
} from "../../api";
import { Alert, Loading } from "../../components/Alert";
import { EChart } from "../../components/EChart";
import { Pager } from "../../components/Pager";
import { StatusBadge } from "../../components/StatusBadge";
import { fmtNumber, formatDateTime } from "../../format";
import { useApi } from "../../useApi";
import { errorText } from "../shell-context";
import { AnalyticsRawPanel } from "./AnalyticsRawPanel";
import { chartColors } from "./chartColors";
import { fmtActual, fmtShare, shortDate, slashDate } from "./format";

/** リーチ指標へ反映できる唯一のレポート種別（サーバの REACH_BASIC_REPORT_TYPE と同じ値。値の import は bundle にサーバ実装を持ち込むため複製する） */
const REACH_BASIC_REPORT_TYPE = "channel_reach_basic_a1";

const REASON_TEXT: Record<PendingReason, string> = {
  missing_input: "入力がありません",
  zero_denominator: "分母が0です",
  target_missing: "目標が未設定です",
  min_sample_not_met: "件数が判定に必要な数に届いていません",
  stale: "週次入力が未完了か、週末後の取込を確認できません",
};

export function DetailsSection({
  data,
  canSyncReporting,
}: {
  data: DashboardResponse;
  canSyncReporting: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="card details"
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary>
        <span className="details-title">詳しく見る</span>
        <span className="small muted">週次売上ファネル・データの反映状況</span>
      </summary>
      {open && (
        <div className="details-body">
          <FunnelPanel />
          <DataQuality data={data} />
          <AnalyticsRawPanel />
          <ReportAvailabilityPanel canSync={canSyncReporting} />
        </div>
      )}
    </details>
  );
}

function FunnelPanel() {
  const [week, setWeek] = useState<string | null>(null);
  const [data, setData] = useState<FunnelResponse | null>(null);
  const [error, setError] = useState("");

  // 週を切り替える間も前の週の表示（週の選択欄）を残すため、useApi は使わない
  useEffect(() => {
    const ctrl = new AbortController();
    setError("");
    api<FunnelResponse>(`/api/dashboard/funnel${week ? `?week=${week}` : ""}`, {
      signal: ctrl.signal,
    })
      .then(setData)
      .catch((e) => {
        if (!ctrl.signal.aborted) setError(errorText(e));
      });
    return () => ctrl.abort();
  }, [week]);

  const option = useMemo<EChartsCoreOption | null>(() => {
    if (!data || data.history.length === 0) return null;
    const colors = chartColors();
    const metric = (id: string) =>
      data.history.map((h) => h.metrics.find((m) => m.id === id)?.actual ?? null);
    return {
      animation: false,
      grid: { left: 40, right: 40, top: 32, bottom: 28 },
      tooltip: { trigger: "axis", renderMode: "richText" },
      legend: { top: 0 },
      xAxis: { type: "category", data: data.history.map((h) => shortDate(h.weekStart)) },
      yAxis: [
        { type: "value", name: "%" },
        { type: "value", name: "回", splitLine: { show: false } },
      ],
      series: [
        { name: "CTR", type: "line", data: metric("ctr"), itemStyle: { color: colors.indigo } },
        {
          name: "視聴率（暫定）",
          type: "line",
          data: metric("weighted_retention_m1"),
          itemStyle: { color: colors.magenta },
        },
        {
          name: "インプレッション",
          type: "bar",
          yAxisIndex: 1,
          data: metric("impressions"),
          itemStyle: { color: colors.softIndigo },
        },
      ],
    };
  }, [data]);

  return (
    <section className="details-block" aria-labelledby="funnel-heading">
      <h3 id="funnel-heading">週次売上ファネル</h3>
      <p className="small muted">
        チャンネル全体の確定週を表示します。上の期間・動画の選択には連動しません。
      </p>
      <Alert>{error}</Alert>
      {!data && !error && <Loading small />}
      {data && !data.week && (
        <p className="muted">
          週次事業CSVの取込後に表示します。まだ保存された週次データがありません。
        </p>
      )}
      {data?.week && (
        <>
          <div className="row funnel-week">
            <label className="small">
              対象週{" "}
              <select value={data.week.weekStart} onChange={(e) => setWeek(e.target.value)}>
                {[...data.history].reverse().map((h) => (
                  <option key={h.weekStart} value={h.weekStart}>
                    {slashDate(h.weekStart)} の週
                  </option>
                ))}
              </select>
            </label>
            {data.week.stale && <StatusBadge tone="warn">鮮度切れ・判定保留</StatusBadge>}
          </div>
          <dl className="funnel-results">
            <div>
              <dt>売上</dt>
              <dd>
                {data.week.results.revenueJpy === null
                  ? "—"
                  : `${fmtNumber(data.week.results.revenueJpy)}円`}
              </dd>
            </div>
            <div>
              <dt>成約数</dt>
              <dd>{fmtNumber(data.week.results.closedDeals)}件</dd>
            </div>
            <div>
              <dt>登録者の増減（参考）</dt>
              <dd>{fmtNumber(data.week.results.subscribersNet)}人</dd>
            </div>
          </dl>
          <p className="small muted">
            登録者の増減は、Analytics の太平洋時間の日付をそのまま JST
            の週に入れた参考値です。週の境目が16〜17時間ずれます。
          </p>
          <ol className="funnel-steps">
            {data.week.metrics.map((m) => (
              <li
                key={m.id}
                className={data.week?.candidate?.metricId === m.id ? "candidate" : undefined}
              >
                <span className="funnel-label">{m.label}</span>
                <span className="funnel-value">
                  {fmtActual(m)}
                  <span className="small muted">
                    {" "}
                    / 目標 {m.target === null ? "—" : fmtActual({ actual: m.target, unit: m.unit })}
                  </span>
                </span>
                {m.status === "ok" ? (
                  <StatusBadge tone={(m.target_gap ?? 0) >= 0 ? "ok" : "danger"}>
                    {(m.target_gap ?? 0) >= 0 ? "目標達成" : "目標未達"}（目標差{" "}
                    {(m.target_gap ?? 0) > 0 ? "+" : ""}
                    {fmtShare(m.target_gap)}）
                  </StatusBadge>
                ) : (
                  <span className="small muted">
                    判定保留: {m.reasons.map((r) => REASON_TEXT[r]).join("・")}
                  </span>
                )}
              </li>
            ))}
          </ol>
          <p className="funnel-candidate">
            {data.week.allTargetsMet
              ? "全ての段が目標に届いています。"
              : data.week.candidate
                ? `改善候補: 「${data.week.candidate.label}」が目標との差が最も大きい段です。`
                : "判定できる段が足りないため、改善候補は出していません。"}
          </p>
          {option && (
            <EChart
              option={option}
              label="直近12週の CTR・長尺視聴率（暫定）・インプレッションの推移"
              height={220}
            />
          )}
          <p className="small muted">{data.disclaimer}</p>
        </>
      )}
    </section>
  );
}

function DataQuality({ data }: { data: DashboardResponse }) {
  return (
    <section className="details-block" aria-labelledby="quality-heading">
      <h3 id="quality-heading">データ品質</h3>
      <ul className="quality-list">
        <li>
          {!data.empty.notCollected ? (
            <StatusBadge tone="ok">日次指標あり</StatusBadge>
          ) : (
            <StatusBadge tone="warn">日次指標なし</StatusBadge>
          )}
          <span className="small">最終記録 {formatDateTime(data.collection.lastSucceededAt)}</span>
        </li>
        <li>
          {data.empty.noCsv ? (
            <StatusBadge tone="warn">視聴率データなし</StatusBadge>
          ) : (
            <StatusBadge tone="ok">視聴率データあり</StatusBadge>
          )}
          <span className="small">表示中の対象・期間で計算できる長尺動画の平均視聴率（暫定）</span>
        </li>
        <li>
          <StatusBadge
            tone={data.collection.status.startsWith("収集失敗あり") ? "danger" : "neutral"}
          >
            {data.collection.status}
          </StatusBadge>
          <span className="small">
            Analyticsのチャンネル・動画日次と、流入元・端末・地域の別系列を収集します。視聴者属性・維持曲線は未収集です
          </span>
        </li>
        <li>
          <StatusBadge tone="warn">Studio CSVは部分取込</StatusBadge>
          <span className="small">
            事業週次CSVはファネルへ反映します。Studio
            CSVは既知列を保存し、未対応列と期間未確定を分けて表示します
          </span>
        </li>
      </ul>
      <p className="small muted">
        現在の主画面は視聴回数・再生時間・登録者増減・暫定視聴率・動画別CTRなどを表示します。流入元は下の原データで確認できます。視聴者属性、動画の維持曲線、Studio
        CSVからの正式M1と派生指標M2〜M10は、取得・解析と詳細画面の整備が必要です。
      </p>
      <p className="small muted">
        API日次の「日付」はYouTubeの太平洋時間の集計日です。CSVの期間と日境界をそろえて加算しません。
      </p>
      <Link to="/settings#imports">CSV原本の全列を見る</Link>
    </section>
  );
}

function ReportAvailabilityPanel({ canSync }: { canSync: boolean }) {
  const { data, error } = useApi<ReportTypesResponse>("/api/data/report-types");
  // 集計は補足表示なので、取得に失敗しても知らせない（行ごと出さない）
  const summary = useApi<ReportingSyncSummary>("/api/data/reporting-sync").data;
  const [rawPage, setRawPage] = useState(0);
  const [rawReports, setRawReports] = useState<ReportingReportsResponse | null>(null);
  const [rawError, setRawError] = useState("");
  const [query, setQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState("");

  // ページ送りの間も前のページを表示しておくため、useApi は使わない
  useEffect(() => {
    const ctrl = new AbortController();
    setRawError("");
    api<ReportingReportsResponse>(`/api/data/reporting-reports?page=${rawPage}`, {
      signal: ctrl.signal,
    })
      .then(setRawReports)
      .catch((cause) => {
        if (!ctrl.signal.aborted) setRawError(errorText(cause));
      });
    return () => ctrl.abort();
  }, [rawPage]);

  const types = data?.reportTypes.filter((report) =>
    `${report.name} ${report.id}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );

  return (
    <section className="details-block" aria-labelledby="report-types-heading">
      <h3 id="report-types-heading">利用可能なYouTubeレポート種別</h3>
      <p className="small muted">
        現在の連携権限で提供される種類を確認します。ここに種類が出ても、レポート本体を取り込んだことは意味しません。
      </p>
      {canSync && data?.status === "available" && (
        <div className="row">
          <button
            type="button"
            className="button"
            disabled={syncing}
            onClick={async () => {
              setSyncing(true);
              setSyncNote("");
              try {
                const result = await api<{ status: string }>("/api/data/reporting-sync", {
                  method: "POST",
                });
                setSyncNote(
                  result.status === "queued"
                    ? "原本の同期を予約しました。完了後に画面を開き直してください。"
                    : "チャンネル連携を確認してください。",
                );
              } catch (cause) {
                setSyncNote(errorText(cause));
              } finally {
                setSyncing(false);
              }
            }}
          >
            {syncing ? "同期を予約中…" : "原本を今すぐ同期"}
          </button>
          {syncNote && (
            <span role="status" className="small muted">
              {syncNote}
            </span>
          )}
        </div>
      )}
      {summary && (
        <p className="small muted">
          保存済み原本 {summary.reports}件・ジョブ {summary.jobs}件
          {summary.lastStoredAt && ` ／最終保存 ${formatDateTime(summary.lastStoredAt)}`}
        </p>
      )}
      <Alert>{rawError}</Alert>
      {rawReports && rawReports.total > 0 && (
        <div className="report-raw-list">
          <h4>保存済みの原本</h4>
          <p className="small muted">
            全{fmtNumber(rawReports.total)}
            件。列名・期間を確認してCSV原本を取得できます。リーチ指標に対応するレポートだけ動画別CTRへ反映します。
          </p>
          <ul>
            {rawReports.reports.map((report) => (
              <li key={report.reportId}>
                <strong>{report.reportTypeId}</strong>
                <span className="small muted">
                  {report.reportTypeVersion && ` 版${report.reportTypeVersion}`}
                  {` ／${slashDate(report.startTime)}〜${slashDate(report.endTime)} ／${fmtNumber(report.rowCount)}行`}
                </span>
                <span className="small muted">
                  {report.normalizedAt
                    ? "リーチ指標へ反映済み"
                    : report.reportTypeId === REACH_BASIC_REPORT_TYPE
                      ? "リーチ指標へ未反映"
                      : "原本のみ（未対応種別）"}
                </span>
                <details>
                  <summary>列名を見る（{report.header.length}列）</summary>
                  <p className="small muted report-raw-columns">{report.header.join("、")}</p>
                </details>
                <a href={`/api/data/reporting-reports/${encodeURIComponent(report.reportId)}/csv`}>
                  CSV原本を取得
                </a>
              </li>
            ))}
          </ul>
          {rawReports.total > rawReports.pageSize && (
            <Pager
              position={`${rawPage + 1}ページ`}
              prevDisabled={rawPage === 0}
              nextDisabled={(rawPage + 1) * rawReports.pageSize >= rawReports.total}
              onPrev={() => setRawPage(rawPage - 1)}
              onNext={() => setRawPage(rawPage + 1)}
            />
          )}
        </div>
      )}
      <Alert>{error}</Alert>
      {!data && !error && <Loading small />}
      {data?.status === "not_linked" && (
        <p className="small muted">チャンネル連携後に確認できます。</p>
      )}
      {data?.status === "permission_required" && (
        <p className="small muted">
          現在の連携権限ではレポート種別を確認できません。YouTubeとの再連携が必要です。
        </p>
      )}
      {data?.status === "available" && (
        <>
          <p className="small muted">{data.reportTypes.length}種類を確認しました。</p>
          {data.reportTypes.length > 0 && (
            <>
              <label className="small" htmlFor="report-types-search">
                種類を検索
              </label>
              <input
                id="report-types-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="名前またはID"
              />
              <ul className="report-types-list">
                {types?.map((report) => (
                  <li key={report.id}>
                    <strong>{report.name || report.id}</strong>
                    <span className="small muted">{report.id}</span>
                    {report.deprecateTime && (
                      <span className="small muted">
                        終了予定 {formatDateTime(report.deprecateTime)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {types?.length === 0 && <p className="small muted">一致する種類はありません。</p>}
            </>
          )}
        </>
      )}
    </section>
  );
}
