// analysis.mjs（report-design-system の分析フォルダに置く再現計算）の本体。
// 分析フォルダの export.json・brief.json・profile.json・inputs.json を読み、compute.mjs で計算し、
//   results.json      … report-design-system の判定記録（steps・hypotheses。check-llm.mjs results が読む）
//   yt-result.json    … 結果 JSON（catalog §6）から report_html を除いたもの（POST 前に HTML を入れる）
//   <name>.src.html   … report-design-system の compose.mjs で組んだソース（build-report.mjs が HTML にする）
// を書き出す。report-design-system 本体は無改変のまま、公開関数を import して呼ぶだけにする。
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { analyzeExport, buildReportJson, digitsOf, gapText, narrate, show } from "./compute.mjs";
import { rdsScript } from "./paths.mjs";

const rds = (f) => import(pathToFileURL(rdsScript(f)).href);

const readJson = (dir, f) => {
  try {
    return JSON.parse(readFileSync(join(dir, f), "utf8"));
  } catch {
    throw new Error(`${f} がありません（分析フォルダ ${dir}）。/yt-analyze の手順で作り直してください`);
  }
};

/** init 後に入力 CSV が変わっていないことを確かめる（report-design-system の inputs.json 契約） */
function verifyInputs(dir) {
  const inputs = readJson(dir, "inputs.json");
  if (inputs.version !== 1 || !Array.isArray(inputs.files) || !inputs.files.length) throw new Error("inputs.json が不正です");
  return inputs.files.map((e) => {
    const actual = createHash("sha256").update(readFileSync(e.path)).digest("hex");
    if (actual !== e.sha256) throw new Error(`入力データが init 後に変更されました: ${e.path}`);
    return e.path;
  });
}

