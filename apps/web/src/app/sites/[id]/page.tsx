"use client";

// หน้า "ประวัติไซต์งาน" (/sites/[id]) — คลิกไซต์จากหน้า /sites มาดูแผนงานทั้งหมดที่เคยทำในไซต์นั้น
// ข้อมูล 2 ก้อน: site.get (ชื่อ + ประเภทของไซต์) + workPlan.bySite (แผนทุกคน ทุกเดือน เรียงใหม่→เก่า)
// ทุก role เห็นแผนของทุกคนในไซต์ — ข้อยกเว้นจาก pattern "Engineer เห็นเฉพาะของตัวเอง" (ดู comment ใน workPlan.ts)
// จึงโชว์ชื่อเจ้าของแผนทุกแถวเสมอ ไม่ใช่เฉพาะ CEO แบบหน้าอื่น

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { trpc, getToken, setToken } from "../../../lib/trpc";
import { dateOnlyICT, planStatus, STATUS_META } from "../../../lib/status";
import { typeColor } from "../../../lib/plan-types";
import { fmtDayMonth } from "../../../lib/format";
import { AppShell } from "../../../components/app-shell";

export default function SiteDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  // id ใน URL ต้องเป็นเลขล้วน — พิมพ์มั่ว (/sites/abc) ถือว่าไม่พบไซต์ ไม่ต้องยิง query
  const siteId = /^\d+$/.test(params.id) ? Number(params.id) : null;

  // กันอ่าน localStorage ตอน SSR: รอ mount ก่อนค่อยเช็ค token แล้วค่อยยิง query (mirror dashboard)
  const [ready, setReady] = useState(false);

  // "วันนี้" ตามเวลาไทย (UTC midnight) — fix ค่าครั้งเดียวตลอดอายุหน้า ใช้คำนวณ status chip
  const [today] = useState(() => dateOnlyICT(new Date()));

  // ไม่มี token → เด้งไปหน้า login / มี token ค่อยยิง query (mirror dashboard)
  useEffect(() => {
    if (!getToken()) router.replace("/");
    else setReady(true);
  }, [router]);

  const me = trpc.auth.me.useQuery(undefined, { enabled: ready, retry: false });
  const types = trpc.type.list.useQuery(undefined, { enabled: ready });
  const site = trpc.site.get.useQuery(
    { id: siteId ?? 0 },
    { enabled: ready && siteId !== null, retry: false }, // NOT_FOUND ไม่ต้อง retry
  );
  const plans = trpc.workPlan.bySite.useQuery(
    { siteId: siteId ?? 0 },
    { enabled: ready && siteId !== null },
  );

  // ลบไซต์ — สองจังหวะกันมือลั่น (pattern เดียวกับปุ่มลบแผนใน PlanModal)
  // สำเร็จแล้วกลับหน้ารายชื่อไซต์ (หน้านี้ไม่เหลืออะไรให้ดู) + refresh site.list
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editing, setEditing] = useState(false); // เปิด modal แก้ชื่อไซต์
  const utils = trpc.useUtils();
  const del = trpc.site.delete.useMutation({
    onSuccess: async () => {
      await utils.site.list.invalidate();
      router.replace("/sites");
    },
  });

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

  // ชื่อประเภทของ "แผน" มาจาก type.list (id → name) — ประเภทของ "ไซต์" มากับ site.get อยู่แล้ว
  const typeNameById = new Map((types.data ?? []).map((t) => [t.id, t.name]));
  const planRows = plans.data ?? [];
  // ไซต์ที่มีแผนอ้างอยู่ลบไม่ได้ (กติกาเดียวกับ site.delete ฝั่ง API — FK Restrict)
  // bySite โหลดไม่เสร็จก็กดได้ไปก่อน — API เช็คซ้ำเสมออยู่แล้ว
  const hasPlans = planRows.length > 0;

  const notFound = siteId === null || site.error?.data?.code === "NOT_FOUND";

  return (
    <AppShell
      title="ไซต์งาน"
      user={me.data}
      onLogout={() => {
        setToken(null);
        router.replace("/");
      }}
    >
      <Link href="/sites" className="back-link">
        ‹ กลับไปรายชื่อไซต์งาน
      </Link>

      {notFound ? (
        <section className="day-panel">
          <p className="empty-note">ไม่พบไซต์งานนี้ — อาจถูกพิมพ์ URL ผิดหรือไซต์ถูกลบไปแล้ว</p>
        </section>
      ) : site.error ? (
        <p className="form-error">โหลดข้อมูลไซต์ไม่สำเร็จ: {site.error.message}</p>
      ) : (
        <>
          {/* หัวไซต์: ชื่อ + chip ประเภทของไซต์ (m-n — มีได้หลายประเภท) + ปุ่มลบ (Engineer) */}
          <section className="day-panel">
            <div className="panel-head">
              <div className="site-title">
                <h2>{site.data ? site.data.name : "กำลังโหลด…"}</h2>
                {/* ดินสอแก้ชื่อ วางข้างหลังชื่อ — Engineer เท่านั้น (site.update เป็น engineerProcedure, CEO view-only)
                    กดได้เสมอ ไม่เกี่ยวกับว่ามีแผนอ้างอยู่หรือไม่ (ต่างจากปุ่มลบ)
                    aria-label ให้ ClickLogger เก็บชื่อปุ่มไอคอนล้วนได้ (labelOf อ่าน aria-label) */}
                {!isCEO && site.data && (
                  <button
                    type="button"
                    className="title-edit"
                    aria-label="แก้ไขชื่อไซต์"
                    title="แก้ไขชื่อไซต์"
                    onClick={() => setEditing(true)}
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 20h9" />
                      <path d="m16.5 3.5 4 4L7 21l-4 1 1-4z" />
                    </svg>
                  </button>
                )}
              </div>
              {site.data && site.data.types.length > 0 && (
                <div className="plan-chips">
                  {site.data.types.map((t) => {
                    const color = typeColor(t.id);
                    return (
                      <span key={t.id} className="chip" style={{ background: color.bg, color: color.fg }}>
                        {t.name}
                      </span>
                    );
                  })}
                </div>
              )}
              {/* ลบไซต์ — Engineer เท่านั้น (site.delete เป็น engineerProcedure, CEO view-only)
                  มีแผนอ้างอยู่ = กดไม่ได้ (กติกาเดียวกับ API — FK Restrict) */}
              {!isCEO && site.data && (
                <button
                  className="btn-danger"
                  disabled={del.isPending || hasPlans}
                  title={hasPlans ? "ไซต์ที่มีแผนงานอ้างถึงอยู่ลบไม่ได้ — ต้องลบ/ย้ายแผนออกก่อน" : undefined}
                  onClick={() => {
                    if (!confirmingDelete) return setConfirmingDelete(true);
                    del.mutate({ id: site.data.id });
                  }}
                >
                  {del.isPending ? "กำลังลบ…" : confirmingDelete ? "ยืนยันลบไซต์นี้?" : "ลบไซต์งาน"}
                </button>
              )}
            </div>
            {hasPlans && !isCEO && (
              <p className="field-hint">ไซต์นี้มีแผนงานอ้างถึงอยู่ {planRows.length} แผน — ลบไม่ได้</p>
            )}
            {del.error && <p className="form-error">{del.error.message}</p>}
          </section>

          {/* ประวัติแผนงานทั้งหมดของไซต์ — เรียงใหม่→เก่า (จัดมาจาก API) */}
          <section className="day-panel">
            <div className="panel-head">
              <h2>แผนงานในไซต์นี้{plans.data ? ` (${plans.data.length})` : ""}</h2>
            </div>

            {plans.error ? (
              <p className="form-error">โหลดแผนงานไม่สำเร็จ: {plans.error.message}</p>
            ) : plans.isLoading ? (
              <p className="empty-note">กำลังโหลด…</p>
            ) : planRows.length === 0 ? (
              <p className="empty-note">ยังไม่มีแผนงานในไซต์นี้</p>
            ) : (
              <div className="plan-list">
                {planRows.map((plan) => {
                  const meta = STATUS_META[planStatus(plan, today)];
                  const typeMeta = plan.type
                    ? { ...typeColor(plan.type), label: typeNameById.get(plan.type) ?? plan.type }
                    : null;
                  return (
                    <div key={plan.id} className="plan-row">
                      <span className="dot" style={{ background: plan.user.color }} />
                      <div className="plan-main">
                        <div className="plan-name">{plan.name}</div>
                        <div className="plan-sub">
                          {plan.user.name} · {fmtDayMonth(plan.startDate)} –{" "}
                          {fmtDayMonth(plan.endDate)}
                        </div>
                      </div>
                      {/* chip ประเภท (ซ้าย, สีโทนนุ่ม) ก่อน chip status (ขวา) — ลำดับเดียวกับหน้าไซต์งานเดิม */}
                      <div className="plan-chips">
                        {typeMeta && (
                          <span
                            className="chip"
                            style={{ background: typeMeta.bg, color: typeMeta.fg }}
                          >
                            {typeMeta.label}
                          </span>
                        )}
                        <span className="chip" style={{ background: meta.bg, color: meta.fg }}>
                          {meta.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {editing && site.data && (
        <EditSiteModal
          site={{
            id: site.data.id,
            name: site.data.name,
            typeIds: site.data.types.map((t) => t.id),
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </AppShell>
  );
}

// ---------- modal แก้ชื่อและประเภทไซต์ (Engineer เท่านั้น) ----------
// name + typeIds (หลายประเภทได้ — m-n กับ Type ต่างจากแผนที่มี 1 type)
// สำเร็จแล้ว invalidate site.get (หัวหน้านี้) + site.list (หน้ารายชื่อ) ให้ข้อมูลใหม่ขึ้นทันที แล้วปิด modal
function EditSiteModal({
  site,
  onClose,
}: {
  site: { id: number; name: string; typeIds: number[] };
  onClose: () => void;
}) {
  const types = trpc.type.list.useQuery();
  const utils = trpc.useUtils();
  const [name, setName] = useState(site.name);
  const [typeIds, setTypeIds] = useState<number[]>(site.typeIds);

  const toggleType = (id: number) =>
    setTypeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const update = trpc.site.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.site.get.invalidate({ id: site.id }),
        utils.site.list.invalidate(),
      ]);
      onClose();
    },
  });

  const trimmed = name.trim();
  // เทียบชุดประเภทกับของเดิม (ลำดับไม่สำคัญ, toggleType กันซ้ำอยู่แล้ว → length + subset พอ)
  const sameTypes =
    typeIds.length === site.typeIds.length &&
    typeIds.every((id) => site.typeIds.includes(id));
  const unchanged = trimmed === site.name && sameTypes; // ไม่มีอะไรเปลี่ยน — กันยิง mutation เปล่า

  return (
    <div className="overlay" onClick={onClose}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate({ id: site.id, name: trimmed, typeIds });
        }}
      >
        <h3>แก้ไขชื่อและประเภทไซต์งาน</h3>

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
            {(types.data ?? []).map((t) => {
              const color = typeColor(t.id);
              const checked = typeIds.includes(t.id);
              return (
                <label key={t.id} className="check-item">
                  <input type="checkbox" checked={checked} onChange={() => toggleType(t.id)} />
                  <span className="chip" style={{ background: color.bg, color: color.fg }}>
                    {t.name}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {update.error && <p className="form-error">{update.error.message}</p>}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={update.isPending || trimmed.length === 0 || unchanged}
          >
            {update.isPending ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </form>
    </div>
  );
}
