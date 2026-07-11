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
