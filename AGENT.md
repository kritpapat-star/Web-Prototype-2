# AGENT.md — คู่มือสำหรับ AI Coding Agent

ไฟล์นี้คือกติกากลางสำหรับ AI agent ทุกตัว (Claude Code, Copilot, ฯลฯ) ที่เข้ามาแก้โค้ดใน repo นี้
**อ่านก่อนแก้โค้ดทุกครั้ง** — ถ้าคำสั่งจาก user ขัดกับ "การตัดสินใจที่ lock แล้ว" ให้ถามยืนยันก่อน อย่าแก้เงียบๆ

## การตัดสินใจที่ lock แล้ว (ห้ามเปลี่ยนโดยไม่ถาม)

1. **Architecture แบบ B** — web / api / db แยก 3 containers, web ไม่มี Prisma และห้าม import อะไรจาก `apps/api` ยกเว้น **type** (`import type { AppRouter }`)
2. **Schema 5 models** — `User` + `WorkPlan` + `AuditLog` + `Type` + `Site` ใน scope ปัจจุบัน (`WorkPlan.siteId` เป็น FK → `sites.id` แล้ว)
   ตั้งแต่ 9 ก.ค. 2026 มี `Site` (table `sites`) เก็บ id/name — ประเภทของไซต์เป็น m-n กับ `Type`
   (ไซต์มีได้หลายประเภท ไม่จำกัดจำนวน) ต่างจาก `WorkPlan` ที่ยังเป็น 1 type ต่อแผน
   ตั้งแต่ 11 ก.ค. 2026 m-n นี้เป็น **implicit** (`Site.types Type[]` — Prisma จัดการตารางเชื่อม `_SiteToType` เอง)
   แทน model `SiteType`/table `site_types` เดิม (migration `20260711044237_site_types_implicit_m2m`)
   ⚠️ ลบ `Type` ที่มีไซต์ใช้อยู่ไม่ถูกบล็อกแล้ว (cascade หลุดจากไซต์เงียบๆ) — แต่ยังลบ type ที่มีแผนงานใช้ไม่ได้ (FK `work_plans.type` ยัง Restrict)
   ตั้งแต่ 9 ก.ค. 2026 ประเภทงานเป็น lookup table `types` (id เป็นเลขลำดับคงที่เช่น `"1"`, name แสดงผลเช่น "Solar Cell")
   แทน enum `PlanType` เดิม — `work_plans.type` เป็น FK ไป `types.id`, ฝั่ง web ดึงตัวเลือก/label
   ผ่าน query `type.list` (ห้าม hardcode รายชื่อประเภท) ส่วนสี chip อยู่ที่ `apps/web/src/lib/plan-types.ts`
   จำกัดไว้ ~5 ประเภท เรียงตาม id — ไม่มี sortOrder ถ้าจะมีเกิน 9 ประเภทต้องเพิ่มกลับ (id เป็น string, "10" < "2")
   ตั้งแต่ 6 ก.ค. 2026 เลขรันอัตโนมัติจาก Postgres sequence — client ไม่ส่ง/แก้ไม่ได้
   (9 ก.ค. 2026 เปลี่ยนชื่อ `jobId` → `siteId`, sequence `job_id_seq` → `site_id_seq`, prefix `JOB-` → `SITE-`)
   ตั้งแต่ 10 ก.ค. 2026 id เป็น**เลขรันล้วน**: `WorkPlan.id`/`Site.id` เป็น Int autoincrement,
   `WorkPlan.siteId` เป็น Int (ตัด prefix `SITE-` ออก — เลขเดิมคงไว้, ยัง gen จาก `site_id_seq` ตอน create)
   migration `20260710000000_numeric_run_ids` แปลงข้อมูลเดิม + remap `audit_logs.targetId` ของ `workPlan.*`
   ตั้งแต่ 11 ก.ค. 2026 `User.id` เป็นเลขรันด้วย (Int autoincrement 1, 2, 3, … เรียงตามลำดับสร้าง)
   FK ตามไป 2 ที่: `work_plans.userId`, `audit_logs.userId` — migration `20260711000000_numeric_user_ids`
   ผลข้างเคียง: JWT `sub` เป็นเลขแล้ว token เก่า (sub เป็น cuid) ถูก createContext ตัดเป็นไม่ได้ login → login ใหม่
   ตั้งแต่ 11 ก.ค. 2026 (บ่าย) `WorkPlan.siteId` เป็น **FK → `sites.id`** (Restrict — ลบไซต์ที่มีแผนใช้ไม่ได้)
   migration `20260711074613_link_work_plan_site`: backfill placeholder "ไซต์ #N" (+ผูกประเภทตามแผน)
   ให้ siteId เดิมของแผนเก่า แล้ว **drop sequence `site_id_seq`** — เลขไซต์ใหม่มาจาก `sites.id` ผ่าน `site.create`
   → **ยกเลิกกติกาเดิม "client ไม่ส่ง siteId"**: ตอนนี้ `workPlan.create`/`update` รับ `siteId` จาก dropdown
   (กรองตาม `Site.types` — ล็อกจนกว่าจะเลือกประเภทงาน จึงบังคับ `type` ตอน create ไปด้วย)
   API เช็คซ้ำเสมอว่าไซต์ที่ส่งมารองรับประเภทของแผน (`assertSiteMatchesType` ใน workPlan.ts)
   แผนเก่าที่ `type` เป็น null ยังอยู่ได้ — update ไม่บังคับเติม แต่ถ้าจะเปลี่ยน type/ไซต์ต้องผ่านเช็คคู่ site↔type
   ตั้งแต่ 7 ก.ค. 2026 มี `AuditLog` (append-only — ห้ามมี update/delete) เขียนจาก middleware ใน `trpc.ts`
   เท่านั้น (+ login ใน `auth.ts`) ทุก mutation ที่สำเร็จถูก log อัตโนมัติ — **ห้ามเก็บ password ลง detail**
   ตั้งแต่ 7 ก.ค. 2026 (เพิ่มเติม) เก็บ **full click telemetry** ด้วย: ฝั่ง web ดักทุกคลิก
   (`ClickLogger` ใน `providers.tsx`) แล้วส่งเป็นก้อนผ่าน mutation `auditLog.track` ตัวเดียว
   (`action = "ui.click"`, `detail = {page,label,tag,at}` — เก็บแค่ตัวตนของ element ห้ามมีค่าใน input)
   → นี่คือ **ข้อยกเว้นเดียว** ที่ client เขียน log ได้ (นอกนั้นยังห้าม) และ middleware ข้าม path นี้กัน log ซ้อน
