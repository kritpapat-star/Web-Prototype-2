"use client";

// หน้า "งานล่าช้า" — CEO ตรวจสอบแผนงานที่จริงเบี่ยงจากแผนของ Engineer ทุกคน
// ข้อมูลทั้งหมดมาจาก overdueRouter.list (ceoProcedure — บล็อก non-CEO ที่ต้นน้ำ แก้ RBAC รั่วของ v1)
// ตาราง drill-down งานล่าช้าทุกใบ — filter engineer ฝั่ง server / ประเภทงาน + งานช้า ฝั่ง web
// นิยาม "ล่าช้า" เปรียบเทียบแผนกับจริง (plan 1784789760518 ภาคต่อ):
//   START_DUE = เลยกำหนดเริ่ม (ยังไม่เริ่ม+startDate<today) / START_LATE = เริ่มช้า (actStart>startDate)
//   END_DUE = เลยกำหนดจบ (เริ่มแล้ว ยังไม่จบ+endDate<today) / END_LATE = จบช้า (actEnd>endDate)
// เมนูเป็น ceoOnly (app-shell) → route นี้ CEO เท่านั้น ไม่ต้องเช็ค role ซ้ำ

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc, getToken, setToken } from "../../lib/trpc";
import { typeColor } from "../../lib/plan-types";
import { DELAY_KIND_META, type PlanDelayKind } from "../../lib/status"; // label/สีชุดเดียวกับป้าย "ช้า" ใน /dashboard
import { fmtFullDate, fmtDateICT } from "../../lib/format";
import { AppShell } from "../../components/app-shell";

// ตัวเลือกตัวกรอง "งานช้า" — filter ตามประเภทความล่าช้า (กรองฝั่ง web จาก delayKind ใน row)
// เรียงตามลำดับ start → end ให้ตรงกับ DELAY_KIND_META
const DELAY_KIND_OPTIONS: PlanDelayKind[] = ["START_DUE", "START_LATE", "END_DUE", "END_LATE"];

