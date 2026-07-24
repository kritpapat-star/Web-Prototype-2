// apps/web/src/lib/status.ts
// computed status ของแผนงาน — คิดฝั่ง client จากวันที่ (ไม่เก็บใน DB, ดู ARCHITECTURE.md)
// pure function ตาม TESTING.md — ห้ามแตะ DOM/fetch ในไฟล์นี้

export type PlanStatus =
  | "NOT_STARTED"
  | "NOT_STARTED_OVERDUE"
  | "IN_PROGRESS"
  | "IN_PROGRESS_OVERDUE"
  | "COMPLETED";

// ตัดเวลาออก → เหลือวันที่ (UTC midnight) ตามเวลาไทย — สูตรเดียวกับ apps/api/src/lib/dates.ts
export function dateOnlyICT(ts: Date): Date {
  const ict = new Date(ts.getTime() + 7 * 60 * 60 * 1000);
  return new Date(Date.UTC(ict.getUTCFullYear(), ict.getUTCMonth(), ict.getUTCDate()));
}

export function planStatus(
  plan: { startDate: Date; endDate: Date; actStart: Date | null; actEnd: Date | null },
  today: Date = dateOnlyICT(new Date()),
): PlanStatus {
  if (plan.actEnd) return "COMPLETED";
  if (plan.actStart) return today > plan.endDate ? "IN_PROGRESS_OVERDUE" : "IN_PROGRESS";
  return today > plan.startDate ? "NOT_STARTED_OVERDUE" : "NOT_STARTED";
}

// นับแผนตาม status — ใช้ทำแถบ "สรุปประจำวัน" ใน banner (pure function เทสได้ตรงๆ)
export function countByStatus(
  plans: { startDate: Date; endDate: Date; actStart: Date | null; actEnd: Date | null }[],
  today: Date = dateOnlyICT(new Date()),
): Record<PlanStatus, number> {
  const counts: Record<PlanStatus, number> = {
    NOT_STARTED: 0,
    NOT_STARTED_OVERDUE: 0,
    IN_PROGRESS: 0,
    IN_PROGRESS_OVERDUE: 0,
    COMPLETED: 0,
  };
  for (const plan of plans) counts[planStatus(plan, today)] += 1;
  return counts;
}

// ลำดับความสำคัญตอนแสดงแผน — ด่วนสุดขึ้นก่อน ใช้ทั้ง sort รายการและลำดับ chip สรุป:
// เลยกำหนดเริ่ม → เลยกำหนดจบ → กำลังทำ → ยังไม่เริ่ม → เสร็จแล้ว
export const STATUS_BY_URGENCY: PlanStatus[] = [
  "NOT_STARTED_OVERDUE",
  "IN_PROGRESS_OVERDUE",
  "IN_PROGRESS",
  "NOT_STARTED",
  "COMPLETED",
];

// index ใน STATUS_BY_URGENCY = ค่าที่ใช้เทียบตอน sort
const STATUS_PRIORITY = Object.fromEntries(
  STATUS_BY_URGENCY.map((s, i) => [s, i]),
) as Record<PlanStatus, number>;

// เรียงแผนตาม STATUS_PRIORITY — status เท่ากันคงลำดับเดิมจาก API (startDate asc; sort ของ JS stable)
// คืน array ใหม่ ไม่แตะของเดิม (ของเดิมคือ cache ของ react-query)
export function sortByStatusPriority<
  T extends { startDate: Date; endDate: Date; actStart: Date | null; actEnd: Date | null },
>(plans: T[], today: Date): T[] {
  return [...plans].sort(
    (a, b) => STATUS_PRIORITY[planStatus(a, today)] - STATUS_PRIORITY[planStatus(b, today)],
  );
}

// label + สีป้าย ใช้ร่วมกันทุกหน้าจอ
export const STATUS_META: Record<PlanStatus, { label: string; bg: string; fg: string }> = {
  NOT_STARTED: { label: "ยังไม่เริ่ม", bg: "#e5e7eb", fg: "#374151" },
  NOT_STARTED_OVERDUE: { label: "เลยกำหนดเริ่ม", bg: "#fee2e2", fg: "#b91c1c" },
  IN_PROGRESS: { label: "กำลังทำ", bg: "#dbeafe", fg: "#1d4ed8" },
  IN_PROGRESS_OVERDUE: { label: "เลยกำหนดจบ", bg: "#ffedd5", fg: "#c2410c" },
  COMPLETED: { label: "เสร็จแล้ว", bg: "#dcfce7", fg: "#15803d" },
};

