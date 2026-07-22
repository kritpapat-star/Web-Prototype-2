// apps/api/src/routers/notification.ts
// การแจ้งเตือนในแอป — ผูกกับ Ticket เสมอ (scope ปัจจุบัน)
// สร้างโดย lib/notify.ts (เรียกจาก ticket.create/accept/close) — router นี้ทำหน้าที่อ่าน + mark read เท่านั้น
// scope ตาม user เสมอ: เห็น/แตะได้เฉพาะ notification ของตัวเอง (userId = คน login)

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { router, protectedProcedure } from "../trpc";

// include actor (คน trigger) + ticket (link) — ฝั่ง web โชว์ชื่อ/สี/หัวข้อแจ้งซ่อมได้เลย
const notifInclude = {
  actor: { select: { id: true, name: true, color: true } },
  ticket: { select: { id: true, title: true } },
} satisfies Prisma.NotificationInclude;

export const notificationRouter = router({
  // ============================================================
  // LIST — dropdown ของกระดิ่ง เรียงใหม่→เก่า (จำกัด 50 แถวล่าสุด — เพียงพอสำหรับ bell)
  // ============================================================
  list: protectedProcedure.query(({ ctx }) => {
    return ctx.prisma.notification.findMany({
      where: { userId: ctx.user.sub },
      include: notifInclude,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }),

  // ============================================================
  // UNREAD COUNT — badge ตัวเลขบนกระดิ่ง (นับยังไม่อ่าน)
  //   เป็น query เดียวแยกจาก list เพราะ badge ต้อง refetch ถี่/เบากว่า (react-query refetchOnWindowFocus พอ)
  // ============================================================
  unreadCount: protectedProcedure.query(({ ctx }) => {
    return ctx.prisma.notification.count({
      where: { userId: ctx.user.sub, isRead: false },
    });
  }),

  // ============================================================
  // MARK READ — mark 1 แถวเป็นอ่านแล้ว (set isRead + readAt พร้อมกันตามสเปค schema)
  //   where กำกับ userId + isRead=false: กันแตะของคนอื่น + idempotent (อ่านแล้วไม่ error)
  // ============================================================
  markRead: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => {
      return ctx.prisma.notification.updateMany({
        where: { id: input.id, userId: ctx.user.sub, isRead: false },
        data: { isRead: true, readAt: new Date() },
      });
    }),

  // ============================================================
  // MARK ALL READ — ปุ่ม "อ่านทั้งหมด" ใน dropdown
  // ============================================================
  markAllRead: protectedProcedure.mutation(({ ctx }) => {
    return ctx.prisma.notification.updateMany({
      where: { userId: ctx.user.sub, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }),
});
