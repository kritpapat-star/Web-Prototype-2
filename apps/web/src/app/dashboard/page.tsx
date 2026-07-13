"use client";

// หน้า "งานของฉัน" — 4 มุมมองของ WorkPlan table เดียว (CONTEXT.md) เรียงจากบนลงล่าง:
//   1. ปฏิทิน        → ปฏิทินเดือน + แผงแผนงานของวันที่เลือก
//   2. แผนงาน        → รายการแผนทั้งเดือน + สร้าง/แก้ไข/ลบแผน (ทำได้เฉพาะแผนของตัวเองที่ยังไม่เริ่ม)
//   3. สิ่งที่ต้องทำ  → งานวันนี้ + งานค้าง พร้อมปุ่มเริ่ม/จบงาน (TodayBanner)
//   4. สรุปงาน       → นับ status ประจำวัน + รายการจัดกลุ่มตาม status (SummaryPanel)
// CEO เป็น view-only ตาม RBAC — ไม่มีปุ่ม mutation ใดๆ

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc, getToken, setToken } from "../../lib/trpc";
import { dateOnlyICT, planStatus, sortByStatusPriority, STATUS_META } from "../../lib/status";
import { typeColor } from "../../lib/plan-types";
import { TH_GREGORIAN, fmtDayMonth, fmtFullDate, parseDMY } from "../../lib/format";
import { AppShell } from "../../components/app-shell";
import { MonthCalendar } from "../../components/month-calendar";
import { TodayBanner } from "../../components/today-banner";
import { SummaryPanel } from "../../components/summary-panel";

