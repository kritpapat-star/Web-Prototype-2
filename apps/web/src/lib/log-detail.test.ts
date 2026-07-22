// apps/web/src/lib/log-detail.test.ts
// describeLog: audit log detail (raw) → ข้อความอ่านง่าย — เช็คแต่ละ action + edge (detail ว่าง/พังรูป)

import { describe, it, expect } from "vitest";
import { describeLog, isPlaceholderSiteName } from "./log-detail";

describe("describeLog", () => {
  it("ui.click โชว์ป้าย + หน้า (map path เป็นชื่อไทย)", () => {
    expect(
      describeLog({
        action: "ui.click",
        detail: { page: "/dashboard", label: "เริ่มงาน", tag: "button", at: "x" },
      }),
    ).toEqual({ main: "“เริ่มงาน”", sub: "หน้างานของฉัน" });
  });

  it("ui.click ไม่มี label → ใช้ชื่อหน้าเป็น main", () => {
    expect(describeLog({ action: "ui.click", detail: { page: "/sites" } })).toEqual({
      main: "หน้าไซต์งาน",
    });
  });

  it("workPlan.create รวมชื่อ + ประเภท + ช่วงวัน (UTC-midnight → format UTC ไม่เพี้ยนวัน)", () => {
    expect(
      describeLog({
        action: "workPlan.create",
        detail: {
          name: "ติดตั้ง CCTV",
          type: "CCTV",
          startDate: "2026-07-04T00:00:00.000Z",
          endDate: "2026-07-10T00:00:00.000Z",
        },
      }),
    ).toEqual({ main: "สร้างแผน “ติดตั้ง CCTV”", sub: "CCTV · 04/07/2026 – 10/07/2026" });
  });

  it("type เป็นเลข (log ใหม่ — types.id เป็น Int ตั้งแต่ 20 ก.ค. 2026) ยังแปลชื่อประเภทได้", () => {
    expect(
      describeLog({ action: "workPlan.create", detail: { name: "งานโซลาร์", type: 1 } }),
    ).toEqual({ main: "สร้างแผน “งานโซลาร์”", sub: "Solar Cell" });
    expect(
      describeLog({ action: "ticket.update", detail: { id: 1, type: 2 } }),
    ).toEqual({ main: "เปลี่ยนประเภท → CCTV" });
  });

  it("workPlan.update บอกเฉพาะ field ที่ส่งมา", () => {
    expect(
      describeLog({ action: "workPlan.update", detail: { id: "p1", name: "ชื่อใหม่" } }),
    ).toEqual({ main: "เปลี่ยนชื่อ → “ชื่อใหม่”" });

    expect(
      describeLog({
        action: "workPlan.update",
        detail: { id: "p1", startDate: "2026-07-05T00:00:00.000Z" },
      }),
    ).toEqual({ main: "เลื่อนวันเริ่ม → 05/07/2026" });
  });

  it("start/finish: ไม่มีเหตุผล = ตรงเวลา / มีเหตุผล = ล่าช้า + เหตุผล", () => {
    expect(describeLog({ action: "workPlan.start", detail: { id: "p1" } })).toEqual({
      main: "เริ่มงานตรงเวลา",
    });
    expect(
      describeLog({ action: "workPlan.finish", detail: { id: "p1", delayEndReason: "ฝนตก" } }),
    ).toEqual({ main: "จบงานล่าช้า", sub: "ฝนตก" });
  });

  it("site.update มี prevName → โชว์ ‘ชื่อเดิม → ชื่อใหม่’", () => {
    expect(
      describeLog({
        action: "site.update",
        detail: { id: 3, name: "บ้านคุณทราย1", prevName: "บ้านคุณทราย" },
      }),
    ).toEqual({ main: "เปลี่ยนชื่อไซต์", sub: "บ้านคุณทราย → บ้านคุณทราย1" });
  });

  it("site.update log เก่า (ไม่มี prevName) → โชว์เฉพาะชื่อใหม่", () => {
    expect(
      describeLog({ action: "site.update", detail: { id: 3, name: "บ้านคุณทราย1" } }),
    ).toEqual({ main: "เปลี่ยนชื่อไซต์เป็น “บ้านคุณทราย1”" });
  });

  it("auth.login / action ไม่รู้จัก → main ไม่ว่าง (ไม่มีคอลัมน์การกระทำแล้ว)", () => {
    expect(describeLog({ action: "auth.login", detail: null })).toEqual({ main: "เข้าสู่ระบบ" });
    expect(describeLog({ action: "something.else", detail: { foo: 1 } })).toEqual({
      main: "something.else",
    });
  });

  it("ticket.create รวมหัวข้อ + ประเภท + นัด (นัดเป็น instant จริง — format เวลาไทย)", () => {
    expect(
      describeLog({
        action: "ticket.create",
        detail: {
          title: "ลูกค้าขอ survey solar",
          type: "1",
          assigneeId: 2,
          appointmentAt: "2026-08-04T03:30:00.000Z", // = 10:30 ICT
        },
      }),
    ).toEqual({ main: "เปิดแจ้งซ่อม “ลูกค้าขอ survey solar”", sub: "Solar Cell · นัด 04/08/2026 10:30" });
  });

  it("ticket.update บอกเฉพาะ field ที่ส่งมา — null = ล้างค่า", () => {
    expect(
      describeLog({ action: "ticket.update", detail: { id: 1, siteId: null } }),
    ).toEqual({ main: "เปลี่ยนเป็นงานใหม่ (ไม่มีไซต์)" });
    expect(
      describeLog({ action: "ticket.update", detail: { id: 1, assignedId: 3, detail: "โน้ตใหม่" } }),
    ).toEqual({ main: "เปลี่ยนผู้รับแจ้งซ่อม → user #3 · แก้รายละเอียด" });
    // log เก่าก่อน rename ใช้ key assigneeId — ต้องยังอ่านได้
    expect(
      describeLog({ action: "ticket.update", detail: { id: 1, assigneeId: 3 } }),
    ).toEqual({ main: "เปลี่ยนผู้รับแจ้งซ่อม → user #3" });
  });

  it("ticket.accept โชว์ชื่อแผน + ช่วงวัน + เลขแผนที่ฝากจาก ctx.audit", () => {
    expect(
      describeLog({
        action: "ticket.accept",
        detail: {
          id: 1,
          name: "ติดตั้ง solar บ้านใหม่",
          type: "1",
          siteId: 4,
          startDate: "2026-08-04T00:00:00.000Z",
          endDate: "2026-08-05T00:00:00.000Z",
          workPlanId: 12,
        },
      }),
    ).toEqual({
      main: "รับแจ้งซ่อมเป็นแผน “ติดตั้ง solar บ้านใหม่”",
      sub: "04/08/2026 – 05/08/2026 · แผน #12",
    });
  });

  it("ticket.close โชว์เหตุผลใน sub", () => {
    expect(
      describeLog({ action: "ticket.close", detail: { id: 1, reason: "ลูกค้ายกเลิก" } }),
    ).toEqual({ main: "ปิดแจ้งซ่อม", sub: "ลูกค้ายกเลิก" });
  });
});

describe("isPlaceholderSiteName", () => {
  it("จับ placeholder จาก backfill (ไซต์ #N) — เว้นวรรครอบ ๆ ก็ยังจับ", () => {
    expect(isPlaceholderSiteName("ไซต์ #5")).toBe(true);
    expect(isPlaceholderSiteName("ไซต์ #123")).toBe(true);
    expect(isPlaceholderSiteName("  ไซต์ #7  ")).toBe(true);
  });

  it("ชื่อจริงที่ผู้ใช้ตั้ง = ไม่ใช่ placeholder", () => {
    expect(isPlaceholderSiteName("โรงงานพระราม 2")).toBe(false);
    expect(isPlaceholderSiteName("ไซต์กลาง")).toBe(false); // ขึ้นต้น "ไซต์" แต่ไม่ใช่รูป #เลข
    expect(isPlaceholderSiteName("ไซต์ #5 (สำรอง)")).toBe(false);
  });
});
