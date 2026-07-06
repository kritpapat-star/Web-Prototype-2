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
export type JwtPayload = {
  sub: string; // user id
  role: "CEO" | "ENGINEER";
  name: string;
};

// ---------- DEV BYPASS (ชั่วคราว — ลบทั้ง block นี้เมื่อเปิด login กลับ) ----------
// ⚠️ ปิดหน้า login ชั่วคราว: request ที่ไม่มี token / token ใช้ไม่ได้ จะถูกนับเป็น "tawan" อัตโนมัติ
// วิธีเอาออก: ลบ block นี้ + ลบบรรทัดที่เรียก devBypassUser() ใน createContext
const DEV_BYPASS_USERNAME = "tawan";
let devBypassCache: JwtPayload | null = null;
async function devBypassUser(): Promise<JwtPayload | null> {
  if (!devBypassCache) {
    const u = await prisma.user.findUnique({ where: { username: DEV_BYPASS_USERNAME } });
    if (u) devBypassCache = { sub: u.id, role: u.role, name: u.name };
  }
  return devBypassCache;
}

// ---------- CONTEXT ----------
// สร้างต่อ 1 request: อ่าน "Authorization: Bearer <token>" → verify → ได้ user
// verify ไม่ผ่าน = user เป็น null (ให้ middleware เป็นคนตัดสินใจว่า route ไหนต้อง login)
export async function createContext({ req }: { req: { headers: Record<string, string | string[] | undefined> } }) {
  let user: JwtPayload | null = null;

  const header = req.headers.authorization;
  const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : null;

  if (token) {
    try {
      user = jwt.verify(token, JWT_SECRET) as JwtPayload;
    } catch {
      user = null; // token หมดอายุ/ปลอม — ปฏิบัติเหมือนไม่ได้ login
    }
  }

  // ⚠️ DEV BYPASS: ไม่มี token ก็ให้เป็น tawan ไปก่อน (ลบบรรทัดนี้เมื่อเปิด login กลับ)
  if (!user) user = await devBypassUser();

  return { prisma, user };
}
export type Context = Awaited<ReturnType<typeof createContext>>;

// ---------- INIT ----------
const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

// ต้อง login (มี JWT ที่ verify ผ่าน)
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "กรุณา login ก่อน" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } }); // narrow: user ไม่เป็น null แล้ว
});

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
