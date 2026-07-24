# API.md — tRPC Procedure Reference

Base URL: `{API_ORIGIN}/trpc` — ทุก request (ยกเว้น `auth.login`) ต้องแนบ header:

```
Authorization: Bearer <JWT>
```

Transformer: `superjson` (ส่ง `Date` ข้าม network ได้ตรงๆ)
Error format: `TRPCError` — `code` เป็นมาตรฐาน tRPC, `message` เป็นภาษาไทยแสดง user ได้เลย

---

## auth

### `auth.login` — mutation · public

| Input | Type | หมายเหตุ |
|---|---|---|
| `username` | string | ถูก lowercase + trim ก่อนค้น |
| `password` | string | |

**Returns:** `{ token: string, user: { id, name, role, color } }` — token อายุ 12 ชม., `id` เป็นเลขรัน (Int)

**Errors:** `UNAUTHORIZED` — ข้อความเดียวกันเสมอไม่ว่า username ไม่มีหรือรหัสผิด

### `auth.me` — query · login แล้ว

ตรวจ token + ดึงข้อมูลตัวเอง (ใช้ตอนเปิดแอป)
**Returns:** `{ id, name, role, color }`

---

## workPlan

### `workPlan.list` — query · login แล้ว (ทุก role)

ใช้เป็น data source ของ **ปฏิทิน / แผงรายวัน / รายการแผนทั้งเดือน** (client กรองวันต่อเอง)
ส่วน "สิ่งที่ต้องทำ" และ "สรุป" ใช้ `workPlan.todo` — window รายเดือนมองไม่เห็นงานค้างข้ามเดือน

| Input | Type | หมายเหตุ |
|---|---|---|
| `year` | int 2020–2100 | |
| `month` | int 1–12 | |
| `userId` | int? | **CEO เท่านั้น** ที่มีผล — Engineer ถูกล็อกเป็นตัวเองเสมอ |
| `type` | string? | `types.id` เช่น `"1"` (ตัวเลือกดึงจาก `type.list`) — ไม่ส่ง = ทุกประเภท |

**เงื่อนไข query:** interval overlap — `startDate ≤ สิ้นเดือน AND endDate ≥ ต้นเดือน`
(แผนคร่อมเดือนจะโผล่ทั้งสองเดือน — เจตนา)

**Returns:** `WorkPlan[]` แต่ละตัว include `user: { id, name, color }` เรียงตาม `startDate`

**Status ไม่อยู่ใน response** — client คำนวณเองผ่าน `planStatus(plan, todayICT())`:

| เงื่อนไข | Status |
|---|---|
| `actEnd` มีค่า | `COMPLETED` |
| `actStart` มีค่า และวันนี้ > `endDate` | `IN_PROGRESS_OVERDUE` |
| `actStart` มีค่า และวันนี้ ≤ `endDate` | `IN_PROGRESS` |
| `actStart` ว่าง และวันนี้ > `startDate` | `NOT_STARTED_OVERDUE` |
| `actStart` ว่าง และวันนี้ ≤ `startDate` | `NOT_STARTED` |

### `workPlan.todo` — query · login แล้ว (ทุก role)

ใช้เป็น data source ของ **สิ่งที่ต้องทำวันนี้ / สรุปประจำวัน** — ไม่ผูกกับเดือนที่ดูในปฏิทิน

**ไม่มี input** — "วันนี้" คิดฝั่ง API (ICT) เสมอ ไม่ไว้ใจนาฬิกา client

**เงื่อนไข query** (OR สองก้อน — Engineer ล็อกเห็นเฉพาะของตัวเอง / CEO เห็นทุกคน):

- แผนที่ทับวันนี้: `startDate ≤ วันนี้ AND endDate ≥ วันนี้` (รวมงานที่เพิ่งปิดวันนี้ → โชว์ในสรุปว่าเสร็จแล้ว)
- งานค้างจากวันก่อน: `endDate < วันนี้ AND actEnd IS NULL` (เลยช่วงแผนแล้วยังไม่กดจบ — มองเห็นข้ามเดือน)

