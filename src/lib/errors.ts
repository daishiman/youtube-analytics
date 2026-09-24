// エラー形式 {error:{code,message,hint}}（正本 backend 章 API Design Patterns）。一覧は docs/feat-platform-tenant-auth/requirements.md §4
import type { ContentfulStatusCode } from "hono/utils/http-status";

export const ERRORS = {
  UNAUTHENTICATED: [401, "ログインが必要です", "ログイン画面からGoogleでログインしてください"],
  FORBIDDEN: [
    403,
    "この操作を行う権限がありません",
    "ワークスペースのオーナーに権限の変更を依頼してください",
  ],
  CSRF_REJECTED: [403, "不正なリクエストです", "画面を再読み込みしてからやり直してください"],
  NOT_FOUND: [404, "対象が見つかりません", "URLや選択中のワークスペースを確認してください"],
  VALIDATION_FAILED: [400, "入力内容に誤りがあります", "入力内容を確認してください"],
  CONSENT_REQUIRED: [
    400,
    "利用規約とプライバシーポリシーへの同意が必要です",
    "ログイン画面で同意にチェックしてください",
  ],
  CONSENT_OUTDATED: [
    400,
    "利用規約またはプライバシーポリシーが更新されました",
    "内容を確認して、もう一度同意してください",
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
    "既存ワークスペースのオーナーから招待を受けてください",
  ],
  NO_TENANT: [
    403,
    "所属しているワークスペースがありません",
    "招待を受けるか、受付再開をお待ちください",
  ],
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
  ALREADY_MEMBER: [
    409,
    "すでにこのワークスペースのメンバーです",
    "ワークスペース切替から選択してください",
  ],
  LAST_OWNER: [409, "最後のオーナーは外せません", "先に別のメンバーをオーナーにしてください"],
  CHANNEL_ALREADY_LINKED: [
    409,
    "このチャンネルは別のワークスペースで連携済みです",
    "先に連携している側で連携解除してから、もう一度お試しください",
  ],
  CHANNEL_ALREADY_CONNECTED: [
    409,
    "このワークスペースにはすでにチャンネルが連携されています",
    "別のチャンネルに変えるときは、先に連携解除してください",
  ],
  CHANNEL_DELETION_PENDING: [
    409,
    "以前のチャンネルのデータ削除が未完了です",
    "削除が完了してから、YouTubeチャンネルを連携してください",
  ],
  IMPORT_DELETION_PENDING: [
    409,
    "データの削除が進行中のため取込できません",
    "削除が完了してから、もう一度ファイルを取り込んでください",
  ],
  CHANNEL_MISMATCH: [
    409,
    "連携中と別のチャンネルが選ばれました",
    "再連携は同じチャンネルでだけできます。変更するときは先に連携解除してください",
  ],
  CHANNEL_NOT_CONNECTED: [
    409,
    "YouTubeチャンネルが連携されていません",
    "設定画面の「YouTubeと連携」から連携してください",
  ],
  NO_CHANNEL: [
    400,
    "このGoogleアカウントにはYouTubeチャンネルがありません",
    "ブランドアカウントのチャンネルは、Googleのアカウント選択画面でそのチャンネルを選んでください",
  ],
  OAUTH_PENDING_EXPIRED: [
    400,
    "連携の手続きの有効期限が切れました",
    "もう一度「YouTubeと連携」からやり直してください（10分以内に選択してください）",
  ],
  SCOPE_NOT_GRANTED: [
    400,
    "必要な許可が付与されませんでした",
    "Googleの同意画面で、すべての項目にチェックを入れて許可してください",
  ],
  GOOGLE_CLIENT_NOT_CONFIGURED: [
    409,
    "このワークスペースには、Google Cloud の接続情報がまだ登録されていません",
    "オーナーが設定画面の「Google Cloud の接続情報」でクライアントIDとシークレットを登録してください",
  ],
  GOOGLE_CLIENT_REJECTED: [
    400,
    "Googleが登録済みのクライアントIDまたはシークレットを受け付けませんでした",
    "設定画面の「Google Cloud の接続情報」で、Google Cloud Console の値を登録し直してください",
  ],
  FEATURE_NOT_READY: [403, "この機能は準備中です", "Googleの審査が終わるまでお待ちください"],
  TOKEN_LIMIT: [
    409,
    "トークンは1人5本まで発行できます",
    "使っていないトークンを失効してから、もう一度発行してください",
  ],
  RATE_LIMITED: [429, "操作が多すぎます", "しばらく待ってからもう一度お試しください"],
  CONFIRM_MISMATCH: [
    400,
    "確認のために入力した名前が一致しません",
    "ワークスペース名を正確に入力してください",
  ],
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
