"use client";

// แท็บ "สรุปงาน" — มุมมองที่ 4 ของ WorkPlan: นับ status ประจำวัน + รายการจัดกลุ่มตาม status
// ใช้ workPlan.todo (ไม่ใช่ list) เพราะ window รายเดือนมองไม่เห็นงานค้างข้ามเดือน — ดู ARCHITECTURE.md
// CEO เห็นสรุปทั้งทีมพร้อมชื่อคน / Engineer เห็นเฉพาะของตัวเอง (API กรองให้แล้ว)

import { trpc } from "../lib/trpc";
import { planStatus, countByStatus, STATUS_META, type PlanStatus } from "../lib/status";
import { fmtDayMonth, fmtFullDate } from "../lib/format";

// ลำดับ: งานที่ต้องรีบขึ้นก่อน → งานปกติ → เสร็จแล้ว (ลำดับเดียวกับ banner สิ่งที่ต้องทำ)
const SUMMARY_ORDER: PlanStatus[] = [
  "NOT_STARTED_OVERDUE",
  "IN_PROGRESS_OVERDUE",
  "IN_PROGRESS",
  "NOT_STARTED",
  "COMPLETED",
];

export function SummaryPanel({ today, isCEO }: { today: Date; isCEO: boolean }) {
  const todos = trpc.workPlan.todo.useQuery();
  const plans = todos.data ?? [];
  const counts = countByStatus(plans, today);

  return (
    <section className="day-panel">
      <div className="panel-head">
        <div>
          <h2>สรุปงานประจำวัน</h2>
          <div className="banner-date">{fmtFullDate(today)}</div>
        </div>
      </div>

      {todos.error && (
        <p className="form-error">โหลดสรุปงานไม่สำเร็จ: {todos.error.message}</p>
      )}

      {/* ตัวเลขรวมทุก status — status ที่เป็น 0 จางลงแต่ยังโชว์ ให้เห็นครบว่ามีสถานะอะไรบ้าง */}
      <div className="sum-tiles">
        {SUMMARY_ORDER.map((s) => (
          <div
            key={s}
            className="sum-tile"
            style={{
              background: STATUS_META[s].bg,
              color: STATUS_META[s].fg,
              opacity: counts[s] === 0 ? 0.45 : 1,
            }}
          >
            <div className="sum-count">{counts[s]}</div>
            <div className="sum-label">{STATUS_META[s].label}</div>
          </div>
        ))}
      </div>

      {todos.isLoading ? (
        <p className="empty-note">กำลังโหลด…</p>
      ) : plans.length === 0 ? (
        <p className="empty-note">วันนี้ไม่มีงานในแผน และไม่มีงานค้าง</p>
      ) : (
        SUMMARY_ORDER.filter((s) => counts[s] > 0).map((s) => (
          <div key={s} className="sum-group">
            <h3 className="sum-group-title" style={{ color: STATUS_META[s].fg }}>
              {STATUS_META[s].label} ({counts[s]})
            </h3>
            <div className="plan-list">
              {plans
                .filter((plan) => planStatus(plan, today) === s)
                .map((plan) => (
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
                  </div>
                ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
