// apps/web/src/lib/log-actions.ts
// ตัวกรอง "ประเภทการกระทำ" ของหน้า log — นิยามรหัสมาตรฐาน 15 ตัว (SCREAMING_SNAKE)
// map ลงค่า action จริงใน audit_logs ซึ่งเก็บเป็น tRPC path (เช่น "workPlan.create")
//
// กติกา:
// - match ใส่รหัสมาตรฐานของตัวเองไว้ด้วยเสมอ — ถ้าอนาคตระบบเริ่มเขียน log ด้วยรหัสพวกนี้ตรงๆ
//   ตัวกรองจะเจอทันทีโดยไม่ต้องแก้หน้าเว็บ
// - logged: false = ระบบปัจจุบันยังไม่มี event ประเภทนี้ (เลือกได้ แต่ผลว่างเสมอ — หน้า log
//   ใช้ flag นี้โชว์หมายเหตุแทนคำว่า "ไม่พบประวัติ" กันเข้าใจผิดว่าตัวกรองพัง)
//   พอเริ่มเก็บ event จริงเมื่อไหร่ ให้เติม path ลง match แล้วสลับเป็น logged: true

export type LogActionFilter = {
  code: string; // รหัสมาตรฐานที่ผู้ใช้เลือกใน dropdown
  label: string; // ป้ายไทย
  match: string[]; // ค่า action ใน DB ที่นับเป็นประเภทนี้ (ส่งให้ auditLog.list เป็น input.actions)
  logged: boolean; // ระบบมีการเขียน log ประเภทนี้แล้วหรือยัง
};

export const LOG_ACTION_GROUPS: { label: string; items: LogActionFilter[] }[] = [
  {
    label: "การเข้าใช้งาน",
    items: [
      {
        code: "LOGIN_SUCCESS",
        label: "เข้าสู่ระบบสำเร็จ",
        match: ["auth.login", "LOGIN_SUCCESS"],
        logged: true,
      },
      { code: "LOGIN_FAILED", label: "เข้าสู่ระบบไม่สำเร็จ", match: ["LOGIN_FAILED"], logged: true },
      { code: "LOGOUT", label: "ออกจากระบบ", match: ["LOGOUT"], logged: false },
      { code: "TOKEN_REFRESH", label: "ต่ออายุ token", match: ["TOKEN_REFRESH"], logged: false },
      { code: "PASSWORD_CHANGED", label: "เปลี่ยนรหัสผ่าน", match: ["PASSWORD_CHANGED"], logged: false },
    ],
  },
  {
    label: "แผนงาน",
    items: [
      {
        code: "WORKPLAN_CREATED",
        label: "สร้างแผนงาน",
        match: ["workPlan.create", "WORKPLAN_CREATED"],
        logged: true,
      },
      {
        code: "WORKPLAN_UPDATED",
        label: "แก้ไขแผนงาน",
        match: ["workPlan.update", "WORKPLAN_UPDATED"],
        logged: true,
      },
      {
        code: "WORKPLAN_DELETED",
        label: "ลบแผนงาน",
        match: ["workPlan.delete", "WORKPLAN_DELETED"],
        logged: true,
      },
    ],
  },
  {
    label: "แจ้งซ่อม",
    items: [
      {
        code: "TICKET_CREATED",
        label: "เปิดแจ้งซ่อม",
        match: ["ticket.create", "TICKET_CREATED"],
        logged: true,
      },
      {
        code: "TICKET_UPDATED",
        label: "แก้ไขแจ้งซ่อม",
        match: ["ticket.update", "TICKET_UPDATED"],
        logged: true,
      },
      {
        code: "TICKET_ACCEPTED",
        label: "รับแจ้งซ่อมเป็นแผนงาน",
        match: ["ticket.accept", "TICKET_ACCEPTED"],
        logged: true,
      },
      {
        code: "TICKET_CLOSED",
        label: "ปิดแจ้งซ่อม",
        match: ["ticket.close", "TICKET_CLOSED"],
        logged: true,
      },
      {
        // mutation ถูกถอดแล้ว 20 ก.ค. 2026 (รูปแนบเคส) — คงไว้ให้ filter/label ครอบ log เก่าใน DB
        code: "TICKET_IMAGE_REMOVED",
        label: "ลบรูปแนบแจ้งซ่อม",
        match: ["ticket.removeImage", "TICKET_IMAGE_REMOVED"],
        logged: true,
      },
    ],
  },
  {
    label: "งาน",
    items: [
      { code: "JOB_CREATED", label: "สร้างงาน", match: ["JOB_CREATED"], logged: false },
      { code: "JOB_UPDATED", label: "แก้ไขงาน", match: ["JOB_UPDATED"], logged: false },
      {
        // ระบบนี้ "สถานะงาน" คือปุ่มเริ่ม/ยกเลิกเริ่ม/จบงานของแผน — นับเป็นประเภทนี้ทั้งสามปุ่ม
        code: "JOB_STATUS_CHANGED",
        label: "เปลี่ยนสถานะงาน (เริ่ม/ยกเลิกเริ่ม/จบ)",
        match: ["workPlan.start", "workPlan.unstart", "workPlan.finish", "JOB_STATUS_CHANGED"],
        logged: true,
      },
    ],
  },
  {
    label: "ผู้ใช้",
    items: [
      { code: "USER_CREATED", label: "สร้างผู้ใช้", match: ["USER_CREATED"], logged: false },
      { code: "USER_ROLE_CHANGED", label: "เปลี่ยน role ผู้ใช้", match: ["USER_ROLE_CHANGED"], logged: false },
      { code: "USER_DEACTIVATED", label: "ปิดการใช้งานผู้ใช้", match: ["USER_DEACTIVATED"], logged: false },
    ],
  },
  {
    label: "ความปลอดภัย",
    items: [
      { code: "PERMISSION_DENIED", label: "ถูกปฏิเสธสิทธิ์", match: ["PERMISSION_DENIED"], logged: false },
    ],
  },
];

// action ที่ "ซ่อนเสมอ" ในหน้า log — ส่งเป็น excludeActions ให้ auditLog.list ตอนไม่ได้กรองประเภท
// เหตุผล: click telemetry ถี่มากจนกลบเหตุการณ์ทางธุรกิจ (สร้าง/ลบแผน, login) ที่ผู้บริหารมาหา
export const DEFAULT_EXCLUDED_ACTIONS = ["ui.click"];

// lookup code → นิยาม (ใช้แปลงค่าที่เลือกใน dropdown เป็น input.actions ของ query)
export const LOG_ACTION_BY_CODE: Record<string, LogActionFilter> = Object.fromEntries(
  LOG_ACTION_GROUPS.flatMap((g) => g.items).map((f) => [f.code, f]),
);
