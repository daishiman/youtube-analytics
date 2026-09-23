// 参照先 D1 の解決はこの1か所だけで行う（正本 database 章: tenants.db_binding から決める解決関数）
import type { Bindings } from "../env";

/** 認証・テナント管理の表（users/tenants/tenant_members/tenant_invites/sessions）が載る D1 */
export function controlDb(env: Bindings): D1Database {
  return env.DB;
}

/**
 * テナントの業務データが載る D1。現在は全テナントが既定の 'DB'。
 * 将来テナントを別 D1 へ分けるときは wrangler.toml に binding を足し、ここへ分岐を足すだけにする。
 */
export function resolveTenantDb(env: Bindings, dbBinding: string): D1Database {
  if (dbBinding === "DB") return env.DB;
  throw new Error(`未対応の db_binding: ${dbBinding}`);
}
