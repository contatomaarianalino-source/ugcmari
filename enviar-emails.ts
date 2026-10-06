// =====================================================================
// O CARTEIRO: função "enviar-emails" do Supabase (Edge Function)
//
// Ela recebe a lista de marcas, o assunto e o texto do e-mail, e manda
// um por um pelo Resend. Este arquivo NÃO tem chave nenhuma: a chave do
// Resend fica guardada no painel do Supabase, como segredo da função,
// com o nome RESEND_API_KEY. Por isso ele pode ficar no GitHub sem risco.
//
// Segredos que a função lê (todos no painel do Supabase):
//   RESEND_API_KEY  a chave do Resend (obrigatória para enviar)
//   EMAIL_FROM      quem aparece como remetente. Opcional. Enquanto você
//                   não verificar o seu domínio, fica o do próprio Resend.
// SUPABASE_URL e SUPABASE_ANON_KEY o Supabase já entrega sozinho.
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DONA = "contatomaarianalino@gmail.com";        // só esse login pode disparar
const RESPONDER_PARA = "contatomaarianalino@gmail.com"; // a resposta da marca cai aqui
const MAXIMO_POR_CHAMADA = 250;
const ESPERA_MS = 200;                                // uns 5 por segundo, ritmo seguro do Resend

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Troca {{nome}} e {{marca}}. No HTML, o valor é protegido para não quebrar o e-mail.
const protegerHtml = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
function personalizar(texto: string, nome: string, marca: string, html: boolean) {
  const f = html ? protegerHtml : (t: string) => t;
  return texto.replace(/\{\{\s*nome\s*\}\}/gi, f(nome)).replace(/\{\{\s*marca\s*\}\}/gi, f(marca));
}

type Destinatario = { email: string; nome?: string; marca?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ erro: "Use POST." }, 405);

  // 1. Só aceita você, logada.
  const autorizacao = req.headers.get("Authorization") || "";
  let chavePublica = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!chavePublica) {
    try { const k = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}"); chavePublica = String(Object.values(k)[0] || ""); } catch { /* segue vazio */ }
  }
  const banco = createClient(Deno.env.get("SUPABASE_URL")!, chavePublica, {
    global: { headers: { Authorization: autorizacao } },
  });
  const { data: quem } = await banco.auth.getUser(autorizacao.replace(/^Bearer\s+/i, ""));
  if (!quem?.user || (quem.user.email || "").toLowerCase() !== DONA) {
    return responder({ erro: "Sem permissão. Entre no painel com o seu e-mail." }, 401);
  }

  const chave = Deno.env.get("RESEND_API_KEY");
  if (!chave) return responder({ erro: "Falta a chave do Resend. Cole a RESEND_API_KEY nos segredos da função, no painel do Supabase." }, 500);
  const remetente = Deno.env.get("EMAIL_FROM") || "Mariana Lino <onboarding@resend.dev>";

  // 2. Lê o pedido.
  let pedido: { destinatarios?: Destinatario[]; assunto?: string; html?: string; via?: string };
  try { pedido = await req.json(); } catch { return responder({ erro: "Pedido inválido." }, 400); }
  const assunto = String(pedido.assunto || "").trim();
  const html = String(pedido.html || "");
  const via = pedido.via === "teste" ? "teste" : "resend";
  const lista = Array.isArray(pedido.destinatarios) ? pedido.destinatarios : [];
  if (!assunto || !html) return responder({ erro: "Faltou o assunto ou o texto." }, 400);
  if (!lista.length) return responder({ erro: "A lista está vazia." }, 400);

  // 3. No máximo 250 por chamada.
  if (lista.length > MAXIMO_POR_CHAMADA) return responder({ erro: `No máximo ${MAXIMO_POR_CHAMADA} e-mails por vez.` }, 400);

  // 5. Quem pediu SAIR não recebe.
  const { data: saiu } = await banco.from("email_optout").select("email");
  const descadastrados = new Set((saiu || []).map((l: { email: string }) => String(l.email).toLowerCase()));

  let enviados = 0, falhas = 0, pulados = 0, cotaAcabou = false;
  const resultados: { email: string; status: string; erro?: string }[] = [];
  const jaFoi = new Set<string>();

  for (let i = 0; i < lista.length; i++) {
    const d = lista[i];
    const email = String(d.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) { pulados++; resultados.push({ email, status: "pulado", erro: "e-mail inválido" }); continue; }
    if (jaFoi.has(email)) { pulados++; resultados.push({ email, status: "pulado", erro: "repetido" }); continue; }
    jaFoi.add(email);
    if (descadastrados.has(email)) { pulados++; resultados.push({ email, status: "pulado", erro: "descadastrado" }); continue; }

    // 4. Troca {{nome}} e {{marca}}.
    const marca = String(d.marca || "").trim();
    const nome = String(d.nome || "").trim() || marca;
    const corpo = personalizar(html, nome, marca, true);
    const titulo = personalizar(assunto, nome, marca, false);

    // 7 e 8. Resposta cai no seu e-mail, e o cabeçalho de descadastro vai junto.
    const envio = {
      from: remetente,
      to: [email],
      subject: titulo,
      html: corpo,
      reply_to: RESPONDER_PARA,
      headers: { "List-Unsubscribe": `<mailto:${RESPONDER_PARA}?subject=SAIR>` },
    };

    let resposta: Response | null = null, json: any = null;
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try {
        resposta = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
          body: JSON.stringify(envio),
        });
        json = await resposta.json().catch(() => ({}));
      } catch (e) { resposta = null; json = { message: String(e) }; }
      // Passou do ritmo: espera um segundo e tenta mais uma vez.
      if (resposta && resposta.status === 429 && json?.name === "rate_limit_exceeded" && tentativa === 0) { await esperar(1000); continue; }
      break;
    }

    // 10. A cota do dia acabou: para na hora.
    if (json?.name === "daily_quota_exceeded") {
      cotaAcabou = true;
      break;
    }

    const deuCerto = !!resposta && resposta.ok && json?.id;
    const motivo = deuCerto ? null : String(json?.message || json?.name || (resposta ? `erro ${resposta.status}` : "sem conexão com o Resend"));
    if (deuCerto) enviados++; else falhas++;
    resultados.push({ email, status: deuCerto ? "ok" : "erro", erro: motivo || undefined });

    // 9. Uma linha por destinatário no registro. O assunto fica do jeito que você
    // escreveu (com as chaves), para a caixinha "pular quem já recebeu" reconhecer.
    await banco.from("email_envios").insert({
      email, marca: marca || null, assunto, status: deuCerto ? "ok" : "erro",
      erro: motivo, resend_id: deuCerto ? json.id : null, via,
    });

    // 6. Respira entre um envio e outro.
    if (i < lista.length - 1) await esperar(ESPERA_MS);
  }

  // 11. O resumo.
  const faltando = cotaAcabou ? lista.length - resultados.length : 0;
  return responder({ enviados, falhas, pulados, cota_acabou: cotaAcabou, faltando, resultados });
});
