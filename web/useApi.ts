// GET を1本読むだけのフック（キャッシュなし）。操作後の再読込で前の表示を残したい画面は使わない
import { useEffect, useState } from "react";
import { api } from "./api";
import { errorText } from "./pages/shell-context";

type Loaded<T> = { path: string; data: T | null; error: string };

/**
 * path が変わったら前の応答は表示しない（期間切替の失敗で前の期間の実績を残さない）。
 * path が null の間は読まない（キャッシュしない）。テナント切替は Shell の Outlet の key で作り直される
 */
export function useApi<T>(path: string | null): {
  data: T | null;
  error: string;
  loading: boolean;
} {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);

  useEffect(() => {
    // 閉じて開き直したとき（path → null → 同じ path）に前回の応答を出さない
    if (path === null) {
      setLoaded(null);
      return;
    }
    const ctrl = new AbortController();
    api<T>(path, { signal: ctrl.signal })
      .then((data) => {
        if (!ctrl.signal.aborted) setLoaded({ path, data, error: "" });
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setLoaded({ path, data: null, error: errorText(e) });
      });
    return () => ctrl.abort();
  }, [path]);

  const current = path !== null && loaded?.path === path ? loaded : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? "",
    loading: path !== null && current === null,
  };
}
