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

**Returns:** `{ token: string, user: { id, name, role, color } }` — token อายุ 12 ชม.

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
| `userId` | string? | **CEO เท่านั้น** ที่มีผล — Engineer ถูกล็อกเป็นตัวเองเสมอ |
| `type` | "SOLAR"\|"CCTV"\|"NETWORK"? | filter ตามประเภทงาน (หน้าไซต์งาน) — ไม่ส่ง = ทุกประเภท |

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

### `workPlan.create` — mutation · ENGINEER เท่านั้น

| Input | Type | หมายเหตุ |
|---|---|---|
| `name` | string 1–200 | |
| `type` | "SOLAR"\|"CCTV"\|"NETWORK"? | ประเภทงาน — optional, เลือกจาก dropdown |
| `startDate` | Date | ถูก normalize เป็นวัน ICT ก่อนเซฟ |
| `endDate` | Date | เช่นเดียวกัน |

เจ้าของแผน = คน login เสมอ (`userId` จาก client ถูก ignore)
`jobId` **ไม่รับจาก client** — API รันเลขให้เอง (`JOB-001`, `JOB-002`, …) จาก Postgres sequence
`job_id_seq` กันเลขชนแม้สร้างพร้อมกัน (migration `20260706000000_job_id_sequence`)

**Errors:** `BAD_REQUEST` วันจบก่อนวันเริ่ม · `FORBIDDEN` role ไม่ใช่ ENGINEER

### `workPlan.update` — mutation · ENGINEER · เจ้าของเท่านั้น

Input: `{ id: string }` + fields ของ `create` แบบ optional (ส่งเฉพาะที่แก้)
Field ที่ไม่ส่งจะไม่ถูก write ทับ — รวมถึง `type` (ส่ง `{ type: undefined }` เพื่อล้างค่ากลับเป็นไม่ระบุ)

**Errors:** `NOT_FOUND` · `FORBIDDEN` ไม่ใช่เจ้าของ · `BAD_REQUEST` แผนเริ่มงานแล้ว (แก้ไม่ได้) หรือวันจบก่อนวันเริ่ม

### `workPlan.start` — mutation · ENGINEER · เจ้าของเท่านั้น

กดปุ่ม "เริ่มงาน" — set `actStart = now`

| Input | Type | หมายเหตุ |
|---|---|---|
| `id` | string | |
| `delayStartReason` | string ≤500 ? | **บังคับ**เมื่อวันนี้ (ICT) > `startDate` |

**Errors:** `NOT_FOUND` · `FORBIDDEN` · `BAD_REQUEST` เริ่มไปแล้ว หรือเริ่มช้าแต่ไม่ให้เหตุผล

### `workPlan.finish` — mutation · ENGINEER · เจ้าของเท่านั้น

กดปุ่ม "จบงาน" — set `actEnd = now`

| Input | Type | หมายเหตุ |
|---|---|---|
| `id` | string | |
| `delayEndReason` | string ≤500 ? | **บังคับ**เมื่อวันนี้ (ICT) > `endDate` |

**Errors:** `NOT_FOUND` · `FORBIDDEN` · `BAD_REQUEST` ยังไม่เริ่ม / จบไปแล้ว / จบช้าแต่ไม่ให้เหตุผล

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
- ห้ามมี mutation ที่ CEO เรียกได้ (ดู AGENT.md ข้อ 6)
- Breaking change → type error จะโผล่ฝั่ง web เอง แต่ต้องแจ้งใน commit message ด้วย
