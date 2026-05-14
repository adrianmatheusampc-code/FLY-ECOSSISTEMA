-- =============================================================
-- FLY ECOSSISTEMA · Esquema base Supabase
-- Rode esse arquivo no SQL editor do Supabase (uma vez).
-- Habilita RLS em todas as tabelas com policies básicas.
-- =============================================================

-- Modo de dados (DEMO / NORMAL / META) — espelha localStorage.
do $$ begin
  create type fly_data_mode as enum ('demo', 'operational', 'goal');
exception
  when duplicate_object then null;
end $$;

-- =============================================================
-- 1 · COFRE AEY (caixa privado dos sócios)
-- =============================================================

create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  user_id uuid references auth.users(id),
  active boolean default true,
  role text default 'socio', -- master | socio | finance_restricted
  created_at timestamptz default now()
);

create table if not exists wallets (
  id uuid primary key default gen_random_uuid(),
  data_mode fly_data_mode not null default 'demo',
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
  data_mode fly_data_mode not null default 'demo',
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
  data_mode fly_data_mode not null default 'demo',
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
  data_mode fly_data_mode not null default 'demo',
  customer_id uuid references customers(id) on delete set null,
  name text not null, -- snapshot
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
  data_mode fly_data_mode not null default 'demo',
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
  data_mode fly_data_mode not null default 'demo',
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
  data_mode fly_data_mode not null default 'demo',
  polo_id uuid references fly_cup_polos(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  modalidade text references fly_cup_modalidades(id) on delete set null,
  nome text not null,
  ranking int,
  desire_dubai boolean default false,
  created_at timestamptz default now()
);

-- =============================================================
-- 4 · PLANO WAR (já existe no localStorage — espelhar)
-- =============================================================

create table if not exists war_territories (
  id text primary key,
  data_mode fly_data_mode not null default 'demo',
  payload jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists war_connections (
  id text primary key,
  data_mode fly_data_mode not null default 'demo',
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

-- Policy padrão: usuário autenticado faz tudo.
-- Ajuste depois pra checar role de partner (master/socio/finance_restricted).
do $$
declare t text;
begin
  for t in select unnest(array[
    'partners','wallets','money_movements','movement_attachments',
    'audit_logs','jarvis_finance_commands',
    'customers','sales',
    'fly_cup_polos','fly_cup_eventos','fly_cup_atletas',
    'war_territories','war_connections'
  ])
  loop
    execute format('
      drop policy if exists "auth read %1$s" on %1$s;
      drop policy if exists "auth write %1$s" on %1$s;
      create policy "auth read %1$s"  on %1$s for select to authenticated using (true);
      create policy "auth write %1$s" on %1$s for all    to authenticated using (true) with check (true);
    ', t);
  end loop;
end$$;

-- =============================================================
-- 6 · SEED PARTNERS (rode uma vez)
-- =============================================================
insert into partners (name) values
  ('Victor'), ('Emanuel'), ('Alen/Adrian'), ('Juninho')
on conflict do nothing;
