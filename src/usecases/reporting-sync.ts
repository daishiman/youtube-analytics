import {
  downloadReportingCsv,
  ensureReportingJobs,
  listJobReportsPage,
  type ReportingJob,
  ReportingPermissionError,
  type ReportingReport,
  ReportingStaleConnectionError,
} from "../adapters/google-reporting-jobs";
import {
  GoogleRefreshTokenRevokedError,
  refreshYoutubeAccessToken,
} from "../adapters/google-youtube";
import type { ReportingCursor } from "../domain/queue-messages";
import { DAY_MS } from "../domain/time";
import type { Bindings, CollectMessage, ReportingMessage } from "../env";
import { decryptText } from "../lib/crypto";
import { type ReportingIdentity, ReportingRepository } from "../repositories/reporting-repository";
import { tenantOAuthClient } from "./google-client";
import { normalizeStoredReachReport } from "./reporting-normalize";
import { settingsRepo } from "./settings-common";

const MAX_HEADER_BYTES = 64 * 1024;
const PART_BYTES = 16 * 1024 * 1024;
/**
 * 1通で重い処理（ダウンロード・保存、または保存済み原本の正規化やり直し）をする上限。保存済みを読み飛ばすだけの
 * レポートは D1 1件なので数えない。1件 = ダウンロード fetch 1（外部 subrequest）と D1・R2 約10件。CPU（Free 10ms）は
 * CSV の逐次計測が件数に比例するため数件に抑える。jobs.reports.list の pageSize は残りの枠にする
 */
export const REPORTS_PER_MESSAGE = 5;
/**
 * 1通で jobs.reports.list を呼ぶ上限。新しいレポートがないジョブは空ページで安いので、1通の中で次のジョブへ進む。
 * 外部 subrequest（Free 50）は トークン更新1・種類/ジョブ一覧 約4・一覧10・ダウンロード5 で約20件。
 * D1 はジョブごとに 世代確認1・saveJob 1・取得位置1・一覧前の世代確認1 で、10ジョブでも約40件（上限1,000）
 */
export const REPORT_LISTS_PER_MESSAGE = 10;
/**
 * createdAfter は指定時刻「より後」だけを返す。同じ create_time の別レポートと前日の途中失敗を拾い直すため、
 * 保存済みの最新から1日戻す。取りこぼしより重複を許し、重複は existing() と D1 CAS で読み飛ばす（再ダウンロードしない）
 */
export const REPORTING_CURSOR_LOOKBACK_MS = DAY_MS;

export interface ReportingSyncResult {
  status: "synced" | "stale" | "permission_required";
  jobs: number;
  stored: number;
  remaining: boolean;
  nextMessage?: ReportingMessage;
  /** refresh token 自体が Google に失効と判定された場合のみ、全チャンネル削除の契機にする。 */
  authorizationRevoked?: boolean;
}

/** 生 CSV を変換せず、ヘッダーと論理行数だけ逐次計測する。引用符内の改行も扱う。 */
export class CsvRecordCounter {
  private headerBytes: number[] = [];
  private headerComplete = false;
  private quoted = false;
  private afterHeaderContent = false;
  private rows = 0;
  private bytes = 0;

  push(chunk: Uint8Array): void {
    this.bytes += chunk.byteLength;
    for (const byte of chunk) {
      if (!this.headerComplete && this.headerBytes.length >= MAX_HEADER_BYTES) {
        throw new Error("Reporting CSV header too large");
      }
      if (byte === 34) this.quoted = !this.quoted;
      if (!this.headerComplete) {
        if (byte === 10 && !this.quoted) {
          this.headerComplete = true;
        } else {
          this.headerBytes.push(byte);
        }
      } else if (byte === 10 && !this.quoted) {
        if (this.afterHeaderContent) this.rows += 1;
        this.afterHeaderContent = false;
      } else if (byte !== 13) {
        this.afterHeaderContent = true;
      }
    }
  }

