"use client";

// หน้า "งานของฉัน" — 4 มุมมองของ WorkPlan table เดียว (CONTEXT.md) เรียงจากบนลงล่าง:
//   1. ปฏิทิน        → ปฏิทินเดือน + แผงแผนงานของวันที่เลือก
//   2. แผนงาน        → รายการแผนทั้งเดือน + สร้าง/แก้ไขแผน (แก้ได้เฉพาะแผนของตัวเองที่ยังไม่เริ่ม)
//   3. สิ่งที่ต้องทำ  → งานวันนี้ + งานค้าง พร้อมปุ่มเริ่ม/จบงาน (TodayBanner)
//   4. สรุปงาน       → นับ status ประจำวัน + รายการจัดกลุ่มตาม status (SummaryPanel)
// CEO เป็น view-only ตาม RBAC — ไม่มีปุ่ม mutation ใดๆ

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc, getToken, setToken } from "../../lib/trpc";
import { dateOnlyICT, planStatus, STATUS_META } from "../../lib/status";
import { PLAN_TYPE_META, PLAN_TYPE_OPTIONS, type PlanTypeKey } from "../../lib/plan-types";
import { TH_GREGORIAN, fmtDayMonth, fmtFullDate } from "../../lib/format";
import { AppShell } from "../../components/app-shell";
import { MonthCalendar } from "../../components/month-calendar";
import { TodayBanner } from "../../components/today-banner";
import { SummaryPanel } from "../../components/summary-panel";

// ข้อมูลแผนเท่าที่ form แก้ไขใช้ (หยิบจากแถวใน list)
type EditablePlan = {
  id: string;
  jobId: string;
  name: string;
  type?: "SOLAR" | "CCTV" | "NETWORK" | null;
  startDate: Date;
  endDate: Date;
};