3. **Status ไม่เก็บใน DB** — คำนวณจาก `actStart`/`actEnd`/`startDate`/`endDate` เสมอ (ดู `planStatus()`)
   ห้ามเพิ่ม column `status` เด็ดขาด
4. **วันที่ = ICT (UTC+7)** — input วันที่ทุกจุดต้องผ่าน `dateOnlyICT()` ก่อนเซฟลง column `@db.Date`
   ห้ามส่ง Date จาก client ลง Prisma ตรงๆ
5. **Delay reason บังคับที่ API** — `actStart > startDate` ต้องมี `delayStartReason`, `actEnd > endDate` ต้องมี `delayEndReason` — validation อยู่ที่ tRPC mutation เท่านั้น (ที่เดียว)
6. **RBAC ที่ middleware** — `protectedProcedure` (ต้อง login) → `engineerProcedure` (เฉพาะ ENGINEER)
   CEO เป็น **view-only**: ห้ามมี mutation ไหนที่ CEO เรียกได้
7. **Auth = JWT ออกเอง** — ไม่ใช้ NextAuth (ตัดออกไปแล้วตอนย้ายเป็นแบบ B) payload คือ `{ sub, role, name }` — user id อยู่ใน `sub` (เป็นเลขรัน Int ตั้งแต่ 11 ก.ค. 2026 — จงใจไม่ตาม RFC ที่ให้ sub เป็น string เพราะใช้ภายในระบบเดียว)

