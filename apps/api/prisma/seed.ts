// apps/api/prisma/seed.ts
// Seed: 1 CEO + 3 Engineers, 12 WorkPlans กระจายทั้งเดือน ก.ค. 2026
// ครอบคลุมทุก computed status เพื่อทดสอบปฏิทิน / สิ่งที่ต้องทำ / สรุป:
//   - COMPLETED (ตรงเวลา และ เสร็จช้า + delayEndReason)
//   - IN_PROGRESS (ตรงแผน และ เริ่มช้า + delayStartReason)
//   - IN_PROGRESS_OVERDUE (เลย endDate แล้วยังไม่จบ)
//   - NOT_STARTED (แผนอนาคต)
//   - NOT_STARTED_OVERDUE (เลย startDate แล้วยังไม่เริ่ม)

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
  // ล้างข้อมูลเดิม (dev only)
  await prisma.workPlan.deleteMany();
  await prisma.user.deleteMany();

  // ---------- Users ----------
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  const earth = await prisma.user.create({
    data: { username: "nongnoom", passwordHash, name: "nongnoom", role: Role.CEO, color: "#6366f1" },
  });

  const tawan = await prisma.user.create({
    data: { username: "tawan", passwordHash, name: "Tawan", role: Role.ENGINEER, color: "#0ea5e9" },
  });
  const bank = await prisma.user.create({
    data: { username: "earth", passwordHash, name: "Earth", role: Role.ENGINEER, color: "#f59e0b" },
  });
  const nut = await prisma.user.create({
    data: { username: "ohm", passwordHash, name: "Ohm", role: Role.ENGINEER, color: "#10b981" },
});

  // ---------- WorkPlans (วันนี้สมมติ = 2 ก.ค. 2026) ----------
  await prisma.workPlan.createMany({
    data: [
      // --- Tawan ---
      {
        // COMPLETED ตรงเวลา (จบไปแล้วเมื่อวาน)
        jobId: "JOB-CCTV-001",
        userId: tawan.id,
        name: "ติดตั้ง CCTV โกดังลำพูน เฟส 1",
        startDate: d(29, 6),
        endDate: d(1),
        actStart: t(29, 8, 30, 6),
        actEnd: t(1, 16, 45),
      },
      {
        // IN_PROGRESS ตรงแผน (วันนี้อยู่ในช่วง)
        jobId: "JOB-CCTV-001",
        userId: tawan.id,
        name: "เดินสาย + config NVR เฟส 2",
        startDate: d(2),
        endDate: d(4),
        actStart: t(2, 9, 0),
      },
      {
        // NOT_STARTED แผนอนาคต
        jobId: "JOB-CCTV-002",
        userId: tawan.id,
        name: "สำรวจหน้างาน CCTV หมู่บ้านสันกำแพง",
        startDate: d(8),
        endDate: d(8),
      },
      {
        // NOT_STARTED แผนอนาคต (แถบยาวข้ามสัปดาห์ ทดสอบ multi-day bar)
        jobId: "JOB-CCTV-002",
        userId: tawan.id,
        name: "ติดตั้ง CCTV หมู่บ้านสันกำแพง",
        startDate: d(13),
        endDate: d(17),
      },

      // --- Bank ---
      {
        // COMPLETED แต่เสร็จช้า → มี delayEndReason
        jobId: "JOB-SOLAR-004",
        userId: bank.id,
        name: "ติดตั้งแผงโซลาร์ บ้านคุณทราย",
        startDate: d(25, 6),
        endDate: d(30, 6),
        actStart: t(25, 8, 0, 6),
        actEnd: t(1, 15, 30),
        delayEndReason: "ฝนตกหนัก 2 วัน ขึ้นหลังคาไม่ได้",
      },
      {
        // IN_PROGRESS แต่เริ่มช้า → มี delayStartReason
        jobId: "JOB-SOLAR-004",
        userId: bank.id,
        name: "เดินสาย DC + ติดตั้ง inverter",
        startDate: d(1),
        endDate: d(3),
        actStart: t(2, 10, 30),
        delayStartReason: "รอ inverter จาก supplier ส่งช้า 1 วัน",
      },
      {
        // NOT_STARTED แผนอนาคต
        jobId: "JOB-SOLAR-004",
        userId: bank.id,
        name: "ทดสอบระบบ + ส่งมอบงานโซลาร์",
        startDate: d(6),
        endDate: d(6),
      },
      {
        // NOT_STARTED แผนปลายเดือน
        jobId: "JOB-SOLAR-005",
        userId: bank.id,
        name: "สำรวจหลังคาโรงงานลำปาง",
        startDate: d(21),
        endDate: d(22),
      },

      // --- Nut ---
      {
        // IN_PROGRESS_OVERDUE: เริ่มแล้ว แต่เลย endDate มาแล้วยังไม่จบ
        jobId: "JOB-NET-010",
        userId: nut.id,
        name: "วางระบบ network สำนักงานใหม่",
        startDate: d(26, 6),
        endDate: d(30, 6),
        actStart: t(26, 9, 0, 6),
      },
      {
        // NOT_STARTED_OVERDUE: เลย startDate แล้วยังไม่กดเริ่ม
        jobId: "JOB-NET-011",
        userId: nut.id,
        name: "ย้ายจุด AP ชั้น 2 ร้านกาแฟ",
        startDate: d(1),
        endDate: d(2),
      },
      {
        // NOT_STARTED อนาคตกลางเดือน
        jobId: "JOB-NET-012",
        userId: nut.id,
        name: "เดินสาย LAN โรงเรียนดอยสะเก็ด",
        startDate: d(15),
        endDate: d(16),
      },
      {
        // NOT_STARTED ปลายเดือน (ทดสอบ event วันที่ 30 ตามรูปปฏิทิน)
        jobId: "JOB-NET-013",
        userId: nut.id,
        name: "เตรียมอุปกรณ์ + ประชุมทีม CCTV",
        startDate: d(30),
        endDate: d(30),
      },
    ],
  });

  const counts = await prisma.workPlan.groupBy({
    by: ["userId"],
    _count: true,
  });
  console.log("Seed เสร็จ ✅");
  console.log("Users:", { earth: earth.id, tawan: tawan.id, bank: bank.id, nut: nut.id });
  console.log("WorkPlans per user:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
