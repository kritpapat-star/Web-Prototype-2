"use client";

// ปฏิทินเดือน — แถวละสัปดาห์ (grid 7 คอลัมน์ เริ่มวันอาทิตย์) ตาม UI อ้างอิง
// แผนโชว์เป็นแถบยาวต่อเนื่องตามช่วงวัน สีตาม computed status ตัดแบ่งที่ขอบสัปดาห์
// วันที่ทั้งหมดเทียบกันที่ระดับ UTC midnight (= วันตามเวลาไทย, ดู dateOnlyICT)

import { planStatus, STATUS_META } from "../lib/status";
import { buildWeekBars, sortForLanes, type WeekBar } from "../lib/calendar-lanes";

export type CalendarPlan = {
  id: number;
  name: string;
  startDate: Date;
  endDate: Date;
  actStart: Date | null;
  actEnd: Date | null;
  user: { id: number; name: string; color: string };
};

const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const MAX_LANES = 3; // เกินนี้พับเป็น "+N เพิ่มเติม" กันช่องสูงเกิน

export function MonthCalendar({
  year,
  month,
  plans,
  today,
  selected,
  onSelect,
  showOwner,
}: {
  year: number;
  month: number; // 1-12
  plans: CalendarPlan[];
  today: Date;
  selected: Date;
  onSelect: (day: Date) => void;
  showOwner: boolean; // CEO เห็นหลายคนปนกัน → โชว์แต้มสีเจ้าของในแถบ
}) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = first.getUTCDay(); // 0 = อาทิตย์

  // ช่องว่างนำหน้า + วันจริง แล้วเติมท้ายให้ครบสัปดาห์
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(Date.UTC(year, month - 1, i + 1))),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // แบ่งเป็นสัปดาห์ละ 7 ช่อง — แถบแผนคิด lane แยกต่อสัปดาห์
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const sorted = sortForLanes(plans);

  // คลิกบนแถบ → แปลงตำแหน่ง x เป็นคอลัมน์วัน (7 ช่องกว้างเท่ากัน) — คงพฤติกรรมคลิกเลือกวัน
  function barClick(
    e: React.MouseEvent<HTMLSpanElement>,
    week: (Date | null)[],
    seg: WeekBar<CalendarPlan>,
  ) {
    const weekEl = e.currentTarget.parentElement; // .cal-week
    if (!weekEl) return;
    const rect = weekEl.getBoundingClientRect();
    const raw = Math.floor(((e.clientX - rect.left) / rect.width) * 7);
    const col = Math.min(seg.colEnd, Math.max(seg.colStart, raw));
    const day = week[col];
    if (day) onSelect(day);
  }

  return (
    <div className="cal-card">
      <div className="cal-head">
        {DOW.map((d, i) => (
          <div key={d} className={i === 0 ? "dow-sun" : i === 6 ? "dow-sat" : undefined}>
            {d}
          </div>
        ))}
      </div>

      <div className="cal-grid">
        {weeks.map((week, w) => {
          const { bars, moreByCol } = buildWeekBars(week, sorted, MAX_LANES);
          return (
            <div key={w} className="cal-week">
              {/* เซลล์ 7 ช่องต้องมาก่อนแถบเสมอ — CSS nth-child(7) และ click math พึ่งลำดับนี้ */}
              {week.map((day, i) => {
                if (!day)
                  return (
                    <div
                      key={`empty-${i}`}
                      className="cal-cell empty-cell"
                      style={{ gridColumn: i + 1 }}
                    />
                  );

                const t = day.getTime();
                const cls = [
                  "cal-cell",
                  t === today.getTime() && "today",
                  t === selected.getTime() && "selected",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <div key={t} className={cls} style={{ gridColumn: i + 1 }} onClick={() => onSelect(day)}>
                    <span className="day-num">{day.getUTCDate()}</span>
                  </div>
                );
              })}

              {bars.map((seg) => {
                const meta = STATUS_META[planStatus(seg.plan)];
                const cls = ["cal-bar", seg.starts && "bar-start", seg.ends && "bar-end"]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <span
                    key={seg.plan.id}
                    className={cls}
                    style={{
                      gridColumn: `${seg.colStart + 1} / ${seg.colEnd + 2}`,
                      gridRow: seg.lane + 2,
                      borderColor: meta.fg,
                      background: meta.bg,
                      color: meta.fg,
                    }}
                    title={seg.plan.name}
                    onClick={(e) => barClick(e, week, seg)}
                  >
                    {showOwner && <span className="pill-dot" style={{ background: seg.plan.user.color }} />}
                    {seg.plan.name}
                  </span>
                );
              })}

              {moreByCol.map(
                (n, i) =>
                  n > 0 && (
                    <div
                      key={`more-${i}`}
                      className="pill-more cal-more"
                      style={{ gridColumn: i + 1, gridRow: MAX_LANES + 2 }}
                    >
                      +{n} เพิ่มเติม
                    </div>
                  ),
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
