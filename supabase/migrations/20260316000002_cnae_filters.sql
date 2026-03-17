-- Recria tabela cnae_filters do zero
drop table if exists public.cnae_filters cascade;

create table public.cnae_filters (
  id          uuid        primary key default gen_random_uuid(),
  code        text        not null unique,
  short_name  text        not null,
  description text,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now()
);

create index cnae_filters_code_idx on public.cnae_filters (code);

alter table public.cnae_filters enable row level security;

create policy "allow all" on public.cnae_filters
  for all using (true) with check (true);