**Returns:** โครงเดียวกับ `list` (include `user: { id, name, color }` เรียงตาม `startDate`)

### `workPlan.search` — query · login แล้ว (ทุก role)

ค้นหาแผนงาน**ข้ามเดือน** — ไม่จำกัดเดือน/จำนวนผลลัพธ์ RBAC เหมือน `list`
(11 ก.ค. 2026: หน้าไซต์งานเลิกใช้แล้ว — เปลี่ยนเป็นรายชื่อไซต์ + กรองฝั่ง client — ตอนนี้ยังไม่มีหน้าไหนเรียก)

| Input | Type | หมายเหตุ |
|---|---|---|
| `q` | string ≥2 (trim) | ค้นชื่อแผน (contains, case-insensitive) — ถ้าเป็นเลข/`#เลข` เช่น `"12"`/`"#5"` เทียบ `siteId` ด้วย (ใส่ `#` ช่วยให้เลขหลักเดียวผ่าน min 2 ตัวอักษร) |
| `type` | string? | `types.id` — กรองร่วมกับผลค้นหาได้ |

**Returns:** โครงเดียวกับ `list` (render plan-row ชุดเดียวกันได้)

### `workPlan.bySite` — query · login แล้ว (ทุก role)

ประวัติแผนงาน**ทั้งหมดของไซต์เดียว** (หน้า `/sites/[id]`) — ไม่จำกัดเดือน เรียง `startDate` ใหม่→เก่า
**จงใจไม่กรองตาม user**: ประวัติไซต์เป็นข้อมูลกลาง ทุก role เห็นแผนของทุกคน
(ข้อยกเว้นจาก pattern "Engineer เห็นเฉพาะของตัวเอง" ของ `list`/`search`/`todo` — เป็น query view-only จึงไม่ชนกติกา CEO view-only)

| Input | Type | หมายเหตุ |
|---|---|---|
| `siteId` | int > 0 | `sites.id` — ไซต์ที่ไม่มีจริงได้ `[]` (ไม่ error — หน้า detail เช็คไม่พบจาก `site.get` แทน) |

**Returns:** โครงเดียวกับ `list` (include `user: { id, name, color }`)

### `workPlan.create` — mutation · ENGINEER เท่านั้น

| Input | Type | หมายเหตุ |
|---|---|---|
| `name` | string 1–200 | |
| `type` | string | `types.id` — **บังคับ** (dropdown ไซต์กรองตามประเภท); ค่าที่ไม่มีจริงตอบ `BAD_REQUEST` ภาษาไทย |
| `siteId` | int | `sites.id` — เลือกจาก dropdown (`site.list` กรองตาม `Site.types` ฝั่ง web) API เช็คซ้ำว่าไซต์มีจริง + รองรับ `type` |
| `startDate` | Date | ถูก normalize เป็นวัน ICT ก่อนเซฟ |
| `endDate` | Date | เช่นเดียวกัน |

เจ้าของแผน = คน login เสมอ (`userId` จาก client ถูก ignore)
`siteId` เป็น FK → `sites.id` ตั้งแต่ 11 ก.ค. 2026 (migration `20260711074613_link_work_plan_site`) —
เดิมเป็นเลขรันอิสระจาก sequence `site_id_seq` ที่ API gen เอง client ไม่ส่ง (sequence นั้น drop แล้ว
แผนเก่าถูก backfill เป็น placeholder site "ไซต์ #N")

**Errors:** `BAD_REQUEST` วันจบก่อนวันเริ่ม / ไม่พบไซต์ / ไซต์ไม่รองรับประเภทงาน · `FORBIDDEN` role ไม่ใช่ ENGINEER

### `workPlan.update` — mutation · ENGINEER · เจ้าของเท่านั้น

