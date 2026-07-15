// apps/api/prisma/seed.ts
// Seed: ข้อมูลโครงสร้างที่ระบบต้องมีเท่านั้น — Types (lookup) + Users
// ไม่มี sites/workPlans ตัวอย่างแล้ว: ลบออกถาวรตามการตัดสินใจ 14 ก.ค. 2026
//   (รวมเคส "กันบั๊ก" เดิม id 1/5/6 ที่ CLAUDE.md เคยห้ามลบ — เจ้าของสั่ง override ให้ตัดทิ้ง)
// ⚠️ หมายเหตุ: การลบ fixture ไม่ได้แปลว่าบั๊กหายไป — ความเสี่ยง query คร่อมเดือน / timezone ±1 วัน
//   ยังอยู่ในโค้ด ถ้าจะเพิ่มเทสต์จับบั๊กพวกนี้กลับมา ให้ทำใน dev seed แยก อย่าปนเข้า production seed
//
// Idempotent: upsert users (key=username) + types (key=id) — รันซ้ำไม่ลบ/ไม่ duplicate (ไม่มี deleteMany)

import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// รหัสผ่านเริ่มต้นของ user ที่ seed "สร้างใหม่" เท่านั้น — user ที่มีอยู่แล้ว
// ไม่ถูก reset รหัส (upsert ด้านล่างไม่ write passwordHash ตอน update)
// production: ห้ามใช้ค่า dev — ต้องส่ง SEED_PASSWORD มาเอง แล้วเปลี่ยนรายคนต่อด้วย
// `pnpm user:password <username> <รหัสใหม่>` (ดู SECURITY.md / DEPLOY.md)
const DEV_PASSWORD = "Uu5100785";
const SEED_PASSWORD = process.env.SEED_PASSWORD || DEV_PASSWORD;
if (process.env.NODE_ENV === "production" && !process.env.SEED_PASSWORD) {
  throw new Error("production ต้องตั้ง SEED_PASSWORD ก่อนรัน seed — ห้ามใช้รหัส dev (ดู DEPLOY.md)");
}

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  // ---------- Types (lookup table — id เป็นเลขลำดับคงที่ ใช้เป็นค่า work_plans.type) ----------
  // ชุดเดียวกับใน migration — upsert กัน drift (จำกัด ~5 ประเภท เรียงตาม id ดู schema.prisma)
  const Types = [
    { id: "1", name: "Solar Cell" },
    { id: "2", name: "CCTV" },
    { id: "3", name: "Network" },
    { id: "4", name: "IOT" },
    { id: "5", name: "Software" },
  ];
  for (const t of Types) {
    await prisma.type.upsert({ where: { id: t.id }, update: t, create: t });
  }

  // ---------- Users (upsert คีย์ username) ----------
  // ⚠️ update ไม่มี passwordHash โดยตั้งใจ — รัน seed ซ้ำต้องไม่ reset รหัสที่ user เปลี่ยนไปแล้ว
  // (เปลี่ยนรหัส user เดิมใช้ `pnpm user:password` แทน — script นั้น update อย่างเดียว สร้าง user ใหม่ไม่ได้
  //  → seed คือทางเดียวที่ bootstrap บัญชี login ได้ ห้ามลบ users บล็อกนี้)
  await prisma.user.upsert({
    where: { username: "nongnoom" },
    update: { name: "nongnoom", role: Role.CEO, color: "#6366f1" },
    create: { username: "nongnoom", passwordHash, name: "nongnoom", role: Role.CEO, color: "#6366f1" },
  });

  await prisma.user.upsert({
    where: { username: "tawan" },
    update: { name: "Tawan", role: Role.ENGINEER, color: "#0ea5e9" },
    create: { username: "tawan", passwordHash, name: "Tawan", role: Role.ENGINEER, color: "#0ea5e9" },
  });

  await prisma.user.upsert({
    where: { username: "earth" },
    update: { name: "Earth", role: Role.ENGINEER, color: "#f59e0b" },
    create: { username: "earth", passwordHash, name: "Earth", role: Role.ENGINEER, color: "#f59e0b" },
  });

  await prisma.user.upsert({
    where: { username: "ohm" },
    update: { name: "Ohm", role: Role.ENGINEER, color: "#10b981" },
    create: { username: "ohm", passwordHash, name: "Ohm", role: Role.ENGINEER, color: "#10b981" },
  });

  // รายงานจำนวนจริงใน DB (seed เป็น upsert ไม่มี delete — sites/workPlans ที่ผู้ใช้สร้างเองไม่ถูกแตะ)
  const [userCount, typeCount, siteCount, planCount] = await Promise.all([
    prisma.user.count(),
    prisma.type.count(),
    prisma.site.count(),
    prisma.workPlan.count(),
  ]);
  console.log("Seed เสร็จ ✅ (idempotent — โครงสร้างล้วน: types + users)");
  console.log(`ใน DB ตอนนี้ — Users: ${userCount} · Types: ${typeCount} · Sites: ${siteCount} · WorkPlans: ${planCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
