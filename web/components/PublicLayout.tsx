// ログイン前の画面（ログイン・招待）の共通レイアウト。ブランドだけのヘッダーと共通フッター
import type { ReactNode } from "react";
import { SiteFooter } from "./SiteFooter";

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="public-layout">
      <header className="public-header">
        <a className="brand" href="/login">
          Channel Insight
        </a>
      </header>
      <main className="center">{children}</main>
      <SiteFooter />
    </div>
  );
}
