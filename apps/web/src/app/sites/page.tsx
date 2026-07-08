"use client";

// หน้า "ไซต์งาน" — มุมมองแผนงานรายเดือนแบบกรองตามประเภทงาน (Solar / CCTV / Network)
// ปกติดึงจาก workPlan.list (window รายเดือน) เมื่อพิมพ์ค้นหา ≥ 2 ตัวจะสลับไป workPlan.search
//   (ค้น name + jobId ข้ามเดือน) type filter ใช้ร่วมกับทั้งสองโหมด
//   - CEO เห็นทุกคน (RBAC เดิม) / Engineer เห็นเฉพาะของตัวเอง (ล็อกฝั่ง API)
//   - filter-only page: ไม่มีปุ่ม mutation ใดๆ (สร้าง/แก้ทำที่ /dashboard)
// chip ประเภทใช้ PLAN_TYPE_META — วางคนละตำแหน่งกับ chip status กันสับสนสี

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc, getToken, setToken } from "../../lib/trpc";
import { dateOnlyICT, planStatus, STATUS_META } from "../../lib/status";
import { PLAN_TYPE_META, PLAN_TYPE_OPTIONS, type PlanTypeKey } from "../../lib/plan-types";
import { TH_GREGORIAN, fmtDayMonth } from "../../lib/format";
import { AppShell } from "../../components/app-shell";

type TypeFilter = "ALL" | PlanTypeKey;

