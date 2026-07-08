// apps/web/src/lib/format.ts
// helper format วันที่ฝั่ง web — ใช้ร่วมกันหลายหน้าจอ (dashboard + banner + log)
// ตกลงใช้รูปแบบ dd/mm/yyyy ทั้งระบบ (locale en-GB = วัน/เดือน/ปี เลขล้วน มี "/" คั่น)
// ค่าใน DB เป็น UTC midnight (@db.Date) → ต้อง format ด้วย timeZone UTC เสมอ กันวันเพี้ยน ±1

// locale ที่ให้ dd/mm/yyyy โดยไม่ต้องประกอบเอง
const DMY = "en-GB";

// ยังใช้กับ "หัวข้อเดือน" (ชื่อเดือนไทย + ปี ค.ศ.) ซึ่งเป็น label ของเดือน ไม่ใช่วันที่เต็ม
// (th-TH เพียวๆ จะได้ พ.ศ. — เติม -u-ca-gregory ให้เป็น ค.ศ.)
export const TH_GREGORIAN = "th-TH-u-ca-gregory";

// "04/07/2026" — วันที่เต็ม dd/mm/yyyy (ใช้ทั้งช่วงวันของแผนและหัวข้อวัน)
export function fmtFullDate(d: Date): string {
  return d.toLocaleDateString(DMY, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

// เดิมเป็น "4 ก.ค." (วัน+เดือนย่อ) — ตอนนี้ใช้ dd/mm/yyyy เหมือนทั้งระบบ
// delegate ไป fmtFullDate เพื่อไม่ให้สูตร format หลุดกันในอนาคต
export function fmtDayMonth(d: Date): string {
  return fmtFullDate(d);
}

// "04/07/2026 14:30" — timestamp จริง (เช่น audit log) ต่างจากด้านบน:
// ไม่ใช่ค่า @db.Date UTC-midnight เลย format ด้วยเวลาไทยจริง (Asia/Bangkok) ไม่ใช่ UTC
export function fmtDateTime(d: Date): string {
  const date = d.toLocaleDateString(DMY, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  });
  return `${date} ${fmtTime(d)}`;
}

// "14:30" — เวลาล้วน (24 ชม.) ใช้ในหน้า log ที่จัดกลุ่มตามวันแล้ว จึงไม่ต้องซ้ำวันในทุกแถว
export function fmtTime(d: Date): string {
  return d.toLocaleTimeString(DMY, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  });
}

// "04/07/2026" → "2026-07-04" (ISO) — ตัวผกผันของ fmtFullDate ใช้กับช่องกรอกวันที่ที่พิมพ์เอง
// (เลิกใช้ <input type="date"> เพราะ format แสดงผลของมันตาม locale เครื่อง บังคับ dd/mm/yyyy ไม่ได้)
// พิมพ์ไม่ครบรูป / ไม่ใช่วันจริง (เช่น 31/02/2026) → null (ให้ผู้เรียกถือว่ายังไม่ได้กรอง)
export function parseDMY(s: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const iso = `${yyyy}-${mm}-${dd}`;
  const d = new Date(`${iso}T00:00:00Z`);
  // เทียบกลับกัน overflow (JS ปัด 31/02 → 03/03) — ต้องตรงทุกส่วนถึงจะเป็นวันจริง
  if (
    isNaN(d.getTime()) ||
    d.getUTCDate() !== Number(dd) ||
    d.getUTCMonth() + 1 !== Number(mm) ||
    d.getUTCFullYear() !== Number(yyyy)
  ) {
    return null;
  }
  return iso;
}
