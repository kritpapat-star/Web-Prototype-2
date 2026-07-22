// apps/web/src/lib/format.test.ts
// parseDMY: dd/mm/yyyy → ISO — เน้นเคสวันไม่จริง/ไม่ครบ + round-trip กับ fmtFullDate
// parseTimeHM/fmtAppointment: เวลานัดของเคสลูกค้า (instant จริง — format ตามเวลาไทย)

import { describe, it, expect } from "vitest";
import { parseDMY, parseTimeHM, fmtAppointment, fmtFullDate } from "./format";

describe("parseDMY", () => {
  it("dd/mm/yyyy ที่ถูกต้อง → ISO (dd,mm ไม่สลับ)", () => {
    expect(parseDMY("04/07/2026")).toBe("2026-07-04"); // 4 ก.ค. ไม่ใช่ 7 เม.ย.
    expect(parseDMY("31/12/2025")).toBe("2025-12-31");
  });

  it("ตัดช่องว่างหัวท้ายก่อน parse", () => {
    expect(parseDMY("  01/01/2026 ")).toBe("2026-01-01");
  });

  it("วันไม่จริง → null (ไม่ปัดเป็นเดือนถัดไป)", () => {
    expect(parseDMY("31/02/2026")).toBeNull(); // ก.พ. ไม่มี 31
    expect(parseDMY("00/07/2026")).toBeNull();
    expect(parseDMY("32/07/2026")).toBeNull();
    expect(parseDMY("10/13/2026")).toBeNull();
  });

  it("รูปไม่ครบ / ไม่ใช่ตัวเลข → null", () => {
    expect(parseDMY("")).toBeNull();
    expect(parseDMY("4/7/2026")).toBeNull(); // ต้อง 2 หลัก
    expect(parseDMY("2026-07-04")).toBeNull();
    expect(parseDMY("04/07/26")).toBeNull();
  });

  it("round-trip กับ fmtFullDate (UTC-midnight)", () => {
    const d = new Date("2026-07-08T00:00:00Z");
    const text = fmtFullDate(d); // "08/07/2026"
    expect(parseDMY(text)).toBe("2026-07-08");
  });
});

describe("parseTimeHM", () => {
  it("HH:mm ที่ถูกต้อง → คืนค่าเดิม (ตัดช่องว่างหัวท้าย)", () => {
    expect(parseTimeHM("09:30")).toBe("09:30");
    expect(parseTimeHM("  23:59 ")).toBe("23:59");
    expect(parseTimeHM("00:00")).toBe("00:00");
  });

  it("เกินช่วงเวลา → null", () => {
    expect(parseTimeHM("24:00")).toBeNull();
    expect(parseTimeHM("12:60")).toBeNull();
  });

  it("รูปไม่ครบ / ไม่ใช่ตัวเลข → null", () => {
    expect(parseTimeHM("")).toBeNull();
    expect(parseTimeHM("9:30")).toBeNull(); // ต้อง 2 หลัก
    expect(parseTimeHM("0930")).toBeNull();
    expect(parseTimeHM("เก้าโมง")).toBeNull();
  });
});

describe("fmtAppointment", () => {
  it("instant จริง → วัน+เวลาตามเวลาไทย (ไม่ใช่ UTC)", () => {
    // 03:30Z = 10:30 ICT วันเดียวกัน
    expect(fmtAppointment(new Date("2026-08-04T03:30:00Z"))).toBe("04/08/2026 10:30");
  });

  it("นัดเช้ามืด ICT ไม่เพี้ยนวัน (00:30 ICT = 17:30Z ของวันก่อนหน้า)", () => {
    expect(fmtAppointment(new Date("2026-08-04T00:30:00+07:00"))).toBe("04/08/2026 00:30");
  });

  it("เวลา 00:00 ตรง = กรอกแค่วัน → โชว์เฉพาะวัน", () => {
    expect(fmtAppointment(new Date("2026-08-04T00:00:00+07:00"))).toBe("04/08/2026");
  });
});
