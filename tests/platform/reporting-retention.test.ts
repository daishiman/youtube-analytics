import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportingRepository } from "../../src/repositories/reporting-repository";
import { purgeReportingRetention } from "../../src/usecases/reporting-retention";
import { newLinkedOwner } from "../helpers/channels";

afterEach(() => vi.restoreAllMocks());

const NOW = new Date("2026-09-25T03:00:00.000Z");

async function fixture() {
  const { owner, channelId } = await newLinkedOwner("reporting-retention");
  const repository = new ReportingRepository(env.DB);
  const message = await repository.currentMessage(owner.tenantId);
  if (!message) throw new Error("missing connection");
  const generation = await repository.generation(message);
  if (generation === null) throw new Error("missing generation");
  const key = `tenants/${owner.tenantId}/generations/g${generation}/reporting/raw.csv`;
  await env.MEDIA.put(key, "date,video_id\n2026-09-24,v1\n");
  await env.DB.prepare(
    `INSERT INTO reporting_raw_reports
      (tenant_id, channel_id, report_type_id, job_id, report_id, start_time, end_time,
       create_time, header_json, row_count, byte_count, r2_key, status, stored_at)
     VALUES (?1, ?2, 'channel_basic_a2', 'job-1', 'report-1',
       '2026-09-23T07:00:00Z', '2026-09-24T07:00:00Z', '2026-09-24T10:00:00Z',
       '["date","video_id"]', 1, 28, ?3, 'stored', ?4)`,
  )
    .bind(owner.tenantId, channelId, key, NOW.toISOString())
    .run();
  return { owner, channelId, message, generation, repository, key };
}

describe("Reporting 原本の認可保持と再試行可能な掃除", () => {
  it("現行連携で確認してから30日間だけ読ませ、期限切れはR2とD1を消す", async () => {
    const { owner, message, generation, repository, key } = await fixture();
    expect(
      await repository.recordAuthorization(message, generation, NOW.toISOString(), false),
    ).toBe(true);
    const day29 = new Date(NOW.getTime() + 29 * 86_400_000);
    const day30 = new Date(NOW.getTime() + 30 * 86_400_000);
    expect((await repository.listStoredReports(owner.tenantId, 0, day29)).reports).toHaveLength(1);
    expect(await repository.rawReportKey(owner.tenantId, "report-1", day29)).toBe(key);
    expect((await repository.listStoredReports(owner.tenantId, 0, day30)).reports).toHaveLength(0);
    expect(await repository.rawReportKey(owner.tenantId, "report-1", day30)).toBeNull();
    expect((await repository.summary(owner.tenantId, day30)).reports).toBe(0);

    const result = await purgeReportingRetention(env, day30);
    expect(result.rawDeleted).toBe(1);
    expect(result.remaining).toBe(false);
    expect(await env.MEDIA.get(key)).toBeNull();
    expect(
      await env.DB.prepare("SELECT 1 AS present FROM reporting_raw_reports WHERE tenant_id = ?1")
        .bind(owner.tenantId)
        .first(),
    ).toBeNull();
  });

  it("明確な失効は即時に遮断し、R2削除失敗時はD1行を残して次通で再試行する", async () => {
    const { owner, message, generation, repository, key } = await fixture();
    await repository.recordAuthorization(message, generation, NOW.toISOString(), false);
    await env.DB.prepare("UPDATE reporting_raw_reports SET normalized_at = ?2 WHERE tenant_id = ?1")
      .bind(owner.tenantId, NOW.toISOString())
      .run();
    await repository.recordAuthorization(message, generation, NOW.toISOString(), true);
    expect((await repository.listStoredReports(owner.tenantId, 0, NOW)).reports).toHaveLength(0);

    const brokenMedia = {
      ...env.MEDIA,
      delete: vi.fn().mockRejectedValueOnce(new Error("R2 unavailable")),
    } as unknown as R2Bucket;
    await expect(purgeReportingRetention({ DB: env.DB, MEDIA: brokenMedia }, NOW)).rejects.toThrow(
      "R2 unavailable",
    );
    expect(await env.MEDIA.get(key)).not.toBeNull();
    expect(
      await env.DB.prepare("SELECT normalized_at FROM reporting_raw_reports WHERE tenant_id = ?1")
        .bind(owner.tenantId)
        .first<{ normalized_at: string | null }>(),
    ).toEqual({ normalized_at: null });

    expect((await purgeReportingRetention(env, NOW)).rawDeleted).toBe(1);
    expect(await env.MEDIA.get(key)).toBeNull();
  });

  it("差替え旧キーは現行参照中に保護し、参照が外れてから回収する", async () => {
    const { owner, message, generation, repository, key } = await fixture();
    await repository.recordAuthorization(message, generation, NOW.toISOString(), false);
    await repository.trackOrphan(owner.tenantId, key, NOW.toISOString());
    expect((await purgeReportingRetention(env, NOW)).orphansDeleted).toBe(0);
    expect(await env.MEDIA.get(key)).not.toBeNull();

    const newKey = key.replace("raw.csv", "replacement.csv");
    await env.MEDIA.put(newKey, "replacement");
    await env.DB.prepare("UPDATE reporting_raw_reports SET r2_key = ?2 WHERE tenant_id = ?1")
      .bind(owner.tenantId, newKey)
      .run();
    expect((await purgeReportingRetention(env, NOW)).orphansDeleted).toBe(1);
    expect(await env.MEDIA.get(key)).toBeNull();
    expect(await env.MEDIA.get(newKey)).not.toBeNull();
  });

  it("中断後の古いアップロード台帳と孤立R2キーを回収する", async () => {
    const { owner, key } = await fixture();
    const uploadKey = key.replace("raw.csv", "uncommitted.csv");
    const old = new Date(NOW.getTime() - 3 * 60 * 60 * 1000).toISOString();
    await env.MEDIA.put(uploadKey, "partial");
    await env.DB.prepare(
      "INSERT INTO import_uploads (tenant_id, import_id, r2_key, started_at) VALUES (?1, ?2, ?3, ?4)",
    )
      .bind(owner.tenantId, crypto.randomUUID(), uploadKey, old)
      .run();
    const result = await purgeReportingRetention(env, NOW);
    expect(result.uploadsCleared).toBe(1);
    expect(await env.MEDIA.get(uploadKey)).toBeNull();
  });
});
