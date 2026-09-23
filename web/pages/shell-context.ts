import { ApiError, type Me } from "../api";

export interface ShellContext {
  me: Me;
  reload: () => Promise<void>;
}

export const errorText = (err: unknown) =>
  err instanceof ApiError ? `${err.message}（${err.hint}）` : "処理に失敗しました。";
