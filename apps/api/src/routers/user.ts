// apps/api/src/routers/user.ts
// รายชื่อช่างสำหรับ dropdown "ช่างผู้รับงาน" ในฟอร์มเปิดใบแจ้งซ่อม (ticket)
// แยกจาก log.users (ceoProcedure — คืนทุก role) เพราะอันนี้ทุกคนที่ login ต้องเรียกได้
// และคืนเฉพาะ ENGINEER — คนที่กด "รับเป็นแผนงาน" ต่อได้จริง (workPlan เป็นของ ENGINEER เท่านั้น)

import { router, protectedProcedure } from "../trpc";

export const userRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.user.findMany({
      where: { role: "ENGINEER" },
      select: { id: true, name: true, color: true },
      orderBy: { id: "asc" },
    }),
  ),
});
