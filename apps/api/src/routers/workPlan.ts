// apps/api/src/routers/workPlan.ts
// Router ของ module "งานของฉัน" — ครบทั้ง 4 หน้าจอ:
//   ปฏิทิน        → list
//   แผนงาน        → create / update
//   สิ่งที่ต้องทำ  → todo + start / finish (พร้อมบังคับ delay reason) + explainDelay
//   สรุป          → todo + computed status ฝั่ง client
//     (สรุปยังใช้ `todo` ไม่ใช่ list เพราะ todo ไม่ผูกกับเดือนในปฏิทิน — ส่วน list โชว์แผนค้างได้แล้ว
//      แต่เฉพาะใน "รายการทั้งเดือน", ปฏิทิน grid ยังวาดแค่แผนที่ทับเดือนจริงๆ)

import { z } from "zod";
import { TRPCError } from "@trpc/server";
// 24 ก.ค. 2026 (เจ้าของสั่ง): CEO สร้าง+จัดการ "แผนของตัวเอง" ได้ — ย้อน lock #6 เดิม (CEO view-only)
// mutation ทุกตัวจึงเป็น protectedProcedure (ต้อง login) + เช็ค ownership (plan.userId === ctx.user.sub)
// เป็นด่านเดียว → CEO/Engineer แตะได้เฉพาะแผนของตัวเอง, engineerProcedure ไม่ใช้ใน module นี้แล้ว
import { router, protectedProcedure } from "../trpc";
import { dateOnlyICT, todayICT } from "../lib/dates";
import { planDelayKind } from "../lib/overdue"; // นิยาม "ล่าช้า" ตัวเดียวกับ overdueRouter
import { assertTypeExists, assertSiteMatchesType } from "../lib/asserts"; // ย้ายไป lib เพราะ ticket.ts ใช้ด้วย

// ---------- zod schemas ----------

// siteId เลือกจาก dropdown (FK → sites.id) — เลิก gen จาก sequence แล้ว (11 ก.ค. 2026)
// type อ้าง types.id (เลขลำดับ เช่น 1 — Int ตั้งแต่ 20 ก.ค. 2026) — บังคับตอน create เพราะ dropdown ไซต์กรองตามประเภท
// (แผนเก่าที่ type เป็น null ยังอยู่ได้ — update ไม่บังคับเติม) ตัวเลือกมาจาก type.list ไม่ hardcode
const planFields = z.object({
  name: z.string().min(1, "ต้องระบุชื่อแผนงาน").max(200),
  type: z.number({ message: "ต้องเลือกประเภทงาน" }).int().positive(),
  siteId: z.number().int().positive(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

const monthInput = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12), // 1-12
  userId: z.number().int().optional(), // CEO ใช้ filter รายคน / Engineer ห้ามส่ง
  type: z.number().int().positive().optional(), // filter ตาม types.id (หน้าไซต์งาน)
});

