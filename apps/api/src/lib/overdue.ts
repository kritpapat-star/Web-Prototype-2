// apps/api/src/lib/overdue.ts
// helpers วันที่/นิยาม "ล่าช้า" ของ overdueRouter — pure functions เทสได้ (mirror lib/dates.ts)
//
// นิยาม "งานล่าช้า" ของแผน = เปรียบเทียบแผน (startDate/endDate) กับจริง (actStart/actEnd)
// **เทียบระดับ "วันไทย" เสมอ** (dateOnlyICT ก่อนเทียบ — ดูคอมเมนต์ planDelayKind):
//   START_DUE  = ยังไม่เริ่มเลย และ startDate < today                (เลยกำหนดเริ่ม)
//   START_LATE = วันที่เริ่มจริง > startDate                         (เริ่มช้า)
//   END_DUE    = เริ่มแล้ว actEnd null และ endDate < today           (เลยกำหนดจบ ยังไม่กดจบ)
//   END_LATE   = วันที่จบจริง > endDate                              (จบช้า)
// เลือกเมื่อเจ้าของต้องการเห็นทุกแผนที่จริงเบี่ยงจากแผน (plan 1784789760518 ภาคต่อ) —
// เคยเป็นแค่ END_DUE tier เดียว ตอนนี้รวม START_DUE/START_LATE/END_LATE ด้วย
// ไม่เก็บคอลัมน์ overdue/status (lock #3) — คำนวณตอน query เหมือน planStatus ฝั่ง web

import type { Prisma } from "@prisma/client";
import { dateOnlyICT, todayICT } from "./dates";

// 24 ชม. — ใช้กับ UTC-midnight เท่านั้น (ผู้เรียก normalize แล้ว) ไม่เพิ่ม date-fns
export const MS_PER_DAY = 86_400_000;

// 2 ประเภทงานล่าช้าแบบเดิม (tier แจ้งซ่อม) — คงไว้เป็น pure utility ถ้านำ tier แจ้งซ่อมกลับมา
export type DelayKind = "ACCEPT_LATE" | "PLAN_LATE";

// ลบ n วันออกจาก now (ระดับมิลลิวินาที — ใช้กับ instant เต็ม เช่น createdAt หรือ new Date())
export function subDays(now: Date, n: number): Date {
  return new Date(now.getTime() - n * MS_PER_DAY);
}

// นับวันระหว่าง 2 วัน (UTC-midnight) — ปัดลง ไม่สนเวลา (เหมือน daysBetween ฝั่ง web)
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

// ---------- helpers แจ้งซ่อม (คงไว้ — pure utilities) ----------

// cutoff สำหรับ where count: ticket ที่ createdAt < (now − staleDays)
export function ticketLateCutoff(now: Date, staleDays: number): Date {
  return subDays(now, staleDays);
}

// อายุแจ้งซ่อม (วัน) — createdAt normalize เป็น "วันไทย" ก่อนเทียบกับ "วันนี้" ไทย (exact ระดับวัน)
export function ticketDaysLate(createdAt: Date, now: Date): number {
  return daysBetween(dateOnlyICT(createdAt), dateOnlyICT(now));
}

// where ของแจ้งซ่อมค้างรับ — ส่งคืน plain object เทียบ literal ได้
export function ticketOverdueWhere(staleDays: number, now: Date): Prisma.TicketWhereInput {
  return { status: "OPEN", createdAt: { lt: ticketLateCutoff(now, staleDays) } };
}

// ---------- helpers แผน ----------

// จำนวนวันที่ endDate เลยจุดอ้างอิง (actEnd หรือ today) — exact ระดับวัน
export function planDaysLate(endDate: Date, today: Date = todayICT()): number {
  return daysBetween(endDate, today);
}

// รูปร่างขั้นต่ำของแผนที่ใช้เทียบ — รับได้ทั้ง Prisma row หรือ mock ในเทส
export interface PlanLike {
  startDate: Date;
  endDate: Date;
  actStart: Date | null;
  actEnd: Date | null;
}

// ประเภทความล่าช้าของแผน — null = ไม่ล่าช้า (ทุกอย่างตรงเวลา/ยังไม่ถึงกำหนด)
// เลยหลายอย่างพร้อมกัน → หนักกว่าชนะ: END_LATE > END_DUE > START_LATE > START_DUE
export type PlanDelayKind = "START_DUE" | "START_LATE" | "END_DUE" | "END_LATE";

