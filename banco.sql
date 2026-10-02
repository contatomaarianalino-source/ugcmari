-- =====================================================================
-- BANCO DO PORTFÓLIO DA MARIANA LINO
-- Onde colar: Supabase > seu projeto > menu da esquerda "SQL Editor"
-- > botão "New query" > cole TUDO isto > clique em "Run".
-- Pode rodar de novo sem medo: ele não apaga nada que já existe
-- e não duplica os dados de exemplo.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. QUEM É A DONA
-- Uma função que responde "sim" só quando quem está logada é você.
-- Todas as trancas abaixo usam essa função. Se um dia mudar o e-mail
-- do seu login, troque só aqui.
-- ---------------------------------------------------------------------
create or replace function public.eh_dona()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'contatomaarianalino@gmail.com';
$$;


-- ---------------------------------------------------------------------
-- 2. TABELAS
-- ---------------------------------------------------------------------

-- VÍDEOS: os vídeos que aparecem no portfólio.
-- "capa" é opcional: oar1, oar2 ou oar3, a opção de capa do YouTube Studio.
-- "exemplo" marca as linhas de exemplo, que podem ser apagadas.
create table if not exists public.videos (
  id         bigint generated always as identity primary key,
  titulo     text not null,
  link       text not null,
  nicho      text,
  formato    text default 'Vídeo UGC',
  marca      text,
  destaque   text,
  capa       text,
  ordem      integer not null default 0,
  visivel    boolean not null default true,
  exemplo    boolean not null default false,
  criado_em  timestamptz not null default now()
);

-- MARCAS: a sua base de contatos de empresa.
-- "origem" diz se a marca entrou pelo formulário do site ou pelo painel.
create table if not exists public.marcas (
  id              bigint generated always as identity primary key,
  nome            text not null,
  instagram       text,
  email           text,
  telefone        text,
  situacao        text not null default 'lead'
                  check (situacao in ('lead', 'conversando', 'cliente', 'parada')),
  obs             text,
  ultimo_contato  date,
  origem          text not null default 'admin' check (origem in ('admin', 'site')),
  exemplo         boolean not null default false,
  criado_em       timestamptz not null default now()
);

-- CALENDÁRIO: o que você vai gravar, editar e postar.
create table if not exists public.calendario (
  id         bigint generated always as identity primary key,
  titulo     text not null,
  marca      text,
  tipo       text not null default 'gravar' check (tipo in ('gravar', 'editar', 'postar')),
  data       date not null,
  status     text not null default 'a fazer' check (status in ('a fazer', 'feito')),
  exemplo    boolean not null default false,
  criado_em  timestamptz not null default now()
);

-- CAMPANHAS: os trabalhos fechados com as marcas.
-- Os status seguem o funil: Briefing, Roteiro, Aprovação Roteiro, Gravação,
-- Edição, Aprovado, Entregue.
create table if not exists public.campanhas (
  id         bigint generated always as identity primary key,
  campanha   text not null,
  cliente    text,
  tipo       text not null default 'Conteúdo' check (tipo in ('Conteúdo', 'Publicidade')),
  status     text not null default 'Briefing'
             check (status in ('Briefing', 'Roteiro', 'Aprovação Roteiro', 'Gravação', 'Edição', 'Aprovado', 'Entregue')),
  qtd        integer not null default 1 check (qtd >= 0),
  valor      numeric(12, 2) not null default 0 check (valor >= 0),
  prazo      date,
  pagamento  text not null default 'pendente' check (pagamento in ('pendente', 'pago')),
  ativa      boolean not null default true,
  favorita   boolean not null default false,
  exemplo    boolean not null default false,
  criado_em  timestamptz not null default now()
);

-- MARCADOS: o que você já marcou no checklist. A "chave" diz qual item é.
create table if not exists public.marcados (
  chave          text primary key,
  marcado        boolean not null default true,
  atualizado_em  timestamptz not null default now()
);

-- VISITAS: cada visita ao portfólio, para as métricas do painel.
-- Não guarda nada de quem visitou: só a data, a página e de onde veio.
create table if not exists public.visitas (
  id      bigint generated always as identity primary key,
  data    timestamptz not null default now(),
  pagina  text,
  origem  text
);

