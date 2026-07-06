"use client";

// หน้า login — TASK.md Next #1: form + trpc.auth.login + setToken + redirect
// ตอนนี้ทุก role ลง /dashboard เหมือนกัน (CEO เห็นของทุกคน — API จัดการ RBAC ให้แล้ว)

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "../lib/trpc";
import { getToken, setToken } from "../lib/trpc";

// ⚠️ DEV BYPASS: ปิดหน้า login ชั่วคราว — เข้า dashboard ตรงเลย (API นับ request ที่ไม่มี token เป็น tawan ให้เอง)
// เปิดกลับ: เปลี่ยนเป็น false (คู่กับ bypass ใน apps/api/src/trpc.ts และ dashboard/page.tsx)
// (ใช้ as boolean กัน TS มองว่า form ข้างล่างเป็น unreachable code แล้วเลิก narrow type)
const DEV_BYPASS = true as boolean;

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // มี token ค้างอยู่ → ข้ามไป dashboard (DEV_BYPASS = ข้ามเสมอ)
  useEffect(() => {
    if (DEV_BYPASS || getToken()) router.replace("/dashboard");
  }, [router]);

  const login = trpc.auth.login.useMutation({
    onSuccess: (res) => {
      setToken(res.token);
      router.push("/dashboard");
    },
  });

  // ⚠️ DEV BYPASS: ไม่ render form login — โชว์ข้อความสั้นๆ ระหว่างเด้งเข้า /dashboard
  // (form เดิมอยู่ถัดลงไปครบทุกบรรทัด ไม่ได้แก้อะไร)
  if (DEV_BYPASS)
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
          background: "#f3f4f6",
          color: "#6b7280",
        }}
      >
        กำลังเข้าระบบเป็น tawan…
      </main>
    );

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "sans-serif",
        background: "#f3f4f6",
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate({ username, password });
        }}
        style={{
          background: "#fff",
          padding: 32,
          borderRadius: 12,
          boxShadow: "0 1px 4px rgba(0,0,0,.1)",
          width: 320,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20 }}>Be Connected</h1>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>เข้าสู่ระบบเพื่อดูงานของคุณ</p>

        <label style={{ fontSize: 14 }}>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            style={inputStyle}
          />
        </label>
        <label style={{ fontSize: 14 }}>
          รหัสผ่าน
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            style={inputStyle}
          />
        </label>

        {login.error && (
          <p style={{ margin: 0, color: "#b91c1c", fontSize: 14 }}>{login.error.message}</p>
        )}

        <button
          type="submit"
          disabled={login.isPending}
          style={{
            padding: "10px 0",
            borderRadius: 8,
            border: "none",
            background: login.isPending ? "#93c5fd" : "#2563eb",
            color: "#fff",
            fontSize: 15,
            cursor: login.isPending ? "default" : "pointer",
          }}
        >
          {login.isPending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
        </button>
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 4,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 15,
  boxSizing: "border-box",
};