Input: `{ id: number }` + fields ของ `create` แบบ optional (ส่งเฉพาะที่แก้)
Field ที่ไม่ส่งจะไม่ถูก write ทับ — แผนเก่าที่ `type` เป็น null แก้ field อื่นได้โดยไม่บังคับเติม type
ส่ง `type` หรือ `siteId` มา → เช็คคู่ site↔type ตามค่าสุดท้ายหลังแก้ (ที่ไม่ส่งใช้ค่าเดิมใน DB)

**Errors:** `NOT_FOUND` · `FORBIDDEN` ไม่ใช่เจ้าของ · `BAD_REQUEST` แผนเริ่มงานแล้ว (แก้ไม่ได้) / วันจบก่อนวันเริ่ม / ไม่พบไซต์ / ไซต์ไม่รองรับประเภทงาน

### `workPlan.delete` — mutation · ENGINEER · เจ้าของเท่านั้น

ลบแผนที่**ยังไม่กดเริ่มงาน** (ปุ่ม "ลบแผนงาน" ใน modal แก้ไข — confirm สองจังหวะฝั่ง web)
แผนที่เริ่ม/จบแล้วลบไม่ได้ — เป็นประวัติการทำงานจริง กันประวัติเพี้ยน (กติกาเดียวกับ update)
audit log เดิมที่อ้างถึงแผนยังอยู่ครบ (`targetId` เป็น text ไม่มี FK) และการลบเองก็ถูก log อัตโนมัติ

| Input | Type | หมายเหตุ |
|---|---|---|
| `id` | number | เลขรันของแผน |

**Errors:** `NOT_FOUND` · `FORBIDDEN` ไม่ใช่เจ้าของ · `BAD_REQUEST` แผนเริ่มงานแล้ว (ลบไม่ได้)

### `workPlan.start` — mutation · ENGINEER · เจ้าของเท่านั้น

กดปุ่ม "เริ่มงาน" — set `actStart = now`

| Input | Type | หมายเหตุ |
|---|---|---|
| `id` | number | เลขรันของแผน |
| `delayStartReason` | string ≤500 ? | **บังคับ**เมื่อวันนี้ (ICT) > `startDate` |

**Errors:** `NOT_FOUND` · `FORBIDDEN` · `BAD_REQUEST` เริ่มไปแล้ว หรือเริ่มช้าแต่ไม่ให้เหตุผล

### `workPlan.unstart` — mutation · ENGINEER · เจ้าของเท่านั้น

ปุ่ม "ยกเลิกเริ่มงาน" ใน banner สิ่งที่ต้องทำ (เคสกดเริ่มผิดแผน/ผิดจังหวะ — confirm สองจังหวะฝั่ง web)
ล้าง `actStart` + `delayStartReason` → แผนกลับเป็น "ยังไม่เริ่ม" แล้วแก้/ลบต่อได้ตามกติกาเดิม
(จงใจถอยสถานะแทนการเปิดให้ลบแผนที่เริ่มแล้ว — กติกา "เริ่มแล้วห้ามแก้/ลบ" ยังจริงเสมอ)
แผนที่**จบงานแล้ว**ยกเลิกไม่ได้ — ประวัติงานที่ปิดสมบูรณ์แล้ว

| Input | Type | หมายเหตุ |
|---|---|---|
| `id` | number | เลขรันของแผน |

**Errors:** `NOT_FOUND` · `FORBIDDEN` ไม่ใช่เจ้าของ · `BAD_REQUEST` ยังไม่เริ่ม / จบงานไปแล้ว

### `workPlan.finish` — mutation · ENGINEER · เจ้าของเท่านั้น

กดปุ่ม "จบงาน" — set `actEnd = now`

| Input | Type | หมายเหตุ |
|---|---|---|
| `id` | number | เลขรันของแผน |
| `delayEndReason` | string ≤500 ? | **บังคับ**เมื่อวันนี้ (ICT) > `endDate` |

**Errors:** `NOT_FOUND` · `FORBIDDEN` · `BAD_REQUEST` ยังไม่เริ่ม / จบไปแล้ว / จบช้าแต่ไม่ให้เหตุผล

### `workPlan.explainDelay` — mutation · ENGINEER · เจ้าของเท่านั้น

