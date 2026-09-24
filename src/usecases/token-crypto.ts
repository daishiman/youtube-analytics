// refresh token の暗号化（AES-256-GCM）。鍵は Workers Secret TOKEN_ENC_KEY の SHA-256、IV は毎回 96bit の乱数。
// 保存形式は "v1.<iv>.<暗号文>"（base64url）。平文はログにも D1 にも残さない
import { base64url, base64urlDecode } from "../lib/crypto";

const encoder = new TextEncoder();

async function keyFrom(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptToken(secret: string, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await keyFrom(secret),
    encoder.encode(plain),
  );
  return `v1.${base64url(iv)}.${base64url(new Uint8Array(cipher))}`;
}

export async function decryptToken(secret: string, stored: string): Promise<string> {
  const [version, iv, cipher] = stored.split(".");
  const bytes = (text: string) => base64urlDecode(text) as Uint8Array<ArrayBuffer>;
  if (version !== "v1" || !iv || !cipher) throw new Error("暗号化トークンの形式が不正です");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes(iv) },
    await keyFrom(secret),
    bytes(cipher),
  );
  return new TextDecoder().decode(plain);
}
