// apps/web/src/lib/status.test.ts
// TESTING.md: "status ทั้ง 5 ค่า ทดสอบผ่าน planStatus() ตรงๆ (pure function — เทสง่ายสุดในระบบ)"
// วันสมมติอิง seed: วันนี้ = 2 ก.ค. 2026 (UTC midnight ตามที่ dateOnlyICT normalize แล้ว)

import { describe, it, expect } from "vitest";
import { planStatus, dateOnlyICT, countByStatus, sortByStatusPriority } from "./status";

const TODAY = new Date("2026-07-02T00:00:00Z");
const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("planStatus — ครบทั้ง 5 ค่า (case ตรงกับ seed)", () => {
  it("COMPLETED: มี actEnd แล้ว ไม่สนวันที่ (CCTV เฟส 1)", () => {
    expect(
      planStatus(
        { startDate: d("2026-06-29"), endDate: d("2026-07-01"), actStart: d("2026-06-29"), actEnd: d("2026-07-01") },
        TODAY,
      ),
    ).toBe("COMPLETED");
  });

  it("IN_PROGRESS: เริ่มแล้ว ยังไม่เลยวันจบแผน (config NVR 2-4 ก.ค.)", () => {
    expect(
      planStatus(
        { startDate: d("2026-07-02"), endDate: d("2026-07-04"), actStart: d("2026-07-02"), actEnd: null },
        TODAY,
      ),
    ).toBe("IN_PROGRESS");
  });

  it("IN_PROGRESS_OVERDUE: เริ่มแล้ว เลยวันจบแผน ยังไม่ปิด (network สำนักงาน จบแผน 30 มิ.ย.)", () => {
    expect(
      planStatus(
        { startDate: d("2026-06-28"), endDate: d("2026-06-30"), actStart: d("2026-06-28"), actEnd: null },
        TODAY,
      ),
    ).toBe("IN_PROGRESS_OVERDUE");
  });

  it("NOT_STARTED: ยังไม่ถึงวันเริ่มแผน (แผน 13-17 ก.ค.)", () => {
    expect(
      planStatus(
        { startDate: d("2026-07-13"), endDate: d("2026-07-17"), actStart: null, actEnd: null },
        TODAY,
      ),
    ).toBe("NOT_STARTED");
  });

  it("NOT_STARTED_OVERDUE: เลยวันเริ่มแผนแล้วยังไม่กดเริ่ม (ย้าย AP เริ่มแผน 1 ก.ค.)", () => {
    expect(
      planStatus(
        { startDate: d("2026-07-01"), endDate: d("2026-07-03"), actStart: null, actEnd: null },
        TODAY,
      ),
    ).toBe("NOT_STARTED_OVERDUE");
  });
});

describe("planStatus — ขอบวัน", () => {
  it("วันนี้ = วันเริ่มแผนพอดี ยังไม่กดเริ่ม → NOT_STARTED (ยังไม่ถือว่าช้า)", () => {
    expect(
      planStatus(
        { startDate: TODAY, endDate: d("2026-07-05"), actStart: null, actEnd: null },
        TODAY,
      ),
    ).toBe("NOT_STARTED");
  });

  it("วันนี้ = วันจบแผนพอดี เริ่มแล้ว → IN_PROGRESS (ยังไม่ overdue)", () => {
    expect(
      planStatus(
        { startDate: d("2026-06-30"), endDate: TODAY, actStart: d("2026-06-30"), actEnd: null },
        TODAY,
      ),
    ).toBe("IN_PROGRESS");
  });
});

