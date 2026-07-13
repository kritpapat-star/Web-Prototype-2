// apps/api/src/routers/workPlan.ts
// Router ของ module "งานของฉัน" — ครบทั้ง 4 หน้าจอ:
//   ปฏิทิน        → list
//   แผนงาน        → create / update
//   สิ่งที่ต้องทำ  → todo + start / finish (พร้อมบังคับ delay reason)
//   สรุป          → todo + computed status ฝั่ง client
//     (สรุปไม่ใช้ list เพราะ window รายเดือนมองไม่เห็นงานค้างข้ามเดือน เช่นแผนจบ 30 มิ.ย. ที่ยังไม่ปิด)

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { router, protectedProcedure, engineerProcedure } from "../trpc";
import { dateOnlyICT } from "../lib/dates";

// type ต้องมีจริงใน table types — เช็คเองเพื่อให้ error เป็นภาษาไทย แทน FK error ดิบจาก Postgres
async function assertTypeExists(prisma: PrismaClient, typeId: string | undefined) {
  if (!typeId) return;
  const found = await prisma.type.findUnique({ where: { id: typeId } });
  if (!found) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "ประเภทงานไม่ถูกต้อง" });
  }
}

// ไซต์ต้องมีจริง + รองรับประเภทงานของแผน (dropdown ฝั่ง web กรองให้แล้ว — เช็คซ้ำกันยิงตรง/client เก่า)
// type เป็น null ได้เฉพาะแผนเก่าก่อนบังคับประเภท (ตอน update ที่ไม่ได้แตะ type) — เช็คแค่ไซต์มีจริง
async function assertSiteMatchesType(
  prisma: PrismaClient,
  siteId: number,
  typeId: string | null,
) {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { types: { select: { id: true } } },
  });
  if (!site) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "ไม่พบไซต์งานที่เลือก" });
  }
  if (typeId && !site.types.some((t) => t.id === typeId)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "ไซต์งานที่เลือกไม่รองรับประเภทงานนี้",
    });
  }
}

// ---------- zod schemas ----------

// siteId เลือกจาก dropdown (FK → sites.id) — เลิก gen จาก sequence แล้ว (11 ก.ค. 2026)
// type อ้าง types.id (เลขลำดับ เช่น "1") — บังคับตอน create เพราะ dropdown ไซต์กรองตามประเภท
// (แผนเก่าที่ type เป็น null ยังอยู่ได้ — update ไม่บังคับเติม) ตัวเลือกมาจาก type.list ไม่ hardcode
const planFields = z.object({
  name: z.string().min(1, "ต้องระบุชื่อแผนงาน").max(200),
  type: z.string().min(1, "ต้องเลือกประเภทงาน"),
  siteId: z.number().int().positive(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

const monthInput = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12), // 1-12
  userId: z.number().int().optional(), // CEO ใช้ filter รายคน / Engineer ห้ามส่ง
  type: z.string().min(1).optional(), // filter ตาม types.id (หน้าไซต์งาน)
});

// ค้นหาข้ามเดือน (หน้าไซต์งาน) — q ค้นชื่อแผน + เลขไซต์, type กรองร่วม (optional)
// แยกจาก monthInput เพื่อไม่ให้กระทบ window รายเดือนของ list (ใช้กับปฏิทิน dashboard ด้วย)
const searchInput = z.object({
  q: z.string().trim().min(2, "พิมพ์อย่างน้อย 2 ตัวอักษร"),
  type: z.string().min(1).optional(),
});

