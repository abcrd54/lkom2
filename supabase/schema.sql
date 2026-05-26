create extension if not exists pgcrypto;

create table if not exists mail_accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('google', 'microsoft')),
  email_address text not null unique,
  refresh_token_encrypted text not null,
  token_expires_at timestamptz,
  status text not null default 'active' check (status in ('active', 'reauth_required', 'disabled')),
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone_number text not null,
  mail_account_id uuid not null references mail_accounts(id) on delete restrict,
  access_token_encrypted text not null,
  access_token_hash text not null unique,
  status text not null default 'active' check (status in ('active', 'disabled')),
  link_disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists otp_messages (
  id uuid primary key default gen_random_uuid(),
  mail_account_id uuid not null references mail_accounts(id) on delete cascade,
  provider_message_id text not null,
  sender text not null,
  recipient text not null,
  subject text not null default '',
  otp_code text not null,
  body_preview text,
  received_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (mail_account_id, provider_message_id)
);

create table if not exists whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  message text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists whatsapp_logs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references whatsapp_templates(id) on delete set null,
  template_name text not null,
  message text not null,
  recipients jsonb not null default '[]'::jsonb,
  recipient_count integer not null default 0,
  status text not null check (status in ('queued', 'sent', 'failed', 'partial')),
  provider_request_id text,
  provider_response jsonb,
  created_at timestamptz not null default now()
);

create table if not exists redeem_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists redeem_code_users (
  id uuid primary key default gen_random_uuid(),
  redeem_code_id uuid not null references redeem_codes(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (redeem_code_id, user_id),
  unique (user_id)
);

create index if not exists idx_users_mail_account_id on users(mail_account_id);
create index if not exists idx_otp_messages_mail_account_id_received_at on otp_messages(mail_account_id, received_at desc);
create index if not exists idx_redeem_code_users_redeem_code_id on redeem_code_users(redeem_code_id);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_mail_accounts_updated_at on mail_accounts;
create trigger set_mail_accounts_updated_at
before update on mail_accounts
for each row
execute function set_updated_at();

drop trigger if exists set_users_updated_at on users;
create trigger set_users_updated_at
before update on users
for each row
execute function set_updated_at();

drop trigger if exists set_whatsapp_templates_updated_at on whatsapp_templates;
create trigger set_whatsapp_templates_updated_at
before update on whatsapp_templates
for each row
execute function set_updated_at();

drop trigger if exists set_redeem_codes_updated_at on redeem_codes;
create trigger set_redeem_codes_updated_at
before update on redeem_codes
for each row
execute function set_updated_at();

create or replace function enforce_mail_account_user_limit()
returns trigger
language plpgsql
as $$
declare
  active_user_count integer;
begin
  if new.status <> 'active' then
    return new;
  end if;

  select count(*)
  into active_user_count
  from users
  where mail_account_id = new.mail_account_id
    and status = 'active'
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if active_user_count >= 3 then
    raise exception 'mail account already has maximum 3 active users';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_mail_account_user_limit on users;
create trigger trg_enforce_mail_account_user_limit
before insert or update on users
for each row
execute function enforce_mail_account_user_limit();

create or replace function enforce_redeem_code_user_limit()
returns trigger
language plpgsql
as $$
declare
  assigned_user_count integer;
  existing_assignment_count integer;
begin
  select count(*)
  into assigned_user_count
  from redeem_code_users
  where redeem_code_id = new.redeem_code_id
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if assigned_user_count >= 3 then
    raise exception 'redeem code already has maximum 3 users';
  end if;

  select count(*)
  into existing_assignment_count
  from redeem_code_users
  where user_id = new.user_id
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if existing_assignment_count >= 1 then
    raise exception 'user already has a redeem code';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_redeem_code_user_limit on redeem_code_users;
create trigger trg_enforce_redeem_code_user_limit
before insert or update on redeem_code_users
for each row
execute function enforce_redeem_code_user_limit();
