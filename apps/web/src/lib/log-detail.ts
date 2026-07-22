// apps/web/src/lib/log-detail.ts
// แปลง audit log 1 แถว → ข้อความอ่านง่าย (ไม่โชว์ JSON ดิบบนหน้า log)
// detail มาจาก raw input ของ mutation (workPlan.*) หรือ { page, label, tag, at } (ui.click)
//   - workPlan.create/update: startDate/endDate เป็น UTC-midnight ISO string → format ด้วย fmtDayMonth (UTC)
//   - workPlan.update ส่งมาเฉพาะ field ที่เปลี่ยน → บอกได้ว่าแก้อะไรบ้าง
// main ต้องไม่ว่างเสมอ — ตาราง log ไม่มีคอลัมน์ "การกระทำ" แล้ว ช่องนี้เป็นที่เดียวที่บอกว่าเกิดอะไรขึ้น
// (action ที่ไม่รู้จัก = โชว์ path ดิบ ดีกว่าปล่อยแถวว่าง)

import { fmtAppointment, fmtDayMonth } from "./format";

// pathname → ชื่อหน้าที่คนอ่านออก (ไม่รู้จัก = โชว์ path ดิบ)
const PAGE_NAMES: Record<string, string> = {
  "/": "เข้าสู่ระบบ",
  "/dashboard": "งานของฉัน",
  "/tickets": "แจ้งซ่อม",
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

// ชื่อไซต์ placeholder จาก backfill (migration 20260711074613) = "ไซต์ #<เลข>" ตรงๆ
// เป็นแค่ที่กันชื่อว่างของไซต์ที่ระบบสร้างอัตโนมัติ ไม่มีความหมายกับผู้ใช้ — หน้า log ไม่โชว์
export function isPlaceholderSiteName(name: string): boolean {
  return /^ไซต์ #\d+$/.test(name.trim());
}

function pageName(p: unknown): string {
  if (typeof p !== "string") return "";
  return PAGE_NAMES[p] ?? p;
}

// ชื่อประเภทจากค่าใน log — types.id เป็น Int ตั้งแต่ 20 ก.ค. 2026 (log ใหม่เก็บเลข)
// log เก่าเป็น string ("1") หรือรหัสยุค enum เดิม (SOLAR) — รับหมดเพราะ log เป็น append-only
function typeName(v: unknown): string {
  if (typeof v !== "string" && typeof v !== "number") return "";
  if (v === "") return "";
  return TYPE_NAMES[String(v)] ?? String(v);
}

// "2026-07-04T00:00:00.000Z" → "04/07/2026" (ค่าเป็น UTC-midnight เลย format ด้วย UTC เหมือน fmtDayMonth)
function fmtDate(v: unknown): string {
  if (typeof v !== "string" && !(v instanceof Date)) return "";
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? "" : fmtDayMonth(d);
}

// timestamp จริง (เช่น appointmentAt ของเคส) — ต่างจาก fmtDate: format ตามเวลาไทย ไม่ใช่ UTC
function fmtInstant(v: unknown): string {
  if (typeof v !== "string" && !(v instanceof Date)) return "";
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? "" : fmtAppointment(d);
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
        typeName(d.type),
        [fmtDate(d.startDate), fmtDate(d.endDate)].filter(Boolean).join(" – "),
      ]
        .filter(Boolean)
        .join(" · ");
      return { main: name ? `สร้างแผน “${name}”` : "สร้างแผนงาน", sub: sub || undefined };
    }

    // แก้ไขแผน — บอกเฉพาะ field ที่เปลี่ยน (detail ส่งมาเท่าที่แก้)
    case "workPlan.update": {
      const parts: string[] = [];
      if (typeof d.name === "string") parts.push(`เปลี่ยนชื่อ → “${d.name}”`);
      if (typeName(d.type)) parts.push(`เปลี่ยนประเภท → ${typeName(d.type)}`);
      const start = fmtDate(d.startDate);
      if (start) parts.push(`เลื่อนวันเริ่ม → ${start}`);
      const end = fmtDate(d.endDate);
      if (end) parts.push(`เลื่อนวันจบ → ${end}`);
      return { main: parts.length ? parts.join(" · ") : "แก้ไขแผนงาน" };
    }

    // เริ่ม/จบงาน — ไม่มีเหตุผล = ตรงเวลา / มีเหตุผล = ล่าช้าพร้อมเหตุผล (API บังคับกรอกเฉพาะตอนช้า)
    case "workPlan.start": {
      const reason = typeof d.delayStartReason === "string" ? d.delayStartReason.trim() : "";
      return reason ? { main: "เริ่มงานล่าช้า", sub: reason } : { main: "เริ่มงานตรงเวลา" };
    }
    case "workPlan.finish": {
      const reason = typeof d.delayEndReason === "string" ? d.delayEndReason.trim() : "";
      return reason ? { main: "จบงานล่าช้า", sub: reason } : { main: "จบงานตรงเวลา" };
    }

    case "workPlan.delete":
      return { main: "ลบแผนงาน" };
    case "workPlan.unstart":
      return { main: "ยกเลิกเริ่มงาน" };

    // ไซต์งาน — detail คือ raw input (create มี name / delete มีแค่ id)
    case "site.create": {
      const name = typeof d.name === "string" ? d.name : "";
      return { main: name ? `สร้างไซต์ “${name}”` : "สร้างไซต์งาน" };
    }
    // แก้ชื่อไซต์ — detail มี name (ชื่อใหม่) + prevName (ชื่อเดิม ที่ handler ฝากไว้ ดู api/trpc.ts)
    // มีทั้งคู่และต่างกัน = โชว์ "เดิม → ใหม่" / log เก่าก่อนเก็บ prevName = โชว์เฉพาะชื่อใหม่
    case "site.update": {
      const name = typeof d.name === "string" ? d.name : "";
      const prev = typeof d.prevName === "string" ? d.prevName : "";
      if (prev && name && prev !== name) return { main: "เปลี่ยนชื่อไซต์", sub: `${prev} → ${name}` };
      return { main: name ? `เปลี่ยนชื่อไซต์เป็น “${name}”` : "แก้ไขชื่อไซต์" };
    }
    case "site.delete":
      return { main: "ลบไซต์งาน" };

    // เคสลูกค้า — detail คือ raw input ของ ticket.* (+ workPlanId ที่ accept ฝากไว้ผ่าน ctx.audit)
    // siteId/appointmentAt/reason ถูกตัดจาก schema แล้ว (slim tickets 20 ก.ค. 2026) — คงโค้ด render ไว้
    // เพราะ log เก่าใน DB ยังมี field พวกนี้ (append-only) ส่วน log ใหม่ไม่มีก็ข้ามเงื่อนไขไปเอง
    case "ticket.create": {
      const title = typeof d.title === "string" ? d.title : "";
      const appt = fmtInstant(d.appointmentAt);
      const sub = [
        typeName(d.type),
        appt ? `นัด ${appt}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return { main: title ? `เปิดแจ้งซ่อม “${title}”` : "เปิดแจ้งซ่อม", sub: sub || undefined };
    }

    // แก้เคส — บอกเฉพาะ field ที่เปลี่ยน (null = ล้างค่า ตามสัญญา ticket.update)
    case "ticket.update": {
      const parts: string[] = [];
      if (typeof d.title === "string") parts.push(`เปลี่ยนหัวข้อ → “${d.title}”`);
      if (d.type !== undefined)
        parts.push(typeName(d.type) ? `เปลี่ยนประเภท → ${typeName(d.type)}` : "ล้างประเภทงาน");
      if (d.siteId !== undefined)
        parts.push(typeof d.siteId === "number" ? `ย้ายไซต์ → #${d.siteId}` : "เปลี่ยนเป็นงานใหม่ (ไม่มีไซต์)");
      // assigneeId = ชื่อเดิมก่อน rename เป็น assignedId (20 ก.ค. 2026) — คงไว้อ่าน log เก่า
      const assignedId = typeof d.assignedId === "number" ? d.assignedId : d.assigneeId;
      if (typeof assignedId === "number") parts.push(`เปลี่ยนผู้รับแจ้งซ่อม → user #${assignedId}`);
      if (d.appointmentAt !== undefined) {
        const appt = fmtInstant(d.appointmentAt);
        parts.push(appt ? `เลื่อนนัด → ${appt}` : "ล้างนัดหมาย");
      }
      if (d.detail !== undefined) parts.push("แก้รายละเอียด");
      return { main: parts.length ? parts.join(" · ") : "แก้ไขแจ้งซ่อม" };
    }

    // รับเคสเป็นแผน — detail มีชื่อ/ช่วงวันของแผนใหม่ + เลขแผน (workPlanId ฝากจาก handler)
    case "ticket.accept": {
      const name = typeof d.name === "string" ? d.name : "";
      const sub = [
        [fmtDate(d.startDate), fmtDate(d.endDate)].filter(Boolean).join(" – "),
        typeof d.workPlanId === "number" ? `แผน #${d.workPlanId}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return { main: name ? `รับแจ้งซ่อมเป็นแผน “${name}”` : "รับแจ้งซ่อมเป็นแผนงาน", sub: sub || undefined };
    }

    case "ticket.close": {
      const reason = typeof d.reason === "string" ? d.reason.trim() : "";
      return { main: "ปิดแจ้งซ่อม", sub: reason || undefined };
    }
    // mutation ถูกถอดแล้ว 20 ก.ค. 2026 (รูปแนบเคส) — คง case ไว้ให้ log เก่าใน DB ยัง render ได้
    case "ticket.removeImage":
      return { main: "ลบรูปแนบแจ้งซ่อม" };

    // login จงใจไม่เก็บ detail (มี password ใน input) — บอกแค่ว่าเข้าสู่ระบบ
    case "auth.login":
      return { main: "เข้าสู่ระบบ" };

    // login ไม่สำเร็จ — เขียนจาก auth.ts เฉพาะกรณี username มีจริงแต่รหัสผิด, detail มีแค่ ip ต้นทาง
    case "LOGIN_FAILED": {
      const ip = typeof d.ip === "string" ? d.ip : "";
      return { main: "เข้าสู่ระบบไม่สำเร็จ (รหัสผ่านผิด)", sub: ip ? `จาก IP ${ip}` : undefined };
    }

    // action ที่ยังไม่รู้จัก → โชว์ path ดิบ (ห้ามปล่อยว่าง — ไม่มีคอลัมน์อื่นบอกแล้ว)
    default:
      return { main: log.action };
  }
}
