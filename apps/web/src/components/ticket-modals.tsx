"use client";

// modal ทั้งหมดของใบแจ้งซ่อม — ใช้ร่วมกันระหว่างหน้า /tickets และ TicketBanner บน dashboard
//   TicketModal        เปิด/แก้ใบแจ้งซ่อม (ทุก role รวม CEO — ข้อยกเว้น RBAC ที่อนุมัติแล้ว ดู AGENT.md)
//   AcceptModal        "รับเป็นแผนงาน" (เฉพาะช่างที่ถูกมอบหมาย) — สร้าง WorkPlan + ใบเป็น ACCEPTED
//   CloseTicketDialog  ปิดใบ (ไม่มีลบใบ — ปิดแทนลบ เก็บประวัติแจ้งซ่อม)
//   TicketDetailModal  ดูรายละเอียด + ปุ่มตามสิทธิ์
// slim schema 20 ก.ค. 2026: ใบไม่ผูกไซต์/ไม่มีนัดหมาย/ไม่มีเหตุผลปิดใบแล้ว —
// ไซต์กลายเป็นเรื่องของแผนงาน: ช่างเลือก/สร้างไซต์ตอนกด "รับเป็นแผนงาน" (AcceptModal)
// pattern เดียวกับ PlanModal/SiteModal: hand-rolled modal, error inline, ไม่มี toast

import { useState } from "react";
import { trpc } from "../lib/trpc";
import { typeColor } from "../lib/plan-types";
import { TICKET_STATUS_META, type TicketStatus } from "../lib/ticket-status";
import { fmtAppointment, fmtFullDate, parseDMY } from "../lib/format";
import { dateOnlyICT } from "../lib/status";
import { DatePicker } from "./date-picker";

// โครงใบแจ้งซ่อมเท่าที่หน้าจอใช้ — ตรงกับ shape ของ ticket.list/todo (ticketInclude ฝั่ง API)
export type TicketRow = {
  id: number;
  title: string;
  detail: string | null;
  status: TicketStatus;
  type: number | null; // types.id (Int ตั้งแต่ 20 ก.ค. 2026)
  site: { id: number; name: string } | null; // sites.id — optional (เพิ่ม 21 ก.ค. 2026)
  assignedId: number;
  createdById: number;
  createdAt: Date;
  assigned: { id: number; name: string; color: string };
  createdBy: { id: number; name: string; color: string };
};

// ---------- TicketModal: เปิด/แก้ใบแจ้งซ่อม ----------

