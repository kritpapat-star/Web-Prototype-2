"use client";

// กระดิ่งการแจ้งเตือนบน topbar — badge นับยังไม่อ่าน + dropdown รายการ
// ข้อมูลจาก notification.unreadCount (badge) / notification.list (dropdown — lazy ตอนเปิด)
// notification ผูกกับ Ticket เสมอ (scope ปัจจุบัน) — เกิดจาก ticket.create/accept/close ฝั่ง API
// freshness: badge refetch ตอน window focus (react-query default) — ไม่ทำ polling เพื่อลด load

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "../lib/trpc";
import { fmtDateTime } from "../lib/format";

export function NotificationBell() {
  const utils = trpc.useUtils();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const count = trpc.notification.unreadCount.useQuery();
  // list โหลดเฉพาะตอนเปิด dropdown — กิน bandwidth น้อยตอนปิด
  const list = trpc.notification.list.useQuery(undefined, { enabled: open });

  const invalidate = () =>
    Promise.all([
      utils.notification.unreadCount.invalidate(),
      utils.notification.list.invalidate(),
    ]);
  const markRead = trpc.notification.markRead.useMutation({ onSuccess: () => void invalidate() });
  const markAllRead = trpc.notification.markAllRead.useMutation({
    onSuccess: () => void invalidate(),
  });

  const unread = count.data ?? 0;

  const onItemClick = (id: number, link: string | null) => {
    markRead.mutate({ id });
    setOpen(false);
    if (link) router.push(link);
  };

  return (
    <div className="bell-wrap">
      <button
        className="bell-btn"
        aria-label="การแจ้งเตือน"
        title="การแจ้งเตือน"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && <span className="bell-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <>
          {/* click-away: overlay โปร่งใสเต็มจอ อยู่ใต้ dropdown */}
          <div className="bell-overlay" onClick={() => setOpen(false)} />
          <div className="bell-dropdown">
            <div className="bell-dropdown-head">
              <span>การแจ้งเตือน</span>
              {unread > 0 && (
                <button
                  type="button"
                  className="bell-mark-all"
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                >
                  อ่านทั้งหมด
                </button>
              )}
            </div>

            <div className="bell-list">
              {list.isLoading && <p className="bell-empty">กำลังโหลด…</p>}
              {list.error && <p className="bell-empty">โหลดไม่สำเร็จ</p>}
              {list.data && list.data.length === 0 && (
                <p className="bell-empty">ไม่มีการแจ้งเตือน</p>
              )}
              {list.data?.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={"bell-item" + (n.isRead ? "" : " unread")}
                  onClick={() => onItemClick(n.id, n.link)}
                >
                  <div className="bell-item-main">{n.message}</div>
                  <div className="bell-item-meta">
                    {n.actor && (
                      <>
                        <span className="dot" style={{ background: n.actor.color }} />
                        {n.actor.name} ·{" "}
                      </>
                    )}
                    {fmtDateTime(n.createdAt)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
