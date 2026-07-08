// apps/web/src/lib/log-group.test.ts
// groupLogsByDay / dayHeaderLabel — เน้นขอบ timezone: event ตอนดึก UTC ต้องนับเป็น "วันไทย" ถัดไป

import { describe, it, expect } from "vitest";
import { dayHeaderLabel, groupLogsByDay } from "./log-group";
import { dateOnlyICT } from "./status";

// "วันนี้" สมมติ = 8 ก.ค. 2026 (เวลาไทย) — ใช้เที่ยงวันไทยกัน off-by-one
const today = dateOnlyICT(new Date("2026-07-08T05:00:00Z")); // 12:00 ICT ของ 8 ก.ค.

describe("dayHeaderLabel", () => {
  it("วันเดียวกับ today → 'วันนี้'", () => {
    expect(dayHeaderLabel(today, today)).toBe("วันนี้");
  });

  it("ก่อนหน้า 1 วัน → 'เมื่อวาน'", () => {
    const y = dateOnlyICT(new Date("2026-07-07T05:00:00Z"));
    expect(dayHeaderLabel(y, today)).toBe("เมื่อวาน");
  });

  it("เก่ากว่านั้น → วันที่เต็ม dd/mm/yyyy", () => {
    const older = dateOnlyICT(new Date("2026-07-05T05:00:00Z"));
    expect(dayHeaderLabel(older, today)).toBe("05/07/2026");
  });
});

describe("groupLogsByDay", () => {
  it("จับก้อนตามวันไทย + event ดึก UTC ข้ามไปวันไทยถัดไป (18:00Z 7 ก.ค. = 01:00 ICT 8 ก.ค.)", () => {
    const logs = [
      { id: "a", createdAt: new Date("2026-07-08T02:00:00Z") }, // 09:00 ICT 8 ก.ค. → วันนี้
      { id: "b", createdAt: new Date("2026-07-07T18:00:00Z") }, // 01:00 ICT 8 ก.ค. → ยังวันนี้
      { id: "c", createdAt: new Date("2026-07-07T05:00:00Z") }, // 12:00 ICT 7 ก.ค. → เมื่อวาน
    ];
    const groups = groupLogsByDay(logs, today);
    expect(groups.map((g) => g.label)).toEqual(["วันนี้", "เมื่อวาน"]);
    expect(groups[0].items.map((l) => l.id)).toEqual(["a", "b"]);
    expect(groups[1].items.map((l) => l.id)).toEqual(["c"]);
  });

  it("list ว่าง → ไม่มีก้อน", () => {
    expect(groupLogsByDay([], today)).toEqual([]);
  });
});