// ข้อมูลแผนเท่าที่ form แก้ไขใช้ (หยิบจากแถวใน list)
type EditablePlan = {
  id: number;
  siteId: number;
  name: string;
  type?: string | null; // types.id (เลขลำดับ เช่น "1")
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
  const types = trpc.type.list.useQuery(undefined, { enabled: ready });

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

  // ทั้งแผงรายวันและรายการทั้งเดือน เรียงตามความเร่งด่วนของ status ก่อน (ด่วนสุดขึ้นบน)
  // status เท่ากันคงลำดับ startDate asc จาก API
  const monthPlans = sortByStatusPriority(plans.data ?? [], today);

  // แผนที่ "ทับ" วันที่เลือก (แผนหลายวันนับทุกวันในช่วง)
  const dayPlans = monthPlans.filter(
    (p) => p.startDate.getTime() <= selected.getTime() && selected.getTime() <= p.endDate.getTime(),
  );

  // ชื่อประเภทจาก table types (id → name) — โหลดไม่ทัน/id ไม่รู้จัก → โชว์ id ไปก่อน
  const typeNameById = new Map((types.data ?? []).map((t) => [t.id, t.name]));

  // แถวแผน — หน้าตาเดียวกันทั้งแผงรายวันและรายการทั้งเดือน (ต่างกันแค่ปุ่มแก้ไข)
  const planRow = (plan: (typeof dayPlans)[number], withEdit: boolean) => {
    const meta = STATUS_META[planStatus(plan, today)];
    const typeMeta = plan.type
      ? { ...typeColor(plan.type), label: typeNameById.get(plan.type) ?? plan.type }
      : null;
    // แก้ได้เฉพาะแผนของตัวเองที่ยังไม่กดเริ่ม (กติกาเดียวกับ workPlan.update ฝั่ง API)
    const editable = withEdit && !isCEO && plan.userId === myId && !plan.actStart;
    return (
      <div key={plan.id} className="plan-row">
        <span className="dot" style={{ background: plan.user.color }} />
        <div className="plan-main">
          <div className="plan-name">{plan.name}</div>
          <div className="plan-sub">
            {isCEO && <>{plan.user.name} · </>}
            ไซต์ #{plan.siteId} · {fmtDayMonth(plan.startDate)} – {fmtDayMonth(plan.endDate)}
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
        ) : monthPlans.length === 0 ? (
          <p className="empty-note">ยังไม่มีแผนงานในเดือนนี้</p>
        ) : (
          <div className="plan-list">{monthPlans.map((plan) => planRow(plan, true))}</div>
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
// ไซต์งานเลือกจาก dropdown (FK → sites) — ล็อกจนกว่าจะเลือกประเภทงาน แล้วกรองตาม Site.types
// → แผนใหม่จึงต้องมีประเภทงานเสมอ (แผนเก่าที่ type ว่างยังแก้ field อื่นได้โดยไม่บังคับเติม)

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

  // ตัวเลือกประเภทงาน + ไซต์งาน (react-query dedupe กับ query เดียวกันของหน้าอื่น)
  const types = trpc.type.list.useQuery();
  const sites = trpc.site.list.useQuery();

  const [name, setName] = useState(plan?.name ?? "");
  // ลบเป็นสองจังหวะ: กดครั้งแรกเปลี่ยนปุ่มเป็น "ยืนยันลบ" — กันมือลั่นโดยไม่ต้องมี dialog ซ้อน modal
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [typeV, setTypeV] = useState<string>(plan?.type ?? ""); // "" = ยังไม่เลือก / อื่นๆ = types.id
  const [siteIdV, setSiteIdV] = useState<string>(plan ? String(plan.siteId) : ""); // "" = ยังไม่เลือก
  // ช่องวันที่พิมพ์เป็น dd/mm/yyyy เอง (คุมช่องเอง เพราะ <input type=date> เนทีฟ
  // แสดงผลตาม locale เครื่อง บังคับ dd/mm/yyyy ไม่ได้ — pattern เดียวกับหน้า log)
  const [start, setStart] = useState(fmtFullDate(plan?.startDate ?? defaultDate ?? dateOnlyICT(new Date())));
  const [end, setEnd] = useState(fmtFullDate(plan?.endDate ?? defaultDate ?? dateOnlyICT(new Date())));

  // dd/mm/yyyy → ISO (null = ยังพิมพ์ไม่ครบ/ไม่ใช่วันจริง) — ใช้ทั้งเช็คก่อน submit และขอบแดงเตือน
  const startISO = parseDMY(start);
  const endISO = parseDMY(end);
  // วันจบก่อนวันเริ่ม — เดิม input type=date กันด้วย min ตอนนี้เช็คเอง (ISO เทียบ string ได้ตรงลำดับวัน)
  const rangeInvalid = !!(startISO && endISO && endISO < startISO);

  // ตัวเลือกไซต์: กรองตามประเภทที่เลือก (Site.types) — ยังไม่เลือกประเภท = ล็อก dropdown
  // โหมดแก้ไขแผนเก่าที่ type ว่าง: โชว์ไซต์ปัจจุบันตัวเดียวไว้ให้เห็น (เปลี่ยนไซต์ได้ต่อเมื่อเลือกประเภทก่อน)
  const siteOptions = (sites.data ?? []).filter((s) =>
    typeV ? s.types.some((t) => t.id === typeV) : plan && s.id === plan.siteId,
  );

  // เปลี่ยนประเภท → ไซต์ที่เลือกอยู่ไม่รองรับประเภทใหม่ = ล้างให้เลือกใหม่จากรายการที่กรองแล้ว
  const changeType = (v: string) => {
    setTypeV(v);
    const cur = (sites.data ?? []).find((s) => String(s.id) === siteIdV);
    if (!cur || !cur.types.some((t) => t.id === v)) setSiteIdV("");
  };

  // สำเร็จ → refresh ทุก query ของ workPlan (ปฏิทิน/รายการ/สิ่งที่ต้องทำ/สรุป ขยับตามกัน)
  const done = {
    onSuccess: async () => {
      await utils.workPlan.invalidate();
      onClose();
    },
  };
  const create = trpc.workPlan.create.useMutation(done);
  const update = trpc.workPlan.update.useMutation(done);
  const del = trpc.workPlan.delete.useMutation(done);

  const pending = create.isPending || update.isPending || del.isPending;
  const error = create.error ?? update.error ?? del.error;

  const submit = () => {
    // วันที่ยังไม่ครบรูป/ไม่ใช่วันจริง/จบก่อนเริ่ม → ไม่ส่ง (ขอบแดง + hint บอกอยู่ที่ช่องแล้ว)
    if (!startISO || !endISO || rangeInvalid) return;
    // ส่งเป็น UTC midnight ของวันที่กรอก — ฝั่ง API normalize ด้วย dateOnlyICT อีกชั้น
    if (!plan) {
      create.mutate({
        name: name.trim(),
        type: typeV, // บังคับเลือกที่ form แล้ว (select required)
        siteId: Number(siteIdV),
        startDate: new Date(`${startISO}T00:00:00Z`),
        endDate: new Date(`${endISO}T00:00:00Z`),
      });
      return;
    }
    update.mutate({
      id: plan.id,
      ...(name.trim() !== plan.name ? { name: name.trim() } : {}),
      ...(typeV !== (plan.type ?? "") ? { type: typeV || undefined } : {}),
      ...(siteIdV !== String(plan.siteId) ? { siteId: Number(siteIdV) } : {}),
      ...(start !== fmtFullDate(plan.startDate) ? { startDate: new Date(`${startISO}T00:00:00Z`) } : {}),
      ...(end !== fmtFullDate(plan.endDate) ? { endDate: new Date(`${endISO}T00:00:00Z`) } : {}),
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

        <label className="field">
          ประเภทงาน
          {/* required เฉพาะตอนสร้าง — แผนเก่าที่ type ว่างต้องยังแก้ field อื่นได้ (ค่า "" ต้องผ่าน) */}
          <select value={typeV} onChange={(e) => changeType(e.target.value)} required={!plan}>
            <option value="" disabled>
              — เลือกประเภทงาน —
            </option>
            {(types.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        {/* ไซต์งาน: ล็อกจนกว่าจะเลือกประเภท แล้วกรองตาม Site.types — disabled แล้ว required ไม่ทำงาน
            แต่ตอนสร้าง select ประเภทเป็น required อยู่แล้ว เลยไม่มีทางหลุดมา submit ทั้งที่ไซต์ว่าง */}
        <label className="field">
          ไซต์งาน
          <select
            value={siteIdV}
            onChange={(e) => setSiteIdV(e.target.value)}
            required
            disabled={!typeV}
          >
            <option value="">{typeV ? "— เลือกไซต์งาน —" : "เลือกประเภทงานก่อน"}</option>
            {siteOptions.map((s) => (
              <option key={s.id} value={String(s.id)}>
                #{s.id} {s.name}
              </option>
            ))}
          </select>
          {typeV && !sites.isLoading && siteOptions.length === 0 && (
            <span className="field-hint">
              ยังไม่มีไซต์ของประเภทนี้ — สร้างได้จากปุ่ม &quot;+ ไซต์งาน&quot; ในหน้าไซต์งาน
            </span>
          )}
        </label>

        <div className="field-row">
          <label className="field">
            วันเริ่ม
            <input
              type="text"
              inputMode="numeric"
              placeholder="dd/mm/yyyy"
              maxLength={10}
              className={start && !startISO ? "invalid" : undefined}
              value={start}
              onChange={(e) => setStart(e.target.value)}
              required
            />
          </label>
          <label className="field">
            วันจบ
            <input
              type="text"
              inputMode="numeric"
              placeholder="dd/mm/yyyy"
              maxLength={10}
              className={end && (!endISO || rangeInvalid) ? "invalid" : undefined}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              required
            />
            {rangeInvalid && <span className="field-hint">วันจบต้องไม่ก่อนวันเริ่ม</span>}
          </label>
        </div>

        {error && <p className="form-error">{error.message}</p>}

        <div className="modal-actions">
          {/* ลบได้เฉพาะโหมดแก้ไข — เงื่อนไขเปิด modal (ของตัวเอง + ยังไม่เริ่ม) ตรงกับกติกา
              workPlan.delete ฝั่ง API อยู่แล้ว; ปุ่มอยู่ชิดซ้าย แยกจากปุ่มบันทึกกันกดพลาด */}
          {plan && (
            <button
              type="button"
              className="btn-danger"
              disabled={pending}
              onClick={() => {
                if (!confirmingDelete) return setConfirmingDelete(true);
                del.mutate({ id: plan.id });
              }}
            >
              {del.isPending ? "กำลังลบ…" : confirmingDelete ? "ยืนยันลบแผนนี้?" : "ลบแผนงาน"}
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onClose}>
            ยกเลิก
          </button>
          {/* วันที่ยังไม่ครบรูป/จบก่อนเริ่ม → กดไม่ได้ (required เนทีฟกันแค่ช่องว่าง กันรูปผิดไม่ได้) */}
          <button
            type="submit"
            className="btn-primary"
            disabled={pending || !startISO || !endISO || rangeInvalid}
          >
            {pending ? "กำลังบันทึก…" : plan ? "บันทึกการแก้ไข" : "บันทึกแผน"}
          </button>
        </div>
      </form>
    </div>
  );
}
