// ログイン画面下の信頼表示3つと規約リンク（根拠はプライバシーポリシー「安全のための約束」）。
// 文言は全画面共通フッター（SiteFooter の FOOTER_BADGES・qa-074）と同じものを使い、アイコンだけ足す
import { CloudIcon, DatabaseIcon, ShieldIcon } from "./LoginIcons";
import { FOOTER_BADGES } from "./SiteFooter";

const BADGE_ICONS = [ShieldIcon, DatabaseIcon, CloudIcon] as const;

export function TrustFooter() {
  return (
    <footer className="trust-footer">
      <ul className="trust-items" aria-label="このサービスの約束">
        {FOOTER_BADGES.map((badge, i) => {
          const Icon = BADGE_ICONS[i] ?? ShieldIcon;
          return (
            <li key={badge}>
              <Icon />
              {badge}
            </li>
          );
        })}
      </ul>
      <nav className="legal-links" aria-label="規約">
        <a className="text-link tap-link" href="/privacy">
          プライバシーポリシー
        </a>
        <span aria-hidden="true">|</span>
        <a className="text-link tap-link" href="/terms">
          利用規約
        </a>
      </nav>
    </footer>
  );
}
