// migration 0003 の制約・トークン暗号化・同意記録の削除（アカウント削除用）
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { PlatformRepository } from "../../src/repositories/platform-repository";
import { decryptToken, encryptToken } from "../../src/usecases/token-crypto";
import { count, newOwner } from "../platform/helpers";

describe("migration 0003", () => {
  it("youtube_link_status は none / partial / linked 以外を拒否し、既定は none", async () => {
    const owner = await newOwner();
    const row = await env.DB.prepare(
      "SELECT youtube_link_status AS s FROM tenants WHERE tenant_id = ?1",
    )
      .bind(owner.tenantId)
      .first<{ s: string }>();
    expect(row?.s).toBe("none");
    await expect(
      env.DB.prepare("UPDATE tenants SET youtube_link_status = 'broken' WHERE tenant_id = ?1")
        .bind(owner.tenantId)
        .run(),
    ).rejects.toThrow();
  });

  it("consent_records.source は login / reconsent 以外を拒否する", async () => {
    const owner = await newOwner();
    await expect(
      env.DB.prepare(
        `INSERT INTO consent_records (id, user_id, terms_version, privacy_version, consented_at, source)
         VALUES ('x-bad', ?1, 'v', 'v', '2026-09-24T00:00:00.000Z', 'other')`,
      )
        .bind(owner.userId)
        .run(),
    ).rejects.toThrow();
  });

  it("deleteConsentRecords はその利用者の同意記録だけを消す", async () => {
    const a = await newOwner();
    const b = await newOwner();
    const insert = (id: string, userId: string) =>
      env.DB.prepare(
        `INSERT INTO consent_records (id, user_id, terms_version, privacy_version, consented_at, source)
         VALUES (?1, ?2, 'v', 'v', '2026-09-24T00:00:00.000Z', 'login')`,
      )
        .bind(id, userId)
        .run();
    await insert(`${a.userId}-1`, a.userId);
    await insert(`${b.userId}-1`, b.userId);
    await new PlatformRepository(env.DB).deleteConsentRecords(a.userId);
    expect(
      await count("SELECT COUNT(*) AS n FROM consent_records WHERE user_id = ?1", a.userId),
    ).toBe(0);
    expect(
      await count("SELECT COUNT(*) AS n FROM consent_records WHERE user_id = ?1", b.userId),
    ).toBe(1);
  });
});

describe("refresh token の暗号化", () => {
  it("AES-GCM で往復でき、毎回違う暗号文になり、別の鍵では復号できない", async () => {
    const a = await encryptToken("key-one", "plain-token");
    const b = await encryptToken("key-one", "plain-token");
    expect(a).not.toBe(b);
    expect(a).not.toContain("plain-token");
    expect(await decryptToken("key-one", a)).toBe("plain-token");
    await expect(decryptToken("key-two", a)).rejects.toThrow();
  });
});
