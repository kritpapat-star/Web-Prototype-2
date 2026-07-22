"use client";

// banner "เคสที่ได้รับมอบหมาย" — วางบนสุดของ /dashboard = แจ้งเตือนตอน login รายวัน
// ข้อมูลจาก ticket.todo: เคสที่ยังเปิดอยู่ — ENGINEER เห็นเคสที่มอบหมายให้ตัวเอง / CEO เห็นทุกเคสเปิด
// ไม่มีเคส = ไม่ render อะไรเลย (ไม่กินที่หน้า dashboard — ต่างจาก TodayBanner ที่โชว์เสมอ)
// ปุ่ม "รับเป็นแผนงาน" → AcceptModal (แปลงเป็น WorkPlan) — CEO เป็น view-only ตาม RBAC

import { useState } from "react";
import Link from "next/link";
import { trpc } from "../lib/trpc";
import { typeColor } from "../lib/plan-types";
import { AcceptModal, type TicketRow } from "./ticket-modals";

export function TicketBanner({ isCEO }: { isCEO: boolean }) {
  const todos = trpc.ticket.todo.useQuery();
  const types = trpc.type.list.useQuery();
  const [accepting, setAccepting] = useState<TicketRow | null>(null);

  const rows = todos.data ?? [];
  if (todos.isLoading || rows.length === 0) return null; // เงียบไว้จนกว่าจะมีเคสจริง

  const typeNameById = new Map((types.data ?? []).map((t) => [t.id, t.name]));

  return (
    <section className="today-banner ticket-banner">
      <div className="banner-head">
        <div>
          <h2>{isCEO ? "แจ้งซ่อมที่ยังเปิดอยู่" : "แจ้งซ่อมที่ได้รับมอบหมาย"}</h2>
          <div className="banner-date">
            {rows.length} รายการ · <Link href="/tickets">ดูแจ้งซ่อมทั้งหมด ›</Link>
          </div>
        </div>
      </div>

      {todos.error && <p className="form-error">โหลดแจ้งซ่อมไม่สำเร็จ: {todos.error.message}</p>}

      <div className="plan-list">
        {rows.map((t) => {
          return (
            <div key={t.id} className="plan-row">
              <span className="dot" style={{ background: t.assigned.color }} />
              <div className="plan-main">
                <div className="plan-name">
                  #{t.id} {t.title}
                </div>
                <div className="plan-sub">
                  {isCEO && <>ผู้รับ: {t.assigned.name} · </>}
                  เปิดโดย {t.createdBy.name}
                </div>
              </div>
              {t.type && (
                <span
                  className="chip"
                  style={{ background: typeColor(t.type).bg, color: typeColor(t.type).fg }}
                >
                  {typeNameById.get(t.type) ?? t.type}
                </span>
              )}
              {/* ticket.todo ของ ENGINEER คืนเฉพาะเคสของตัวเอง — ทุกแถวจึงกดรับได้ */}
              {!isCEO && (
                <button className="btn-primary btn-sm" onClick={() => setAccepting(t)}>
                  รับเป็นแผนงาน
                </button>
              )}
            </div>
          );
        })}
      </div>

      {accepting && <AcceptModal ticket={accepting} onClose={() => setAccepting(null)} />}
    </section>
  );
}
