// apps/api/src/trpc.ts
// tRPC init สำหรับ API server แยก (แบบ B)
// เปลี่ยนจาก NextAuth session → verify JWT จาก Authorization header
// middleware (protectedProcedure / engineerProcedure) เหมือนเดิมทุกบรรทัด

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { prisma } from "./db";
import { verifyToken, type JwtPayload } from "./lib/auth-token"; // verify + type ย้ายไปที่เดียว (uploads.ts ใช้ด้วย)

export type { JwtPayload }; // re-export — auth.ts (และคนอื่น) import จากที่นี่ตามเดิม

// ---------- CONTEXT ----------
// สร้างต่อ 1 request: อ่าน "Authorization: Bearer <token>" → verify → ได้ user
// verify ไม่ผ่าน = user เป็น null (ให้ middleware เป็นคนตัดสินใจว่า route ไหนต้อง login)
// ip ใช้เป็น key ของ rate limit ตอน login (ดู routers/auth.ts) + เก็บลง audit log:
// production อยู่หลัง Cloudflare Tunnel → req.ip เป็น IP ภายใน docker ของ cloudflared เสมอ
// ต้องอ่าน CF-Connecting-IP (IP จริงของ browser ที่ Cloudflare แนบมา) ก่อน — เชื่อ header นี้ได้
// เพราะ api ไม่มี port สาธารณะ (loopback + docker network เท่านั้น) ทางเข้าเดียวคือผ่าน Cloudflare
// dev ไม่มี header นี้ → ตกกลับ req.ip ตามเดิม
export async function createContext({
  req,
}: {
  req: { headers: Record<string, string | string[] | undefined>; ip?: string };
}) {
  const header = req.headers.authorization;
  const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : null;
  const user: JwtPayload | null = verifyToken(token); // กติกา verify อยู่ใน lib/auth-token.ts ที่เดียว

  // ช่องให้ handler ฝาก detail เพิ่มเข้า audit log ได้ (server-observed truth ที่ raw input ไม่มี
  // — เช่น site.update ฝากชื่อเดิมก่อนแก้) auditMutation รวมค่านี้เข้า detail ตอนเขียน log
  // สร้างใหม่ต่อ 1 request จึงไม่รั่วข้าม request
  const audit: Record<string, unknown> = {};
  const cfIp = req.headers["cf-connecting-ip"];
  const ip = (typeof cfIp === "string" && cfIp) || req.ip || "unknown";
  return { prisma, user, ip, audit };
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
  // log.track เขียน record คลิกของตัวเองแล้ว — ข้าม กันเขียน log ซ้อน (action="log.track" ครอบ events)
  if (type === "mutation" && result.ok && ctx.user && path !== "log.track") {
    try {
      // raw input ผ่าน zod ของ procedure มาแล้ว (result.ok) — แปลงผ่าน JSON ให้ Date เป็น ISO string
      const rawInput = await getRawInput();
      let detail = rawInput === undefined ? undefined : JSON.parse(JSON.stringify(rawInput));
      // handler อาจฝาก detail เพิ่มไว้ที่ ctx.audit (ดู createContext) — รวมเข้า detail ที่จะเก็บ
      if (Object.keys(ctx.audit).length > 0) detail = { ...(detail ?? {}), ...ctx.audit };
      // id เป็นได้ทั้ง string (เช่น types.id) และ number (เลขรัน เช่น WorkPlan) — targetId เก็บเป็น text เสมอ
      const data = result.data as { id?: unknown } | undefined;
      const idOf = (v: unknown) =>
        typeof v === "string" ? v : typeof v === "number" ? String(v) : null;
      const targetId =
        idOf(detail?.id) ?? // update/start/finish ส่ง id มาใน input
        idOf(data?.id); // create เพิ่งได้ id จากผลลัพธ์

      await prisma.log.create({
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

// เฉพาะ ENGINEER
// 24 ก.ค. 2026 (เจ้าของสั่ง): WorkPlan/site.create เปิดให้ CEO แล้ว (protectedProcedure + เช็ค ownership)
// ชั้นนี้เหลือใช้กับ: ticket.accept (รับเป็นแผนงาน) + site.update/site.delete เท่านั้น
export const engineerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "ENGINEER") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "เฉพาะ Engineer เท่านั้น",
    });
  }
  return next({ ctx });
});

// เฉพาะ CEO — ใช้กับ query ฝั่งผู้บริหาร: log.users + log.summary (แถบสรุปหน้า log)
// (log.list ยังเปิดให้ทุก role โดย scope เป็นรายคนที่ query แทน)
export const ceoProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "CEO") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "เฉพาะ CEO เท่านั้น",
    });
  }
  return next({ ctx });
});
