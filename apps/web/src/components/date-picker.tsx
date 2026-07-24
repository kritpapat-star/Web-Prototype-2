"use client";

// ช่องวันที่แบบกดเปิดปฏิทิน popover เลือกวัน (tap-to-pick)
// รับ/คืนค่าเป็น dd/mm/yyyy เหมือนช่องพิมพ์เดิม → parseDMY และ logic ส่งค่า/ตรวจรูปของทุกจุดใช้ได้เหมือนเดิม
// เลี่ยง <input type=date> เนทีฟตาม decision เดิม (มันแสดงผลตาม locale เครื่อง บังคับ dd/mm/yyyy ไม่ได้)
// คิดวันที่ใน UTC midnight space ทั้งหมด (timezone เดียว ICT — สอดคล้อง dateOnlyICT/fmtFullDate)

import { useEffect, useState } from "react";
import { fmtFullDate, parseDMY, TH_GREGORIAN } from "../lib/format";
import { dateOnlyICT } from "../lib/status";
import { addMonthsUTC, monthCells } from "../lib/date-grid";

const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

// เดือนเริ่มต้นของ popover = เดือนของค่าปัจจุบัน (ช่องว่าง/ไม่ใช่วันจริง → เดือนของวันนี้)
function monthStartFromValue(value: string): Date {
  const iso = parseDMY(value);
  if (iso) {
    const d = new Date(`${iso}T00:00:00Z`);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  }
  const t = dateOnlyICT(new Date());
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
}

export function DatePicker({
  value,
  onChange,
  placeholder = "dd/mm/yyyy",
  min,
  max,
  disabled,
  invalid,
  "aria-label": ariaLabel,
}: {
  value: string; // dd/mm/yyyy หรือ ""
  onChange: (v: string) => void; // คืน dd/mm/yyyy
  placeholder?: string;
  min?: string; // dd/mm/yyyy — ปิดวันก่อนหน้า
  max?: string; // dd/mm/yyyy — ปิดวันหลัง
  disabled?: boolean;
  invalid?: boolean; // ขอบแดง
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  // view = วันที่ 1 ของเดือนที่กำลังดู (UTC midnight) — reset ทุกครั้งที่เปิด (ที่ openPicker)
  const [view, setView] = useState(() => monthStartFromValue(value));

  // ปิด popover ด้วย Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const today = dateOnlyICT(new Date());
  const todayTs = today.getTime();
  const selectedISO = parseDMY(value);
  const selectedTs = selectedISO ? new Date(`${selectedISO}T00:00:00Z`).getTime() : null;
  const minISO = min ? parseDMY(min) : null;
  const minTs = minISO ? new Date(`${minISO}T00:00:00Z`).getTime() : null;
  const maxISO = max ? parseDMY(max) : null;
  const maxTs = maxISO ? new Date(`${maxISO}T00:00:00Z`).getTime() : null;

  const cells = monthCells(view.getUTCFullYear(), view.getUTCMonth() + 1);
  const title = new Date(Date.UTC(view.getUTCFullYear(), view.getUTCMonth(), 1)).toLocaleDateString(
    TH_GREGORIAN,
    { month: "long", year: "numeric", timeZone: "UTC" },
  );

  const openPicker = () => {
    setView(monthStartFromValue(value));
    setOpen(true);
  };

  const pick = (day: Date) => {
    onChange(fmtFullDate(day));
    setOpen(false);
  };

  const triggerCls = ["dp-trigger", invalid && "invalid"].filter(Boolean).join(" ");

  return (
    <span className="dp-root">
      <button
        type="button"
        className={triggerCls}
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={openPicker}
      >
        <span className={value ? "dp-value" : "dp-placeholder"}>{value || placeholder}</span>
        <svg className="dp-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden>
          <rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <>
          {/* คลุมจอเพื่อจับคลิกนอก popover ปิด picker (แต่ไม่ปิด modal แม่ — คลิกไม่เลื่อนไปถึง backdrop ของ modal) */}
          <div className="dp-backdrop" onClick={() => setOpen(false)} />
          <div className="dp-popover" role="dialog" aria-label={ariaLabel ?? "เลือกวันที่"} onClick={(e) => e.stopPropagation()}>
            <div className="dp-head">
              <button type="button" className="dp-nav" onClick={() => setView(addMonthsUTC(view, -1))} aria-label="เดือนก่อนหน้า">
                ‹
              </button>
              <span className="dp-title">{title}</span>
              <button type="button" className="dp-nav" onClick={() => setView(addMonthsUTC(view, 1))} aria-label="เดือนถัดไป">
                ›
              </button>
            </div>
            <div className="dp-dow">
              {DOW.map((d, i) => (
                <div key={d} className={i === 0 ? "dp-dow-sun" : i === 6 ? "dp-dow-sat" : undefined}>
                  {d}
                </div>
              ))}
            </div>
            <div className="dp-grid">
              {cells.map((day, i) => {
                if (!day) return <span key={`e-${i}`} className="dp-cell dp-empty" />;
                const ts = day.getTime();
                const off = (minTs !== null && ts < minTs) || (maxTs !== null && ts > maxTs);
                const cls = [
                  "dp-cell",
                  ts === todayTs && "today",
                  ts === selectedTs && "selected",
                  off && "off",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <button
                    key={ts}
                    type="button"
                    className={cls}
                    disabled={off}
                    onClick={() => pick(day)}
                  >
                    {day.getUTCDate()}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </span>
  );
}
