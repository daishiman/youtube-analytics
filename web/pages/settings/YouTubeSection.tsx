// 設定画面「YouTube連携」区画。未連携 → OAuth → チャンネル選択 → 連携済み（再連携・連携解除・字幕の自動取得）
import { type FormEvent, useEffect, useState } from "react";
import { ApiError, api, type ChannelCandidate, type Settings } from "../../api";
import { Alert, Loading } from "../../components/Alert";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { SectionCard } from "../../components/SectionCard";
import { type BadgeTone, StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../components/Toast";
import { fmtNumber, formatDateTime } from "../../format";
import { errorText } from "../shell-context";
import { GoogleClientPanel } from "./GoogleClientPanel";

const STATUS_TONE: Record<Settings["youtube"]["status"], BadgeTone> = {
  正常: "ok",
  要再連携: "warn",
  未連携: "neutral",
};

/** 付与スコープ（API は短縮名で返す）を利用者に分かる言葉にする */
const SCOPE_LABELS: Record<string, string> = {
  "youtube.readonly": "youtube.readonly（読み取り）",
  "yt-analytics.readonly": "yt-analytics.readonly（分析の読み取り）",
  "youtube.force-ssl": "youtube.force-ssl（字幕の取得）",
};

const scopeLabel = (scope: string) => SCOPE_LABELS[scope] ?? scope;

const formatCount = (n: number | null) => (n === null ? "非公開" : `${fmtNumber(n)}人`);

/** Google OAuth の画面へ移る（戻り先は /settings?done=… / ?select=channel / ?error=…） */
async function goToGoogle(path: string, body?: unknown) {
  const { url } = await api<{ url: string }>(path, { method: "POST", body });
  window.location.assign(url);
}

export function YouTubeSection({
  settings,
  selecting,
  onSelectDone,
  onChanged,
}: {
  settings: Settings;
  selecting: boolean;
  onSelectDone: () => void;
  onChanged: () => Promise<void>;
}) {
  const { youtube, permissions, tenant } = settings;
  const canManage = permissions.manageSettings;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<"disconnect" | "captions-off" | null>(null);
  const toast = useToast();

  async function run(action: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function setCaptions(enabled: boolean) {
    const result = await api<{ captionsAuto: boolean; url: string | null }>(
      "/api/youtube/captions-auto",
      { method: "PUT", body: { enabled } },
    );
    // ON は youtube.force-ssl の追加許可、OFF は読み取り専用での再連携へ Google の画面を通す
    if (result.url) {
      window.location.assign(result.url);
      return;
    }
    toast(enabled ? "字幕の追加許可を保存しました。" : "字幕の自動取得をOFFにしました。");
    await onChanged();
  }

  const channel = youtube.channel;
  const pendingDeletionDueAt = youtube.pendingDeletionDueAt;
  // 連携の OAuth はテナントのクライアントで行うので、未登録の間は Google へ飛ぶ操作を止める（qa-087）
  const clientReady = youtube.googleClient.configured;

  return (
    <SectionCard
      id="youtube"
      title="YouTube連携"
      description="分析するYouTubeチャンネルを1つ連携します。許可は読み取り専用です。"
    >
      <Alert>{error}</Alert>

      <GoogleClientPanel
        client={youtube.googleClient}
        canManage={canManage}
        linked={Boolean(channel)}
        onChanged={onChanged}
      />

      {pendingDeletionDueAt ? (
        <div className="empty-state" role="status">
          <p>
            <StatusBadge tone="warn">旧チャンネルのデータ削除を依頼済み</StatusBadge>
          </p>
          <p>削除完了までは新しいチャンネルを連携できません。</p>
          <p className="small muted">削除期限: {formatDateTime(pendingDeletionDueAt)}</p>
        </div>
      ) : selecting && canManage && !channel ? (
        <ChannelPicker onDone={onSelectDone} onChanged={onChanged} />
      ) : channel ? (
        <>
          <div className="channel">
            <ChannelAvatar title={channel.title} src={channel.thumbnailUrl} />
            <div className="channel-main">
              <p className="channel-title">
                <strong>{channel.title}</strong>
                <StatusBadge tone={STATUS_TONE[youtube.status]}>{youtube.status}</StatusBadge>
              </p>
              <p className="small muted">登録者数 {formatCount(channel.subscriberCount)}</p>
            </div>
          </div>
          <dl className="facts">
            <div>
              <dt>収集状況</dt>
              <dd>{youtube.collectionStatus ?? "—"}</dd>
            </div>
            <div>
              <dt>最終収集</dt>
              <dd>{formatDateTime(youtube.lastCollectedAt)}</dd>
            </div>
            <div>
              <dt>最終CSV取込</dt>
              <dd>{formatDateTime(youtube.lastCsvImportAt)}</dd>
            </div>
            <div>
              <dt>付与スコープ</dt>
              <dd>
                <ul className="chips" aria-label="付与スコープ">
                  {youtube.scopes.map((scope) => (
                    <li key={scope} className="chip">
                      {scopeLabel(scope)}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
          {!clientReady ? (
            <p className="alert">
              {youtube.googleClient.source === "managed"
                ? "事前設定された接続情報を利用できないため、再連携と字幕の設定ができません。運用担当者に確認してください。"
                : "Google Cloud の接続情報が未登録のため、再連携と字幕の設定ができません。上の欄から登録してください。"}
            </p>
          ) : (
            youtube.status === "要再連携" && (
              <p className="alert">
                Googleの許可が切れています。「再連携」から同じチャンネルでもう一度許可してください。
              </p>
            )
          )}

          <CaptionsSwitch
            captions={youtube.captions}
            disabled={!canManage || busy || (!clientReady && !youtube.captions.enabled)}
            onToggle={(next) => {
              if (next) void run(() => setCaptions(true));
              else setDialog("captions-off");
            }}
          />

          {canManage && (
            <div className="row">
              <button
                type="button"
                className="button primary"
                disabled={busy || !clientReady}
                onClick={() => void run(() => goToGoogle("/api/youtube/reconnect"))}
              >
                再連携
              </button>
              <button
                type="button"
                className="button danger"
                disabled={busy}
                onClick={() => setDialog("disconnect")}
              >
                連携解除
              </button>
            </div>
          )}
          <p className="small muted">
            別のチャンネルに変えるときは、連携解除し、旧データの削除完了後に連携し直してください。
          </p>
        </>
      ) : (
        <div className="empty-state">
          <p>
            <StatusBadge tone="neutral">未連携</StatusBadge>
          </p>
          <p className="muted">
            ブランドアカウントのチャンネルは、Googleのアカウント選択画面でそのチャンネルを選んでください。
          </p>
          {canManage ? (
            <>
              <button
                type="button"
                className="button primary"
                disabled={busy || !clientReady}
                onClick={() => void run(() => goToGoogle("/api/youtube/connect"))}
              >
                YouTubeと連携
              </button>
              {!clientReady && (
                <p className="small muted">
                  先に上の「Google Cloud の接続情報」を登録すると連携できます。
                </p>
              )}
            </>
          ) : (
            <p className="small muted">連携はワークスペースのオーナーが行います。</p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={dialog === "disconnect"}
        title="YouTube連携を解除"
        confirmLabel="連携解除"
        confirmText={tenant.name}
        danger
        busy={busy}
        error={error}
        onConfirm={(typed) =>
          void run(async () => {
            const { deletionDueAt } = await api<{ deletionDueAt: string }>(
              "/api/youtube/connection",
              { method: "DELETE", body: { confirmName: typed } },
            );
            setDialog(null);
            toast(`連携を解除しました。${formatDateTime(deletionDueAt)}までにデータを削除します。`);
            await onChanged();
          })
        }
        onCancel={() => setDialog(null)}
      >
        <p>
          Googleの許可を取り消し、このチャンネルの保存データ（指標・レポート・画像）を7日以内に削除します。
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "captions-off"}
        title="字幕の自動取得をOFF"
        confirmLabel="OFFにする"
        busy={busy}
        error={error}
        onConfirm={() =>
          void run(async () => {
            await setCaptions(false);
            setDialog(null);
          })
        }
        onCancel={() => setDialog(null)}
      >
        <p>
          字幕用の追加許可（youtube.force-ssl）を取り消します。続けてGoogleの画面で読み取り専用の許可をやり直してください。
        </p>
      </ConfirmDialog>
    </SectionCard>
  );
}

function CaptionsSwitch({
  captions,
  disabled,
  onToggle,
}: {
  captions: Settings["youtube"]["captions"];
  disabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  const preparing = captions.availability === "preparing";
  return (
    <div className="switch-row">
      <label className="switch">
        <input
          type="checkbox"
          role="switch"
          aria-checked={captions.enabled}
          checked={captions.enabled}
          disabled={disabled || (preparing && !captions.enabled)}
          onChange={(event) => onToggle(event.target.checked)}
        />
        <span className="switch-track" aria-hidden="true" />
        <span>字幕を自動取得する</span>
      </label>
      {preparing && <span className="badge badge-neutral">準備中</span>}
      <p className="small muted">
        追加の許可 youtube.force-ssl が必要・
        {preparing ? "利用可能になった場合の上限" : "取得の上限"}：1日{captions.dailyLimit}本
        {preparing && "（現在、字幕の収集機能は利用できません。設定済みの許可はOFFにできます）"}
      </p>
    </div>
  );
}

/** チャンネルのアイコン。画像が無い・読めないときは頭文字 */
function ChannelAvatar({ title, src }: { title: string; src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="channel-avatar" aria-hidden="true">
        {title.slice(0, 1)}
      </span>
    );
  }
  return (
    <img
      className="channel-avatar"
      src={src}
      alt=""
      width={48}
      height={48}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

/** OAuth から戻った直後のチャンネル選択（channels.list mine=true の候補） */
function ChannelPicker({
  onDone,
  onChanged,
}: {
  onDone: () => void;
  onChanged: () => Promise<void>;
}) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; candidates: ChannelCandidate[] }
    | { status: "error"; message: string; expired: boolean }
  >({ status: "loading" });
  const [picked, setPicked] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const controller = new AbortController();
    api<{ candidates: ChannelCandidate[] }>("/api/youtube/channel-candidates", {
      signal: controller.signal,
    })
      .then(({ candidates }) => {
        setState({ status: "ready", candidates });
        const [only] = candidates;
        if (only && candidates.length === 1) setPicked(only.channelId);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: errorText(err),
          expired: err instanceof ApiError && err.code === "OAUTH_PENDING_EXPIRED",
        });
      });
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!picked) return;
    setError("");
    setSubmitting(true);
    try {
      const { title } = await api<{ channelId: string; title: string }>("/api/youtube/channel", {
        method: "POST",
        body: { channelId: picked },
      });
      toast(`「${title}」を連携しました。`);
      onDone();
      await onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (state.status === "loading") {
    return <Loading>チャンネルを読み込み中…</Loading>;
  }
  if (state.status === "error") {
    return (
      <div>
        <Alert>{state.message}</Alert>
        <button type="button" className="button" onClick={onDone}>
          戻る
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="picker">
      <fieldset>
        <legend>連携するチャンネルを選んでください</legend>
        <ul className="picker-list">
          {state.candidates.map((c) => (
            <li key={c.channelId}>
              <label className="picker-item">
                <input
                  type="radio"
                  name="channel"
                  value={c.channelId}
                  checked={picked === c.channelId}
                  onChange={() => setPicked(c.channelId)}
                />
                <ChannelAvatar title={c.title} src={c.thumbnailUrl} />
                <span>
                  <strong>{c.title}</strong>
                  <span className="small muted">登録者数 {formatCount(c.subscriberCount)}</span>
                </span>
                {c.linkedElsewhere && (
                  <StatusBadge tone="warn">別のワークスペースで連携済み</StatusBadge>
                )}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <Alert>{error}</Alert>
      <div className="row">
        <button type="button" className="button" onClick={onDone} disabled={submitting}>
          キャンセル
        </button>
        <button type="submit" className="button primary" disabled={!picked || submitting}>
          このチャンネルを連携
        </button>
      </div>
    </form>
  );
}