export default function DelaysPage() {
  const router = useRouter();
  // กันอ่าน localStorage ตอน SSR: รอ mount ก่อนค่อยเช็ค token แล้วค่อยยิง query (mirror dashboard)
  const [ready, setReady] = useState(false);

  // filter state — engineerId/typeId เก็บ "" = ทุกคน/ทุกประเภท, อื่นๆ = id (เลข)
  const [engineerId, setEngineerId] = useState<number | "">("");
  const [typeId, setTypeId] = useState<number | "">("");
  const [delayKind, setDelayKind] = useState<PlanDelayKind | "">(""); // "" = ทุกงานช้า

  // ไม่มี token → เด้งไปหน้า login / มี token ค่อยยิง query (mirror dashboard)
  useEffect(() => {
    if (!getToken()) router.replace("/");
    else setReady(true);
  }, [router]);

  const me = trpc.auth.me.useQuery(undefined, { enabled: ready, retry: false });
  // ตาราง drill-down งานล่าช้าทุกใบ (filter engineer ฝั่ง server)
  const list = trpc.overdue.list.useQuery(
    { engineerId: engineerId === "" ? undefined : engineerId },
    { enabled: ready },
  );
  // dropdown filter
  const users = trpc.user.list.useQuery(undefined, { enabled: ready });
  const types = trpc.type.list.useQuery(undefined, { enabled: ready });

  // token หมดอายุ/ใช้ไม่ได้ → ล้าง token แล้วเด้งกลับหน้า login (mirror dashboard)
  useEffect(() => {
    if (me.error && !me.isFetching) {
      setToken(null);
      router.replace("/");
    }
  }, [me.error, me.isFetching, router]);

  if (!ready || me.isLoading) return <div className="center-note">กำลังโหลด…</div>;
  if (!me.data) return null; // ระหว่างเด้งกลับหน้า login

  // filter ประเภทงาน + งานช้า ทำฝั่ง web — list ส่ง typeId/delayKind มาครบใน row แล้ว
  const rows = (list.data ?? []).filter(
    (r) =>
      (typeId === "" || r.typeId === typeId) && (delayKind === "" || r.delayKind === delayKind),
  );

  return (
    <AppShell
      title="งานล่าช้า"
      user={me.data}
      onLogout={() => {
        setToken(null);
        router.replace("/");
      }}
    >
      {/* ---------- filter bar ---------- */}
      <div className="delay-bar">
        <label className="delay-field">
          Engineer
          <select
            className="delay-select"
            value={engineerId}
            onChange={(e) => setEngineerId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">ทุกคน</option>
            {(users.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>

        <label className="delay-field">
          ประเภทงาน
          <select
            className="delay-select"
            value={typeId}
            onChange={(e) => setTypeId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">ทุกประเภท</option>
            {(types.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        {/* กรองตามประเภทความล่าช้า: เลยกำหนดเริ่ม · เริ่มช้า · เลยกำหนดจบ · จบช้า */}
        <label className="delay-field">
          งานช้า
          <select
            className="delay-select"
            value={delayKind}
            onChange={(e) =>
              setDelayKind(e.target.value === "" ? "" : (e.target.value as PlanDelayKind))
            }
          >
            <option value="">ทั้งหมด</option>
            {DELAY_KIND_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {DELAY_KIND_META[k].label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {list.error && <p className="form-error">โหลดข้อมูลไม่สำเร็จ: {list.error.message}</p>}

      {/* ---------- ตาราง ---------- */}
      <div className="delay-table-wrap">
        <table className="delay-table">
          <thead>
            <tr>
              <th>ล่าช้า</th>
              <th>งาน</th>
              <th>ผู้รับผิดชอบ</th>
              <th>ไซต์</th>
              <th>ประเภทงาน</th>
              <th>กำหนดเปิด-ปิด</th>
              <th>เปิด-ปิดจริง</th>
              <th>เริ่มช้า</th>
              <th>จบช้า</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="delay-empty">
                  {list.isLoading ? "กำลังโหลด…" : "ไม่มีงานล่าช้า"}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const meta = DELAY_KIND_META[r.delayKind];
                const typeMeta = r.typeId != null ? typeColor(r.typeId) : null;
                const typeLabel = r.typeName;
                const siteLabel = r.siteName ?? (r.siteId != null ? `#${r.siteId}` : null);
                return (
                  <tr key={r.refId}>
                    <td>
                      <span className="chip" style={{ background: meta.bg, color: meta.fg }}>
                        {meta.label}
                      </span>
                    </td>
                    <td>
                      <div className="delay-title">{r.title}</div>
                    </td>
                    <td>
                      <span className="delay-usercell">
                        <span className="dot" style={{ background: r.userColor }} />
                        {r.userName}
                      </span>
                    </td>
                    {/* กดชื่อไซต์ → ไปหน้าไซต์ต่อได้ (แถวในตารางเคยเป็นทางตัน) */}
                    <td>
                      {r.siteId != null && siteLabel != null ? (
                        <Link href={`/sites/${r.siteId}`} className="delay-link">
                          {siteLabel}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {typeMeta && typeLabel != null ? (
                        <span className="chip" style={{ background: typeMeta.bg, color: typeMeta.fg }}>
                          {typeLabel}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="delay-date">
                      {fmtFullDate(r.startDate)} – {fmtFullDate(r.endDate)}
                    </td>
                    <td className="delay-date">
                      {r.actStart ? fmtDateICT(r.actStart) : "—"} –{" "}
                      {r.actEnd ? fmtDateICT(r.actEnd) : "—"}
                    </td>
                    {/* เหตุผลแยก 2 คอลัมน์ — แผนเดียวเป็นได้ทั้งเริ่มช้าและจบช้า (เก็บทั้งคู่)
                        ว่าง = "—" (ยังไม่ช้าฝั่งนั้น หรือ START_DUE/END_DUE ที่ยังไม่ได้กดเริ่ม/จบ จึงยังไม่มีเหตุผล) */}
                    <td className="delay-reason">{r.delayStartReason ?? "—"}</td>
                    <td className="delay-reason">{r.delayEndReason ?? "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="delay-note">
        * ล่าช้า = เปรียบเทียบแผนกับจริง — เลยกำหนดเริ่ม (ยังไม่กดเริ่ม + startDate ผ่านไปแล้ว) ·
        เริ่มช้า (actStart เลย startDate) · เลยกำหนดจบ (เริ่มแล้ว ยังไม่กดจบ + endDate ผ่านไปแล้ว) ·
        จบช้า (actEnd เลย endDate)
      </p>
    </AppShell>
  );
}
