// 乱数・ハッシュ・PKCE。Workers の Web Crypto だけを使う

const encoder = new TextEncoder();

export function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlDecode(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

/** 暗号学的乱数の base64url 文字列。既定 32byte = 256bit（セッションID・招待トークン） */
export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** 表の主キー用 ID（推測困難である必要はないが UUID で衝突を避ける） */
export function newId(): string {
  return crypto.randomUUID();
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** PKCE S256 の code_challenge（RFC 7636） */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  return base64url(new Uint8Array(digest));
}
