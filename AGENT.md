# AGENT.md — คู่มือสำหรับ AI Coding Agent

ไฟล์นี้คือกติกากลางสำหรับ AI agent ทุกตัว (Claude Code, Copilot, ฯลฯ) ที่เข้ามาแก้โค้ดใน repo นี้
**อ่านก่อนแก้โค้ดทุกครั้ง** — ถ้าคำสั่งจาก user ขัดกับ "การตัดสินใจที่ lock แล้ว" ให้ถามยืนยันก่อน อย่าแก้เงียบๆ

## การตัดสินใจที่ lock แล้ว (ห้ามเปลี่ยนโดยไม่ถาม)

1. **Architecture แบบ B** — web / api / db แยก 3 containers, web ไม่มี Prisma และห้าม import อะไรจาก `apps/api` ยกเว้น **type** (`import type { AppRouter }`)
2. **Schema 7 models** — `User` + `WorkPlan` + `Log` + `Type` + `Site` + `Ticket` + `Notification` ใน scope ปัจจุบัน (`WorkPlan.siteId` เป็น FK → `sites.id` แล้ว)
   ตั้งแต่ 20 ก.ค. 2026 มี **Notification** (table `notifications` — migration `20260720120000_add_notifications`):
   การแจ้งเตือนในแอป ผูกกับ `Ticket` เสมอ, `userId` = ผู้รับ, `actorId` = คน trigger (nullable — เหตุการณ์จากระบบ),
   `type` เป็น string อิสระ (เช่น `ticket_assigned`) **จงใจไม่เป็น enum** — เพิ่มประเภทได้โดยไม่ migrate,
   `isRead` แยกจาก `readAt` — mark read ต้อง set ทั้งคู่ (ยังไม่มี router/UI — schema อย่างเดียวก่อน)
   ตั้งแต่ 18 ก.ค. 2026 มีระบบ **เคสลูกค้า (Ticket)**: intake จากลูกค้าโทรเข้า → มอบหมาย ENGINEER
   → ผู้รับกด "รับเป็นแผนงาน" (mutation `ticket.accept`) สร้าง `WorkPlan` ใน transaction เดียว
   **slim schema 20 ก.ค. 2026 (เจ้าของสั่ง — migration `20260720150000_slim_tickets`):** `tickets` เหลือ 8 column
   `id, title, detail, status, type, assignedId, createdById, createdAt` — ตัด `siteId` / `appointmentAt` /
   (`assigneeId` ถูก rename เป็น `assignedId` ให้ตรงสเปคเจ้าของ — migration `20260720160000_rename_assignee_to_assigned`
   ฝั่ง web ยังอ่าน log เก่า key `assigneeId` ได้ใน `log-detail.ts`)
   `workPlanId` / `closedAt` / `closeReason` / `updatedAt` ทิ้งถาวร (ข้อมูลเดิมบน server หาย — เจ้าของยืนยันแล้ว)
   → สถานะเคสเป็น **column จริง** `status` enum `TicketStatus` (`OPEN`/`ACCEPTED`/`CLOSED`)
   — **ข้อยกเว้นของ lock #3 ที่เจ้าของอนุมัติ 20 ก.ค. 2026** (migration backfill จาก workPlanId/closedAt เดิม)
   → เคสไม่ผูกไซต์/ไม่มีนัดหมายแล้ว — ช่างเลือก type+site ให้แผนตอนกด accept ตามกติกา `workPlan.create`
   → ไม่มี FK ผูกแผน↔เคสแล้ว: ลบแผนภายหลัง เคส**ไม่**เด้งกลับมาเปิด (status ค้างเป็น ACCEPTED)
   → `ticket.close` ไม่บังคับเหตุผลแล้ว (column `closeReason` ถูกตัด)
   เคสที่ ACCEPTED/CLOSED = ล็อกทั้งเคส (แก้ไม่ได้) ไม่มี `ticket.delete` (ปิดแทนลบ เก็บประวัติ)
   **รูปแนบเคสถูกถอดออกทั้งชุด 20 ก.ค. 2026** (เจ้าของสั่ง — เลิกเก็บรูป/metadata ใน DB, จะย้ายไปเก็บที่อื่น ยังไม่กำหนด):
   ตาราง `ticket_images` ถูก drop (migration `20260720000000_drop_ticket_images`), endpoint `/uploads/*` +
   `ticket.removeImage` + dependency `@fastify/multipart`/`@fastify/static` ถูกลบแล้ว
   ⚠️ volume `erp_uploads` บนเครื่อง server ยังมีไฟล์รูปเก่า — เก็บไว้เป็น backup อย่าลบจนกว่าที่เก็บใหม่จะพร้อม
   ตั้งแต่ 9 ก.ค. 2026 มี `Site` (table `sites`) เก็บ id/name — ประเภทของไซต์เป็น m-n กับ `Type`
   (ไซต์มีได้หลายประเภท ไม่จำกัดจำนวน) ต่างจาก `WorkPlan` ที่ยังเป็น 1 type ต่อแผน
   ตั้งแต่ 11 ก.ค. 2026 m-n นี้เป็น **implicit** (`Site.types Type[]` — Prisma จัดการตารางเชื่อม `_SiteToType` เอง)
   แทน model `SiteType`/table `site_types` เดิม (migration `20260711044237_site_types_implicit_m2m`)
   ⚠️ ลบ `Type` ที่มีไซต์ใช้อยู่ไม่ถูกบล็อกแล้ว (cascade หลุดจากไซต์เงียบๆ) — แต่ยังลบ type ที่มีแผนงานใช้ไม่ได้ (FK `work_plans.type` ยัง Restrict)
   ตั้งแต่ 9 ก.ค. 2026 ประเภทงานเป็น lookup table `types` (id เป็นเลขลำดับคงที่เช่น `1`, name แสดงผลเช่น "Solar Cell")
   **ตั้งแต่ 20 ก.ค. 2026 `types.id` เป็น Int** (เจ้าของสั่ง "id เป็นเลขรันหมด" — migration `20260720170000_int_type_ids`
   แปลง text→int ทั้ง `types.id`/`work_plans.type`/`tickets.type`/`_SiteToType.B` คงข้อมูลเดิม (ตอนนั้น `audit_logs.id` ยังคง cuid)
   log เก่าใน `audit_logs.detail` ยังเก็บ type เป็น string — ฝั่ง web (`log-detail.ts`) อ่านได้ทั้งเลขและ string)
   **ตั้งแต่ 24 ก.ค. 2026 กลับมติ — `audit_logs.id` เป็น Int autoincrement ด้วย** (เจ้าของสั่ง "id เป็นเลขรันหมดจริงๆ")
   migration `20260724000000_audit_log_int_id` แปลง cuid → เลขรัน 1..N เรียงตาม `createdAt` (ไม่มี FK ชี้มาที่ `audit_logs.id` จึงปลอดภัย)
   พร้อมกันนั้น **rename model `AuditLog` → `Log` + router `auditLog` → `log`** (table ยัง `@@map("audit_logs")` เหมือนเดิม)
   → tRPC path เปลี่ยนเป็น `log.list`/`log.summary`/`log.users`/`log.track` (client เดิมที่เรียก `auditLog.*` ถูกแก้หมดแล้ว)
   แทน enum `PlanType` เดิม — `work_plans.type` เป็น FK ไป `types.id`, ฝั่ง web ดึงตัวเลือก/label
   ผ่าน query `type.list` (ห้าม hardcode รายชื่อประเภท) ส่วนสี chip อยู่ที่ `apps/web/src/lib/plan-types.ts`
   จำกัดไว้ ~5 ประเภท เรียงตาม id — ไม่มี sortOrder (id เป็น Int แล้ว เกิน 9 ประเภทก็เรียงถูก — ข้อจำกัด "10" < "2" เดิมหมดไป)
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
   ตั้งแต่ 7 ก.ค. 2026 มี `Log` (model `AuditLog` เดิม, table `audit_logs`; append-only — ห้ามมี update/delete) เขียนจาก middleware ใน `trpc.ts`
   เท่านั้น (+ login ใน `auth.ts`) ทุก mutation ที่สำเร็จถูก log อัตโนมัติ — **ห้ามเก็บ password ลง detail**
   ตั้งแต่ 14 ก.ค. 2026 `auth.ts` เขียน `LOGIN_FAILED` ด้วย (เฉพาะ username ที่มีจริงแต่รหัสผิด —
   `audit_logs.userId` ไม่รับ null, detail มีแค่ `{ ip }`) และมี `log.users`/`log.summary`
   (ceoProcedure) เลี้ยงแถบสรุปหน้า log ของ CEO — หน้า log โหมดปกติซ่อน `ui.click` ผ่าน `excludeActions`
   ตั้งแต่ 7 ก.ค. 2026 (เพิ่มเติม) เก็บ **full click telemetry** ด้วย: ฝั่ง web ดักทุกคลิก
   (`ClickLogger` ใน `providers.tsx`) แล้วส่งเป็นก้อนผ่าน mutation `log.track` ตัวเดียว
   (`action = "ui.click"`, `detail = {page,label,tag,at}` — เก็บแค่ตัวตนของ element ห้ามมีค่าใน input)
   → นี่คือ **ข้อยกเว้นเดียว** ที่ client เขียน log ได้ (นอกนั้นยังห้าม) และ middleware ข้าม path นี้กัน log ซ้อน
