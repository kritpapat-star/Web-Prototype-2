// apps/api/src/lib/dates.ts
// helpers วันที่ตามเวลาไทย — pure functions แยกจาก router ให้เทสได้โดยไม่ต้องมี DB/trpc

// วันที่ "วันนี้" ตามเวลาไทย แปลงเป็น UTC midnight ให้เทียบกับ @db.Date ได้ตรงๆ
export function todayICT(): Date {
  return dateOnlyICT(new Date());
}

// ตัดเวลาออกจาก timestamp → เหลือแค่วันที่ (UTC midnight) ตามเวลาไทย
export function dateOnlyICT(ts: Date): Date {
  const ict = new Date(ts.getTime() + 7 * 60 * 60 * 1000);
  return new Date(Date.UTC(ict.getUTCFullYear(), ict.getUTCMonth(), ict.getUTCDate()));
}
