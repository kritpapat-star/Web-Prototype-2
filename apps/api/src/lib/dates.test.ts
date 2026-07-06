// apps/api/src/lib/dates.test.ts
// เทสตาม TESTING.md หมวด "วันที่ / timezone" — จุดเสี่ยงอันดับ 1 ของระบบ
// กติกา: ICT = UTC+7 → 17:00Z ของวันนี้ = เที่ยงคืนของ "พรุ่งนี้" ตามเวลาไทย

import { describe, it, expect } from "vitest";
import { dateOnlyICT, todayICT } from "./dates";

describe("dateOnlyICT", () => {
  it("17:00Z = เที่ยงคืน ICT ของวันถัดไป → ต้องได้วันถัดไป (case จับ bug ±1 วัน)", () => {
    // 2026-07-01T17:00:00Z = 2026-07-02 00:00 เวลาไทย
    expect(dateOnlyICT(new Date("2026-07-01T17:00:00Z"))).toEqual(
      new Date("2026-07-02T00:00:00Z"),
    );
  });

  it("ก่อน 17:00Z หนึ่งวินาที ยังเป็นวันเดิมตามเวลาไทย", () => {
    // 2026-07-01T16:59:59Z = 2026-07-01 23:59:59 เวลาไทย
    expect(dateOnlyICT(new Date("2026-07-01T16:59:59Z"))).toEqual(
      new Date("2026-07-01T00:00:00Z"),
    );
  });

  it("เวลากลางวันไทย (10:00Z = 17:00 ICT) → วันเดียวกัน", () => {
    expect(dateOnlyICT(new Date("2026-07-02T10:00:00Z"))).toEqual(
      new Date("2026-07-02T00:00:00Z"),
    );
  });

  it("idempotent: ค่าที่ normalize แล้ว (UTC midnight) ต้องไม่เลื่อนวันอีก", () => {
    const normalized = dateOnlyICT(new Date("2026-07-15T08:30:00Z"));
    expect(dateOnlyICT(normalized)).toEqual(normalized);
  });

  it("คร่อมเดือน: 30 มิ.ย. 18:00Z → ต้องเป็น 1 ก.ค. (เดือนใหม่)", () => {
    expect(dateOnlyICT(new Date("2026-06-30T18:00:00Z"))).toEqual(
      new Date("2026-07-01T00:00:00Z"),
    );
  });

  it("คร่อมปี: 31 ธ.ค. 17:30Z → ต้องเป็น 1 ม.ค. ปีถัดไป", () => {
    expect(dateOnlyICT(new Date("2026-12-31T17:30:00Z"))).toEqual(
      new Date("2027-01-01T00:00:00Z"),
    );
  });

  it("ผลลัพธ์เป็น UTC midnight เสมอ (ชั่วโมง/นาที/วินาที/ms = 0)", () => {
    const d = dateOnlyICT(new Date("2026-07-04T13:45:56.789Z"));
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCSeconds()).toBe(0);
    expect(d.getUTCMilliseconds()).toBe(0);
  });
});

describe("todayICT", () => {
  it("เท่ากับ dateOnlyICT(ตอนนี้) และเป็น UTC midnight", () => {
    const today = todayICT();
    expect(today).toEqual(dateOnlyICT(new Date()));
    expect(today.getUTCHours()).toBe(0);
    expect(today.getUTCMilliseconds()).toBe(0);
  });
});
