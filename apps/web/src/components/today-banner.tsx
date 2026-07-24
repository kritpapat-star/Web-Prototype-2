"use client";

// banner "สิ่งที่ต้องทำวันนี้ + สรุปประจำวัน" — วางบนสุดของ /dashboard
// - ข้อมูลจาก workPlan.todo: แผนที่ทับวันนี้ + งานค้างจากวันก่อน (ไม่ผูกกับเดือนที่ดูในปฏิทิน
//   เพราะ window รายเดือนมองไม่เห็นงานค้างข้ามเดือน — ดู ARCHITECTURE.md)
// - แถบสรุปประจำวัน: นับแผนตาม status / รายการ: ปุ่มเริ่ม/จบงาน + แก้ไข
// - ช้ากว่าแผน → เปิด dialog บังคับกรอกเหตุผล ให้ตรงกับ validation ฝั่ง API (start/finish)
//   เหตุผลความล่าช้าเก็บตอนกดเริ่ม/จบเท่านั้น (กดจบก็บังคับกรอกอยู่แล้ว จึงไม่มีปุ่มระบุเหตุผลแยก)
// - ปุ่ม mutation gate ด้วย ownership (plan.user.id === myId) ไม่ใช่ role — 24 ก.ค. 2026 (ย้อน lock #6):
//   CEO เห็นสรุปทั้งทีมพร้อมชื่อคน + กดเริ่ม/จบ/แก้ ได้เฉพาะแผนที่ตัวเองสร้าง

import { useState } from "react";
import { trpc } from "../lib/trpc";
import {
  dateOnlyICT,
  planStatus,
  countByStatus,
  sortByStatusPriority,
  STATUS_BY_URGENCY,
  STATUS_META,
} from "../lib/status";
import { fmtDayMonth, fmtFullDate } from "../lib/format";
import { DelayTag } from "./delay-tag";

// โครงข้อมูลเท่าที่ banner ใช้ (แบบเดียวกับ CalendarPlan ใน month-calendar)
type TodoPlan = {
  id: number;
  siteId: number;
  name: string;
  type?: number | null; // types.id — ฟอร์มแก้ไข (PlanModal) ต้องใช้
  startDate: Date;
  endDate: Date;
  actStart: Date | null;
  actEnd: Date | null;
  delayStartReason: string | null;
  delayEndReason: string | null;
  user: { id: number; name: string; color: string };
};

// initial = ค่าที่เคยกรอกไว้ (prefill ช่องเหตุผล) — กันพิมพ์ซ้ำถ้าเคยมีเหตุผลอยู่แล้ว
type ReasonDialog = {
  planId: number;
  planName: string;
  kind: "start" | "finish";
  initial?: string;
} | null;

