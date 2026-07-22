"use client";

// หน้า "เคสลูกค้า" — คิวกลางของทีม: ทุกคนเห็นทุกเคส (view) / เปิดเคสได้ทุก role รวม CEO
// (ข้อยกเว้น RBAC ที่อนุมัติ 18 ก.ค. 2026 — ดู AGENT.md) แก้/ปิดได้เฉพาะคนเปิดหรือผู้รับเคส
// ผู้รับเคส (ENGINEER) กด "รับเป็นแผนงาน" จาก detail → เกิด WorkPlan ในหน้า "งานของฉัน"
// filter สถานะทำฝั่ง client — ticket.list ส่งทั้งหมดทีเดียว (ปริมาณน้อย pattern เดียวกับหน้าไซต์งาน)

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc, getToken, setToken } from "../../lib/trpc";
import { typeColor } from "../../lib/plan-types";
import { TICKET_STATUS_META, type TicketStatus } from "../../lib/ticket-status";
import { AppShell } from "../../components/app-shell";
import {
  AcceptModal,
  CloseTicketDialog,
  TicketDetailModal,
  TicketModal,
  type TicketRow,
} from "../../components/ticket-modals";

type StatusFilter = "ALL" | TicketStatus;

export default function TicketsPage() {
  const router = useRouter();
  // กันอ่าน localStorage ตอน SSR: รอ mount ก่อนค่อยเช็ค token แล้วค่อยยิง query (mirror dashboard)
  const [ready, setReady] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [creating, setCreating] = useState(false);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [editing, setEditing] = useState<TicketRow | null>(null);
  const [accepting, setAccepting] = useState<TicketRow | null>(null);
  const [closing, setClosing] = useState<TicketRow | null>(null);

  // ไม่มี token → เด้งไปหน้า login / มี token ค่อยยิง query (mirror dashboard)
  useEffect(() => {
    if (!getToken()) router.replace("/");
    else setReady(true);
  }, [router]);

  const me = trpc.auth.me.useQuery(undefined, { enabled: ready, retry: false });
  const types = trpc.type.list.useQuery(undefined, { enabled: ready });
  const tickets = trpc.ticket.list.useQuery(undefined, { enabled: ready });

  // token หมดอายุ/ใช้ไม่ได้ → ล้าง token แล้วเด้งกลับหน้า login (mirror dashboard)
  useEffect(() => {
    if (me.error && !me.isFetching) {
      setToken(null);
      router.replace("/");
    }
  }, [me.error, me.isFetching, router]);

  if (!ready || me.isLoading) return <div className="center-note">กำลังโหลด…</div>;
  if (!me.data) return null; // ระหว่างเด้งกลับหน้า login

  // ชื่อประเภทจาก table types (id → name) — โหลดไม่ทัน/id ไม่รู้จัก → โชว์ id ไปก่อน
  const typeNameById = new Map((types.data ?? []).map((t) => [t.id, t.name]));

  const rows = (tickets.data ?? []).filter(
    (t) => statusFilter === "ALL" || t.status === statusFilter,
  );

  const FILTERS: { value: StatusFilter; label: string }[] = [
    { value: "ALL", label: "ทั้งหมด" },
    { value: "OPEN", label: TICKET_STATUS_META.OPEN.label },
    { value: "ACCEPTED", label: TICKET_STATUS_META.ACCEPTED.label },
    { value: "CLOSED", label: TICKET_STATUS_META.CLOSED.label },
  ];

  return (
    <AppShell
      title="แจ้งซ่อม"
      user={me.data}
      onLogout={() => {
        setToken(null);
        router.replace("/");
      }}
    >
      <div className="sites-toolbar">
        <div className="type-filter">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              className={statusFilter === f.value ? "type-btn active" : "type-btn"}
              style={
                statusFilter === f.value && f.value !== "ALL"
                  ? {
                      background: TICKET_STATUS_META[f.value].bg,
                      color: TICKET_STATUS_META[f.value].fg,
                      borderColor: TICKET_STATUS_META[f.value].fg,
                    }
                  : undefined
              }
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* เปิดเคสได้ทุก role รวม CEO — จุดเดียวในระบบที่ CEO มีปุ่ม mutation */}
        <button className="btn-primary" onClick={() => setCreating(true)}>
          + แจ้งซ่อม
        </button>
      </div>

      {tickets.error && (
        <p className="form-error">โหลดรายการแจ้งซ่อมไม่สำเร็จ: {tickets.error.message}</p>
      )}

      <section className="day-panel">
        <div className="panel-head">
          <h2>
            แจ้งซ่อม
            {statusFilter !== "ALL" ? ` (${TICKET_STATUS_META[statusFilter].label})` : "ทั้งหมด"}
          </h2>
        </div>

        {tickets.isLoading ? (
          <p className="empty-note">กำลังโหลด…</p>
        ) : rows.length === 0 ? (
          <p className="empty-note">
            {statusFilter === "ALL" ? "ยังไม่มีแจ้งซ่อม — เปิดแจ้งซ่อมแรกได้จากปุ่มด้านบน" : "ไม่มีแจ้งซ่อมในสถานะนี้"}
          </p>
        ) : (
          <div className="plan-list">
            {rows.map((t) => {
              const meta = TICKET_STATUS_META[t.status];
              return (
                // ทั้งแถวกดได้ → เปิด detail modal (ปุ่มแก้/ปิด/รับอยู่ในนั้น ตามสิทธิ์)
                <button
                  key={t.id}
                  type="button"
                  className="plan-row row-link ticket-row"
                  onClick={() => setViewingId(t.id)}
                >
                  <span className="dot" style={{ background: t.assigned.color }} />
                  <div className="plan-main">
                    <div className="plan-name">
                      #{t.id} {t.title}
                    </div>
                    <div className="plan-sub">
                      ผู้รับ: {t.assigned.name} · เปิดโดย {t.createdBy.name}
                      {t.site && ` · ${t.site.name}`}
                    </div>
                  </div>
                  <div className="plan-chips">
                    {t.type && (
                      <span
                        className="chip"
                        style={{ background: typeColor(t.type).bg, color: typeColor(t.type).fg }}
                      >
                        {typeNameById.get(t.type) ?? t.type}
                      </span>
                    )}
                    <span className="chip" style={{ background: meta.bg, color: meta.fg }}>
                      {meta.label}
                    </span>
                    <span className="row-arrow" aria-hidden>
                      ›
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {creating && <TicketModal onClose={() => setCreating(false)} />}
      {viewingId !== null && (
        <TicketDetailModal
          ticketId={viewingId}
          me={me.data}
          typeNameById={typeNameById}
          onClose={() => setViewingId(null)}
          onEdit={(t) => {
            setViewingId(null);
            setEditing(t);
          }}
          onAccept={(t) => {
            setViewingId(null);
            setAccepting(t);
          }}
          onCloseTicket={(t) => {
            setViewingId(null);
            setClosing(t);
          }}
        />
      )}
      {editing && <TicketModal ticket={editing} onClose={() => setEditing(null)} />}
      {accepting && <AcceptModal ticket={accepting} onClose={() => setAccepting(null)} />}
      {closing && <CloseTicketDialog ticket={closing} onClose={() => setClosing(null)} />}
    </AppShell>
  );
}
