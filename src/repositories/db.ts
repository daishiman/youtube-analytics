// current system は単一D1を正本とし、repositoryはすべてこのbindingを使う。
import type { Bindings } from "../env";

/** 認証・テナント管理の表（users/tenants/tenant_members/tenant_invites/sessions）が載る D1 */
export function controlDb(env: Bindings): D1Database {
  return env.DB;
}
