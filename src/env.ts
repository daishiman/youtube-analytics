// wrangler.toml のバインディングと Workers Secrets の型。変更時は wrangler.toml と同時に更新する
export type CollectMessage = { kind: "collect"; tenantId: string };
export type CleanupMessage = { kind: "cleanup" };

export interface Bindings {
  DB: D1Database;
  MEDIA: R2Bucket;
  COLLECT_QUEUE: Queue<CollectMessage>;
  CLEANUP_QUEUE: Queue<CleanupMessage>;
  ASSETS: Fetcher;
  MAX_TENANTS: string;
  GOOGLE_CLIENT_ID: string;
  // Workers Secrets（ローカルは .dev.vars）
  GOOGLE_CLIENT_SECRET: string;
  TOKEN_ENC_KEY: string;
  // 運営者テナント（force-ssl の Google 審査が通るまで、字幕トグルをこのテナントのオーナーだけに開く）
  OPERATOR_TENANT_ID?: string;
  // force-ssl の OAuth 検証が通ったら "1" にして全テナントへ字幕トグルを開放する
  FORCE_SSL_VERIFIED?: string;
  // 無料枠表示用の Cloudflare GraphQL Analytics（Account Analytics Read の API トークンは Workers Secrets）
  CF_ACCOUNT_ID?: string;
  CF_ANALYTICS_TOKEN?: string;
  // 開発専用ログインの有効化フラグ。.dev.vars にだけ "1" を置く（本番の vars/Secrets には置かない）
  DEV_LOGIN?: string;
}
