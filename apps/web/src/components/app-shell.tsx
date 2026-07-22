"use client";

// โครงหน้าหลัง login ตาม UI อ้างอิง: sidebar "Be Connected" + topbar (ชื่อหน้า + กระดิ่ง) + เนื้อหา
// เมนูอื่นนอกจาก "งานของฉัน" เป็นโมดูลอนาคต (คลังอุปกรณ์ / ยืม-คืน / ลงเวลา / ลา)
// — โชว์ตำแหน่งไว้ตาม design แต่ยังกดไม่ได้ จนกว่าโมดูลนั้นจะถูกสร้าง
// "ประวัติการใช้งาน" (audit log) เปิดให้ทุก role — engineer เห็นเฉพาะของตัวเอง / CEO เห็นทุกคน (scope ที่ API)

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NotificationBell } from "./notification-bell";

type NavItem = {
  key: string;
  label: string;
  href?: string; // มี href = กดได้ (enabled ต้องเป็น true ด้วย)
  enabled: boolean;
  ceoOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { key: "my-work", label: "งานของฉัน", href: "/dashboard", enabled: true },
  { key: "tickets", label: "แจ้งซ่อม", href: "/tickets", enabled: true },
  { key: "sites", label: "ไซต์งาน", href: "/sites", enabled: true },
  { key: "logs", label: "ประวัติการใช้งาน", href: "/logs", enabled: true },
  { key: "inventory", label: "คลังอุปกรณ์", enabled: false },
  { key: "borrow-return", label: "ยืม-คืน", enabled: false },
  { key: "time", label: "ลงเวลา", enabled: false },
  { key: "leave", label: "ลา", enabled: false },
];

export function AppShell({
  title,
  user,
  onLogout,
  children,
}: {
  title: string;
  user: { name: string; role: string };
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Be Connected</div>

        <nav className="nav">
          {NAV_ITEMS.filter((item) => !item.ceoOnly || user.role === "CEO").map((item) =>
            item.enabled && item.href ? (
              <Link
                key={item.key}
                href={item.href}
                className={pathname === item.href ? "nav-item active" : "nav-item"}
              >
                <span className="bullet" />
                {item.label}
              </Link>
            ) : (
              <div
                key={item.key}
                className="nav-item disabled"
                title="โมดูลถัดไป — ยังไม่เปิดใช้งาน"
              >
                <span className="bullet" />
                {item.label}
              </div>
            ),
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-row">
            <div className="avatar">{user.name.charAt(0).toUpperCase()}</div>
            <div style={{ minWidth: 0 }}>
              <div className="user-name">{user.name}</div>
              <div className="user-role">{user.role === "CEO" ? "CEO" : "Engineer"}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={onLogout}>
            ออกจากระบบ
          </button>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <h1>{title}</h1>
          <NotificationBell />
        </header>

        <div className="page">{children}</div>
      </div>
    </div>
  );
}
