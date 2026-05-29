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

create table if not exists sub_mail_accounts (
  id uuid primary key default gen_random_uuid(),
  mail_account_id uuid not null references mail_accounts(id) on delete cascade,
  label text not null,
  display_email text not null,
  max_users integer not null default 4 check (max_users >= 1 and max_users <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mail_account_id, display_email)
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone_number text not null,
  mail_account_id uuid references mail_accounts(id) on delete restrict,
  sub_mail_account_id uuid references sub_mail_accounts(id) on delete restrict,
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

create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  message text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists email_logs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references email_templates(id) on delete set null,
  template_name text not null,
  subject text not null,
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

alter table users
add column if not exists sub_mail_account_id uuid;

alter table users
add column if not exists email text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_sub_mail_account_id_fkey'
  ) then
    alter table users
    add constraint users_sub_mail_account_id_fkey
    foreign key (sub_mail_account_id) references sub_mail_accounts(id) on delete restrict;
  end if;
end $$;

insert into sub_mail_accounts (mail_account_id, label, display_email, max_users)
select ma.id, 'Primary', ma.email_address, 4
from mail_accounts ma
where not exists (
  select 1
  from sub_mail_accounts sma
  where sma.mail_account_id = ma.id
    and sma.display_email = ma.email_address
);

update users
set sub_mail_account_id = sma.id
from sub_mail_accounts sma
where users.sub_mail_account_id is null
  and sma.mail_account_id = users.mail_account_id
  and sma.display_email = (
    select ma.email_address
    from mail_accounts ma
    where ma.id = users.mail_account_id
  );

alter table users
alter column mail_account_id drop not null;

alter table users
alter column sub_mail_account_id drop not null;

create index if not exists idx_users_mail_account_id on users(mail_account_id);
create index if not exists idx_users_sub_mail_account_id on users(sub_mail_account_id);
create unique index if not exists idx_users_phone_number_unique on users(phone_number);
create unique index if not exists idx_users_email_unique on users(email);
create index if not exists idx_sub_mail_accounts_mail_account_id on sub_mail_accounts(mail_account_id);
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

drop trigger if exists set_sub_mail_accounts_updated_at on sub_mail_accounts;
create trigger set_sub_mail_accounts_updated_at
before update on sub_mail_accounts
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

drop trigger if exists set_email_templates_updated_at on email_templates;
create trigger set_email_templates_updated_at
before update on email_templates
for each row
execute function set_updated_at();

drop trigger if exists set_redeem_codes_updated_at on redeem_codes;
create trigger set_redeem_codes_updated_at
before update on redeem_codes
for each row
execute function set_updated_at();

create or replace function enforce_user_sub_mail_account_constraints()
returns trigger
language plpgsql
as $$
declare
  active_user_count integer;
  sub_account_max_users integer;
  sub_account_mail_account_id uuid;
begin
  if new.sub_mail_account_id is null and new.mail_account_id is null then
    return new;
  end if;

  if new.sub_mail_account_id is null and new.mail_account_id is not null then
    raise exception 'mail account requires a matching sub mail account';
  end if;

  select mail_account_id, max_users
  into sub_account_mail_account_id, sub_account_max_users
  from sub_mail_accounts
  where id = new.sub_mail_account_id;

  if sub_account_mail_account_id is null then
    raise exception 'sub mail account was not found';
  end if;

  if new.mail_account_id is null then
    raise exception 'sub mail account requires a parent inbox';
  end if;

  if new.mail_account_id <> sub_account_mail_account_id then
    raise exception 'sub mail account does not belong to the selected inbox';
  end if;

  if new.status <> 'active' then
    return new;
  end if;

  select count(*)
  into active_user_count
  from users
  where sub_mail_account_id = new.sub_mail_account_id
    and status = 'active'
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if active_user_count >= sub_account_max_users then
    raise exception 'sub mail account already has maximum % active users', sub_account_max_users;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_mail_account_user_limit on users;
drop trigger if exists trg_enforce_user_sub_mail_account_constraints on users;
create trigger trg_enforce_user_sub_mail_account_constraints
before insert or update on users
for each row
execute function enforce_user_sub_mail_account_constraints();

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
