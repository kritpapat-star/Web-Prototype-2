// apps/web/src/lib/log-detail.ts
// แปลง audit log 1 แถว → ข้อความอ่านง่าย (ไม่โชว์ JSON ดิบบนหน้า log)
// detail มาจาก raw input ของ mutation (workPlan.*) หรือ { page, label, tag, at } (ui.click)
//   - workPlan.create/update: startDate/endDate เป็น UTC-midnight ISO string → format ด้วย fmtDayMonth (UTC)
//   - workPlan.update ส่งมาเฉพาะ field ที่เปลี่ยน → บอกได้ว่าแก้อะไรบ้าง
// action/detail ที่ไม่รู้จักหรือพังรูป → main เป็น "" (หน้า log โชว์ "—" แทน)

import { fmtDayMonth } from "./format";

// pathname → ชื่อหน้าที่คนอ่านออก (ไม่รู้จัก = โชว์ path ดิบ)
const PAGE_NAMES: Record<string, string> = {
  "/": "เข้าสู่ระบบ",
  "/dashboard": "งานของฉัน",
  "/logs": "ประวัติการใช้งาน",
  "/sites": "ไซต์งาน",
};

// รหัสประเภท (types.id) → ชื่อแสดงผล — ชุดเดียวกับ table types
// (describeLog เป็น pure function เลย snapshot ไว้ที่นี่ — ประเภทที่ไม่รู้จักโชว์รหัสดิบแทน)
// log เป็น append-only: ต้อง map รหัสตัวอักษรยุค enum เดิม (SOLAR, …) ที่ค้างใน log เก่าด้วย
const TYPE_NAMES: Record<string, string> = {
  "1": "Solar Cell",
  "2": "CCTV",
  "3": "Network",
  "4": "IOT",
  "5": "Software",
  SOLAR: "Solar Cell",
  CCTV: "CCTV",
  NETWORK: "Network",
  IOT: "IOT",
  SOFTWARE: "Software",
};

export type LogDescription = { main: string; sub?: string };

function pageName(p: unknown): string {
  if (typeof p !== "string") return "";
  return PAGE_NAMES[p] ?? p;
}

// "2026-07-04T00:00:00.000Z" → "04/07/2026" (ค่าเป็น UTC-midnight เลย format ด้วย UTC เหมือน fmtDayMonth)
function fmtDate(v: unknown): string {
  if (typeof v !== "string" && !(v instanceof Date)) return "";
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? "" : fmtDayMonth(d);
}

type LogLike = { action: string; detail: unknown };

export function describeLog(log: LogLike): LogDescription {
  const d = (log.detail ?? {}) as Record<string, unknown>;

  switch (log.action) {
    // คลิกใน UI — โชว์ป้ายของ element ที่คลิก + หน้าที่อยู่ตอนนั้น
    case "ui.click": {
      const label = typeof d.label === "string" ? d.label : "";
      const page = pageName(d.page);
      if (label) return { main: `“${label}”`, sub: page ? `หน้า${page}` : undefined };
      return { main: page ? `หน้า${page}` : "" };
    }

    // สร้างแผน — ชื่อแผน + ประเภท + ช่วงวัน
    case "workPlan.create": {
      const name = typeof d.name === "string" ? d.name : "";
      const sub = [
        typeof d.type === "string" ? (TYPE_NAMES[d.type] ?? d.type) : "",
        [fmtDate(d.startDate), fmtDate(d.endDate)].filter(Boolean).join(" – "),
      ]
        .filter(Boolean)
        .join(" · ");
      return { main: name ? `“${name}”` : "สร้างแผนงาน", sub: sub || undefined };
    }

    // แก้ไขแผน — บอกเฉพาะ field ที่เปลี่ยน (detail ส่งมาเท่าที่แก้)
    case "workPlan.update": {
      const parts: string[] = [];
      if (typeof d.name === "string") parts.push(`เปลี่ยนชื่อ → “${d.name}”`);
      if (typeof d.type === "string" && d.type)
        parts.push(`เปลี่ยนประเภท → ${TYPE_NAMES[d.type] ?? d.type}`);
      const start = fmtDate(d.startDate);
      if (start) parts.push(`เลื่อนวันเริ่ม → ${start}`);
      const end = fmtDate(d.endDate);
      if (end) parts.push(`เลื่อนวันจบ → ${end}`);
      return { main: parts.length ? parts.join(" · ") : "แก้ไขแผนงาน" };
    }

    // เริ่ม/จบงาน — ไม่มีเหตุผล = ตรงเวลา / มีเหตุผล = ล่าช้าพร้อมเหตุผล (API บังคับกรอกเฉพาะตอนช้า)
    case "workPlan.start": {
      const reason = typeof d.delayStartReason === "string" ? d.delayStartReason.trim() : "";
      return reason ? { main: "ล่าช้า", sub: reason } : { main: "ตรงเวลา" };
    }
    case "workPlan.finish": {
      const reason = typeof d.delayEndReason === "string" ? d.delayEndReason.trim() : "";
      return reason ? { main: "ล่าช้า", sub: reason } : { main: "ตรงเวลา" };
    }

    // auth.login (ไม่เก็บ detail) และ action อื่นที่ยังไม่รู้จัก → ปล่อยว่าง
    default:
      return { main: "" };
  }
}
