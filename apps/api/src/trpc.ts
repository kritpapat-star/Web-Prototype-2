// apps/api/src/trpc.ts
// tRPC init สำหรับ API server แยก (แบบ B)
// เปลี่ยนจาก NextAuth session → verify JWT จาก Authorization header
// middleware (protectedProcedure / engineerProcedure) เหมือนเดิมทุกบรรทัด

import { initTRPC, TRPCError } from "@trpc/server";
import jwt from "jsonwebtoken";
import superjson from "superjson";
import { prisma } from "./db";

const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) throw new Error("ต้องตั้ง JWT_SECRET ใน .env");

// payload ที่เราใส่ไว้ใน token ตอน login
// sub เป็นเลขรัน users.id (Int) — จงใจไม่ตาม RFC ที่ให้ sub เป็น string
// เพราะใช้ token ภายในระบบเดียว และ query Prisma ได้ตรงๆ ไม่ต้อง parse
export type JwtPayload = {
  sub: number; // user id (เลขรัน 1, 2, 3, …)
  role: "CEO" | "ENGINEER";
  name: string;
};

// ---------- CONTEXT ----------
// สร้างต่อ 1 request: อ่าน "Authorization: Bearer <token>" → verify → ได้ user
// verify ไม่ผ่าน = user เป็น null (ให้ middleware เป็นคนตัดสินใจว่า route ไหนต้อง login)
export async function createContext({ req }: { req: { headers: Record<string, string | string[] | undefined> } }) {
  let user: JwtPayload | null = null;

  const header = req.headers.authorization;
  const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : null;

  if (token) {
    try {
      // ผ่าน unknown เพราะ type ของ lib กำหนด sub?: string แต่ของเรา sub เป็นเลขรัน (ดู JwtPayload)
      user = jwt.verify(token, JWT_SECRET) as unknown as JwtPayload;
      // token รุ่นเก่า sub เป็น cuid (string) — ชี้ user ที่ renumber เป็นเลขไปแล้ว ให้ login ใหม่
      if (typeof user.sub !== "number") user = null;
    } catch {
      user = null; // token หมดอายุ/ปลอม — ปฏิบัติเหมือนไม่ได้ login
    }
  }

  return { prisma, user };
}
export type Context = Awaited<ReturnType<typeof createContext>>;

// ---------- INIT ----------
const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

// ---------- AUDIT LOG ----------
// เก็บทุก mutation ที่สำเร็จลงตาราง audit_logs (append-only — ห้ามมี update/delete)
// แขวนกับ protectedProcedure → mutation ที่เพิ่มใหม่ในอนาคตถูก log อัตโนมัติ ไม่ต้องเรียกเอง
// (auth.login เป็น publicProcedure — log แยกใน routers/auth.ts เพราะตอนเรียกยังไม่มี ctx.user)
const auditMutation = t.middleware(async ({ ctx, type, path, getRawInput, next }) => {
  const result = await next();

  // query ไม่ log (เสียงรบกวน) / mutation ที่ fail ไม่ log (ไม่มีอะไรเปลี่ยนใน DB)
  // auditLog.track เขียน record คลิกของตัวเองแล้ว — ข้าม กันเขียน log ซ้อน (action="auditLog.track" ครอบ events)
  if (type === "mutation" && result.ok && ctx.user && path !== "auditLog.track") {
    try {
      // raw input ผ่าน zod ของ procedure มาแล้ว (result.ok) — แปลงผ่าน JSON ให้ Date เป็น ISO string
      const rawInput = await getRawInput();
      const detail = rawInput === undefined ? undefined : JSON.parse(JSON.stringify(rawInput));
      // id เป็นได้ทั้ง string (เช่น types.id) และ number (เลขรัน เช่น WorkPlan) — targetId เก็บเป็น text เสมอ
      const data = result.data as { id?: unknown } | undefined;
      const idOf = (v: unknown) =>
        typeof v === "string" ? v : typeof v === "number" ? String(v) : null;
      const targetId =
        idOf(detail?.id) ?? // update/start/finish ส่ง id มาใน input
        idOf(data?.id); // create เพิ่งได้ id จากผลลัพธ์

      await prisma.auditLog.create({
        data: { userId: ctx.user.sub, action: path, targetId, detail },
      });
    } catch (err) {
      // เขียน log พลาดต้องไม่ทำให้ mutation ที่สำเร็จแล้วพังตาม
      console.error("เขียน audit log ไม่สำเร็จ:", err);
    }
  }

  return result;
});

// ต้อง login (มี JWT ที่ verify ผ่าน)
export const protectedProcedure = t.procedure
  .use(({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "กรุณา login ก่อน" });
    }
    return next({ ctx: { ...ctx, user: ctx.user } }); // narrow: user ไม่เป็น null แล้ว
  })
  .use(auditMutation);

// เฉพาะ ENGINEER (CEO ดูอย่างเดียว ห้าม mutate WorkPlan)
export const engineerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "ENGINEER") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "เฉพาะ Engineer เท่านั้นที่แก้ไขแผนงานได้ (CEO ดูอย่างเดียว)",
    });
  }
  return next({ ctx });
});

// เฉพาะ CEO — primitive สำรองไว้สำหรับหน้าเฉพาะผู้บริหาร (ตอนนี้ยังไม่มี router ไหนใช้:
// auditLog.list เปิดให้ทุก role แล้วโดย scope เป็นรายคนที่ query แทน)
export const ceoProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "CEO") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "เฉพาะ CEO เท่านั้น",
    });
  }
  return next({ ctx });
});
