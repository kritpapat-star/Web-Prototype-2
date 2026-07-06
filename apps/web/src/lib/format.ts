// apps/web/src/lib/format.ts
// helper format วันที่ฝั่ง web — ใช้ร่วมกันหลายหน้าจอ (dashboard + banner)
// ค่าใน DB เป็น UTC midnight (@db.Date) → ต้อง format ด้วย timeZone UTC เสมอ กันวันเพี้ยน ±1
// ปีใน UI เป็น ค.ศ. ตาม design → locale th-TH-u-ca-gregory (th-TH เพียวๆ จะได้ พ.ศ.)

export const TH_GREGORIAN = "th-TH-u-ca-gregory";

// "4 ก.ค." — ใช้ในบรรทัดช่วงวันที่ของแผน
export function fmtDayMonth(d: Date): string {
  return d.toLocaleDateString(TH_GREGORIAN, { day: "numeric", month: "short", timeZone: "UTC" });
}

// "4 กรกฎาคม 2026" — ใช้เป็นหัวข้อวัน
export function fmtFullDate(d: Date): string {
  return d.toLocaleDateString(TH_GREGORIAN, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