// ค้นหาข้ามเดือน (หน้าไซต์งาน) — q ค้นชื่อแผน + เลขไซต์, type กรองร่วม (optional)
// แยกจาก monthInput เพื่อไม่ให้กระทบ window รายเดือนของ list (ใช้กับปฏิทิน dashboard ด้วย)
const searchInput = z.object({
  q: z.string().trim().min(2, "พิมพ์อย่างน้อย 2 ตัวอักษร"),
  type: z.number().int().positive().optional(),
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
    const today = dateOnlyICT(new Date()); // เทียบ "วันนี้" เหมือน workPlan.todo (เอาไปดักแผนค้างด้านล่าง)

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
        OR: [
          // แผนที่ "ทับ" กับเดือนที่ดู: startDate ≤ สิ้นเดือน AND endDate ≥ ต้นเดือน
          { startDate: { lte: monthEnd }, endDate: { gte: monthStart } },
          // ค้างจากวันก่อน (เงื่อนไขเดียวกับ workPlan.todo): ช่วงแผนผ่านไปแล้วแต่ยังไม่กดจบงาน
          // โชว์ในทุกเดือน เพื่อกันแผนค้างหายจาก "รายการทั้งเดือน" ทันทีที่เปลี่ยนเดือน
          { endDate: { lt: today }, actEnd: null },
        ],
        ...(input.type ? { type: input.type } : {}), // filter ตามประเภทงาน — AND ระดับนอก ใช้กับแผนค้างด้วย
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
  // CREATE — หน้าแผนงาน (ผู้ใช้สร้างแผนของตัวเอง — CEO/Engineer เหมือนกัน เจ้าของ = คน login)
  // ============================================================
  create: protectedProcedure.input(planFields).mutation(async ({ ctx, input }) => {
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
  // UPDATE — แก้รายละเอียดแผน (เจ้าของแผน)
  //   ยังไม่เริ่ม: แก้ได้ทุก field / เริ่มแล้ว (18 ก.ค. 2026): แก้ได้ยกเว้น "วันเริ่ม"
  //   — วันเริ่มผูกกับ actStart/delayStartReason ที่บันทึกไปแล้ว (กติกา delay reason ใน AGENT.md)
  //     เลื่อนย้อนหลังจะทำให้เหตุผลเริ่มช้าเพี้ยน ถ้าจำเป็นจริงให้ "ยกเลิกเริ่มงาน" ก่อน
  //   จบงานแล้ว: ล็อกทั้งแผน — เป็นประวัติที่ปิดสมบูรณ์
  // ============================================================
  update: protectedProcedure
    .input(planFields.partial().extend({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const plan = await ctx.prisma.workPlan.findUnique({ where: { id: input.id } });
      if (!plan) throw new TRPCError({ code: "NOT_FOUND" });
      if (plan.userId !== ctx.user.sub) {
        throw new TRPCError({ code: "FORBIDDEN", message: "แก้ได้เฉพาะแผนของตัวเอง" });
      }
      if (plan.actEnd) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "แผนที่จบงานแล้ว แก้ไขไม่ได้ (กันประวัติเพี้ยน)",
        });
      }

      // normalize เฉพาะ field ที่ส่งมา — ที่ไม่ส่งใช้ค่าเดิมใน DB (เป็น UTC เที่ยงคืนอยู่แล้ว)
      const startDate = input.startDate ? dateOnlyICT(input.startDate) : plan.startDate;
      const endDate = input.endDate ? dateOnlyICT(input.endDate) : plan.endDate;
      // เทียบค่าหลัง normalize — client ที่เผลอส่งวันเริ่มค่าเดิมกลับมาไม่ถือว่าแก้
      if (plan.actStart && startDate.getTime() !== plan.startDate.getTime()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "แผนที่เริ่มงานแล้ว แก้วันเริ่มไม่ได้ — ถ้าจำเป็นให้กดยกเลิกเริ่มงานก่อน",
        });
      }
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
  // DELETE — ลบแผน (เจ้าของ + ยังไม่กดเริ่มเท่านั้น — เข้มกว่า update ที่ยอมให้แก้แผนที่เริ่มแล้ว)
  //   แผนที่เริ่มงานแล้วห้ามลบ — เป็นประวัติการทำงานจริง กันประวัติเพี้ยน
  //   audit log ของ mutation นี้ถูกเขียนโดย middleware อัตโนมัติ (targetId = id ที่ลบ)
  //   ส่วน log เก่าที่อ้าง id นี้ยังอยู่ครบ (append-only — targetId เป็น text ไม่มี FK)
  // ============================================================
  delete: protectedProcedure
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
  start: protectedProcedure
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
  //   ล้าง actStart + delayStartReason → แผนกลับเป็น "ยังไม่เริ่ม" แล้วแก้วันเริ่ม/ลบต่อได้ตามกติกาเดิม
  //   จงใจ "ถอยสถานะ" แทนการเจาะข้อยกเว้น — กติกา "แผนที่เริ่มแล้วห้ามแก้วันเริ่ม/ห้ามลบ"
  //   ยังจริงเสมอ และการยกเลิกถูก audit log อัตโนมัติ (ตามรอยได้)
  //   แผนที่จบงานแล้วยกเลิกไม่ได้ — เป็นประวัติงานที่ปิดสมบูรณ์แล้ว
  // ============================================================
  unstart: protectedProcedure
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
  finish: protectedProcedure
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

  // ============================================================
  // EXPLAIN DELAY — ระบุ/แก้เหตุผลความล่าช้า "ระหว่างงานยังค้าง" (ยังไม่กดจบ)
  //   เดิมเหตุผลถูกเก็บตอนกดเริ่ม/จบเท่านั้น → แผน END_DUE (เลยกำหนดจบแต่ยังไม่กดจบ)
  //   จึงไม่มีเหตุผลเลย ทั้งที่เป็นแถวที่ CEO ต้องการรู้มากที่สุดในหน้า /delays
  //   ไม่แก้ schema — เขียนลงคอลัมน์เดิมตามจุดที่ช้า:
  //     endDate ผ่านไปแล้ว → delayEndReason (เคส END_DUE) / ยังไม่ถึง → delayStartReason (เคส START_LATE)
  //   validation ยังอยู่ที่ tRPC mutation ที่เดียวตามกติกา AGENT.md ข้อ 5
  //   audit log เขียนโดย middleware อัตโนมัติ (action = "workPlan.explainDelay")
  // ============================================================
  explainDelay: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        reason: z.string().trim().min(1, "ต้องระบุเหตุผล").max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const plan = await ctx.prisma.workPlan.findUnique({ where: { id: input.id } });
      if (!plan) throw new TRPCError({ code: "NOT_FOUND" });
      if (plan.userId !== ctx.user.sub) {
        throw new TRPCError({ code: "FORBIDDEN", message: "ระบุเหตุผลได้เฉพาะแผนของตัวเอง" });
      }
      // แผนที่จบแล้วเป็นประวัติที่ปิดสมบูรณ์ (กติกาเดียวกับ unstart) — แก้เหตุผลย้อนหลังไม่ได้
      if (plan.actEnd) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "แผนที่จบงานแล้ว แก้เหตุผลไม่ได้" });
      }

      const today = todayICT();
      if (planDelayKind(plan, today) == null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "แผนนี้ยังไม่ล่าช้า" });
      }

      const pastEnd = plan.endDate.getTime() < today.getTime();
      return ctx.prisma.workPlan.update({
        where: { id: input.id },
        data: pastEnd
          ? { delayEndReason: input.reason }
          : { delayStartReason: input.reason },
      });
    }),
});
