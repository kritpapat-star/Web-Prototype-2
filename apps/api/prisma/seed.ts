// apps/api/prisma/seed.ts
// Seed: 1 CEO + 3 Engineers, 12 WorkPlans กระจายทั้งเดือน ก.ค. 2026
// ครอบคลุมทุก computed status เพื่อทดสอบปฏิทิน / สิ่งที่ต้องทำ / สรุป:
//   - COMPLETED (ตรงเวลา และ เสร็จช้า + delayEndReason)
//   - IN_PROGRESS (ตรงแผน และ เริ่มช้า + delayStartReason)
//   - IN_PROGRESS_OVERDUE (เลย endDate แล้วยังไม่จบ)
//   - NOT_STARTED (แผนอนาคต)
//   - NOT_STARTED_OVERDUE (เลย startDate แล้วยังไม่เริ่ม)
//
// Idempotent: ใช้ upsert ทั้ง users (key=username) และ workPlans (key=id คงที่)
// รันซ้ำกี่ครั้งก็ไม่ลบ/ไม่ duplicate — ปลอดภัยต่อข้อมูลจริง (ไม่มี deleteMany)

import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// รหัสผ่าน dev สำหรับทุก user ใน seed
// (production ต้องเปลี่ยน + บังคับตั้งรหัสใหม่)
const DEV_PASSWORD = "Uu5100785";

// helper: สร้าง Date แบบ UTC เที่ยงคืน สำหรับ column @db.Date
const d = (day: number, month = 7, year = 2026) =>
  new Date(Date.UTC(year, month - 1, day));

// helper: timestamp จริง (มีเวลา) สำหรับ actStart / actEnd
const t = (day: number, hour: number, minute = 0, month = 7, year = 2026) =>
  new Date(Date.UTC(year, month - 1, day, hour - 7, minute)); // ICT = UTC+7