// q ที่เป็นเลขไซต์: "12" หรือ "#5" (ใส่ # ช่วยให้เลขหลักเดียวผ่าน min 2 ตัวอักษรได้)
// siteId เป็น Int แล้ว — contains ใช้ไม่ได้ เลยเทียบเท่ากับเลขที่แกะออกมาแทน
function parseSiteIdQuery(q: string): number | null {
  const m = /^#?(\d+)$/.exec(q);
  return m ? Number(m[1]) : null;
}

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
        ...(input.type ? { type: input.type } : {}), // filter ตามประเภทงาน (หน้าไซต์งาน)
      },
      include: {
        user: { select: { id: true, name: true, color: true } }, // แต้มสีปฏิทินรวม
      },
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    });
  }),

  // ============================================================
  // SEARCH — ค้นหาแผนงานข้ามเดือน (หน้าไซต์งาน)
  //   ค้นจาก name (case-insensitive contains) + เลขไซต์ (เทียบเท่าเมื่อ q เป็นเลข/#เลข)
  //   type filter ใช้ร่วมกับผลค้นหาได้
  //   Engineer: เห็นเฉพาะของตัวเอง / CEO: เห็นทุกคน (RBAC เหมือน list)
  //   ไม่จำกัดเดือน / ไม่จำกัดจำนวนผลลัพธ์
  // ============================================================
  search: protectedProcedure.input(searchInput).query(async ({ ctx, input }) => {
    // กติกา RBAC เหมือน list: Engineer ล็อกเป็น id ตัวเองเสมอ / CEO เห็นทุกคน
    const userFilter = ctx.user.role === "ENGINEER" ? { userId: ctx.user.sub } : {};

    const q = input.q;
    const siteIdQuery = parseSiteIdQuery(q);

    return ctx.prisma.workPlan.findMany({
      where: {
        ...userFilter,
        ...(input.type ? { type: input.type } : {}),
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          ...(siteIdQuery !== null ? [{ siteId: siteIdQuery }] : []),
        ],
      },
      include: {
        user: { select: { id: true, name: true, color: true } }, // shape เดียวกับ list → render plan-row ซ้ำได้
      },
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    });
  }),
  // ============================================================
  // BY SITE — ประวัติแผนงานทั้งหมดของไซต์ (หน้า /sites/[id])
  //   ไม่จำกัดเดือน — เรียงใหม่→เก่า (เป็น "ประวัติ" ต่างจาก list/search ที่เรียงเก่า→ใหม่)
  //   จงใจ "ไม่" กรองตาม user: ประวัติไซต์เป็นข้อมูลกลางของไซต์ ทุก role เห็นแผนของทุกคน
  //   (ข้อยกเว้นจาก pattern "Engineer เห็นเฉพาะของตัวเอง" ของ list/search/todo — view-only จึงไม่ชน RBAC lock)
  // ============================================================
  bySite: protectedProcedure
    .input(z.object({ siteId: z.number().int().positive() }))
    .query(({ ctx, input }) =>
      ctx.prisma.workPlan.findMany({
        where: { siteId: input.siteId },
        include: {
          user: { select: { id: true, name: true, color: true } }, // shape เดียวกับ list → ใช้ helper status/สีเดิมได้
        },
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
      }),
    ),

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
    await assertTypeExists(ctx.prisma, input.type);
    await assertSiteMatchesType(ctx.prisma, input.siteId, input.type);

    return ctx.prisma.workPlan.create({
      data: { ...input, startDate, endDate, userId: ctx.user.sub }, // เจ้าของ = คน login ไม่รับจาก client
    });
  }),

  // ============================================================
  // UPDATE — แก้ชื่อ/เลื่อนวันแผน (ก่อนเริ่มงานเท่านั้น)
  // ============================================================
  update: engineerProcedure
    .input(planFields.partial().extend({ id: z.number().int().positive() }))
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
      await assertTypeExists(ctx.prisma, input.type);
      // แตะไซต์หรือประเภท → เช็คคู่ site↔type ตามค่าสุดท้ายหลังแก้ (ที่ไม่ส่งใช้ค่าเดิมใน DB)
      if (input.siteId !== undefined || input.type !== undefined) {
        await assertSiteMatchesType(
          ctx.prisma,
          input.siteId ?? plan.siteId,
          input.type ?? plan.type,
        );
      }

      const { id, ...data } = input;
      return ctx.prisma.workPlan.update({
        where: { id },
        data: { ...data, startDate, endDate }, // ทับด้วยค่าที่ normalize แล้ว
      });
    }),

  // ============================================================
  // DELETE — ลบแผน (กติกาเดียวกับ update: เจ้าของ + ยังไม่กดเริ่ม)
  //   แผนที่เริ่มงานแล้วห้ามลบ — เป็นประวัติการทำงานจริง กันประวัติเพี้ยน
  //   audit log ของ mutation นี้ถูกเขียนโดย middleware อัตโนมัติ (targetId = id ที่ลบ)
  //   ส่วน log เก่าที่อ้าง id นี้ยังอยู่ครบ (append-only — targetId เป็น text ไม่มี FK)
  // ============================================================
  delete: engineerProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const plan = await ctx.prisma.workPlan.findUnique({ where: { id: input.id } });
      if (!plan) throw new TRPCError({ code: "NOT_FOUND" });
      if (plan.userId !== ctx.user.sub) {
        throw new TRPCError({ code: "FORBIDDEN", message: "ลบได้เฉพาะแผนของตัวเอง" });
      }
      if (plan.actStart) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "แผนที่เริ่มงานแล้ว ลบไม่ได้ (กันประวัติเพี้ยน)",
        });
      }
      return ctx.prisma.workPlan.delete({ where: { id: input.id } });
    }),

  // ============================================================
  // START — ปุ่ม "เริ่มงาน" ในสิ่งที่ต้องทำ
  //   เริ่มช้ากว่าแผน → บังคับกรอก delayStartReason
  // ============================================================
  start: engineerProcedure
    .input(z.object({ id: z.number().int().positive(), delayStartReason: z.string().max(500).optional() }))
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
  // UNSTART — ปุ่ม "ยกเลิกเริ่มงาน" (เคสกดเริ่มผิดแผน/ผิดจังหวะ)
  //   ล้าง actStart + delayStartReason → แผนกลับเป็น "ยังไม่เริ่ม" แล้วแก้/ลบต่อได้ตามกติกาเดิม
  //   จงใจ "ถอยสถานะ" แทนการเจาะข้อยกเว้นให้ลบแผนที่เริ่มแล้ว — กติกา
  //   "แผนที่เริ่มแล้วห้ามแก้/ลบ" ยังจริงเสมอ และการยกเลิกถูก audit log อัตโนมัติ (ตามรอยได้)
  //   แผนที่จบงานแล้วยกเลิกไม่ได้ — เป็นประวัติงานที่ปิดสมบูรณ์แล้ว
  // ============================================================
  unstart: engineerProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const plan = await ctx.prisma.workPlan.findUnique({ where: { id: input.id } });
      if (!plan) throw new TRPCError({ code: "NOT_FOUND" });
      if (plan.userId !== ctx.user.sub) {
        throw new TRPCError({ code: "FORBIDDEN", message: "ยกเลิกได้เฉพาะแผนของตัวเอง" });
      }
      if (!plan.actStart) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "แผนนี้ยังไม่ได้เริ่มงาน" });
      }
      if (plan.actEnd) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "แผนที่จบงานแล้ว ยกเลิกการเริ่มงานไม่ได้",
        });
      }

      return ctx.prisma.workPlan.update({
        where: { id: input.id },
        data: { actStart: null, delayStartReason: null },
      });
    }),

  // ============================================================
  // FINISH — ปุ่ม "จบงาน" ในสิ่งที่ต้องทำ
  //   จบช้ากว่าแผน → บังคับกรอก delayEndReason
  // ============================================================
  finish: engineerProcedure
    .input(z.object({ id: z.number().int().positive(), delayEndReason: z.string().max(500).optional() }))
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