export function TodayBanner({
  today,
  isCEO,
  myId,
  onEdit,
}: {
  today: Date;
  isCEO: boolean; // ใช้โชว์ชื่อเจ้าของแผน (CEO เห็นหลายคนปนกัน)
  myId: number; // gate ปุ่มเริ่ม/จบ/แก้ ตามเจ้าของแผน (ทั้ง CEO และ Engineer เห็นเฉพาะปุ่มของแผนตัวเอง)
  // เปิด modal แก้ไขแผน (PlanModal ของหน้า dashboard) — banner ไม่มีฟอร์มเอง ใช้ตัวเดียวกับหน้าแผนงาน
  onEdit: (plan: TodoPlan) => void;
}) {
  const utils = trpc.useUtils();
  const todos = trpc.workPlan.todo.useQuery();
  const [dialog, setDialog] = useState<ReasonDialog>(null);

  // เริ่ม/จบ/ยกเลิกเริ่มงานสำเร็จ → refresh ทั้ง todo และ list (ปฏิทิน + แผงรายวันต้องขยับตาม)
  const invalidate = () => utils.workPlan.invalidate();
  const start = trpc.workPlan.start.useMutation({ onSuccess: invalidate });
  const finish = trpc.workPlan.finish.useMutation({ onSuccess: invalidate });
  const unstart = trpc.workPlan.unstart.useMutation({ onSuccess: invalidate });

  // ยกเลิกเริ่มงานเป็นสองจังหวะ (กดครั้งแรก = ขอยืนยัน) — เก็บ id แผนที่กำลังรอยืนยัน
  const [confirmUnstartId, setConfirmUnstartId] = useState<number | null>(null);

  const acting = start.isPending || finish.isPending || unstart.isPending;
  const actError =
    start.error?.message ?? finish.error?.message ?? unstart.error?.message;

  // งานค้างจากวันก่อน = ช่วงแผนผ่านไปแล้วแต่ยังไม่กดจบงาน
  const isCarryOver = (p: TodoPlan) => !p.actEnd && p.endDate < today;

  const plans = todos.data ?? [];
  const counts = countByStatus(plans, today);
  // เรียงตามความเร่งด่วนของ status (ลำดับเดียวกับแผงแผนงาน) — งานค้างเป็น overdue อยู่แล้วจึงขึ้นบนเอง
  // status เท่ากันคงลำดับ startDate asc จาก server
  const rows = sortByStatusPriority(plans, today);

  // เช็ค "ช้ากว่าแผน" ด้วยวันปัจจุบัน ณ ตอนกด (ไม่ใช้ today ที่ fix ตอนเปิดหน้า — เผื่อเปิดค้างข้ามคืน)
  const resetAll = () => {
    start.reset();
    finish.reset();
    unstart.reset();
  };

  const onStart = (plan: TodoPlan) => {
    resetAll();
    setConfirmUnstartId(null);
    if (dateOnlyICT(new Date()) > plan.startDate) {
      setDialog({ planId: plan.id, planName: plan.name, kind: "start" });
    } else {
      start.mutate({ id: plan.id });
    }
  };

  const onFinish = (plan: TodoPlan) => {
    resetAll();
    setConfirmUnstartId(null);
    if (dateOnlyICT(new Date()) > plan.endDate) {
      // ถ้าเคยมีเหตุผลจบช้าอยู่แล้ว → prefill ไม่ต้องพิมพ์ใหม่
      setDialog({
        planId: plan.id,
        planName: plan.name,
        kind: "finish",
        initial: plan.delayEndReason ?? undefined,
      });
    } else {
      finish.mutate({ id: plan.id });
    }
  };

  // กดเริ่มผิดแผน → ยกเลิกกลับเป็น "ยังไม่เริ่ม" (ล้างเหตุผลเริ่มช้าด้วย) แล้วค่อยแก้/ลบตามกติกาเดิม
  const onUnstart = (plan: TodoPlan) => {
    resetAll();
    if (confirmUnstartId !== plan.id) {
      setConfirmUnstartId(plan.id); // จังหวะแรก — เปลี่ยนปุ่มเป็นขอยืนยัน
      return;
    }
    unstart.mutate({ id: plan.id }, { onSuccess: () => setConfirmUnstartId(null) });
  };

  const submitReason = (reason: string) => {
    if (!dialog) return;
    const close = { onSuccess: () => setDialog(null) };
    if (dialog.kind === "start") {
      start.mutate({ id: dialog.planId, delayStartReason: reason }, close);
    } else {
      finish.mutate({ id: dialog.planId, delayEndReason: reason }, close);
    }
  };

  return (
    <section className="today-banner">
      <div className="banner-head">
        <div>
          <h2>สิ่งที่ต้องทำวันนี้</h2>
          <div className="banner-date">{fmtFullDate(today)}</div>
        </div>

        {/* สรุปประจำวัน — โชว์เฉพาะ status ที่มีจริง กันแถบรก */}
        <div className="sum-chips" aria-label="สรุปประจำวัน">
          {STATUS_BY_URGENCY.filter((s) => counts[s] > 0).map((s) => (
            <span
              key={s}
              className="chip"
              style={{ background: STATUS_META[s].bg, color: STATUS_META[s].fg }}
            >
              {STATUS_META[s].label} {counts[s]}
            </span>
          ))}
        </div>
      </div>

      {todos.error && (
        <p className="form-error">โหลดสิ่งที่ต้องทำไม่สำเร็จ: {todos.error.message}</p>
      )}
      {/* error จากปุ่มเริ่ม/จบ (ถ้า dialog เปิดอยู่ error ไปโชว์ใน dialog แทน) */}
      {actError && !dialog && <p className="form-error">{actError}</p>}

      {todos.isLoading ? (
        <p className="empty-note">กำลังโหลด…</p>
      ) : rows.length === 0 ? (
        <p className="empty-note">วันนี้ไม่มีงานในแผน และไม่มีงานค้าง</p>
      ) : (
        <div className="plan-list">
          {rows.map((plan) => {
            const meta = STATUS_META[planStatus(plan, today)];
            return (
              <div key={plan.id} className="plan-row">
                <span className="dot" style={{ background: plan.user.color }} />
                <div className="plan-main">
                  <div className="plan-name">
                    {plan.name}
                    {isCarryOver(plan) && <span className="carry-tag">งานค้าง</span>}
                    <DelayTag plan={plan} today={today} />
                  </div>
                  <div className="plan-sub">
                    {isCEO && <>{plan.user.name} · </>}
                    {fmtDayMonth(plan.startDate)} – {fmtDayMonth(plan.endDate)}
                  </div>
                  {(plan.delayStartReason || plan.delayEndReason) && (
                    <div className="plan-delay">
                      {plan.delayStartReason && <>เริ่มช้า: {plan.delayStartReason} </>}
                      {plan.delayEndReason && <>จบช้า: {plan.delayEndReason}</>}
                    </div>
                  )}
                </div>
                <span className="chip" style={{ background: meta.bg, color: meta.fg }}>
                  {meta.label}
                </span>

                {plan.user.id === myId && !plan.actStart && (
                  <>
                    <button className="btn-primary btn-sm" disabled={acting} onClick={() => onStart(plan)}>
                      เริ่มงาน
                    </button>
                    {/* แก้ได้จนกว่าจะจบงาน (กติกาเดียวกับ workPlan.update — แผนที่เริ่มแล้ว modal ล็อกวันเริ่มให้)
                        gate ด้วยเจ้าของแผน: CEO เห็นแผนทุกคนใน todo แต่กดได้เฉพาะแผนตัวเอง */}
                    <button className="btn-ghost btn-sm" onClick={() => onEdit(plan)}>
                      แก้ไข
                    </button>
                  </>
                )}
                {plan.user.id === myId && plan.actStart && !plan.actEnd && (
                  <>
                    <button className="btn-primary btn-sm" disabled={acting} onClick={() => onFinish(plan)}>
                      จบงาน
                    </button>
                    <button className="btn-ghost btn-sm" onClick={() => onEdit(plan)}>
                      แก้ไข
                    </button>
                    {/* กดเริ่มผิด → ถอยกลับเป็น "ยังไม่เริ่ม" (สองจังหวะกันมือลั่น)
                        จากนั้นแผนกลับมาแก้/ลบได้ตามกติกาเดิม — แผนที่จบแล้วไม่มีปุ่มนี้ */}
                    <button className="btn-danger btn-sm" disabled={acting} onClick={() => onUnstart(plan)}>
                      {unstart.isPending && confirmUnstartId === plan.id
                        ? "กำลังยกเลิก…"
                        : confirmUnstartId === plan.id
                          ? "ยืนยันยกเลิก?"
                          : "ยกเลิกเริ่มงาน"}
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {dialog && (
        <ReasonDialogModal
          dialog={dialog}
          pending={acting}
          error={actError}
          onSubmit={submitReason}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}

// ---------- dialog เหตุผลความล่าช้า (กติกา delay reason บังคับที่ API) ----------
// 2 จังหวะที่เปิด: กดเริ่มช้า (start) / กดจบช้า (finish)
// ต่างกันแค่ข้อความ — ฟอร์มเดียวกันหมด

const DIALOG_TEXT: Record<
  NonNullable<ReasonDialog>["kind"],
  { title: string; note: string; label: string; submit: string }
> = {
  start: {
    title: "เริ่มงานช้ากว่าแผน",
    note: "เลยกำหนดเริ่มแล้ว — ต้องระบุเหตุผลก่อนบันทึก",
    label: "เหตุผลที่เริ่มช้า",
    submit: "บันทึกและเริ่มงาน",
  },
  finish: {
    title: "จบงานช้ากว่าแผน",
    note: "เลยกำหนดจบแล้ว — ต้องระบุเหตุผลก่อนบันทึก",
    label: "เหตุผลที่จบช้า",
    submit: "บันทึกและจบงาน",
  },
};

function ReasonDialogModal({
  dialog,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  dialog: NonNullable<ReasonDialog>;
  pending: boolean;
  error: string | undefined;
  onSubmit: (reason: string) => void;
  onClose: () => void;
}) {
  // modal ถูก mount ใหม่ทุกครั้งที่เปิด (render แบบ conditional) → seed ค่าเดิมได้ตรงนี้เลย
  const [reason, setReason] = useState(dialog.initial ?? "");
  const text = DIALOG_TEXT[dialog.kind];

  return (
    <div className="overlay" onClick={onClose}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(reason.trim());
        }}
      >
        <h3>{text.title}</h3>
        <p className="dialog-note">
          “{dialog.planName}” {text.note}
        </p>

        <label className="field">
          {text.label}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            maxLength={500}
            rows={3}
            autoFocus
            placeholder="เช่น ฝนตกหนัก เข้าหน้างานไม่ได้"
          />
        </label>

        {error && <p className="form-error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="submit" className="btn-primary" disabled={pending || !reason.trim()}>
            {pending ? "กำลังบันทึก…" : text.submit}
          </button>
        </div>
      </form>
    </div>
  );
}
