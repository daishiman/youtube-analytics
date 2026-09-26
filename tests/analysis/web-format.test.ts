// AI分析画面の小さな純関数（結果JSONの事前検査・期間の解決）。画面を開かずに境界値を確かめる
import { describe, expect, it } from "vitest";
import { addDays } from "../../src/domain/period";
import { formatDateTime } from "../../web/components/AppShell";
import { checkJson, errorLine, plain } from "../../web/pages/analysis/format";
import { formatDay, periodError, resolvePeriod } from "../../web/period";

describe("checkJson（取込前の構文検査）", () => {
  it("正しいオブジェクトは値を返す", () => {
    const r = checkJson('{"version": 1}');
    expect(r).toEqual({ ok: true, value: { version: 1 } });
  });

  it("空欄は行番号なしで止める", () => {
    const r = checkJson("  \n ");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("JSONが入力されていません");
  });

  it("配列や数値は 1行目としてオブジェクト形式を求める", () => {
    for (const text of ["[1,2]", "3", "null"]) {
      const r = checkJson(text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toBe("JSONの形式が正しくありません 1行目");
    }
  });

  it("値の抜けは、実行環境の例外文に位置が無くても壊れた行を示す", () => {
    const r = checkJson('{\n  "version": 1,\n  "title": \n}');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.line).toBe(4);
      expect(r.message).toBe("JSONの形式が正しくありません 4行目");
      expect(r.hint).toContain("カンマ");
    }
  });

  it("途中で切れた JSON は最終行を示す", () => {
    const r = checkJson('{\n  "version": 1,\n  "title": "a"');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.line).toBe(3);
  });
});

describe("errorLine（例外文の書式ごと）", () => {
  const text = '{\n"a": 1,\n"b" 2\n}';
  it("line N column M を読む", () => {
    expect(errorLine(text, "Expected ':' at line 3 column 5")).toBe(3);
  });
  it("position N を行へ換算する", () => {
    expect(errorLine(text, "Unexpected number in JSON at position 14")).toBe(3);
  });
  it("位置の無い例外文は先頭から壊れる位置を探す", () => {
    expect(errorLine(text, "Unexpected number")).toBe(3);
  });
  it("壊れていなければ null", () => {
    expect(errorLine('{"a":1}', "whatever")).toBeNull();
  });
});

describe("表示の整形", () => {
  it("ISO 日時を JST の分まで（全画面で AppShell の表記にそろえる）", () => {
    expect(formatDateTime("2026-08-14T01:30:00Z")).toBe("2026年8月14日 10:30");
    expect(formatDateTime(null)).toBe("—");
  });
  it("自由形式の値を1行に", () => {
    expect(plain({ stage: "流入", gap: -0.0123, list: [1, 2] })).toBe(
      "stage: 流入 / gap: -0.012 / list: 1、2",
    );
    expect(plain([])).toBe("—");
  });
});

describe("期間（ヘッダーと AI分析で共有）", () => {
  const today = "2026-09-25";

  it("既定は最新28日で、終わりは昨日", () => {
    const p = resolvePeriod(new URLSearchParams(), today);
    expect(p).toEqual({ key: "28d", start: "2026-08-28", end: "2026-09-24", error: null });
  });

  it("未知の period は 28日へ戻す", () => {
    expect(resolvePeriod(new URLSearchParams("period=7d"), today).key).toBe("28d");
  });

  it("最新90日・1年", () => {
    expect(resolvePeriod(new URLSearchParams("period=90d"), today).start).toBe("2026-06-27");
    expect(resolvePeriod(new URLSearchParams("period=1y"), today).start).toBe("2025-09-25");
  });

  it("任意期間は from/to をそのまま使う", () => {
    const p = resolvePeriod(
      new URLSearchParams("period=custom&from=2026-08-01&to=2026-08-28"),
      today,
    );
    expect(p).toMatchObject({ key: "custom", start: "2026-08-01", end: "2026-08-28", error: null });
  });

  it("不正な任意期間は理由を持ち、範囲は最新28日に戻す", () => {
    const p = resolvePeriod(
      new URLSearchParams("period=custom&from=2026-09-01&to=2026-08-01"),
      today,
    );
    expect(p.error).toBe("開始日は終了日より前にしてください");
    expect(p.start).toBe("2026-08-28");
  });

  it("境界: 今日までは可・明日は未来・366日は可・367日は長すぎる", () => {
    expect(periodError("2026-09-01", today, today)).toBeNull();
    expect(periodError("2026-09-01", "2026-09-26", today)).toBe("未来の日付は指定できません");
    expect(periodError(addDays(today, -365), today, today)).toBeNull();
    expect(periodError(addDays(today, -366), today, today)).toBe("対象期間は最長1年までです");
    expect(periodError("", today, today)).toBe("開始日と終了日を選んでください");
  });

  it("日付を和文に", () => {
    expect(formatDay("2026-08-01")).toBe("2026年8月1日");
  });
});
