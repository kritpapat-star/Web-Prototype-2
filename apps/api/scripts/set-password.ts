// apps/api/scripts/set-password.ts
// เปลี่ยนรหัสผ่าน user รายคน — ใช้ตอน onboard production เพราะ seed ไม่ reset รหัส user เดิมแล้ว
//
// วิธีใช้ (cd apps/api หรือ exec เข้า api container):
//   pnpm user:password <username> <รหัสใหม่>
//   echo "รหัสใหม่" | pnpm user:password <username>   # กันรหัสค้างใน shell history
//
// ต้องการแค่ DATABASE_URL — Prisma Client โหลด .env ให้เองตอน dev / container มี env อยู่แล้ว

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const MIN_LENGTH = 8;

async function main() {
  const [username, passwordArg] = process.argv.slice(2);
  if (!username) {
    console.error("วิธีใช้: pnpm user:password <username> <รหัสใหม่>  (หรือ pipe รหัสเข้า stdin)");
    process.exit(1);
  }

  // ไม่ส่งรหัสเป็น argument ก็อ่านจาก stdin (fd 0) — เหมาะกับการ pipe
  const password = (passwordArg ?? readFileSync(0, "utf8")).trim();
  if (password.length < MIN_LENGTH) {
    console.error(`รหัสผ่านต้องยาวอย่างน้อย ${MIN_LENGTH} ตัวอักษร`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.update({
      where: { username: username.toLowerCase().trim() },
      data: { passwordHash },
      select: { id: true, username: true, name: true, role: true },
    });
    console.log(`เปลี่ยนรหัสผ่านสำเร็จ: ${user.username} (${user.name}, ${user.role}, id=${user.id})`);
    console.log("token เดิมที่ login ค้างไว้ยังใช้ได้จนหมดอายุ 12 ชม. — ถ้าต้องเด้งทันทีให้ rotate JWT_SECRET");
  } catch (err) {
    // P2025 = ไม่เจอ record ตาม where
    if ((err as { code?: string }).code === "P2025") {
      console.error(`ไม่พบ user "${username}" — เช็ครายชื่อด้วย pnpm db:studio`);
      process.exit(1);
    }
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
