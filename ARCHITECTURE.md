# ARCHITECTURE.md — โครงสร้างระบบ

## ภาพรวม (แบบ B — แยก API server)

```
[Container 1] web  — Next.js         ไม่มี Prisma, ไม่เห็น DB
      │  HTTPS (Bearer JWT)
      ▼
[Container 2] api  — Fastify + tRPC + Prisma   ตัวเดียวที่ถือ DATABASE_URL + JWT_SECRET
      │  docker network ภายใน
      ▼
[Container 3] db   — PostgreSQL 16   ไม่เปิด port ออกนอก network
```

เหตุผลที่เลือกแบบ B แทนการรวมใน Next.js เดียว: ต้องการให้ API เป็นตัวกลางเดียว
รองรับ client อื่นในอนาคต (mobile app) โดยไม่ผูกกับ Next.js

## Type safety ข้าม container

เว็บกับ API แยก process กันจริง แต่ยัง type-safe end-to-end เพราะเป็น pnpm workspace monorepo:
`apps/web/src/lib/trpc.ts` ทำ `import type { AppRouter } from "../../../api/src/routers/_app"`
— **type-only import** ผ่าน relative path ไม่ดึงโค้ด server มา bundle
เมื่อ API เปลี่ยน contract → web ขึ้น type error ทันทีตอน compile
(ผลข้างเคียงที่ตั้งใจ: tsc ฝั่ง web ไล่เช็ค source ของ api ด้วย จึงต้อง `prisma generate` ก่อน)

## Data model (2 tables)

```
User 1 ─── N WorkPlan
```

- `User`: id, username (unique), passwordHash, name, role (CEO|ENGINEER), color
- `WorkPlan`: id, jobId (string — รอ Job table), userId, name,
  startDate/endDate (`@db.Date` — แผน), actStart/actEnd (timestamp — จริง),
  delayStartReason/delayEndReason, createdAt/updatedAt
- `jobId` ระบบ gen เองตอน create (`JOB-001`, `JOB-002`, …) จาก Postgres sequence `job_id_seq`
  (migration `20260706000000_job_id_sequence`) — user ไม่กรอก/แก้ไม่ได้ ฝั่ง client ไม่รับ field นี้
  ไม่ใช่ตารางใหม่ จึงยังอยู่ในกรอบ "2 tables" ที่ lock ไว้ — พอมี Job table ค่อยย้ายเลขรันไปที่นั่น
- Indexes: `[userId, startDate]` (มุมมอง Engineer), `[startDate, endDate]` (ปฏิทินรวม CEO)

## หลักการที่ lock แล้ว + เหตุผล

### 1. Computed status — ไม่มี column `status`

```
actEnd มีค่า                          → COMPLETED
actStart มีค่า + วันนี้ >  endDate    → IN_PROGRESS_OVERDUE
actStart มีค่า + วันนี้ ≤  endDate    → IN_PROGRESS
actStart ว่าง  + วันนี้ >  startDate  → NOT_STARTED_OVERDUE
actStart ว่าง  + วันนี้ ≤  startDate  → NOT_STARTED
```

เหตุผล: OVERDUE เปลี่ยนตามเวลาโดยไม่มีใครแตะ record — ถ้าเก็บลง DB ต้องมี background job
คอย update (เคยพิจารณา BullMQ แล้วตัดทิ้ง) คำนวณตอน query ถูกเสมอและไม่มี state ค้าง

### 2. Query ปฏิทินใช้ interval overlap

```sql
startDate <= monthEnd AND endDate >= monthStart
```

เหตุผล: งานติดตั้งคร่อมเดือนบ่อย — query ด้วย `startDate` อย่างเดียวจะทำแผนที่เริ่มเดือนก่อน
หายจากปฏิทินทั้งที่ยังทำอยู่ สูตรนี้มาจาก negation ของ "ไม่ทับกัน" (จบก่อนเดือนเริ่ม หรือ เริ่มหลังเดือนจบ)
และเป็นการเทียบ column กับค่าคงที่ → ใช้ index ได้

### 3. Normalize วันที่เป็น ICT ก่อนเสมอ (`dateOnlyICT`)

Browser ไทยส่ง "เที่ยงคืนวันที่ N" มาเป็น `(N-1)T17:00Z` → Prisma ตัด `@db.Date` ฝั่ง UTC
ได้วันที่ N-1 (ผิด) — จึงต้องเลื่อน +7 ชม. แล้วค่อยตัดวัน **ที่ API เท่านั้น** (client ไว้ใจไม่ได้)
`actStart`/`actEnd` เก็บ timestamp เต็มโดยตั้งใจ (ใช้วิเคราะห์เวลา) — เทียบ delay ระดับ "วัน" ผ่าน `dateOnlyICT(now)`

### 4. RBAC 2 ชั้นที่ middleware + 1 ชั้นที่ query

- `protectedProcedure`: มี JWT ที่ verify ผ่าน
- `engineerProcedure`: role = ENGINEER (ทุก mutation ของ WorkPlan อยู่หลังชั้นนี้ → CEO view-only โดยโครงสร้าง)
- ชั้น query: Engineer ถูกบังคับ filter `userId = ตัวเอง` เสมอ (ignore ค่าที่ client ส่งมา)
  และ mutation ทุกตัวเช็ค ownership (`plan.userId === ctx.user.sub`) ก่อนแก้

### 5. Auth = JWT ออกเองที่ API

NextAuth ถูกตัดออกตอนย้ายเป็นแบบ B (session cookie ของมันข้าม server ไม่ได้)
`auth.login` เช็ค bcrypt → ออก JWT อายุ 12 ชม. payload `{ sub, role, name }`
web เก็บ token แล้วแนบ `Authorization: Bearer` ทุก request