> ปุ่ม "ระบุเหตุผล" ใน banner สิ่งที่ต้องทำ ถูกถอดออกแล้ว (24 ก.ค. 2026) — เหตุผลความล่าช้า
> เก็บตอนกดเริ่ม/จบเท่านั้น (กดจบก็บังคับกรอกอยู่แล้ว) endpoint นี้ยังเหลือไว้แต่ไม่มี UI เรียก

ระบุ/แก้เหตุผลความล่าช้า **ระหว่างงานยังค้าง** โดยไม่ต้องรอกดจบงาน (เดิมเหตุผลเก็บตอนกดเริ่ม/จบ
เท่านั้น แผนที่เลยกำหนดจบแต่ยังไม่ปิดจึงไม่มีเหตุผลให้ CEO เห็นเลยในหน้างานล่าช้า)

ไม่เพิ่มคอลัมน์ใหม่ — เขียนลงช่องเดิมตามจุดที่ช้า:
`endDate` ผ่านไปแล้ว → `delayEndReason` / ยังไม่ถึง → `delayStartReason`

| Input | Type | หมายเหตุ |
|---|---|---|
| `id` | number | เลขรันของแผน |
| `reason` | string 1–500 | เหตุผลความล่าช้า (trim แล้วห้ามว่าง) |

**Errors:** `NOT_FOUND` · `FORBIDDEN` ไม่ใช่เจ้าของ · `BAD_REQUEST` จบงานไปแล้ว / แผนยังไม่ล่าช้า

---

## overdue (งานล่าช้า — CEO เท่านั้น)

`ceoProcedure` (บล็อก non-CEO ที่ต้นน้ำ ไม่ใช่ซ่อนปุ่มฝั่ง web)

นิยาม "ล่าช้า" = เทียบแผนกับจริง **ระดับวันไทย** (`apps/api/src/lib/overdue.ts`):
`START_DUE` เลยกำหนดเริ่ม (ยังไม่กดเริ่ม) · `START_LATE` เริ่มช้า ·
`END_DUE` เลยกำหนดจบแต่ยังไม่กดจบ (เริ่มแล้ว) · `END_LATE` จบช้า
(หนักกว่าชนะ: `END_LATE` > `END_DUE` > `START_LATE` > `START_DUE`;
`START_DUE`/`END_DUE` แยกด้วย `actStart` ให้ตรงกับ `planStatus`)
— ไม่เก็บคอลัมน์ในตาราง คำนวณตอน query เหมือน `planStatus`

### `overdue.list` — query · CEO เท่านั้น

ตาราง drill-down งานล่าช้าทุกใบ เรียงช้านานสุดขึ้นก่อน → ชื่อคน → ชื่องาน

| Input | Type | หมายเหตุ |
|---|---|---|
| `engineerId` | number ? | ไม่ส่ง = ทุกคน |

**Returns:** `OverdueRow[]` — `refId, title, userId/userName/userColor, siteId/siteName,
typeId/typeName, startDate, endDate, actStart, actEnd, delayKind, delayDays,
delayStartReason, delayEndReason`

เหตุผล**แยก 2 ค่า** (ไม่ยุบรวม) — แผนที่ทั้งเริ่มช้าและจบช้าเก็บทั้งคู่ web โชว์เป็น 2 คอลัมน์แยก
"เริ่มช้า" / "จบช้า" (ว่าง = "—") · filter ประเภทงาน (`typeId`) + งานช้า (`delayKind`) ทำฝั่ง web — endpoint นี้ไม่รับ

---

## type

### `type.list` — query · login แล้ว

ประเภทงานทั้งหมดจาก lookup table `types` เรียงตาม id — ใช้เป็นตัวเลือก dropdown ใน PlanModal
และปุ่ม filter หน้าไซต์งาน (**ห้าม hardcode รายชื่อประเภทฝั่ง web** — สี chip เท่านั้นที่อยู่ที่
`plan-types.ts`) เพิ่ม/แก้ประเภททำผ่าน migration/seed ไม่มี mutation

