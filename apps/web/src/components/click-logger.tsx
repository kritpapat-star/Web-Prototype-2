"use client";

// ClickLogger — ดักทุกการคลิกในเว็บ (capture phase) แล้วส่งเป็นก้อนไปเก็บที่ audit_logs
// mount ครั้งเดียวใน Providers → ครอบทุกหน้า (รวมหน้า login ที่ไม่มี AppShell)
// เก็บเฉพาะตัวตนของ element (page/label/tag) — ไม่แตะค่าใน input field จึงไม่มี password หลุด
// render null (ไม่มี UI)

import { useEffect, useRef } from "react";
import { trpc } from "../lib/trpc";

// event ที่ buffer ไว้ก่อน flush — ตรงกับ input ของ auditLog.track
type ClickEvent = {
  action: string;
  targetId: string | null;
  detail: { page: string; label: string; tag: string; at: string };
};

const FLUSH_SIZE = 20; // buffer เต็มเท่านี้ → flush ทันที
const FLUSH_DELAY = 1500; // ms — debounce หลังคลิกล่าสุด
const MAX_BATCH = 50; // ต้องไม่เกิน .max(50) ของ zod ฝั่ง server

// หา label ที่อ่านออกจาก element ที่คลิก (ไม่ดึงค่า value ของ input)
function labelOf(el: Element): string {
  const dataLabel = (el as HTMLElement).dataset?.logLabel;
  if (dataLabel) return dataLabel;
  const aria = el.getAttribute("aria-label");
  if (aria) return aria;
  const text = el.textContent?.trim();
  if (text) return text.slice(0, 80);
  return el.tagName;
}

function tagOf(el: Element): string {
  const cls = typeof el.className === "string" ? el.className.split(" ")[0] : "";
  return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase();
}

export function ClickLogger() {
  const track = trpc.auditLog.track.useMutation();
  const buffer = useRef<ClickEvent[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // เก็บ mutate ล่าสุดไว้ใน ref — listener ผูกครั้งเดียวแต่ยังเรียก mutate ปัจจุบันได้
  const mutateRef = useRef(track.mutate);
  mutateRef.current = track.mutate;

  useEffect(() => {
    const flush = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      if (buffer.current.length === 0) return;
      const events = buffer.current.splice(0, MAX_BATCH);
      // การ log ต้องไม่ทำ UX พัง — error (เช่น UNAUTHORIZED ก่อน login) กลืนเงียบ
      mutateRef.current({ events }, { onError: () => {} });
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      // ยึด element ที่มีความหมายก่อน (ปุ่ม/ลิงก์/nav) ไม่งั้นใช้ target ตรงๆ
      const el =
        target.closest("button, a, input, [role=button], .nav-item, [data-log-label]") ?? target;
      const targetId = target.closest<HTMLElement>("[data-log-id]")?.dataset.logId ?? null;

      buffer.current.push({
        action: "ui.click",
        targetId,
        detail: {
          page: window.location.pathname,
          label: labelOf(el),
          tag: tagOf(el),
          at: new Date().toISOString(),
        },
      });

      if (buffer.current.length >= FLUSH_SIZE) {
        flush();
      } else {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, FLUSH_DELAY);
      }
    };

    // flush ก่อนหน้าจะหาย — best-effort (fetch อาจถูก cancel ตอนปิดแท็บ)
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };

    document.addEventListener("click", onClick, { capture: true });
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);

    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush(); // ส่งที่ค้างก่อน unmount
    };
  }, []);

  return null;
}
