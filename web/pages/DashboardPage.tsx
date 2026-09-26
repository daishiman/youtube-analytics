// ダッシュボード（docs/screens/02-dashboard.png が正本）。期間は共通ヘッダーの ?period= を読むだけ（qa-099）。
// 対象はチャンネル全体か選んだ動画（既定は直近公開10本・上限なし: qa-096）
import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router";
import { type DashboardResponse, ROLE_LABELS } from "../api";
import { Alert, Loading } from "../components/Alert";
import { SegmentedToggle } from "../components/SegmentedToggle";
import { YouTubeLinkBanner } from "../components/YouTubeLinkBanner";
import { formatDateTime } from "../format";
import { useApi } from "../useApi";
import { DetailsSection } from "./dashboard/DetailsSection";
import { slashDate } from "./dashboard/format";
import { KpiCards } from "./dashboard/KpiCards";
import { PeriodInsight } from "./dashboard/PeriodInsight";
import { ActiveActions, EmptyNote, LatestReport } from "./dashboard/SidePanels";
import { TrendCard } from "./dashboard/TrendCard";
import { VideoPerformance } from "./dashboard/VideoPerformance";
import type { ShellContext } from "./shell-context";

const QUERY_KEYS = ["period", "from", "to", "scope", "video_ids"] as const;

