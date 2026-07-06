// apps/api/src/routers/workPlan.ts
// Router ของ module "งานของฉัน" — ครบทั้ง 4 หน้าจอ:
//   ปฏิทิน        → list
//   แผนงาน        → create / update
//   สิ่งที่ต้องทำ  → todo + start / finish (พร้อมบังคับ delay reason)
//   สรุป          → todo + computed status ฝั่ง client
//     (สรุปไม่ใช้ list เพราะ window รายเดือนมองไม่เห็นงานค้างข้ามเดือน เช่นแผนจบ 30 มิ.ย. ที่ยังไม่ปิด)

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, engineerProcedure } from "../trpc";
import { dateOnlyICT } from "../lib/dates";

// ---------- zod schemas ----------

// jobId ไม่รับจาก client แล้ว — API gen เลขรันเอง (JOB-001, JOB-002, …) ตอน create
const planFields = z.object({
  name: z.string().min(1, "ต้องระบุชื่อแผนงาน").max(200),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

const monthInput = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12), // 1-12
  userId: z.string().optional(), // CEO ใช้ filter รายคน / Engineer ห้ามส่ง
});

// ---------- router ----------

export const workPlanRouter = router({
  // ============================================================
  // LIST — ปฏิทิน + สิ่งที่ต้องทำ + สรุป ใช้ตัวเดียวกัน
  //   Engineer: บังคับเห็นเฉพาะของตัวเอง (ignore userId ที่ส่งมา)
  //   CEO:      เห็นทุกคน หรือ filter ตาม userId ที่เลือก
  // ============================================================
  list: protectedProcedure.input(monthInput).query(async ({ ctx, input }) => {
    const monthStart = new Date(Date.UTC(input.year, input.month - 1, 1));
    const monthEnd = new Date(Date.UTC(input.year, input.month, 0)); // วันสุดท้ายของเดือน

    // กติกา RBAC ชั้น query: Engineer ล็อกเป็น id ตัวเองเสมอ
    const userFilter =
      ctx.user.role === "ENGINEER"
        ? { userId: ctx.user.sub }
        : input.userId
          ? { userId: input.userId }
          : {};

    return ctx.prisma.workPlan.findMany({
      where: {
        ...userFilter,
        // แผนที่ "ทับ" กับเดือนที่ดู: startDate ≤ สิ้นเดือน AND endDate ≥ ต้นเดือน
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart },
      },
      include: {
        user: { select: { id: true, name: true, color: true } }, // แต้มสีปฏิทินรวม
      },
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    });
  }),

  // ============================================================
  // TODO — banner "สิ่งที่ต้องทำวันนี้ + สรุปประจำวัน"
  //   คืน: แผนที่ทับวันนี้ + แผนค้างจากวันก่อน (เลยช่วงแผนแล้วยังไม่ปิดงาน)
  //   Engineer เห็นของตัวเอง / CEO เห็นทุกคน (view-only)
  // ============================================================
  todo: protectedProcedure.query(async ({ ctx }) => {
    const today = dateOnlyICT(new Date());
    const userFilter = ctx.user.role === "ENGINEER" ? { userId: ctx.user.sub } : {};

    return ctx.prisma.workPlan.findMany({
      where: {
        ...userFilter,
        OR: [
          // ทับวันนี้ (รวมงานที่เพิ่งปิดวันนี้ → โชว์ในสรุปว่าเสร็จแล้ว)
          { startDate: { lte: today }, endDate: { gte: today } },
          // ค้างจากวันก่อน: ช่วงแผนผ่านไปแล้วแต่ยังไม่กดจบงาน
          { endDate: { lt: today }, actEnd: null },
        ],
      },
      include: {
        user: { select: { id: true, name: true, color: true } },
      },
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    });
  }),

  // ============================================================
  // CREATE — หน้าแผนงาน (Engineer สร้างของตัวเองเท่านั้น)
  // ============================================================
  create: engineerProcedure.input(planFields).mutation(async ({ ctx, input }) => {
    // normalize เป็น "วันตามเวลาไทย" ที่ UTC เที่ยงคืน — กัน @db.Date ตัดวันเพี้ยน ±1
    const startDate = dateOnlyICT(input.startDate);
    const endDate = dateOnlyICT(input.endDate);
    if (endDate < startDate) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "วันจบต้องไม่มาก่อนวันเริ่ม",
      });
    }
    // Job ID รันเลขอัตโนมัติจาก sequence ใน Postgres — กันเลขชนกันแม้สร้างพร้อมกัน
    const [{ nextval }] =
      await ctx.prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('job_id_seq')`;
    const jobId = `JOB-${String(nextval).padStart(3, "0")}`;

    return ctx.prisma.workPlan.create({
      data: { ...input, jobId, startDate, endDate, userId: ctx.user.sub }, // เจ้าของ = คน login ไม่รับจาก client
    });
  }),

  // ============================================================
  // UPDATE — แก้ชื่อ/เลื่อนวันแผน (ก่อนเริ่มงานเท่านั้น)
  // ============================================================
  update: engineerProcedure
    .input(planFields.partial().extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const plan = await ctx.prisma.workPlan.findUnique({ where: { id: input.id } });
      if (!plan) throw new TRPCError({ code: "NOT_FOUND" });
      if (plan.userId !== ctx.user.sub) {
        throw new TRPCError({ code: "FORBIDDEN", message: "แก้ได้เฉพาะแผนของตัวเอง" });
      }
      if (plan.actStart) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "แผนที่เริ่มงานแล้ว แก้วันที่/ชื่อไม่ได้ (กันประวัติเพี้ยน)",
        });
      }

      // normalize เฉพาะ field ที่ส่งมา — ที่ไม่ส่งใช้ค่าเดิมใน DB (เป็น UTC เที่ยงคืนอยู่แล้ว)
      const startDate = input.startDate ? dateOnlyICT(input.startDate) : plan.startDate;
      const endDate = input.endDate ? dateOnlyICT(input.endDate) : plan.endDate;
      if (endDate < startDate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "วันจบต้องไม่มาก่อนวันเริ่ม" });
      }

      const { id, ...data } = input;
      return ctx.prisma.workPlan.update({
        where: { id },
        data: { ...data, startDate, endDate }, // ทับด้วยค่าที่ normalize แล้ว
      });
    }),

  // ============================================================
  // START — ปุ่ม "เริ่มงาน" ในสิ่งที่ต้องทำ
  //   เริ่มช้ากว่าแผน → บังคับกรอก delayStartReason
  // ============================================================
  start: engineerProcedure
    .input(z.object({ id: z.string(), delayStartReason: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const plan = await ctx.prisma.workPlan.findUnique({ where: { id: input.id } });
      if (!plan) throw new TRPCError({ code: "NOT_FOUND" });
      if (plan.userId !== ctx.user.sub) {
        throw new TRPCError({ code: "FORBIDDEN", message: "เริ่มได้เฉพาะแผนของตัวเอง" });
      }
      if (plan.actStart) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "แผนนี้เริ่มงานไปแล้ว" });
      }

      const now = new Date();
      const isLate = dateOnlyICT(now) > plan.startDate; // เทียบระดับ "วัน" ไม่ใช่นาที

      if (isLate && !input.delayStartReason?.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "เริ่มช้ากว่าแผน — กรุณาระบุเหตุผล",
        });
      }

      return ctx.prisma.workPlan.update({
        where: { id: input.id },
        data: {
          actStart: now,
          delayStartReason: isLate ? input.delayStartReason!.trim() : null,
        },
      });
    }),

  // ============================================================
  // FINISH — ปุ่ม "จบงาน" ในสิ่งที่ต้องทำ
  //   จบช้ากว่าแผน → บังคับกรอก delayEndReason
  // ============================================================
  finish: engineerProcedure
    .input(z.object({ id: z.string(), delayEndReason: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const plan = await ctx.prisma.workPlan.findUnique({ where: { id: input.id } });
      if (!plan) throw new TRPCError({ code: "NOT_FOUND" });
      if (plan.userId !== ctx.user.sub) {
        throw new TRPCError({ code: "FORBIDDEN", message: "จบได้เฉพาะแผนของตัวเอง" });
      }
      if (!plan.actStart) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ต้องกดเริ่มงานก่อนถึงจะจบงานได้" });
      }
      if (plan.actEnd) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "แผนนี้จบงานไปแล้ว" });
      }

      const now = new Date();
      const isLate = dateOnlyICT(now) > plan.endDate;

      if (isLate && !input.delayEndReason?.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "จบช้ากว่าแผน — กรุณาระบุเหตุผล",
        });
      }

      return ctx.prisma.workPlan.update({
        where: { id: input.id },
        data: {
          actEnd: now,
          delayEndReason: isLate ? input.delayEndReason!.trim() : null,
        },
      });
    }),
});