async function main() {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

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
  await prisma.user.upsert({
    where: { username: "nongnoom" },
    update: { passwordHash, name: "nongnoom", role: Role.CEO, color: "#6366f1" },
    create: { username: "nongnoom", passwordHash, name: "nongnoom", role: Role.CEO, color: "#6366f1" },
  });

  await prisma.user.upsert({
    where: { username: "tawan" },
    update: { passwordHash, name: "Tawan", role: Role.ENGINEER, color: "#0ea5e9" },
    create: { username: "tawan", passwordHash, name: "Tawan", role: Role.ENGINEER, color: "#0ea5e9" },
  });

  await prisma.user.upsert({
    where: { username: "earth" },
    update: { passwordHash, name: "Earth", role: Role.ENGINEER, color: "#f59e0b" },
    create: { username: "earth", passwordHash, name: "Earth", role: Role.ENGINEER, color: "#f59e0b" },
  });

  await prisma.user.upsert({
    where: { username: "ohm" },
    update: { passwordHash, name: "Ohm", role: Role.ENGINEER, color: "#10b981" },
    create: { username: "ohm", passwordHash, name: "Ohm", role: Role.ENGINEER, color: "#10b981" },
  });

  // resolve id จาก username (ค่าคงที่ใน seed) เพื่อใช้ผูก workPlan.userId
  const [tawan, bank, nut] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { username: "tawan" } }),
    prisma.user.findUniqueOrThrow({ where: { username: "earth" } }),
    prisma.user.findUniqueOrThrow({ where: { username: "ohm" } }),
  ]);

  // ---------- Sites (upsert คีย์ id คงที่) ----------
  // 1 ไซต์ต่อ 1 แผน seed (id ตรงกับ siteId ของแผนด้านล่าง) — ตรงกับ placeholder ที่
  // migration 20260711074613_link_work_plan_site backfill ให้ DB ที่มีข้อมูลเดิม → รันซ้ำแล้วได้ชื่อจริงทับ
  // types ของไซต์ต้องครอบ type ของแผนที่ใช้ไซต์นั้น (กติกา site↔type ใน workPlan.create)
  // ไซต์ 8 กับ 9 จงใจมีหลายประเภท — ไว้ทดสอบ dropdown กรองตามประเภทใน PlanModal
  const sites: Array<{ id: number; name: string; typeIds: string[] }> = [
    { id: 1, name: "โกดังลำพูน เฟส 1", typeIds: ["2"] },
    { id: 2, name: "โกดังลำพูน เฟส 2", typeIds: ["2"] },
    { id: 3, name: "หมู่บ้านสันกำแพง (จุดสำรวจ)", typeIds: ["2"] },
    { id: 4, name: "หมู่บ้านสันกำแพง", typeIds: ["2"] },
    { id: 5, name: "บ้านคุณทราย", typeIds: ["1"] },
    { id: 6, name: "บ้านคุณทราย (ระบบไฟ)", typeIds: ["1"] },
    { id: 7, name: "บ้านคุณทราย (ส่งมอบ)", typeIds: ["1"] },
    { id: 8, name: "โรงงานลำปาง", typeIds: ["1", "4"] }, // Solar + IOT
    { id: 9, name: "สำนักงานใหม่", typeIds: ["3", "2"] }, // Network + CCTV
    { id: 10, name: "ร้านกาแฟ ชั้น 2", typeIds: ["3"] },
    { id: 11, name: "โรงเรียนดอยสะเก็ด", typeIds: ["3"] },
    { id: 12, name: "สำนักงานทีม", typeIds: ["3"] },
  ];
  for (const s of sites) {
    await prisma.site.upsert({
      where: { id: s.id },
      // set (ไม่ใช่ connect) ตอน update — ให้รายการประเภทตรงตาม seed เสมอแม้ DB มีของเก่าค้าง
      update: { name: s.name, types: { set: s.typeIds.map((id) => ({ id })) } },
      create: { id: s.id, name: s.name, types: { connect: s.typeIds.map((id) => ({ id })) } },
    });
  }

  // ---------- WorkPlans (upsert คีย์ id คงที่) ----------
  // id คงที่ 1..12 (เลขรัน) → รันซ้ำได้โดยไม่ duplicate/ลบ — ดัน sequence ต่อท้ายด้านล่าง
  // siteId เป็น FK → sites.id (ตรงกับ Sites ด้านบน 1:1) — sequence site_id_seq เดิมถูก drop แล้ว
  // type set ตรงๆ ต่อแผน (เดิมเคยฝังไว้ใน prefix ของเลขรัน — เลิกใช้แล้วเพราะมี column type)
  // ค่าเป็น types.id (FK) — ต้องตรงกับ Types ด้านบน
  const plans: Array<{
    id: number;
    siteId: number;
    userId: number;
    name: string;
    type: string;
    startDate: Date;
    endDate: Date;
    actStart?: Date;
    actEnd?: Date;
    delayStartReason?: string;
    delayEndReason?: string;
  }> = [
    // --- Tawan (CCTV) ---
    {
      // COMPLETED ตรงเวลา (จบไปแล้วเมื่อวาน)
      id: 1,
      siteId: 1,
      userId: tawan.id,
      name: "ติดตั้ง CCTV โกดังลำพูน เฟส 1",
      type: "2",
      startDate: d(29, 6),
      endDate: d(1),
      actStart: t(29, 8, 30, 6),
      actEnd: t(1, 16, 45),
    },
    {
      // IN_PROGRESS ตรงแผน (วันนี้อยู่ในช่วง)
      id: 2,
      siteId: 2,
      userId: tawan.id,
      name: "เดินสาย + config NVR เฟส 2",
      type: "2", // CCTV
      startDate: d(2),
      endDate: d(4),
      actStart: t(2, 9, 0),
    },
    {
      // NOT_STARTED แผนอนาคต
      id: 3,
      siteId: 3,
      userId: tawan.id,
      name: "สำรวจหน้างาน CCTV หมู่บ้านสันกำแพง",
      type: "2", // CCTV
      startDate: d(8),
      endDate: d(8),
    },
    {
      // NOT_STARTED แผนอนาคต (แถบยาวข้ามสัปดาห์ ทดสอบ multi-day bar)
      id: 4,
      siteId: 4,
      userId: tawan.id,
      name: "ติดตั้ง CCTV หมู่บ้านสันกำแพง",
      type: "2", // CCTV
      startDate: d(13),
      endDate: d(17),
    },

    // --- Bank (SOLAR) ---
    {
      // COMPLETED แต่เสร็จช้า → มี delayEndReason
      id: 5,
      siteId: 5,
      userId: bank.id,
      name: "ติดตั้งแผงโซลาร์ บ้านคุณทราย",
      type: "1", // Solar Cell
      startDate: d(25, 6),
      endDate: d(30, 6),
      actStart: t(25, 8, 0, 6),
      actEnd: t(1, 15, 30),
      delayEndReason: "ฝนตกหนัก 2 วัน ขึ้นหลังคาไม่ได้",
    },
    {
      // IN_PROGRESS แต่เริ่มช้า → มี delayStartReason
      id: 6,
      siteId: 6,
      userId: bank.id,
      name: "เดินสาย DC + ติดตั้ง inverter",
      type: "1", // Solar Cell
      startDate: d(1),
      endDate: d(3),
      actStart: t(2, 10, 30),
      delayStartReason: "รอ inverter จาก supplier ส่งช้า 1 วัน",
    },
    {
      // NOT_STARTED แผนอนาคต
      id: 7,
      siteId: 7,
      userId: bank.id,
      name: "ทดสอบระบบ + ส่งมอบงานโซลาร์",
      type: "1", // Solar Cell
      startDate: d(6),
      endDate: d(6),
    },
    {
      // NOT_STARTED แผนปลายเดือน
      id: 8,
      siteId: 8,
      userId: bank.id,
      name: "สำรวจหลังคาโรงงานลำปาง",
      type: "1", // Solar Cell
      startDate: d(21),
      endDate: d(22),
    },

    // --- Nut (NETWORK) ---
    {
      // IN_PROGRESS_OVERDUE: เริ่มแล้ว แต่เลย endDate มาแล้วยังไม่จบ
      id: 9,
      siteId: 9,
      userId: nut.id,
      name: "วางระบบ network สำนักงานใหม่",
      type: "3", // Network
      startDate: d(26, 6),
      endDate: d(30, 6),
      actStart: t(26, 9, 0, 6),
    },
    {
      // NOT_STARTED_OVERDUE: เลย startDate แล้วยังไม่กดเริ่ม
      id: 10,
      siteId: 10,
      userId: nut.id,
      name: "ย้ายจุด AP ชั้น 2 ร้านกาแฟ",
      type: "3", // Network
      startDate: d(1),
      endDate: d(2),
    },
    {
      // NOT_STARTED อนาคตกลางเดือน
      id: 11,
      siteId: 11,
      userId: nut.id,
      name: "เดินสาย LAN โรงเรียนดอยสะเก็ด",
      type: "3", // Network
      startDate: d(15),
      endDate: d(16),
    },
    {
      // NOT_STARTED ปลายเดือน (ทดสอบ event วันที่ 30 ตามรูปปฏิทิน)
      id: 12,
      siteId: 12,
      userId: nut.id,
      name: "เตรียมอุปกรณ์ + ประชุมทีม CCTV",
      type: "3", // Network
      startDate: d(30),
      endDate: d(30),
    },
  ];

  for (const plan of plans) {
    await prisma.workPlan.upsert({
      where: { id: plan.id },
      update: plan,
      create: plan,
    });
  }

  // ดัน sequence ให้ record ที่สร้างใหม่เริ่มต่อจาก seed (13, …) กันชนเลข 1..12 ที่ fix ไว้
  //   sites_id_seq      — autoincrement ของ sites.id (seed ใส่ id ตรงๆ sequence เลยไม่ขยับ)
  //   work_plans_id_seq — autoincrement ของ work_plans.id (เหตุผลเดียวกัน)
  // advance-only ด้วย GREATEST: ถ้า sequence เลยไปแล้ว (มีข้อมูลจริง) จะไม่ถอยเลขกลับ
  await prisma.$executeRawUnsafe(
    `SELECT setval('sites_id_seq', GREATEST((SELECT last_value FROM sites_id_seq), ${sites.length}))`,
  );
  await prisma.$executeRawUnsafe(
    `SELECT setval('work_plans_id_seq', GREATEST((SELECT last_value FROM work_plans_id_seq), ${plans.length}))`,
  );

  const counts = await prisma.workPlan.groupBy({
    by: ["userId"],
    _count: true,
  });
  const typeCounts = await prisma.workPlan.groupBy({ by: ["type"], _count: true });
  console.log("Seed เสร็จ ✅ (idempotent — รันซ้ำไม่ลบ/ไม่ duplicate)");
  console.log("WorkPlans per user:", counts);
  console.log("WorkPlans per type:", typeCounts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
