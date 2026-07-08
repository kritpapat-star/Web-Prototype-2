"use client";

// หน้า "ประวัติการใช้งาน" (audit log) — เปิดให้ทุก role
// โครงเดียวกับ dashboard/page.tsx: รอ mount → auth.me → AppShell
// scope อยู่ที่ API: engineer เห็นเฉพาะ log ของตัวเอง / CEO เห็นทุกคน

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc, getToken, setToken } from "../../lib/trpc";
import { fmtFullDate, fmtTime, parseDMY } from "../../lib/format";
import { dateOnlyICT } from "../../lib/status";
import { describeLog } from "../../lib/log-detail";
import { groupLogsByDay } from "../../lib/log-group";
import { AppShell } from "../../components/app-shell";

// ป้ายไทยของ action — เพิ่ม mutation ใหม่แล้วอยากได้ป้ายไทยให้เติมที่นี่ (ไม่รู้จัก = โชว์ path ดิบ)
const ACTION_LABELS: Record<string, string> = {
  "auth.login": "เข้าสู่ระบบ",
  "workPlan.create": "สร้างแผนงาน",
  "workPlan.update": "แก้ไขแผนงาน",
  "workPlan.start": "เริ่มงาน",
  "workPlan.finish": "จบงาน",
  "ui.click": "คลิก",
};

export default function LogsPage() {
  const router = useRouter();
  // กันอ่าน localStorage ตอน SSR: รอ mount ก่อนค่อยยิง query (pattern เดียวกับ dashboard)
  const [ready, setReady] = useState(false);
  // "วันนี้" ตามเวลาไทย — fix ครั้งเดียว ใช้ตัดสินหัวข้อ "วันนี้/เมื่อวาน" ในการจัดกลุ่ม log
  const [today] = useState(() => dateOnlyICT(new Date()));
  // filter ช่วงวันที่ — ผู้ใช้พิมพ์เป็น dd/mm/yyyy เอง (คุมช่องเอง เพราะ <input type=date>
  // เนทีฟบังคับ format แสดงผลไม่ได้ มันตาม locale ของเครื่อง)
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  // ไม่มี token → เด้งไปหน้า login / มี token ค่อยยิง query
  useEffect(() => {
    if (!getToken()) router.replace("/");
    else setReady(true);
  }, [router]);

  // dd/mm/yyyy → ISO (null ถ้ายังพิมพ์ไม่ครบ/ไม่จริง) → instant ขอบ "วันไทย" (+07:00) ที่ API ใช้กรอง
  // to เป็น exclusive: ส่งต้นวัน "ถัดจาก to" ไปเพื่อครอบทั้งวันที่เลือก
  const fromISO = parseDMY(fromText);
  const toISO = parseDMY(toText);
  const fromInstant = fromISO ? new Date(`${fromISO}T00:00:00+07:00`) : undefined;
  const toInstant = toISO ? new Date(`${toISO}T00:00:00+07:00`) : undefined;
  const toExclusive = toInstant ? new Date(toInstant.getTime() + 24 * 60 * 60 * 1000) : undefined;
  const filterActive = !!(fromText || toText);

  // ค่าปุ่มด่วน — today เป็น UTC-midnight ของวันไทย → fmtFullDate ให้ dd/mm/yyyy ตรงกับที่ช่องรับ
  const todayDMY = fmtFullDate(today);
  const weekAgoDMY = fmtFullDate(new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000));

  const me = trpc.auth.me.useQuery(undefined, { enabled: ready, retry: false });
  const logs = trpc.auditLog.list.useQuery(
    { limit: 100, from: fromInstant, to: toExclusive },
    { enabled: ready && !!me.data },
  );

  // token หมดอายุ/ใช้ไม่ได้ → ล้าง token แล้วเด้งกลับหน้า login
  useEffect(() => {
    if (me.error) {
      setToken(null);
      router.replace("/");
    }
  }, [me.error, router]);

  if (!ready || me.isLoading) return <div className="center-note">กำลังโหลด…</div>;
  if (!me.data) return null;

  return (
    <AppShell
      title="ประวัติการใช้งาน"
      user={me.data}
      onLogout={() => {
        setToken(null);
        router.replace("/");
      }}
    >
      <section className="day-panel">
        <div className="panel-head">
          <h2>{filterActive ? "ประวัติในช่วงที่เลือก" : "การกระทำล่าสุด"}</h2>
        </div>

        {/* filter ช่วงวันที่ — พิมพ์ dd/mm/yyyy เอง (เลือกวันเดียวได้โดยตั้ง "จาก" = "ถึง") / ปุ่มด่วนช่วยกรอกเร็ว */}
        <div className="log-filter">
          <label className="log-filter-field">
            จาก
            <input
              type="text"
              inputMode="numeric"
              placeholder="dd/mm/yyyy"
              maxLength={10}
              className={fromText && !fromISO ? "log-date-input invalid" : "log-date-input"}
              value={fromText}
              onChange={(e) => setFromText(e.target.value)}
            />
          </label>
          <label className="log-filter-field">
            ถึง
            <input
              type="text"
              inputMode="numeric"
              placeholder="dd/mm/yyyy"
              maxLength={10}
              className={toText && !toISO ? "log-date-input invalid" : "log-date-input"}
              value={toText}
              onChange={(e) => setToText(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={fromText === todayDMY && toText === todayDMY ? "type-btn active" : "type-btn"}
            onClick={() => {
              setFromText(todayDMY);
              setToText(todayDMY);
            }}
          >
            วันนี้
          </button>
          <button
            type="button"
            className={
              fromText === weekAgoDMY && toText === todayDMY ? "type-btn active" : "type-btn"
            }
            onClick={() => {
              setFromText(weekAgoDMY);
              setToText(todayDMY);
            }}
          >
            7 วันล่าสุด
          </button>
          {filterActive && (
            <button
              type="button"
              className="type-btn"
              onClick={() => {
                setFromText("");
                setToText("");
              }}
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>

        {logs.error && <p className="form-error">โหลดประวัติไม่สำเร็จ: {logs.error.message}</p>}

        {logs.isLoading ? (
          <p className="empty-note">กำลังโหลด…</p>
        ) : (logs.data ?? []).length === 0 ? (
          <p className="empty-note">
            {filterActive ? "ไม่พบประวัติในช่วงวันที่เลือก" : "ยังไม่มีประวัติการใช้งาน"}
          </p>
        ) : (
          <div className="log-table-wrap">
            <table className="log-table">
              <thead>
                <tr>
                  <th>เวลา</th>
                  <th>ผู้ใช้</th>
                  <th>การกระทำ</th>
                  <th>รายละเอียด</th>
                </tr>
              </thead>
              <tbody>
                {groupLogsByDay(logs.data ?? [], today).map((group) => (
                  <Fragment key={group.key}>
                    <tr className="log-day-row">
                      <td colSpan={4}>{group.label}</td>
                    </tr>
                    {group.items.map((log) => {
                      const desc = describeLog(log);
                      return (
                        <tr key={log.id}>
                          <td className="log-time">{fmtTime(log.createdAt)}</td>
                          <td>
                            <div className="log-user">
                              <span className="dot" style={{ background: log.user.color }} />
                              {log.user.name}
                            </div>
                          </td>
                          <td>{ACTION_LABELS[log.action] ?? log.action}</td>
                          <td className="log-detail">
                            {desc.main ? (
                              <>
                                <span className="log-detail-main">{desc.main}</span>
                                {desc.sub && <span className="log-detail-sub">{desc.sub}</span>}
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
