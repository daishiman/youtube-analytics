// 全画面共通のフッター（ログイン・招待・静的ページも同じ内容・qa-062）。public/*.html も同じ文言を持つ（e2e/settings.spec.ts で一致を検査）
export const FOOTER_BADGES = [
  "OAuthは読み取り専用（字幕ON時は字幕のみ追加許可）",
  "データは利用者ごとに分離",
  "無料枠で運用",
] as const;

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <ul className="footer-badges" aria-label="このサービスの約束">
        {FOOTER_BADGES.map((badge) => (
          <li key={badge} className="footer-badge">
            {badge}
          </li>
        ))}
      </ul>
      <nav className="footer-links" aria-label="規約">
        <a href="/privacy">プライバシーポリシー</a>
        <span aria-hidden="true">|</span>
        <a href="/terms">利用規約</a>
      </nav>
    </footer>
  );
}
