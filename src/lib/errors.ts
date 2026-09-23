// エラー形式 {error:{code,message,hint}}（正本 backend 章 API Design Patterns）。一覧は docs/feat-platform-tenant-auth/requirements.md §4
import type { ContentfulStatusCode } from "hono/utils/http-status";

export const ERRORS = {
  UNAUTHENTICATED: [401, "ログインが必要です", "ログイン画面からGoogleでログインしてください"],
  FORBIDDEN: [
    403,
    "この操作を行う権限がありません",
    "テナントのオーナーに権限の変更を依頼してください",
  ],
  CSRF_REJECTED: [403, "不正なリクエストです", "画面を再読み込みしてからやり直してください"],
  NOT_FOUND: [404, "対象が見つかりません", "URLや選択中のテナントを確認してください"],
  VALIDATION_FAILED: [400, "入力内容に誤りがあります", "入力内容を確認してください"],
  CONSENT_REQUIRED: [
    400,
    "利用規約とプライバシーポリシーへの同意が必要です",
    "ログイン画面で同意にチェックしてください",
  ],
  OAUTH_STATE_MISMATCH: [400, "ログインの確認に失敗しました", "もう一度ログインしてください"],
  OAUTH_FAILED: [502, "Googleとの通信に失敗しました", "時間をおいてもう一度ログインしてください"],
  EMAIL_NOT_VERIFIED: [
    403,
    "Googleアカウントのメールアドレスが確認されていません",
    "Googleでメール確認を済ませてからログインしてください",
  ],
  SIGNUP_CLOSED: [
    403,
    "現在新規の受付を停止しています",
    "既存テナントのオーナーから招待を受けてください",
  ],
  NO_TENANT: [403, "所属しているテナントがありません", "招待を受けるか、受付再開をお待ちください"],
  INVITE_NOT_USABLE: [
    404,
    "この招待リンクは使えません",
    "期限切れ・使用済み・取消済みの可能性があります。オーナーに再発行を依頼してください",
  ],
  INVITE_EMAIL_MISMATCH: [
    403,
    "招待されたメールアドレスと異なるアカウントです",
    "招待を受けたGoogleアカウントでログインし直してください",
  ],
  ALREADY_MEMBER: [409, "すでにこのテナントのメンバーです", "テナント切替から選択してください"],
  LAST_OWNER: [409, "最後のオーナーは外せません", "先に別のメンバーをオーナーにしてください"],
  INTERNAL: [500, "内部エラーが発生しました", "時間をおいて再度お試しください"],
} as const satisfies Record<string, readonly [ContentfulStatusCode, string, string]>;

export type ErrorCode = keyof typeof ERRORS;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly hint: string;
  readonly status: ContentfulStatusCode;

  constructor(code: ErrorCode, hint?: string) {
    const [status, message, defaultHint] = ERRORS[code];
    super(message);
    this.code = code;
    this.status = status;
    this.hint = hint ?? defaultHint;
  }

  toBody() {
    return { error: { code: this.code, message: this.message, hint: this.hint } };
  }
}
