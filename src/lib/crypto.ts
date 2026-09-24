// 乱数・ハッシュ・PKCE。Workers の Web Crypto だけを使う

const encoder = new TextEncoder();

export function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlDecode(text: string): Uint8Array<ArrayBuffer> {
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

// AES-GCM による秘密値の暗号化（refresh token・OAuth の一時状態）。鍵は TOKEN_ENC_KEY から HKDF で導く
const keyCache = new Map<string, Promise<CryptoKey>>();

function aesKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle
      .importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveKey"])
      .then((base) =>
        crypto.subtle.deriveKey(
          {
            name: "HKDF",
            hash: "SHA-256",
            salt: encoder.encode("yta-token-enc-v1"),
            info: new Uint8Array(),
          },
          base,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"],
        ),
      );
    keyCache.set(secret, key);
  }
  return key;
}

/** 形式: v1.<iv base64url>.<ciphertext base64url> */
export async function encryptText(secret: string, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await aesKey(secret),
    encoder.encode(plain),
  );
  return `v1.${base64url(iv)}.${base64url(new Uint8Array(cipher))}`;
}

/** 改ざん・鍵違いは例外になる */
export async function decryptText(secret: string, sealed: string): Promise<string> {
  const [version, iv, body] = sealed.split(".");
  if (version !== "v1" || !iv || !body) throw new Error("暗号文の形式が不正です");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64urlDecode(iv) },
    await aesKey(secret),
    base64urlDecode(body),
  );
  return new TextDecoder().decode(plain);
}
