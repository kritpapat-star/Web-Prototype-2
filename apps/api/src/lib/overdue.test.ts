// apps/api/src/lib/overdue.test.ts
// เทส helper ของ overdueRouter — mirror dates.test.ts (pure functions, ไม่ต้องมี DB)
// จุดเสี่ยง timezone ±1 วัน เหมือน dates.ts — ครอบด้วย boundary 17:00Z = เที่ยงคืนไทยของวันถัดไป

import { describe, it, expect } from "vitest";
import {
  MS_PER_DAY,
  subDays,
  daysBetween,
  ticketLateCutoff,
  ticketDaysLate,
  planDaysLate,
  ticketOverdueWhere,
  planDelayedCandidateWhere,
  planDelayKind,
  isPlanDelayed,
  planDelayDays,
  type PlanLike,
} from "./overdue";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("subDays / daysBetween", () => {
  it("subDays ลบ n วัน (ระดับมิลลิวินาที — ใช้กับ instant เต็ม)", () => {
    expect(subDays(d("2026-07-05"), 3)).toEqual(d("2026-07-02"));
    // ไม่ normalize เวลา ถ้าผู้เรียกส่ง instant เต็มมา (cutoff ระดับวินาทีตั้งใจให้เป็นแบบนี้)
    expect(subDays(new Date("2026-07-05T12:00:00Z"), 0)).toEqual(
      new Date("2026-07-05T12:00:00Z"),
    );
  });

  it("daysBetween ปัดลงตามวัน (ไม่สนเวลา)", () => {
    expect(daysBetween(d("2026-06-29"), d("2026-07-02"))).toBe(3);
    // 26 ชม. แต่ข้ามเที่ยงคืนแค่ 1 ครั้ง → 1 วัน
    expect(
      daysBetween(new Date("2026-07-01T23:00:00Z"), new Date("2026-07-03T01:00:00Z")),
    ).toBe(1);
  });

  it("MS_PER_DAY = 24 ชม.", () => {
    expect(MS_PER_DAY).toBe(86_400_000);
  });
});

describe("ticketLateCutoff", () => {
  it("now − staleDays (ระดับวินาที ใช้กับ createdAt ที่เป็น timestamp เต็ม)", () => {
    const now = new Date("2026-07-05T10:00:00Z");
    expect(ticketLateCutoff(now, 3)).toEqual(new Date("2026-07-02T10:00:00Z"));
  });

  it("staleDays=0 → cutoff = now (ใบที่สร้างก่อนตอนนี้นับเป็นค้าง)", () => {
    const now = new Date("2026-07-05T10:00:00Z");
    expect(ticketLateCutoff(now, 0)).toEqual(now);
  });
});

describe("ticketDaysLate — อายุแจ้งซ่อม normalize เป็นวันไทยก่อนนับ", () => {
  // now สมมติ: 2026-07-05T03:00:00Z = 10:00 ไทย ของวันที่ 5 (UTC midnight = 5 ก.ค.)
  const NOW = new Date("2026-07-05T03:00:00Z");

  it("createdAt ตอนเช้าไทย (UTC วันเดียวกัน) → อายุตามจำนวนวัน", () => {
    // 2026-07-02T10:00Z = 17:00 ไทยของวันที่ 2 → อายุ 3 วัน
    expect(ticketDaysLate(new Date("2026-07-02T10:00:00Z"), NOW)).toBe(3);
  });

  it("timezone boundary: createdAt 17:00Z วันก่อน = เที่ยงคืนไทยของวันถัดไป (จับ bug ±1)", () => {
    // 2026-07-01T17:00Z = 2026-07-02 00:00 ICT → created = 2 ก.ค. → อายุ 3 วัน (ไม่ใช่ 4)
    expect(ticketDaysLate(new Date("2026-07-01T17:00:00Z"), NOW)).toBe(3);
  });

  it("ก่อน 17:00Z หนึ่งวินาที ยังเป็นวันเดิมตามเวลาไทย", () => {
    // 2026-07-01T16:59:59Z = 23:59:59 ไทยของวันที่ 1 → created = 1 ก.ค. → อายุ 4 วัน
    expect(ticketDaysLate(new Date("2026-07-01T16:59:59Z"), NOW)).toBe(4);
  });

  it("สร้างวันเดียวกับ now (0 วัน)", () => {
    expect(ticketDaysLate(new Date("2026-07-05T08:00:00Z"), NOW)).toBe(0);
  });
});