describe("countByStatus — แถบสรุปประจำวันใน banner", () => {
  it("นับครบทั้ง 5 status จากรายการปนกัน (case ตรงกับ seed)", () => {
    const plans = [
      // COMPLETED (CCTV เฟส 1)
      { startDate: d("2026-06-29"), endDate: d("2026-07-01"), actStart: d("2026-06-29"), actEnd: d("2026-07-01") },
      // IN_PROGRESS (config NVR)
      { startDate: d("2026-07-02"), endDate: d("2026-07-04"), actStart: d("2026-07-02"), actEnd: null },
      // IN_PROGRESS_OVERDUE (network สำนักงาน)
      { startDate: d("2026-06-28"), endDate: d("2026-06-30"), actStart: d("2026-06-28"), actEnd: null },
      // NOT_STARTED_OVERDUE (ย้าย AP)
      { startDate: d("2026-07-01"), endDate: d("2026-07-03"), actStart: null, actEnd: null },
      // NOT_STARTED ×2 (แผนอนาคต)
      { startDate: d("2026-07-13"), endDate: d("2026-07-17"), actStart: null, actEnd: null },
      { startDate: d("2026-07-02"), endDate: d("2026-07-02"), actStart: null, actEnd: null },
    ];
    expect(countByStatus(plans, TODAY)).toEqual({
      NOT_STARTED: 2,
      NOT_STARTED_OVERDUE: 1,
      IN_PROGRESS: 1,
      IN_PROGRESS_OVERDUE: 1,
      COMPLETED: 1,
    });
  });

  it("list ว่าง → ทุก status เป็น 0", () => {
    expect(countByStatus([], TODAY)).toEqual({
      NOT_STARTED: 0,
      NOT_STARTED_OVERDUE: 0,
      IN_PROGRESS: 0,
      IN_PROGRESS_OVERDUE: 0,
      COMPLETED: 0,
    });
  });
});

describe("sortByStatusPriority — เรียงรายการแผนตามความเร่งด่วน", () => {
  // แผนละ 1 status (case เดียวกับ countByStatus ด้านบน) ใส่ name ไว้ตรวจลำดับง่ายๆ
  const completed = { name: "completed", startDate: d("2026-06-29"), endDate: d("2026-07-01"), actStart: d("2026-06-29"), actEnd: d("2026-07-01") };
  const inProgress = { name: "inProgress", startDate: d("2026-07-02"), endDate: d("2026-07-04"), actStart: d("2026-07-02"), actEnd: null };
  const inProgressOverdue = { name: "inProgressOverdue", startDate: d("2026-06-28"), endDate: d("2026-06-30"), actStart: d("2026-06-28"), actEnd: null };
  const notStartedOverdue = { name: "notStartedOverdue", startDate: d("2026-07-01"), endDate: d("2026-07-03"), actStart: null, actEnd: null };
  const notStarted = { name: "notStarted", startDate: d("2026-07-13"), endDate: d("2026-07-17"), actStart: null, actEnd: null };

  it("เลยกำหนดเริ่ม → เลยกำหนดจบ → กำลังทำ → ยังไม่เริ่ม → เสร็จแล้ว", () => {
    const input = [completed, notStarted, inProgress, notStartedOverdue, inProgressOverdue];
    expect(sortByStatusPriority(input, TODAY).map((p) => p.name)).toEqual([
      "notStartedOverdue",
      "inProgressOverdue",
      "inProgress",
      "notStarted",
      "completed",
    ]);
  });

  it("status เดียวกันคงลำดับเดิม (stable) + ไม่แก้ array ต้นทาง", () => {
    const notStarted2 = { ...notStarted, name: "notStarted2" };
    const input = [notStarted, completed, notStarted2];
    const sorted = sortByStatusPriority(input, TODAY);
    // notStarted มาก่อน notStarted2 ตามลำดับเดิม แม้ทั้งคู่ status เดียวกัน
    expect(sorted.map((p) => p.name)).toEqual(["notStarted", "notStarted2", "completed"]);
    // ต้นทางไม่ถูก sort ทับ (เป็น cache ของ react-query)
    expect(input.map((p) => p.name)).toEqual(["notStarted", "completed", "notStarted2"]);
  });
});

describe("dateOnlyICT (สูตรเดียวกับฝั่ง api)", () => {
  it("17:00Z = เที่ยงคืนไทยของวันถัดไป → เลื่อนวัน (จับ bug ±1)", () => {
    expect(dateOnlyICT(new Date("2026-07-01T17:00:00Z"))).toEqual(d("2026-07-02"));
  });
});
