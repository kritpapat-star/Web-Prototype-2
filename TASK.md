# TASK.md — สถานะงาน

> อัปเดตล่าสุด: 7 ก.ค. 2026
> กติกา: งานเสร็จให้ย้ายลง Done พร้อมวันที่ / งานใหม่เข้า Backlog ก่อนเสมอ

## ✅ Done

- [x] Reset scope: 1 module (งานของฉัน) + 2 roles (CEO/ENGINEER) — CEO view-only
- [x] ออกแบบ + lock schema: User + WorkPlan (ยุบ Todo แบบ 1:1, computed status, `@db.Date`)
- [x] Migration SQL + seed data (4 users, 12 plans ครอบคลุมทุก status รวมเคสคร่อมเดือน)
- [x] เพิ่ม auth fields (`username`, `passwordHash`) + seed รหัส dev
- [x] tRPC router ครบ: `workPlan.list/create/update/start/finish` + validation delay reason
- [x] ตัดสินใจ architecture แบบ B (แยก api server) + ย้าย NextAuth → JWT ออกเอง
- [x] Fastify entry + `auth.login/me` + web tRPC client (Bearer token)
- [x] docker-compose 3 containers + web Dockerfile
- [x] 🐛 Fix: normalize วันที่ด้วย `dateOnlyICT()` ใน `create`/`update` (bug ±1 วัน จาก code review)
- [x] 🐛 Fix: `NEXT_PUBLIC_API_URL` เป็น build arg ไม่ใช่ runtime env (จาก code review)
- [x] ชุดเอกสารโปรเจกต์ (README, AGENT, CLAUDE, CONTEXT, ARCHITECTURE, SECURITY, TASK, TESTING, API)
- [x] Monorepo scaffold จริง — 3 ก.ค. 2026: pnpm workspace (`@repo/api` + `@repo/web`),
      ย้ายไฟล์ prototype เข้า `apps/*`, tsconfig + Dockerfile ทั้งคู่, typecheck เขียวทั้ง 2 apps,
      smoke test ผ่าน (API `/health` + tRPC UNAUTHORIZED + หน้าเว็บ render)
      (ตัดสินใจ: ไม่ใช้ create-t3-app เพราะได้แบบ A / ไม่มี packages/db+shared ตาม convention)
- [x] Dev ergonomics — 4 ก.ค. 2026: เปลี่ยน env `PORT` → `API_PORT` (กันรั่วไปชน Next.js)
      + dev script ใช้ `tsx watch --env-file=.env` → `pnpm dev` จาก root ใช้ได้จริง
- [x] Vitest ทั้ง 2 apps — 4 ก.ค. 2026: แยก `dateOnlyICT()/todayICT()` เป็น `apps/api/src/lib/dates.ts`
      + เขียน `planStatus()` เป็น pure function ที่ `apps/web/src/lib/status.ts`
      เทสตาม TESTING.md หมวดวันที่/timezone + status ทั้ง 5 ค่า (16 เทสเขียว)
- [x] หน้า login + `/dashboard` minimal — 4 ก.ค. 2026: form + `trpc.auth.login` + `setToken`
      + guard token + list แผนเดือนนี้พร้อม computed status + delay reasons + logout
      (CEO เห็นทุกคน/มีชื่อคนกำกับ — ปฏิทินเต็มรูปแบบยังอยู่ใน Next)
- [x] UI "งานของฉัน" ตามภาพอ้างอิง — 4 ก.ค. 2026: โครง AppShell (sidebar "Be Connected"
      + เมนูโมดูลอนาคตแบบ placeholder + การ์ด user/logout) + ปฏิทินเดือน (pill สีตาม status,
      "+N เพิ่มเติม", ปุ่ม « » เลื่อนเดือน, ไฮไลต์วันนี้/วันที่เลือก) + แผงแผนงานรายวัน
      + modal "+ เพิ่มแผน" ยิง `workPlan.create` (เฉพาะ Engineer — CEO ไม่มีปุ่ม)
      CEO เห็นแต้มสีเจ้าของใน pill — สไตล์เป็น CSS ล้วนใน `globals.css` (ไม่เพิ่ม dependency)
      → ดูหลักการที่บันทึกไว้ในหัวข้อ "โครง UI ฝั่ง web" ใน ARCHITECTURE.md
- [x] Banner "สิ่งที่ต้องทำวันนี้ + สรุปประจำวัน" — 4 ก.ค. 2026: query ใหม่ `workPlan.todo`
      (แผนทับวันนี้ + งานค้างจากวันก่อน — ไม่ reuse `list` เพราะ window รายเดือนมองไม่เห็น
      งานค้างข้ามเดือน → บันทึกเหตุผลใน ARCHITECTURE.md) + chips นับ status (`countByStatus()`
      pure function + เทส 2 ตัว) + ปุ่มเริ่ม/จบงาน (Engineer) + dialog บังคับเหตุผลเมื่อช้ากว่าแผน
      ให้ตรง validation ฝั่ง API — CEO view-only เห็นทั้งทีมพร้อมชื่อคน ไม่มีปุ่ม
      + แยก helper format วันที่เป็น `apps/web/src/lib/format.ts` (เริ่มซ้ำ 2 ไฟล์)
