// ECharts の描画枠。ライブラリは初回表示時に遅延読込し、最初の画面の JS を軽くする（frontend 章・qa-093）。
// CSP は style-src 'self' のため、ツールチップは HTML ではなく canvas 内の richText で描く
import type { EChartsCoreOption, EChartsType } from "echarts/core";
import { useEffect, useRef, useState } from "react";

type EChartsModule = typeof import("./echarts-setup");

let loader: Promise<EChartsModule> | null = null;
const loadECharts = () => {
  loader ??= import("./echarts-setup");
  return loader;
};

export function EChart({
  option,
  label,
  height = 240,
}: {
  option: EChartsCoreOption;
  /** 画面読み上げ用の要約。グラフの横に同じ内容の文字要約も出す */
  label: string;
  height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<EChartsType | null>(null);
  const [failed, setFailed] = useState(false);
  // 読込中に option が変わっても、初期化時に最新の値を使う
  const latest = useRef(option);
  latest.current = option;

  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | null = null;
    loadECharts()
      .then(({ echarts }) => {
        if (disposed || !box.current) return;
        chart.current = echarts.init(box.current, undefined, { renderer: "canvas" });
        chart.current.setOption(latest.current);
        observer = new ResizeObserver(() => chart.current?.resize());
        observer.observe(box.current);
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      observer?.disconnect();
      chart.current?.dispose();
      chart.current = null;
    };
    // 初期化は1回だけ。option の変化は下の effect で反映する
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);

  if (failed)
    return (
      <p className="muted small">グラフを読み込めませんでした。表に切り替えて確認してください。</p>
    );
  return <div ref={box} className="chart" role="img" aria-label={label} style={{ height }} />;
}
