"use client";

// หน้า "ประวัติการใช้งาน" (audit log) — เปิดให้ทุก role
// โครงเดียวกับ dashboard/page.tsx: รอ mount → auth.me → AppShell
// scope อยู่ที่ API: engineer เห็นเฉพาะ log ของตัวเอง / CEO เห็นทุกคน
// CEO ได้เพิ่ม: แถบสรุป "วันนี้" (กดกรองได้) + dropdown กรองรายคน
// โหมดปกติซ่อน ui.click (click telemetry กลบเหตุการณ์สำคัญ) — เลือกประเภท UI_CLICK เพื่อดูเฉพาะคลิก

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc, getToken, setToken } from "../../lib/trpc";
import { fmtTime, fmtFullDate, parseDMY } from "../../lib/format";
import { dateOnlyICT } from "../../lib/status";
import { describeLog, isPlaceholderSiteName } from "../../lib/log-detail";
import { groupLogsByDay } from "../../lib/log-group";
import { LOG_ACTION_BY_CODE, DEFAULT_EXCLUDED_ACTIONS } from "../../lib/log-actions";
import { AppShell } from "../../components/app-shell";
import { DatePicker } from "../../components/date-picker";

// action ที่ต้องสะดุดตาในตาราง — เหตุการณ์ทำลายข้อมูล/สัญญาณ security ห้ามจมหายไปกับแถวปกติ
const DANGER_ACTIONS = new Set(["workPlan.delete", "site.delete", "LOGIN_FAILED"]);