**ไม่มี input** · **Returns:** `{ id: string, name: string }[]` เช่น `{ id: "1", name: "Solar Cell" }`

---

## site

### `site.list` — query · login แล้ว

ไซต์ทั้งหมดเรียงตาม id — ใช้ 2 ที่: dropdown ไซต์ใน PlanModal + รายชื่อไซต์หน้า `/sites`
(web กรองตามประเภท/คำค้นเองจาก `types` ที่แนบไป — ส่งทั้งหมดทีเดียว เปลี่ยน filter ไม่ต้อง refetch)

**ไม่มี input** · **Returns:** `{ id: number, name: string, types: { id: string }[] }[]`

### `site.get` — query · login แล้ว

ข้อมูลไซต์เดียว — หัวหน้า site detail (`/sites/[id]`) แนบชื่อประเภทเต็ม (ไม่ต้องพึ่ง `type.list`)

| Input | Type | หมายเหตุ |
|---|---|---|
| `id` | int > 0 | `sites.id` |

**Returns:** `Site` + `types: { id, name }[]`

**Errors:** `NOT_FOUND` ไม่พบไซต์งานนี้

### `site.create` — mutation · ENGINEER เท่านั้น

สร้างไซต์งานจากปุ่ม "+ ไซต์งาน" หน้าไซต์งาน — `work_plans.siteId` เป็น FK มาที่ `sites.id` แล้ว
(ตั้งแต่ 11 ก.ค. 2026 — ลบไซต์ที่มีแผนใช้อยู่ไม่ได้, Restrict)

| Input | Type | หมายเหตุ |
|---|---|---|
| `name` | string 1–200 | trim ฝั่ง API |
| `typeIds` | string[] | `types.id` หลายตัว (checkbox — m-n) · `[]` = ไม่ระบุประเภท · id ซ้ำถูก dedupe · id ที่ไม่มีจริงตอบ `BAD_REQUEST` ภาษาไทย |

**Returns:** `Site` + `types: { id, name }[]` (เลขไซต์ `id` เป็น Int autoincrement)

**Errors:** `BAD_REQUEST` ประเภทงานไม่ถูกต้อง · `FORBIDDEN` role ไม่ใช่ ENGINEER

### `site.delete` — mutation · ENGINEER เท่านั้น

ลบไซต์ (ปุ่ม "ลบไซต์งาน" หัวหน้า `/sites/[id]` — confirm สองจังหวะฝั่ง web)
ไซต์ไม่มีเจ้าของ — engineer คนไหนก็ลบได้ (เหมือน create) แต่**ไซต์ที่มีแผนงานอ้างถึงอยู่ลบไม่ได้**
(FK `work_plans.siteId` เป็น Restrict — API เช็ค count ก่อนเพื่อตอบภาษาไทยแทน P2003 ดิบ)
ประเภทของไซต์ (ตารางเชื่อม `_SiteToType`) หลุดตามอัตโนมัติ — ตัว `Type` ไม่ถูกลบ

| Input | Type | หมายเหตุ |
|---|---|---|
| `id` | int > 0 | `sites.id` |

**Errors:** `NOT_FOUND` ไม่พบไซต์งานนี้ · `FORBIDDEN` role ไม่ใช่ ENGINEER · `BAD_REQUEST` มีแผนงานอ้างถึงอยู่ (บอกจำนวนแผน)

---

## ticket (เคสลูกค้า — ตั้งแต่ 18 ก.ค. 2026 · slim schema 20 ก.ค. 2026)

`tickets` เหลือ 8 column: `id, title, detail, status, type, assigneeId, createdById, createdAt`
สถานะเป็น column จริง `status` enum `TicketStatus` (`OPEN`/`ACCEPTED`/`CLOSED`) — เลิก derive แล้ว
เคสไม่ผูกไซต์/ไม่มีนัดหมาย — ไซต์เป็นเรื่องของแผนตอน `accept` · เคสที่ ACCEPTED/CLOSED ล็อกทั้งเคส
mutation ฝั่งเคส (create/update/close) เปิดให้**ทุก role รวม CEO** — ข้อยกเว้น RBAC
ที่อนุมัติแล้ว (ดู AGENT.md lock 6) ส่วน `accept` ยังเป็น ENGINEER เท่านั้น

