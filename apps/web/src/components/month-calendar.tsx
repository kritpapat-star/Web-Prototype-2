"use client";

// ปฏิทินเดือน — grid 7 คอลัมน์ เริ่มวันอาทิตย์ ตาม UI อ้างอิง
// แผนโชว์เป็น pill สีตาม computed status (แผนหลายวันโชว์ซ้ำทุกวันในช่วง)
// วันที่ทั้งหมดเทียบกันที่ระดับ UTC midnight (= วันตามเวลาไทย, ดู dateOnlyICT)

import { planStatus, STATUS_META } from "../lib/status";

export type CalendarPlan = {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  actStart: Date | null;
  actEnd: Date | null;
  user: { id: string; name: string; color: string };
};

const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const MAX_PILLS = 3; // เกินนี้พับเป็น "+N เพิ่มเติม" กันช่องสูงเกิน

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
  showOwner: boolean; // CEO เห็นหลายคนปนกัน → โชว์แต้มสีเจ้าของใน pill
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
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} className="cal-cell empty-cell" />;

          const t = day.getTime();
          const dayPlans = plans.filter(
            (p) => p.startDate.getTime() <= t && t <= p.endDate.getTime(),
          );
          const cls = [
            "cal-cell",
            t === today.getTime() && "today",
            t === selected.getTime() && "selected",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div key={t} className={cls} onClick={() => onSelect(day)}>
              <span className="day-num">{day.getUTCDate()}</span>

              {dayPlans.slice(0, MAX_PILLS).map((p) => {
                const meta = STATUS_META[planStatus(p)];
                return (
                  <span
                    key={p.id}
                    className="pill"
                    style={{ borderColor: meta.fg, background: meta.bg, color: meta.fg }}
                    title={p.name}
                  >
                    {showOwner && <span className="pill-dot" style={{ background: p.user.color }} />}
                    {p.name}
                  </span>
                );
              })}

              {dayPlans.length > MAX_PILLS && (
                <div className="pill-more">+{dayPlans.length - MAX_PILLS} เพิ่มเติม</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