- [x] ⚠️ DEV BYPASS login ชั่วคราว — 4 ก.ค. 2026: ข้ามหน้า login (request ไม่มี token = `tawan`)
      3 จุด: `apps/api/src/trpc.ts` + `apps/web/src/app/page.tsx` + `dashboard/page.tsx`
      (แต่ละจุดมี comment วิธีเอาออก — งานลบอยู่ใน Next / บันทึกความเสี่ยงใน SECURITY.md)
- [x] แท็บ "สรุปงาน" (`SummaryPanel`) — 4 ก.ค. 2026: มุมมองที่ 4 ครบ — tile นับทุก status
      + รายการจัดกลุ่มตาม status ใช้ `workPlan.todo` ตัวเดียวกับ banner (เห็นงานค้างข้ามเดือน)
- [x] แก้/เลื่อนวันแผนจากหน้าเว็บ — 6 ก.ค. 2026: ปุ่ม "แก้ไข" + `PlanModal` โหมดแก้
      (ส่งเฉพาะ field ที่เปลี่ยนจริง) — แก้ได้เฉพาะแผนตัวเองที่ยังไม่กดเริ่ม กติกาเดียวกับ API
- [x] Job ID รันเลขอัตโนมัติ — 6 ก.ค. 2026: Postgres sequence `job_id_seq`
      (migration `20260706000000`) → `JOB-001`, `JOB-002`, … ตัด `jobId` ออกจาก input `create`
      โหมดแก้ไขโชว์ read-only — user ไม่กรอก/แก้ไม่ได้ (บันทึกใน ARCHITECTURE.md + API.md)
- [x] แถบ multi-day ต่อเนื่องในปฏิทิน — 7 ก.ค. 2026: แผนหลายวันเป็นแถบยาวข้ามวัน
      แบบ Google Calendar ตัดแบ่งที่ขอบสัปดาห์ (ปฏิทินเปลี่ยนเป็นแถวสัปดาห์ `.cal-week`
      แถบวางทับด้วย grid-column span) — lane assignment เป็น pure function
      `lib/calendar-lanes.ts` + unit test; ขอบแถบมนเฉพาะจุดเริ่ม/จบจริง เคสคร่อมเดือนขอบเรียบ
- [x] ประเภทงาน (`type`) + หน้า "ไซต์งาน" — 7 ก.ค. 2026: เพิ่ม enum `PlanType` (SOLAR/CCTV/NETWORK)
      และคอลัมน์ `type` (nullable) ใน WorkPlan — **migration additive** ไม่ล้างข้อมูล
      (`20260707064110_add_workplan_type`: สร้าง enum + คอลัมน์ + backfill ตาม prefix `jobId`
      JOB-CCTV/SOLAR/NET-*); seed เปลี่ยนเป็น **idempotent upsert** (id คงที่ `seed-plan-NN` +
      key `username` — รันซ้ำไม่ลบ/ไม่ duplicate) พร้อมใส่ `type` ทุกแผน
      ฝั่ง API: `planFields`/`monthInput` รับ `type?` + `list` filter `type` (create/update
      ส่งต่อผ่าน spread อัตโนมัติ) ฝั่ง web: `lib/plan-types.ts` (`PLAN_TYPE_META`) +
      หน้าใหม่ `/sites` (filter chip ประเภท + chip สถานะ, ดึง `workPlan.list`) + dropdown
      ประเภทใน PlanModal + chip ประเภทใน dashboard (CEO เห็นทุกคน / Engineer เฉพาะตัวเอง)
      เป็นการทำ field `type` จริงที่เคยทำนายไว้ใน CONTEXT.md ("เพิ่มทีหลังได้โดยไม่พังโครง")

## 🔨 Doing

- [ ] — (ว่าง — งานถัดไปเลือกจาก Next)

## ⏭️ Next (เรียงตามลำดับแนะนำ)

1. [ ] เปิด login กลับ: ลบ DEV BYPASS ทั้ง 4 จุด (ก่อน demo/deploy ทุกกรณี — ดู SECURITY.md)
   `apps/api/src/trpc.ts` + `apps/web/src/app/page.tsx` + `dashboard/page.tsx` + `sites/page.tsx`
2. [ ] ปฏิทินรวม CEO: filter รายคน (API รับ `userId` แล้ว — เหลือ dropdown ฝั่งเว็บ)
3. [ ] ปรับ UI เป็น responsive/mobile-first (Engineer ใช้มือถือหน้างานเป็นหลัก — ดู CONTEXT.md)
4. [ ] build ทดสอบ docker image ทั้งคู่จริง (`docker compose build`) — Dockerfile เขียนแล้วแต่ยังไม่เคย build

## 📦 Backlog

- [ ] Job table + relation จาก `WorkPlan.jobId`
- [ ] Rate limit ที่ `auth.login` (ก่อนเปิด internet)
- [ ] เปลี่ยน token localStorage → httpOnly cookie
- [ ] หน้าเปลี่ยนรหัสผ่าน + บังคับเปลี่ยนครั้งแรก
- [ ] Module ถัดไปจาก ERP เต็ม (ยืมอุปกรณ์ / ลงเวลา / ลางาน — ดู `schema_merged.prisma`)
- [ ] พิจารณา client ส่งวันที่เป็น string `"YYYY-MM-DD"` แทน Date object (ตัด timezone ที่ต้นทาง)
- [ ] Mobile app / PWA สำหรับ Engineer หน้างาน