export function TicketModal({ ticket, onClose }: { ticket?: TicketRow; onClose: () => void }) {
  const utils = trpc.useUtils();
  const types = trpc.type.list.useQuery();
  const sites = trpc.site.list.useQuery();
  const users = trpc.user.list.useQuery(); // ENGINEER เท่านั้น — ช่างผู้รับงานต้องรับเป็นแผนต่อได้

  const [title, setTitle] = useState(ticket?.title ?? "");
  const [typeV, setTypeV] = useState(ticket?.type != null ? String(ticket.type) : ""); // "" = ไม่ระบุประเภท (DOM เก็บ string — แปลงเป็นเลขตอนส่ง)
  const [siteIdV, setSiteIdV] = useState(ticket?.site ? String(ticket.site.id) : ""); // "" = ไม่ระบุไซต์
  const [assigneeV, setAssigneeV] = useState(ticket ? String(ticket.assignedId) : "");
  const [saved, setSaved] = useState<{ id: number; title: string } | null>(null); // สร้างสำเร็จ → โชว์สรุป (บอกเลขใบ)

  // ไซต์ optional — เลือกประเภทแล้วกรองไซต์ที่รองรับ (ช่วยเลือกให้ตรง แล้ว AcceptModal prefill ได้เลย)
  // ยังไม่เลือกประเภท = โชว์ไซต์ทั้งหมด (intake ไม่บังคับ type↔site match — match เช็คที่ accept)
  const siteOptions = (sites.data ?? []).filter(
    (s) => !typeV || s.types.some((t) => t.id === Number(typeV)),
  );
  const changeType = (v: string) => {
    setTypeV(v);
    const cur = (sites.data ?? []).find((s) => String(s.id) === siteIdV);
    if (cur && v && !cur.types.some((t) => t.id === Number(v))) setSiteIdV(""); // ไซต์ที่เลือกไม่รองรับประเภทใหม่ → เคลียร์
  };

  const create = trpc.ticket.create.useMutation();
  const update = trpc.ticket.update.useMutation();

  const pending = create.isPending || update.isPending;
  const error = create.error ?? update.error;

  const submit = async () => {
    try {
      if (!ticket) {
        const created = await create.mutateAsync({
          title: title.trim(),
          ...(typeV ? { type: Number(typeV) } : {}),
          ...(siteIdV ? { siteId: Number(siteIdV) } : {}),
          assignedId: Number(assigneeV),
        });
        await utils.ticket.invalidate();
        setSaved({ id: created.id, title: created.title }); // โชว์สรุป (บอกเลขใบ)
        return;
      }

      // โหมดแก้ไข — ส่งเฉพาะ field ที่เปลี่ยนจริง (null = ล้างค่า ตามสัญญา ticket.update)
      await update.mutateAsync({
        id: ticket.id,
        ...(title.trim() !== ticket.title ? { title: title.trim() } : {}),
        ...(typeV !== String(ticket.type ?? "") ? { type: typeV ? Number(typeV) : null } : {}),
        ...(siteIdV !== String(ticket.site?.id ?? "") ? { siteId: siteIdV ? Number(siteIdV) : null } : {}),
        ...(assigneeV !== String(ticket.assignedId) ? { assignedId: Number(assigneeV) } : {}),
      });
      await utils.ticket.invalidate();
      onClose();
    } catch {
      /* error ของ mutation โชว์ inline อยู่แล้ว */
    }
  };

  // สร้างสำเร็จ → หน้าสรุป (mirror SiteModal) — บอกเลขใบให้จดแจ้งลูกค้าได้
  if (saved) {
    return (
      <div className="overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3>เปิดแจ้งซ่อมสำเร็จ</h3>
          <p className="modal-note">
            แจ้งซ่อม #{saved.id} — {saved.title}
          </p>
          <div className="modal-actions">
            <button type="button" className="btn-primary" onClick={onClose}>
              ปิด
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h3>{ticket ? `แก้ไขแจ้งซ่อม #${ticket.id}` : "เปิดแจ้งซ่อม"}</h3>

        <label className="field">
          หัวข้อ / อาการเสีย
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            autoFocus
            placeholder="เช่น กล้อง CCTV หน้าบ้านภาพไม่ขึ้น"
          />
        </label>

        <label className="field">
          ประเภทงาน
          <select value={typeV} onChange={(e) => changeType(e.target.value)}>
            <option value="">— ไม่ระบุ —</option>
            {(types.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          ไซต์งาน
          <select value={siteIdV} onChange={(e) => setSiteIdV(e.target.value)}>
            <option value="">— ไม่ระบุ —</option>
            {siteOptions.map((s) => (
              <option key={s.id} value={String(s.id)}>
                #{s.id} {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          ช่างผู้รับงาน
          <select value={assigneeV} onChange={(e) => setAssigneeV(e.target.value)} required>
            <option value="" disabled>
              — เลือกช่างผู้รับงาน —
            </option>
            {(users.data ?? []).map((u) => (
              <option key={u.id} value={String(u.id)}>
                {u.name}
              </option>
            ))}
          </select>
        </label>

        {error && <p className="form-error">{error.message}</p>}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "กำลังบันทึก…" : ticket ? "บันทึกการแก้ไข" : "เปิดแจ้งซ่อม"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------- AcceptModal: "รับเป็นแผนงาน" (ช่างที่ถูกมอบหมายเท่านั้น) ----------
// แผนใหม่ตามกติกา workPlan.create: บังคับประเภท + ไซต์เสมอ
// (ใบไม่ผูกไซต์แล้ว — ช่างเลือก/สร้างไซต์ตอนกดรับ, สร้างไซต์ใหม่ inline ได้)

export function AcceptModal({ ticket, onClose }: { ticket: TicketRow; onClose: () => void }) {
  const utils = trpc.useUtils();
  const types = trpc.type.list.useQuery();
  const sites = trpc.site.list.useQuery();

  const [name, setName] = useState(ticket.title);
  const [typeV, setTypeV] = useState(ticket.type != null ? String(ticket.type) : "");
  const [siteIdV, setSiteIdV] = useState(ticket.site ? String(ticket.site.id) : ""); // prefill จากใบ (ถ้าเลือกตอนเปิด)
  // วันเริ่ม/จบ default = วันนี้ (ใบไม่มีวันนัดลูกค้าแล้ว)
  const defaultDay = fmtFullDate(dateOnlyICT(new Date()));
  const [start, setStart] = useState(defaultDay);
  const [end, setEnd] = useState(defaultDay);

  const startISO = parseDMY(start);
  const endISO = parseDMY(end);
  const rangeInvalid = !!(startISO && endISO && endISO < startISO);

  // แผนบังคับประเภทเสมอ → ไซต์กรองตามประเภทที่เลือก (กติกาเดียวกับ PlanModal)
  const siteOptions = (sites.data ?? []).filter((s) => typeV && s.types.some((t) => t.id === Number(typeV)));
  const changeType = (v: string) => {
    setTypeV(v);
    const cur = (sites.data ?? []).find((s) => String(s.id) === siteIdV);
    if (!cur || !cur.types.some((t) => t.id === Number(v))) setSiteIdV("");
  };

  const accept = trpc.ticket.accept.useMutation({
    onSuccess: async () => {
      // ใบเปลี่ยนสถานะ + เกิดแผนใหม่ — refresh ทั้งสองโลก (banner ใบแจ้งซ่อม, ปฏิทิน/สิ่งที่ต้องทำ)
      await Promise.all([utils.ticket.invalidate(), utils.workPlan.invalidate()]);
    },
  });

  // รับสำเร็จ → หน้าสรุปชี้ไปหน้า "งานของฉัน"
  if (accept.data) {
    return (
      <div className="overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3>รับแจ้งซ่อมเป็นแผนงานแล้ว</h3>
          <p className="modal-note">
            แผน “{accept.data.plan.name}” ({fmtFullDate(accept.data.plan.startDate)} –{" "}
            {fmtFullDate(accept.data.plan.endDate)}) อยู่ในหน้า “งานของฉัน” แล้ว
          </p>
          <div className="modal-actions">
            <button type="button" className="btn-primary" onClick={onClose}>
              ปิด
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!startISO || !endISO || rangeInvalid || !siteIdV) return;
          accept.mutate({
            id: ticket.id,
            name: name.trim(),
            type: Number(typeV),
            siteId: Number(siteIdV),
            startDate: new Date(`${startISO}T00:00:00Z`),
            endDate: new Date(`${endISO}T00:00:00Z`),
          });
        }}
      >
        <h3>รับแจ้งซ่อม #{ticket.id} เป็นแผนงาน</h3>

        <label className="field">
          ชื่อแผนงาน
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} autoFocus />
        </label>

        <label className="field">
          ประเภทงาน
          <select value={typeV} onChange={(e) => changeType(e.target.value)} required>
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
        </label>

        <div className="field-row">
          <label className="field">
            วันเริ่ม
            <DatePicker
              value={start}
              onChange={setStart}
              placeholder="dd/mm/yyyy"
              invalid={!!(start && !startISO)}
              aria-label="วันเริ่ม"
            />
          </label>
          <label className="field">
            วันจบ
            <DatePicker
              value={end}
              onChange={setEnd}
              placeholder="dd/mm/yyyy"
              min={startISO ? start : undefined}
              invalid={!!(end && (!endISO || rangeInvalid))}
              aria-label="วันจบ"
            />
            {rangeInvalid && <span className="field-hint">วันจบต้องไม่ก่อนวันเริ่ม</span>}
          </label>
        </div>

        {accept.error && <p className="form-error">{accept.error.message}</p>}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={accept.isPending || !startISO || !endISO || rangeInvalid || !siteIdV}
          >
            {accept.isPending ? "กำลังบันทึก…" : "รับเป็นแผนงาน"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------- CloseTicketDialog: ยืนยันปิดใบ ----------
// slim schema 20 ก.ค. 2026: ไม่มี column closeReason แล้ว — เหลือแค่ยืนยัน

export function CloseTicketDialog({ ticket, onClose }: { ticket: TicketRow; onClose: () => void }) {
  const utils = trpc.useUtils();
  const close = trpc.ticket.close.useMutation({
    onSuccess: async () => {
      await utils.ticket.invalidate();
      onClose();
    },
  });

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>ปิดแจ้งซ่อม #{ticket.id}</h3>
        <p className="dialog-note">
          “{ticket.title}” จะถูกปิดโดยไม่แปลงเป็นแผนงาน — ปิดแล้วแก้ไข/รับเป็นแผนงานต่อไม่ได้
        </p>

        {close.error && <p className="form-error">{close.error.message}</p>}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn-danger"
            disabled={close.isPending}
            onClick={() => close.mutate({ id: ticket.id })}
          >
            {close.isPending ? "กำลังบันทึก…" : "ปิดแจ้งซ่อม"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- TicketDetailModal: รายละเอียด + ปุ่มตามสิทธิ์ ----------

export function TicketDetailModal({
  ticketId,
  me,
  typeNameById,
  onClose,
  onEdit,
  onAccept,
  onCloseTicket,
}: {
  ticketId: number;
  me: { id: number; role: string };
  typeNameById: Map<number, string>;
  onClose: () => void;
  onEdit: (t: TicketRow) => void;
  onAccept: (t: TicketRow) => void;
  onCloseTicket: (t: TicketRow) => void;
}) {
  const q = trpc.ticket.get.useQuery({ id: ticketId });
  const t = q.data;

  const isCEO = me.role === "CEO";
  // กติกาเดียวกับ API: แก้/ปิดได้เฉพาะคนเปิดใบหรือช่างผู้รับงาน และใบยังเปิดอยู่
  const canEdit = !!t && t.status === "OPEN" && (t.createdById === me.id || t.assignedId === me.id);
  // รับเป็นแผนได้เฉพาะช่างที่ถูกมอบหมาย (CEO เป็น view-only ของแผนงาน)
  const canAccept = !!t && t.status === "OPEN" && !isCEO && t.assignedId === me.id;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        {q.isLoading && <p className="empty-note">กำลังโหลด…</p>}
        {q.error && <p className="form-error">{q.error.message}</p>}
        {t && (
          <>
            <h3>
              แจ้งซ่อม #{t.id} — {t.title}
            </h3>

            <div className="plan-chips">
              {t.type && (
                <span
                  className="chip"
                  style={{ background: typeColor(t.type).bg, color: typeColor(t.type).fg }}
                >
                  {typeNameById.get(t.type) ?? t.type}
                </span>
              )}
              <span
                className="chip"
                style={{
                  background: TICKET_STATUS_META[t.status].bg,
                  color: TICKET_STATUS_META[t.status].fg,
                }}
              >
                {TICKET_STATUS_META[t.status].label}
              </span>
            </div>

            <dl className="ticket-facts">
              <div>
                <dt>ช่างผู้รับงาน</dt>
                <dd>
                  <span className="dot" style={{ background: t.assigned.color }} /> {t.assigned.name}
                </dd>
              </div>
              <div>
                <dt>แจ้งซ่อมโดย</dt>
                <dd>{t.createdBy.name}</dd>
              </div>
              {t.site && (
                <div>
                  <dt>ไซต์งาน</dt>
                  <dd>
                    #{t.site.id} {t.site.name}
                  </dd>
                </div>
              )}
              <div>
                <dt>เปิดเมื่อ</dt>
                <dd>{fmtAppointment(t.createdAt)}</dd>
              </div>
            </dl>

            {t.detail && <p className="ticket-detail-text">{t.detail}</p>}

            <div className="modal-actions">
              {canEdit && (
                <button type="button" className="btn-danger" onClick={() => onCloseTicket(t)}>
                  ปิดแจ้งซ่อม
                </button>
              )}
              <button type="button" className="btn-ghost" onClick={onClose}>
                ปิดหน้าต่าง
              </button>
              {canEdit && (
                <button type="button" className="btn-ghost" onClick={() => onEdit(t)}>
                  แก้ไข
                </button>
              )}
              {canAccept && (
                <button type="button" className="btn-primary" onClick={() => onAccept(t)}>
                  รับเป็นแผนงาน
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
