// apps/web/src/lib/calendar-lanes.ts
// จัด lane ให้แถบแผนงานหลายวันในปฏิทินเดือน (แบบ Google Calendar) — คิดทีละสัปดาห์
// pure function ตาม TESTING.md — ห้ามแตะ DOM/fetch ในไฟล์นี้
// วันที่ทั้งหมดเป็น UTC midnight (= วันตามเวลาไทย, ดู status.ts)

// id รับทั้ง string และ number — WorkPlan ใช้เลขรัน ส่วน test/ผู้เรียกอื่นใช้ string ได้
export type BarSpan = { id: string | number; startDate: Date; endDate: Date };

export type WeekBar<T extends BarSpan> = {
  plan: T;
  colStart: number; // 0 = อาทิตย์ … 6 = เสาร์
  colEnd: number;
  lane: number; // 0 = แถวบนสุด
  starts: boolean; // แผนเริ่มจริงใน segment นี้ → หัวมนซ้าย
  ends: boolean; // แผนจบจริงใน segment นี้ → ท้ายมนขวา
};

// เรียงก่อนส่งเข้า buildWeekBars: เริ่มก่อน → ช่วงยาวก่อน → id กันลำดับสลับ
// แถบยาว/ข้ามสัปดาห์จะจอง lane ต่ำก่อน ทำให้ segment สัปดาห์ถัดไปได้ lane เดิมเกือบเสมอ
export function sortForLanes<T extends BarSpan>(plans: T[]): T[] {
  return [...plans].sort(
    (a, b) =>
      a.startDate.getTime() - b.startDate.getTime() ||
      b.endDate.getTime() - a.endDate.getTime() ||
      String(a.id).localeCompare(String(b.id)),
  );
}

// คืนแถบที่มองเห็น (lane < maxLanes) + จำนวนแผนที่ถูกซ่อนต่อคอลัมน์ (ทำ "+N เพิ่มเติม")
// week = 7 ช่องของสัปดาห์เดียว (null = ช่องว่างหัว/ท้ายเดือน — วันจริงต่อเนื่องกันเสมอ)
export function buildWeekBars<T extends BarSpan>(
  week: (Date | null)[],
  sortedPlans: T[],
  maxLanes: number,
): { bars: WeekBar<T>[]; moreByCol: number[] } {
  const days = week.filter((d): d is Date => d !== null);
  const moreByCol = Array.from({ length: 7 }, () => 0);
  if (days.length === 0) return { bars: [], moreByCol };

  const weekStart = days[0].getTime();
  const weekEnd = days[days.length - 1].getTime();

  const bars: WeekBar<T>[] = [];
  const laneEnd: number[] = []; // คอลัมน์สุดท้ายที่แต่ละ lane ถูกจองแล้ว

  for (const plan of sortedPlans) {
    // ตัดช่วงแผนให้อยู่ในวันที่มองเห็นของสัปดาห์นี้
    const s = Math.max(plan.startDate.getTime(), weekStart);
    const e = Math.min(plan.endDate.getTime(), weekEnd);
    if (s > e) continue;

    // วันเป็น UTC midnight + สัปดาห์เริ่มอาทิตย์ → คอลัมน์ = day of week
    const colStart = new Date(s).getUTCDay();
    const colEnd = new Date(e).getUTCDay();

    // greedy: ใช้ lane แรกที่ว่างก่อนถึง colStart
    let lane = laneEnd.findIndex((end) => end < colStart);
    if (lane === -1) lane = laneEnd.push(-1) - 1;
    laneEnd[lane] = colEnd;

    if (lane < maxLanes) {
      bars.push({
        plan,
        colStart,
        colEnd,
        lane,
        starts: s === plan.startDate.getTime(),
        ends: e === plan.endDate.getTime(),
      });
    } else {
      for (let c = colStart; c <= colEnd; c++) moreByCol[c] += 1;
    }
  }

  return { bars, moreByCol };
}
