// apps/web/src/lib/log-detail.test.ts
// describeLog: audit log detail (raw) → ข้อความอ่านง่าย — เช็คแต่ละ action + edge (detail ว่าง/พังรูป)

import { describe, it, expect } from "vitest";
import { describeLog } from "./log-detail";

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
    ).toEqual({ main: "“ติดตั้ง CCTV”", sub: "CCTV · 04/07/2026 – 10/07/2026" });
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
      main: "ตรงเวลา",
    });
    expect(
      describeLog({ action: "workPlan.finish", detail: { id: "p1", delayEndReason: "ฝนตก" } }),
    ).toEqual({ main: "ล่าช้า", sub: "ฝนตก" });
  });

  it("auth.login / action ไม่รู้จัก / detail null → main ว่าง", () => {
    expect(describeLog({ action: "auth.login", detail: null })).toEqual({ main: "" });
    expect(describeLog({ action: "something.else", detail: { foo: 1 } })).toEqual({ main: "" });
  });
});
