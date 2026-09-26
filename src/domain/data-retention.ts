// YouTube API Developer Policies III.E.4: Analytics 以外の認可データは30日を超えて保持しない。
// 期限の前に取り直すため、25日を過ぎたものから再取得の対象にする
import { DAY_MS } from "./time";

export const API_DATA_MAX_AGE_DAYS = 30;
export const API_DATA_MAX_AGE_MS = API_DATA_MAX_AGE_DAYS * DAY_MS;
export const API_DATA_REFRESH_DAYS = 25;
