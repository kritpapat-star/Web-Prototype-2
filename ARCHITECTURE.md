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

## Data model (5 models)

```
User 1 ─── N WorkPlan N ─── 1 Type (optional)
User 1 ─── N AuditLog
Site N ─── M Type   (implicit m-n — ตารางเชื่อม _SiteToType ที่ Prisma จัดการเอง)
```

- `User`: id (Int เลขรัน autoincrement — เดิมเป็น cuid, แปลงใน `20260711000000_numeric_user_ids`
  พร้อม remap FK ทั้ง `work_plans.userId`/`audit_logs.userId` — JWT `sub` เป็นเลขตาม),
  username (unique), passwordHash, name, role (CEO|ENGINEER), color
- `WorkPlan`: id (Int เลขรัน autoincrement), siteId (Int เลขรัน — รอ relation → Site), userId, name,
  type (String? — FK → `types.id`, optional; เลือกจาก dropdown ตอนสร้าง/แก้),
  startDate/endDate (`@db.Date` — แผน), actStart/actEnd (timestamp — จริง),
  delayStartReason/delayEndReason, createdAt/updatedAt
- `Type` (`types`): lookup table ประเภทงาน — id เป็นเลขลำดับคงที่แบบ string (เช่น `"1"` = Solar Cell),
  name unique แสดงใน dropdown/chip; แทน enum `PlanType` เดิมตั้งแต่ 9 ก.ค. 2026
  (enum เกิด 7 ก.ค. ใน `20260707064110_add_workplan_type` แล้วแปลงเป็นตารางใน `20260709000000_plan_type_table`
  + เปลี่ยน id เป็นเลขใน `20260709070000` + rename เป็น `types` ใน `20260709080000`)
  ฝั่ง web ดึงตัวเลือก/ป้ายผ่าน query `type.list` (**ห้าม hardcode รายชื่อประเภท**) — สี chip อยู่ที่
  `apps/web/src/lib/plan-types.ts` (`typeColor()` — ประเภทที่ยังไม่กำหนดสีได้สีเทากลาง)
- `Site` (`sites`): id (Int เลขรัน autoincrement), name — **ผูกกับ WorkPlan แล้ว** (`work_plans.siteId` FK มาที่นี่
  ตั้งแต่ 11 ก.ค. 2026 — Restrict: ลบไซต์ที่มีแผนใช้อยู่ไม่ได้)
  `types` เป็น implicit m-n กับ `Type` (ไซต์มีได้หลายประเภท — ตั้งแต่ 11 ก.ค. 2026 ใช้ตารางเชื่อม
  `_SiteToType` ที่ Prisma จัดการเอง แทน model `SiteType`/table `site_types` เดิม
  ใน `20260711044237_site_types_implicit_m2m` — ลบ `Type` ที่มีไซต์ใช้จะหลุดจากไซต์เงียบๆ ไม่ถูกบล็อก)
- `AuditLog` (`audit_logs`): append-only (**ห้ามมี update/delete**) — userId, action (tRPC path),
  targetId (text เสมอ), detail (Json), createdAt; ผู้เขียนมีแค่ middleware `auditMutation` ใน `trpc.ts`
  (ทุก mutation สำเร็จ) + login ใน `auth.ts` + click telemetry ผ่าน `auditLog.track`
- `siteId` เป็น FK → `sites.id` — user เลือกจาก dropdown ใน PlanModal (กรองตาม `Site.types`
  ตามประเภทงานที่เลือก — ล็อกจนกว่าจะเลือกประเภท จึงบังคับ `type` ตอน create ไปด้วย)
  ตั้งแต่ 11 ก.ค. 2026 ใน `20260711074613_link_work_plan_site`: backfill placeholder "ไซต์ #N"
  ให้แผนเก่า + drop sequence `site_id_seq` เดิมที่ API เคย gen เลขเอง
  (ประวัติเลขรัน: `jobId`/`job_id_seq` ใน `20260706000000` → rename ใน `20260709110000` →
  ตัด prefix `SITE-` เหลือเลขล้วนใน `20260710000000_numeric_run_ids`)