export default function SitesPage() {
  const router = useRouter();
  // กันอ่าน localStorage ตอน SSR: รอ mount ก่อนค่อยเช็ค token แล้วค่อยยิง query (mirror dashboard)
  const [ready, setReady] = useState(false);

  // "วันนี้" ตามเวลาไทย (UTC midnight) — fix ค่าครั้งเดียวตลอดอายุหน้า
  const [today] = useState(() => dateOnlyICT(new Date()));
  const [view, setView] = useState({
    year: today.getUTCFullYear(),
    month: today.getUTCMonth() + 1,
  });
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");

  // ไม่มี token → เด้งไปหน้า login / มี token ค่อยยิง query (mirror dashboard)
  useEffect(() => {
    if (!getToken()) router.replace("/");
    else setReady(true);
  }, [router]);

  // Debounce 250ms: กันยิง query ทุก keystroke — trim ก่อนเก็บ qDebounced
  useEffect(() => {
    const handle = setTimeout(() => setQDebounced(q.trim()), 250);
    return () => clearTimeout(handle);
  }, [q]);

  const searchActive = qDebounced.length >= 2;
  // typeFilter → type param ใช้ร่วมกับทั้ง list (เดิม) และ search
  const typeParam = typeFilter === "ALL" ? undefined : typeFilter;

  const me = trpc.auth.me.useQuery(undefined, { enabled: ready, retry: false });
  const plans = trpc.workPlan.list.useQuery(
    { ...view, type: typeParam },
    { enabled: ready },
  );
  const search = trpc.workPlan.search.useQuery(
    { q: qDebounced, type: typeParam },
    { enabled: ready && searchActive, placeholderData: (prev) => prev },
  );

  // token หมดอายุ/ใช้ไม่ได้ → ล้าง token แล้วเด้งกลับหน้า login (mirror dashboard)
  useEffect(() => {
    if (me.error) {
      setToken(null);
      router.replace("/");
    }
  }, [me.error, router]);

  if (!ready || me.isLoading) return <div className="center-note">กำลังโหลด…</div>;
  if (!me.data) return null; // ระหว่างเด้งกลับหน้า login

  const isCEO = me.data.role === "CEO";

  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(view.year, view.month - 1 + delta, 1));
    setView({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  };

  const monthTitle = new Date(Date.UTC(view.year, view.month - 1, 1)).toLocaleDateString(
    TH_GREGORIAN,
    { month: "long", year: "numeric", timeZone: "UTC" },
  );

  // query ฝั่งที่กำลัง render + array ผลลัพธ์ — search ตอนค้น / list ตอนปกติ
  const activeQuery = searchActive ? search : plans;
  const rows = searchActive ? (search.data ?? []) : (plans.data ?? []);
  const typeLabel = typeFilter !== "ALL" ? PLAN_TYPE_META[typeFilter].label : null;

  // ดึง plan-row render ออกมาเป็น helper ใช้ซ้ำกับทั้ง list และ search (shape เดียวกัน)
  const renderPlanRow = (plan: NonNullable<(typeof plans)["data"]>[number]) => {
    const meta = STATUS_META[planStatus(plan, today)];
    const typeMeta = plan.type ? PLAN_TYPE_META[plan.type] : null;
    return (
      <div key={plan.id} className="plan-row">
        <span className="dot" style={{ background: plan.user.color }} />
        <div className="plan-main">
          <div className="plan-name">{plan.name}</div>
          <div className="plan-sub">
            {isCEO && <>{plan.user.name} · </>}
            {plan.jobId} · {fmtDayMonth(plan.startDate)} – {fmtDayMonth(plan.endDate)}
          </div>
        </div>
        {/* chip ประเภท (ซ้าย, สีโทนนุ่ม) ก่อน chip status (ขวา) วางคนละสีกันสับสน */}
        <div className="plan-chips">
          {typeMeta && (
            <span className="chip" style={{ background: typeMeta.bg, color: typeMeta.fg }}>
              {typeMeta.label}
            </span>
          )}
          <span className="chip" style={{ background: meta.bg, color: meta.fg }}>
            {meta.label}
          </span>
        </div>
      </div>
    );
  };

  return (
    <AppShell
      title={isCEO ? "ไซต์งาน (ทีม)" : "ไซต์งาน"}
      user={me.data}
      onLogout={() => {
        setToken(null);
        router.replace("/");
      }}
    >
      {/* แถบ filter ประเภท + เลื่อนเดือน + ช่องค้นหา */}
      <div className="sites-toolbar">
        <div className="type-filter">
          <button
            className={typeFilter === "ALL" ? "type-btn active" : "type-btn"}
            onClick={() => setTypeFilter("ALL")}
          >
            ทั้งหมด
          </button>
          {PLAN_TYPE_OPTIONS.map((key) => {
            const meta = PLAN_TYPE_META[key];
            return (
              <button
                key={key}
                className={typeFilter === key ? "type-btn active" : "type-btn"}
                style={
                  typeFilter === key ? { background: meta.bg, color: meta.fg, borderColor: meta.fg } : undefined
                }
                onClick={() => setTypeFilter(key)}
              >
                {meta.label}
              </button>
            );
          })}
        </div>

        {/* ค้นหาข้ามเดือน — เมื่อ active ให้ล็อคเลื่อนเดือน (ผลค้นไม่ผูกกับเดือนที่เลือก) กัน user สับสน */}
        <div className={"month-nav" + (searchActive ? " disabled" : "")}>
          <button
            onClick={() => shiftMonth(-1)}
            aria-label="เดือนก่อนหน้า"
            disabled={searchActive}
            aria-disabled={searchActive || undefined}
          >
            «
          </button>
          <h2>{monthTitle}</h2>
          <button
            onClick={() => shiftMonth(1)}
            aria-label="เดือนถัดไป"
            disabled={searchActive}
            aria-disabled={searchActive || undefined}
          >
            »
          </button>
        </div>

        <div className="search-row">
          <input
            className="search-input"
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นชื่อแผนหรือ Job ID เช่น JOB-005"
            aria-label="ค้นหาแผนงาน"
          />
          {q && (
            <button
              className="search-clear"
              type="button"
              onClick={() => setQ("")}
              aria-label="ล้างคำค้นหา"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {activeQuery.error && (
        <p className="form-error">
          {searchActive ? "ค้นหาไม่สำเร็จ" : "โหลดแผนงานไม่สำเร็จ"}: {activeQuery.error.message}
        </p>
      )}

      <section className="day-panel">
        <div className="panel-head">
          <h2>
            {searchActive
              ? `ผลการค้นหา "${qDebounced}"${typeLabel ? ` (${typeLabel})` : ""}`
              : `แผนงาน${typeFilter !== "ALL" ? ` ${PLAN_TYPE_META[typeFilter].label}` : ""} เดือน${monthTitle}`}
          </h2>
        </div>

        {activeQuery.isLoading ? (
          <p className="empty-note">{searchActive ? "กำลังค้นหา…" : "กำลังโหลด…"}</p>
        ) : rows.length === 0 ? (
          <p className="empty-note">
            {searchActive
              ? `ไม่พบแผนงานที่ตรงกับ "${qDebounced}"`
              : "ไม่มีแผนงานในเดือนนี้สำหรับประเภทที่เลือก"}
          </p>
        ) : (
          <div className="plan-list">{rows.map((plan) => renderPlanRow(plan))}</div>
        )}
      </section>
    </AppShell>
  );
}
