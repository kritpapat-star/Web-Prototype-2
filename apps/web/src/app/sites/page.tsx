"use client";

// หน้า "ไซต์งาน" — รายชื่อไซต์ทั้งหมด (จาก site.list) คลิกไซต์ → /sites/[id] ดูประวัติแผนงานของไซต์นั้น
// filter ประเภท + ค้นหา (ชื่อไซต์ / เลขไซต์ "12" หรือ "#5") ทำฝั่ง client ทั้งคู่ —
//   site.list ส่งทั้งหมดทีเดียวอยู่แล้ว (ไซต์มีจำนวนน้อย) เปลี่ยน filter ไม่ต้อง refetch
//   - มุมมองแผนงานรายเดือน/ค้นหาแผน (workPlan.list/search) ถูกย้ายออกจากหน้านี้แล้ว (11 ก.ค. 2026)
//   - mutation เดียวในหน้านี้: ปุ่ม "+ ไซต์งาน" (Engineer เท่านั้น) → SiteModal สร้าง record ใน table sites
//     (สร้าง/แก้แผนงานยังทำที่ /dashboard เหมือนเดิม — แผนอ้างไซต์ผ่าน FK siteId → sites.id)
// ปุ่ม filter/label มาจาก type.list — สี chip มาจาก typeColor (คนละตำแหน่งกับ chip status)

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc, getToken, setToken } from "../../lib/trpc";
import { typeColor } from "../../lib/plan-types";
import { AppShell } from "../../components/app-shell";

// ค่า filter: "ALL" หรือ types.id (เลขลำดับ เช่น "1")
type TypeFilter = "ALL" | (string & {});

