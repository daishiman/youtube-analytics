// ログイン: 利用規約・プライバシーポリシーへの同意 → Google ログイン（開発時のみ開発用ログインも出す）
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ApiError, api, REDIRECT_MESSAGES } from "../api";

export function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const invite = params.get("invite") ?? "";
  const [consent, setConsent] = useState(false);
  const [devLogin, setDevLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState(() => {
    const code = params.get("error");
    return code ? (REDIRECT_MESSAGES[code] ?? "ログインに失敗しました。") : "";
  });

  useEffect(() => {
    api<{ devLogin: boolean }>("/api/auth/config")
      .then((c) => setDevLogin(c.devLogin))
      .catch(() => setDevLogin(false));
  }, []);

  const googleHref = `/api/auth/login?consent=1${invite ? `&invite=${encodeURIComponent(invite)}` : ""}`;

  async function onDevLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const r = await api<{ next: string }>("/api/auth/dev-login", {
        method: "POST",
        body: { email, invite: invite || undefined },
      });
      navigate(r.next);
    } catch (err) {
      setError(
        err instanceof ApiError ? `${err.message}（${err.hint}）` : "ログインに失敗しました。",
      );
    }
  }

  return (
    <main className="center">
      <section className="card narrow">
        <h1>YouTube分析</h1>
        <p className="muted">Google アカウントでログインします。</p>
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            aria-label="利用規約とプライバシーポリシーに同意する"
          />
          <span>
            <a href="/terms" target="_blank" rel="noreferrer">
              利用規約
            </a>
            と
            <a href="/privacy" target="_blank" rel="noreferrer">
              プライバシーポリシー
            </a>
            に同意する
          </span>
        </label>
        <button
          type="button"
          className="button primary"
          disabled={!consent}
          onClick={() => window.location.assign(googleHref)}
        >
          Google でログイン
        </button>

        {devLogin && (
          <form className="dev" onSubmit={onDevLogin}>
            <h2>開発用ログイン（localhost のみ）</h2>
            <p className="muted">
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
            <button type="submit" className="button" disabled={!consent}>
              開発用ログイン
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
