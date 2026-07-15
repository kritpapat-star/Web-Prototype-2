# TESTING.md — แนวทางทดสอบ

## หลักคิด

Logic เสี่ยงสุดของระบบนี้อยู่ 3 ที่: **วันที่/timezone**, **computed status**, **RBAC**
เทสต้องยิงตรง 3 จุดนี้ก่อนอย่างอื่น — UI สวยแต่วันเพี้ยน ±1 คือระบบใช้ไม่ได้

## Test data

seed (`apps/api/prisma/seed.ts`) เก็บเฉพาะข้อมูลโครงสร้าง — **types (5) + users (4)** เท่านั้น
sites/workPlans ตัวอย่างถูกลบออกถาวรแล้ว (14 ก.ค. 2026) → DB หลัง seed ไม่มีแผนให้ทดสอบ UI ทันที
จะทดสอบ status/ปฏิทินต้องสร้างเคสเองผ่านแอป หรือทำ fixture ใน integration test (`createCaller`)

เคสที่ควรครอบให้ครบ (เดิมเคยมากับ seed — ตอนนี้ต้องเตรียมเอง):

| Case | ไว้ทดสอบ |
|---|---|
| COMPLETED ตรงเวลา + แผนคร่อมเดือน (เช่น 29 มิ.ย.–1 ก.ค.) | สรุป + **overlap query ข้ามเดือน** |
| COMPLETED ช้า + delayEndReason | แสดงเหตุผลในสรุป |
| IN_PROGRESS (วันนี้อยู่ในช่วง) | สิ่งที่ต้องทำวันนี้ |
| IN_PROGRESS ช้า + delayStartReason | dialog เหตุผลตอนเริ่ม |
| IN_PROGRESS_OVERDUE (เลย endDate ยังไม่ปิด) | badge เตือน |
| NOT_STARTED_OVERDUE (เลย startDate ยังไม่กด) | badge เตือน |
| NOT_STARTED + แถบยาวหลายวัน | ปฏิทิน multi-day bar |

⚠️ แผนคร่อมเดือนคือเคสจับ regression ของ overlap query — อย่าลืมครอบทุกครั้งที่ปรับ query เดือน

## Edge cases ที่ต้องมีเทส (มาจาก bug จริง/การถกจริง)

### วันที่ / timezone
- [ ] สร้างแผนด้วย input `2026-07-01T17:00:00Z` (= เที่ยงคืน 2 ก.ค. ICT) → ใน DB ต้องเป็น **2 ก.ค.** ไม่ใช่ 1 ก.ค.
- [ ] `update` เฉพาะ `name` → `startDate`/`endDate` ใน DB ต้องไม่ถูก write ซ้ำ
- [ ] `endDate < startDate` (หลัง normalize) → `BAD_REQUEST`

### Overlap query (ปฏิทิน)
- [ ] แผน 29 มิ.ย.–2 ก.ค.: ต้องโผล่ทั้งเดือน มิ.ย. และ ก.ค.
- [ ] แผนจบ 30 มิ.ย.: ต้องไม่โผล่เดือน ก.ค.
- [ ] แผนวันเดียว = วันแรกของเดือน และ = วันสุดท้ายของเดือน: ต้องโผล่ (ทดสอบขอบ `≤`/`≥`)
- [ ] แผนเดือน ก.ค. ปีอื่น: ต้องไม่โผล่

### Multi-day bar (ปฏิทิน) — มีเทสแล้วใน `apps/web/src/lib/calendar-lanes.test.ts`
- [x] แผนข้ามสัปดาห์ → แตก 2 segment ขอบเรียบฝั่งที่ต่อกัน (มนเฉพาะจุดเริ่ม/จบจริง)
- [x] แผนคร่อมเดือน (เริ่มก่อน grid ที่มองเห็น) → clamp เข้าสัปดาห์ + หัวเรียบ
- [x] lane ว่างถูก reuse / แผนทับกันซ้อน lane ตามลำดับ / เกิน 3 lane → นับลง "+N เพิ่มเติม" เฉพาะวันที่ทับ