export default function DashboardPage() {
  const router = useRouter();
  // กันอ่าน localStorage ตอน SSR: รอ mount ก่อนค่อยเช็ค token แล้วค่อยยิง query
  const [ready, setReady] = useState(false);

  // "วันนี้" ตามเวลาไทย (UTC midnight) — fix ค่าครั้งเดียวตลอดอายุหน้า กัน re-render แล้ววันขยับ
  const [today] = useState(() => dateOnlyICT(new Date()));
  const [view, setView] = useState({
    year: today.getUTCFullYear(),
    month: today.getUTCMonth() + 1,
  });
  const [selected, setSelected] = useState<Date>(today);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EditablePlan | null>(null);

  // ไม่มี token → เด้งไปหน้า login / มี token ค่อยยิง query
  useEffect(() => {
    if (!getToken()) router.replace("/");
    else setReady(true);
  }, [router]);

  const me = trpc.auth.me.useQuery(undefined, { enabled: ready, retry: false });
  const plans = trpc.workPlan.list.useQuery(view, { enabled: ready });

  // token หมดอายุ/ใช้ไม่ได้ → ล้าง token แล้วเด้งกลับหน้า login
  useEffect(() => {
    if (me.error) {
      setToken(null);
      router.replace("/");
    }
  }, [me.error, router]);

  if (!ready || me.isLoading) return <div className="center-note">กำลังโหลด…</div>;
  if (!me.data) return null; // ระหว่างเด้งกลับหน้า login

  const isCEO = me.data.role === "CEO";
  const myId = me.data.id;

  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(view.year, view.month - 1 + delta, 1));
    const next = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
    setView(next);
    // เดือนที่มีวันนี้ → เลือกวันนี้ / เดือนอื่น → เลือกวันที่ 1
    const hasToday =
      next.year === today.getUTCFullYear() && next.month === today.getUTCMonth() + 1;
    setSelected(hasToday ? today : d);
  };

  const monthTitle = new Date(Date.UTC(view.year, view.month - 1, 1)).toLocaleDateString(
    TH_GREGORIAN,
    { month: "long", year: "numeric", timeZone: "UTC" },
  );
  const selectedTitle = fmtFullDate(selected);

  // แผนที่ "ทับ" วันที่เลือก (แผนหลายวันนับทุกวันในช่วง)
  const dayPlans = (plans.data ?? []).filter(
    (p) => p.startDate.getTime() <= selected.getTime() && selected.getTime() <= p.endDate.getTime(),
  );

  // แถวแผน — หน้าตาเดียวกันทั้งแผงรายวันและรายการทั้งเดือน (ต่างกันแค่ปุ่มแก้ไข)
  const planRow = (plan: (typeof dayPlans)[number], withEdit: boolean) => {
    const meta = STATUS_META[planStatus(plan, today)];
    const typeMeta = plan.type ? PLAN_TYPE_META[plan.type] : null;
    // แก้ได้เฉพาะแผนของตัวเองที่ยังไม่กดเริ่ม (กติกาเดียวกับ workPlan.update ฝั่ง API)
    const editable = withEdit && !isCEO && plan.userId === myId && !plan.actStart;
    return (
      <div key={plan.id} className="plan-row">
        <span className="dot" style={{ background: plan.user.color }} />
        <div className="plan-main">
          <div className="plan-name">{plan.name}</div>
          <div className="plan-sub">
            {isCEO && <>{plan.user.name} · </>}
            {plan.jobId} · {fmtDayMonth(plan.startDate)} – {fmtDayMonth(plan.endDate)}
          </div>
          {(plan.delayStartReason || plan.delayEndReason) && (
            <div className="plan-delay">
              {plan.delayStartReason && <>เริ่มช้า: {plan.delayStartReason} </>}
              {plan.delayEndReason && <>จบช้า: {plan.delayEndReason}</>}
            </div>
          )}
        </div>
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
        {editable && (
          <button className="btn-ghost btn-sm" onClick={() => setEditing(plan)}>
            แก้ไข
          </button>
        )}
      </div>
    );
  };

  return (
    <AppShell
      title={isCEO ? "แผนงานทีม" : "งานของฉัน"}
      user={me.data}
      onLogout={() => {
        setToken(null);
        router.replace("/");
      }}
    >
      {/* ---------- 1) ปฏิทิน ---------- */}
      <div className="month-nav">
        <button onClick={() => shiftMonth(-1)} aria-label="เดือนก่อนหน้า">
          «
        </button>
        <h2>{monthTitle}</h2>
        <button onClick={() => shiftMonth(1)} aria-label="เดือนถัดไป">
          »
        </button>
      </div>

      {plans.error && (
        <p className="form-error">โหลดแผนงานไม่สำเร็จ: {plans.error.message}</p>
      )}

      <MonthCalendar
        year={view.year}
        month={view.month}
        plans={plans.data ?? []}
        today={today}
        selected={selected}
        onSelect={setSelected}
        showOwner={isCEO}
      />

      <section className="day-panel">
        <div className="panel-head">
          <h2>แผนงาน — {selectedTitle}</h2>
        </div>

        {dayPlans.length === 0 ? (
          <p className="empty-note">
            {selected.getTime() === today.getTime()
              ? "ยังไม่มีแผนงานสำหรับวันนี้"
              : "ไม่มีแผนงานในวันที่เลือก"}
          </p>
        ) : (
          <div className="plan-list">{dayPlans.map((plan) => planRow(plan, false))}</div>
        )}
      </section>

      {/* ---------- 2) แผนงาน: รายการทั้งเดือน + สร้าง/แก้ไข ---------- */}
      <section className="day-panel">
        <div className="panel-head">
          <h2>แผนงานเดือน{monthTitle}</h2>
          {!isCEO && (
            <button className="btn-primary" onClick={() => setCreating(true)}>
              + เพิ่มแผน
            </button>
          )}
        </div>

        {plans.isLoading ? (
          <p className="empty-note">กำลังโหลด…</p>
        ) : (plans.data ?? []).length === 0 ? (
          <p className="empty-note">ยังไม่มีแผนงานในเดือนนี้</p>
        ) : (
          <div className="plan-list">{(plans.data ?? []).map((plan) => planRow(plan, true))}</div>
        )}
      </section>

      {/* ---------- 3) สิ่งที่ต้องทำ ---------- */}
      <TodayBanner today={today} isCEO={isCEO} />

      {/* ---------- 4) สรุปงาน ---------- */}
      <SummaryPanel today={today} isCEO={isCEO} />

      {creating && <PlanModal defaultDate={selected} onClose={() => setCreating(false)} />}
      {editing && <PlanModal plan={editing} onClose={() => setEditing(null)} />}
    </AppShell>
  );
}