## Conventions

- ภาษา: comment ในโค้ดเป็นภาษาไทย, ชื่อตัวแปร/ฟังก์ชันเป็นอังกฤษ
- Error ที่ user เห็น (`TRPCError.message`) เป็นภาษาไทย
- Query เดือนในปฏิทินใช้ interval overlap เสมอ: `startDate ≤ monthEnd AND endDate ≥ monthStart`
- อย่า write field ที่ user ไม่ได้แก้ (ดู pattern conditional spread ใน `workPlan.update`)
- zod schema อยู่ติดกับ router ที่ใช้ ไม่แยกไฟล์จนกว่าจะซ้ำข้าม router

## คำสั่งที่ใช้บ่อย

```bash
# ที่ root (pnpm workspace)
pnpm install                  # ติดตั้งทุก app
pnpm dev                      # รัน api + web พร้อมกัน
pnpm typecheck                # tsc --noEmit ทั้งสอง app

# ฝั่ง api (cd apps/api)
pnpm db:migrate               # prisma migrate dev — สร้าง/รัน migration
pnpm db:seed                  # seed (ล้าง data เดิมด้วย — dev เท่านั้น)
pnpm db:studio                # ดูข้อมูลใน DB
pnpm dev                      # รัน API :4000

# ฝั่ง web (cd apps/web)
pnpm dev                      # รันเว็บ :3000

# ทั้งระบบ
docker compose up -d --build
```

## จุดที่พังง่าย (เคยพลาดมาแล้ว)

- **Timezone ±1 วัน:** date picker ส่งเที่ยงคืน ICT = 17:00Z ของวันก่อนหน้า → `@db.Date` ตัดผิดวัน
  → ทุก input วันที่ต้องผ่าน `dateOnlyICT()` (bug นี้เคยหลุดใน `create`/`update` มาแล้ว)
- **`NEXT_PUBLIC_*` เป็น build-time:** ต้องส่งเป็น build arg ใน compose + `ARG`/`ENV` ใน Dockerfile ก่อน `next build`
  ใส่ใน `environment:` ไม่มีผล (bug นี้เคยหลุดใน docker-compose.yml มาแล้ว)
- **แผนคร่อมเดือน:** ห้าม query ด้วย `startDate` อย่างเดียว — งานติดตั้งจริงคร่อมเดือนบ่อย
  seed มีแผน 29 มิ.ย.–1 ก.ค. ไว้จับ bug นี้โดยเฉพาะ

## ไฟล์สำคัญ

| ไฟล์ | หน้าที่ |
|---|---|
| `apps/api/src/trpc.ts` | context (verify JWT) + middleware ทั้งหมด (RBAC + audit log) |
| `apps/api/src/routers/workPlan.ts` | logic หลักของ module |
| `apps/api/src/routers/auth.ts` | login / me |
| `apps/api/src/routers/auditLog.ts` | ประวัติการใช้งาน: `list` (engineer เห็นของตัวเอง / CEO เห็นทุกคน) + `track` (web ส่ง click log เข้า) |
| `apps/web/src/lib/trpc.ts` | tRPC client + จัดการ token |
| `apps/api/prisma/schema.prisma` | source of truth ของ data model |
| `apps/api/prisma/seed.ts` | test data ครอบคลุมทุก status |
| `apps/api/src/lib/dates.ts` | `dateOnlyICT()` — normalize วันที่ ICT (สูตรเดียวกับฝั่ง web) |
| `apps/web/src/lib/status.ts` | computed status + `STATUS_META` (สี/ป้ายทุกหน้าจอ แก้ที่เดียว) |
