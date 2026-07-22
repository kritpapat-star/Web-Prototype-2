// Be Connected — ERD snapshot: หลังเพิ่ม tickets + notifications
// แปลงจาก Prisma migration SQL → DBML (dbdiagram.io)

Enum Role {
  CEO
  ENGINEER
}

Enum TicketStatus {
  OPEN
  ACCEPTED
  CLOSED
}

Table types {
  id integer [primary key]
  name text [unique]
}

Table sites {
  id integer [primary key]
  name text [not null]
}

Table users {
  id integer [primary key]
  username text [unique]
  passwordHash text [not null]
  name text [not null]
  role Role [not null]
  color text [not null]
}

Table work_plans {
  id integer [primary key]
  name text [not null]
  userId integer [not null, note: 'FK → users.id']
  type integer [not null, note: 'FK → types.id (optional)']
  siteId integer [not null, note: 'FK → sites.id']
  startDate date [not null]
  endDate date [not null]
  actStart timestamp
  actEnd timestamp
  delayStartReason text
  delayEndReason text
  createdAt timestamp [not null, default: 'now()']
  updatedAt timestamp [not null]

  indexes {
    (userId, startDate) [name: 'work_plans_userId_startDate_idx']
    (startDate, endDate) [name: 'work_plans_startDate_endDate_idx']
    (siteId) [name: 'work_plans_siteId_idx']
  }
}

Table tickets {
  id integer [primary key]
  name text [not null]
  detail text
  type integer [not null, note: 'FK → types.id (optional)']
  siteId integer [not null, note: 'FK → sites.id']
  assignedId integer [not null, note: 'FK → users.id (ช่างผู้รับ)']
  createdById integer [not null, note: 'FK → users.id (คนเปิดใบ)']
  createdAt timestamp [not null, default: 'now()']

  indexes {
    (assignedId, createdAt) [name: 'tickets_assignedId_createdAt_idx']
    (createdAt) [name: 'tickets_createdAt_idx']
  }
}

Table notifications {
  id integer [primary key]
  userId integer [not null, note: 'FK → users.id (ผู้รับ)']
  ticketId integer [not null, note: 'FK → tickets.id']
  type text [not null]
  message text [not null]
  isRead boolean [not null, default: false]
  readAt timestamp
  actorId integer [not null, note: 'FK → users.id (ผู้ trigger, optional)']
  link text
  createdAt timestamp [not null, default: 'now()']

  indexes {
    (userId, isRead, createdAt) [name: 'notifications_userId_isRead_createdAt_idx']
    (ticketId) [name: 'notifications_ticketId_idx']
  }
}

Table audit_logs {
  id int [primary key, note: 'cuid']
  userId integer [not null, note: 'FK → users.id']
  action text [not null]
  targetId text
  detail jsonb
  createdAt timestamp [not null, default: 'now()']

  indexes {
    (createdAt) [name: 'audit_logs_createdAt_idx']
    (userId, createdAt) [name: 'audit_logs_userId_createdAt_idx']
  }
}

Table _SiteToType {
  A integer [not null, note: 'FK → sites.id']
  B integer [not null, note: 'FK → types.id']

  indexes {
    (A, B) [pk, name: '_SiteToType_AB_pkey']
    (B) [name: '_SiteToType_B_index']
  }
}

Ref work_plans_user: work_plans.userId > users.id // many-to-one
Ref work_plans_type: work_plans.type > types.id // many-to-one (optional)
Ref work_plans_site: work_plans.siteId > sites.id // many-to-one
Ref tickets_type: tickets.type > types.id // many-to-one (optional)
Ref tickets_assigned: tickets.assignedId > users.id // many-to-one
Ref tickets_createdBy: tickets.createdById > users.id // many-to-one
Ref notif_user: notifications.userId > users.id // many-to-one
Ref notif_ticket: notifications.ticketId > tickets.id // many-to-one
Ref notif_actor: notifications.actorId > users.id // many-to-one (optional)
Ref audit_logs_user: audit_logs.userId > users.id // many-to-one
Ref site_to_type_site: _SiteToType.A > sites.id // many-to-one
Ref site_to_type_type: _SiteToType.B > types.id // many-to-one

Records types(id, name) {
  1, 'Solar Cell'
  2, 'CCTV'
  3, 'Network'
  4, 'IOT'
  5, 'Software'
}

Records users(id, username, name, role, color) {
  1, 'nongnoom', 'nongnoom', 'CEO', '#6366f1'
  2, 'tawan', 'Tawan', 'ENGINEER', '#0ea5e9'
  3, 'earth', 'Earth', 'ENGINEER', '#f59e0b'
  4, 'ohm', 'Ohm', 'ENGINEER', '#10b981'
}
