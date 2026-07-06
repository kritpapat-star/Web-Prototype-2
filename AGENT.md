# AGENT.md — คู่มือสำหรับ AI Coding Agent

ไฟล์นี้คือกติกากลางสำหรับ AI agent ทุกตัว (Claude Code, Copilot, ฯลฯ) ที่เข้ามาแก้โค้ดใน repo นี้
**อ่านก่อนแก้โค้ดทุกครั้ง** — ถ้าคำสั่งจาก user ขัดกับ "การตัดสินใจที่ lock แล้ว" ให้ถามยืนยันก่อน อย่าแก้เงียบๆ

## การตัดสินใจที่ lock แล้ว (ห้ามเปลี่ยนโดยไม่ถาม)

1. **Architecture แบบ B** — web / api / db แยก 3 containers, web ไม่มี Prisma และห้าม import อะไรจาก `apps/api` ยกเว้น **type** (`import type { AppRouter }`)
2. **Schema 2 tables** — `User` + `WorkPlan` เท่านั้นใน scope ปัจจุบัน (`jobId` เป็น string แขวนไว้ รอ Job table)
   ตั้งแต่ 6 ก.ค. 2026 `jobId` รันเลขอัตโนมัติจาก sequence `job_id_seq` — client ไม่ส่ง/แก้ไม่ได้
3. **Status ไม่เก็บใน DB** — คำนวณจาก `actStart`/`actEnd`/`startDate`/`endDate` เสมอ (ดู `planStatus()`)
   ห้ามเพิ่ม column `status` เด็ดขาด
4. **วันที่ = ICT (UTC+7)** — input วันที่ทุกจุดต้องผ่าน `dateOnlyICT()` ก่อนเซฟลง column `@db.Date`
   ห้ามส่ง Date จาก client ลง Prisma ตรงๆ
5. **Delay reason บังคับที่ API** — `actStart > startDate` ต้องมี `delayStartReason`, `actEnd > endDate` ต้องมี `delayEndReason` — validation อยู่ที่ tRPC mutation เท่านั้น (ที่เดียว)
6. **RBAC ที่ middleware** — `protectedProcedure` (ต้อง login) → `engineerProcedure` (เฉพาะ ENGINEER)
   CEO เป็น **view-only**: ห้ามมี mutation ไหนที่ CEO เรียกได้
7. **Auth = JWT ออกเอง** — ไม่ใช้ NextAuth (ตัดออกไปแล้วตอนย้ายเป็นแบบ B) payload คือ `{ sub, role, name }` — user id อยู่ใน `sub`

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
- **DEV BYPASS เปิดอยู่ (ชั่วคราว):** request ไม่มี token ถูกนับเป็น `tawan` + หน้า login ถูกข้าม
  → เทสมือแล้ว "เข้าได้" ไม่ได้แปลว่า auth ทำงานถูก และ**ห้ามลืมลบก่อน deploy** (ดู TASK.md / SECURITY.md)

## ไฟล์สำคัญ

| ไฟล์ | หน้าที่ |
|---|---|
| `apps/api/src/trpc.ts` | context (verify JWT) + middleware ทั้งหมด |
| `apps/api/src/routers/workPlan.ts` | logic หลักของ module |
| `apps/api/src/routers/auth.ts` | login / me |
| `apps/web/src/lib/trpc.ts` | tRPC client + จัดการ token |
| `apps/api/prisma/schema.prisma` | source of truth ของ data model |
| `apps/api/prisma/seed.ts` | test data ครอบคลุมทุก status |
| `apps/api/src/lib/dates.ts` | `dateOnlyICT()` — normalize วันที่ ICT (สูตรเดียวกับฝั่ง web) |
| `apps/web/src/lib/status.ts` | computed status + `STATUS_META` (สี/ป้ายทุกหน้าจอ แก้ที่เดียว) |