- Indexes: `work_plans[userId, startDate]` (มุมมอง Engineer), `work_plans[startDate, endDate]`
  (ปฏิทินรวม CEO), `work_plans[siteId]` (แผนรายไซต์), `audit_logs[createdAt]` + `audit_logs[userId, createdAt]` (หน้า /logs)

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
(`sub` = user id เลขรัน Int ตั้งแต่ 11 ก.ค. 2026 — token เก่าที่ sub เป็น cuid ถูกตีเป็นไม่ได้ login)
web เก็บ token แล้วแนบ `Authorization: Bearer` ทุก request
(DEV BYPASS login ที่เคยเปิดชั่วคราว 4 ก.ค. 2026 ลบออกแล้วตั้งแต่ 8 ก.ค. 2026 — auth จริงทั้งระบบ)

## โครง UI ฝั่ง web

- หลัง login ทุกหน้าอยู่ใน **AppShell** เดียว (`apps/web/src/components/app-shell.tsx`):
  sidebar แบรนด์ "Be Connected" + เมนู + การ์ด user/logout และ topbar (ชื่อหน้า + กระดิ่ง)
  เมนูที่ใช้ได้จริง: "งานของฉัน" (`/dashboard`) + "ไซต์งาน" (`/sites`) +
  "ประวัติการใช้งาน" (`/logs` — ทุก role: engineer เห็นเฉพาะของตัวเอง / CEO เห็นทุกคน, scope ที่ API)
  — ที่เหลือ (คลังอุปกรณ์ / ยืม-คืน / ลงเวลา / ลา)
  เป็น placeholder ตามแผน reset scope จะเปิดใช้เมื่อ module นั้นถูกหยิบกลับมา
- `/sites` = "ไซต์งาน" — มุมมองแผนงานรายเดือนแบบกรองตามประเภท (`type`) ใช้ `workPlan.list({type?})`
  ตัวเดียวกับปฏิทิน + ค้นหาข้ามเดือนด้วย `workPlan.search({q, type?})` (ชื่อแผน / เลขไซต์ `"12"`/`"#5"`);
  filter-only page (ไม่มีปุ่ม mutation — สร้าง/แก้ทำที่ `/dashboard`)
  chip ประเภท (สีจาก `typeColor()` ใน `apps/web/src/lib/plan-types.ts`, ป้ายจาก `type.list`)
  วางคนละสี/ตำแหน่งกับ chip status กันสับสน; CEO เห็นทุกคน / Engineer เห็นเฉพาะของตัวเอง (RBAC เดียวกับ `list`)
- `/dashboard` = 4 มุมมองของ WorkPlan table เดียว เรียงจากบนลงล่าง (scope ดู CONTEXT.md):
  1. **ปฏิทินเดือน** + แผงแผนงานของวันที่เลือก (คลิกวันในปฏิทินเพื่อเปลี่ยน)
  2. **รายการแผนทั้งเดือน** + ปุ่ม/modal "+ เพิ่มแผน" และ "แก้ไข" — แก้ได้เฉพาะแผนของตัวเอง
     ที่ยังไม่กดเริ่ม (client ใช้กติกาเดียวกับ `workPlan.update` เพื่อซ่อนปุ่ม — validation จริงอยู่ที่ API)
     โหมดแก้ไขส่งเฉพาะ field ที่เปลี่ยนจริง / Job ID โชว์ read-only (ระบบรันเลขให้)
  3. **สิ่งที่ต้องทำวันนี้ + สรุปประจำวัน** (`TodayBanner`) — ปุ่มเริ่ม/จบงาน + dialog delay reason
  4. **สรุปงานประจำวัน** (`SummaryPanel`) — tile นับตาม status + รายการจัดกลุ่มตาม status
  ปุ่ม mutation ทุกจุดแสดงเฉพาะ ENGINEER — CEO view-only จึงไม่มีปุ่มใดๆ ใน UI
