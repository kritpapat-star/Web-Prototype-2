// apps/api/src/routers/ticket.ts
// ใบแจ้งซ่อม (ticket) — ลูกค้าโทรแจ้งซ่อม → คนรับสายเปิดใบ+มอบหมายช่าง ENGINEER
// → ช่างกด "รับเป็นแผนงาน" สร้าง WorkPlan + set status=ACCEPTED (ไม่มี FK ผูกแผน↔ใบแล้ว)
// slim schema 20 ก.ค. 2026: ตัดนัดหมาย/เหตุผลปิดใบ/workPlanId ออก — status เป็น column จริง enum TicketStatus
// siteId กลับมา optional 21 ก.ค. 2026 (เจ้าของสั่ง): เปิดแจ้งซ่อมเลือกไซต์ได้ถ้ารู้ — ไม่รู้ปล่อยว่าง (ช่างเลือกตอน accept)
// กติกาสิทธิ์ (อนุมัติ 18 ก.ค. 2026 — ดู AGENT.md):
//   - เปิด/แก้/ปิดใบ: ทุก role รวม CEO (ข้อยกเว้นเดียวของกติกา "CEO view-only")
//   - รับเป็นแผนงาน: เฉพาะช่างที่ถูกมอบหมาย (สร้าง WorkPlan ให้ตัวเอง)
// ใบที่ ACCEPTED/CLOSED = ล็อกทั้งใบ — เหมือนกติกา "แผนจบงานแล้วล็อก"

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { router, protectedProcedure, engineerProcedure } from "../trpc";
import { dateOnlyICT } from "../lib/dates";
import { assertTypeExists, assertSiteMatchesType, assertSiteExists } from "../lib/asserts";
import { notify } from "../lib/notify";

// ---------- zod schemas ----------

// type ยัง optional — ยังไม่รู้ว่าระบบไหนเสียก็เปิดใบได้
const ticketFields = z.object({
  title: z.string().trim().min(1, "ต้องระบุหัวข้อ/อาการเสีย").max(200),
  detail: z.string().trim().max(2000).optional(),
  type: z.number().int().positive().optional(), // types.id
  siteId: z.number().int().positive().optional(), // sites.id — optional (รู้ไซต์ก็เลือก ไม่รู้ปล่อยว่าง)
  assignedId: z.number().int().positive(),
});

// update แยกจาก ticketFields.partial() เพราะ field ที่ optional ตอนสร้าง ต้อง "ล้างค่าได้" ตอนแก้
// (null = ล้าง, undefined = ไม่แตะ — pattern เดียวกับ conditional spread ของ workPlan.update)
const ticketUpdate = z.object({
  id: z.number().int().positive(),
  title: z.string().trim().min(1, "ต้องระบุหัวข้อ/อาการเสีย").max(200).optional(),
  detail: z.string().trim().max(2000).nullish(),
  type: z.number().int().positive().nullish(),
  siteId: z.number().int().positive().nullish(),
  assignedId: z.number().int().positive().optional(),
});

// input ของ "รับเป็นแผนงาน" — กติกาเดียวกับ workPlan.create: บังคับ type+siteId เสมอ
// (ใบอาจมีไซต้จากตอนเปิดแจ้งซ่อม → AcceptModal prefill siteId/type ช่างยืนยัน/แก้ได้)
const acceptInput = z.object({
  id: z.number().int().positive(), // ticket id
  name: z.string().trim().min(1, "ต้องระบุชื่อแผนงาน").max(200),
  type: z.number({ message: "ต้องเลือกประเภทงาน" }).int().positive(),
  siteId: z.number().int().positive(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

// ---------- shared shapes / guards ----------

// shape เดียวใช้ทุก query — web render แถวใบแจ้งซ่อมด้วยข้อมูลชุดเดียวกันได้ทุกหน้า
const ticketInclude = {
  assigned: { select: { id: true, name: true, color: true } },
  createdBy: { select: { id: true, name: true, color: true } },
  site: { select: { id: true, name: true } },
} satisfies Prisma.TicketInclude;

// ช่างผู้รับงานต้องเป็น ENGINEER — CEO รับงานซ่อมไม่ได้ (view-only + accept เป็น engineerProcedure)
async function assertAssigneeIsEngineer(prisma: Prisma.TransactionClient, userId: number) {
  const found = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!found || found.role !== "ENGINEER") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "ช่างผู้รับงานต้องเป็น Engineer" });
  }
}

// ใบที่ไม่ OPEN = ล็อกทั้งใบ — โยน error พร้อมเหตุผลตามสถานะ
function assertTicketOpen(status: "OPEN" | "ACCEPTED" | "CLOSED", verb: string) {
  if (status === "ACCEPTED") {
    throw new TRPCError({ code: "BAD_REQUEST", message: `แจ้งซ่อมนี้ถูกรับเป็นแผนงานไปแล้ว ${verb}ไม่ได้` });
  }
  if (status === "CLOSED") {
    throw new TRPCError({ code: "BAD_REQUEST", message: `แจ้งซ่อมนี้ปิดไปแล้ว ${verb}ไม่ได้` });
  }
}