describe("planDaysLate — endDate (UTC-midnight) vs today (UTC-midnight)", () => {
  it("endDate ก่อน today → ล่าช้าตามจำนวนวัน", () => {
    expect(planDaysLate(d("2026-06-30"), d("2026-07-02"))).toBe(2);
  });

  it("endDate = today → 0 (วันครบกำหนดไม่นับล่าช้า)", () => {
    expect(planDaysLate(d("2026-07-02"), d("2026-07-02"))).toBe(0);
  });

  it("endDate หลัง today → ค่าติดลบ (ยังไม่ถึงกำหนด — ไม่เข้าเงื่อนไข overdue อยู่แล้ว)", () => {
    expect(planDaysLate(d("2026-07-09"), d("2026-07-02"))).toBe(-7);
  });
});

describe("where-builders — plain object เทียบ literal ได้", () => {
  it("ticketOverdueWhere: status OPEN + createdAt < cutoff", () => {
    const now = new Date("2026-07-05T10:00:00Z");
    expect(ticketOverdueWhere(3, now)).toEqual({
      status: "OPEN",
      createdAt: { lt: new Date("2026-07-02T10:00:00Z") },
    });
  });

  it("planDelayedCandidateWhere: superset ที่อาจล่าช้า (exact กรองฝั่ง JS)", () => {
    const today = d("2026-07-02");
    expect(planDelayedCandidateWhere(today)).toEqual({
      OR: [
        { actStart: { not: null } },
        { actEnd: { not: null } },
        { endDate: { lt: d("2026-07-02") } },
        { startDate: { lt: d("2026-07-02") } },
      ],
    });
  });
});

describe("planDelayKind / isPlanDelayed — เปรียบเทียบแผนกับจริง", () => {
  // today = 2026-07-10, แผนตั้งต้น: startDate 7/01, endDate 7/05, ยังไม่เริ่ม/จบ
  const T = d("2026-07-10");
  const plan = (over: Partial<PlanLike>): PlanLike => ({
    startDate: d("2026-07-01"),
    endDate: d("2026-07-05"),
    actStart: null,
    actEnd: null,
    ...over,
  });

  it("START_DUE: ยังไม่เริ่มเลย + startDate<today (แม้เลย endDate แล้วก็เป็นเลยกำหนดเริ่ม)", () => {
    // plan({}) = ยังไม่เริ่ม/จบ, startDate 7/01 & endDate 7/05 < today 7/10
    // → เลยกำหนด "เริ่ม" (ตรงกับ NOT_STARTED_OVERDUE) ไม่ใช่ END_DUE
    expect(planDelayKind(plan({}), T)).toBe("START_DUE");
  });

  it("END_DUE: เริ่มแล้ว ยังไม่จบ + endDate<today", () => {
    expect(planDelayKind(plan({ actStart: d("2026-07-01") }), T)).toBe("END_DUE");
  });

  it("START_LATE: actStart>startDate แม้จบตรงเวลา", () => {
    expect(planDelayKind(plan({ actStart: d("2026-07-02"), actEnd: d("2026-07-05") }), T)).toBe(
      "START_LATE",
    );
  });

  it("END_LATE: จบแล้วแต่ actEnd>endDate", () => {
    expect(planDelayKind(plan({ actStart: d("2026-07-01"), actEnd: d("2026-07-08") }), T)).toBe(
      "END_LATE",
    );
  });

  it("end ชนะ start (เลยทั้งคู่ → END_LATE)", () => {
    expect(planDelayKind(plan({ actStart: d("2026-07-03"), actEnd: d("2026-07-08") }), T)).toBe(
      "END_LATE",
    );
  });

  it("null: ทุกอย่างตรงเวลาและยังไม่ถึงกำหนด", () => {
    expect(planDelayKind(plan({ startDate: d("2026-07-15"), endDate: d("2026-07-20") }), T)).toBeNull();
  });

  it("null: startDate = today พอดี ยังไม่เริ่ม → ยังไม่ START_DUE (ตรงกับ NOT_STARTED)", () => {
    expect(planDelayKind(plan({ startDate: T, endDate: d("2026-07-20") }), T)).toBeNull();
  });

  it("null: เริ่มตรงเวลา + จบตรงเวลา", () => {
    expect(planDelayKind(plan({ actStart: d("2026-07-01"), actEnd: d("2026-07-05") }), T)).toBeNull();
  });

  it("isPlanDelayed mirror planDelayKind != null", () => {
    expect(isPlanDelayed(plan({}), T)).toBe(true);
    expect(isPlanDelayed(plan({ startDate: d("2026-07-15"), endDate: d("2026-07-20") }), T)).toBe(false);
  });
});

