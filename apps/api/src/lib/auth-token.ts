// apps/api/src/lib/auth-token.ts
// verify JWT ที่เดียว — ใช้ทั้ง tRPC context (trpc.ts) และ endpoint อัปโหลดรูปนอก tRPC (uploads.ts)
// แยกออกมาตอนทำระบบแจ้งซ่อม (18 ก.ค. 2026) กันสอง path ตรวจ token คนละกติกา

import jwt from "jsonwebtoken";
import { JWT_SECRET } from "./env";

// payload ที่เราใส่ไว้ใน token ตอน login (ดู routers/auth.ts)
// sub เป็นเลขรัน users.id (Int) — จงใจไม่ตาม RFC ที่ให้ sub เป็น string
// เพราะใช้ token ภายในระบบเดียว และ query Prisma ได้ตรงๆ ไม่ต้อง parse
export type JwtPayload = {
  sub: number; // user id (เลขรัน 1, 2, 3, …)
  role: "CEO" | "ENGINEER";
  name: string;
};

// verify ไม่ผ่าน = null (ให้ผู้เรียกตัดสินใจเองว่า route นั้นต้อง login ไหม)
export function verifyToken(token: string | null | undefined): JwtPayload | null {
  if (!token) return null;
  try {
    // ผ่าน unknown เพราะ type ของ lib กำหนด sub?: string แต่ของเรา sub เป็นเลขรัน (ดู JwtPayload)
    const user = jwt.verify(token, JWT_SECRET) as unknown as JwtPayload;
    // token รุ่นเก่า sub เป็น cuid (string) — ชี้ user ที่ renumber เป็นเลขไปแล้ว ให้ login ใหม่
    if (typeof user.sub !== "number") return null;
    return user;
  } catch {
    return null; // token หมดอายุ/ปลอม — ปฏิบัติเหมือนไม่ได้ login
  }
}
