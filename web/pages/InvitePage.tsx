// 招待リンク: 「○○に招待されています」を表示し、ログイン済みなら参加、未ログインならログインへ

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { TENANT_LABEL } from "../../src/domain/labels";
import { ApiError, api, type Me, REDIRECT_MESSAGES, ROLE_LABELS, type Role } from "../api";
import { PublicLayout } from "../components/PublicLayout";

interface Preview {
  tenantName: string;
  role: Role;
  emailHint: string;
}

export function InvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const [preview, setPreview] = useState<Preview | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState(() => {
    const code = params.get("error");
    return code ? (REDIRECT_MESSAGES[code] ?? "招待を受けられませんでした。") : "";
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      api<Preview>(`/api/auth/invite?token=${encodeURIComponent(token)}`),
      api<Me>("/api/me"),
    ]).then(([p, m]) => {
      if (p.status === "fulfilled") setPreview(p.value);
      else
        setError(
          (prev) =>
            prev ||
            (p.reason instanceof ApiError ? p.reason.message : "招待を確認できませんでした。"),
        );
      if (m.status === "fulfilled") setMe(m.value);
      setLoading(false);
    });
  }, [token]);

  async function accept() {
    setError("");
    try {
      await api("/api/invites/accept", { method: "POST", body: { token } });
      navigate("/");
    } catch (err) {
      setError(
        err instanceof ApiError ? `${err.message}（${err.hint}）` : "参加できませんでした。",
      );
    }
  }

  async function switchAccount() {
    await api("/api/auth/logout", { method: "POST" });
    navigate(`/login?invite=${encodeURIComponent(token)}`);
  }

  return (
    <PublicLayout>
      <section className="card narrow">
        <h1>{TENANT_LABEL}への招待</h1>
        {loading && <p className="muted">確認中…</p>}
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
        {preview && (
          <>
            <p className="lead">
              「{preview.tenantName}」に{ROLE_LABELS[preview.role]}として招待されています。
            </p>
            <p className="muted">招待先メールアドレス: {preview.emailHint}</p>
            {me ? (
              <>
                <p className="muted">ログイン中: {me.user.email}</p>
                <button type="button" className="button primary" onClick={accept}>
                  参加する
                </button>
                <button type="button" className="button" onClick={switchAccount}>
                  別のアカウントでログインし直す
                </button>
              </>
            ) : (
              <Link className="button primary" to={`/login?invite=${encodeURIComponent(token)}`}>
                ログインして参加する
              </Link>
            )}
          </>
        )}
        {!loading && !preview && (
          <Link className="button" to="/">
            トップへ
          </Link>
        )}
      </section>
    </PublicLayout>
  );
}
