-- ============================================================
-- Migration 006: Notifications & Push Tokens
-- ============================================================
-- notifications: admin broadcasts with plan-based targeting.
-- user_notifications: per-user fan-out (backend writes rows).
-- push_tokens: Expo push tokens per device.
-- ============================================================


-- ── notifications ────────────────────────────────────────────────────────────

create table if not exists public.notifications (
  id            uuid         primary key default gen_random_uuid(),
  title         text         not null,
  body          text         not null,
  target_type   text         not null default 'all'
                             check (target_type in (
                               'all',
                               'new_users',
                               'plan_free',
                               'plan_pro_m',
                               'plan_pro_y',
                               'plan_biz_m',
                               'plan_biz_y',
                               'specific'
                             )),
  days_threshold integer,    -- used when target_type = 'new_users'
  created_by    uuid         references public.profiles(id) on delete set null,
  created_at    timestamptz  not null default now()
);

-- RLS enabled: backend uses service role (bypasses RLS); authenticated users
-- can only read notifications delivered to them via user_notifications.
-- No direct client writes — all writes go through the backend service role.
alter table public.notifications enable row level security;

create policy "Authenticated users can read notifications"
  on public.notifications for select to authenticated
  using (true);

create index if not exists notifications_created_at_idx on public.notifications(created_at desc);
create index if not exists notifications_created_by_idx on public.notifications(created_by);


-- ── user_notifications ────────────────────────────────────────────────────────

create table if not exists public.user_notifications (
  id              uuid         primary key default gen_random_uuid(),
  user_id         uuid         not null references public.profiles(id) on delete cascade,
  notification_id uuid         not null references public.notifications(id) on delete cascade,
  is_read         boolean      not null default false,
  read_at         timestamptz,
  created_at      timestamptz  not null default now(),
  constraint user_notifications_unique unique (user_id, notification_id)
);

alter table public.user_notifications enable row level security;

create policy "Users read own notifications"
  on public.user_notifications for select to authenticated
  using (auth.uid() = user_id);

create policy "Users mark notifications read"
  on public.user_notifications for update to authenticated
  using (auth.uid() = user_id);

create index if not exists user_notifications_user_id_idx on public.user_notifications(user_id);
create index if not exists user_notifications_unread_idx
  on public.user_notifications(user_id, is_read) where is_read = false;


-- ── push_tokens ───────────────────────────────────────────────────────────────

create table if not exists public.push_tokens (
  id         uuid         primary key default gen_random_uuid(),
  user_id    uuid         not null references public.profiles(id) on delete cascade,
  token      text         not null,
  platform   text         check (platform in ('ios', 'android')),
  updated_at timestamptz  not null default now(),
  created_at timestamptz  not null default now(),
  constraint push_tokens_user_token_unique unique (user_id, token)
);

alter table public.push_tokens enable row level security;

create policy "Users manage own push tokens"
  on public.push_tokens for all to authenticated
  using (auth.uid() = user_id);

create index if not exists push_tokens_user_id_idx on public.push_tokens(user_id);