export default function SitesPage() {
  const router = useRouter();
  // กันอ่าน localStorage ตอน SSR: รอ mount ก่อนค่อยเช็ค token แล้วค่อยยิง query (mirror dashboard)
  const [ready, setReady] = useState(false);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [q, setQ] = useState("");
  const [creatingSite, setCreatingSite] = useState(false);

  // ไม่มี token → เด้งไปหน้า login / มี token ค่อยยิง query (mirror dashboard)
  useEffect(() => {
    if (!getToken()) router.replace("/");
    else setReady(true);
  }, [router]);

  const me = trpc.auth.me.useQuery(undefined, { enabled: ready, retry: false });
  const types = trpc.type.list.useQuery(undefined, { enabled: ready });
  const sites = trpc.site.list.useQuery(undefined, { enabled: ready });

  // token หมดอายุ/ใช้ไม่ได้ → ล้าง token แล้วเด้งกลับหน้า login (mirror dashboard)
  useEffect(() => {
    if (me.error) {
      setToken(null);
      router.replace("/");
    }
  }, [me.error, router]);

  if (!ready || me.isLoading) return <div className="center-note">กำลังโหลด…</div>;
  if (!me.data) return null; // ระหว่างเด้งกลับหน้า login

  const isCEO = me.data.role === "CEO";

  // ชื่อประเภทจาก table types (id → name) — โหลดไม่ทัน/id ไม่รู้จัก → โชว์ id ไปก่อน
  const typeNameById = new Map((types.data ?? []).map((t) => [t.id, t.name]));
  const typeLabel = typeFilter !== "ALL" ? (typeNameById.get(typeFilter) ?? typeFilter) : null;

  // กรองฝั่ง client: ประเภท (m-n ของไซต์) + คำค้น — ค้นได้ทั้งชื่อไซต์และเลขไซต์ ("12" / "#5")
  const qTrimmed = q.trim();
  const idQuery = /^#?(\d+)$/.exec(qTrimmed)?.[1];
  const filtered = (sites.data ?? []).filter((site) => {
    if (typeFilter !== "ALL" && !site.types.some((t) => t.id === typeFilter)) return false;
    if (!qTrimmed) return true;
    if (idQuery !== undefined && site.id === Number(idQuery)) return true;
    return site.name.toLowerCase().includes(qTrimmed.toLowerCase());
  });

  return (
    <AppShell
      title="ไซต์งาน"
      user={me.data}
      onLogout={() => {
        setToken(null);
        router.replace("/");
      }}
    >
      {/* แถบ filter ประเภท + ช่องค้นหา + ปุ่มเพิ่มไซต์ */}
      <div className="sites-toolbar">
        <div className="type-filter">
          <button
            className={typeFilter === "ALL" ? "type-btn active" : "type-btn"}
            onClick={() => setTypeFilter("ALL")}
          >
            ทั้งหมด
          </button>
          {(types.data ?? []).map((t) => {
            const color = typeColor(t.id);
            return (
              <button
                key={t.id}
                className={typeFilter === t.id ? "type-btn active" : "type-btn"}
                style={
                  typeFilter === t.id
                    ? { background: color.bg, color: color.fg, borderColor: color.fg }
                    : undefined
                }
                onClick={() => setTypeFilter(t.id)}
              >
                {t.name}
              </button>
            );
          })}
        </div>

        {/* สร้างไซต์งานใหม่ — Engineer เท่านั้น (site.create เป็น engineerProcedure, CEO view-only) */}
        {!isCEO && (
          <button className="btn-primary" onClick={() => setCreatingSite(true)}>
            + ไซต์งาน
          </button>
        )}

        <div className="search-row">
          <input
            className="search-input"
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นชื่อไซต์หรือเลขไซต์ เช่น #5"
            aria-label="ค้นหาไซต์งาน"
          />
          {q && (
            <button
              className="search-clear"
              type="button"
              onClick={() => setQ("")}
              aria-label="ล้างคำค้นหา"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {sites.error && <p className="form-error">โหลดรายชื่อไซต์ไม่สำเร็จ: {sites.error.message}</p>}

      <section className="day-panel">
        <div className="panel-head">
          <h2>
            ไซต์งานทั้งหมด{typeLabel ? ` (${typeLabel})` : ""}
            {qTrimmed ? ` — ค้นหา "${qTrimmed}"` : ""}
          </h2>
        </div>

        {sites.isLoading ? (
          <p className="empty-note">กำลังโหลด…</p>
        ) : filtered.length === 0 ? (
          <p className="empty-note">
            {qTrimmed
              ? `ไม่พบไซต์งานที่ตรงกับ "${qTrimmed}"`
              : typeLabel
                ? `ยังไม่มีไซต์งานประเภท ${typeLabel}`
                : "ยังไม่มีไซต์งาน"}
          </p>
        ) : (
          <div className="plan-list">
            {filtered.map((site) => (
              // ทั้งแถวเป็นลิงก์ไปหน้าประวัติแผนงานของไซต์ (/sites/[id])
              <Link key={site.id} href={`/sites/${site.id}`} className="plan-row row-link">
                <div className="plan-main">
                  <div className="plan-name">{site.name}</div>
                  <div className="plan-sub">ไซต์ #{site.id}</div>
                </div>
                <div className="plan-chips">
                  {site.types.map((t) => {
                    const color = typeColor(t.id);
                    return (
                      <span key={t.id} className="chip" style={{ background: color.bg, color: color.fg }}>
                        {typeNameById.get(t.id) ?? t.id}
                      </span>
                    );
                  })}
                  <span className="row-arrow" aria-hidden>
                    ›
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {creatingSite && <SiteModal onClose={() => setCreatingSite(false)} />}
    </AppShell>
  );
}

// ---------- modal สร้างไซต์งาน (Engineer เท่านั้น) ----------
// ชื่อไซต์ + เลือกประเภทงานแบบ checkbox (หลายประเภทได้ — m-n กับ Type ต่างจากแผนที่มี 1 type)
// สำเร็จแล้วโชว์เลขไซต์ที่ได้ + invalidate site.list ให้รายชื่อด้านหลัง refresh ทันที

function SiteModal({ onClose }: { onClose: () => void }) {
  // ตัวเลือกประเภทจาก table types (react-query dedupe กับ query เดียวกันของหน้าหลัก)
  const types = trpc.type.list.useQuery();
  const utils = trpc.useUtils();

  const [name, setName] = useState("");
  const [typeIds, setTypeIds] = useState<string[]>([]);

  const toggleType = (id: string) =>
    setTypeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const create = trpc.site.create.useMutation({
    onSuccess: () => utils.site.list.invalidate(),
  });

  // สร้างสำเร็จ → สลับเป็นหน้ายืนยัน (โชว์เลขไซต์ + ประเภทที่เลือก)
  if (create.data) {
    const created = create.data;
    return (
      <div className="overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3>เพิ่มไซต์งานสำเร็จ</h3>
          <p className="modal-note">
            ไซต์ #{created.id} — {created.name}
            {created.types.length > 0 && (
              <> · ประเภท: {created.types.map((t) => t.name).join(", ")}</>
            )}
          </p>
          <div className="modal-actions">
            <button type="button" className="btn-primary" onClick={onClose}>
              ปิด
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ name: name.trim(), typeIds });
        }}
      >
        <h3>เพิ่มไซต์งาน</h3>

        <label className="field">
          ชื่อไซต์งาน
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            autoFocus
          />
        </label>

        <div className="field">
          ประเภทงาน (เลือกได้หลายประเภท)
          <div className="check-group">
            {types.isLoading && <span className="empty-note">กำลังโหลด…</span>}
            {(types.data ?? []).map((t) => (
              <label key={t.id} className="check-item">
                <input
                  type="checkbox"
                  checked={typeIds.includes(t.id)}
                  onChange={() => toggleType(t.id)}
                />
                {t.name}
              </label>
            ))}
          </div>
        </div>

        {create.error && <p className="form-error">{create.error.message}</p>}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="submit" className="btn-primary" disabled={create.isPending}>
            {create.isPending ? "กำลังบันทึก…" : "บันทึกไซต์งาน"}
          </button>
        </div>
      </form>
    </div>
  );
}
