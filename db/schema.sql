-- =============================================================
-- FLY ECOSSISTEMA · Esquema base Supabase — VERSION 4 (SIMPLES)
-- Sem DO blocks, sem ENUMs. Só sintaxe básica que SEMPRE funciona.
-- Pode rodar várias vezes que não dá erro.
-- =============================================================

-- =============================================================
-- 1 · COFRE AEY (caixa privado dos sócios)
-- =============================================================

create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  user_id uuid references auth.users(id),
  active boolean default true,
  role text default 'socio',
  created_at timestamptz default now()
);

create table if not exists wallets (
  id uuid primary key default gen_random_uuid(),
  data_mode text not null default 'demo' check (data_mode in ('demo','operational','goal')),
  name text not null,
  type text not null check (type in ('cash','bank_account','credit_card','pj_account','digital_wallet')),
  owner_partner_id uuid references partners(id) on delete set null,
  current_balance numeric default 0,
  credit_limit numeric default 0,
  current_invoice_amount numeric default 0,
  closing_day int,
  due_day int,
  active boolean default true,
  notes text,
  created_at timestamptz default now()
);

create table if not exists money_movements (
  id uuid primary key default gen_random_uuid(),
  data_mode text not null default 'demo' check (data_mode in ('demo','operational','goal')),
  movement_type text not null check (movement_type in
    ('income','expense','internal_transfer','credit_card_expense','invoice_payment','adjustment','reversal')),
  amount numeric not null check (amount >= 0),
  date date default current_date,
  description text,
  category text,
  money_owner text default 'fly' check (money_owner in ('fly','aey','personal','project')),
  partner_id uuid references partners(id) on delete set null,
  from_partner_id uuid references partners(id) on delete set null,
  to_partner_id   uuid references partners(id) on delete set null,
  from_wallet_id  uuid references wallets(id)  on delete set null,
  to_wallet_id    uuid references wallets(id)  on delete set null,
  project_id text,
  related_sale_id uuid,
  related_client_id uuid,
  status text default 'confirmed' check (status in ('confirmed','pending','reversed')),
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists movement_attachments (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid references money_movements(id) on delete cascade,
  file_url text not null,
  file_type text,
  created_at timestamptz default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists jarvis_finance_commands (
  id uuid primary key default gen_random_uuid(),
  raw_text text not null,
  interpreted_action text,
  extracted_data_json jsonb,
  confirmation_status text default 'pending' check (confirmation_status in ('pending','confirmed','discarded')),
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- =============================================================
-- 2 · CENTRAL DE VENDAS
-- =============================================================

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  data_mode text not null default 'demo' check (data_mode in ('demo','operational','goal')),
  name text not null,
  phone text,
  instagram text,
  email text,
  origin text,
  stage text default 'lead_frio',
  desire_dubai boolean default false,
  score int default 0,
  doc_status text,
  passport_validity date,
  birthdate date,
  profession text,
  city text,
  state text,
  country text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  data_mode text not null default 'demo' check (data_mode in ('demo','operational','goal')),
  customer_id uuid references customers(id) on delete set null,
  name text not null,
  phone text,
  instagram text,
  origin text,
  product text,
  amount numeric default 0,
  profit numeric default 0,
  commission numeric default 0,
  payment_method text,
  travel_date date,
  seller text,
  doc_status text,
  status text default 'sinal_pago',
  notes text,
  created_at timestamptz default now()
);

-- =============================================================
-- 3 · FLY CUP
-- =============================================================

create table if not exists fly_cup_modalidades (
  id text primary key,
  name text not null
);

insert into fly_cup_modalidades(id, name) values
  ('futebol',  'Futebol'),
  ('futevolei','Futevôlei'),
  ('tenis',    'Tênis'),
  ('kart',     'Kart'),
  ('surf',     'Surf'),
  ('basquete', 'Basquete'),
  ('skate',    'Skate'),
  ('paintball','Paintball'),
  ('airsoft',  'Airsoft'),
  ('outros',   'Outros')
on conflict (id) do nothing;

create table if not exists fly_cup_polos (
  id uuid primary key default gen_random_uuid(),
  data_mode text not null default 'demo' check (data_mode in ('demo','operational','goal')),
  modalidade text references fly_cup_modalidades(id) on delete set null,
  nome text not null,
  cidade text,
  responsavel text,
  atletas int default 0,
  patrocinador text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists fly_cup_eventos (
  id uuid primary key default gen_random_uuid(),
  data_mode text not null default 'demo' check (data_mode in ('demo','operational','goal')),
  modalidade text references fly_cup_modalidades(id) on delete set null,
  nome text not null,
  data date,
  local text,
  vagas int default 0,
  receita numeric default 0,
  custo numeric default 0,
  patrocinador text,
  conversao_dubai int default 0,
  notes text,
  created_at timestamptz default now()
);

create table if not exists fly_cup_atletas (
  id uuid primary key default gen_random_uuid(),
  data_mode text not null default 'demo' check (data_mode in ('demo','operational','goal')),
  polo_id uuid references fly_cup_polos(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  modalidade text references fly_cup_modalidades(id) on delete set null,
  nome text not null,
  ranking int,
  desire_dubai boolean default false,
  created_at timestamptz default now()
);

-- =============================================================
-- 4 · PLANO WAR
-- =============================================================

create table if not exists war_territories (
  id text primary key,
  data_mode text not null default 'demo' check (data_mode in ('demo','operational','goal')),
  payload jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists war_connections (
  id text primary key,
  data_mode text not null default 'demo' check (data_mode in ('demo','operational','goal')),
  payload jsonb not null,
  updated_at timestamptz default now()
);

-- =============================================================
-- 5 · RLS — permissões básicas
-- =============================================================

alter table partners              enable row level security;
alter table wallets               enable row level security;
alter table money_movements       enable row level security;
alter table movement_attachments  enable row level security;
alter table audit_logs            enable row level security;
alter table jarvis_finance_commands enable row level security;
alter table customers             enable row level security;
alter table sales                 enable row level security;
alter table fly_cup_polos         enable row level security;
alter table fly_cup_eventos       enable row level security;
alter table fly_cup_atletas       enable row level security;
alter table war_territories       enable row level security;
alter table war_connections       enable row level security;

drop policy if exists "auth read partners" on partners;
drop policy if exists "auth write partners" on partners;
create policy "auth read partners" on partners for select to authenticated using (true);
create policy "auth write partners" on partners for all to authenticated using (true) with check (true);

drop policy if exists "auth read wallets" on wallets;
drop policy if exists "auth write wallets" on wallets;
create policy "auth read wallets" on wallets for select to authenticated using (true);
create policy "auth write wallets" on wallets for all to authenticated using (true) with check (true);

drop policy if exists "auth read money_movements" on money_movements;
drop policy if exists "auth write money_movements" on money_movements;
create policy "auth read money_movements" on money_movements for select to authenticated using (true);
create policy "auth write money_movements" on money_movements for all to authenticated using (true) with check (true);

drop policy if exists "auth read movement_attachments" on movement_attachments;
drop policy if exists "auth write movement_attachments" on movement_attachments;
create policy "auth read movement_attachments" on movement_attachments for select to authenticated using (true);
create policy "auth write movement_attachments" on movement_attachments for all to authenticated using (true) with check (true);

drop policy if exists "auth read audit_logs" on audit_logs;
drop policy if exists "auth write audit_logs" on audit_logs;
create policy "auth read audit_logs" on audit_logs for select to authenticated using (true);
create policy "auth write audit_logs" on audit_logs for all to authenticated using (true) with check (true);

drop policy if exists "auth read jarvis_finance_commands" on jarvis_finance_commands;
drop policy if exists "auth write jarvis_finance_commands" on jarvis_finance_commands;
create policy "auth read jarvis_finance_commands" on jarvis_finance_commands for select to authenticated using (true);
create policy "auth write jarvis_finance_commands" on jarvis_finance_commands for all to authenticated using (true) with check (true);

drop policy if exists "auth read customers" on customers;
drop policy if exists "auth write customers" on customers;
create policy "auth read customers" on customers for select to authenticated using (true);
create policy "auth write customers" on customers for all to authenticated using (true) with check (true);

drop policy if exists "auth read sales" on sales;
drop policy if exists "auth write sales" on sales;
create policy "auth read sales" on sales for select to authenticated using (true);
create policy "auth write sales" on sales for all to authenticated using (true) with check (true);

drop policy if exists "auth read fly_cup_polos" on fly_cup_polos;
drop policy if exists "auth write fly_cup_polos" on fly_cup_polos;
create policy "auth read fly_cup_polos" on fly_cup_polos for select to authenticated using (true);
create policy "auth write fly_cup_polos" on fly_cup_polos for all to authenticated using (true) with check (true);

drop policy if exists "auth read fly_cup_eventos" on fly_cup_eventos;
drop policy if exists "auth write fly_cup_eventos" on fly_cup_eventos;
create policy "auth read fly_cup_eventos" on fly_cup_eventos for select to authenticated using (true);
create policy "auth write fly_cup_eventos" on fly_cup_eventos for all to authenticated using (true) with check (true);

drop policy if exists "auth read fly_cup_atletas" on fly_cup_atletas;
drop policy if exists "auth write fly_cup_atletas" on fly_cup_atletas;
create policy "auth read fly_cup_atletas" on fly_cup_atletas for select to authenticated using (true);
create policy "auth write fly_cup_atletas" on fly_cup_atletas for all to authenticated using (true) with check (true);

drop policy if exists "auth read war_territories" on war_territories;
drop policy if exists "auth write war_territories" on war_territories;
create policy "auth read war_territories" on war_territories for select to authenticated using (true);
create policy "auth write war_territories" on war_territories for all to authenticated using (true) with check (true);

drop policy if exists "auth read war_connections" on war_connections;
drop policy if exists "auth write war_connections" on war_connections;
create policy "auth read war_connections" on war_connections for select to authenticated using (true);
create policy "auth write war_connections" on war_connections for all to authenticated using (true) with check (true);

-- =============================================================
-- 6 · SEED PARTNERS
-- =============================================================
insert into partners (name) values
  ('Victor'), ('Emanuel'), ('Alen/Adrian'), ('Juninho')
on conflict do nothing;

-- =============================================================
-- 7 · STORAGE · bucket fly-media (PDF / vídeo-arquivo)
-- Fotos vão pro Cloudinary (não precisa de policy aqui).
-- O bucket público libera só LEITURA; estas policies liberam
-- UPLOAD/UPDATE/DELETE escopados SÓ ao bucket fly-media.
-- Rode no Supabase → SQL Editor. Pode rodar várias vezes.
-- =============================================================
do $$
begin
  -- leitura pública
  if not exists (select 1 from pg_policies where policyname = 'fly_media_read') then
    create policy "fly_media_read" on storage.objects
      for select to public using ( bucket_id = 'fly-media' );
  end if;
  -- upload (qualquer um com a anon key — app client-only; escopado ao bucket)
  if not exists (select 1 from pg_policies where policyname = 'fly_media_insert') then
    create policy "fly_media_insert" on storage.objects
      for insert to public with check ( bucket_id = 'fly-media' );
  end if;
  -- substituir arquivo (upsert)
  if not exists (select 1 from pg_policies where policyname = 'fly_media_update') then
    create policy "fly_media_update" on storage.objects
      for update to public using ( bucket_id = 'fly-media' );
  end if;
  -- apagar
  if not exists (select 1 from pg_policies where policyname = 'fly_media_delete') then
    create policy "fly_media_delete" on storage.objects
      for delete to public using ( bucket_id = 'fly-media' );
  end if;
end $$;


-- =============================================================
-- 8 · KV SYNC · tabela fly_kv
-- ESTA TABELA SINCRONIZA TODO O TRABALHO DO APP (pacotes, textos,
-- operações, design, etc.) ENTRE PCs E CELULARES.
-- SEM ELA, cada aparelho fica isolado no localStorage e as
-- alterações nunca aparecem em outro dispositivo.
-- Rode no Supabase → SQL Editor. Idempotente (pode rodar de novo).
-- =============================================================
create table if not exists fly_kv (
  key        text primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now()
);

alter table fly_kv enable row level security;

do $$
begin
  -- app é client-only com a anon key → libera leitura/escrita pra
  -- public (cobre anon + authenticated). É um doc compartilhado da
  -- empresa, não dado sensível por-usuário.
  if not exists (select 1 from pg_policies where policyname = 'fly_kv_read' and tablename = 'fly_kv') then
    create policy "fly_kv_read"  on fly_kv for select to public using ( true );
  end if;
  if not exists (select 1 from pg_policies where policyname = 'fly_kv_write' and tablename = 'fly_kv') then
    create policy "fly_kv_write" on fly_kv for all    to public using ( true ) with check ( true );
  end if;
end $$;

-- mantém updated_at fresco a cada upsert (conflito = último a salvar vence)
create or replace function fly_kv_touch() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end $$ language plpgsql;

drop trigger if exists fly_kv_touch_trg on fly_kv;
create trigger fly_kv_touch_trg before update on fly_kv
  for each row execute function fly_kv_touch();
