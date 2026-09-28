/* =====================================================================
   CONEXÃO COM O BANCO (Supabase)
   O endereço e a chave pública ficam guardados só aqui, e todas as
   páginas (portfólio, login e painel) usam este arquivo.

   A chave abaixo é a PÚBLICA (publishable). Ela pode ficar no site:
   quem protege os seus dados é a tranca (RLS) configurada no banco.sql.
   NUNCA coloque aqui a chave secreta (service_role / secret).

   Antes deste arquivo, a página precisa carregar o Supabase:
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   ===================================================================== */
(function () {
  const SUPABASE_URL = "https://fucmvodilcpwvczzqbse.supabase.co";
  const SUPABASE_CHAVE_PUBLICA = "sb_publishable_z_XCMeua1JKWz9xd9Z8fSg_iC1kX-HY";

  /* Endereços do site, usados no login e na recuperação de senha */
  window.SITE_URL = "https://contatomaarianalino-source.github.io/ugcmari/";

  if (!window.supabase || !window.supabase.createClient) {
    /* O Supabase não carregou (sem internet ou bloqueado). As páginas
       continuam funcionando no que não depende do banco. */
    window.banco = null;
    return;
  }
  window.banco = window.supabase.createClient(SUPABASE_URL, SUPABASE_CHAVE_PUBLICA, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
})();
