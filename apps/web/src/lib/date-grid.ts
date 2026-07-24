// apps/web/src/lib/date-grid.ts
// helper grid เดือนสำหรับ popover เลือกวันที่ (date-picker.tsx)
// คิดใน UTC midnight space ทั้งหมด — timezone เดียวคือ ICT = UTC midnight
// (สอดคล้อง dateOnlyICT / fmtFullDate / MonthCalendar)
// pure function — ไม่แตะ DOM เทสได้ตรง ๆ (TESTING.md)

// เซลล์วันของเดือน (อาทิตย์นำหน้า + วันจริง + padding ท้ายให้ครบสัปดาห์)
// null = ช่องว่าง (ก่อนวันที่ 1 / padding ท้ายเดือน)
export function monthCells(year: number, month: number): (Date | null)[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = first.getUTCDay(); // 0 = อาทิตย์
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(Date.UTC(year, month - 1, i + 1)),
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// เลื่อนเดือน — ตั้งวันที่ 1 เสมอ กัน overflow (เช่น 31 ม.ค. +1 เดือน ต้องไม่กลายเป็น 3 มี.น.)
export function addMonthsUTC(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}
