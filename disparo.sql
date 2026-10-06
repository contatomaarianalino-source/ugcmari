-- =====================================================================
-- DISPARO DE E-MAILS (aba Prospecção do painel)
--
-- ONDE COLAR: no Supabase, menu da esquerda "SQL Editor", botão "New
-- query". Cole este arquivo inteiro e clique em "Run".
-- Pode rodar quantas vezes quiser: nada é apagado e nada é duplicado.
--
-- Este arquivo só tem a ESTRUTURA. Nenhum dado seu (e-mail de marca,
-- valor, nome) fica aqui, porque este arquivo é público no GitHub.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. REGISTRO DE ENVIOS
-- Uma linha por e-mail que saiu (ou tentou sair). É assim que você sabe
-- quem recebeu e quem não recebeu quando um disparo para no meio.
-- ---------------------------------------------------------------------
create table if not exists public.email_envios (
  id         bigint generated always as identity primary key,
  email      text not null,                       -- para quem foi
  marca      text,                                -- nome da marca, para facilitar a leitura
  assunto    text not null,                       -- o assunto do e-mail
  status     text not null check (status in ('ok', 'erro')),
  erro       text,                                -- o motivo, quando deu errado
  resend_id  text,                                -- o código que o Resend devolve
  via        text not null default 'resend' check (via in ('resend', 'rascunho', 'teste')),
  criado_em  timestamptz not null default now()   -- a data do envio
);
create index if not exists email_envios_email_assunto on public.email_envios (lower(email), assunto);


-- ---------------------------------------------------------------------
-- 2. DESCADASTRO
-- Quem respondeu SAIR. Quem está aqui nunca mais recebe disparo.
-- ---------------------------------------------------------------------
create table if not exists public.email_optout (
  email      text primary key,                    -- sempre guardado em minúsculas
  criado_em  timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 3. COLUNAS NOVAS NA TABELA DE MARCAS (sem apagar nada)
-- selecionada: a caixinha da aba Marcas. Fica salva: marca hoje, dispara amanhã.
-- enviado_em:  o dia em que a marca recebeu o seu e-mail de prospecção.
-- ---------------------------------------------------------------------
alter table public.marcas add column if not exists selecionada boolean not null default false;
alter table public.marcas add column if not exists enviado_em date;


-- ---------------------------------------------------------------------
-- 4. TRANCA (RLS)
-- Só você, logada com o e-mail do painel, lê e escreve.
-- Quem não está logado não enxerga nada.
-- (A função eh_dona() já existe: ela foi criada pelo banco.sql.)
-- ---------------------------------------------------------------------
alter table public.email_envios enable row level security;
drop policy if exists "dona faz tudo" on public.email_envios;
create policy "dona faz tudo" on public.email_envios
  for all to authenticated using (public.eh_dona()) with check (public.eh_dona());

alter table public.email_optout enable row level security;
drop policy if exists "dona faz tudo" on public.email_optout;
create policy "dona faz tudo" on public.email_optout
  for all to authenticated using (public.eh_dona()) with check (public.eh_dona());


-- =====================================================================
-- COMO TESTAR SE A TRANCA FUNCIONA
-- Apague o conteúdo do editor, cole só o bloco abaixo (sem os dois
-- tracinhos do começo das linhas) e rode. O resultado certo é 0 nas
-- duas linhas, mesmo que você já tenha envios.
--
-- begin;
-- set local role anon;
-- select 'email_envios' as tabela, count(*) from public.email_envios
-- union all select 'email_optout', count(*) from public.email_optout;
-- rollback;
-- =====================================================================
