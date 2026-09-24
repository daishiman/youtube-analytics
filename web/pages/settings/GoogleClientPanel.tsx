// 「YouTube連携」区画の先頭: テナントの Google Cloud OAuth クライアント（qa-075）。
// 連携の OAuth はこのクライアントで行う（ログインはアプリ共通のまま）。シークレットは送るだけで、画面には戻らない
import { type FormEvent, useState } from "react";
import { api, type GoogleClientSummary } from "../../api";
import { formatDateTime } from "../../components/AppShell";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../components/Toast";
import { errorText } from "../shell-context";
import { GoogleCloudSetupGuide } from "./GoogleCloudSetupGuide";

/** Google Cloud Console に登録する「承認済みのリダイレクト URI」（API の youtubeRedirectUri と同じ形） */
export function youtubeRedirectUri(origin: string): string {
  return `${origin}/api/oauth/callback`;
}

export function GoogleClientPanel({
  client,
  canManage,
  linked,
  onChanged,
}: {
  client: GoogleClientSummary;
  canManage: boolean;
  /** 連携中のチャンネルがある（ID の変更・削除で要再連携になる旨を出す） */
  linked: boolean;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const redirectUri = youtubeRedirectUri(window.location.origin);
  const showForm = canManage && (!client.configured || editing);

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

  function openForm() {
    setClientId(client.clientId ?? "");
    setClientSecret("");
    setError("");
    setEditing(true);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await api<GoogleClientSummary>("/api/youtube/google-client", {
        method: "PUT",
        body: { clientId: clientId.trim(), clientSecret: clientSecret.trim() },
      });
      const changed = client.configured && client.clientId !== clientId.trim();
      setClientSecret("");
      setEditing(false);
      toast(
        changed && linked
          ? "接続情報を変更しました。「再連携」から新しいクライアントで許可し直してください。"
          : "Google Cloud の接続情報を登録しました。",
      );
      await onChanged();
    });
  }

  return (
    <div className="google-client">
      <div className="google-client-head">
        <h3>Google Cloud の接続情報</h3>
        <StatusBadge tone={client.configured ? "ok" : "warn"}>
          {client.configured ? "登録済み" : "未登録"}
        </StatusBadge>
      </div>
      <p className="small muted">
        YouTube と連携するには、あなた自身の Google Cloud（Google
        の開発者向けサービス・無料）で作った「接続情報」（クライアントID
        とシークレット）が必要です。YouTube からデータを取る回数の上限も、あなたの Google Cloud
        のものを使います。このアプリへのログインには使いません。作り方は下の「準備手順」を見てください。
      </p>

      {client.configured && !editing && (
        <dl className="facts">
          <div>
            <dt>クライアントID</dt>
            <dd className="mono">{client.clientId}</dd>
          </div>
          <div>
            <dt>最終更新</dt>
            <dd>{formatDateTime(client.updatedAt)}</dd>
          </div>
          <div>
            <dt>シークレット</dt>
            <dd>登録済み（表示しません）</dd>
          </div>
        </dl>
      )}

      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}

      {showForm ? (
        <form className="google-client-form" onSubmit={save}>
          <label className="field">
            <span>クライアントID</span>
            <input
              required
              value={clientId}
              disabled={busy}
              autoComplete="off"
              spellCheck={false}
              placeholder="123456789012-xxxx.apps.googleusercontent.com"
              onChange={(event) => setClientId(event.target.value)}
            />
          </label>
          <label className="field">
            <span>クライアントシークレット</span>
            <input
              required
              type="password"
              value={clientSecret}
              disabled={busy}
              autoComplete="new-password"
              spellCheck={false}
              placeholder={client.configured ? "変更するときも入力し直してください" : "GOCSPX-…"}
              onChange={(event) => setClientSecret(event.target.value)}
            />
          </label>
          <div className="field">
            <span>承認済みのリダイレクト URI（Google Cloud Console に登録）</span>
            <div className="copy-row">
              <input
                readOnly
                value={redirectUri}
                aria-label="承認済みのリダイレクト URI"
                onFocus={(event) => event.target.select()}
              />
              <button
                type="button"
                className="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(redirectUri);
                  toast("リダイレクト URI をコピーしました。");
                }}
              >
                コピー
              </button>
            </div>
          </div>
          {client.configured && linked && (
            <p className="small alert">
              クライアントIDを変えると、今の連携は「要再連携」になります（シークレットだけの変更ならそのまま使えます）。
            </p>
          )}
          <div className="row">
            <button
              type="submit"
              className="button primary"
              disabled={busy || !clientId.trim() || !clientSecret.trim()}
            >
              {client.configured ? "変更を保存" : "登録"}
            </button>
            {editing && (
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                キャンセル
              </button>
            )}
          </div>
          <GoogleCloudSetupGuide redirectUri={redirectUri} defaultOpen={!client.configured} />
        </form>
      ) : client.configured && canManage ? (
        <div className="row">
          <button type="button" className="button" disabled={busy} onClick={openForm}>
            変更
          </button>
          <button
            type="button"
            className="button danger"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            削除
          </button>
        </div>
      ) : (
        !client.configured && (
          <p className="small muted">接続情報はワークスペースのオーナーが登録します。</p>
        )
      )}

      <ConfirmDialog
        open={confirming}
        title="Google Cloud の接続情報を削除"
        confirmLabel="削除"
        danger
        busy={busy}
        error={error}
        onConfirm={() =>
          void run(async () => {
            await api<GoogleClientSummary>("/api/youtube/google-client", { method: "DELETE" });
            setConfirming(false);
            toast("Google Cloud の接続情報を削除しました。");
            await onChanged();
          })
        }
        onCancel={() => setConfirming(false)}
      >
        <p>
          登録し直すまで、YouTube 連携の開始・再連携ができなくなります。
          {linked && "連携中のチャンネルは Google の許可を取り消し、「要再連携」になります。"}
        </p>
      </ConfirmDialog>
    </div>
  );
}
