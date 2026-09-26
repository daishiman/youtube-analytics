// GET /api/dashboard（qa-099〜qa-107）: 既定10本・KPI・前期比・他テナント除外・入力検証・空状態・権限

import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { addDays } from "../../src/domain/dashboard-period";
import type { DashboardResponse } from "../../src/usecases/dashboard";
import { addMember, call, expectError, newOwner } from "../platform/helpers";
import { seedDashboard, videoId, yesterday } from "./helpers";

async function get(path: string, cookie: string) {
  const res = await call(path, { cookie });
  expect(res.status).toBe(200);
  return { res, body: (await res.json()) as DashboardResponse };
}

const kpi = (b: DashboardResponse, id: string) => b.kpis.find((k) => k.id === id);

describe("GET /api/dashboard", () => {
  it("既定は28日・チャンネル全体・直近10本で、KPI と前期比を返す", async () => {
    const owner = await newOwner();
    await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId, csv: true });
    const { res, body } = await get("/api/dashboard", owner.cookie);

    expect(res.headers.get("cache-control")).toBe("private, no-store");
    // サムネイルは自サイト経由なので、CSP に YouTube の画像ホストを足さない（qa-105）
    const imgSrc = res.headers
      .get("content-security-policy")
      ?.split(";")
      .find((d) => d.trim().startsWith("img-src"));
    expect(imgSrc).toContain("'self' data:");
    expect(imgSrc).not.toContain("ytimg");
    expect(body.period.key).toBe("28d");
    expect(body.period.days).toBe(28);
    expect(body.collection.status).toBe("チャンネル・動画日次を毎日3:00 JSTに収集");
    expect(body.scope).toBe("channel");
    expect(body.selection.isDefault).toBe(true);
    expect(body.selection.videoIds).toEqual(
      Array.from({ length: 10 }, (_, i) => videoId(owner.tenantId, i)),
    );
    // チャンネル日次 = 動画別合計 780 + 削除済み分 5 = 785/日
    expect(kpi(body, "views")?.value).toBe(785 * 28);
    expect(kpi(body, "views")?.change).toBe(0);
    expect(kpi(body, "watch_hours")?.value).toBeCloseTo((785 * 2 * 28) / 60, 1);
    // 暫定平均視聴率は長尺だけ。60% の先頭 Shorts は分子・分母から除く。
    expect(kpi(body, "retention_m1")?.value).toBe(30);
    expect(kpi(body, "retention_m1")?.note).toContain("YouTube公式の数値ではありません");
    expect(kpi(body, "retention_m1")?.note).toContain("暫定値");
    expect(kpi(body, "subscribers_net")?.value).toBe(2 * 28);
    expect(body.trend.dates).toHaveLength(28);
    expect(body.trend.previous).toHaveLength(28);
    expect(body.trend.perVideo).toEqual([]);
    expect(body.videos).toHaveLength(10);
    const first = body.videos[0];
    expect(first?.views).toBe(120 * 28);
    expect(first?.retention).toBeNull(); // Shorts の視聴率を長尺用 M1 に混ぜない
    expect(first?.ctr).toBe(5.5); // 期間内の最新日の CTR
    expect(first?.hasThumbnail).toBe(false);
    expect(body.videoOptions).toHaveLength(12);
    expect(body.empty).toEqual({
      notLinked: false,
      notCollected: false,
      noCsv: false,
      noReports: true,
      noActions: true,
    });
    expect(body.canEdit).toBe(true);
  });

  it("日次の欠測がある期間は取得済みの値を明示し、KPIの前期比を保留する", async () => {
    const owner = await newOwner();
    const { channelId } = await seedDashboard({
      tenantId: owner.tenantId,
      userId: owner.userId,
      csv: true,
    });
    const previousDay = addDays(yesterday(), -28);
    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM daily_metrics WHERE tenant_id = ?1 AND channel_id = ?2 AND date = ?3",
      ).bind(owner.tenantId, channelId, previousDay),
      env.DB.prepare("DELETE FROM video_daily_metrics WHERE tenant_id = ?1 AND date = ?2").bind(
        owner.tenantId,
        previousDay,
      ),
    ]);
    const { body: previousMissing } = await get("/api/dashboard", owner.cookie);
    for (const id of ["views", "watch_hours", "retention_m1", "subscribers_net"]) {
      expect(kpi(previousMissing, id)?.change).toBeNull();
      expect(kpi(previousMissing, id)?.note).toContain("前期に欠測");
    }

    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM daily_metrics WHERE tenant_id = ?1 AND channel_id = ?2 AND date = ?3",
      ).bind(owner.tenantId, channelId, yesterday()),
      env.DB.prepare("DELETE FROM video_daily_metrics WHERE tenant_id = ?1 AND date = ?2").bind(
        owner.tenantId,
        yesterday(),
      ),
    ]);
    const { body: currentMissing } = await get("/api/dashboard", owner.cookie);
    expect(kpi(currentMissing, "views")?.value).toBe(785 * 27);
    for (const id of ["views", "watch_hours", "retention_m1", "subscribers_net"]) {
      expect(kpi(currentMissing, id)?.change).toBeNull();
      expect(kpi(currentMissing, id)?.note).toContain("対象期間に欠測");
    }
  });

  it("選択動画の一部だけ日次行が欠けた日も前期比を保留する", async () => {
    const owner = await newOwner();
    await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId });
    const first = videoId(owner.tenantId, 0);
    const second = videoId(owner.tenantId, 1);
    const path = `/api/dashboard?period=7d&scope=videos&video_ids=${first},${second}`;
    const initial = (await get(path, owner.cookie)).body;
    expect(kpi(initial, "views")?.change).toBe(0);
    expect(kpi(initial, "watch_hours")?.change).toBe(0);

    await env.DB.prepare(
      "DELETE FROM video_metrics WHERE tenant_id = ?1 AND video_id = ?2 AND date = ?3",
    )
      .bind(owner.tenantId, second, addDays(yesterday(), -7))
      .run();
    const previousMissing = (await get(path, owner.cookie)).body;
    expect(kpi(previousMissing, "views")?.change).toBeNull();
    expect(kpi(previousMissing, "views")?.note).toContain("前期に欠測");
    expect(kpi(previousMissing, "watch_hours")?.change).toBeNull();

    await env.DB.prepare(
      "DELETE FROM video_metrics WHERE tenant_id = ?1 AND video_id = ?2 AND date = ?3",
    )
      .bind(owner.tenantId, second, yesterday())
      .run();
    const currentMissing = (await get(path, owner.cookie)).body;
    expect(kpi(currentMissing, "views")?.value).toBe(230 * 7 - 110);
    expect(kpi(currentMissing, "views")?.change).toBeNull();
    expect(kpi(currentMissing, "views")?.note).toContain("対象期間に欠測");
  });

  it("長尺CSVの一部動画だけ日次行が欠けた場合もM1の前期比を保留する", async () => {
    const owner = await newOwner();
    await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId, csv: true });
    await env.DB.prepare(
      "DELETE FROM video_daily_metrics WHERE tenant_id = ?1 AND video_id = ?2 AND date = ?3",
    )
      .bind(owner.tenantId, videoId(owner.tenantId, 1), addDays(yesterday(), -7))
      .run();
    const { body } = await get("/api/dashboard?period=7d", owner.cookie);
    expect(kpi(body, "retention_m1")?.change).toBeNull();
    expect(kpi(body, "retention_m1")?.note).toContain("前期に欠測");
  });

  it("固定期間の末日をテナントの最新チャンネル日次に合わせ、動画選択でも維持する", async () => {
    const owner = await newOwner();
    const other = await newOwner("other");
    const { channelId } = await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId });
    await seedDashboard({ tenantId: other.tenantId, userId: other.userId });
    await env.DB.prepare(
      "DELETE FROM daily_metrics WHERE tenant_id = ?1 AND channel_id = ?2 AND date = ?3",
    )
      .bind(owner.tenantId, channelId, yesterday())
      .run();

    const { body: channel } = await get("/api/dashboard?period=7d", owner.cookie);
    const { body: selected } = await get(
      `/api/dashboard?period=7d&scope=videos&video_ids=${videoId(owner.tenantId, 0)}`,
      owner.cookie,
    );
    const { body: otherChannel } = await get("/api/dashboard?period=7d", other.cookie);
    expect(channel.period.to).toBe(addDays(yesterday(), -1));
    expect(channel.period.from).toBe(addDays(channel.period.to, -6));
    expect(channel.period.previousTo).toBe(addDays(channel.period.from, -1));
    expect(selected.period).toEqual(channel.period);
    expect(otherChannel.period.to).toBe(yesterday());

    const custom = (
      await get(`/api/dashboard?period=custom&from=${yesterday()}&to=${yesterday()}`, owner.cookie)
    ).body;
    expect(custom.period.to).toBe(yesterday());
  });

  it("末日は all 系列で視聴回数が NULL でない最新日（0 は数える）で、KPI は all 系列だけを合計する", async () => {
    const owner = await newOwner();
    const { channelId } = await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId });
    const zeroDay = addDays(yesterday(), -1);
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE daily_metrics SET views = NULL WHERE tenant_id = ?1 AND channel_id = ?2 AND date = ?3",
      ).bind(owner.tenantId, channelId, yesterday()),
      env.DB.prepare(
        "UPDATE daily_metrics SET views = 0 WHERE tenant_id = ?1 AND channel_id = ?2 AND date = ?3",
      ).bind(owner.tenantId, channelId, zeroDay),
      // 形式別の行が加わっても、末日の判定と KPI に混ぜない
      ...[yesterday(), zeroDay].map((date) =>
        env.DB.prepare(
          `INSERT INTO daily_metrics (tenant_id, channel_id, date, content_type, views, estimated_minutes_watched, subscribers_gained, subscribers_lost, fetched_at)
           VALUES (?1, ?2, ?3, 'shorts', 999, 999, 50, 0, ?4)`,
        ).bind(owner.tenantId, channelId, date, new Date().toISOString()),
      ),
    ]);

    const { body } = await get("/api/dashboard?period=7d", owner.cookie);
    expect(body.period.to).toBe(zeroDay);
    expect(kpi(body, "views")?.value).toBe(785 * 6 + 0);
    expect(kpi(body, "subscribers_net")?.value).toBe(2 * 7);
  });

  it("構成比の分母はチャンネル全体の動画で、上位5本＋その他・切り口・形式・新旧を返す", async () => {
    const owner = await newOwner();
    await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId });
    const { body } = await get(
      `/api/dashboard?video_ids=${videoId(owner.tenantId, 11)}`,
      owner.cookie,
    );
    const c = body.composition;
    expect(c.totalViews).toBe(780 * 28);
    expect(c.byVideo).toHaveLength(6);
    expect(c.byVideo[5]?.label).toBe("その他");
    const shareSum = c.byVideo.reduce((s, x) => s + x.share, 0);
    expect(shareSum).toBeCloseTo(1, 6);
    expect(c.byAngle.map((x) => x.label)).toContain("未分類");
    expect(c.byFormat.map((x) => x.label).sort()).toEqual(["Shorts", "長尺"].sort());
    expect(c.byNewness.reduce((s, x) => s + x.views, 0)).toBe(780 * 28);
    expect(c.top3Share).toBeCloseTo((120 + 110 + 100) / 780, 6);
  });

  it("scope=videos は選んだ動画の合計になり、登録者の増減は出さない", async () => {
    const owner = await newOwner();
    await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId });
    const { body } = await get("/api/dashboard?scope=videos", owner.cookie);
    // 既定10本 = (12+11+…+3)×10 = 750/日
    expect(kpi(body, "views")?.value).toBe(750 * 28);
    expect(kpi(body, "subscribers_net")?.value).toBeNull();
    expect(kpi(body, "subscribers_net")?.note).not.toBeNull();
    expect(body.trend.perVideo).toHaveLength(10);
    expect(body.trend.perVideo[0]?.values.every((v) => v === 120)).toBe(true);
  });

  it("video_ids は上限なしで受け付け、他テナント・存在しない ID は黙って除外する", async () => {
    const owner = await newOwner();
    const other = await newOwner("other");
    await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId });
    await seedDashboard({ tenantId: other.tenantId, userId: other.userId, videos: 2, days: 3 });
    const mine = Array.from({ length: 12 }, (_, i) => videoId(owner.tenantId, i));
    const ids = [...mine, videoId(other.tenantId, 0), "not-exists", mine[0]].join(",");
    const { body } = await get(`/api/dashboard?scope=videos&video_ids=${ids}`, owner.cookie);
    expect(body.selection.isDefault).toBe(false);
    expect(body.selection.videoIds).toEqual(mine);
    expect(kpi(body, "views")?.value).toBe(780 * 28);
    expect(JSON.stringify(body)).not.toContain(videoId(other.tenantId, 0));
  });

  it("video_ids を101本以上選んでも 200（json_each の単一バインドで D1 の100パラメータ上限に当たらない）", async () => {
    const owner = await newOwner();
    await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId, videos: 105, days: 1 });
    const mine = Array.from({ length: 105 }, (_, i) => videoId(owner.tenantId, i));
    const { body } = await get(
      `/api/dashboard?scope=videos&video_ids=${mine.join(",")}`,
      owner.cookie,
    );
    expect(body.selection.videoIds).toHaveLength(105);
    expect(body.trend.perVideo).toHaveLength(105);
  });

  it("期間 7d/90d/1y/custom を解決し、前期は直前の同じ日数になる", async () => {
    const owner = await newOwner();
    for (const [p, days] of [
      ["7d", 7],
      ["90d", 90],
      ["1y", 365],
    ] as const) {
      const { body } = await get(`/api/dashboard?period=${p}`, owner.cookie);
      expect(body.period.days).toBe(days);
      expect(body.trend.dates).toHaveLength(days);
    }
    const { body } = await get(
      "/api/dashboard?period=custom&from=2026-01-01&to=2026-01-10",
      owner.cookie,
    );
    expect(body.period).toMatchObject({
      key: "custom",
      from: "2026-01-01",
      to: "2026-01-10",
      days: 10,
      previousFrom: "2025-12-22",
      previousTo: "2025-12-31",
    });
  });

  it.each([
    ["period=3d", "未知の期間"],
    ["period=custom&from=2026-01-10", "to が無い"],
    ["period=custom&from=2026-01-10&to=2026-01-01", "from > to"],
    ["period=custom&from=2025-01-01&to=2026-01-02", "366日以上"],
    ["period=custom&from=2026-02-30&to=2026-03-01", "存在しない日付"],
    ["scope=all", "未知の scope"],
    ["video_ids=abc,<script>", "不正な動画ID"],
  ])("%s（%s）は 400", async (query) => {
    const owner = await newOwner();
    await expectError(
      await call(`/api/dashboard?${query}`, { cookie: owner.cookie }),
      400,
      "VALIDATION_FAILED",
    );
  });

  it("チャンネル未連携なら notLinked の空状態を返す", async () => {
    const owner = await newOwner();
    const { body } = await get("/api/dashboard", owner.cookie);
    expect(body.channel).toBeNull();
    expect(body.empty.notLinked).toBe(true);
    expect(body.videos).toEqual([]);
    expect(body.kpis.every((k) => k.value === null)).toBe(true);
  });

  it("CSV 未取込なら M1 は null で noCsv を立てる", async () => {
    const owner = await newOwner();
    await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId, days: 5 });
    const { body } = await get("/api/dashboard", owner.cookie);
    expect(kpi(body, "retention_m1")?.value).toBeNull();
    expect(body.empty.noCsv).toBe(true);
  });

  it("Shorts の CSV だけでは M1 を計算せず、対象の長尺データがあるときだけ空状態を解除する", async () => {
    const owner = await newOwner();
    await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId, csv: true, days: 5 });
    const shortId = videoId(owner.tenantId, 0);
    const longId = videoId(owner.tenantId, 1);

    const shortOnly = (await get(`/api/dashboard?scope=videos&video_ids=${shortId}`, owner.cookie))
      .body;
    expect(kpi(shortOnly, "views")?.value).toBeGreaterThan(0);
    expect(kpi(shortOnly, "retention_m1")?.value).toBeNull();
    expect(shortOnly.videos[0]?.retention).toBeNull();
    expect(shortOnly.empty.noCsv).toBe(true);

    const longOnly = (await get(`/api/dashboard?scope=videos&video_ids=${longId}`, owner.cookie))
      .body;
    expect(kpi(longOnly, "retention_m1")?.value).toBe(30);
    expect(longOnly.empty.noCsv).toBe(false);

    await env.DB.prepare(
      `UPDATE video_daily_metrics SET average_view_percentage = NULL
        WHERE tenant_id = ?1 AND video_id IN (
          SELECT video_id FROM videos WHERE tenant_id = ?1 AND content_type = 'long'
        )`,
    )
      .bind(owner.tenantId)
      .run();
    const channelWithOnlyShortsCsv = (await get("/api/dashboard", owner.cookie)).body;
    expect(kpi(channelWithOnlyShortsCsv, "retention_m1")?.value).toBeNull();
    expect(channelWithOnlyShortsCsv.empty.noCsv).toBe(true);
  });

  it("アーカイブを除いた最新のレポート版（発見3件）と実施中・効果測定中のアクションだけを返す", async () => {
    const owner = await newOwner();
    await seedDashboard({
      tenantId: owner.tenantId,
      userId: owner.userId,
      days: 3,
      report: true,
      actions: true,
    });
    const { body } = await get("/api/dashboard", owner.cookie);
    expect(body.latestReport?.title).toBe("最新レポート");
    expect(body.latestReport?.findings).toEqual(["発見1", "発見2", "発見3"]);
    expect(body.actions.map((a) => a.status).sort()).toEqual(["効果測定中", "実施中"].sort());
    expect(body.actions.find((a) => a.actionId === "a1")).toMatchObject({
      metricLabel: "クリック率",
      unit: "%",
      baselineValue: 4,
      latestValue: 5.5,
    });
    expect(body.empty.noReports).toBe(false);
    expect(body.empty.noActions).toBe(false);
  });

  it("viewer は閲覧でき canEdit=false、editor は canEdit=true", async () => {
    const owner = await newOwner();
    await seedDashboard({ tenantId: owner.tenantId, userId: owner.userId, days: 3 });
    const viewer = await addMember(owner, "viewer");
    const editor = await addMember(owner, "editor");
    expect((await get("/api/dashboard", viewer.cookie)).body.canEdit).toBe(false);
    expect((await get("/api/dashboard", editor.cookie)).body.canEdit).toBe(true);
  });

  it("未ログインは 401", async () => {
    await expectError(await call("/api/dashboard"), 401, "UNAUTHENTICATED");
  });
});
