// apps/api/src/db.ts
// Prisma client ตัวเดียวทั้ง process — api เป็น container เดียวที่ถือ DATABASE_URL
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