### workPlan.todo (สิ่งที่ต้องทำ / สรุป)
- [ ] แผนจบเดือนก่อนที่ยังไม่กดจบงาน → ต้องโผล่ใน `todo` แม้ข้ามเดือน (จุดที่ `list` มองไม่เห็น — เหตุผลที่มี query นี้)
- [ ] แผนที่จบงานไปแล้วก่อนวันนี้ (`actEnd` มีค่า, `endDate` < วันนี้) → ต้องไม่โผล่เป็นงานค้าง
- [ ] แผนทับวันนี้ที่เพิ่งกดจบวันนี้ → ต้องโผล่ (โชว์ในสรุปว่าเสร็จแล้ว)
- [ ] แผนอนาคต (เริ่มพรุ่งนี้) → ต้องไม่โผล่

### เลขไซต์ (sequence)
- [ ] `create` 2 ครั้งติดกัน → ได้เลขไซต์ (Int) ไม่ซ้ำ รันต่อเนื่องจาก sequence
- [ ] client ส่ง `siteId` มาใน `create` → ถูก zod ตัดทิ้ง ไม่มีผลกับเลขที่ gen
- [ ] `search` ด้วย `"12"` หรือ `"#5"` → เจอแผนที่ `siteId` ตรงเลขนั้น (เลขหลักเดียวใส่ `#` ให้ผ่าน min 2 ตัวอักษร)

### Status + delay
- [ ] `start` แผนที่ยังไม่ถึงวัน → สำเร็จโดยไม่ต้องมีเหตุผล
- [ ] `start` ช้ากว่าแผน โดยไม่ส่ง `delayStartReason` → `BAD_REQUEST`
- [ ] `start` ช้า + ส่งเหตุผลเป็นช่องว่าง `"   "` → `BAD_REQUEST` (มี `.trim()` เช็ค)
- [ ] `finish` ก่อน `start` → `BAD_REQUEST`
- [ ] `start`/`finish` ซ้ำ → `BAD_REQUEST`
- [ ] status ทั้ง 5 ค่า ทดสอบผ่าน `planStatus()` ตรงๆ (pure function — เทสง่ายสุดในระบบ)

### RBAC

- [ ] ไม่มี token / token หมดอายุ / token ปลอม → `UNAUTHORIZED` ทุก procedure ยกเว้น `auth.login`
- [ ] token รุ่นเก่าที่ `sub` เป็น cuid (string) → นับเป็นไม่ได้ login (`UNAUTHORIZED` — เคสหลัง migrate user id เป็นเลขรัน)
- [ ] CEO เรียก `create/update/start/finish` → `FORBIDDEN`
- [ ] Engineer A แก้แผนของ Engineer B → `FORBIDDEN`
- [ ] Engineer เรียก `list` พร้อมส่ง `userId` ของคนอื่น → ได้เฉพาะของตัวเอง (ค่าถูก ignore)
- [ ] CEO เรียก `list` ไม่ส่ง `userId` → ได้ทุกคน / ส่ง `userId` → ได้เฉพาะคนนั้น

### Auth
- [ ] login: username ไม่มี vs รหัสผิด → error **ข้อความเดียวกัน**
- [ ] login สำเร็จ → token ใช้เรียก `me` ได้ และ payload มี role ถูกต้อง

## เครื่องมือแนะนำ

- **Vitest** — unit test `planStatus()`, `dateOnlyICT()`, `buildWeekBars()/sortForLanes()` (pure functions ไม่ต้องมี DB)
- **Vitest + testcontainers** (หรือ DB แยกใน compose) — integration test ระดับ router:
  เรียก `appRouter.createCaller(ctx)` ตรงๆ ไม่ต้องผ่าน HTTP ปลอม ctx ได้ง่าย (mock `ctx.user`)
- Type check ทั้ง 2 apps คือ safety net ชั้นแรก: `pnpm typecheck` ที่ root ต้องเขียวก่อน merge เสมอ

## ยังไม่ทำ (บันทึกไว้)

- E2E (Playwright) — ค่อยเริ่มเมื่อ UI นิ่ง
- Load test — user หลักสิบคน ยังไม่จำเป็น