// ---------- modal สร้าง/แก้ไขแผน (Engineer เท่านั้น) ----------
// โหมดแก้ไข: ส่งเฉพาะ field ที่เปลี่ยนจริง — ตามกติกา "อย่า write field ที่ user ไม่ได้แก้" (AGENT.md)

function PlanModal({
  defaultDate,
  plan,
  onClose,
}: {
  defaultDate?: Date;
  plan?: EditablePlan;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const toInput = (d: Date) => d.toISOString().slice(0, 10); // UTC midnight → "YYYY-MM-DD" ตรงวันเสมอ

  const [name, setName] = useState(plan?.name ?? "");
  const [typeV, setTypeV] = useState<"" | PlanTypeKey>(plan?.type ?? "");
  const [start, setStart] = useState(toInput(plan?.startDate ?? defaultDate ?? dateOnlyICT(new Date())));
  const [end, setEnd] = useState(toInput(plan?.endDate ?? defaultDate ?? dateOnlyICT(new Date())));

  // สำเร็จ → refresh ทุก query ของ workPlan (ปฏิทิน/รายการ/สิ่งที่ต้องทำ/สรุป ขยับตามกัน)
  const done = {
    onSuccess: async () => {
      await utils.workPlan.invalidate();
      onClose();
    },
  };
  const create = trpc.workPlan.create.useMutation(done);
  const update = trpc.workPlan.update.useMutation(done);

  const pending = create.isPending || update.isPending;
  const error = create.error ?? update.error;

  const submit = () => {
    // ส่งเป็น UTC midnight ของวันที่กรอก — ฝั่ง API normalize ด้วย dateOnlyICT อีกชั้น
    if (!plan) {
      create.mutate({
        name: name.trim(),
        ...(typeV ? { type: typeV } : {}),
        startDate: new Date(`${start}T00:00:00Z`),
        endDate: new Date(`${end}T00:00:00Z`),
      });
      return;
    }
    update.mutate({
      id: plan.id,
      ...(name.trim() !== plan.name ? { name: name.trim() } : {}),
      ...(typeV !== (plan.type ?? "") ? { type: typeV || undefined } : {}),
      ...(start !== toInput(plan.startDate) ? { startDate: new Date(`${start}T00:00:00Z`) } : {}),
      ...(end !== toInput(plan.endDate) ? { endDate: new Date(`${end}T00:00:00Z`) } : {}),
    });
  };

  return (
    <div className="overlay" onClick={onClose}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h3>{plan ? "แก้ไขแผนงาน" : "เพิ่มแผนงาน"}</h3>

        <label className="field">
          ชื่อแผนงาน
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            autoFocus
          />
        </label>

        {/* Job ID ระบบรันเลขให้อัตโนมัติตอนบันทึก — โหมดแก้ไขโชว์อย่างเดียว แก้ไม่ได้ */}
        {plan && (
          <label className="field">
            Job ID (อัตโนมัติ)
            <input value={plan.jobId} disabled />
          </label>
        )}

        <label className="field">
          ประเภทงาน
          <select value={typeV} onChange={(e) => setTypeV(e.target.value as "" | PlanTypeKey)}>
            <option value="">— ไม่ระบุ —</option>
            {PLAN_TYPE_OPTIONS.map((key) => (
              <option key={key} value={key}>
                {PLAN_TYPE_META[key].label}
              </option>
            ))}
          </select>
        </label>

        <div className="field-row">
          <label className="field">
            วันเริ่ม
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
          </label>
          <label className="field">
            วันจบ
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              required
              min={start}
            />
          </label>
        </div>

        {error && <p className="form-error">{error.message}</p>}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "กำลังบันทึก…" : plan ? "บันทึกการแก้ไข" : "บันทึกแผน"}
          </button>
        </div>
      </form>
    </div>
  );
}