-- Índices para o painel ficar rápido.
create index if not exists visitas_data_idx on public.visitas (data);
create index if not exists videos_ordem_idx on public.videos (ordem);
create index if not exists calendario_data_idx on public.calendario (data);


-- ---------------------------------------------------------------------
-- 3. A TRANCA (RLS, Row Level Security)
-- Liga a tranca em TODAS as tabelas. Com ela ligada, ninguém lê nem
-- escreve nada, a não ser o que as regras abaixo liberam.
-- ---------------------------------------------------------------------
alter table public.videos     enable row level security;
alter table public.marcas     enable row level security;
alter table public.calendario enable row level security;
alter table public.campanhas  enable row level security;
alter table public.marcados   enable row level security;
alter table public.visitas    enable row level security;


-- ---------------------------------------------------------------------
-- 4. AS REGRAS DA TRANCA
-- Regra geral: só você, logada, pode ler, criar, editar e apagar.
-- ---------------------------------------------------------------------
drop policy if exists "dona faz tudo" on public.videos;
create policy "dona faz tudo" on public.videos
  for all to authenticated using (public.eh_dona()) with check (public.eh_dona());

drop policy if exists "dona faz tudo" on public.marcas;
create policy "dona faz tudo" on public.marcas
  for all to authenticated using (public.eh_dona()) with check (public.eh_dona());

drop policy if exists "dona faz tudo" on public.calendario;
create policy "dona faz tudo" on public.calendario
  for all to authenticated using (public.eh_dona()) with check (public.eh_dona());

drop policy if exists "dona faz tudo" on public.campanhas;
create policy "dona faz tudo" on public.campanhas
  for all to authenticated using (public.eh_dona()) with check (public.eh_dona());

drop policy if exists "dona faz tudo" on public.marcados;
create policy "dona faz tudo" on public.marcados
  for all to authenticated using (public.eh_dona()) with check (public.eh_dona());

drop policy if exists "dona faz tudo" on public.visitas;
create policy "dona faz tudo" on public.visitas
  for all to authenticated using (public.eh_dona()) with check (public.eh_dona());


-- EXCEÇÃO 1: o formulário do site pode CRIAR uma marca, sempre como lead.
-- Só criar. Ler, editar e apagar continuam sendo só seus.
drop policy if exists "site cria lead" on public.marcas;
create policy "site cria lead" on public.marcas
  for insert to anon
  with check (
    situacao = 'lead'
    and origem = 'site'
    and exemplo = false
    and char_length(nome) between 1 and 200
    and char_length(coalesce(email, '')) <= 200
    and char_length(coalesce(obs, '')) <= 3000
  );

-- EXCEÇÃO 2: qualquer visitante pode REGISTRAR uma visita. Só registrar.
drop policy if exists "site registra visita" on public.visitas;
create policy "site registra visita" on public.visitas
  for insert to anon
  with check (
    char_length(coalesce(pagina, '')) <= 300
    and char_length(coalesce(origem, '')) <= 100
  );

-- EXCEÇÃO 3 (necessária para o site mostrar os vídeos): qualquer pessoa
-- pode LER só os vídeos marcados como visíveis, que já aparecem no site.
-- Vídeo escondido, ninguém de fora vê.
drop policy if exists "site le videos visiveis" on public.videos;
create policy "site le videos visiveis" on public.videos
  for select to anon
  using (visivel = true);


