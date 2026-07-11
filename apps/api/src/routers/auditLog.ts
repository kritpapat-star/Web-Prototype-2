// apps/api/src/routers/auditLog.ts
// ประวัติการใช้งาน (audit log) — CEO ดู (list) / client ส่ง click log เข้า (track)
// ผู้เขียน log มี 2 ทางโดยตั้งใจ:
//   1) middleware auditMutation ใน trpc.ts (+ login ใน auth.ts) — mutation ฝั่ง server
//   2) track ด้านล่าง — full click telemetry จากฝั่ง web (ทางเดียวที่ client เขียน log ได้)
// นอกจากนี้ห้ามเขียน audit_logs จากที่อื่น

import { z } from "zod";
import { router, protectedProcedure } from "../trpc";

export const auditLogRouter = router({
  // ============================================================
  // LIST — log ล่าสุดเรียงใหม่→เก่า / filter รายคน + ช่วงวันที่ได้
  // scope ตาม role (เหมือน workPlan): ENGINEER เห็นเฉพาะ log ของตัวเอง / CEO เห็นทุกคน + filter รายคนได้
  // from/to เป็น instant UTC ที่ฝั่ง web คำนวณจากขอบ "วันไทย" มาแล้ว (to เป็น exclusive = ต้นวันถัดไป)
  //   → กรองที่ where ทำให้ดึง log วันเก่าที่ต้องการได้ตรงๆ ไม่ติด limit ของวันล่าสุด
  // ============================================================
  list: protectedProcedure
    .input(
      z.object({
        userId: z.number().int().optional(), // filter รายคน (CEO เท่านั้น — engineer ถูกบังคับเป็นของตัวเอง)
        from: z.date().optional(), // gte — รวมตั้งแต่ instant นี้
        to: z.date().optional(), // lt — ไม่รวม instant นี้ (web ส่งต้นวันถัดไปมาให้ครอบทั้งวัน "ถึง")
        limit: z.number().int().min(1).max(200).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.auditLog.findMany({
        where: {
          // engineer ล็อกไว้ที่ log ตัวเองเสมอ (กัน log คนอื่นรั่ว) — CEO ถึงจะ filter รายคนได้
          ...(ctx.user.role === "ENGINEER"
            ? { userId: ctx.user.sub }
            : input.userId
              ? { userId: input.userId }
              : {}),
          ...(input.from || input.to
            ? {
                createdAt: {
                  ...(input.from ? { gte: input.from } : {}),
                  ...(input.to ? { lt: input.to } : {}),
                },
              }
            : {}),
        },
        include: {
          user: { select: { id: true, name: true, color: true } }, // dot สีเดียวกับปฏิทิน
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  // ============================================================
  // TRACK — รับ log การคลิกจากฝั่ง web เป็นก้อน (batch) แล้วเขียนลง audit_logs
  // action ปกติเป็น "ui.click", detail = { page, label, tag, at } — เก็บแค่ตัวตนของ element
  // (ห้ามมีค่าใน input field / password) actor มาจาก ctx.user
  // หมายเหตุ: middleware auditMutation ใน trpc.ts "ข้าม" path นี้ กันเขียน log ซ้อน
  // ============================================================
  track: protectedProcedure
    .input(
      z.object({
        events: z
          .array(
            z.object({
              action: z.string().max(64), // เช่น "ui.click"
              targetId: z.string().max(64).nullish(), // id ของ record ที่เกี่ยว (ถ้ามี)
              detail: z.any().optional(), // { page, label, tag, at }
            }),
          )
          .min(1)
          .max(50), // จำกัดขนาด batch กัน abuse
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.auditLog.createMany({
        data: input.events.map((e) => ({
          userId: ctx.user.sub,
          action: e.action,
          targetId: e.targetId ?? null,
          detail: e.detail,
        })),
      });
      return { ok: true as const };
    }),
});
