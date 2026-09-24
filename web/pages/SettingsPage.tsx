// 設定画面（docs/screens/05-settings.png）。画像の5カードに、
// 独立APIで読むメンバー区画（オーナーのみ）を追加して計6区画にする
import { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router";
import { api, DONE_MESSAGES, REDIRECT_MESSAGES, type Settings } from "../api";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { DeleteSection } from "./settings/DeleteSection";
import { ImportSection } from "./settings/ImportSection";
import { MemberSection } from "./settings/MemberSection";
import { TokenSection } from "./settings/TokenSection";
import { UsageSection } from "./settings/UsageSection";
import { YouTubeSection } from "./settings/YouTubeSection";
import { errorText, type ShellContext } from "./shell-context";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; settings: Settings }
  | { status: "error"; message: string };

export function SettingsPage() {
  const { me, reload } = useOutletContext<ShellContext>();
  const tenant = me.currentTenant;
  if (!tenant) return null;
  return <TenantSettings key={tenant.tenantId} me={me} reload={reload} tenant={tenant} />;
}

function useSettings() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const controller = useRef<AbortController | null>(null);

  // 再読込では前の表示を残す（操作のたびに画面が「読み込み中」へ戻らない）
  const load = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    try {
      const settings = await api<Settings>("/api/settings", { signal: current.signal });
      if (!current.signal.aborted) setState({ status: "ready", settings });
    } catch (err) {
      if (current.signal.aborted) return;
      setState({ status: "error", message: errorText(err) });
    }
  }, []);

  useEffect(() => {
    void load();
    return () => controller.current?.abort();
  }, [load]);

  return { state, load };
}

/** OAuth から戻ったときのクエリ（?done= / ?error= / ?select=channel）を1回だけ読み、URL から消す */
function useRedirectResult() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const [redirectError, setRedirectError] = useState("");
  const [selecting, setSelecting] = useState(false);

  useEffect(() => {
    const done = params.get("done");
    const error = params.get("error");
    const select = params.get("select");
    if (!done && !error && !select) return;
    if (done) toast(DONE_MESSAGES[done] ?? "完了しました。");
    if (error)
      setRedirectError(REDIRECT_MESSAGES[error] ?? "連携に失敗しました。もう一度お試しください。");
    if (select === "channel") setSelecting(true);
    const next = new URLSearchParams(params);
    for (const key of ["done", "error", "select"]) next.delete(key);
    setParams(next, { replace: true });
  }, [params, setParams, toast]);

  return { redirectError, selecting, stopSelecting: () => setSelecting(false) };
}

function TenantSettings({
  me,
  reload,
  tenant,
}: ShellContext & { tenant: NonNullable<ShellContext["me"]["currentTenant"]> }) {
  const { state, load } = useSettings();
  const { redirectError, selecting, stopSelecting } = useRedirectResult();
  const isOwner = tenant.role === "owner";

  const ready = state.status === "ready" ? state.settings : null;

  return (
    <>
      <PageHeader title="設定" lead="連携・取込・データ管理を設定します" />
      {redirectError && (
        <p role="alert" className="alert">
          {redirectError}
        </p>
      )}
      <div className="settings-sections">
        {ready ? (
          <>
            <YouTubeSection
              settings={ready}
              selecting={selecting}
              onSelectDone={stopSelecting}
              onChanged={load}
            />
            <ImportSection
              imports={ready.imports}
              channelId={ready.youtube.channel?.channelId ?? null}
              canWrite={ready.permissions.writeContent}
              onChanged={load}
            />
            <TokenSection
              tokens={ready.tokens}
              tokenLimit={ready.tokenLimit}
              canWrite={ready.permissions.writeContent}
              onChanged={load}
            />
          </>
        ) : state.status === "error" ? (
          <div>
            <p role="alert" className="alert">
              {state.message}
            </p>
            <button type="button" className="button" onClick={() => void load()}>
              再試行
            </button>
          </div>
        ) : (
          <p className="muted" role="status">
            設定を読み込んでいます…
          </p>
        )}
        {/* メンバーは別 API で独立。設定の取得に失敗しても管理できるよう、常に同じ位置に置く */}
        {isOwner && <MemberSection me={me} reload={reload} tenant={tenant} />}
        {ready && (
          <>
            <UsageSection usage={ready.usage} />
            <DeleteSection
              tenantName={ready.tenant.name}
              deletion={ready.deletion}
              canManage={ready.permissions.manageSettings}
              onChanged={load}
            />
          </>
        )}
      </div>
    </>
  );
}
