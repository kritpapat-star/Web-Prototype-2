// ป้าย "เริ่มช้า N วัน / จบช้า" — ติดข้างชื่อแผนในทุกหน้าที่แสดงรายการแผนงาน
//
// ทำไมต้องมี: ชิป status (STATUS_META) ตอบ "สถานะ ณ วันนี้" → แผนที่จบช้า 10 วันยังเป็นชิปเขียว
// "เสร็จแล้ว" ส่วนหน้า /delays ของ CEO ตอบ "จริงเบี่ยงจากแผนไหม" → แผนเดียวกันเป็นชิปแดง "จบช้า"
// ป้ายนี้ทำให้ 2 หน้าเล่าเรื่องเดียวกันโดยไม่ต้องยุบ 2 concept เข้าด้วยกัน (ดู ARCHITECTURE.md)
//
// โชว์เฉพาะ START_LATE / END_LATE — END_DUE ไม่ต้องติดเพราะชิป status
// (NOT_STARTED_OVERDUE / IN_PROGRESS_OVERDUE) แดงบอกอยู่แล้ว จะซ้ำซ้อน
//
// จบช้า (END_LATE) โชว์แค่ป้ายไม่บอกจำนวนวัน — งานปิดแล้วรู้แค่ว่าช้าก็พอ
// ส่วนเริ่มช้า (START_LATE) ยังบอกจำนวนวันอยู่ (งานยังเดิน จำนวนวันมีผลต่อการตาม)

import { planDelayKind, planDelayDays, DELAY_KIND_META } from "../lib/status";

type DelayPlan = { startDate: Date; endDate: Date; actStart: Date | null; actEnd: Date | null };

export function DelayTag({ plan, today }: { plan: DelayPlan; today: Date }) {
  const kind = planDelayKind(plan, today);
  if (kind !== "START_LATE" && kind !== "END_LATE") return null;

  const meta = DELAY_KIND_META[kind];
  return (
    <span className="carry-tag" style={{ background: meta.bg, color: meta.fg }}>
      {meta.label}
      {kind === "START_LATE" && <> {planDelayDays(plan, today)} วัน</>}
    </span>
  );
}