-- ---------------------------------------------------------------------
-- 5. OS SEUS VÍDEOS REAIS
-- Os 33 vídeos que já estão no portfólio hoje, na mesma ordem.
-- Só entram se a tabela ainda estiver vazia.
-- ---------------------------------------------------------------------
insert into public.videos (titulo, link, nicho, formato, marca, capa, ordem, visivel)
select * from (values
  ('Monti Eyewear', 'https://youtube.com/shorts/0vA8lSm9f0o', 'Moda e acessórios', 'Vídeo UGC', 'Monti Eyewear', null, 10, true),
  ('Doce Noite Pijamas', 'https://youtube.com/shorts/ZI11bDlNxY4', 'Moda e acessórios', 'Vídeo UGC', 'Doce Noite Pijamas', null, 20, true),
  ('Sunlike', 'https://youtube.com/shorts/BDx4TFV-Ebo', 'Moda e acessórios', 'Vídeo UGC', 'Sunlike', null, 30, true),
  ('Monti Eyewear', 'https://youtube.com/shorts/p-e2FNFI7XY', 'Moda e acessórios', 'Vídeo UGC', 'Monti Eyewear', null, 40, true),
  ('Doce Noite Pijamas', 'https://youtube.com/shorts/dsTqBStSs5U', 'Moda e acessórios', 'Vídeo UGC', 'Doce Noite Pijamas', null, 50, true),
  ('Vam Basic Lingerie', 'https://youtube.com/shorts/a7fKLlgKLp0', 'Moda e acessórios', 'Vídeo UGC', 'Vam Basic Lingerie', null, 60, true),
  ('Souu Beauty', 'https://youtube.com/shorts/GkZyXgckaWk', 'Skincare', 'Vídeo UGC', 'Souu Beauty', null, 70, true),
  ('Garnier', 'https://youtube.com/shorts/cbXOe_jMh1w', 'Skincare', 'Vídeo UGC', 'Garnier', null, 80, true),
  ('Dride Cosméticos', 'https://youtube.com/shorts/ol5PUABuYJY', 'Skincare', 'Vídeo UGC', 'Dride Cosméticos', null, 90, true),
  ('Beyoung', 'https://youtube.com/shorts/xRZ28QHKf1Q', 'Skincare', 'Vídeo UGC', 'Beyoung', 'oar3', 100, true),
  ('Bioderma', 'https://youtube.com/shorts/vF0psQT5UeI', 'Skincare', 'Vídeo UGC', 'Bioderma', null, 110, true),
  ('Luance Joias', 'https://youtube.com/shorts/5Fxl-Ex3sWo', 'Maternidade', 'Vídeo UGC', 'Luance Joias', null, 120, true),
  ('Bebê Bistrô', 'https://youtube.com/shorts/6Inif_IiCDE', 'Maternidade', 'Vídeo UGC', 'Bebê Bistrô', null, 130, true),
  ('Gocase', 'https://youtube.com/shorts/MkfilgY9aO8', 'Maternidade', 'Vídeo UGC', 'Gocase', null, 140, true),
  ('Onda Marinha', 'https://youtube.com/shorts/aOQKQkvyZxM', 'Maternidade', 'Vídeo UGC', 'Onda Marinha', null, 150, true),
  ('Bebê Bistrô', 'https://youtube.com/shorts/TVg0FZDNp-M', 'Maternidade', 'Vídeo UGC', 'Bebê Bistrô', null, 160, true),
  ('Somnii', 'https://youtube.com/shorts/gOBBQIFHNks', 'Maternidade', 'Vídeo UGC', 'Somnii', null, 170, true),
  ('Onda Marinha', 'https://youtube.com/shorts/f2vlcxUFXNA', 'Maternidade', 'Vídeo UGC', 'Onda Marinha', null, 180, true),
  ('Likluc', 'https://youtube.com/shorts/FAZqYXtGDfI', 'Maternidade', 'Vídeo UGC', 'Likluc', null, 190, true),
  ('Cheiro de Rica', 'https://youtube.com/shorts/bE7-iVNRbwA', 'Beleza', 'Vídeo UGC', 'Cheiro de Rica', null, 200, true),
  ('Diva Beauty', 'https://youtube.com/shorts/TpePxiy5A8k', 'Beleza', 'Vídeo UGC', 'Diva Beauty', null, 210, true),
  ('Alta Moda', 'https://youtube.com/shorts/IHGbwbvLn0s', 'Beleza', 'Vídeo UGC', 'Alta Moda', null, 220, true),
  ('Parafina', 'https://youtube.com/shorts/6l38EqlwkMk', 'Beleza', 'Vídeo UGC', 'Parafina', null, 230, true),
  ('Iroobot', 'https://youtube.com/shorts/EMvJcew3LR0', 'Casa e decoração', 'Vídeo UGC', 'Iroobot', null, 240, true),
  ('Fortier', 'https://youtube.com/shorts/R9j9NpL0vCs', 'Casa e decoração', 'Vídeo UGC', 'Fortier', null, 250, true),
  ('Philips Walita', 'https://youtube.com/shorts/HPCiWU6oHWA', 'Casa e decoração', 'Vídeo UGC', 'Philips Walita', null, 260, true),
  ('Iroobot', 'https://youtube.com/shorts/AF3BPRbteMQ', 'Casa e decoração', 'Vídeo UGC', 'Iroobot', null, 270, true),
  ('Livz', 'https://youtube.com/shorts/XRAnXH0Nfxo', 'Cuidados pessoais', 'Vídeo UGC', 'Livz', null, 280, true),
  ('Bianco', 'https://youtube.com/shorts/i47ogR5Ql5s', 'Cuidados pessoais', 'Vídeo UGC', 'Bianco', null, 290, true),
  ('Magia de Cristal', 'https://youtube.com/shorts/XKMLYWkM3D8', 'Alimentação e fitness', 'Vídeo UGC', 'Magia de Cristal', null, 300, true),
  ('Ether.fi', 'https://youtube.com/shorts/BD9LMiAeWAc', 'Finanças', 'Vídeo UGC', 'Ether.fi', null, 310, true),
  ('English Path', 'https://youtube.com/shorts/3vo7wQcbZQk', 'Sites e apps', 'Vídeo UGC', 'English Path', null, 320, true),
  ('English Path', 'https://youtube.com/shorts/4BZ9p92UI80', 'Sites e apps', 'Vídeo UGC', 'English Path', null, 330, true)
) as v(titulo, link, nicho, formato, marca, capa, ordem, visivel)
where not exists (select 1 from public.videos);


