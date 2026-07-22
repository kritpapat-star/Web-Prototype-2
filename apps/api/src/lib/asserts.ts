// apps/api/src/lib/asserts.ts
// เช็คความถูกต้องของ type/site ที่ client ส่งมา — ย้ายมาจาก workPlan.ts (18 ก.ค. 2026)
// เพราะ ticket.ts ใช้กติกาเดียวกัน (zod schema ยังอยู่ติด router ของใครของมันตาม convention)

import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";

// type ต้องมีจริงใน table types — เช็คเองเพื่อให้ error เป็นภาษาไทย แทน FK error ดิบจาก Postgres
export async function assertTypeExists(prisma: PrismaClient, typeId: number | undefined) {
  if (!typeId) return;
  const found = await prisma.type.findUnique({ where: { id: typeId } });
  if (!found) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "ประเภทงานไม่ถูกต้อง" });
  }
}

// ไซต์ต้องมีจริง — ใช้ตอนเปิด/แก้ใบแจ้งซ่อม (siteId optional: null/undefined = ข้าม ไม่เช็ค)
// ไม่เช็ค type↔site match (lenient intake) — match เช็คที่ workPlan.create (ตอน accept) เท่านั้น
export async function assertSiteExists(prisma: PrismaClient, siteId: number | undefined | null) {
  if (siteId == null) return;
  const found = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true } });
  if (!found) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "ไม่พบไซต์งานที่เลือก" });
  }
}

// ไซต์ต้องมีจริง + รองรับประเภทงานของแผน (dropdown ฝั่ง web กรองให้แล้ว — เช็คซ้ำกันยิงตรง/client เก่า)
// type เป็น null ได้เฉพาะแผนเก่าก่อนบังคับประเภท (ตอน update ที่ไม่ได้แตะ type) — เช็คแค่ไซต์มีจริง
export async function assertSiteMatchesType(
  prisma: PrismaClient,
  siteId: number,
  typeId: number | null,
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
