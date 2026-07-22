// apps/web/src/lib/ticket-status.ts
// สถานะเคสลูกค้า — อ่านตรงจาก column tickets.status (enum TicketStatus ฝั่ง DB)
// slim schema 20 ก.ค. 2026: เลิก derive จาก workPlanId/closedAt แล้ว (column พวกนั้นถูกตัดออก)

export type TicketStatus = "OPEN" | "ACCEPTED" | "CLOSED";

// label + สีป้าย — โทนเดียวกับ STATUS_META ของแผน (เปิดอยู่ = amber เตือนว่ารอคนรับ)
export const TICKET_STATUS_META: Record<TicketStatus, { label: string; bg: string; fg: string }> = {
  OPEN: { label: "เปิดอยู่", bg: "#fef3c7", fg: "#92400e" },
  ACCEPTED: { label: "รับเป็นแผนแล้ว", bg: "#dcfce7", fg: "#15803d" },
  CLOSED: { label: "ปิดแล้ว", bg: "#e5e7eb", fg: "#374151" },
};