3. **Status ของแผนงานไม่เก็บใน DB** — คำนวณจาก `actStart`/`actEnd`/`startDate`/`endDate` เสมอ (ดู `planStatus()`)
   ห้ามเพิ่ม column `status` ให้ `work_plans` เด็ดขาด
   (ข้อยกเว้นเดียว: `tickets.status` — เจ้าของอนุมัติ 20 ก.ค. 2026 ตอน slim schema ดู lock #2)
4. **วันที่ = ICT (UTC+7)** — input วันที่ทุกจุดต้องผ่าน `dateOnlyICT()` ก่อนเซฟลง column `@db.Date`
   ห้ามส่ง Date จาก client ลง Prisma ตรงๆ
5. **Delay reason บังคับที่ API** — `actStart > startDate` ต้องมี `delayStartReason`, `actEnd > endDate` ต้องมี `delayEndReason` — validation อยู่ที่ tRPC mutation เท่านั้น (ที่เดียว)
   เทียบ "ช้า" **ระดับวันไทยเสมอ** (`dateOnlyICT(now) > startDate`) ไม่ใช่ระดับ millisecond
   — `startDate`/`endDate` เป็น `@db.Date` = เที่ยงคืน UTC = 07:00 น. ไทย ถ้าเทียบ timestamp ดิบ
   คนที่กดเริ่มงาน 8 โมงของวันที่วางแผนไว้จะกลายเป็น "เริ่มช้า" (ดู ARCHITECTURE.md หัวข้อ "งานล่าช้า")
   เหตุผลอัปเดตได้ระหว่างงานยังค้างผ่าน `workPlan.explainDelay` (24 ก.ค. 2026) — แผนที่จบแล้วล็อก
6. **RBAC ที่ middleware** — `protectedProcedure` (ต้อง login) → `engineerProcedure` (เฉพาะ ENGINEER)
   **ตั้งแต่ 24 ก.ค. 2026 (เจ้าของสั่ง) เลิกกติกา "CEO view-only แบบเด็ดขาด" แล้ว** — เดิม CEO ห้าม mutate ทุกอย่าง
   ตอนนี้ CEO **สร้าง+จัดการงานของตัวเองได้** เหมือน Engineer โดยกันข้ามคนด้วย **ownership** ไม่ใช่ role:
   - **WorkPlan**: `create/update/delete/start/unstart/finish/explainDelay` เป็น `protectedProcedure` แล้ว
     (เดิม engineerProcedure) — เจ้าของ = คน login (`userId: ctx.user.sub`) ทุก mutation เช็ค
     `plan.userId === ctx.user.sub` ก่อนแก้ → **แตะได้เฉพาะแผนของตัวเอง** (CEO/Engineer เหมือนกัน)
     CEO ที่สร้างแผนเองจะเป็นเจ้าของแผนนั้น กดเริ่ม/จบ/แก้/ลบเองได้ (แผนโผล่ใน list/todo ของ CEO ที่เห็นทุกคนอยู่แล้ว)
   - **Site**: `site.create` เป็น `protectedProcedure` แล้ว (ไซต์ไม่มีเจ้าของ ใครก็สร้างได้) — แต่
     `site.update`/`site.delete` **ยังเป็น engineerProcedure** (เจ้าของขอเปิดเฉพาะ "เพิ่มไซต์")
   - **Ticket** (ข้อยกเว้นเดิม 18 ก.ค. 2026): `ticket.create/update/close` เป็น protectedProcedure — CEO เปิด/แก้/ปิดเคสได้
   **สิ่งที่ CEO ยัง "ทำไม่ได้"** (ยังหลัง `engineerProcedure`): `ticket.accept` (รับเป็นแผนงาน — เฉพาะผู้ถูกมอบหมายที่เป็น ENGINEER)
   + `site.update`/`site.delete` — และแตะแผน/งานของคนอื่นไม่ได้เพราะ ownership check
   → `engineerProcedure` เหลือใช้แค่ 3 จุดนี้; ฝั่ง web ปุ่ม mutation จึง gate ด้วย ownership (`plan.userId === myId`) ไม่ใช่ `!isCEO`
7. **Auth = JWT ออกเอง** — ไม่ใช้ NextAuth (ตัดออกไปแล้วตอนย้ายเป็นแบบ B) payload คือ `{ sub, role, name }` — user id อยู่ใน `sub` (เป็นเลขรัน Int ตั้งแต่ 11 ก.ค. 2026 — จงใจไม่ตาม RFC ที่ให้ sub เป็น string เพราะใช้ภายในระบบเดียว)

## Conventions

- ภาษา: comment ในโค้ดเป็นภาษาไทย, ชื่อตัวแปร/ฟังก์ชันเป็นอังกฤษ
- Error ที่ user เห็น (`TRPCError.message`) เป็นภาษาไทย
- Query เดือนในปฏิทินใช้ interval overlap เสมอ: `startDate ≤ monthEnd AND endDate ≥ monthStart`
- อย่า write field ที่ user ไม่ได้แก้ (ดู pattern conditional spread ใน `workPlan.update`)
- กติกาแก้/ลบแผน (ตั้งแต่ 18 ก.ค. 2026): แผนแก้ไขได้จนกว่าจะ**จบงาน** — แผนที่เริ่มแล้วแก้ได้ทุก field
  ยกเว้น "วันเริ่ม" (ผูกกับ `actStart`/`delayStartReason` ที่บันทึกแล้ว — จะแก้วันเริ่มต้องกดยกเลิกเริ่มงานก่อน)
  ส่วน**ลบ**ยังทำได้เฉพาะแผนที่ยังไม่เริ่มเท่านั้น / แผนที่จบงานแล้วล็อกทั้งแผน
- zod schema อยู่ติดกับ router ที่ใช้ ไม่แยกไฟล์จนกว่าจะซ้ำข้าม router

## คำสั่งที่ใช้บ่อย

```bash
# ที่ root (pnpm workspace)
pnpm install                  # ติดตั้งทุก app
pnpm dev                      # รัน api + web พร้อมกัน
pnpm typecheck                # tsc --noEmit ทั้งสอง app

# ฝั่ง api (cd apps/api)
pnpm db:migrate               # prisma migrate dev — สร้าง/รัน migration
pnpm db:seed                  # seed idempotent (รันซ้ำไม่ลบ/ไม่ duplicate/ไม่ reset รหัส user เดิม
                              #   — production ต้องตั้ง SEED_PASSWORD ไม่งั้นไม่รัน ดู DEPLOY.md)
pnpm user:password <user> <รหัส>  # เปลี่ยนรหัสผ่านรายคน (ทางเดียวที่ reset รหัส user เดิมได้)
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
  (เดิม seed มีแผน 29 มิ.ย.–1 ก.ค. ไว้จับ bug นี้ — ถูกลบออกแล้ว 14 ก.ค. 2026 พร้อม sites/workPlans ตัวอย่าง
  ถ้าเพิ่มเทสต์ใหม่ให้ครอบเคสคร่อมเดือนด้วย)

## ไฟล์สำคัญ

| ไฟล์ | หน้าที่ |
|---|---|
| `apps/api/src/trpc.ts` | context + middleware ทั้งหมด (RBAC + audit log) — ตัว verify JWT อยู่ `lib/auth-token.ts` |
| `apps/api/src/routers/workPlan.ts` | logic หลักของ module |
| `apps/api/src/routers/ticket.ts` | เคสลูกค้า: create/list/get/todo/update/close/accept (กติกาดู lock 2, 6) |
| `apps/api/src/routers/user.ts` | `user.list` — roster ENGINEER สำหรับ dropdown ผู้รับเคส |
| `apps/api/src/lib/asserts.ts` | `assertTypeExists` + `assertSiteMatchesType` — ใช้ร่วม workPlan/ticket |
| `apps/api/src/routers/auth.ts` | login / me |
| `apps/api/src/routers/log.ts` | ประวัติการใช้งาน: `list` (engineer เห็นของตัวเอง / CEO เห็นทุกคน) + `users`/`summary` (แถบสรุปของ CEO) + `track` (web ส่ง click log เข้า) |
| `apps/web/src/lib/trpc.ts` | tRPC client + จัดการ token |
| `apps/api/prisma/schema.prisma` | source of truth ของ data model |
| `apps/api/prisma/seed.ts` | ข้อมูลโครงสร้างล้วน: types + users (ไม่มี workPlans/sites ตัวอย่างแล้ว ตั้งแต่ 14 ก.ค. 2026) |
| `apps/api/src/lib/dates.ts` | `dateOnlyICT()` — normalize วันที่ ICT (สูตรเดียวกับฝั่ง web) |
| `apps/web/src/lib/status.ts` | computed status + `STATUS_META` (สี/ป้ายทุกหน้าจอ แก้ที่เดียว) |
