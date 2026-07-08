// apps/api/src/routers/auth.ts
// Auth ทำเองใน API server: login → เช็ค bcrypt → ออก JWT
// (มาแทน NextAuth เพราะ architecture แบบ B เว็บกับ API คนละ server)

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { router, publicProcedure, protectedProcedure, type JwtPayload } from "../trpc";

const JWT_SECRET = process.env.JWT_SECRET!;
const TOKEN_TTL = "12h"; // อายุ token — ครอบ 1 กะงานพอดี หมดแล้ว login ใหม่

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
      const user = await ctx.prisma.user.findUnique({
        where: { username: input.username.toLowerCase().trim() },
      });

      // เช็ค user + password แล้วตอบ error เดียวกันทั้งคู่
      // (ไม่บอกว่า "ไม่มี user นี้" — กันคนไล่เดา username)
      const ok = user && (await bcrypt.compare(input.password, user.passwordHash));
      if (!ok) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "username หรือรหัสผ่านไม่ถูกต้อง",
        });
      }

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
