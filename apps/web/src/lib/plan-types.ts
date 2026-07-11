// apps/web/src/lib/plan-types.ts
// สี chip ของแต่ละประเภทงาน — label/ลำดับมาจาก table types (query type.list)
// สีโทนนุ่มไม่ทับ status chip; ประเภทที่เพิ่มใหม่ใน DB แต่ยังไม่กำหนดสีที่นี่ → ใช้สีเทากลาง

export type TypeColor = { bg: string; fg: string };

// key = types.id (เลขลำดับ) — เพิ่มประเภทใหม่ใน DB แล้วอยากได้สีเฉพาะ มาเติมที่นี่
const PLAN_TYPE_COLORS: Record<string, TypeColor> = {
  "1": { bg: "#fef9c3", fg: "#854d0e" }, // Solar Cell
  "2": { bg: "#e0e7ff", fg: "#3730a3" }, // CCTV
  "3": { bg: "#cffafe", fg: "#155e75" }, // Network
  "4": { bg: "#dcfce7", fg: "#166534" }, // IOT
  "5": { bg: "#fce7f3", fg: "#9d174d" }, // Software
};

const FALLBACK_COLOR: TypeColor = { bg: "#f1f5f9", fg: "#475569" };

export function typeColor(typeId: string): TypeColor {
  return PLAN_TYPE_COLORS[typeId] ?? FALLBACK_COLOR;
}