// actStart/actEnd จริงเป็น timestamp เต็มจาก new Date() ไม่ใช่เที่ยงคืน UTC —
// startDate/endDate เป็น @db.Date (UTC-midnight = 07:00 น. ไทย) ถ้าเทียบ ms ดิบ
// แผนที่เริ่ม 8 โมงเช้าของวันที่วางแผนไว้จะกลายเป็น "เริ่มช้า" ทั้งที่ตรงวัน
describe("planDelayKind — actStart/actEnd เป็น timestamp เต็ม (เทียบระดับวันไทย)", () => {
  const T = d("2026-07-10");
  const plan = (over: Partial<PlanLike>): PlanLike => ({
    startDate: d("2026-07-01"),
    endDate: d("2026-07-05"),
    actStart: null,
    actEnd: null,
    ...over,
  });

  it("เริ่ม 10:00 น. ไทยของวันที่วางแผนไว้ → ไม่ใช่ START_LATE", () => {
    // 2026-07-01T03:00Z = 10:00 ไทยของวันที่ 1 → วันเริ่มจริง = 1 ก.ค. = startDate
    expect(
      planDelayKind(
        plan({ actStart: new Date("2026-07-01T03:00:00Z"), actEnd: d("2026-07-05") }),
        T,
      ),
    ).toBeNull();
  });

  it("จบ 16:00 น. ไทยของวันครบกำหนด → ไม่ใช่ END_LATE", () => {
    // 2026-07-05T09:00Z = 16:00 ไทยของวันที่ 5 → วันจบจริง = 5 ก.ค. = endDate
    expect(
      planDelayKind(
        plan({
          actStart: new Date("2026-07-01T03:00:00Z"),
          actEnd: new Date("2026-07-05T09:00:00Z"),
        }),
        T,
      ),
    ).toBeNull();
  });

  it("boundary 17:00Z = เที่ยงคืนไทยของวันถัดไป → เป็น START_LATE (จับบั๊ก ±1)", () => {
    // 2026-07-01T17:00Z = 2026-07-02 00:00 ICT → วันเริ่มจริง = 2 ก.ค. > startDate
    expect(
      planDelayKind(
        plan({ actStart: new Date("2026-07-01T17:00:00Z"), actEnd: d("2026-07-05") }),
        T,
      ),
    ).toBe("START_LATE");
  });

  it("ก่อน 17:00Z หนึ่งวินาที ยังเป็นวันเดิมตามเวลาไทย → ไม่ช้า", () => {
    // 2026-07-01T16:59:59Z = 23:59:59 ไทยของวันที่ 1 → วันเริ่มจริง = 1 ก.ค.
    expect(
      planDelayKind(
        plan({ actStart: new Date("2026-07-01T16:59:59Z"), actEnd: d("2026-07-05") }),
        T,
      ),
    ).toBeNull();
  });

  it("จบช้าจริงข้ามวัน → END_LATE (timestamp เต็มไม่ทำให้พลาด)", () => {
    expect(
      planDelayKind(
        plan({
          actStart: new Date("2026-07-01T03:00:00Z"),
          actEnd: new Date("2026-07-08T09:00:00Z"),
        }),
        T,
      ),
    ).toBe("END_LATE");
  });
});

describe("planDelayDays — จำนวนวันช้า (sort)", () => {
  const T = d("2026-07-10");
  const plan = (over: Partial<PlanLike>): PlanLike => ({
    startDate: d("2026-07-01"),
    endDate: d("2026-07-05"),
    actStart: null,
    actEnd: null,
    ...over,
  });

  it("START_DUE: today − startDate", () => {
    expect(planDelayDays(plan({}), T)).toBe(9); // 7/01 → 7/10 (ยังไม่เริ่ม)
  });
  it("END_DUE: today − endDate", () => {
    expect(planDelayDays(plan({ actStart: d("2026-07-01") }), T)).toBe(5); // 7/05 → 7/10
  });
  it("END_LATE: actEnd − endDate", () => {
    expect(planDelayDays(plan({ actStart: d("2026-07-01"), actEnd: d("2026-07-08") }), T)).toBe(3);
  });
  it("START_LATE: actStart − startDate", () => {
    expect(planDelayDays(plan({ actStart: d("2026-07-03"), actEnd: d("2026-07-05") }), T)).toBe(2);
  });

  it("actStart เป็น timestamp เต็ม → นับวันเป๊ะ ไม่ปัดเพี้ยน", () => {
    // 2026-07-03T09:00Z = 16:00 ไทยของวันที่ 3 → ช้า 2 วันเท่าเดิม
    expect(
      planDelayDays(
        plan({ actStart: new Date("2026-07-03T09:00:00Z"), actEnd: d("2026-07-05") }),
        T,
      ),
    ).toBe(2);
  });

  it("actEnd เป็น timestamp เต็ม → นับวันเป๊ะ", () => {
    expect(
      planDelayDays(
        plan({
          actStart: new Date("2026-07-01T03:00:00Z"),
          actEnd: new Date("2026-07-08T09:00:00Z"),
        }),
        T,
      ),
    ).toBe(3);
  });
});