-- ---------------------------------------------------------------------
-- 6. UMA LINHA DE EXEMPLO EM CADA LISTA
-- Só para você ver o formato. Estão marcadas como exemplo:
-- apague pelo painel quando quiser.
-- ---------------------------------------------------------------------
insert into public.marcas (nome, instagram, email, telefone, situacao, obs, ultimo_contato, exemplo)
select 'Marca de exemplo (apague)', '@marcaexemplo', 'contato@marcaexemplo.com', '(47) 90000-0000',
       'lead', 'Linha de exemplo para mostrar o formato. Pode apagar.', current_date, true
where not exists (select 1 from public.marcas);

insert into public.calendario (titulo, marca, tipo, data, status, exemplo)
select 'Exemplo: gravar vídeo (apague)', 'Marca de exemplo', 'gravar', current_date + 2, 'a fazer', true
where not exists (select 1 from public.calendario);

insert into public.campanhas (campanha, cliente, tipo, status, qtd, valor, prazo, pagamento, ativa, favorita, exemplo)
select 'Campanha de exemplo (apague)', 'Marca de exemplo', 'Conteúdo', 'Briefing', 1, 0, current_date + 7,
       'pendente', true, false, true
where not exists (select 1 from public.campanhas);


-- ---------------------------------------------------------------------
-- 7. CLIQUES NOS VÍDEOS (ranking "Vídeos mais assistidos" do painel)
-- Guarda só a data e o código do vídeo no YouTube. Nada de quem clicou.
-- ---------------------------------------------------------------------
create table if not exists public.cliques (
  id     bigint generated always as identity primary key,
  data   timestamptz not null default now(),
  video  text not null
);
create index if not exists cliques_data_idx on public.cliques (data);

alter table public.cliques enable row level security;

drop policy if exists "dona faz tudo" on public.cliques;
create policy "dona faz tudo" on public.cliques
  for all to authenticated using (public.eh_dona()) with check (public.eh_dona());

-- EXCEÇÃO 4: qualquer visitante pode ANOTAR um clique. Só anotar.
drop policy if exists "site registra clique" on public.cliques;
create policy "site registra clique" on public.cliques
  for insert to anon
  with check (video ~ '^[A-Za-z0-9_-]{11}$');