export async function runAnalysis({ dir }) {
  const [{ header, conclusion, factor, actions, footer, source, num, hypothesisClaim }, { figure, hbar, line }, { checkBrief }] = await Promise.all([
    rds("compose.mjs"),
    rds("charts.mjs"),
    rds("check-llm.mjs"),
  ]);
  const name = basename(dir);
  const BRIEF = readJson(dir, "brief.json");
  const errors = checkBrief(BRIEF, readJson(dir, "profile.json"), [], { pre: true });
  if (errors.length) throw new Error(`brief.json が検査に通りません (check-llm.mjs brief):\n${errors.join("\n")}`);
  const DATA_FILES = verifyInputs(dir);
  const EXPORT = readJson(dir, "export.json");
  const a = analyzeExport(EXPORT, BRIEF);
  const d = a.diagnosis;
  const { summary, candidateMetric: cand } = narrate(a);

  // ---- 要因: 判定できた原因指標を目標比の低い順に最大3つ（情報量「標準」）。impact = 目標比(%) ----
  const judged = d.metrics.filter((m) => m.target_gap != null).sort((x, y) => x.target_gap - y.target_gap).slice(0, 3);
  const adopted = a.hypotheses.find((h) => h.判定 === "採用");
  const RESULTS = {
    steps: judged.map((m) => ({ label: m.label, value: Math.round(m.target_gap * 1000) / 10 })),
    hypotheses: a.hypotheses.map(({ id, 判定, 数字 }) => ({ id, 判定, 数字 })),
  };
  // 判定できた指標がないときの「判定保留」要因（下で作る）にも steps を対応させる（check-llm results）
  if (!judged.length) RESULTS.steps.push({ label: "判定保留", value: 0 });
  writeFileSync(join(dir, "results.json"), `${JSON.stringify(RESULTS, null, 2)}\n`);

  const weeksOf = (id) => a.complete.map((w) => ({ label: w.week.slice(5), value: w[id] })).filter((p) => p.value != null);
  const factors = judged.map((m, i) => {
    const dg = digitsOf(m.metric);
    const pts = weeksOf(m.metric);
    const isCand = cand && m.metric === cand.metric;
    const hyp = isCand && adopted ? [adopted.id] : [];
    const below = a.diagnoses.filter((x) => (x.metrics.find((y) => y.metric === m.metric)?.target_gap ?? 0) < 0).length;
    return factor({
      toc: m.label,
      impact: RESULTS.steps[i].value,
      hypotheses: hyp,
      ...(hyp.length ? { claim: hypothesisClaim(BRIEF, RESULTS, hyp[0]) } : {}),
      h2: `${m.stage}段の${m.label}は目標比 ${gapText(m.target_gap)}`,
      interpretation:
        m.target_gap < 0
          ? `${m.stage}段は目標に届いておらず、改善候補を比べる対象になる。売上との関係は未確認`
          : `${m.stage}段は目標以上で、今週の改善候補からは外してよい`,
      meaning: m.target_gap < 0 ? `${m.stage}段の施策を次の一手の候補に入れて比べる` : `${m.stage}段は現状の運用を保ち、他の段を優先する`,
      figures: [
        pts.length >= 2
          ? figure({
              title: `${m.label}の週次推移`,
              legend: "破線=目標",
              svg: line({ points: pts, unit: m.unit, digits: dg, aria: `${m.label}の週次推移`, baseline: { value: m.target, label: "目標" } }),
            })
          : figure({
              title: `${m.label}の実績と目標`,
              legend: "目標との比較",
              svg: hbar({ items: [{ label: "実績", value: m.actual }, { label: "目標", value: m.target }], unit: m.unit, digits: dg, aria: `${m.label}の実績と目標` }),
            }),
      ],
      stats: [
        { label: "n", value: `${a.complete.length}週` },
        { label: "目標を下回った週", value: `${below}週` },
      ],
      facts: [
        `${d.week}週 ${num(`${show(m.actual, dg)}${m.unit}`, { loss: m.target_gap < 0 })}、目標 ${num(`${show(m.target, dg)}${m.unit}`)}`,
        `目標比 ${num(gapText(m.target_gap), { loss: m.target_gap < 0 })}（${m.stage}段）`,
      ],
      data: DATA_FILES.map((f) => basename(f)).join("・"),
      calc: "target_gap = (実績 − 目標) ÷ 目標。Studio CSV と事業 CSV の週次値だけを使う",
    });
  });

  // 判定できた指標が1つもない（収集前・期間にデータがない）ときも、要因は1つ以上要る（compose の並び規則）。
  // 判定保留の理由そのものを要因として示し、何が足りないかをレポートに残す
  if (!factors.length) {
    const total = d.metrics.length || 5;
    const reasons = d.pending_reasons.map((p) => p.reason);
    factors.push(
      factor({
        toc: "判定保留",
        impact: 0,
        h2: `${total}原因指標はすべて判定保留（対象週のデータ不足）`,
        interpretation: "目標と比べられる週次の値がないため、どの段を改善すべきかは言えない",
        meaning: "データの取り込みを先に済ませ、次回の分析で改善候補を比べる",
        figures: [
          figure({
            title: "判定できた原因指標の数",
            legend: "判定できた / 判定保留",
            svg: hbar({ items: [{ label: "判定できた", value: 0 }, { label: "判定保留", value: total }], unit: "指標", digits: 0, aria: "判定できた原因指標の数" }),
          }),
        ],
        stats: [
          { label: "n", value: `${a.complete.length}週` },
          { label: "判定保留", value: `${total}指標` },
        ],
        facts: [
          `対象期間の書き出し行 ${num(`${EXPORT.rows?.length ?? 0}行`)}（週次にまとめられた週 ${num(`${a.complete.length}週`)}）`,
          // 事実の文には「原因」を含めない（check-report の E08 は因果語として扱う）
          `判定できた指標 ${num("0指標")}、判定保留 ${num(`${total}指標`, { loss: true })}${reasons.length ? `（${reasons[0]}）` : ""}`,
        ],
        data: DATA_FILES.map((f) => basename(f)).join("・"),
        calc: "target_gap = (実績 − 目標) ÷ 目標。値か目標がない指標は判定保留",
      }),
    );
  }

  const heroMetric = cand ?? judged[0] ?? null;
  const noJudged = !judged.length;
  const hero = heroMetric
    ? { label: `${heroMetric.label}の目標比`, value: gapText(heroMetric.target_gap) }
    : { label: "判定できた原因指標", value: String(judged.length) };
  const acts = cand
    ? [
        {
          title: `${cand.stage}段の${cand.label}を目標へ近づける施策を1件試す`,
          from: cand.label,
          source: "pending",
          effect: `目標まで ${show(cand.target - cand.actual, digitsOf(cand.metric))}${cand.unit}（前提: 同じ週の条件）`,
          owner: "要確認",
          due: "要確認",
        },
      ]
    : [];
  const crumb = `${EXPORT.channel?.title ?? "チャンネル"}｜週次ファネル分析`;
  const title = `週次ファネル分析 v${a.version}`;
  const created = String(EXPORT.generated_at ?? EXPORT.request?.period_end ?? "").slice(0, 10) || EXPORT.request?.period_end;
  writeFileSync(
    join(dir, `${name}.src.html`),
    source({
      title,
      parts: [
        header({ crumb, title, target: `${EXPORT.request?.period_start}〜${EXPORT.request?.period_end}（${a.complete.length}週）`, created, detail: BRIEF.plan.情報量 }),
        conclusion({
          h2: cand
            ? `${cand.stage}段の${cand.label}が目標との差が最大（${gapText(cand.target_gap)}）`
            : d.status === "全指標目標達成"
              ? "5原因指標はすべて目標以上"
              : noJudged
                ? `${d.metrics.length || 5}原因指標のうち判定できたのは0指標`
                : "判定保留があり改善候補は未確定",
          unit: heroMetric ? "%" : "指標",
          hero,
          // 値が分からない件数は「0」と書かず、判定できないときは数えられる量（週・行・指標）だけを並べる
          kpis: noJudged
            ? [
                { label: "対象週数", value: String(a.complete.length), unit: "週" },
                { label: "書き出し行", value: String(EXPORT.rows?.length ?? 0), unit: "行" },
                { label: "判定保留", value: String(d.metrics.length || 5), unit: "指標" },
              ]
            : [
                { label: "対象週", value: d.week ?? "—" },
                { label: "問い合わせ", value: show(d.downstream?.inquiries, 0), unit: "件" },
                { label: "成約", value: show(d.downstream?.closed_deals, 0), unit: "件" },
              ],
          overview: {
            comparison: `${d.week ?? "対象週"}週の5原因指標を目標と比べた`,
            finding: cand ? `${cand.label}が目標比 ${gapText(cand.target_gap)} で最も離れている` : `判定: ${d.status}（${judged.length}指標を判定）`,
            interpretation: cand ? `${cand.stage}段を次の一手の候補にする` : "今週は改善候補を置かない",
            limitation: "目標との差だけで、売上への因果は言えない",
          },
          ...(d.pending_reasons.length ? { caution: `判定保留: ${d.pending_reasons.map((p) => p.reason).join("・")}`.slice(0, 60) } : {}),
        }),
        ...factors,
        ...(acts.length ? [actions({ h2: `${cand.stage}段の施策を1件選んで試す`, items: acts })] : []),
        footer({ crumb, data: DATA_FILES.map((f) => basename(f)).join("・"), method: "比較: 目標値" }),
      ],
    }),
  );
  // 結果 JSON（report_html 以外）。数値と判定は上と同じ計算結果から作る
  writeFileSync(join(dir, "yt-result.json"), `${JSON.stringify(buildReportJson(EXPORT, BRIEF, a, null), null, 2)}\n`);
  console.log(`書き出し: ${join(dir, `${name}.src.html`)}（${summary}）`);
}