// actStart/actEnd เป็น timestamp เต็ม แต่ startDate/endDate เป็น @db.Date (UTC-midnight)
// → ต้อง dateOnlyICT ก่อนเทียบเสมอ ให้เป็นเงื่อนไขเดียวกับที่ tRPC ใช้บังคับ delay reason
// (workPlan.start/finish ใช้ `dateOnlyICT(now) > startDate` — AGENT.md ข้อ 5)
// เทียบ ms ดิบไม่ได้: UTC-midnight = 07:00 น. ไทย → กดเริ่มงาน 8 โมงของวันที่วางแผนไว้
// จะกลายเป็น "เริ่มช้า" ทั้งที่ตรงวัน (แผนที่เริ่มตรงเวลาเกือบทุกใบถูกนับเป็นล่าช้า)
// END_DUE/START_DUE แยกด้วย actStart ให้ตรงกับ planStatus: ยังไม่กดเริ่มเลย = เลยกำหนด "เริ่ม"
// (ไม่ใช่ "จบ") ถึงจะเลย endDate แล้วก็ตาม — เหมือนชิป NOT_STARTED_OVERDUE บน dashboard
export function planDelayKind(p: PlanLike, today: Date = todayICT()): PlanDelayKind | null {
  const endDoneLate = p.actEnd != null && dateOnlyICT(p.actEnd).getTime() > p.endDate.getTime();
  const endOpenLate =
    p.actStart != null && p.actEnd == null && p.endDate.getTime() < today.getTime();
  const startLate =
    p.actStart != null && dateOnlyICT(p.actStart).getTime() > p.startDate.getTime();
  const startDue =
    p.actStart == null && p.actEnd == null && p.startDate.getTime() < today.getTime();
  if (endDoneLate) return "END_LATE"; // จบช้า (actEnd เลย endDate)
  if (endOpenLate) return "END_DUE"; // เลยกำหนดจบ (เริ่มแล้ว ยังไม่จบ + endDate < today)
  if (startLate) return "START_LATE"; // เริ่มช้า (actStart > startDate)
  if (startDue) return "START_DUE"; // เลยกำหนดเริ่ม (ยังไม่เริ่ม + startDate < today)
  return null;
}

export function isPlanDelayed(p: PlanLike, today: Date = todayICT()): boolean {
  return planDelayKind(p, today) != null;
}

// จำนวนวันที่ช้า — โชว์ในชิปคอลัมน์ "ล่าช้า" + ใช้ sort. จุดอ้างอิงตาม kind:
//   START_DUE → today − startDate / START_LATE → actStart − startDate
//   END_DUE   → today − endDate   / END_LATE   → actEnd − endDate
// actStart/actEnd normalize เป็นวันไทยก่อนนับ (เหตุผลเดียวกับ planDelayKind)
export function planDelayDays(p: PlanLike, today: Date = todayICT()): number {
  switch (planDelayKind(p, today)) {
    case "START_DUE":
      return planDaysLate(p.startDate, today);
    case "START_LATE":
      return p.actStart != null ? planDaysLate(p.startDate, dateOnlyICT(p.actStart)) : 0;
    case "END_DUE":
      return planDaysLate(p.endDate, today);
    case "END_LATE":
      return p.actEnd != null ? planDaysLate(p.endDate, dateOnlyICT(p.actEnd)) : 0;
    default:
      return 0;
  }
}

// ---------- where-builder (candidate superset) ----------
// Prisma where เทียบ field กับ value เท่านั้น → เขียน "actEnd > endDate" ตรงๆ ไม่ได้
// เลยดึง superset ที่ "อาจล่าช้า" แล้วกรอง exact ด้วย isPlanDelayed ฝั่ง JS
// complement (ไม่เข้า superset) = actStart null + actEnd null + startDate>=today + endDate>=today
//   = ยังไม่เริ่ม + ยังไม่ถึงทั้งกำหนดเริ่มและจบ → ไม่ล่าช้าแน่นอน
export function planDelayedCandidateWhere(today: Date = todayICT()): Prisma.WorkPlanWhereInput {
  return {
    OR: [
      { actStart: { not: null } }, // เริ่มแล้ว — อาจเริ่มช้า/เลยกำหนดจบ
      { actEnd: { not: null } }, // จบแล้ว อาจจบช้า
      { endDate: { lt: today } }, // เลยกำหนดจบ
      { startDate: { lt: today } }, // ยังไม่เริ่ม + เลยกำหนดเริ่ม (START_DUE)
    ],
  };
}
