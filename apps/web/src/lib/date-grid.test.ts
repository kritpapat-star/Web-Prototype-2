// apps/web/src/lib/date-grid.test.ts
// grid เดือนสำหรับ popover เลือกวันที่ — case อิงเดือนจริงเพื่อกัน off-by-one ตอน padding

import { describe, it, expect } from "vitest";
import { monthCells, addMonthsUTC } from "./date-grid";

// นับวันจริง (non-null) ใน grid
const realDays = (cells: (Date | null)[]) => cells.filter((c): c is Date => !!c).length;

describe("monthCells", () => {
  it("จำนวนวันจริง = จำนวนวันของเดือน และ padding ครบทุกสัปดาห์ (หาร 7 ลงตัว)", () => {
    // ก.ค. 2026 = 31 วัน, 1 ก.ค. ตรงกับพุธ (lead = 3)
    const cells = monthCells(2026, 7);
    expect(realDays(cells)).toBe(31);
    expect(cells.length % 7).toBe(0);
  });

  it("เดือนกุมภาพันธ์ปีอธิกสุรทิน = 29 วัน", () => {
    // ก.พ. 2024 (อธิกสุรทิน) — ป้องกัน overflow ตอนคำนวณ daysInMonth
    expect(realDays(monthCells(2024, 2))).toBe(29);
  });

  it("วันแรกของเดือนอยู่หลังช่องว่างนำหน้าตามวันในสัปดาห์ (อาทิตย์ก่อน)", () => {
    // 1 ก.ค. 2026 = พุธ → lead 3 ช่อง (อา จ อ) ก่อนวันแรก
    const cells = monthCells(2026, 7);
    const first = cells.find((c): c is Date => !!c)!;
    expect(first.getUTCDay()).toBe(3); // พุธ
    expect(first.getUTCDate()).toBe(1);
    expect(cells.slice(0, 3)).toEqual([null, null, null]);
  });
});

describe("addMonthsUTC", () => {
  it("เลื่อนเดือนไปข้างหน้า/หลัง โดยตั้งวันที่ 1 (กัน overflow 31→3 มี.น.)", () => {
    const jan1 = new Date(Date.UTC(2026, 0, 1));
    expect(addMonthsUTC(jan1, 1)).toEqual(new Date(Date.UTC(2026, 1, 1)));
    expect(addMonthsUTC(jan1, -1)).toEqual(new Date(Date.UTC(2025, 11, 1)));
    // ข้ามปี
    expect(addMonthsUTC(jan1, 12)).toEqual(new Date(Date.UTC(2027, 0, 1)));
  });

  it("ค่ากลางเดือนก็ยังตั้งวันที่ 1 เสมอ", () => {
    const mid = new Date(Date.UTC(2026, 0, 31));
    expect(addMonthsUTC(mid, 1)).toEqual(new Date(Date.UTC(2026, 1, 1)));
  });
});
