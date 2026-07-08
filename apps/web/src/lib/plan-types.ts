// apps/web/src/lib/plan-types.ts
// label ไทย + chip ของแต่ละประเภทงาน — คู่กับ STATUS_META ใน status.ts
// สีโทนนุ่มไม่ทับ status chip; แก้สี/label แก้ที่นี่ที่เดียว

export type PlanTypeKey = "SOLAR" | "CCTV" | "NETWORK";

export const PLAN_TYPE_META: Record<PlanTypeKey, { label: string; bg: string; fg: string }> = {
  SOLAR: { label: "โซลาร์เซลล์", bg: "#fef9c3", fg: "#854d0e" },
  CCTV: { label: "CCTV", bg: "#e0e7ff", fg: "#3730a3" },
  NETWORK: { label: "Network", bg: "#cffafe", fg: "#155e75" },
};

// ลำดับ options ใน dropdown ของ PlanModal + ปุ่ม filter ในหน้าไซต์งาน
export const PLAN_TYPE_OPTIONS: readonly PlanTypeKey[] = ["SOLAR", "CCTV", "NETWORK"];
