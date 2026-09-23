// wrangler.toml のバインディングと Workers Secrets の型。変更時は wrangler.toml と同時に更新する
export type CollectMessage = { kind: "collect"; tenantId: string } | { kind: "cleanup" };

export interface Bindings {
  DB: D1Database;
  MEDIA: R2Bucket;
  COLLECT_QUEUE: Queue<CollectMessage>;
  ASSETS: Fetcher;
  MAX_TENANTS: string;
  GOOGLE_CLIENT_ID: string;
  // Workers Secrets（ローカルは .dev.vars）
  GOOGLE_CLIENT_SECRET: string;
  TOKEN_ENC_KEY: string;
  // 開発専用ログインの有効化フラグ。.dev.vars にだけ "1" を置く（本番の vars/Secrets には置かない）
  DEV_LOGIN?: string;
}
