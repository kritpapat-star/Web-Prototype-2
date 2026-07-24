// apps/api/src/routers/site.ts
// ไซต์งาน (sites) — create จากปุ่ม "+ ไซต์งาน" หน้าไซต์งาน + list ให้ dropdown ใน PlanModal
// WorkPlan.siteId เป็น FK มาที่ sites แล้ว (11 ก.ค. 2026 — ดู AGENT.md ข้อ lock 2)
// ประเภทของไซต์เป็น implicit m-n กับ Type (เลือกได้หลายประเภทผ่าน checkbox)

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, engineerProcedure } from "../trpc";

const siteFields = z.object({
  name: z.string().trim().min(1, "ต้องระบุชื่อไซต์งาน").max(200),
  typeIds: z.array(z.number().int().positive()), // types.id (เลขลำดับ เช่น 1) — [] = ไม่ระบุประเภท
});

export const siteRouter = router({
  // LIST — ใช้ 2 ที่: dropdown ไซต์ใน PlanModal + รายชื่อไซต์หน้า /sites
  // จงใจส่งทั้งหมดทีเดียวแล้วกรอง/ค้นฝั่ง client — ไซต์มีจำนวนน้อย เปลี่ยน filter ไม่ต้อง refetch
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.site.findMany({
      orderBy: { id: "asc" },
      include: { types: { select: { id: true } } },
    }),
  ),

  // GET — หัวหน้า site detail (/sites/[id]) — แนบชื่อประเภทเต็มเพื่อโชว์ chip โดยไม่พึ่ง type.list
  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const site = await ctx.prisma.site.findUnique({
        where: { id: input.id },
        include: { types: true },
      });
      if (!site) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบไซต์งานนี้" });
      }
      return site;
    }),

  // CREATE — ทุก role รวม CEO (protectedProcedure)
  // 24 ก.ค. 2026 (เจ้าของสั่ง): เปิดให้ CEO เพิ่มไซต์ได้ — ย้อน lock #6 เดิม (ไซต์ไม่มีเจ้าของ ใครก็สร้างได้)
  // ส่วน update/delete ยังเป็น engineerProcedure (เจ้าของขอเปิดเฉพาะ "เพิ่มไซต์")
  create: protectedProcedure.input(siteFields).mutation(async ({ ctx, input }) => {
    // dedupe กันติ๊กซ้ำ/client ส่ง id ซ้ำ — connect id เดียวกันสองครั้งจะชน PK ตารางเชื่อม
    const typeIds = [...new Set(input.typeIds)];

    // เช็คว่ามีจริงทุกตัว — เพื่อให้ error เป็นภาษาไทย แทน P2025 ดิบจาก Prisma
    if (typeIds.length > 0) {
      const found = await ctx.prisma.type.count({ where: { id: { in: typeIds } } });
      if (found !== typeIds.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ประเภทงานไม่ถูกต้อง" });
      }
    }

    return ctx.prisma.site.create({
      data: {
        name: input.name,
        types: { connect: typeIds.map((id) => ({ id })) },
      },
      include: { types: true }, // ให้ web โชว์ผลลัพธ์ได้เลยโดยไม่ต้อง query ซ้ำ
    });
  }),

  // UPDATE — แก้ชื่อไซต์และประเภท (Engineer เท่านั้น) — จากปุ่ม "แก้ชื่อ" หน้า site detail
  // name + typeIds (หลายประเภทได้ — m-n กับ Type ต่างจากแผนที่มี 1 type)
  // ฟอร์มแก้ไข prefill ประเภทเดิมแล้วส่งชุดเต็มที่ติ๊กจริงกลับมาเสมอ → set แทนที่ทั้งชุด
  // (ติ๊กออกหมด = ส่ง [] = ตั้งใจเคลียร์ประเภททั้งหมด) — typeIds เป็น optional เผื่อ caller
  // ที่ไม่อยากแตะประเภท (omit = undefined = ไม่แตะ set)
  update: engineerProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(1, "ต้องระบุชื่อไซต์งาน").max(200),
        typeIds: z.array(z.number().int().positive()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // อ่านข้อมูลเดิมก่อนเขียนทับ — ต้องอ่านที่นี่ เพราะ audit log เขียนหลัง update สำเร็จ (ข้อมูลถูกทับไปแล้ว)
      const prev = await ctx.prisma.site.findUnique({
        where: { id: input.id },
        select: { name: true },
      });
      if (!prev) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบไซต์งานนี้" });
      // ฝากชื่อเดิมให้ audit log (raw input มีแต่ชื่อใหม่) — หน้า log โชว์ "ชื่อเดิม → ชื่อใหม่"
      ctx.audit.prevName = prev.name;
      return ctx.prisma.site.update({
        where: { id: input.id },
        data: {
          name: input.name,
          ...(input.typeIds && {
            types: { set: input.typeIds.map((id) => ({ id })) },
          }),
        },
        include: { types: true }, // mirror create — ให้ web refresh ได้เลยโดยไม่ query ซ้ำ
      });
    }),

  // DELETE — Engineer เท่านั้น (ไซต์ไม่มีเจ้าของ — engineer คนไหนก็ลบได้ เหมือน create)
  // ไซต์ที่มีแผนงานอ้างอยู่ลบไม่ได้ (FK Restrict) — เช็ค count เอง
  // เพื่อให้ error เป็นภาษาไทย แทน P2003 ดิบจาก Postgres
  // (ใบแจ้งซ่อมไม่ผูกไซต์แล้ว — slim schema 20 ก.ค. 2026)
  // ประเภทของไซต์ (ตารางเชื่อม _SiteToType) หลุดตามอัตโนมัติ — ตัว Type ไม่ถูกลบ
  delete: engineerProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const site = await ctx.prisma.site.findUnique({
        where: { id: input.id },
        include: { _count: { select: { workPlans: true } } },
      });
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "ไม่พบไซต์งานนี้" });
      if (site._count.workPlans > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `ไซต์นี้มีแผนงานอ้างถึงอยู่ ${site._count.workPlans} แผน — ลบไม่ได้ (ต้องลบ/ย้ายแผนออกก่อน)`,
        });
      }
      return ctx.prisma.site.delete({ where: { id: input.id } });
    }),
});
