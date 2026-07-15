// apps/api/src/routers/auditLog.ts
// ประวัติการใช้งาน (audit log) — list ดู log / summary+users แถบสรุปของ CEO / client ส่ง click log เข้า (track)
// ผู้เขียน log มี 2 ทางโดยตั้งใจ:
//   1) middleware auditMutation ใน trpc.ts (+ login และ LOGIN_FAILED ใน auth.ts) — mutation ฝั่ง server
//   2) track ด้านล่าง — full click telemetry จากฝั่ง web (ทางเดียวที่ client เขียน log ได้)
// นอกจากนี้ห้ามเขียน audit_logs จากที่อื่น

import { z } from "zod";
import { router, protectedProcedure, ceoProcedure } from "../trpc";

// action ที่นับในแถบสรุปประจำวันของ CEO — เหตุการณ์ทางธุรกิจเท่านั้น (ui.click ไม่นับ)
const SUMMARY_ACTIONS = [
  "workPlan.create",
  "workPlan.update",
  "workPlan.delete",
  "workPlan.start",
  "workPlan.unstart",
  "workPlan.finish",
  "LOGIN_FAILED",
];

// targetId เก็บเป็น text เสมอ — ของ workPlan.*/site.* เป็นเลขรัน แปลงกลับเป็น Int ได้เมื่อเป็นเลขล้วน
const numericId = (v: string | null): number | null => (v && /^\d+$/.test(v) ? Number(v) : null);