export function dashboardQuery(params: URLSearchParams): string {
  const q = new URLSearchParams();
  for (const key of QUERY_KEYS) {
    const value = params.get(key);
    if (value || (key === "video_ids" && value !== null)) q.set(key, value);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

function dashboardQuestion(params: URLSearchParams): string {
  const period = params.get("period") ?? "28d";
  if (period === "custom") {
    const from = params.get("from");
    const to = params.get("to");
    return from && to
      ? `${slashDate(from)}〜${slashDate(to)}、何が効いたか？`
      : "任意期間、何が効いたか？";
  }
  if (period === "1y") return "直近1年間、何が効いたか？";
  const days = period === "7d" ? 7 : period === "28d" ? 28 : period === "90d" ? 90 : null;
  return days ? `直近${days}日間、何が効いたか？` : "選択した期間、何が効いたか？";
}

export function DashboardPage() {
  const { me } = useOutletContext<ShellContext>();
  const tenant = me.currentTenant;
  const [params] = useSearchParams();
  const { data, error, loading } = useApi<DashboardResponse>(
    tenant ? `/api/dashboard${dashboardQuery(params)}` : null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!tenant) return null;

  return (
    <div className="dashboard">
      <YouTubeLinkBanner tenant={tenant} />
      <header className="page-header dashboard-header">
        <nav aria-label="パンくず" className="small muted breadcrumb">
          {tenant.name} / ダッシュボード
        </nav>
        <div className="dashboard-title-row">
          <div>
            <h1>ダッシュボード</h1>
            <p className="dashboard-question">{dashboardQuestion(params)}</p>
            <p className="small muted">
              あなたの役割: <strong>{ROLE_LABELS[tenant.role]}</strong>
            </p>
            <p className="small muted">
              データ収集の状態: {data?.collection.status ?? "状態を確認中"}
              ・基本日次収集の最終成功{" "}
              {data ? formatDateTime(data.collection.lastSucceededAt) : "—"}
            </p>
          </div>
          {data?.canEdit && (
            <Link className="button" to="/settings#imports">
              CSVをアップロード
            </Link>
          )}
        </div>
      </header>

      <Alert>{error}</Alert>
      {loading && <Loading />}

      {data && (
        <div className="dashboard-body">
          <p className="small muted period-note">
            {slashDate(data.period.from)}〜{slashDate(data.period.to)}（{data.period.days}
            日間）を、直前の同じ日数（
            {slashDate(data.period.previousFrom)}〜{slashDate(data.period.previousTo)}
            ）と比べています。固定期間は取得済みAnalytics日次があれば、その最終日を末日にします。Analytics日次の日付は太平洋時間、事業CSVの週はJSTです。期間内の未収集日は0回ではなく欠測として扱います。
          </p>
          <ScopeSelector data={data} open={pickerOpen} onOpenChange={setPickerOpen} />
          <EmptyStates data={data} />
          <KpiCards kpis={data.kpis} />
          <PeriodInsight data={data} searchParams={params} />
          <TrendCard data={data} />
          <div className="dashboard-grid">
            <VideoPerformance data={data} />
            <aside className="dashboard-side" aria-label="分析とアクション">
              <LatestReport data={data} />
              <ActiveActions data={data} />
            </aside>
          </div>
          <DetailsSection data={data} canSyncReporting={tenant.role === "owner"} />
        </div>
      )}
    </div>
  );
}

/** 対象の切替: チャンネル全体 / 動画を選ぶ。選択は URL（scope・video_ids）に持たせて共有できるようにする */
function ScopeSelector({
  data,
  open,
  onOpenChange,
}: {
  data: DashboardResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [params, setParams] = useSearchParams();
  const [picked, setPicked] = useState<string[]>(data.selection.videoIds);

  // 再取得で配列が作り直されても中身が同じなら、選びかけのチェックを消さない
  const selectedKey = data.selection.videoIds.join(",");
  useEffect(() => setPicked(selectedKey ? selectedKey.split(",") : []), [selectedKey]);
  useEffect(() => {
    if (data.scope === "videos" && data.selection.videoIds.length === 0) onOpenChange(true);
  }, [data.scope, data.selection.videoIds.length, onOpenChange]);

  const setScope = (scope: "channel" | "videos", ids?: string[]) => {
    const next = new URLSearchParams(params);
    if (scope === "channel") {
      next.delete("scope");
      next.delete("video_ids");
    } else {
      next.set("scope", "videos");
      if (ids) next.set("video_ids", ids.join(","));
      else next.delete("video_ids");
    }
    setParams(next);
  };

  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const toggle = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <section className="card scope-selector" aria-labelledby="scope-heading">
      <h2 id="scope-heading" className="visually-hidden">
        表示の対象
      </h2>
      <SegmentedToggle
        value={data.scope}
        label="表示の対象"
        options={[
          ["channel", "チャンネル全体"],
          ["videos", "動画を選ぶ"],
        ]}
        onChange={(scope) => {
          if (scope === "channel") {
            onOpenChange(false);
            setScope("channel");
          } else {
            if (data.scope !== "videos") setScope("videos");
            onOpenChange(true);
          }
        }}
      />
      <p className="small muted scope-summary">
        {data.scope === "channel"
          ? "KPIと日次推移はチャンネル全体、動画表は直近公開10本を表示します。"
          : data.selection.videoIds.length === 0
            ? "対象の動画がありません。動画を選び直してください。"
            : `${data.selection.videoIds.length}本の動画を対象にしています${data.selection.isDefault ? "（既定: 直近公開10本）" : ""}。KPI・日次推移・動画表に反映します。`}{" "}
        構成比はチャンネル全体です。AI分析・改善アクション・週次ファネルは期間・対象の選択に連動しません。
        {data.scope === "videos" && !open && (
          <button type="button" className="text-link" onClick={() => onOpenChange(true)}>
            選び直す
          </button>
        )}
      </p>
      {data.scope === "videos" && open && (
        <form
          className="video-picker"
          onSubmit={(e) => {
            e.preventDefault();
            setScope("videos", picked);
            onOpenChange(false);
          }}
        >
          <fieldset>
            <legend className="small">対象にする動画（公開日の新しい順・本数の上限なし）</legend>
            {data.videoOptions.length === 0 ? (
              <p className="muted small">選べる動画がまだありません。</p>
            ) : (
              <ul className="picker-list">
                {data.videoOptions.map((v) => (
                  <li key={v.videoId}>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={pickedSet.has(v.videoId)}
                        onChange={() => toggle(v.videoId)}
                      />
                      <span>
                        {v.title}
                        <span className="small muted"> {slashDate(v.publishedAt)}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
          <div className="row">
            <button type="submit" className="button primary" disabled={picked.length === 0}>
              {picked.length}本で表示する
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setPicked(data.videoOptions.slice(0, 10).map((v) => v.videoId))}
            >
              直近10本に戻す
            </button>
            <button type="button" className="button" onClick={() => onOpenChange(false)}>
              閉じる
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/** 空状態（未連携・未収集・CSV未取込）。AI分析・アクションの空状態は右カラムの各カードが出す（qa-091 の5種） */
function EmptyStates({ data }: { data: DashboardResponse }) {
  const e = data.empty;
  if (e.notLinked) {
    return (
      <EmptyNote
        title="YouTube チャンネルがまだ連携されていません"
        body="連携後、チャンネルと動画の日次実績を収集します。その他の指標は対応状況をご確認ください。"
        to="/settings#youtube"
        action="設定を開く"
      />
    );
  }
  if (e.notCollected) {
    return (
      <EmptyNote
        title="まだデータを集めていません"
        body="連携は済んでいます。チャンネルと動画の日次実績の初回収集を待っています。"
      />
    );
  }
  if (e.noCsv) {
    return (
      <EmptyNote
        title="この期間・対象の長尺平均視聴率を計算できません"
        body="対象期間の長尺動画について、Studio CSVの日次視聴回数と平均視聴率が揃っていません。期間・動画の選択とCSVの受付状況を確認してください。"
        to={data.canEdit ? "/settings#imports" : undefined}
        action={data.canEdit ? "CSVの受付状況を見る" : undefined}
      />
    );
  }
  return null;
}