// แก้/ปิดได้เฉพาะ "คนเปิดใบหรือช่างผู้รับงาน"
function assertOwnerOrAssignee(
  ticket: { createdById: number; assignedId: number },
  userId: number,
  verb: string,
) {
  if (ticket.createdById !== userId && ticket.assignedId !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `${verb}ได้เฉพาะคนเปิดแจ้งซ่อมหรือช่างผู้รับงานเท่านั้น`,
    });
  }
}

// ---------- router ----------

export const ticketRouter = router({
  // ============================================================
  // LIST — ตารางใบแจ้งซ่อมหน้า /tickets
  //   จงใจ "ไม่" scope ตาม user: ใบแจ้งซ่อมเป็นคิวกลางของทีม ใครรับสายก็ต้องเห็นใบที่มีอยู่
  //   (precedent เดียวกับ workPlan.bySite — view-only จึงไม่ชน RBAC lock)
  // ============================================================
  list: protectedProcedure
    .input(z.object({ status: z.enum(["OPEN", "ACCEPTED", "CLOSED"]).optional() }).optional())
    .query(({ ctx, input }) => {
      return ctx.prisma.ticket.findMany({
        where: input?.status ? { status: input.status } : {},
        include: ticketInclude,
        orderBy: { createdAt: "desc" }, // ประวัติเรียงใหม่→เก่า
      });
    }),

  // GET — detail modal
  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const ticket = await ctx.prisma.ticket.findUnique({
        where: { id: input.id },
        include: ticketInclude,
      });
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบแจ้งซ่อมนี้" });
      return ticket;
    }),

  // ============================================================
  // TODO — banner "งานซ่อมที่ได้รับมอบหมาย" บน dashboard (แจ้งเตือนตอน login รายวัน)
  //   ใบที่ยังเปิดอยู่เท่านั้น — Engineer เห็นใบที่มอบหมายให้ตัวเอง / CEO เห็นทุกใบเปิด (view-only)
  //   (mirror RBAC ของ workPlan.todo)
  // ============================================================
  todo: protectedProcedure.query(({ ctx }) => {
    const userFilter = ctx.user.role === "ENGINEER" ? { assignedId: ctx.user.sub } : {};
    return ctx.prisma.ticket.findMany({
      where: { ...userFilter, status: "OPEN" },
      include: ticketInclude,
      orderBy: { createdAt: "asc" }, // ใบเก่าค้างนานสุดขึ้นก่อน
    });
  }),

  // ============================================================
  // CREATE — เปิดใบแจ้งซ่อม: ทุก role รวม CEO (protectedProcedure — ข้อยกเว้นที่อนุมัติแล้ว)
  // ============================================================
  create: protectedProcedure.input(ticketFields).mutation(async ({ ctx, input }) => {
    await assertAssigneeIsEngineer(ctx.prisma, input.assignedId);
    await assertTypeExists(ctx.prisma, input.type);
    await assertSiteExists(ctx.prisma, input.siteId);

    const created = await ctx.prisma.ticket.create({
      data: {
        title: input.title,
        detail: input.detail ?? null,
        type: input.type ?? null,
        siteId: input.siteId ?? null,
        assignedId: input.assignedId,
        createdById: ctx.user.sub, // คนเปิดใบ = คน login ไม่รับจาก client
      },
      include: ticketInclude, // ให้ web โชว์ผลได้เลย
    });
    // แจ้งเตือนช่างที่ถูกมอบหมาย (actor = คนเปิดใบ) — notify ตัด self-assign (มอบหมายให้ตัวเอง) เอง
    await notify({
      prisma: ctx.prisma,
      userId: input.assignedId,
      actorId: ctx.user.sub,
      ticketId: created.id,
      type: "ticket_assigned",
      message: `มีแจ้งซ่อมใหม่มอบหมายให้คุณ — "${created.title}"`,
      link: "/tickets",
    });
    return created;
  }),

  // ============================================================
  // UPDATE — แก้ใบที่ยังเปิดอยู่ (คนเปิดใบหรือช่างผู้รับงาน)
  //   null = ล้างค่า / undefined = ไม่แตะ (อย่า write field ที่ user ไม่ได้แก้ — กติกา AGENT.md)
  // ============================================================
  update: protectedProcedure.input(ticketUpdate).mutation(async ({ ctx, input }) => {
    const ticket = await ctx.prisma.ticket.findUnique({ where: { id: input.id } });
    if (!ticket) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบแจ้งซ่อมนี้" });
    assertOwnerOrAssignee(ticket, ctx.user.sub, "แก้");
    assertTicketOpen(ticket.status, "แก้ไข");

    if (input.assignedId !== undefined) {
      await assertAssigneeIsEngineer(ctx.prisma, input.assignedId);
    }
    if (typeof input.type === "number") {
      await assertTypeExists(ctx.prisma, input.type);
    }
    if (typeof input.siteId === "number") {
      await assertSiteExists(ctx.prisma, input.siteId);
    }

    return ctx.prisma.ticket.update({
      where: { id: input.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.detail !== undefined ? { detail: input.detail } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.siteId !== undefined ? { siteId: input.siteId } : {}),
        ...(input.assignedId !== undefined ? { assignedId: input.assignedId } : {}),
      },
      include: ticketInclude,
    });
  }),

  // ============================================================
  // CLOSE — ปิดใบโดยไม่แปลงเป็นแผน (ลูกค้ายกเลิก/แจ้งซ้ำ/แนะนำทางโทรศัพท์จบ)
  //   ไม่บังคับเหตุผลแล้ว — column closeReason ถูกตัดออกตอน slim schema 20 ก.ค. 2026
  //   ไม่มี delete ใน v1: ปิดแทนลบ เก็บประวัติแจ้งซ่อมไว้เสมอ
  // ============================================================
  close: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const ticket = await ctx.prisma.ticket.findUnique({ where: { id: input.id } });
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบแจ้งซ่อมนี้" });
      assertOwnerOrAssignee(ticket, ctx.user.sub, "ปิด");
      assertTicketOpen(ticket.status, "ปิด");

      try {
        const closed = await ctx.prisma.ticket.update({
          // เงื่อนไขกันปิดแข่งกับกดรับ 2 tab — โดนตัดหน้า = P2025
          where: { id: input.id, status: "OPEN" },
          data: { status: "CLOSED" },
          include: ticketInclude,
        });
        // แจ้งเตือนคนเปิดใบว่าถูกปิดแล้ว (actor = คนกดปิด) — self-notify (ปิดใบตัวเอง) ถูกตัดใน notify
        await notify({
          prisma: ctx.prisma,
          userId: ticket.createdById,
          actorId: ctx.user.sub,
          ticketId: ticket.id,
          type: "ticket_closed",
          message: `แจ้งซ่อม "${ticket.title}" ถูกปิดแล้ว`,
          link: "/tickets",
        });
        return closed;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "แจ้งซ่อมนี้เพิ่งถูกปิดหรือรับเป็นแผนงานไปแล้ว" });
        }
        throw err;
      }
    }),

  // ============================================================
  // ACCEPT — "รับเป็นแผนงาน": เฉพาะช่างที่ถูกมอบหมาย
  //   สร้าง WorkPlan (เจ้าของ = คนกดรับ) + set status=ACCEPTED ใน transaction เดียว
  //   ไม่มี FK ผูกแผน↔ใบแล้ว (slim schema) — ลบแผนภายหลังใบไม่เด้งกลับมาเปิด
  //   กันกดรับแข่งกัน 2 tab: update where status=OPEN — โดนตัดหน้า = P2025 → rollback แผนที่เพิ่งสร้าง
  // ============================================================
  accept: engineerProcedure.input(acceptInput).mutation(async ({ ctx, input }) => {
    const ticket = await ctx.prisma.ticket.findUnique({ where: { id: input.id } });
    if (!ticket) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบแจ้งซ่อมนี้" });
    if (ticket.assignedId !== ctx.user.sub) {
      throw new TRPCError({ code: "FORBIDDEN", message: "รับได้เฉพาะแจ้งซ่อมที่มอบหมายให้คุณ" });
    }
    assertTicketOpen(ticket.status, "รับเป็นแผนงาน");

    // กติกาวันที่เหมือน workPlan.create ทุกบรรทัด
    const startDate = dateOnlyICT(input.startDate);
    const endDate = dateOnlyICT(input.endDate);
    if (endDate < startDate) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "วันจบต้องไม่มาก่อนวันเริ่ม" });
    }
    await assertTypeExists(ctx.prisma, input.type);
    await assertSiteMatchesType(ctx.prisma, input.siteId, input.type);

    try {
      const result = await ctx.prisma.$transaction(async (tx) => {
        const plan = await tx.workPlan.create({
          data: {
            name: input.name,
            type: input.type,
            siteId: input.siteId,
            startDate,
            endDate,
            userId: ctx.user.sub,
          },
        });
        const updated = await tx.ticket.update({
          // เงื่อนไขกันรับซ้ำ — ดูหัว mutation
          where: { id: input.id, status: "OPEN" },
          data: { status: "ACCEPTED" },
          include: ticketInclude,
        });
        return { plan, ticket: updated };
      });
      ctx.audit.workPlanId = result.plan.id; // ฝากเลขแผนลง audit detail (raw input ไม่มี)
      // แจ้งเตือนคนเปิดใบว่าถูกรับเป็นแผนแล้ว (actor = ช่างผู้รับที่กดรับ)
      await notify({
        prisma: ctx.prisma,
        userId: ticket.createdById,
        actorId: ctx.user.sub,
        ticketId: ticket.id,
        type: "ticket_accepted",
        message: `แจ้งซ่อม "${ticket.title}" ถูกรับเป็นแผนงานแล้ว`,
        link: "/tickets",
      });
      return result;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "แจ้งซ่อมนี้ถูกรับเป็นแผนงานไปแล้ว" });
      }
      throw err;
    }
  }),
});
