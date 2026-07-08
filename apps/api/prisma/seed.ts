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

import { PrismaClient, Role, PlanType } from "@prisma/client";
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

  // ---------- WorkPlans (upsert คีย์ id คงที่) ----------
  // id คงที่ "seed-plan-NN" แทน cuid สุ่ม → รันซ้ำได้โดยไม่ duplicate/ลบ
  // jobId เป็น JOB-NNN (1 แผน = 1 เลข) format เดียวกับ flow จริงที่ gen จาก sequence job_id_seq
  // type set ตรงๆ ต่อแผน (เดิมเคยฝังไว้ใน prefix jobId — เลิกใช้แล้วเพราะมี column type)
  const plans: Array<{
    id: string;
    jobId: string;
    userId: string;
    name: string;
    type: PlanType;
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
      id: "seed-plan-01",
      jobId: "JOB-001",
      userId: tawan.id,
      name: "ติดตั้ง CCTV โกดังลำพูน เฟส 1",
      type: PlanType.CCTV,
      startDate: d(29, 6),
      endDate: d(1),
      actStart: t(29, 8, 30, 6),
      actEnd: t(1, 16, 45),
    },
    {
      // IN_PROGRESS ตรงแผน (วันนี้อยู่ในช่วง)
      id: "seed-plan-02",
      jobId: "JOB-002",
      userId: tawan.id,
      name: "เดินสาย + config NVR เฟส 2",
      type: PlanType.CCTV,
      startDate: d(2),
      endDate: d(4),
      actStart: t(2, 9, 0),
    },
    {
      // NOT_STARTED แผนอนาคต
      id: "seed-plan-03",
      jobId: "JOB-003",
      userId: tawan.id,
      name: "สำรวจหน้างาน CCTV หมู่บ้านสันกำแพง",
      type: PlanType.CCTV,
      startDate: d(8),
      endDate: d(8),
    },
    {
      // NOT_STARTED แผนอนาคต (แถบยาวข้ามสัปดาห์ ทดสอบ multi-day bar)
      id: "seed-plan-04",
      jobId: "JOB-004",
      userId: tawan.id,
      name: "ติดตั้ง CCTV หมู่บ้านสันกำแพง",
      type: PlanType.CCTV,
      startDate: d(13),
      endDate: d(17),
    },

    // --- Bank (SOLAR) ---
    {
      // COMPLETED แต่เสร็จช้า → มี delayEndReason
      id: "seed-plan-05",
      jobId: "JOB-005",
      userId: bank.id,
      name: "ติดตั้งแผงโซลาร์ บ้านคุณทราย",
      type: PlanType.SOLAR,
      startDate: d(25, 6),
      endDate: d(30, 6),
      actStart: t(25, 8, 0, 6),
      actEnd: t(1, 15, 30),
      delayEndReason: "ฝนตกหนัก 2 วัน ขึ้นหลังคาไม่ได้",
    },
    {
      // IN_PROGRESS แต่เริ่มช้า → มี delayStartReason
      id: "seed-plan-06",
      jobId: "JOB-006",
      userId: bank.id,
      name: "เดินสาย DC + ติดตั้ง inverter",
      type: PlanType.SOLAR,
      startDate: d(1),
      endDate: d(3),
      actStart: t(2, 10, 30),
      delayStartReason: "รอ inverter จาก supplier ส่งช้า 1 วัน",
    },
    {
      // NOT_STARTED แผนอนาคต
      id: "seed-plan-07",
      jobId: "JOB-007",
      userId: bank.id,
      name: "ทดสอบระบบ + ส่งมอบงานโซลาร์",
      type: PlanType.SOLAR,
      startDate: d(6),
      endDate: d(6),
    },
    {
      // NOT_STARTED แผนปลายเดือน
      id: "seed-plan-08",
      jobId: "JOB-008",
      userId: bank.id,
      name: "สำรวจหลังคาโรงงานลำปาง",
      type: PlanType.SOLAR,
      startDate: d(21),
      endDate: d(22),
    },

    // --- Nut (NETWORK) ---
    {
      // IN_PROGRESS_OVERDUE: เริ่มแล้ว แต่เลย endDate มาแล้วยังไม่จบ
      id: "seed-plan-09",
      jobId: "JOB-009",
      userId: nut.id,
      name: "วางระบบ network สำนักงานใหม่",
      type: PlanType.NETWORK,
      startDate: d(26, 6),
      endDate: d(30, 6),
      actStart: t(26, 9, 0, 6),
    },
    {
      // NOT_STARTED_OVERDUE: เลย startDate แล้วยังไม่กดเริ่ม
      id: "seed-plan-10",
      jobId: "JOB-010",
      userId: nut.id,
      name: "ย้ายจุด AP ชั้น 2 ร้านกาแฟ",
      type: PlanType.NETWORK,
      startDate: d(1),
      endDate: d(2),
    },
    {
      // NOT_STARTED อนาคตกลางเดือน
      id: "seed-plan-11",
      jobId: "JOB-011",
      userId: nut.id,
      name: "เดินสาย LAN โรงเรียนดอยสะเก็ด",
      type: PlanType.NETWORK,
      startDate: d(15),
      endDate: d(16),
    },
    {
      // NOT_STARTED ปลายเดือน (ทดสอบ event วันที่ 30 ตามรูปปฏิทิน)
      id: "seed-plan-12",
      jobId: "JOB-012",
      userId: nut.id,
      name: "เตรียมอุปกรณ์ + ประชุมทีม CCTV",
      type: PlanType.NETWORK,
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

  // ดัน job_id_seq ให้แผนที่สร้างใหม่เริ่มต่อจาก seed (JOB-013, …) กันชนเลข JOB-001..012
  // advance-only ด้วย GREATEST: ถ้า sequence เลยไปแล้ว (มีข้อมูลจริง) จะไม่ถอยเลขกลับ
  await prisma.$executeRawUnsafe(
    `SELECT setval('job_id_seq', GREATEST((SELECT last_value FROM job_id_seq), ${plans.length}))`,
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