export default function LogsPage() {
  const router = useRouter();
  // กันอ่าน localStorage ตอน SSR: รอ mount ก่อนค่อยยิง query (pattern เดียวกับ dashboard)
  const [ready, setReady] = useState(false);
  // "วันนี้" ตามเวลาไทย — fix ครั้งเดียว ใช้ตัดสินหัวข้อ "วันนี้/เมื่อวาน" + ขอบเวลาของแถบสรุป
  const [today] = useState(() => dateOnlyICT(new Date()));
  // filter ช่วงวันที่ — เลือกจากปฏิทิน popover (DatePicker), ค่ายังเป็น dd/mm/yyyy
  // default = วันนี้ทั้งสองช่อง (ตรงกับแถบสรุปวันนี้) ผู้ใช้ล้างตัวกรองได้ = กลับเป็นทั้งหมด
  const [fromText, setFromText] = useState(fmtFullDate(today));
  const [toText, setToText] = useState(fmtFullDate(today));
  // filter ประเภทการกระทำ — เก็บเป็นรหัสมาตรฐาน ("" = ทั้งหมด) แล้วแปลงเป็นชุด action จริงตอนยิง query
  // ไม่มี dropdown ให้เลือกเองแล้ว — ตั้งค่าผ่านการกด tile ในแถบสรุป (filterTodayBy) ทางเดียว
  const [actionCode, setActionCode] = useState("");
  // filter รายคน (โชว์เฉพาะ CEO — engineer ถูก API บังคับเป็นของตัวเองอยู่แล้ว) "" = ทุกคน
  const [userIdText, setUserIdText] = useState("");
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
  // รหัสมาตรฐาน → ชุด action จริงใน DB (ดู lib/log-actions.ts) — ไม่เลือก = undefined = ไม่กรอง
  const actionFilter = actionCode ? LOG_ACTION_BY_CODE[actionCode] : undefined;
  const filterActive = !!(fromText || toText || actionCode || userIdText);

  const me = trpc.auth.me.useQuery(undefined, { enabled: ready, retry: false });
  const isCeo = me.data?.role === "CEO";

  const logs = trpc.log.list.useQuery(
    {
      limit: 100,
      from: fromInstant,
      to: toExclusive,
      actions: actionFilter?.match,
      // ไม่เลือกประเภท = ซ่อน click telemetry (โหมดปกติ) / เลือกแล้ว = ตามประเภทนั้นล้วนๆ
      excludeActions: actionFilter ? undefined : DEFAULT_EXCLUDED_ACTIONS,
      userId: userIdText ? Number(userIdText) : undefined,
    },
    { enabled: ready && !!me.data },
  );

  // แถบสรุป "วันนี้" + รายชื่อคนสำหรับ dropdown — เฉพาะ CEO (API เป็น ceoProcedure)
  // ขอบวันคำนวณแบบเดียวกับ filter: today เป็น UTC-midnight ของวันไทย → instant ต้นวันไทยจริงคือ +07:00
  const todayISO = today.toISOString().slice(0, 10);
  const todayStart = new Date(`${todayISO}T00:00:00+07:00`);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const summary = trpc.log.summary.useQuery(
    { from: todayStart, to: todayEnd },
    { enabled: ready && isCeo },
  );
  const users = trpc.log.users.useQuery(undefined, { enabled: ready && isCeo });

  // token หมดอายุ/ใช้ไม่ได้ → ล้าง token แล้วเด้งกลับหน้า login
  useEffect(() => {
    if (me.error) {
      setToken(null);
      router.replace("/");
    }
  }, [me.error, router]);

  if (!ready || me.isLoading) return <div className="center-note">กำลังโหลด…</div>;
  if (!me.data) return null;

  // กดตัวเลขในแถบสรุป = กรองตารางเป็น "ประเภทนั้น + วันนี้" ทันที (ล้าง filter รายคนกันงง)
  const filterTodayBy = (code: string) => {
    const t = fmtFullDate(today); // "14/07/2026" — รูปเดียวกับที่ช่องกรองรับ
    setFromText(t);
    setToText(t);
    setActionCode(code);
    setUserIdText("");
  };

  const roster = summary.data?.users ?? [];
  const notLoggedIn = roster.filter((u) => !u.loggedIn);

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
          <h2>{filterActive ? "ประวัติตามตัวกรอง" : "การกระทำล่าสุด"}</h2>
        </div>

        {/* แถบสรุปวันนี้ (CEO) — ตอบ "ทีมทำงานกันอยู่ไหม" ก่อนไล่อ่านรายแถว / กดตัวเลขเพื่อกรอง */}
        {isCeo && summary.data && (
          <>
            <div className="log-summary">
              <button
                type="button"
                className="log-summary-tile"
                onClick={() => filterTodayBy("LOGIN_SUCCESS")}
              >
                <span className="log-summary-num">
                  {roster.length - notLoggedIn.length}/{roster.length}
                </span>
                <span className="log-summary-lbl">เข้าระบบวันนี้ (คน)</span>
              </button>
              <button
                type="button"
                className="log-summary-tile"
                onClick={() => filterTodayBy("WORKPLAN_CREATED")}
              >
                <span className="log-summary-num">{summary.data.planCreated}</span>
                <span className="log-summary-lbl">สร้างแผน</span>
              </button>
              <button
                type="button"
                className="log-summary-tile"
                onClick={() => filterTodayBy("WORKPLAN_UPDATED")}
              >
                <span className="log-summary-num">{summary.data.planUpdated}</span>
                <span className="log-summary-lbl">แก้ไขแผน</span>
              </button>
              <button
                type="button"
                className="log-summary-tile"
                onClick={() => filterTodayBy("JOB_STATUS_CHANGED")}
              >
                <span className="log-summary-num">{summary.data.statusChanged}</span>
                <span className="log-summary-lbl">เริ่ม/จบงาน</span>
              </button>
              <button
                type="button"
                className={summary.data.planDeleted > 0 ? "log-summary-tile danger" : "log-summary-tile"}
                onClick={() => filterTodayBy("WORKPLAN_DELETED")}
              >
                <span className="log-summary-num">{summary.data.planDeleted}</span>
                <span className="log-summary-lbl">ลบแผน</span>
              </button>
              <button
                type="button"
                className={summary.data.loginFailed > 0 ? "log-summary-tile danger" : "log-summary-tile"}
                onClick={() => filterTodayBy("LOGIN_FAILED")}
              >
                <span className="log-summary-num">{summary.data.loginFailed}</span>
                <span className="log-summary-lbl">login ไม่สำเร็จ</span>
              </button>
            </div>
            {/* ใครยังไม่เข้าระบบวันนี้ — ข้อมูลที่สำคัญพอๆ กับใครเข้า แต่ไม่มีทางเห็นจากตาราง log */}
            {notLoggedIn.length > 0 && (
              <p className="log-summary-note">
                ยังไม่เข้าระบบวันนี้:
                {notLoggedIn.map((u) => (
                  <span key={u.id} className="log-summary-name">
                    <span className="dot" style={{ background: u.color }} />
                    {u.name}
                  </span>
                ))}
              </p>
            )}
          </>
        )}

        {/* filter ช่วงวันที่ — พิมพ์ dd/mm/yyyy เอง (เลือกวันเดียวได้โดยตั้ง "จาก" = "ถึง") + รายคน (CEO)
            การกรองตามประเภทการกระทำทำผ่านการกด tile ในแถบสรุปแทน (ไม่มี dropdown ประเภทแล้ว) */}
        <div className="log-filter">
          {isCeo && (
            <label className="log-filter-field">
              ผู้ใช้
              <select
                className="log-select"
                value={userIdText}
                onChange={(e) => setUserIdText(e.target.value)}
              >
                <option value="">ทุกคน</option>
                {(users.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="log-filter-field">
            จาก
            <DatePicker
              value={fromText}
              onChange={setFromText}
              placeholder="dd/mm/yyyy"
              invalid={!!(fromText && !fromISO)}
              aria-label="จากวันที่"
            />
          </label>
          <label className="log-filter-field">
            ถึง
            <DatePicker
              value={toText}
              onChange={setToText}
              placeholder="dd/mm/yyyy"
              min={fromISO ? fromText : undefined}
              invalid={!!(toText && !toISO)}
              aria-label="ถึงวันที่"
            />
          </label>
          {filterActive && (
            <button
              type="button"
              className="type-btn"
              onClick={() => {
                setFromText("");
                setToText("");
                setActionCode("");
                setUserIdText("");
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
            {filterActive ? "ไม่พบประวัติตามตัวกรองที่เลือก" : "ยังไม่มีประวัติการใช้งาน"}
          </p>
        ) : (
          <div className="log-table-wrap">
            <table className="log-table">
              <thead>
                <tr>
                  <th>เวลา</th>
                  <th>ผู้ใช้</th>
                  <th>รายละเอียด</th>
                </tr>
              </thead>
              <tbody>
                {groupLogsByDay(logs.data ?? [], today).map((group) => (
                  <Fragment key={group.key}>
                    <tr className="log-day-row">
                      <td colSpan={3}>{group.label}</td>
                    </tr>
                    {group.items.map((log) => {
                      const desc = describeLog(log);
                      return (
                        <tr
                          key={log.id}
                          className={DANGER_ACTIONS.has(log.action) ? "log-row-danger" : undefined}
                        >
                          <td className="log-time">{fmtTime(log.createdAt)}</td>
                          <td>
                            <div className="log-user">
                              <span className="dot" style={{ background: log.user.color }} />
                              {log.user.name}
                            </div>
                          </td>
                          <td className="log-detail">
                            {/* describeLog การันตี main ไม่ว่าง (ไม่รู้จัก action = โชว์ path ดิบ) */}
                            <span className="log-detail-main">{desc.main}</span>
                            {desc.sub && <span className="log-detail-sub">{desc.sub}</span>}
                            {/* drill-down: API resolve targetId → แผน/ไซต์มาให้แล้ว (null = record ถูกลบ)
                                ไซต์ที่ชื่อยังเป็น placeholder "ไซต์ #N" (backfill) ไม่มีความหมาย — ข้ามไม่โชว์ */}
                            {log.target && (
                              <Link className="log-detail-link" href={`/sites/${log.target.siteId}`}>
                                {[
                                  log.target.planName ? `แผน “${log.target.planName}”` : "",
                                  isPlaceholderSiteName(log.target.siteName)
                                    ? ""
                                    : `ไซต์ ${log.target.siteName}`,
                                ]
                                  .filter(Boolean)
                                  .join(" · ") || "ดูไซต์"}{" "}
                                →
                              </Link>
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
