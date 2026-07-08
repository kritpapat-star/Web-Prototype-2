// apps/web/src/lib/log-group.ts
// จัดกลุ่ม audit log ตาม "วัน" (เวลาไทย) เพื่อให้หน้า /logs อ่านง่าย — หัวข้อวันคั่น + แถวโชว์แค่เวลา
// - log เรียงใหม่→เก่ามาแล้ว (orderBy createdAt desc) → แถววันเดียวกันต่อเนื่องกัน จับก้อนแบบ linear พอ
// - วันคิดตามเวลาไทย: event ตอนดึก UTC อาจข้ามไปเป็นวันไทยถัดไป → ใช้ dateOnlyICT เหมือนที่อื่นในระบบ
// pure function ตาม TESTING.md (เทสใน log-group.test.ts) — ห้ามแตะ DOM/fetch

import { dateOnlyICT } from "./status";
import { fmtFullDate } from "./format";

const DAY_MS = 24 * 60 * 60 * 1000;

// dayIct / today เป็น UTC-midnight ของ "วันไทย" (ผลจาก dateOnlyICT) → เทียบ getTime ตรงๆ ได้
export function dayHeaderLabel(dayIct: Date, today: Date): string {
  const diff = today.getTime() - dayIct.getTime();
  if (diff === 0) return "วันนี้";
  if (diff === DAY_MS) return "เมื่อวาน";
  return fmtFullDate(dayIct); // "05/07/2026" (format ด้วย UTC — dayIct เป็น UTC-midnight)
}

export type DayGroup<T> = { key: number; label: string; items: T[] };

// logs (desc) → ก้อนรายวัน เรียงใหม่→เก่าตามเดิม
export function groupLogsByDay<T extends { createdAt: Date }>(
  logs: T[],
  today: Date,
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const log of logs) {
    const day = dateOnlyICT(log.createdAt);
    const key = day.getTime();
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(log);
    } else {
      groups.push({ key, label: dayHeaderLabel(day, today), items: [log] });
    }
  }
  return groups;
}
