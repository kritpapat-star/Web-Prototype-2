// apps/api/src/routers/auth.ts
// Auth ทำเองใน API server: login → เช็ค bcrypt → ออก JWT
// (มาแทน NextAuth เพราะ architecture แบบ B เว็บกับ API คนละ server)

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { router, publicProcedure, protectedProcedure, type JwtPayload } from "../trpc";
import { JWT_SECRET } from "../lib/env";

const TOKEN_TTL = "12h"; // อายุ token — ครอบ 1 กะงานพอดี หมดแล้ว login ใหม่

// ---------- RATE LIMIT (login เท่านั้น) ----------
// กันเดารหัสแบบ brute force — นับเฉพาะครั้งที่ "ผิด" ต่อคู่ ip+username
// in-memory พอสำหรับ api instance เดียว (restart = นับใหม่ ยอมรับได้)
// ถ้าวันหนึ่ง scale หลาย instance ต้องย้ายไป store กลาง (เช่น redis)
const LOGIN_MAX_FAILS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 นาที
const loginFails = new Map<string, { count: number; resetAt: number }>();

function assertNotRateLimited(key: string) {
  const entry = loginFails.get(key);
  if (!entry) return;
  if (Date.now() >= entry.resetAt) {
    loginFails.delete(key); // หมดหน้าต่างเวลา — เริ่มนับใหม่
    return;
  }
  if (entry.count >= LOGIN_MAX_FAILS) {
    const minutes = Math.ceil((entry.resetAt - Date.now()) / 60_000);
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `login ผิดติดกันหลายครั้ง — ลองใหม่ในอีก ${minutes} นาที`,
    });
  }
}

function recordLoginFail(key: string) {
  // กัน map โตไม่จำกัด: กวาด entry ที่หมดอายุทิ้งเมื่อสะสมเยอะ
  if (loginFails.size > 1000) {
    const now = Date.now();
    for (const [k, v] of loginFails) if (now >= v.resetAt) loginFails.delete(k);
  }
  const entry = loginFails.get(key);
  if (entry && Date.now() < entry.resetAt) entry.count += 1;
  else loginFails.set(key, { count: 1, resetAt: Date.now() + LOGIN_WINDOW_MS });
}

export const authRouter = router({
  // ============================================================
  // LOGIN — public (ยังไม่มี token)
  // ============================================================
  login: publicProcedure
    .input(z.object({
      username: z.string().min(1),
      password: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const username = input.username.toLowerCase().trim();
      const rateKey = `${ctx.ip}|${username}`;
      assertNotRateLimited(rateKey);

      const user = await ctx.prisma.user.findUnique({ where: { username } });

      // เช็ค user + password แล้วตอบ error เดียวกันทั้งคู่
      // (ไม่บอกว่า "ไม่มี user นี้" — กันคนไล่เดา username)
      const ok = user && (await bcrypt.compare(input.password, user.passwordHash));
      if (!ok) {
        recordLoginFail(rateKey);
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "username หรือรหัสผ่านไม่ถูกต้อง",
        });
      }
      loginFails.delete(rateKey); // สำเร็จ — ล้างตัวนับของคู่นี้

      const payload: JwtPayload = { sub: user.id, role: user.role, name: user.name };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });

      // log login ตรงนี้เอง — middleware audit ใน trpc.ts ครอบไม่ถึง publicProcedure
      // ⚠️ ห้ามเก็บ input เด็ดขาด (มี password)
      try {
        await ctx.prisma.auditLog.create({
          data: { userId: user.id, action: "auth.login" },
        });
      } catch (err) {
        console.error("เขียน audit log (login) ไม่สำเร็จ:", err);
      }

      return {
        token,
        user: { id: user.id, name: user.name, role: user.role, color: user.color },
      };
    }),

  // ============================================================
  // ME — เช็คว่า token ยังใช้ได้ + ดึงข้อมูลตัวเอง (ใช้ตอนเปิดแอป)
  // ============================================================
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.user.sub },
      select: { id: true, name: true, role: true, color: true },
    });
    if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
    return user;
  }),
});