### `ticket.list` — query · login แล้ว (ทุก role)

เคสทั้งหมดเรียงใหม่→เก่า — **จงใจไม่ scope ตาม user** (คิวกลางของทีม — precedent เดียวกับ `workPlan.bySite`)

| Input | Type | หมายเหตุ |
|---|---|---|
| `status` | `"OPEN"·"ACCEPTED"·"CLOSED"`? | optional — ไม่ส่ง = ทั้งหมด (web ส่งไม่ใส่แล้วกรองเอง) |

**Returns:** `Ticket[]` แต่ละตัว include `assignee`/`createdBy` `{id,name,color}`

### `ticket.get` — query · login แล้ว

เคสเดียวแบบเต็ม (detail modal) — include เดียวกับ `list`

### `ticket.todo` — query · login แล้ว (ทุก role)

feed ของ `TicketBanner` บน dashboard (แจ้งเตือนตอน login รายวัน): เคส `status = OPEN` เท่านั้น
ENGINEER เห็นเคสที่มอบหมายให้ตัวเอง / CEO เห็นทุกเคสเปิด (view-only) — เรียงเก่า→ใหม่ (ค้างนานสุดก่อน)

### `ticket.create` — mutation · login แล้ว (รวม CEO)

| Input | Type | หมายเหตุ |
|---|---|---|
| `title` | string 1–200 | หัวข้อเคส |
| `detail` | string ≤2000? | |
| `type` | string? | `types.id` — optional (เคสไม่เข้าประเภทได้) |
| `assigneeId` | int > 0 | ผู้รับเคส — **ต้องเป็น ENGINEER** |

`createdById = ctx.user.sub` เสมอ · status เริ่มเป็น `OPEN` · **Errors:** `BAD_REQUEST` ผู้รับเคสต้องเป็น Engineer / ประเภทไม่ถูกต้อง

### `ticket.update` — mutation · คนเปิดเคสหรือผู้รับเคส · เคสยังเปิดอยู่

field เดียวกับ create แต่เป็น partial — **`null` = ล้างค่า / ไม่ส่ง = ไม่แตะ** (detail/type)
**Errors:** `FORBIDDEN` ไม่ใช่คนเปิด/ผู้รับ · `BAD_REQUEST` เคสล็อกแล้ว

### `ticket.close` — mutation · คนเปิดเคสหรือผู้รับเคส

ปิดเคสโดยไม่แปลงเป็นแผน — set `status = CLOSED` (ไม่บังคับเหตุผลแล้ว — column `closeReason` ถูกตัด)
(ไม่มี `ticket.delete` — ปิดแทนลบ เก็บประวัติ intake)

| Input | Type | หมายเหตุ |
|---|---|---|
| `id` | int > 0 | |

**Errors:** `BAD_REQUEST` เคสถูกรับเป็นแผนแล้ว / ปิดไปแล้ว

### `ticket.accept` — mutation · ENGINEER · เฉพาะผู้ถูกมอบหมาย

"รับเป็นแผนงาน": สร้าง `WorkPlan` (เจ้าของ = คนกด) + set `status = ACCEPTED` ใน **transaction เดียว**
ไม่มี FK ผูกแผน↔เคสแล้ว (ลบแผนภายหลังเคสไม่เด้งกลับมาเปิด)
กันกดรับแข่งกัน (2 tab): update มีเงื่อนไข `status = OPEN` — โดนตัดหน้า = rollback แผนที่เพิ่งสร้าง

