// 受入 5・9: Claude Code 連携トークン（名前必須・6本目は 409・平文は発行時1回だけ・監査ログ）
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../src/lib/crypto";
import { addMember, call, count, expectError, newOwner } from "../platform/helpers";
import { auditCount } from "./helpers";

type Issued = { tokenId: string; name: string; token: string; createdAt: string };

const issue = (cookie: string, name: unknown) =>
  call("/api/skill-tokens", { method: "POST", cookie, body: { name } });

describe("トークンの発行", () => {
  it("名前付きで発行すると平文は1回だけ返り、DB にはハッシュだけが残る", async () => {
    const owner = await newOwner("tok-issue");
    const res = await issue(owner.cookie, "  自宅PC  ");
    expect(res.status).toBe(201);
    const body = (await res.json()) as Issued;
    expect(body.name).toBe("自宅PC");
    expect(body.token).toMatch(/^yta_[A-Za-z0-9_-]{20,}$/);

    const row = await env.DB.prepare(
      "SELECT token_hash, name FROM skill_tokens WHERE token_id = ?1",
    )
      .bind(body.tokenId)
      .first<{ token_hash: string; name: string }>();
    expect(row?.token_hash).toBe(await sha256Hex(body.token));
    expect(row?.name).toBe("自宅PC");

    // 一覧には平文もハッシュも出ない
    const list = await call("/api/skill-tokens", { cookie: owner.cookie });
    const text = await list.text();
    expect(text).toContain("自宅PC");
    expect(text).not.toContain(body.token);
    expect(text).not.toContain(row?.token_hash ?? "x");
    expect(await auditCount(owner.tenantId, "token.issue")).toBe(1);
  });

  it("名前が空・41文字以上・文字列以外は 400", async () => {
    const owner = await newOwner("tok-name");
    for (const name of ["", "   ", "あ".repeat(41), 123, null]) {
      await expectError(await issue(owner.cookie, name), 400, "VALIDATION_FAILED");
    }
    expect((await issue(owner.cookie, "あ".repeat(40))).status).toBe(201);
  });

  it("1人5本まで。6本目は 409 TOKEN_LIMIT、失効すれば再び発行できる", async () => {
    const owner = await newOwner("tok-limit");
    const ids: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const res = await issue(owner.cookie, `端末${i}`);
      expect(res.status).toBe(201);
      ids.push(((await res.json()) as Issued).tokenId);
    }
    await expectError(await issue(owner.cookie, "端末6"), 409, "TOKEN_LIMIT");
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM skill_tokens WHERE tenant_id = ?1 AND revoked_at IS NULL",
        owner.tenantId,
      ),
    ).toBe(5);

    const del = await call(`/api/skill-tokens/${ids[0]}`, {
      method: "DELETE",
      cookie: owner.cookie,
    });
    expect(del.status).toBe(204);
    expect((await issue(owner.cookie, "端末6")).status).toBe(201);
  });

  it("editor は発行でき、viewer は発行できない（403）", async () => {
    const owner = await newOwner("tok-role");
    const editor = await addMember(owner, "editor");
    const viewer = await addMember(owner, "viewer");
    expect((await issue(editor.cookie, "編集者PC")).status).toBe(201);
    await expectError(await issue(viewer.cookie, "閲覧者PC"), 403, "FORBIDDEN");
  });
});

describe("トークンの失効", () => {
  it("自分のトークンは失効でき、一覧から消えて監査ログが1件残る", async () => {
    const owner = await newOwner("tok-revoke");
    const { tokenId } = (await (await issue(owner.cookie, "消す")).json()) as Issued;
    const res = await call(`/api/skill-tokens/${tokenId}`, {
      method: "DELETE",
      cookie: owner.cookie,
    });
    expect(res.status).toBe(204);
    const list = (await (await call("/api/skill-tokens", { cookie: owner.cookie })).json()) as {
      tokens: unknown[];
    };
    expect(list.tokens).toEqual([]);
    expect(await auditCount(owner.tenantId, "token.revoke")).toBe(1);
  });

  it("他人のトークン・存在しない ID・二重失効は 404", async () => {
    const owner = await newOwner("tok-other");
    const editor = await addMember(owner, "editor");
    const { tokenId } = (await (await issue(editor.cookie, "編集者の")).json()) as Issued;
    await expectError(
      await call(`/api/skill-tokens/${tokenId}`, { method: "DELETE", cookie: owner.cookie }),
      404,
      "NOT_FOUND",
    );
    await expectError(
      await call("/api/skill-tokens/missing-token-id", { method: "DELETE", cookie: owner.cookie }),
      404,
      "NOT_FOUND",
    );
    expect(
      (await call(`/api/skill-tokens/${tokenId}`, { method: "DELETE", cookie: editor.cookie }))
        .status,
    ).toBe(204);
    await expectError(
      await call(`/api/skill-tokens/${tokenId}`, { method: "DELETE", cookie: editor.cookie }),
      404,
      "NOT_FOUND",
    );
  });

  it("一覧は自分の分だけ", async () => {
    const owner = await newOwner("tok-mine");
    const editor = await addMember(owner, "editor");
    await issue(owner.cookie, "オーナーの");
    await issue(editor.cookie, "編集者の");
    const list = (await (await call("/api/skill-tokens", { cookie: editor.cookie })).json()) as {
      tokens: { name: string }[];
    };
    expect(list.tokens.map((t) => t.name)).toEqual(["編集者の"]);
  });
});