  finish(): { header: string[]; rowCount: number; byteCount: number } {
    if (this.quoted) throw new Error("Reporting CSV has unterminated quoted field");
    if (this.afterHeaderContent) this.rows += 1;
    const rawHeader = new TextDecoder("utf-8", { fatal: true })
      .decode(new Uint8Array(this.headerBytes))
      .replace(/^\uFEFF/, "")
      .replace(/\r$/, "");
    if (!rawHeader) throw new Error("Reporting CSV header missing");
    const header: string[] = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < rawHeader.length; i += 1) {
      const char = rawHeader[i];
      if (char === '"') {
        if (quoted && rawHeader[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = !quoted;
      } else if (char === "," && !quoted) {
        header.push(field);
        field = "";
      } else field += char;
    }
    if (quoted) throw new Error("Reporting CSV header malformed");
    header.push(field);
    return { header, rowCount: this.rows, byteCount: this.bytes };
  }
}

/** Workers R2.put は長さ不明の stream を受けないため、最大16MBだけ保持して multipart に送る。 */
async function saveRawCsv(
  media: R2Bucket,
  key: string,
  body: ReadableStream<Uint8Array>,
  counter: CsvRecordCounter,
): Promise<void> {
  const reader = body.getReader();
  let parts: Uint8Array[] = [];
  let buffered = 0;
  let multipart: R2MultipartUpload | null = null;
  const uploaded: R2UploadedPart[] = [];
  const merge = () => {
    const data = new Uint8Array(buffered);
    let offset = 0;
    for (const part of parts) {
      data.set(part, offset);
      offset += part.byteLength;
    }
    parts = [];
    buffered = 0;
    return data;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      counter.push(value);
      let offset = 0;
      while (offset < value.byteLength) {
        const length = Math.min(PART_BYTES - buffered, value.byteLength - offset);
        parts.push(value.subarray(offset, offset + length));
        buffered += length;
        offset += length;
        if (buffered === PART_BYTES) {
          multipart ??= await media.createMultipartUpload(key, {
            httpMetadata: { contentType: "text/csv; charset=utf-8" },
          });
          uploaded.push(await multipart.uploadPart(uploaded.length + 1, merge()));
        }
      }
    }
    if (multipart) {
      if (buffered > 0) uploaded.push(await multipart.uploadPart(uploaded.length + 1, merge()));
      await multipart.complete(uploaded);
    } else {
      await media.put(key, merge(), { httpMetadata: { contentType: "text/csv; charset=utf-8" } });
    }
  } catch (error) {
    if (multipart) {
      try {
        await multipart.abort();
      } catch (abortError) {
        console.error("reporting multipart abort failed", abortError);
      }
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}

async function storeReport(
  env: Bindings,
  repository: ReportingRepository,
  message: ReportingIdentity,
  generation: number,
  job: ReportingJob,
  report: ReportingReport,
  accessToken: string,
  now: string,
): Promise<"stored" | "skipped" | "existing" | "stale"> {
  const previous = await repository.existing(message, job.reportTypeId, report);
  if (previous && previous.createTime >= report.createTime) {
    if (previous.reportId === report.id && previous.normalizedAt === null) {
      const result = await normalizeStoredReachReport({
        env,
        repository,
        message,
        generation,
        report,
        reportTypeId: job.reportTypeId,
        r2Key: previous.r2Key,
        now,
      });
      if (result === "stale") return "stale";
      return "skipped";
    }
    return "existing";
  }
  if (!(await repository.isCurrent(message, generation))) return "stale";
  const response = await downloadReportingCsv(accessToken, report.downloadUrl);
  if (!response.body) throw new Error("Reporting CSV body missing");
  const uploadId = crypto.randomUUID();
  const key = `tenants/${message.tenantId}/generations/g${generation}/reporting/${encodeURIComponent(job.reportTypeId)}/${uploadId}.csv`;
  if (!(await repository.beginUpload(message, generation, uploadId, key, now))) return "stale";
  let stored = false;
  try {
    // 並行する更新版がこの原本を直後に置換しても、キーの台帳が残る。
    await repository.trackOrphan(message.tenantId, key, now);
    const counter = new CsvRecordCounter();
    await saveRawCsv(env.MEDIA, key, response.body, counter);
    const { header, rowCount, byteCount } = counter.finish();
    if (!(await repository.isCurrent(message, generation))) return "stale";
    if (previous && previous.r2Key !== key) {
      await repository.trackOrphan(message.tenantId, previous.r2Key, now);
    }
    stored = await repository.saveReport({
      message,
      generation,
      reportTypeId: job.reportTypeId,
      report,
      header,
      rowCount,
      byteCount,
      r2Key: key,
      now,
    });
    if (!stored) return "skipped";
    const normalized = await normalizeStoredReachReport({
      env,
      repository,
      message,
      generation,
      report,
      reportTypeId: job.reportTypeId,
      r2Key: key,
      now,
    });
    if (normalized === "stale") return "stale";
    if (previous && previous.r2Key !== key) {
      try {
        await env.MEDIA.delete(previous.r2Key);
        await repository.forgetOrphan(message.tenantId, previous.r2Key);
      } catch (error) {
        // 台帳を残し cleanup Queue で再試行する。
        console.error("reporting old raw cleanup failed", error);
      }
    }
    return "stored";
  } finally {
    let compensated = true;
    if (!stored) {
      try {
        await env.MEDIA.delete(key);
      } catch (error) {
        // 台帳は残して削除ジョブから見えるようにする。
        console.error("reporting raw compensation failed", error);
        compensated = false;
      }
    }
    if (!stored && compensated) await repository.forgetOrphan(message.tenantId, key);
    if (stored || compensated) await repository.finishUpload(message, uploadId);
  }
}

/** ジョブの種類で保存済みの最新 create_time から取得位置を決める。D1 はジョブの最初の通で1度だけ読む */
async function jobCursor(
  repository: ReportingRepository,
  message: ReportingIdentity,
  job: ReportingJob,
): Promise<ReportingCursor> {
  const latest = await repository.latestCreateTime(message, job.reportTypeId);
  return {
    jobId: job.id,
    createdAfter:
      latest === null
        ? null
        : new Date(Date.parse(latest) - REPORTING_CURSOR_LOOKBACK_MS).toISOString(),
  };
}

/**
 * 同期間の更新版は createTime の新しいものだけを残し、古い順に並べる。
 * ページの途中で失敗しても保存済みより古い未保存が残らないため、翌日の取得位置で飛ばさない。
 * ページをまたぐ場合は、保存したページの続きを通に載せた取得位置で運ぶ（runReportingSync）
 */
function newestPerPeriodAscending(reports: ReportingReport[]): ReportingReport[] {
  const byPeriod = new Map<string, ReportingReport>();
  for (const report of reports) {
    const key = `${report.startTime}/${report.endTime}`;
    const previous = byPeriod.get(key);
    if (!previous || previous.createTime.localeCompare(report.createTime) < 0) {
      byPeriod.set(key, report);
    }
  }
  return [...byPeriod.values()].sort((a, b) => a.createTime.localeCompare(b.createTime));
}

/** 連携世代を Google 通信と保存の前に検査する。公式 reach basic のみ動画日次へ正規化する。 */
export async function syncTenantReporting(
  env: Bindings,
  message: CollectMessage | ReportingMessage,
  now: Date,
): Promise<ReportingSyncResult> {
  const repository = new ReportingRepository(env.DB);
  const generation = await repository.generation(message);
  if (generation === null) return { status: "stale", jobs: 0, stored: 0, remaining: false };
  const current = () => repository.isCurrent(message, generation);
  const ctx = { tenantId: message.tenantId };
  const enc = await settingsRepo({ env, now }, ctx).getRefreshTokenEnc();
  if (!enc || !(await current())) return { status: "stale", jobs: 0, stored: 0, remaining: false };
  const client = await tenantOAuthClient({ env, now }, ctx);
  const refreshToken = await decryptText(env.TOKEN_ENC_KEY, enc);
  if (!(await current())) return { status: "stale", jobs: 0, stored: 0, remaining: false };
  let accessToken: string;
  try {
    accessToken = await refreshYoutubeAccessToken({ ...client, refreshToken });
  } catch (error) {
    if (error instanceof GoogleRefreshTokenRevokedError) {
      if (!(await repository.recordAuthorization(message, generation, now.toISOString(), true))) {
        return { status: "stale", jobs: 0, stored: 0, remaining: false };
      }
      return {
        status: "permission_required",
        jobs: 0,
        stored: 0,
        remaining: false,
        authorizationRevoked: true,
      };
    }
    throw error;
  }
  try {
    const { jobs, pendingCreations } = await ensureReportingJobs(accessToken, current);
    if (!(await repository.recordAuthorization(message, generation, now.toISOString(), false))) {
      return { status: "stale", jobs: 0, stored: 0, remaining: false };
    }
    const nextMessage = (
      jobOffset: number,
      position: { reportPageToken?: string; reportCursor?: ReportingCursor } = {},
    ): ReportingMessage => ({
      kind: "reporting",
      tenantId: message.tenantId,
      channelId: message.channelId,
      connectedAt: message.connectedAt,
      tokenUpdatedAt: message.tokenUpdatedAt,
      ...(message.cycleStartedAt ? { cycleStartedAt: message.cycleStartedAt } : {}),
      jobOffset,
      ...(position.reportPageToken ? { reportPageToken: position.reportPageToken } : {}),
      ...(position.reportCursor ? { reportCursor: position.reportCursor } : {}),
    });
    // Job 作成は1通3件まで。全種類が揃ってから取得へ進み、並び順の変化で漏らさない。
    if (pendingCreations) {
      return {
        status: "synced",
        jobs: jobs.length,
        stored: 0,
        remaining: true,
        nextMessage: nextMessage(0),
      };
    }
    const offset = message.kind === "reporting" ? (message.jobOffset ?? 0) : 0;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset >= jobs.length) {
      return { status: "synced", jobs: jobs.length, stored: 0, remaining: false };
    }
    let jobIndex = offset;
    let token = message.kind === "reporting" ? message.reportPageToken : undefined;
    const carried = message.kind === "reporting" ? message.reportCursor : undefined;
    const firstJob = jobs[jobIndex];
    if (!firstJob) return { status: "synced", jobs: jobs.length, stored: 0, remaining: false };
    // 通の最初のジョブは通に載った取得位置を使う（続きページと再試行で同じ値）。載っていない続きページ
    // （旧形式の通）は位置なしで続ける。1通の中で進んだ先のジョブは、最初のページを読む直前に D1 から決める
    let cursor: ReportingCursor =
      carried?.jobId === firstJob.id
        ? carried
        : token
          ? { jobId: firstJob.id, createdAfter: null }
          : await jobCursor(repository, message, firstJob);
    let stored = 0;
    let lists = 0;
    let heavy = 0;
    const exhausted = () => lists >= REPORT_LISTS_PER_MESSAGE || heavy >= REPORTS_PER_MESSAGE;
    let startingJob = true;
    while (true) {
      const job = jobs[jobIndex];
      if (!job) return { status: "synced", jobs: jobs.length, stored, remaining: false };
      if (startingJob) {
        if (!(await current())) {
          return { status: "stale", jobs: jobs.length, stored, remaining: false };
        }
        if (!(await repository.saveJob(message, generation, job, now.toISOString()))) {
          return { status: "stale", jobs: jobs.length, stored, remaining: false };
        }
        startingJob = false;
      }
      // 残りの重い処理の枠だけ取る。サーバーが減らしても続きページで拾う
      const page = await listJobReportsPage(
        accessToken,
        job.id,
        {
          pageSize: REPORTS_PER_MESSAGE - heavy,
          pageToken: token,
          createdAfter: cursor.createdAfter,
        },
        current,
      );
      lists += 1;
      if (page.nextPageToken && page.nextPageToken === token) {
        throw new Error("Reporting report pagination repeated token");
      }
      for (const report of page.reports) {
        if (report.jobId !== job.id) throw new Error("Reporting report job mismatch");
      }
      // 異なるページの更新版は D1 CAS で統一する。
      let storedInPage = 0;
      for (const report of newestPerPeriodAscending(page.reports)) {
        const outcome = await storeReport(
          env,
          repository,
          message,
          generation,
          job,
          report,
          accessToken,
          now.toISOString(),
        );
        if (outcome === "stale") {
          return { status: "stale", jobs: jobs.length, stored, remaining: false };
        }
        if (outcome !== "existing") heavy += 1;
        if (outcome === "stored") {
          stored += 1;
          storedInPage += 1;
        }
      }
      if (page.nextPageToken) {
        token = page.nextPageToken;
        // 保存したページの続きは次の通へ回す。同じ通のまま次ページで失敗すると、再試行は進んだ
        // D1 から取得位置を作り直し、次ページに残った古い未保存を飛ばしてしまうため
        if (storedInPage > 0 || exhausted()) {
          const next = nextMessage(jobIndex, { reportPageToken: token, reportCursor: cursor });
          return {
            status: "synced",
            jobs: jobs.length,
            stored,
            remaining: true,
            nextMessage: next,
          };
        }
        continue;
      }
      const nextJob = jobs[jobIndex + 1];
      if (!nextJob) return { status: "synced", jobs: jobs.length, stored, remaining: false };
      jobIndex += 1;
      token = undefined;
      startingJob = true;
      cursor = await jobCursor(repository, message, nextJob);
      if (exhausted()) {
        const next = nextMessage(jobIndex, { reportCursor: cursor });
        return { status: "synced", jobs: jobs.length, stored, remaining: true, nextMessage: next };
      }
    }
  } catch (error) {
    if (error instanceof ReportingStaleConnectionError) {
      return { status: "stale", jobs: 0, stored: 0, remaining: false };
    }
    if (error instanceof ReportingPermissionError) {
      if (!(await repository.recordAuthorization(message, generation, now.toISOString(), true))) {
        return { status: "stale", jobs: 0, stored: 0, remaining: false };
      }
      return { status: "permission_required", jobs: 0, stored: 0, remaining: false };
    }
    throw error;
  }
}
