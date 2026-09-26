// AI分析画面のデータ取得。読み込みは始めるたびに前のものを中断し、最後に始めたものだけを反映する。
// 依頼一覧は待機中・実行中がある間だけ10秒ごとに再取得し、
// タブが隠れている（document.visibilityState === "hidden"）間は止める
import { useCallback, useEffect, useRef, useState } from "react";
import { isActiveStatus } from "../../../src/domain/analysis";
import { type AnalysisRequest, analysisApi, type ReportSummary } from "../../api";
import { errorText } from "../shell-context";

export const POLL_MS = 10_000;
export const SEARCH_DEBOUNCE_MS = 300;

export const isActive = (r: AnalysisRequest) => isActiveStatus(r.status);

/**
 * 中断できる読み込み。始めるたびに前の読み込みを中断し（アンマウントでも中断する）、
 * 最後に始めたものの結果か失敗の文言だけを onValue / onError に渡す
 */
export function useLatestFetch() {
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  return useCallback(
    async <T>(
      fetcher: (signal: AbortSignal) => Promise<T>,
      onValue: (value: T) => void,
      onError?: (message: string) => void,
    ) => {
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      try {
        const value = await fetcher(current.signal);
        if (!current.signal.aborted) onValue(value);
      } catch (err) {
        if (!current.signal.aborted) onError?.(errorText(err));
      }
    },
    [],
  );
}

/**
 * fetcher（useCallback で作る）の結果を読む。fetcher が変わるたびと reload で読み直す。
 * 失敗しても直前に読めた data は残し、error は次に読めたときに消す
 */
export function useLoad<T>(fetcher: (signal: AbortSignal) => Promise<T>) {
  const fetchLatest = useLatestFetch();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(
    () =>
      fetchLatest(
        fetcher,
        (value) => {
          setData(value);
          setError("");
        },
        setError,
      ),
    [fetchLatest, fetcher],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, reload };
}

/**
 * enabled の間、タブが見えているときだけ ms ごとに tick を呼ぶ。
 * 隠れている間は止め、見えるようになったらすぐ1回呼んでから再開する
 */
export function useVisiblePolling(tick: () => void, enabled: boolean, ms: number = POLL_MS) {
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null && document.visibilityState !== "hidden") timer = setInterval(tick, ms);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
      else {
        tick();
        start();
      }
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [tick, enabled, ms]);
}

const listRequests = (signal: AbortSignal) => analysisApi.listRequests(undefined, signal);

export function useRequests() {
  const { data, error, reload } = useLoad(listRequests);
  const items = data ? data.items : null;
  const polling = items?.some(isActive) === true;
  useVisiblePolling(reload, polling);
  return { items, error, load: reload, polling };
}

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** レポート一覧（検索は300msデバウンス・アーカイブ表示の切替・さらに表示） */
export function useReports(q: string, archived: boolean) {
  const query = useDebounced(q.trim(), SEARCH_DEBOUNCE_MS);
  const fetchLatest = useLatestFetch();
  const [items, setItems] = useState<ReportSummary[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(
    (cursor?: string) =>
      fetchLatest(
        (signal) => analysisApi.listReports({ q: query, archived, cursor }, signal),
        (page) => {
          setItems((prev) => (cursor ? [...(prev ?? []), ...page.items] : page.items));
          setNextCursor(page.nextCursor);
          setError("");
        },
        setError,
      ),
    [fetchLatest, query, archived],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return { items, nextCursor, error, reload: () => load(), more: () => load(nextCursor ?? "") };
}