| Input | Type | หมายเหตุ |
|---|---|---|
| `id` | int > 0 | ticket id |
| `name` | string 1–200 | ชื่อแผนใหม่ (prefill จากหัวข้อเคส) |
| `type` | string | **บังคับ** — กติกาเดียวกับ `workPlan.create` |
| `siteId` | int > 0 | **บังคับ** — เลือก/สร้างไซต์ตอนกดรับ (`site.create`) |
| `startDate`/`endDate` | Date | ผ่าน `dateOnlyICT` เหมือนแผนปกติ |

**Returns:** `{ plan: WorkPlan, ticket: Ticket }` · audit detail มี `workPlanId` ฝากจาก handler
**Errors:** `FORBIDDEN` ไม่ใช่เคสของคุณ · `BAD_REQUEST` เคสถูกรับไปแล้ว / ปิดแล้ว / วัน-ประเภท-ไซต์ไม่ถูกต้อง

> รูปแนบเคส (`ticket.removeImage` + endpoint `/uploads/*`) **ถูกถอดออกแล้ว 20 ก.ค. 2026** —
> เลิกเก็บรูป/metadata ใน DB (ตาราง `ticket_images` ถูก drop) รูปจะย้ายไปเก็บที่อื่น (ยังไม่กำหนด)

---

## user

### `user.list` — query · login แล้ว

roster สำหรับ dropdown "ผู้รับเคส" — คืน**เฉพาะ ENGINEER** เรียงตาม id
(แยกจาก `log.users` ที่เป็น ceoProcedure และคืนทุก role)

**ไม่มี input** · **Returns:** `{ id: number, name: string, color: string }[]`

---

## log

### `log.list` — query · login แล้ว (ทุก role)

ประวัติการใช้งานเรียงใหม่→เก่า — Engineer ถูกล็อกเห็นเฉพาะ log ตัวเอง / CEO เห็นทุกคน + filter รายคนได้

| Input | Type | หมายเหตุ |
|---|---|---|
| `userId` | int? | filter รายคน — **CEO เท่านั้น** ที่มีผล |
| `from` | Date? | `gte` — instant UTC ที่ web คำนวณจากขอบ "วันไทย" มาแล้ว |
| `to` | Date? | `lt` — exclusive (web ส่งต้นวันถัดไปเพื่อครอบทั้งวัน "ถึง") |
| `limit` | int 1–200 = 100 | |

**Returns:** `Log[]` แต่ละตัว include `user: { id, name, color }`

### `log.track` — mutation · login แล้ว

รับ click log จากฝั่ง web เป็น batch (`ClickLogger` ใน `providers.tsx`) — **ทางเดียวที่ client เขียน log ได้**
middleware audit ข้าม path นี้กัน log ซ้อน

| Input | Type | หมายเหตุ |
|---|---|---|
| `events` | array 1–50 | `{ action: string ≤64, targetId?: string ≤64, detail?: any }` — ปกติ `action = "ui.click"`, `detail = {page,label,tag,at}` **ห้ามมีค่าใน input field / password** |

**Returns:** `{ ok: true }`

---

## ตัวอย่างการใช้ฝั่ง client

```tsx
// ปฏิทิน
const { data } = trpc.workPlan.list.useQuery({ year: 2026, month: 7 });

// เริ่มงาน — refresh ทุก query ของ workPlan (ปฏิทิน/สิ่งที่ต้องทำ/สรุป ขยับตามกัน)
const utils = trpc.useUtils();
const start = trpc.workPlan.start.useMutation({
  onSuccess: () => utils.workPlan.invalidate(),
});
start.mutate({ id, delayStartReason: "รอของจาก supplier" });
```

## กติกาเวลาแก้ API นี้

- เพิ่ม procedure ใหม่ → อัปเดตไฟล์นี้ + เพิ่ม edge cases ใน TESTING.md
- ห้ามมี mutation ที่ CEO เรียกได้ (ดู AGENT.md ข้อ 6) — ยกเว้น module เคสลูกค้า (`ticket.*` ยกเว้น `accept` — อนุมัติ 18 ก.ค. 2026)
- Breaking change → type error จะโผล่ฝั่ง web เอง แต่ต้องแจ้งใน commit message ด้วย
