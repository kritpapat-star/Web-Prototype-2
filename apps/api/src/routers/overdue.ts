// apps/api/src/routers/overdue.ts
// งานล่าช้าของ CEO — 1 endpoint:
//   list — ตาราง drill-down (findMany candidate + map เป็น OverdueRow[] + filter/sort ฝั่ง JS)
// นิยาม "ล่าช้า" เปรียบเทียบแผนกับจริง (lib/overdue.ts):
//   START_DUE  = ยังไม่เริ่ม + startDate<today (เลยกำหนดเริ่ม)
//   START_LATE = actStart > startDate (เริ่มช้า)
//   END_DUE    = เริ่มแล้ว ยังไม่จบ + endDate<today (เลยกำหนดจบ)
//   END_LATE   = actEnd > endDate (จบช้า)
// Prisma where เทียบ field กับ value เท่านั้น → ดึง candidate superset แล้วกรอง exact ด้วย isPlanDelayed
// ceoProcedure บล็อก non-CEO ที่ต้นน้ำ → วิศวกรยิงตรง ๆ ได้ 403 (แก้ RBAC รั่วของ v1 ที่คำนวณฝั่ง web)
// ไม่เก็บคอลัมน์ overdue/status — คำนวณตอน query เหมือน planStatus ฝั่ง web
// filter ประเภทงาน (typeId) + งานช้า (delayKind) ทำฝั่ง web จาก OverdueRow ที่ส่งไปครบแล้ว

import { z } from "zod";
import { router, ceoProcedure } from "../trpc";
import { todayICT } from "../lib/dates";
import {
  planDelayedCandidateWhere,
  planDelayKind,
  planDelayDays,
  isPlanDelayed,
  type PlanDelayKind,
} from "../lib/overdue";

// รูป row สำหรับตาราง drill-down ฝั่ง web
// (type ไหลไป web ผ่าน AppRouter อัตโนมัติ → end-to-end type-safe ไม่ต้อง import type แยก)
export interface OverdueRow {
  refId: number; // id แผน
  title: string;
  userId: number;
  userName: string;
  userColor: string;
  siteId: number | null;
  siteName: string | null;
  typeId: number | null; // types.id — สำหรับ chip ประเภทงาน + filter ฝั่ง web
  typeName: string | null;
  startDate: Date; // แผนเริ่ม — @db.Date UTC-midnight
  endDate: Date; // แผนจบ — @db.Date UTC-midnight (โชว์ในคอลัมน์ "กำหนดเปิด-ปิด")
  actStart: Date | null; // เริ่มจริง (timestamp เต็ม) — null ได้
  actEnd: Date | null; // จบจริง — null = ยังไม่จบ
  delayKind: PlanDelayKind; // ประเภทความล่าช้า → label/สี chip ฝั่ง web
  delayDays: number; // ช้ากี่วัน — เป็นคีย์ sort (คำนวณตอน map อยู่แล้ว)
  // แยก 2 เหตุผล ไม่ยุบรวม — แผนที่ทั้งเริ่มช้าและจบช้าเก็บทั้งคู่ (เหมือน DelayTag/banner ฝั่ง dashboard)
  delayStartReason: string | null; // เหตุผลเริ่มช้า/เลยกำหนดเริ่ม
  delayEndReason: string | null; // เหตุผลจบช้า/เลยกำหนดจบ
}

export const overdueRouter = router({
  // ============================================================
  // LIST — ตาราง drill-down งานล่าช้าทุกใบของ Engineer ทุกคน
  //   findMany candidate superset → กรอง exact ด้วย isPlanDelayed → map เป็น OverdueRow[]
  //   filter engineerId (ฝั่ง server) + sort delayDays desc (N เล็ก → JS sort พอ)
  //   filter ประเภทงาน (typeId) + งานช้า (delayKind) ทำฝั่ง web จาก OverdueRow ที่ส่งไปครบ
  // ============================================================
  list: ceoProcedure
    .input(
      z.object({
        engineerId: z.number().int().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const today = todayICT();

      const plans = await ctx.prisma.workPlan.findMany({
        where: planDelayedCandidateWhere(today),
        include: {
          user: { select: { id: true, name: true, color: true } },
          site: { select: { id: true, name: true } },
          typeRef: { select: { id: true, name: true } },
        },
        orderBy: [{ endDate: "asc" }, { createdAt: "asc" }],
      });

      const rows: OverdueRow[] = plans
        .filter((p) => isPlanDelayed(p, today))
        .map((p) => ({
          refId: p.id,
          title: p.name,
          userId: p.user.id,
          userName: p.user.name,
          userColor: p.user.color,
          siteId: p.site?.id ?? null,
          siteName: p.site?.name ?? null,
          typeId: p.type ?? null,
          typeName: p.typeRef?.name ?? null,
          startDate: p.startDate,
          endDate: p.endDate,
          actStart: p.actStart,
          actEnd: p.actEnd,
          delayKind: planDelayKind(p, today)!, // isPlanDelayed การันตี non-null
          delayDays: planDelayDays(p, today),
          delayStartReason: p.delayStartReason,
          delayEndReason: p.delayEndReason,
        }));

      const filtered = rows.filter(
        (r) => input.engineerId === undefined || r.userId === input.engineerId,
      );

      // ช้านานสุดขึ้นก่อน → ชื่อคน → ชื่องาน
      filtered.sort((a, b) => {
        if (b.delayDays !== a.delayDays) return b.delayDays - a.delayDays;
        if (a.userName !== b.userName) return a.userName.localeCompare(b.userName, "th");
        return a.title.localeCompare(b.title, "th");
      });

      return filtered;
    }),
});