// ---------- "จริงเบี่ยงจากแผน" (คนละคำถามกับ planStatus — ดู ARCHITECTURE.md) ----------
// planStatus ตอบ "สถานะ ณ วันนี้" (แผนที่จบช้า 10 วันก็ยังเป็น COMPLETED)
// planDelayKind ตอบ "จริงเบี่ยงจากแผนไหม" → ใช้ติดป้าย "ช้า" คู่กับชิป status ให้ /dashboard
// เล่าเรื่องเดียวกับหน้า /delays ของ CEO
//
// ⚠️ สูตรนี้ mirror จาก apps/api/src/lib/overdue.ts (เหมือน dateOnlyICT ที่ mirror จาก
// apps/api/src/lib/dates.ts) — web import runtime code ข้าม app ไม่ได้ แก้ที่ไหนต้องแก้คู่กัน
// เทสทั้งสองฝั่งใช้ชุดเคสเดียวกันเพื่อล็อกว่าให้ผลตรงกัน
export type PlanDelayKind = "START_DUE" | "START_LATE" | "END_DUE" | "END_LATE";

type DelayPlan = { startDate: Date; endDate: Date; actStart: Date | null; actEnd: Date | null };

// startDate/endDate เป็น @db.Date (UTC-midnight = 07:00 น. ไทย) ส่วน actStart/actEnd เป็น
// timestamp เต็ม → ต้อง dateOnlyICT ก่อนเทียบ ไม่งั้นกดเริ่มงาน 8 โมงของวันที่วางแผนไว้
// จะกลายเป็น "เริ่มช้า" ทั้งที่ตรงวัน (เงื่อนไขเดียวกับที่ tRPC บังคับ delay reason)
// เลยหลายอย่างพร้อมกัน → หนักกว่าชนะ: END_LATE > END_DUE > START_LATE > START_DUE
// END_DUE/START_DUE แยกด้วย actStart ให้ตรงกับ planStatus (ยังไม่กดเริ่ม = เลยกำหนด "เริ่ม")
export function planDelayKind(
  p: DelayPlan,
  today: Date = dateOnlyICT(new Date()),
): PlanDelayKind | null {
  const endDoneLate = p.actEnd != null && dateOnlyICT(p.actEnd).getTime() > p.endDate.getTime();
  const endOpenLate =
    p.actStart != null && p.actEnd == null && p.endDate.getTime() < today.getTime();
  const startLate =
    p.actStart != null && dateOnlyICT(p.actStart).getTime() > p.startDate.getTime();
  const startDue =
    p.actStart == null && p.actEnd == null && p.startDate.getTime() < today.getTime();
  if (endDoneLate) return "END_LATE";
  if (endOpenLate) return "END_DUE";
  if (startLate) return "START_LATE";
  if (startDue) return "START_DUE";
  return null;
}

// จำนวนวันที่ช้า — จุดอ้างอิงตาม kind:
//   START_DUE → today − startDate / START_LATE → actStart − startDate
//   END_DUE   → today − endDate   / END_LATE   → actEnd − endDate
export function planDelayDays(p: DelayPlan, today: Date = dateOnlyICT(new Date())): number {
  const days = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / 86_400_000);
  switch (planDelayKind(p, today)) {
    case "START_DUE":
      return days(p.startDate, today);
    case "START_LATE":
      return p.actStart != null ? days(p.startDate, dateOnlyICT(p.actStart)) : 0;
    case "END_DUE":
      return days(p.endDate, today);
    case "END_LATE":
      return p.actEnd != null ? days(p.endDate, dateOnlyICT(p.actEnd)) : 0;
    default:
      return 0;
  }
}

// label + สีป้ายของแต่ละประเภทความล่าช้า — โทนเดียวกับ STATUS_META
// ใช้ร่วมกันระหว่างตารางหน้า /delays และป้าย "ช้า" ใน /dashboard
// เรียงตามลำดับ start → end (เลยกำหนดเริ่ม → เริ่มช้า → เลยกำหนดจบ → จบช้า)
export const DELAY_KIND_META: Record<PlanDelayKind, { label: string; bg: string; fg: string }> = {
  START_DUE: { label: "เลยกำหนดเริ่ม", bg: "#fde68a", fg: "#78350f" },
  START_LATE: { label: "เริ่มช้า", bg: "#fef3c7", fg: "#92400e" },
  END_DUE: { label: "เลยกำหนดจบ", bg: "#ffedd5", fg: "#c2410c" },
  END_LATE: { label: "จบช้า", bg: "#fee2e2", fg: "#b91c1c" },
};