-- ---------------------------------------------------------------------
-- 8. FINANCEIRO E TAREFAS
-- Campanhas ganham o mês em que a marca fechou e a marcação de permuta.
-- "entradas" guarda o dinheiro que entrou na conta.
-- "tarefas" guarda a lista do que fazer. Tudo só para você, logada.
-- ---------------------------------------------------------------------
alter table public.campanhas add column if not exists fechado_em date;
alter table public.campanhas add column if not exists permuta boolean not null default false;

create table if not exists public.entradas (
  id           bigint generated always as identity primary key,
  data         date not null,
  valor        numeric(12, 2) not null check (valor >= 0),
  descricao    text not null,
  campanha_id  bigint references public.campanhas (id) on delete set null,
  criado_em    timestamptz not null default now()
);
create index if not exists entradas_data_idx on public.entradas (data);

create table if not exists public.tarefas (
  id         bigint generated always as identity primary key,
  texto      text not null,
  grupo      text not null default 'Esta semana',
  prazo      date,
  feito      boolean not null default false,
  feito_em   timestamptz,
  ordem      integer not null default 0,
  criado_em  timestamptz not null default now()
);

alter table public.entradas enable row level security;
alter table public.tarefas  enable row level security;

drop policy if exists "dona faz tudo" on public.entradas;
create policy "dona faz tudo" on public.entradas
  for all to authenticated using (public.eh_dona()) with check (public.eh_dona());

drop policy if exists "dona faz tudo" on public.tarefas;
create policy "dona faz tudo" on public.tarefas
  for all to authenticated using (public.eh_dona()) with check (public.eh_dona());

-- FIXOS MENSAIS: contratos que pagam o mesmo valor todo mês.
-- Cada mês sem entrada ligada ao fixo aparece em "A receber".
create table if not exists public.fixos (
  id         bigint generated always as identity primary key,
  cliente    text not null,
  valor      numeric(12, 2) not null check (valor >= 0),
  dia        smallint check (dia between 1 and 31),
  inicio     date not null,
  fim        date,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);
alter table public.entradas add column if not exists fixo_id bigint references public.fixos (id) on delete set null;
alter table public.entradas add column if not exists referente date;
-- O que você entrega para o fixo todo mês (ex.: 4 vídeos e 5 stories)
alter table public.fixos add column if not exists entrega text;

-- Tarefas que se repetem: toda semana (volta na segunda) ou todo mês (volta no dia escolhido)
alter table public.tarefas add column if not exists repete text check (repete in ('semanal', 'mensal'));
alter table public.tarefas add column if not exists dia_mes smallint check (dia_mes between 1 and 31);
-- Semanal com dia de entrega (0 domingo ... 3 quarta ... 6 sábado). Renova no dia seguinte.
alter table public.tarefas add column if not exists dia_semana smallint check (dia_semana between 0 and 6);

alter table public.fixos enable row level security;
drop policy if exists "dona faz tudo" on public.fixos;
create policy "dona faz tudo" on public.fixos
  for all to authenticated using (public.eh_dona()) with check (public.eh_dona());


-- =====================================================================
-- COMO TESTAR SE A TRANCA FUNCIONA
-- Depois de rodar tudo acima, apague o conteúdo do editor, cole só
-- o bloco abaixo (sem os dois tracinhos do começo das linhas) e rode.
-- Ele finge ser um visitante qualquer, sem login, e tenta ler tudo.
--
-- begin;
-- set local role anon;
-- select 'marcas' as tabela, count(*) from public.marcas
-- union all select 'calendario', count(*) from public.calendario
-- union all select 'campanhas', count(*) from public.campanhas
-- union all select 'visitas', count(*) from public.visitas
-- union all select 'marcados', count(*) from public.marcados
-- union all select 'cliques', count(*) from public.cliques
-- union all select 'entradas', count(*) from public.entradas
-- union all select 'tarefas', count(*) from public.tarefas
-- union all select 'videos escondidos', count(*) from public.videos where visivel = false;
-- rollback;
--
-- Resultado certo: TODAS as linhas com 0, mesmo que você tenha dados.
-- Se aparecer qualquer número maior que 0, a tranca não está funcionando.
-- =====================================================================
