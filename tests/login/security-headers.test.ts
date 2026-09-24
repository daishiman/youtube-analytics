// A7: CSP などのヘッダを画面（public/_headers）と API の両方に同じ定義から付ける。規約ページの表示内容
import { describe, expect, it } from "vitest";
import headersFile from "../../public/_headers?raw";
import privacyHtml from "../../public/privacy.html?raw";
import termsHtml from "../../public/terms.html?raw";
import { SECURITY_HEADERS } from "../../src/http/security-headers";
import { LEGAL_VERSIONS } from "../../src/usecases/login-consent";
import { call } from "../platform/helpers";
import { YT, YTA } from "./oauth";

function parseHeadersFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = /^\s+([A-Za-z-]+):\s*(.+)$/.exec(line);
    if (m?.[1] && m[2]) out[m[1]] = m[2].trim();
  }
  return out;
}

describe("A7 セキュリティヘッダ", () => {
  it("CSP は自サイトと Google 認証だけを許可し、埋め込みを禁止する", () => {
    const csp = SECURITY_HEADERS["Content-Security-Policy"];
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self' https://accounts.google.com");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("public/_headers の値は SECURITY_HEADERS と完全に一致する", () => {
    expect(parseHeadersFile(headersFile)).toEqual(SECURITY_HEADERS);
  });

  it("API の応答にも同じヘッダが付き、キャッシュされない", async () => {
    const res = await call("/api/auth/config");
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(res.headers.get(name), name).toBe(value);
    }
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("規約ページ", () => {
  for (const [name, html] of [
    ["privacy", privacyHtml],
    ["terms", termsHtml],
  ] as const) {
    it(`${name}.html はインライン style を持たず legal.css を読み、製品名と現行版を載せる`, () => {
      expect(html).not.toMatch(/<style/i);
      expect(html).not.toMatch(/\sstyle=/i);
      expect(html).toContain('<link rel="stylesheet" href="/legal.css"');
      expect(html).toContain("Channel Insight");
      expect(html).not.toContain("YouTube分析");
      expect(html).toContain(`data-version="${LEGAL_VERSIONS[name]}"`);
    });
  }

  it("プライバシーポリシーは要求する読み取り専用スコープと信頼表示3つの根拠を載せる", () => {
    expect(privacyHtml).toContain(YT);
    expect(privacyHtml).toContain(YTA);
    for (const text of ["読み取り専用", "利用者ごとに分離", "無料枠"]) {
      expect(privacyHtml).toContain(text);
    }
  });
});
