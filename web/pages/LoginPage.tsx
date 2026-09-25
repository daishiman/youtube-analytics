// ログイン（docs/screens/01-login.png）: 権限一覧は /api/auth/config から描画し、同意してから Google ログインへ進む。
// 「Googleでログイン」は Google ブランド規定の Light テーマ固定（qa-067）。開発時だけ開発用ログインも出す

import { type FormEvent, type ReactElement, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { TENANT_LABEL } from "../../src/domain/labels";
import { ApiError, type AuthConfig, api, loginErrorMessage, REDIRECT_MESSAGES } from "../api";
import { AlertIcon, ChartIcon, MailIcon, PlayIcon } from "../components/LoginIcons";
import { TrustFooter } from "../components/TrustFooter";

const SCOPE_ICONS: Record<string, () => ReactElement> = {
  "https://www.googleapis.com/auth/youtube.readonly": PlayIcon,
  "https://www.googleapis.com/auth/yt-analytics.readonly": ChartIcon,
  email: MailIcon,
};

const CONFIG_FAILED = "設定を読み込めませんでした。ページを再読み込みしてください";
const DESCRIPTIONS: Record<AuthConfig["mode"], string> = {
  signup: "Googleアカウントでログインすると、YouTube Analyticsの読み取り連携も同時に行います",
  invite: `招待された${TENANT_LABEL}に参加します。読み取るのはメールアドレスだけです`,
};

export function LoginPage() {
  const [params] = useSearchParams();
  const invite = params.get("invite") ?? "";
  const errorCode = params.get("error") ?? "";
  // 招待 URL が SPA 内で切り替わったら、同意と古い設定を同時に破棄する。
  return (
    <LoginView key={JSON.stringify([invite, errorCode])} invite={invite} errorCode={errorCode} />
  );
}

function LoginView({ invite, errorCode }: { invite: string; errorCode: string }) {
  const navigate = useNavigate();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [configFailed, setConfigFailed] = useState(false);
  const [consent, setConsent] = useState(false);
  const [email, setEmail] = useState("");
  // エラーはカード上部に1つだけ出す。後から起きたものが前のものを置き換える
  const [error, setError] = useState(() => (errorCode ? loginErrorMessage(errorCode) : ""));

  useEffect(() => {
    if (!errorCode || Object.hasOwn(REDIRECT_MESSAGES, errorCode)) return;
    // 未知のコードは汎用文言だけを表示し、URL からは取り除く。
    const url = new URL(window.location.href);
    if (url.searchParams.get("error") !== errorCode) return;
    url.searchParams.delete("error");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [errorCode]);

  useEffect(() => {
    const controller = new AbortController();
    const query = invite ? `?invite=${encodeURIComponent(invite)}` : "";
    api<AuthConfig>(`/api/auth/config${query}`, { signal: controller.signal })
      .then(setConfig)
      .catch(() => {
        if (!controller.signal.aborted) {
          setConfigFailed(true);
          setError(CONFIG_FAILED);
        }
      });
    return () => controller.abort();
  }, [invite]);

  const ready = consent && config !== null;
  const mode = config?.mode ?? (invite ? "invite" : "signup");
  const disabledReason = configFailed
    ? "設定を読み込めないため、ページを再読み込みしてください"
    : !config
      ? "設定を読み込み中です"
      : !consent
        ? "同意にチェックすると押せます"
        : "";

  function onGoogleLogin() {
    // disabled ではなく aria-disabled にして、フォーカスと「押せない理由」の読み上げを残す
    if (ready && googleHref) window.location.assign(googleHref);
  }

  const googleHref = config
    ? `/api/auth/login?${new URLSearchParams({
        consent: "1",
        terms_version: config.termsVersion,
        privacy_version: config.privacyVersion,
        ...(invite ? { invite } : {}),
      })}`
    : undefined;

  async function onDevLogin(e: FormEvent) {
    e.preventDefault();
    if (!config) return;
    setError("");
    try {
      const r = await api<{ next: string }>("/api/auth/dev-login", {
        method: "POST",
        body: {
          email,
          invite: invite || undefined,
          termsVersion: config.termsVersion,
          privacyVersion: config.privacyVersion,
        },
      });
      navigate(r.next);
    } catch (err) {
      setError(
        err instanceof ApiError ? `${err.message}（${err.hint}）` : loginErrorMessage("UNKNOWN"),
      );
    }
  }

  return (
    <div className="login-page">
      <main className="login-main">
        <section className="card login-card" aria-labelledby="login-heading">
          <p className="login-logo">Channel Insight</p>
          {error && (
            <p role="alert" className="alert">
              {error}
            </p>
          )}
          {config?.inviteTenantName && (
            <p className="invite-note">
              {config.inviteTenantName}の{TENANT_LABEL}に招待されています
            </p>
          )}
          <h1 id="login-heading">
            YouTubeの実績から、
            <wbr />
            次の一手を。
          </h1>
          <p className="login-lead">{DESCRIPTIONS[mode]}</p>

          {config && (
            <ul className="scope-list" aria-label="このアプリが読み取る情報">
              {config.scopes.map((scope) => {
                const ScopeIcon = SCOPE_ICONS[scope.id] ?? MailIcon;
                return (
                  <li key={scope.id}>
                    <ScopeIcon />
                    <span className="scope-label">{scope.label}</span>
                    {scope.readOnly && <span className="badge-readonly">読み取り専用</span>}
                  </li>
                );
              })}
            </ul>
          )}

          <label className="check consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              <a className="text-link" href="/privacy" target="_blank" rel="noreferrer">
                プライバシーポリシー
              </a>
              と
              <a className="text-link" href="/terms" target="_blank" rel="noreferrer">
                利用規約
              </a>
              に同意します
            </span>
          </label>

          <button
            type="button"
            className="google-button"
            aria-disabled={!ready}
            aria-describedby={disabledReason ? "consent-reason" : undefined}
            onClick={onGoogleLogin}
          >
            <img src="/google-g.svg" alt="" width="18" height="18" />
            <span>Googleでログイン</span>
          </button>
          {disabledReason && (
            <p id="consent-reason" className="consent-reason">
              {disabledReason}
            </p>
          )}

          <div className="unverified-note">
            <AlertIcon />
            <p>このアプリはGoogleの検証前です。確認画面で「詳細」→「移動」を選んでください</p>
          </div>

          {config?.devLogin && (
            <form className="dev" onSubmit={onDevLogin}>
              <h2>開発用ログイン（localhost のみ）</h2>
              <p className="muted small">
                Google を使わず、入力したメールアドレスの利用者としてログインします。
              </p>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@example.com"
                aria-label="開発用ログインのメールアドレス"
              />
              <button type="submit" className="button" disabled={!ready}>
                開発用ログイン
              </button>
            </form>
          )}
        </section>
        <p className="google-privacy">
          <a
            className="text-link tap-link"
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noreferrer"
          >
            Googleのプライバシーポリシー
          </a>
        </p>
      </main>
      <TrustFooter />
    </div>
  );
}
