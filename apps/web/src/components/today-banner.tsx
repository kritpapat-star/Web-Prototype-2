"use client";

// banner "สิ่งที่ต้องทำวันนี้ + สรุปประจำวัน" — วางบนสุดของ /dashboard
// - ข้อมูลจาก workPlan.todo: แผนที่ทับวันนี้ + งานค้างจากวันก่อน (ไม่ผูกกับเดือนที่ดูในปฏิทิน
//   เพราะ window รายเดือนมองไม่เห็นงานค้างข้ามเดือน — ดู ARCHITECTURE.md)
// - แถบสรุปประจำวัน: นับแผนตาม status / รายการ: ปุ่มเริ่ม/จบงาน (Engineer เท่านั้น)
// - ช้ากว่าแผน → เปิด dialog บังคับกรอกเหตุผล ให้ตรงกับ validation ฝั่ง API (start/finish)
// - CEO เป็น view-only: เห็นสรุปทั้งทีมพร้อมชื่อคน แต่ไม่มีปุ่ม mutation ใดๆ ตาม RBAC

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

// โครงข้อมูลเท่าที่ banner ใช้ (แบบเดียวกับ CalendarPlan ใน month-calendar)
type TodoPlan = {
  id: number;
  siteId: number;
  name: string;
  startDate: Date;
  endDate: Date;
  actStart: Date | null;
  actEnd: Date | null;
  delayStartReason: string | null;
  delayEndReason: string | null;
  user: { id: number; name: string; color: string };
};

type ReasonDialog = { planId: number; planName: string; kind: "start" | "finish" } | null;

export function TodayBanner({ today, isCEO }: { today: Date; isCEO: boolean }) {
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
  const actError = start.error?.message ?? finish.error?.message ?? unstart.error?.message;

  // งานค้างจากวันก่อน = ช่วงแผนผ่านไปแล้วแต่ยังไม่กดจบงาน
  const isCarryOver = (p: TodoPlan) => !p.actEnd && p.endDate < today;

  const plans = todos.data ?? [];
  const counts = countByStatus(plans, today);
  // เรียงตามความเร่งด่วนของ status (ลำดับเดียวกับแผงแผนงาน) — งานค้างเป็น overdue อยู่แล้วจึงขึ้นบนเอง
  // status เท่ากันคงลำดับ startDate asc จาก server
  const rows = sortByStatusPriority(plans, today);

  // เช็ค "ช้ากว่าแผน" ด้วยวันปัจจุบัน ณ ตอนกด (ไม่ใช้ today ที่ fix ตอนเปิดหน้า — เผื่อเปิดค้างข้ามคืน)
  const onStart = (plan: TodoPlan) => {
    start.reset();
    finish.reset();
    unstart.reset();
    setConfirmUnstartId(null);
    if (dateOnlyICT(new Date()) > plan.startDate) {
      setDialog({ planId: plan.id, planName: plan.name, kind: "start" });
    } else {
      start.mutate({ id: plan.id });
    }
  };

  const onFinish = (plan: TodoPlan) => {
    start.reset();
    finish.reset();
    unstart.reset();
    setConfirmUnstartId(null);
    if (dateOnlyICT(new Date()) > plan.endDate) {
      setDialog({ planId: plan.id, planName: plan.name, kind: "finish" });
    } else {
      finish.mutate({ id: plan.id });
    }
  };

  // กดเริ่มผิดแผน → ยกเลิกกลับเป็น "ยังไม่เริ่ม" (ล้างเหตุผลเริ่มช้าด้วย) แล้วค่อยแก้/ลบตามกติกาเดิม
  const onUnstart = (plan: TodoPlan) => {
    start.reset();
    finish.reset();
    unstart.reset();
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
                    {isCarryOver(plan) && <span className="carry-tag">ค้างจากวันก่อน</span>}
                  </div>
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
                <span className="chip" style={{ background: meta.bg, color: meta.fg }}>
                  {meta.label}
                </span>

                {!isCEO && !plan.actStart && (
                  <button className="btn-primary btn-sm" disabled={acting} onClick={() => onStart(plan)}>
                    เริ่มงาน
                  </button>
                )}
                {!isCEO && plan.actStart && !plan.actEnd && (
                  <>
                    <button className="btn-primary btn-sm" disabled={acting} onClick={() => onFinish(plan)}>
                      จบงาน
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

// ---------- dialog เหตุผลเมื่อเริ่ม/จบช้ากว่าแผน (กติกา delay reason บังคับที่ API) ----------

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
  const [reason, setReason] = useState("");
  const isStart = dialog.kind === "start";

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
        <h3>{isStart ? "เริ่มงานช้ากว่าแผน" : "จบงานช้ากว่าแผน"}</h3>
        <p className="dialog-note">
          “{dialog.planName}” {isStart ? "เลยกำหนดเริ่มแล้ว" : "เลยกำหนดจบแล้ว"} — ต้องระบุเหตุผลก่อนบันทึก
        </p>

        <label className="field">
          เหตุผลที่{isStart ? "เริ่ม" : "จบ"}ช้า
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
            {pending ? "กำลังบันทึก…" : isStart ? "บันทึกและเริ่มงาน" : "บันทึกและจบงาน"}
          </button>
        </div>
      </form>
    </div>
  );
}
