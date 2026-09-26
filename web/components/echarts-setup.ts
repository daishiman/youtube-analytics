// ダッシュボードで使う ECharts の部品だけを登録する（全部入りを読まない）
import { BarChart, LineChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  MarkPointComponent,
  TooltipComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  LineChart,
  BarChart,
  PieChart,
  GridComponent,
  LegendComponent,
  MarkPointComponent,
  TooltipComponent,
  CanvasRenderer,
]);

export { echarts };
