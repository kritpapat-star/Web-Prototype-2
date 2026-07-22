// apps/api/src/lib/notify.ts
// สร้าง notification 1 แถว — ใช้กับเหตุการณ์ของแจ้งซ่อม (assigned/accepted/closed)
// ผูกกับ Ticket เสมอ (scope ปัจจุบัน) — userId = ผู้รับ, actorId = คน trigger
//
// กติกา 2 ข้อ (เหมือน audit log):
//   1. กัน self-notify — actor == recipient ไม่ส่งให้ตัวเอง (เช่นช่างเปิดแจ้งซ่อมมอบหมายให้ตัวเอง)
//   2. พลาดต้องไม่ทำลาย mutation หลัก — notification เป็น best-effort (try/catch + console.error)
//      ตามจารีตเดียวกับ auditMutation ใน trpc.ts (mutation สำเร็จแล้ว ห้าม rollback เพราะของติดๆ แยก)
import { Prisma, type PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

export async function notify(opts: {
  prisma: Tx;
  userId: number; // ผู้รับการแจ้งเตือน
  actorId: number; // คน trigger เหตุการณ์
  ticketId: number;
  type: string; // string อิสระ เช่น "ticket_assigned" (ดู schema.prisma หมายเหตุ)
  message: string;
  link?: string | null; // URL ภายในแอป เช่น "/tickets" — null ได้
}) {
  if (opts.userId === opts.actorId) return; // ไม่แจ้งเตือนตัวเอง
  try {
    await opts.prisma.notification.create({
      data: {
        userId: opts.userId,
        actorId: opts.actorId,
        ticketId: opts.ticketId,
        type: opts.type,
        message: opts.message,
        link: opts.link ?? null,
      },
    });
  } catch (err) {
    console.error("สร้าง notification ไม่สำเร็จ:", err);
  }
}