⚠️ **DEV BYPASS ชั่วคราว (ตั้งแต่ 4 ก.ค. 2026):** request ที่ไม่มี token ถูกนับเป็น user `tawan`
และหน้า login ถูกข้ามเข้า `/dashboard` ตรง — มี 3 จุด: `apps/api/src/trpc.ts`,
`apps/web/src/app/page.tsx`, `apps/web/src/app/dashboard/page.tsx` (แต่ละจุดมี comment วิธีเอาออก)
งานลบ bypass อยู่ใน TASK.md — **ต้องลบก่อนออกนอกเครื่อง dev**

## โครง UI ฝั่ง web

- หลัง login ทุกหน้าอยู่ใน **AppShell** เดียว (`apps/web/src/components/app-shell.tsx`):
  sidebar แบรนด์ "Be Connected" + เมนู 5 อัน + การ์ด user/logout และ topbar (ชื่อหน้า + กระดิ่ง)
  เมนูที่ใช้ได้จริงมีเฉพาะ "งานของฉัน" — ที่เหลือ (คลังอุปกรณ์ / ยืม-คืน / ลงเวลา / ลา)
  เป็น placeholder ตามแผน reset scope จะเปิดใช้เมื่อ module นั้นถูกหยิบกลับมา
- `/dashboard` = 4 มุมมองของ WorkPlan table เดียว เรียงจากบนลงล่าง (scope ดู CONTEXT.md):
  1. **ปฏิทินเดือน** + แผงแผนงานของวันที่เลือก (คลิกวันในปฏิทินเพื่อเปลี่ยน)
  2. **รายการแผนทั้งเดือน** + ปุ่ม/modal "+ เพิ่มแผน" และ "แก้ไข" — แก้ได้เฉพาะแผนของตัวเอง
     ที่ยังไม่กดเริ่ม (client ใช้กติกาเดียวกับ `workPlan.update` เพื่อซ่อนปุ่ม — validation จริงอยู่ที่ API)
     โหมดแก้ไขส่งเฉพาะ field ที่เปลี่ยนจริง / Job ID โชว์ read-only (ระบบรันเลขให้)
  3. **สิ่งที่ต้องทำวันนี้ + สรุปประจำวัน** (`TodayBanner`) — ปุ่มเริ่ม/จบงาน + dialog delay reason
  4. **สรุปงานประจำวัน** (`SummaryPanel`) — tile นับตาม status + รายการจัดกลุ่มตาม status
  ปุ่ม mutation ทุกจุดแสดงเฉพาะ ENGINEER — CEO view-only จึงไม่มีปุ่มใดๆ ใน UI
- มุมมอง 3 และ 4 ใช้ query แยก `workPlan.todo`
  = แผนที่ทับวันนี้ + งานค้างจากวันก่อน (`endDate < วันนี้ AND actEnd IS NULL`) ไม่ผูกกับเดือนในปฏิทิน
  **เหตุผลที่ไม่ reuse `list`:** window รายเดือนมองไม่เห็นงานค้างข้ามเดือน — เช่นแผนจบ 30 มิ.ย.
  ที่ยังไม่ปิดงาน จะหายจาก banner ทันทีที่ขึ้นเดือน ก.ค. ทั้งที่ยังค้างอยู่
  (ฝั่ง client เช็ค "ช้ากว่าแผน" ด้วยสูตรเดียวกับ API เพื่อเปิด dialog เหตุผล
  แต่ validation จริงอยู่ที่ tRPC mutation ที่เดียวตามเดิม)
- สไตล์เป็น CSS ล้วนที่ `apps/web/src/app/globals.css` — ไม่ใช้ Tailwind/UI framework
  เหตุผล: ยังไม่เพิ่ม dependency จนกว่า UI จะโตพอคุ้มค่า maintain
- สี/ป้าย status มีที่เดียวคือ `STATUS_META` ใน `apps/web/src/lib/status.ts` —
  pill ในปฏิทินและ chip ในแผงรายวันใช้ชุดเดียวกัน (แก้สีแก้ที่เดียว)
- ปีใน UI เป็น **ค.ศ.** ตาม design: format ผ่าน locale `th-TH-u-ca-gregory`
  (`th-TH` เพียวๆ จะได้ พ.ศ.) และวันที่จาก DB ทุกจุด format ด้วย `timeZone: "UTC"`
  เพราะค่าเป็น UTC midnight ที่แทน "วันตามเวลาไทย" อยู่แล้ว (ดูหลักการข้อ 3)

## Deploy

- Docker Compose 3 services บน VPS — ดู `docker-compose.yml`
- ⚠️ `NEXT_PUBLIC_API_URL` เป็น **build arg** (ถูก inline ตอน `next build`) ไม่ใช่ runtime env
  และต้องเป็น URL ที่ browser มองเห็น (โดเมนจริง) ไม่ใช่ชื่อ service ใน docker network
- เปลี่ยน API URL = rebuild web image ไม่ใช่แค่ restart

## สิ่งที่ตั้งใจยังไม่ทำ (รอ scope ขยาย)

- Job table + relation จาก `WorkPlan.jobId`
- Module อื่นจาก ERP เต็ม (inventory, loan, attendance, leave, notification) — โครงอยู่ใน `schema_merged.prisma`
- Refresh token / httpOnly cookie (ดู trade-off ใน SECURITY.md)
- Offline-first / GPS clock-in (อยู่ใน vision ระยะยาว)
