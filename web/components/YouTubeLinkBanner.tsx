// YouTube の連携が未完了のときの案内。連携操作はオーナーだけが行える
import { TENANT_LABEL } from "../../src/domain/labels";
import type { TenantSummary } from "../api";

export function YouTubeLinkBanner({ tenant }: { tenant: TenantSummary }) {
  const status = tenant.youtubeLinkStatus;
  if (status !== "partial" && status !== "none") return null;
  return (
    <section className="link-banner" aria-labelledby="link-banner-title">
      <div>
        <p id="link-banner-title" className="link-banner-title">
          {status === "none" ? "YouTube がまだ連携されていません" : "YouTube 連携が未完了です"}
        </p>
        <p className="muted small">
          {tenant.role === "owner"
            ? status === "none"
              ? "YouTube の読み取り連携がまだありません。「連携する」から許可してください。"
              : "YouTube の読み取り連携を完了できていません。「再連携」からやり直してください。"
            : status === "none"
              ? `${TENANT_LABEL}のオーナーに YouTube の連携を依頼してください。`
              : `${TENANT_LABEL}のオーナーに YouTube の再連携を依頼してください。`}
        </p>
      </div>
      {tenant.role === "owner" && (
        <a className="button primary" href="/api/auth/youtube/connect">
          {status === "none" ? "連携する" : "再連携"}
        </a>
      )}
    </section>
  );
}
