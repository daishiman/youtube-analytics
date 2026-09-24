// 画面（public/_headers）と API（app.ts）で共通のセキュリティヘッダの唯一の定義元（正本 security 章 qa-072）。
// public/_headers はこの値と1文字違わず一致させる（tests/login/security-headers.test.ts が検査する）
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  // ログイン開始は自サイトの /api/auth/login から Google へ遷移する
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
].join("; ");

export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