export const auditLogRouter = router({
  // ============================================================
  // LIST — log ล่าสุดเรียงใหม่→เก่า / filter รายคน + ช่วงวันที่ + ประเภทได้
  // scope ตาม role (เหมือน workPlan): ENGINEER เห็นเฉพาะ log ของตัวเอง / CEO เห็นทุกคน + filter รายคนได้
  // from/to เป็น instant UTC ที่ฝั่ง web คำนวณจากขอบ "วันไทย" มาแล้ว (to เป็น exclusive = ต้นวันถัดไป)
  //   → กรองที่ where ทำให้ดึง log วันเก่าที่ต้องการได้ตรงๆ ไม่ติด limit ของวันล่าสุด
  // แต่ละแถวถูก enrich ด้วย target (ชื่อแผน + ไซต์) จาก targetId — ให้หน้า log ลิงก์ไปหน้าไซต์ได้
  //   record ที่ถูกลบไปแล้ว resolve ไม่ได้ → target เป็น null (แถวยังโชว์ปกติ แค่ไม่มีลิงก์)
  // ============================================================
  list: protectedProcedure
    .input(
      z.object({
        userId: z.number().int().optional(), // filter รายคน (CEO เท่านั้น — engineer ถูกบังคับเป็นของตัวเอง)
        // filter ประเภทการกระทำ — รับเป็นชุดค่า action ตรงๆ ใน DB (เช่น ["workPlan.start","workPlan.finish"])
        // ฝั่ง web เป็นคนแปลง "รหัสมาตรฐาน" (LOGIN_SUCCESS, WORKPLAN_CREATED, …) เป็นชุดนี้ (ดู lib/log-actions.ts)
        actions: z.array(z.string().min(1).max(64)).min(1).max(20).optional(),
        // ตัด action ที่ไม่อยากเห็นออก — ฝั่ง web ใช้ซ่อน ui.click ในโหมดปกติ (click ถี่จนกลบเหตุการณ์สำคัญ)
        excludeActions: z.array(z.string().min(1).max(64)).min(1).max(20).optional(),
        from: z.date().optional(), // gte — รวมตั้งแต่ instant นี้
        to: z.date().optional(), // lt — ไม่รวม instant นี้ (web ส่งต้นวันถัดไปมาให้ครอบทั้งวัน "ถึง")
        limit: z.number().int().min(1).max(200).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const logs = await ctx.prisma.auditLog.findMany({
        where: {
          // engineer ล็อกไว้ที่ log ตัวเองเสมอ (กัน log คนอื่นรั่ว) — CEO ถึงจะ filter รายคนได้
          ...(ctx.user.role === "ENGINEER"
            ? { userId: ctx.user.sub }
            : input.userId
              ? { userId: input.userId }
              : {}),
          ...(input.actions || input.excludeActions
            ? {
                action: {
                  ...(input.actions ? { in: input.actions } : {}),
                  ...(input.excludeActions ? { notIn: input.excludeActions } : {}),
                },
              }
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

      // resolve targetId → ชื่อแผน/ไซต์ในครั้งเดียว (query เพิ่ม 2 ครั้งต่อหน้า ไม่ใช่ต่อแถว)
      const planIds = new Set<number>();
      const siteIds = new Set<number>();
      for (const log of logs) {
        const id = numericId(log.targetId);
        if (id === null) continue;
        if (log.action.startsWith("workPlan.")) planIds.add(id);
        else if (log.action.startsWith("site.")) siteIds.add(id);
      }
      const [plans, sites] = await Promise.all([
        planIds.size
          ? ctx.prisma.workPlan.findMany({
              where: { id: { in: [...planIds] } },
              select: { id: true, name: true, site: { select: { id: true, name: true } } },
            })
          : [],
        siteIds.size
          ? ctx.prisma.site.findMany({
              where: { id: { in: [...siteIds] } },
              select: { id: true, name: true },
            })
          : [],
      ]);
      const planById = new Map(plans.map((p) => [p.id, p]));
      const siteById = new Map(sites.map((s) => [s.id, s]));

      return logs.map((log) => {
        const id = numericId(log.targetId);
        let target: { planName?: string; siteId: number; siteName: string } | null = null;
        if (id !== null && log.action.startsWith("workPlan.")) {
          const p = planById.get(id);
          if (p) target = { planName: p.name, siteId: p.site.id, siteName: p.site.name };
        } else if (id !== null && log.action.startsWith("site.")) {
          const s = siteById.get(id);
          if (s) target = { siteId: s.id, siteName: s.name };
        }
        return { ...log, target };
      });
    }),

  // ============================================================
  // USERS — รายชื่อผู้ใช้ทั้งหมดสำหรับ dropdown "กรองรายคน" ของหน้า log (CEO เท่านั้น)
  // engineer ไม่ต้องใช้ — log ของเขาถูก scope เป็นของตัวเองอยู่แล้ว
  // ============================================================
  users: ceoProcedure.query(({ ctx }) =>
    ctx.prisma.user.findMany({
      select: { id: true, name: true, color: true },
      orderBy: { id: "asc" },
    }),
  ),

  // ============================================================
  // SUMMARY — สรุปเหตุการณ์ในช่วงเวลา (หน้า log ส่งขอบ "วันนี้" ตามเวลาไทยมา) — CEO เท่านั้น
  // ตอบ 3 คำถามแรกของผู้บริหาร: ใครเข้าระบบแล้วบ้าง (และใครยังไม่เข้า) /
  // วันนี้ทีมทำอะไรไปเท่าไหร่ / มีเหตุการณ์อันตรายไหม (ลบแผน, login ไม่สำเร็จ)
  // ============================================================
  summary: ceoProcedure
    .input(z.object({ from: z.date(), to: z.date() })) // to เป็น exclusive เหมือน list
    .query(async ({ ctx, input }) => {
      const range = { gte: input.from, lt: input.to };
      const [users, actionCounts, loginRows] = await Promise.all([
        ctx.prisma.user.findMany({
          select: { id: true, name: true, color: true },
          orderBy: { id: "asc" },
        }),
        ctx.prisma.auditLog.groupBy({
          by: ["action"],
          where: { createdAt: range, action: { in: SUMMARY_ACTIONS } },
          _count: { _all: true },
        }),
        // distinct userId ของ event login → รู้ว่า "ใคร" เข้าแล้ว (ไม่ใช่แค่กี่ครั้ง)
        ctx.prisma.auditLog.findMany({
          where: { createdAt: range, action: "auth.login" },
          distinct: ["userId"],
          select: { userId: true },
        }),
      ]);

      const countOf = (...actions: string[]) =>
        actionCounts
          .filter((c) => actions.includes(c.action))
          .reduce((sum, c) => sum + c._count._all, 0);
      const loggedIn = new Set(loginRows.map((r) => r.userId));

      return {
        // roster ทุกคน + flag ว่าเข้าระบบในช่วงนี้หรือยัง — หน้า log ใช้โชว์ "ใครยังไม่เข้า"
        users: users.map((u) => ({ ...u, loggedIn: loggedIn.has(u.id) })),
        planCreated: countOf("workPlan.create"),
        planUpdated: countOf("workPlan.update"),
        planDeleted: countOf("workPlan.delete"),
        statusChanged: countOf("workPlan.start", "workPlan.unstart", "workPlan.finish"),
        loginFailed: countOf("LOGIN_FAILED"),
      };
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
