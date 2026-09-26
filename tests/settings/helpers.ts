// 設定画面テストの共通部品: 取込ファイルの送信と監査ログ・テナント名の確認。
// Google の偽物と連携手続きは tests/helpers/google.ts にあり、既存テストのためにここからも読めるようにする
import { env } from "cloudflare:workers";
import { app } from "../../src/index";
import { type LoggedIn, ORIGIN } from "../platform/helpers";

export {
  callback,
  type FakeChannel,
  fakeGoogle,
  type GoogleFake,
  linkChannel,
  registerGoogleClient,
  startOAuth,
  TEST_CLIENT,
} from "../helpers/google";
export { auditCount, type Owner } from "../platform/helpers";

/** multipart で取込ファイルを送る */
export async function upload(
  user: LoggedIn,
  kind: string,
  file: { name: string; body: string | Uint8Array<ArrayBuffer>; type?: string },
): Promise<Response> {
  const form = new FormData();
  form.set("kind", kind);
  form.set("file", new File([file.body], file.name, { type: file.type ?? "" }));
  return app.request(
    `${ORIGIN}/api/imports`,
    { method: "POST", headers: { cookie: user.cookie, "x-requested-with": "yta" }, body: form },
    env,
  );
}

export async function tenantName(tenantId: string): Promise<string> {
  const row = await env.DB.prepare("SELECT name FROM tenants WHERE tenant_id = ?1")
    .bind(tenantId)
    .first<{ name: string }>();
  return row?.name ?? "";
}
