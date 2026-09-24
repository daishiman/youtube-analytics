// ログイン画面下の信頼表示3つと規約リンク（根拠はプライバシーポリシー「安全のための約束」）
import { CloudIcon, DatabaseIcon, ShieldIcon } from "./LoginIcons";

export function TrustFooter() {
  return (
    <footer className="trust-footer">
      <ul className="trust-items">
        <li>
          <ShieldIcon />
          OAuthは読み取り専用
        </li>
        <li>
          <DatabaseIcon />
          データは利用者ごとに分離
        </li>
        <li>
          <CloudIcon />
          無料枠で運用
        </li>
      </ul>
      <p className="legal-links">
        <a className="text-link tap-link" href="/privacy">
          プライバシーポリシー
        </a>
        <span aria-hidden="true">|</span>
        <a className="text-link tap-link" href="/terms">
          利用規約
        </a>
      </p>
    </footer>
  );
}