- **ปฏิทินเดือน**แสดงแผนหลายวันเป็น**แถบต่อเนื่อง**ตัดแบ่งที่ขอบสัปดาห์ (แบบ Google Calendar):
  โครงเป็นแถวสัปดาห์ `.cal-week` (CSS grid) — แถบวางทับเซลล์ด้วย `grid-column` span
  เซลล์วันยังคลิกเลือกวันได้ (คลิกบนแถบก็แปลงตำแหน่งเป็นวันให้) จัด lane ด้วย pure function
  ใน `apps/web/src/lib/calendar-lanes.ts` (greedy ต่อสัปดาห์, เกิน 3 lane พับเป็น "+N เพิ่มเติม")
  หัว/ท้ายแถบมนเฉพาะจุดที่แผนเริ่ม/จบจริง — ขอบตัดข้ามสัปดาห์/คร่อมเดือนเรียบ สื่อว่าแผนต่อเนื่อง
- มุมมอง 3 และ 4 ใช้ query แยก `workPlan.todo`
  = แผนที่ทับวันนี้ + งานค้างจากวันก่อน (`endDate < วันนี้ AND actEnd IS NULL`) ไม่ผูกกับเดือนในปฏิทิน
  **เหตุผลที่ไม่ reuse `list`:** window รายเดือนมองไม่เห็นงานค้างข้ามเดือน — เช่นแผนจบ 30 มิ.ย.
  ที่ยังไม่ปิดงาน จะหายจาก banner ทันทีที่ขึ้นเดือน ก.ค. ทั้งที่ยังค้างอยู่
  (ฝั่ง client เช็ค "ช้ากว่าแผน" ด้วยสูตรเดียวกับ API เพื่อเปิด dialog เหตุผล
  แต่ validation จริงอยู่ที่ tRPC mutation ที่เดียวตามเดิม)
- สไตล์เป็น CSS ล้วนที่ `apps/web/src/app/globals.css` — ไม่ใช้ Tailwind/UI framework
  เหตุผล: ยังไม่เพิ่ม dependency จนกว่า UI จะโตพอคุ้มค่า maintain
- สี/ป้าย status มีที่เดียวคือ `STATUS_META` ใน `apps/web/src/lib/status.ts` —
  แถบในปฏิทินและ chip ในแผงรายวันใช้ชุดเดียวกัน (แก้สีแก้ที่เดียว)
- สีประเภทงานมีที่เดียวคือ `typeColor()`/`PLAN_TYPE_COLORS` ใน `apps/web/src/lib/plan-types.ts`
  (คู่กับ STATUS_META) — โทนนุ่มไม่ทับ status chip; ส่วน**ป้าย/รายชื่อประเภท**มาจาก DB ผ่าน `type.list`
  (ประเภทใหม่ที่ยังไม่กำหนดสีจะได้สีเทากลาง — เพิ่มสีทีหลังได้โดยไม่พัง)
- ปีใน UI เป็น **ค.ศ.** ตาม design: format ผ่าน locale `th-TH-u-ca-gregory`
  (`th-TH` เพียวๆ จะได้ พ.ศ.) และวันที่จาก DB ทุกจุด format ด้วย `timeZone: "UTC"`
  เพราะค่าเป็น UTC midnight ที่แทน "วันตามเวลาไทย" อยู่แล้ว (ดูหลักการข้อ 3)

## Deploy

- Docker Compose 3 services บน VPS — ดู `docker-compose.yml`
- ⚠️ `NEXT_PUBLIC_API_URL` เป็น **build arg** (ถูก inline ตอน `next build`) ไม่ใช่ runtime env
  และต้องเป็น URL ที่ browser มองเห็น (โดเมนจริง) ไม่ใช่ชื่อ service ใน docker network
- เปลี่ยน API URL = rebuild web image ไม่ใช่แค่ restart

## สิ่งที่ตั้งใจยังไม่ทำ (รอ scope ขยาย)

- relation จาก `WorkPlan.siteId` → table `Site` (ตอนนี้ยังเป็นเลขรันอิสระ (Int) ไม่ใช่ FK)
- Module อื่นจาก ERP เต็ม (inventory, loan, attendance, leave, notification) — โครงอยู่ใน `schema_merged.prisma`
- Refresh token / httpOnly cookie (ดู trade-off ใน SECURITY.md)
- Offline-first / GPS clock-in (อยู่ใน vision ระยะยาว)
