// テスト共通: チャンネル行の用意（連携手続きを通す版と、channels へ直接入れる版）
import { env } from "cloudflare:workers";
import { expect } from "vitest";
import { newOwner } from "../platform/helpers";
import { fakeGoogle, linkChannel } from "./google";

export const randomChannelId = () => `UC_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;

/**
 * 新しいオーナーを作り、Google の偽物を通して 1 チャンネルを連携する
 * （テナント・channels・channel_oauth_tokens の行ができる）。以降の fetch は偽物のまま
 */
export async function newLinkedOwner(prefix: string) {
  const owner = await newOwner(prefix);
  const channelId = randomChannelId();
  fakeGoogle({ channels: [{ id: channelId }] });
  expect((await linkChannel(owner, channelId)).status).toBe(201);
  return { owner, channelId };
}

export interface ChannelRow {
  tenantId: string;
  channelId: string;
  title: string;
  connectedBy: string;
  connectedAt: string;
  lastCollectedAt?: string | null;
}

/** channels へ 1 行入れる文。status は既定値と同じ '正常'。単発なら .run()、まとめるなら env.DB.batch へ */
export function insertChannel(row: ChannelRow): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO channels (tenant_id, channel_id, title, status, connected_by, connected_at, last_collected_at)
     VALUES (?1, ?2, ?3, '正常', ?4, ?5, ?6)`,
  ).bind(
    row.tenantId,
    row.channelId,
    row.title,
    row.connectedBy,
    row.connectedAt,
    row.lastCollectedAt ?? null,
  );
}
