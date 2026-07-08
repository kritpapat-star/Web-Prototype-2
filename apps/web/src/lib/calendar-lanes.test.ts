// apps/web/src/lib/calendar-lanes.test.ts
// จัด lane แถบ multi-day ในปฏิทิน — case อิง seed: ก.ค. 2026 (1 ก.ค. = พุธ), มิ.ย. 2026 (1 มิ.ย. = จันทร์)

import { describe, it, expect } from "vitest";
import { buildWeekBars, sortForLanes } from "./calendar-lanes";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

// สัปดาห์เต็ม 7 วันต่อเนื่อง เริ่มจากวันอาทิตย์ที่กำหนด
const fullWeek = (sunday: string): Date[] => {
  const start = d(sunday);
  return Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * 86_400_000));
};

const plan = (id: string, start: string, end: string) => ({
  id,
  startDate: d(start),
  endDate: d(end),
});

describe("sortForLanes", () => {
  it("เริ่มก่อนมาก่อน → ช่วงยาวก่อน → id (deterministic)", () => {
    const sorted = sortForLanes([
      plan("c", "2026-07-13", "2026-07-14"),
      plan("b", "2026-07-13", "2026-07-17"),
      plan("a", "2026-07-12", "2026-07-12"),
      plan("d", "2026-07-13", "2026-07-14"),
    ]);
    expect(sorted.map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("buildWeekBars — ตำแหน่งแถบ", () => {
  it("แผนวันเดียว → แถบ 1 คอลัมน์ หัวท้ายมนทั้งคู่", () => {
    const week = fullWeek("2026-07-05");
    const { bars } = buildWeekBars(week, [plan("p1", "2026-07-08", "2026-07-08")], 3);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ colStart: 3, colEnd: 3, lane: 0, starts: true, ends: true });
  });

  it("แผน 13-17 ก.ค. (จ.-ศ. case multi-day bar ใน seed) → แถบเดียว cols 1-5", () => {
    const week = fullWeek("2026-07-12");
    const { bars, moreByCol } = buildWeekBars(week, [plan("cctv", "2026-07-13", "2026-07-17")], 3);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ colStart: 1, colEnd: 5, lane: 0, starts: true, ends: true });
    expect(moreByCol).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("แผนข้ามสัปดาห์ (25-30 มิ.ย.) → 2 segment ขอบเรียบฝั่งที่ต่อกัน", () => {
    const p = [plan("solar", "2026-06-25", "2026-06-30")];
    // สัปดาห์ 21-27 มิ.ย.: โผล่ พฤ.-ส. ท้ายไม่มน (ยังไม่จบ)
    const seg1 = buildWeekBars(fullWeek("2026-06-21"), p, 3).bars[0];
    expect(seg1).toMatchObject({ colStart: 4, colEnd: 6, starts: true, ends: false });
    // สัปดาห์ 28 มิ.ย.-4 ก.ค.: โผล่ อา.-อ. หัวไม่มน (ต่อจากสัปดาห์ก่อน)
    const seg2 = buildWeekBars(fullWeek("2026-06-28"), p, 3).bars[0];
    expect(seg2).toMatchObject({ colStart: 0, colEnd: 2, starts: false, ends: true });
  });

  it("แผนคร่อมเดือน (29 มิ.ย.→1 ก.ค.) ใน view ก.ค. → clamp เหลือ 1 ก.ค. หัวเรียบ", () => {
    // สัปดาห์แรกของ ก.ค. 2026: ช่องว่าง 3 ช่อง (อา.-อ.) แล้ว 1-4 ก.ค.
    const week = [null, null, null, d("2026-07-01"), d("2026-07-02"), d("2026-07-03"), d("2026-07-04")];
    const { bars } = buildWeekBars(week, [plan("phase1", "2026-06-29", "2026-07-01")], 3);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ colStart: 3, colEnd: 3, starts: false, ends: true });
  });

  it("แผนนอกช่วงสัปดาห์ → ไม่มีแถบ", () => {
    const week = fullWeek("2026-07-05");
    const { bars } = buildWeekBars(week, [plan("p1", "2026-07-13", "2026-07-17")], 3);
    expect(bars).toHaveLength(0);
  });

  it("สัปดาห์ว่างทั้งแถว (กันพัง) → ไม่มีแถบ", () => {
    const week = [null, null, null, null, null, null, null];
    expect(buildWeekBars(week, [plan("p1", "2026-07-01", "2026-07-02")], 3)).toEqual({
      bars: [],
      moreByCol: [0, 0, 0, 0, 0, 0, 0],
    });
  });
});

describe("buildWeekBars — lane + overflow", () => {
  it("lane ว่างถูก reuse: แผนจบ 1 ก.ค. แล้วแผน 2-4 ก.ค. ได้ lane 0 ต่อ (case สัปดาห์แรกใน seed)", () => {
    const week = [null, null, null, d("2026-07-01"), d("2026-07-02"), d("2026-07-03"), d("2026-07-04")];
    const plans = sortForLanes([
      plan("phase1", "2026-06-29", "2026-07-01"),
      plan("nvr", "2026-07-02", "2026-07-04"),
    ]);
    const { bars } = buildWeekBars(week, plans, 3);
    expect(bars.find((b) => b.plan.id === "phase1")?.lane).toBe(0);
    expect(bars.find((b) => b.plan.id === "nvr")?.lane).toBe(0);
  });

  it("แผนทับกันซ้อน lane ตามลำดับ", () => {
    const week = fullWeek("2026-07-12");
    const plans = sortForLanes([
      plan("a", "2026-07-13", "2026-07-17"),
      plan("b", "2026-07-14", "2026-07-15"),
      plan("c", "2026-07-14", "2026-07-14"),
    ]);
    const { bars } = buildWeekBars(week, plans, 3);
    expect(bars.find((b) => b.plan.id === "a")?.lane).toBe(0);
    expect(bars.find((b) => b.plan.id === "b")?.lane).toBe(1);
    expect(bars.find((b) => b.plan.id === "c")?.lane).toBe(2);
  });

  it("เกิน maxLanes → ตัดออกจาก bars แล้วนับลง moreByCol เฉพาะวันที่ทับ", () => {
    const week = fullWeek("2026-07-12");
    const plans = sortForLanes([
      plan("a", "2026-07-13", "2026-07-17"),
      plan("b", "2026-07-13", "2026-07-15"),
      plan("c", "2026-07-13", "2026-07-14"),
      plan("d", "2026-07-13", "2026-07-14"), // lane 3 → ซ่อน (จ.-อ. cols 1-2)
    ]);
    const { bars, moreByCol } = buildWeekBars(week, plans, 3);
    expect(bars).toHaveLength(3);
    expect(bars.every((b) => b.plan.id !== "d")).toBe(true);
    expect(moreByCol).toEqual([0, 1, 1, 0, 0, 0, 0]);
  });
});
