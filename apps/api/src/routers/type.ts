// apps/api/src/routers/type.ts
// ประเภทงาน (types) — lookup table แทน enum PlanType เดิม
// มีแค่ list สำหรับ dropdown ใน PlanModal + ปุ่ม filter หน้าไซต์งาน
// เพิ่ม/แก้ประเภททำผ่าน migration/seed (จำกัดไว้ ~5 ประเภท — เรียงตาม id ดู schema.prisma)

import { router, protectedProcedure } from "../trpc";

export const typeRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.type.findMany({ orderBy: { id: "asc" } }),
  ),
});
