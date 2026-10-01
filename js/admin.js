/* =====================================================================
   PAINEL DA MARIANA LINO
   Tudo o que o painel faz fica aqui, separado por aba.
   Regras que valem para o arquivo inteiro:
   - Nada aparece antes de conferir o login.
   - Se faltar uma tabela ou um campo, o painel avisa e continua funcionando.
   - Nenhuma conta divide por zero: sem dados, aparece uma frase explicando.
   ===================================================================== */
(async function () {
  "use strict";
  const banco = window.banco;

  /* ---------- 1. CONFERIR O LOGIN ANTES DE QUALQUER COISA ---------- */
  const irProLogin = () => location.replace("../login/");
  if (!banco) { irProLogin(); return; }
  let sessao = null;
  try {
    const { data } = await banco.auth.getSession();
    sessao = data && data.session;
  } catch (e) { sessao = null; }
  if (!sessao) { irProLogin(); return; }
  banco.auth.onAuthStateChange((evento, s) => { if (evento === "SIGNED_OUT" || !s) irProLogin(); });
  document.documentElement.classList.remove("verificando");
  /* Marca este navegador como seu: o site para de contar as suas visitas e cliques */
  try { localStorage.setItem("nao-contar-visitas", "1"); } catch (e) {}

  /* ---------- 2. AJUDANTES ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icone = (id, cls = "ic") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const dinheiro = (n) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);
  const numero = (n) => new Intl.NumberFormat("pt-BR").format(Number(n) || 0);
  const pad = (n) => String(n).padStart(2, "0");
  const chaveDia = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const deChave = (s) => { if (!s) return null; const [a, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(a, m - 1, d); };
  const hojeData = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const dataBr = (s) => { const d = deChave(s); return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : ""; };
  const diasAte = (s) => { const d = deChave(s); return d ? Math.round((d - hojeData()) / 86400000) : null; };
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  $("#usuario-email").textContent = sessao.user.email || "";

  /* Aviso rápido no pé da tela */
  let timerToast = null;
  function toast(texto, erro = false) {
    let el = $(".toast");
    if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = texto; el.classList.toggle("erro", erro); el.hidden = false;
    clearTimeout(timerToast); timerToast = setTimeout(() => { el.hidden = true; }, 2600);
  }

  /* Avisos no topo, quando falta tabela ou campo */
  const jaAvisado = new Set();
  function avisar(chave, texto) {
    if (jaAvisado.has(chave)) return;
    jaAvisado.add(chave);
    const li = document.createElement("li"); li.textContent = texto; $("#avisos").appendChild(li);
  }
  const FALTA_CODIGOS = ["42P01", "PGRST205", "PGRST204", "42703", "PGRST200", "PGRST116"];
  function tratarErro(tabela, erro) {
    const cod = erro && erro.code;
    const msg = (erro && erro.message) || "";
    if (FALTA_CODIGOS.includes(cod) || /does not exist|schema cache|column|relation/i.test(msg)) {
      avisar("falta-" + tabela, `Falta a tabela "${tabela}" (ou algum campo dela) no banco. Rode o arquivo banco.sql no Supabase. O resto do painel continua funcionando.`);
    } else if (/JWT|auth|permission|policy/i.test(msg)) {
      avisar("perm-" + tabela, `Sem permissão para "${tabela}". Confira se você entrou com o e-mail do painel.`);
    } else {
      avisar("erro-" + tabela, `Não consegui carregar "${tabela}" agora. Recarregue a página em instantes.`);
    }
  }

  /* Ler uma tabela sem nunca travar o painel */
  async function ler(tabela, montar) {
    try {
      let consulta = banco.from(tabela).select("*");
      if (montar) consulta = montar(consulta);
      const { data, error } = await consulta;
      if (error) { tratarErro(tabela, error); return { dados: [], ok: false }; }
      return { dados: data || [], ok: true };
    } catch (e) { tratarErro(tabela, e); return { dados: [], ok: false }; }
  }

  /* Gravar (criar, editar, apagar) e avisar se deu errado */
  async function gravar(tabela, acao, mensagemOk) {
    try {
      const { error } = await acao(banco.from(tabela));
      if (error) {
        tratarErro(tabela, error);
        toast(/check|violates/i.test(error.message || "") ? "Algum campo tem um valor que o banco não aceita." : "Não consegui salvar. Tente de novo.", true);
        return false;
      }
      if (mensagemOk) toast(mensagemOk);
      return true;
    } catch (e) { toast("Não consegui salvar. Confira a internet.", true); return false; }
  }

  /* Baixar CSV que abre certinho no Excel (com acento e ponto e vírgula) */
  function baixarCsv(nomeArquivo, colunas, linhas) {
    const celula = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const texto = [colunas.map((c) => celula(c.rotulo)).join(";")]
      .concat(linhas.map((l) => colunas.map((c) => celula(c.valor(l))).join(";")))
      .join("\r\n");
    const blob = new Blob(["﻿" + texto], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${nomeArquivo}-${chaveDia(new Date())}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- 3. JANELA DE FORMULÁRIO (serve para todas as abas) ---------- */
  const modal = $("#modal");
  $("#modal-fechar").addEventListener("click", () => modal.close());
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.close(); });

  function abrirJanela(titulo, html) {
    $("#modal-titulo").textContent = titulo;
    $("#modal-corpo").innerHTML = html;
    if (!modal.open) modal.showModal();
  }

  /* campos: [{ nome, rotulo, tipo, opcoes, obrigatorio, inteiro, lista, ajuda }] */
  function abrirFormulario({ titulo, campos, valores = {}, aoSalvar, aoApagar }) {
    const idLista = (n) => `lista-${n}`;
    const html = `<form id="form-modal" class="form-grade" novalidate>
      ${campos.map((c) => {
        const v = valores[c.nome];
        const id = `f-${c.nome}`;
        const obrig = c.obrigatorio ? " required" : "";
        const classe = c.inteiro || c.tipo === "textarea" ? "inteiro" : "";
        if (c.tipo === "checkbox") {
          return `<div class="${classe}"><label class="check"><input type="checkbox" id="${id}" name="${c.nome}" ${v ? "checked" : ""}> ${esc(c.rotulo)}</label></div>`;
        }
        let campo;
        if (c.tipo === "select") {
          campo = `<select id="${id}" name="${c.nome}"${obrig}>${c.opcoes.map((o) => {
            const [val, txt] = Array.isArray(o) ? o : [o, o];
            return `<option value="${esc(val)}" ${String(v ?? "") === String(val) ? "selected" : ""}>${esc(txt)}</option>`;
          }).join("")}</select>`;
        } else if (c.tipo === "textarea") {
          campo = `<textarea id="${id}" name="${c.nome}"${obrig}>${esc(v ?? "")}</textarea>`;
        } else {
          const lista = c.lista ? ` list="${idLista(c.nome)}"` : "";
          const passo = c.tipo === "number" ? ` step="${c.passo || "1"}" min="0"` : "";
          campo = `<input id="${id}" name="${c.nome}" type="${c.tipo || "text"}" value="${esc(v ?? "")}"${obrig}${lista}${passo}>` +
            (c.lista ? `<datalist id="${idLista(c.nome)}">${c.lista.map((o) => `<option value="${esc(o)}">`).join("")}</datalist>` : "");
        }
        return `<div class="${classe}"><label for="${id}">${esc(c.rotulo)}${c.obrigatorio ? " *" : ""}</label>${campo}${c.ajuda ? `<small class="suave">${esc(c.ajuda)}</small>` : ""}</div>`;
      }).join("")}
      <div class="modal-acoes inteiro">
        ${aoApagar ? `<button type="button" class="btn perigo" id="btn-apagar">${icone("lixo")}Apagar</button>` : ""}
        <button type="button" class="btn claro" id="btn-cancelar">Cancelar</button>
        <button type="submit" class="btn">Salvar</button>
      </div>
    </form>`;
    abrirJanela(titulo, html);
    const form = $("#form-modal");
    $("#btn-cancelar").addEventListener("click", () => modal.close());
    if (aoApagar) $("#btn-apagar").addEventListener("click", async () => {
      if (!confirm("Apagar isto? Não dá para desfazer.")) return;
      if (await aoApagar()) modal.close();
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const dados = {};
      for (const c of campos) {
        const el = form.elements[c.nome];
        if (c.tipo === "checkbox") { dados[c.nome] = el.checked; continue; }
        let v = (el.value || "").trim();
        if (c.obrigatorio && !v) { el.focus(); toast(`Preencha: ${c.rotulo}`, true); return; }
        if (c.tipo === "number") v = v === "" ? 0 : Number(String(v).replace(",", "."));
        else if (v === "") v = null;
        dados[c.nome] = v;
      }
      const botao = form.querySelector('button[type="submit"]');
      botao.disabled = true;
      const ok = await aoSalvar(dados);
      botao.disabled = false;
      if (ok) modal.close();
    });
    const primeiro = form.querySelector("input:not([type=checkbox]),select,textarea");
    if (primeiro) setTimeout(() => primeiro.focus(), 50);
  }

  /* ---------- 4. NAVEGAÇÃO ENTRE ABAS ---------- */
  const TITULOS = { portfolio: "Portfólio", marcas: "Marcas", tarefas: "Tarefas", calendario: "Calendário", campanhas: "Campanhas", checklist: "Checklist do portfólio", financeiro: "Financeiro" };
  const RENDER = {};
  let abaAtual = null;

  async function abrirAba(aba) {
    if (!TITULOS[aba]) aba = "portfolio";
    abaAtual = aba;
    $$(".menu-item").forEach((b) => { if (b.dataset.aba === aba) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    $$("[data-painel]").forEach((s) => { s.hidden = s.dataset.painel !== aba; });
    $("#titulo-aba").textContent = TITULOS[aba];
    document.title = `${TITULOS[aba]} | Painel`;
    if (location.hash !== "#" + aba) history.replaceState(null, "", "#" + aba);
    fecharGaveta();
    try { await RENDER[aba](); }
    catch (e) {
      console.error(e);
      $(`#aba-${aba}`).innerHTML = `<p class="vazio">Algo deu errado nesta aba. As outras continuam funcionando. Recarregue a página para tentar de novo.</p>`;
    }
  }
  $$(".menu-item").forEach((b) => b.addEventListener("click", () => abrirAba(b.dataset.aba)));

  /* Gaveta do celular */
  const lateral = $("#lateral"), fundoGaveta = $("#fundo-gaveta"), btnGaveta = $("#btn-gaveta");
  function fecharGaveta() { lateral.classList.remove("aberta"); fundoGaveta.classList.remove("aberta"); btnGaveta.setAttribute("aria-expanded", "false"); }
  btnGaveta.addEventListener("click", () => { lateral.classList.add("aberta"); fundoGaveta.classList.add("aberta"); btnGaveta.setAttribute("aria-expanded", "true"); });
  fundoGaveta.addEventListener("click", fecharGaveta);

  $("#btn-sair").addEventListener("click", async () => { await banco.auth.signOut(); irProLogin(); });

  /* =====================================================================
     ABA 1. PORTFÓLIO: métricas de visita + tabela de vídeos
     ===================================================================== */
  const NICHOS_PADRAO = ["Moda e acessórios", "Skincare", "Maternidade", "Beleza", "Casa e decoração", "Cuidados pessoais", "Alimentação e fitness", "Finanças", "Sites e apps"];
  const FORMATOS = ["Vídeo UGC", "Unboxing", "Corte para anúncio", "Fotos do produto", "Publicação no meu perfil"];
  let videos = [];

  RENDER.portfolio = async function () {
    const el = $("#aba-portfolio");
    el.innerHTML = `<p class="vazio">Carregando...</p>`;
    const inicio = hojeData(); inicio.setDate(inicio.getDate() - 13);
    const [vis, vids, cli] = await Promise.all([
      ler("visitas", (q) => q.select("data,origem").gte("data", inicio.toISOString()).limit(20000)),
      ler("videos", (q) => q.order("ordem", { ascending: true }).order("id", { ascending: true })),
      ler("cliques", (q) => q.select("data,video").gte("data", inicio.toISOString()).limit(20000))
    ]);
    videos = vids.dados;
    const visitas = vis.dados;

    /* Vídeos mais assistidos: cliques dos últimos 14 dias, ligados ao vídeo pelo código do YouTube */
    const codigoYT = (url) => { const m = String(url || "").match(/(?:shorts\/|youtu\.be\/|v=|embed\/)([\w-]{11})/); return m ? m[1] : null; };
    const porCodigo = {};
    videos.forEach((v) => { const c = codigoYT(v.link); if (c && !porCodigo[c]) porCodigo[c] = v; });
    const contaCliques = {};
    cli.dados.forEach((c) => { if (c.video) contaCliques[c.video] = (contaCliques[c.video] || 0) + 1; });
    const totalCliques = cli.dados.length;
    const ranking = Object.entries(contaCliques).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const maxClique = ranking.length ? ranking[0][1] : 1;

    /* Visitas por dia, nos últimos 14 dias */
    const dias = [];
    for (let i = 0; i < 14; i++) { const d = new Date(inicio); d.setDate(inicio.getDate() + i); dias.push({ chave: chaveDia(d), data: d, qtd: 0 }); }
    const porChave = Object.fromEntries(dias.map((d) => [d.chave, d]));
    const origens = {};
    visitas.forEach((v) => {
      const d = new Date(v.data); const k = chaveDia(d);
      if (porChave[k]) porChave[k].qtd++;
      const o = (v.origem || "Direto").trim() || "Direto";
      origens[o] = (origens[o] || 0) + 1;
    });
    const total14 = visitas.length;
    const hoje = porChave[chaveDia(hojeData())] ? porChave[chaveDia(hojeData())].qtd : 0;
    const noAr = videos.filter((v) => v.visivel).length;
    const contaNicho = {};
    videos.filter((v) => v.visivel && v.nicho).forEach((v) => { contaNicho[v.nicho] = (contaNicho[v.nicho] || 0) + 1; });
    const nichoForte = Object.entries(contaNicho).sort((a, b) => b[1] - a[1])[0];
    const listaOrigens = Object.entries(origens).sort((a, b) => b[1] - a[1]);
    const maxDia = Math.max(1, ...dias.map((d) => d.qtd));

    el.innerHTML = `
      <div class="faixa-numeros bloco">
        <div><span>Visitas em 14 dias</span><strong>${numero(total14)}</strong></div>
        <div><span>Visitas hoje</span><strong>${numero(hoje)}</strong></div>
        <div><span>Vídeos no ar</span><strong>${numero(noAr)}</strong></div>
        <div><span>Nicho mais forte</span><strong>${nichoForte ? esc(nichoForte[0]) : "Sem vídeos ainda"}</strong>${nichoForte ? `<small>${plural(nichoForte[1], "vídeo", "vídeos")}</small>` : ""}</div>
        <div><span>De onde mais vêm</span><strong>${listaOrigens.length ? esc(listaOrigens[0][0]) : "Ainda sem visitas"}</strong></div>
      </div>
      <div class="grade-2 bloco">
        <div class="cartao">
          <div class="bloco-titulo"><h2>Visitas nos últimos 14 dias</h2></div>
          ${total14 === 0
            ? `<p class="vazio">Quando as pessoas começarem a visitar o seu portfólio, aqui aparece um gráfico com as visitas de cada dia dos últimos 14 dias.</p>`
            : `<div class="grafico" role="img" aria-label="Gráfico de visitas por dia">${dias.map((d, i) => `
                <div class="barra${i === 13 ? " hoje" : ""}" title="${pad(d.data.getDate())}/${pad(d.data.getMonth() + 1)}: ${plural(d.qtd, "visita", "visitas")}">
                  <i style="height:${(d.qtd / maxDia) * 100}%">${d.qtd ? `<b>${d.qtd}</b>` : ""}</i>
                  <span>${pad(d.data.getDate())}/${pad(d.data.getMonth() + 1)}</span>
                </div>`).join("")}</div>`}
        </div>
        <div class="cartao">
          <div class="bloco-titulo"><h2>Por onde chegaram</h2></div>
          ${listaOrigens.length === 0
            ? `<p class="vazio">Aqui vai aparecer de onde vêm as visitas: Instagram, TikTok, WhatsApp, Google ou link direto.</p>`
            : `<ul class="origens">${listaOrigens.slice(0, 8).map(([o, n]) => `
                <li><span>${esc(o)}</span><strong>${numero(n)}</strong><span class="trilho"><i style="width:${(n / total14) * 100}%"></i></span></li>`).join("")}</ul>`}
        </div>
      </div>
      <div class="bloco">
        <div class="cartao">
          <div class="bloco-titulo"><h2>Vídeos mais assistidos</h2><span class="suave">${totalCliques ? `${plural(totalCliques, "vídeo aberto", "vídeos abertos")} em 14 dias` : "últimos 14 dias"}</span></div>
          ${ranking.length === 0
            ? `<p class="vazio">Quando alguém clicar num vídeo do seu portfólio para assistir, ele aparece aqui. O vídeo mais aberto fica em primeiro.</p>`
            : `<ul class="origens">${ranking.map(([c, n], i) => {
                const v = porCodigo[c];
                const nome = v ? (v.titulo || v.marca || "Vídeo") : "Vídeo que não está mais na lista";
                const extra = v && v.nicho ? ` <span class="suave">· ${esc(v.nicho)}</span>` : "";
                return `
                <li><span>${i + 1}. ${v ? `<a href="${esc(v.link)}" target="_blank" rel="noopener">${esc(nome)}</a>` : esc(nome)}${extra}</span><strong>${plural(n, "clique", "cliques")}</strong><span class="trilho"><i style="width:${(n / maxClique) * 100}%"></i></span></li>`;
              }).join("")}</ul>`}
        </div>
      </div>
      <div class="bloco">
        <div class="bloco-titulo"><h2>Meus vídeos</h2>
          <div class="ferramentas"><span class="suave">Arraste pela alça para mudar a ordem no site</span>
            <button class="btn" id="btn-novo-video">${icone("mais")}Adicionar vídeo</button></div>
        </div>
        <div class="tabela-caixa"><table>
          <thead><tr><th aria-label="Ordem"></th><th>Título</th><th>Marca</th><th>Nicho</th><th>Formato</th><th>Destaque</th><th aria-label="Ações"></th></tr></thead>
          <tbody id="tabela-videos"></tbody>
        </table></div>
      </div>`;
    desenharVideos();
    $("#btn-novo-video").addEventListener("click", () => formVideo());
  };

  function desenharVideos() {
    const corpo = $("#tabela-videos");
    if (!corpo) return;
    if (!videos.length) { corpo.innerHTML = `<tr><td colspan="7"><p class="vazio">Nenhum vídeo ainda. Clique em "Adicionar vídeo" para colocar o primeiro no site.</p></td></tr>`; return; }
    corpo.innerHTML = videos.map((v) => `
      <tr data-id="${v.id}" class="${v.visivel ? "" : "escondido"}">
        <td class="alca" title="Arraste para mudar a ordem">${icone("alca")}</td>
        <td><strong>${esc(v.titulo)}</strong>${v.exemplo ? `<span class="exemplo-tag">exemplo</span>` : ""}<br><a class="suave" href="${esc(v.link)}" target="_blank" rel="noopener">abrir vídeo</a></td>
        <td>${esc(v.marca)}</td>
        <td>${esc(v.nicho)}</td>
        <td>${esc(v.formato)}</td>
        <td>${esc(v.destaque)}</td>
        <td class="acoes" style="white-space:nowrap">
          <button class="icone-btn ${v.visivel ? "ligado" : ""}" data-acao="olho" title="${v.visivel ? "Aparece no site. Clique para esconder" : "Escondido. Clique para mostrar no site"}" aria-label="${v.visivel ? "Esconder do site" : "Mostrar no site"}">${icone(v.visivel ? "olho" : "olho-fechado")}</button>
          <button class="icone-btn" data-acao="editar" aria-label="Editar">${icone("lapis")}</button>
          <button class="icone-btn" data-acao="apagar" aria-label="Apagar">${icone("lixo")}</button>
        </td>
      </tr>`).join("");

    corpo.onclick = async (e) => {
      const btn = e.target.closest("button[data-acao]"); if (!btn) return;
      const id = Number(btn.closest("tr").dataset.id);
      const v = videos.find((x) => x.id === id); if (!v) return;
      if (btn.dataset.acao === "editar") formVideo(v);
      if (btn.dataset.acao === "apagar") {
        if (!confirm(`Apagar o vídeo "${v.titulo}"? Não dá para desfazer.`)) return;
        if (await gravar("videos", (t) => t.delete().eq("id", id), "Vídeo apagado")) { videos = videos.filter((x) => x.id !== id); desenharVideos(); }
      }
      if (btn.dataset.acao === "olho") {
        const novo = !v.visivel;
        if (await gravar("videos", (t) => t.update({ visivel: novo }).eq("id", id), novo ? "Agora aparece no site" : "Escondido do site")) { v.visivel = novo; desenharVideos(); }
      }
    };
    ligarArrastar(corpo);
  }

  /* Arrastar pela alça para reordenar */
  function ligarArrastar(corpo) {
    let arrastada = null;
    $$("tr", corpo).forEach((tr) => {
      const alca = tr.querySelector(".alca");
      alca.addEventListener("mousedown", () => { tr.draggable = true; });
      alca.addEventListener("touchstart", () => { tr.draggable = true; }, { passive: true });
      tr.addEventListener("dragstart", (e) => { arrastada = tr; tr.classList.add("arrastando"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", tr.dataset.id); });
      tr.addEventListener("dragend", () => { tr.draggable = false; tr.classList.remove("arrastando"); $$("tr", corpo).forEach((t) => t.classList.remove("alvo-acima", "alvo-abaixo")); });
      tr.addEventListener("dragover", (e) => {
        if (!arrastada || arrastada === tr) return;
        e.preventDefault();
        const r = tr.getBoundingClientRect(); const acima = e.clientY < r.top + r.height / 2;
        tr.classList.toggle("alvo-acima", acima); tr.classList.toggle("alvo-abaixo", !acima);
      });
      tr.addEventListener("dragleave", () => tr.classList.remove("alvo-acima", "alvo-abaixo"));
      tr.addEventListener("drop", async (e) => {
        e.preventDefault();
        if (!arrastada || arrastada === tr) return;
        const r = tr.getBoundingClientRect(); const acima = e.clientY < r.top + r.height / 2;
        corpo.insertBefore(arrastada, acima ? tr : tr.nextSibling);
        const ids = $$("tr", corpo).map((t) => Number(t.dataset.id));
        const mudancas = [];
        ids.forEach((id, i) => { const v = videos.find((x) => x.id === id); const nova = (i + 1) * 10; if (v && v.ordem !== nova) { v.ordem = nova; mudancas.push({ id, ordem: nova }); } });
        videos.sort((a, b) => a.ordem - b.ordem);
        if (!mudancas.length) return;
        const res = await Promise.all(mudancas.map((m) => gravar("videos", (t) => t.update({ ordem: m.ordem }).eq("id", m.id))));
        toast(res.every(Boolean) ? "Ordem salva. O site já mostra assim." : "Parte da ordem não salvou. Recarregue e tente de novo.", !res.every(Boolean));
      });
    });
  }

  function formVideo(v) {
    const nichos = [...new Set(NICHOS_PADRAO.concat(videos.map((x) => x.nicho).filter(Boolean)))];
    abrirFormulario({
      titulo: v ? "Editar vídeo" : "Novo vídeo",
      valores: v || { formato: "Vídeo UGC", visivel: true },
      campos: [
        { nome: "titulo", rotulo: "Título", obrigatorio: true, inteiro: true, ajuda: "Aparece embaixo do vídeo no site. Pode ser o nome da marca." },
        { nome: "link", rotulo: "Link do vídeo", tipo: "url", obrigatorio: true, inteiro: true, ajuda: "Link do YouTube Shorts. Ex: https://youtube.com/shorts/..." },
        { nome: "marca", rotulo: "Marca" },
        { nome: "nicho", rotulo: "Nicho", lista: nichos, ajuda: "Escolha da lista ou escreva um novo." },
        { nome: "formato", rotulo: "Formato", lista: FORMATOS },
        { nome: "destaque", rotulo: "Destaque", ajuda: "Ex: 2,4M views. Aparece como selo no vídeo." },
        { nome: "capa", rotulo: "Capa do YouTube", tipo: "select", opcoes: [["", "Padrão"], ["oar1", "Opção 1 do Studio"], ["oar2", "Opção 2 do Studio"], ["oar3", "Opção 3 do Studio"]] },
        { nome: "visivel", rotulo: "Mostrar no site", tipo: "checkbox" }
      ],
      aoSalvar: async (d) => {
        if (v) {
          const ok = await gravar("videos", (t) => t.update(d).eq("id", v.id), "Vídeo salvo. O site já mudou.");
          if (ok) Object.assign(v, d), desenharVideos();
          return ok;
        }
        d.ordem = (videos.reduce((m, x) => Math.max(m, x.ordem || 0), 0)) + 10;
        const ok = await gravar("videos", (t) => t.insert(d), "Vídeo adicionado. Já aparece no site.");
        if (ok) await RENDER.portfolio();
        return ok;
      },
      aoApagar: v ? async () => {
        const ok = await gravar("videos", (t) => t.delete().eq("id", v.id), "Vídeo apagado");
        if (ok) { videos = videos.filter((x) => x.id !== v.id); desenharVideos(); }
        return ok;
      } : null
    });
  }

  /* =====================================================================
     ABA 2. MARCAS: a base de contatos
     ===================================================================== */
  const SITUACOES = [["lead", "Lead"], ["conversando", "Conversando"], ["cliente", "Cliente"], ["parada", "Parada"]];
  const nomeSituacao = (s) => (SITUACOES.find((x) => x[0] === s) || [s, s || ""])[1];
  let marcas = [], buscaMarcas = "", filtroMarcas = "todas";

  const linkInstagram = (ig) => { const h = String(ig || "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, ""); return h ? `https://instagram.com/${encodeURIComponent(h)}` : null; };
  const linkWhats = (tel) => { let n = String(tel || "").replace(/\D/g, ""); if (!n) return null; if (n.length === 10 || n.length === 11) n = "55" + n; return `https://wa.me/${n}`; };

  RENDER.marcas = async function () {
    const el = $("#aba-marcas");
    el.innerHTML = `
      <div class="bloco-titulo">
        <div class="ferramentas">
          <input class="busca" id="busca-marcas" type="search" placeholder="Buscar por nome, @ ou e-mail" value="${esc(buscaMarcas)}" aria-label="Buscar marcas">
          <select class="select" id="filtro-marcas" aria-label="Filtrar por situação">
            <option value="todas">Todas as situações</option>
            ${SITUACOES.map(([v, t]) => `<option value="${v}" ${filtroMarcas === v ? "selected" : ""}>${t}</option>`).join("")}
          </select>
          <span class="suave" id="conta-marcas"></span>
        </div>
        <div class="ferramentas">
          <button class="btn claro" id="btn-csv-marcas">${icone("baixar")}Baixar CSV</button>
          <button class="btn" id="btn-nova-marca">${icone("mais")}Adicionar marca</button>
        </div>
      </div>
      <div class="tabela-caixa"><table>
        <thead><tr><th>Marca</th><th>Instagram</th><th>E-mail</th><th>Telefone</th><th>Situação</th><th>Observação</th><th>Último contato</th></tr></thead>
        <tbody id="tabela-marcas"><tr><td colspan="7"><p class="vazio">Carregando...</p></td></tr></tbody>
      </table></div>`;
    $("#busca-marcas").addEventListener("input", (e) => { buscaMarcas = e.target.value; desenharMarcas(); });
    $("#filtro-marcas").addEventListener("change", (e) => { filtroMarcas = e.target.value; desenharMarcas(); });
    $("#btn-nova-marca").addEventListener("click", () => formMarca());
    $("#btn-csv-marcas").addEventListener("click", () => baixarCsv("marcas", [
      { rotulo: "Marca", valor: (m) => m.nome }, { rotulo: "Instagram", valor: (m) => m.instagram },
      { rotulo: "E-mail", valor: (m) => m.email }, { rotulo: "Telefone", valor: (m) => m.telefone },
      { rotulo: "Situação", valor: (m) => nomeSituacao(m.situacao) }, { rotulo: "Observação", valor: (m) => m.obs },
      { rotulo: "Último contato", valor: (m) => dataBr(m.ultimo_contato) }, { rotulo: "Origem", valor: (m) => (m.origem === "site" ? "Formulário do site" : "Painel") }
    ], marcasFiltradas()));
    const r = await ler("marcas", (q) => q.order("criado_em", { ascending: false }));
    marcas = r.dados;
    desenharMarcas();
  };

  function marcasFiltradas() {
    const b = buscaMarcas.trim().toLowerCase();
    return marcas.filter((m) => (filtroMarcas === "todas" || m.situacao === filtroMarcas) &&
      (!b || [m.nome, m.instagram, m.email].some((x) => String(x || "").toLowerCase().includes(b))));
  }

  function desenharMarcas() {
    const corpo = $("#tabela-marcas"); if (!corpo) return;
    const lista = marcasFiltradas();
    $("#conta-marcas").textContent = plural(lista.length, "marca", "marcas");
    if (!lista.length) { corpo.innerHTML = `<tr><td colspan="7"><p class="vazio">${marcas.length ? "Nenhuma marca com esse filtro." : "Sua base está vazia. As marcas que mandarem mensagem pelo site entram aqui sozinhas, como Lead."}</p></td></tr>`; return; }
    corpo.innerHTML = lista.map((m) => {
      const ig = linkInstagram(m.instagram), zap = linkWhats(m.telefone);
      return `<tr class="clicavel" data-id="${m.id}">
        <td><strong>${esc(m.nome)}</strong>${m.exemplo ? `<span class="exemplo-tag">exemplo</span>` : ""}${m.origem === "site" ? `<br><span class="suave">veio pelo site</span>` : ""}</td>
        <td>${ig ? `<a href="${ig}" target="_blank" rel="noopener">${esc(m.instagram)}</a>` : ""}</td>
        <td>${m.email ? `<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : ""}</td>
        <td style="white-space:nowrap">${esc(m.telefone)} ${zap ? `<a class="icone-btn" href="${zap}" target="_blank" rel="noopener" title="Abrir WhatsApp" aria-label="Abrir WhatsApp de ${esc(m.nome)}">${icone("zap")}</a>` : ""}</td>
        <td><span class="pilula s-${esc(m.situacao)}">${esc(nomeSituacao(m.situacao))}</span></td>
        <td><div class="truncar" title="${esc(m.obs)}">${esc(m.obs)}</div></td>
        <td style="white-space:nowrap">${dataBr(m.ultimo_contato)}</td>
      </tr>`;
    }).join("");
    corpo.onclick = (e) => {
      if (e.target.closest("a")) return;
      const tr = e.target.closest("tr[data-id]"); if (!tr) return;
      const m = marcas.find((x) => x.id === Number(tr.dataset.id)); if (m) formMarca(m);
    };
  }

  function formMarca(m) {
    abrirFormulario({
      titulo: m ? "Editar marca" : "Nova marca",
      valores: m || { situacao: "lead", ultimo_contato: chaveDia(new Date()) },
      campos: [
        { nome: "nome", rotulo: "Marca", obrigatorio: true, inteiro: true },
        { nome: "instagram", rotulo: "Instagram", ajuda: "Ex: @marca" },
        { nome: "email", rotulo: "E-mail", tipo: "email" },
        { nome: "telefone", rotulo: "Telefone", tipo: "tel", ajuda: "Com DDD, para abrir o WhatsApp" },
        { nome: "situacao", rotulo: "Situação", tipo: "select", opcoes: SITUACOES },
        { nome: "ultimo_contato", rotulo: "Último contato", tipo: "date" },
        { nome: "obs", rotulo: "Observação", tipo: "textarea" }
      ],
      aoSalvar: async (d) => {
        const ok = m ? await gravar("marcas", (t) => t.update(d).eq("id", m.id), "Marca salva")
                     : await gravar("marcas", (t) => t.insert(d), "Marca adicionada");
        if (ok) await RENDER.marcas();
        return ok;
      },
      aoApagar: m ? async () => { const ok = await gravar("marcas", (t) => t.delete().eq("id", m.id), "Marca apagada"); if (ok) await RENDER.marcas(); return ok; } : null
    });
  }

  /* =====================================================================
     ABA 3. CALENDÁRIO: visão do mês
     ===================================================================== */
  const TIPOS_CAL = [["gravar", "Gravar"], ["editar", "Editar"], ["postar", "Postar"]];
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  let mesCal = (() => { const d = hojeData(); d.setDate(1); return d; })();
  let filtroCal = "todos";
  let itensCal = [];

  RENDER.calendario = async function () {
    const el = $("#aba-calendario");
    const primeiro = new Date(mesCal);
    const inicio = new Date(primeiro); inicio.setDate(1 - ((primeiro.getDay() + 6) % 7)); /* volta até a segunda */
    const ultimo = new Date(primeiro.getFullYear(), primeiro.getMonth() + 1, 0);
    const fim = new Date(ultimo); fim.setDate(ultimo.getDate() + (6 - ((ultimo.getDay() + 6) % 7))); /* vai até o domingo */
    const hoje = chaveDia(hojeData());

    el.innerHTML = `
      <div class="cal-topo">
        <button class="icone-btn" id="cal-ant" aria-label="Mês anterior">${icone("seta-e")}</button>
        <span class="cal-mes" id="cal-mes">${MESES[primeiro.getMonth()]} ${primeiro.getFullYear()}</span>
        <button class="icone-btn" id="cal-prox" aria-label="Próximo mês">${icone("seta-d")}</button>
        <button class="btn claro" id="cal-hoje">Este mês</button>
        <span class="chips" role="group" aria-label="Filtrar por tipo">
          ${[["todos", "Tudo"]].concat(TIPOS_CAL, [["prazo", "Prazos"]]).map(([v, t]) => `<button type="button" data-filtro="${v}" aria-pressed="${filtroCal === v}">${t}</button>`).join("")}
        </span>
        <button class="btn" id="cal-novo" style="margin-left:auto">${icone("mais")}Adicionar</button>
      </div>
      <div class="cal-grade" id="cal-grade"><p class="vazio" style="grid-column:1/-1">Carregando...</p></div>
      <div class="cartao bloco" style="margin-top:16px">
        <div class="bloco-titulo"><h2>Ficou pra trás</h2></div>
        <ul class="atrasos" id="cal-atrasos"></ul>
      </div>`;
    $("#cal-ant").onclick = () => { mesCal = new Date(mesCal.getFullYear(), mesCal.getMonth() - 1, 1); RENDER.calendario(); };
    $("#cal-prox").onclick = () => { mesCal = new Date(mesCal.getFullYear(), mesCal.getMonth() + 1, 1); RENDER.calendario(); };
    $("#cal-hoje").onclick = () => { const d = hojeData(); d.setDate(1); mesCal = d; RENDER.calendario(); };
    $("#cal-novo").onclick = () => formCal(null, chaveDia(hojeData()));
    $$(".chips button", el).forEach((b) => b.onclick = () => { filtroCal = b.dataset.filtro; RENDER.calendario(); });

    const [cal, camp, atrasCal] = await Promise.all([
      ler("calendario", (q) => q.gte("data", chaveDia(inicio)).lte("data", chaveDia(fim)).order("data")),
      ler("campanhas", (q) => q.not("prazo", "is", null).order("prazo")),
      ler("calendario", (q) => q.lt("data", hoje).eq("status", "a fazer").order("data"))
    ]);
    /* Os prazos das campanhas entram sozinhos no calendário */
    const prazos = camp.dados.map((c) => ({ origem: "campanha", id: c.id, titulo: `Prazo: ${c.campanha}`, marca: c.cliente, tipo: "prazo", data: String(c.prazo).slice(0, 10), status: c.status === "Entregue" ? "feito" : "a fazer", campanha: c }));
    itensCal = cal.dados.map((i) => ({ ...i, origem: "calendario", data: String(i.data).slice(0, 10) })).concat(prazos);

    const visiveis = itensCal.filter((i) => filtroCal === "todos" || i.tipo === filtroCal);
    const porDia = {};
    visiveis.forEach((i) => { (porDia[i.data] = porDia[i.data] || []).push(i); });

    const celulas = [];
    ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].forEach((s) => celulas.push(`<div class="cal-sem">${s}</div>`));
    for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
      const k = chaveDia(d);
      const itens = porDia[k] || [];
      const fora = d.getMonth() !== primeiro.getMonth();
      celulas.push(`<div class="cal-dia${fora ? " fora" : ""}${k === hoje ? " hoje" : ""}" data-dia="${k}">
        <span class="cal-num">${d.getDate()}</span>
        <button class="cal-mais-btn" type="button" data-novo="${k}" aria-label="Adicionar em ${pad(d.getDate())}/${pad(d.getMonth() + 1)}">+</button>
        ${itens.slice(0, 3).map((i) => botaoItem(i)).join("")}
        ${itens.length > 3 ? `<button class="cal-outros" type="button" data-dia-lista="${k}">+${itens.length - 3} mais</button>` : ""}
      </div>`);
    }
    $("#cal-grade").innerHTML = celulas.join("");
    $("#cal-grade").onclick = (e) => {
      const item = e.target.closest("[data-item]");
      if (item) { e.stopPropagation(); abrirItemCal(item.dataset.item); return; }
      const lista = e.target.closest("[data-dia-lista]");
      if (lista) { abrirDia(lista.dataset.diaLista); return; }
      const novo = e.target.closest("[data-novo]");
      if (novo) { formCal(null, novo.dataset.novo); return; }
      const dia = e.target.closest("[data-dia]");
      if (dia) formCal(null, dia.dataset.dia);
    };

    /* Ficou pra trás: itens do calendário e prazos de campanha que passaram */
    const atrasos = atrasCal.dados.map((i) => ({ ...i, origem: "calendario", data: String(i.data).slice(0, 10) })).filter((i) => i.data < hoje && i.status !== "feito")
      .concat(prazos.filter((p) => p.data < hoje && p.status !== "feito" && p.campanha.ativa !== false))
      .sort((a, b) => a.data.localeCompare(b.data));
    $("#cal-atrasos").innerHTML = atrasos.length ? atrasos.map((i) => {
      const dias = -diasAte(i.data);
      return `<li><span class="pilula ti-${esc(i.tipo)}">${esc(i.tipo === "prazo" ? "Prazo" : nomeTipo(i.tipo))}</span>
        <strong>${esc(i.titulo)}</strong>${i.marca ? `<span class="suave">${esc(i.marca)}</span>` : ""}
        <span class="etiqueta et-atraso">há ${plural(dias, "dia", "dias")}</span>
        ${i.origem === "calendario" ? `<button class="btn claro" data-feito="${i.id}">Marcar como feito</button>` : `<button class="btn claro" data-ir-camp="${i.id}">Ver campanha</button>`}</li>`;
    }).join("") : `<li class="suave">Nada atrasado. Tudo em dia!</li>`;
    $("#cal-atrasos").onclick = async (e) => {
      const f = e.target.closest("[data-feito]");
      if (f && await gravar("calendario", (t) => t.update({ status: "feito" }).eq("id", Number(f.dataset.feito)), "Marcado como feito")) RENDER.calendario();
      const c = e.target.closest("[data-ir-camp]");
      if (c) abrirAba("campanhas");
    };
  };

  const nomeTipo = (t) => (TIPOS_CAL.find((x) => x[0] === t) || [t, t])[1];
  function botaoItem(i) {
    const chave = `${i.origem}:${i.id}`;
    return `<button type="button" class="cal-item ti-${esc(i.tipo)}${i.status === "feito" ? " feito" : ""}" data-item="${chave}" title="${esc(i.titulo)}${i.marca ? " · " + esc(i.marca) : ""}">${esc(i.titulo)}</button>`;
  }
  function abrirItemCal(chave) {
    const [origem, id] = chave.split(":");
    const item = itensCal.find((i) => i.origem === origem && String(i.id) === id);
    if (!item) return;
    if (origem === "campanha") { modal.open && modal.close(); formCampanha(item.campanha); return; }
    formCal(item);
  }
  function abrirDia(k) {
    const itens = itensCal.filter((i) => i.data === k && (filtroCal === "todos" || i.tipo === filtroCal));
    abrirJanela(`Dia ${dataBr(k)}`, `<div style="display:grid;gap:4px">${itens.map(botaoItem).join("")}</div>
      <div class="modal-acoes"><button class="btn" id="dia-novo">${icone("mais")}Adicionar neste dia</button></div>`);
    $("#modal-corpo").onclick = (e) => {
      const it = e.target.closest("[data-item]"); if (it) abrirItemCal(it.dataset.item);
      if (e.target.closest("#dia-novo")) formCal(null, k);
    };
  }
  function formCal(item, dataPadrao) {
    abrirFormulario({
      titulo: item ? "Editar no calendário" : "Adicionar no calendário",
      valores: item || { data: dataPadrao, tipo: filtroCal !== "todos" && filtroCal !== "prazo" ? filtroCal : "gravar", status: "a fazer" },
      campos: [
        { nome: "titulo", rotulo: "O que é", obrigatorio: true, inteiro: true },
        { nome: "marca", rotulo: "Marca" },
        { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: TIPOS_CAL },
        { nome: "data", rotulo: "Data", tipo: "date", obrigatorio: true },
        { nome: "status", rotulo: "Situação", tipo: "select", opcoes: [["a fazer", "A fazer"], ["feito", "Feito"]] }
      ],
      aoSalvar: async (d) => {
        const ok = item ? await gravar("calendario", (t) => t.update(d).eq("id", item.id), "Salvo no calendário")
                        : await gravar("calendario", (t) => t.insert(d), "Adicionado no calendário");
        if (ok) await RENDER.calendario();
        return ok;
      },
      aoApagar: item ? async () => { const ok = await gravar("calendario", (t) => t.delete().eq("id", item.id), "Apagado do calendário"); if (ok) await RENDER.calendario(); return ok; } : null
    });
  }

  /* =====================================================================
     ABA 4. CAMPANHAS
     ===================================================================== */
  const FUNIL = ["Briefing", "Roteiro", "Aprovação Roteiro", "Gravação", "Edição", "Aprovado", "Entregue"];
  let campanhas = [], filtroCamp = "todas", buscaCamp = "", ordemCamp = { col: "fechado_em", dir: -1 };
  const COLUNAS_CAMP = [
    { col: "favorita", rotulo: "", valor: (c) => (c.favorita ? 0 : 1) },
    { col: "campanha", rotulo: "Campanha", valor: (c) => (c.campanha || "").toLowerCase() },
    { col: "cliente", rotulo: "Cliente", valor: (c) => (c.cliente || "").toLowerCase() },
    { col: "tipo", rotulo: "Tipo", valor: (c) => c.tipo || "" },
    { col: "status", rotulo: "Status", valor: (c) => { const i = FUNIL.indexOf(c.status); return i < 0 ? 99 : i; } },
    { col: "qtd", rotulo: "Qtd", valor: (c) => Number(c.qtd) || 0 },
    { col: "valor", rotulo: "Valor", valor: (c) => Number(c.valor) || 0 },
    { col: "prazo", rotulo: "Prazo", valor: (c) => c.prazo || "9999-12-31" },
    { col: "pagamento", rotulo: "Pagamento", valor: (c) => (c.permuta ? 2 : c.pagamento === "pago" ? 1 : 0) },
    { col: "fechado_em", rotulo: "Fechada em", valor: (c) => c.fechado_em || "0000" }
  ];
  const mesAno = (s) => { const d = deChave(s); return d ? `${MESES[d.getMonth()].slice(0, 3)}/${d.getFullYear()}` : ""; };

  RENDER.campanhas = async function () {
    const el = $("#aba-campanhas");
    el.innerHTML = `<div id="camp-numeros" class="bloco"></div>
      <div class="bloco-titulo">
        <div class="ferramentas">
          <span class="chips" role="group" aria-label="Filtrar campanhas">
            ${[["todas", "Todas"], ["ativas", "Ativas"], ["finalizadas", "Finalizadas"]].map(([v, t]) => `<button type="button" data-f="${v}" aria-pressed="${filtroCamp === v}">${t}</button>`).join("")}
          </span>
          <input class="busca" id="busca-camp" type="search" placeholder="Buscar campanha ou cliente" value="${esc(buscaCamp)}" aria-label="Buscar campanhas">
        </div>
        <div class="ferramentas">
          <button class="btn claro" id="btn-csv-camp">${icone("baixar")}Baixar CSV</button>
          <button class="btn" id="btn-nova-camp">${icone("mais")}Nova campanha</button>
        </div>
      </div>
      <div class="tabela-caixa"><table>
        <thead><tr id="cab-camp"></tr></thead>
        <tbody id="tabela-camp"><tr><td colspan="10"><p class="vazio">Carregando...</p></td></tr></tbody>
      </table></div>`;
    $$("[data-f]", el).forEach((b) => b.onclick = () => { filtroCamp = b.dataset.f; $$("[data-f]", el).forEach((x) => x.setAttribute("aria-pressed", x === b)); desenharCampanhas(); });
    $("#busca-camp").addEventListener("input", (e) => { buscaCamp = e.target.value; desenharCampanhas(); });
    $("#btn-nova-camp").onclick = () => formCampanha();
    $("#btn-csv-camp").onclick = () => baixarCsv("campanhas", [
      { rotulo: "Favorita", valor: (c) => (c.favorita ? "sim" : "") }, { rotulo: "Campanha", valor: (c) => c.campanha },
      { rotulo: "Cliente", valor: (c) => c.cliente }, { rotulo: "Tipo", valor: (c) => c.tipo }, { rotulo: "Status", valor: (c) => c.status },
      { rotulo: "Qtd", valor: (c) => c.qtd }, { rotulo: "Valor", valor: (c) => String(Number(c.valor) || 0).replace(".", ",") },
      { rotulo: "Prazo", valor: (c) => dataBr(c.prazo) }, { rotulo: "Pagamento", valor: (c) => (c.pagamento === "pago" ? "Pago" : "Pendente") },
      { rotulo: "Ativa", valor: (c) => (c.ativa ? "sim" : "não") }, { rotulo: "Permuta", valor: (c) => (c.permuta ? "sim" : "") },
      { rotulo: "Fechada em", valor: (c) => dataBr(c.fechado_em) }
    ], campanhasFiltradas());
    const r = await ler("campanhas", (q) => q.order("criado_em", { ascending: false }));
    campanhas = r.dados;
    desenharCampanhas();
  };

  function campanhasFiltradas() {
    const b = buscaCamp.trim().toLowerCase();
    const col = COLUNAS_CAMP.find((c) => c.col === ordemCamp.col) || COLUNAS_CAMP[7];
    return campanhas
      .filter((c) => filtroCamp === "todas" || (filtroCamp === "ativas" ? c.ativa : !c.ativa))
      .filter((c) => !b || [c.campanha, c.cliente].some((x) => String(x || "").toLowerCase().includes(b)))
      .sort((a, x) => { const va = col.valor(a), vb = col.valor(x); return (va < vb ? -1 : va > vb ? 1 : 0) * ordemCamp.dir; });
  }

  function desenharCampanhas() {
    /* Números do topo (sempre sobre todas as campanhas) */
    const total = campanhas.length;
    const ativas = campanhas.filter((c) => c.ativa).length;
    const valorTotal = campanhas.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const qtdTotal = campanhas.reduce((s, c) => s + (Number(c.qtd) || 0), 0);
    const ticket = qtdTotal > 0 ? valorTotal / qtdTotal : 0;
    const aReceber = campanhas.filter((c) => c.pagamento !== "pago" && !c.permuta).reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const recebido = campanhas.filter((c) => c.pagamento === "pago").reduce((s, c) => s + (Number(c.valor) || 0), 0);
    $("#camp-numeros").innerHTML = `<div class="faixa-numeros">
      <div><span>Campanhas</span><strong>${numero(total)}</strong></div>
      <div><span>Ativas</span><strong>${numero(ativas)}</strong></div>
      <div><span>Valor total</span><strong>${dinheiro(valorTotal)}</strong><small>${qtdTotal > 0 ? `${dinheiro(ticket)} por vídeo` : "Ticket médio aparece quando houver vídeos"}</small></div>
      <div><span>A receber</span><strong>${dinheiro(aReceber)}</strong><small>${dinheiro(recebido)} já recebido</small></div>
    </div>`;

    /* Cabeçalho ordenável */
    $("#cab-camp").innerHTML = COLUNAS_CAMP.map((c) => {
      const ativa = ordemCamp.col === c.col;
      const seta = ativa ? (ordemCamp.dir === 1 ? "▲" : "▼") : "↕";
      return `<th class="ordenavel${ativa ? " ativa" : ""}" data-col="${c.col}" aria-sort="${ativa ? (ordemCamp.dir === 1 ? "ascending" : "descending") : "none"}">${c.col === "favorita" ? `<span class="sr-only">Favorita</span>★` : c.rotulo}<span class="seta" aria-hidden="true">${seta}</span></th>`;
    }).join("");
    $("#cab-camp").onclick = (e) => {
      const th = e.target.closest("th[data-col]"); if (!th) return;
      ordemCamp = ordemCamp.col === th.dataset.col ? { col: th.dataset.col, dir: -ordemCamp.dir } : { col: th.dataset.col, dir: 1 };
      desenharCampanhas();
    };

    const lista = campanhasFiltradas();
    const corpo = $("#tabela-camp");
    if (!lista.length) { corpo.innerHTML = `<tr><td colspan="10"><p class="vazio">${campanhas.length ? "Nenhuma campanha com esse filtro." : "Nenhuma campanha ainda. Clique em \"Nova campanha\" para começar."}</p></td></tr>`; return; }
    corpo.innerHTML = lista.map((c) => {
      const fi = FUNIL.indexOf(c.status);
      let aviso = "";
      if (c.prazo && c.status !== "Entregue") {
        const d = diasAte(c.prazo);
        if (d < 0) aviso = `<span class="etiqueta et-atraso">atrasada ${plural(-d, "dia", "dias")}</span>`;
        else if (d === 0) aviso = `<span class="etiqueta et-perto">vence hoje</span>`;
        else if (d <= 3) aviso = `<span class="etiqueta et-perto">vence em ${plural(d, "dia", "dias")}</span>`;
      }
      return `<tr class="clicavel${c.favorita ? " favorita" : ""}" data-id="${c.id}">
        <td><button class="estrela${c.favorita ? " ligada" : ""}" data-estrela aria-label="${c.favorita ? "Tirar destaque" : "Destacar campanha"}" aria-pressed="${!!c.favorita}">${icone("estrela")}</button></td>
        <td><strong>${esc(c.campanha)}</strong>${c.exemplo ? `<span class="exemplo-tag">exemplo</span>` : ""}${c.ativa ? "" : `<br><span class="suave">finalizada</span>`}</td>
        <td>${esc(c.cliente)}</td>
        <td><span class="pilula ${c.tipo === "Publicidade" ? "t-publicidade" : "t-conteudo"}">${esc(c.tipo)}</span></td>
        <td><span class="pilula f-${fi < 0 ? 0 : fi}">${esc(c.status)}</span></td>
        <td>${numero(c.qtd)}</td>
        <td style="white-space:nowrap">${c.permuta ? `<span class="pilula t-conteudo">Permuta</span>` : dinheiro(c.valor)}</td>
        <td style="white-space:nowrap">${c.prazo ? dataBr(c.prazo) : `<span class="suave">sem prazo</span>`}${aviso}</td>
        <td>${c.permuta ? `<span class="suave">não se aplica</span>` : `<span class="pilula ${c.pagamento === "pago" ? "p-pago" : "p-pendente"}">${c.pagamento === "pago" ? "Pago" : "Pendente"}</span>`}</td>
        <td style="white-space:nowrap">${c.fechado_em ? mesAno(c.fechado_em) : `<span class="suave">sem data</span>`}</td>
      </tr>`;
    }).join("");
    corpo.onclick = async (e) => {
      const tr = e.target.closest("tr[data-id]"); if (!tr) return;
      const c = campanhas.find((x) => x.id === Number(tr.dataset.id)); if (!c) return;
      if (e.target.closest("[data-estrela]")) {
        const novo = !c.favorita;
        if (await gravar("campanhas", (t) => t.update({ favorita: novo }).eq("id", c.id), novo ? "Campanha destacada" : "Destaque tirado")) { c.favorita = novo; desenharCampanhas(); }
        return;
      }
      formCampanha(c);
    };
  }

  function formCampanha(c) {
    abrirFormulario({
      titulo: c ? "Editar campanha" : "Nova campanha",
      valores: c || { tipo: "Conteúdo", status: "Briefing", qtd: 1, valor: 0, pagamento: "pendente", ativa: true, fechado_em: chaveDia(hojeData()) },
      campos: [
        { nome: "campanha", rotulo: "Campanha", obrigatorio: true, inteiro: true },
        { nome: "cliente", rotulo: "Cliente" },
        { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: ["Conteúdo", "Publicidade"] },
        { nome: "status", rotulo: "Status", tipo: "select", opcoes: FUNIL },
        { nome: "prazo", rotulo: "Prazo", tipo: "date" },
        { nome: "qtd", rotulo: "Quantidade de vídeos", tipo: "number" },
        { nome: "valor", rotulo: "Valor (R$)", tipo: "number", passo: "0.01" },
        { nome: "pagamento", rotulo: "Pagamento", tipo: "select", opcoes: [["pendente", "Pendente"], ["pago", "Pago"]] },
        { nome: "fechado_em", rotulo: "Fechada em", tipo: "date", ajuda: "O dia em que a marca fechou com você" },
        { nome: "permuta", rotulo: "É permuta (sem pagamento)", tipo: "checkbox" },
        { nome: "ativa", rotulo: "Campanha ativa", tipo: "checkbox" },
        { nome: "favorita", rotulo: "Destacar (estrela)", tipo: "checkbox" }
      ],
      aoSalvar: async (d) => {
        const ok = c ? await gravar("campanhas", (t) => t.update(d).eq("id", c.id), "Campanha salva")
                     : await gravar("campanhas", (t) => t.insert(d), "Campanha criada");
        if (ok) await (abaAtual === "calendario" ? RENDER.calendario() : RENDER.campanhas());
        return ok;
      },
      aoApagar: c ? async () => { const ok = await gravar("campanhas", (t) => t.delete().eq("id", c.id), "Campanha apagada"); if (ok) await (abaAtual === "calendario" ? RENDER.calendario() : RENDER.campanhas()); return ok; } : null
    });
  }

  /* =====================================================================
     ABA 6. FINANCEIRO: o que entrou na conta e o que falta receber
     ===================================================================== */
  const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const nomeMes = (i) => MESES[i].charAt(0).toUpperCase() + MESES[i].slice(1);
  const curto = (v) => (v >= 1000 ? `${(v / 1000).toFixed(1).replace(".", ",").replace(",0", "")}k` : String(Math.round(v)));
  let entradas = [], aReceberFin = [], anoFin = new Date().getFullYear();
  /* "Gocase · 2 meses em aberto" com cliente "Gocase" vira só "2 meses em aberto" */
  const detalheCampanha = (c) => {
    const nome = String(c.campanha || ""), cliente = String(c.cliente || "");
    if (!cliente || nome === cliente) return "";
    return nome.toLowerCase().startsWith(cliente.toLowerCase()) ? nome.slice(cliente.length).replace(/^[\s·:,-]+/, "") : nome;
  };

  RENDER.financeiro = async function () {
    $("#aba-financeiro").innerHTML = `<p class="vazio">Carregando...</p>`;
    const [ent, camp] = await Promise.all([
      ler("entradas", (q) => q.order("data", { ascending: false }).order("id", { ascending: false }).limit(5000)),
      ler("campanhas", (q) => q.eq("pagamento", "pendente").order("fechado_em", { ascending: true }))
    ]);
    entradas = ent.dados;
    aReceberFin = camp.dados.filter((c) => !c.permuta && (Number(c.valor) || 0) > 0);
    desenharFinanceiro();
  };

  function desenharFinanceiro() {
    const el = $("#aba-financeiro");
    const hoje = hojeData();
    const anoHoje = hoje.getFullYear(), mesHoje = hoje.getMonth();
    const anos = [...new Set(entradas.map((e) => Number(String(e.data).slice(0, 4))).concat([anoHoje]))].sort((a, b) => a - b);
    if (!anos.includes(anoFin)) anoFin = anoHoje;
    const doAno = entradas.filter((e) => String(e.data).startsWith(String(anoFin)));
    const porMes = Array.from({ length: 12 }, () => 0);
    doAno.forEach((e) => { const m = Number(String(e.data).slice(5, 7)) - 1; if (m >= 0 && m < 12) porMes[m] += Number(e.valor) || 0; });
    const totalAno = porMes.reduce((s, v) => s + v, 0);
    const ehAnoAtual = anoFin === anoHoje;

    /* Média: do primeiro mês com entrada até o último mês já fechado */
    const primeiro = porMes.findIndex((v) => v > 0);
    const ultimo = primeiro < 0 ? -1 : (ehAnoAtual ? Math.max(mesHoje - 1, primeiro) : 11);
    const mesesMedia = primeiro < 0 ? 0 : ultimo - primeiro + 1;
    const somaMedia = mesesMedia > 0 ? porMes.slice(primeiro, ultimo + 1).reduce((s, v) => s + v, 0) : 0;
    const media = mesesMedia > 0 ? somaMedia / mesesMedia : 0;
    const melhor = porMes.reduce((b, v, i) => (v > porMes[b] ? i : b), 0);
    const totalReceber = aReceberFin.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const maxMes = Math.max(1, ...porMes);

    el.innerHTML = `
      <div class="bloco-titulo">
        <span class="chips" role="group" aria-label="Escolher o ano">${anos.map((a) => `<button type="button" data-ano="${a}" aria-pressed="${a === anoFin}">${a}</button>`).join("")}</span>
        <div class="ferramentas">
          <button class="btn claro" id="btn-csv-ent">${icone("baixar")}Baixar CSV</button>
          <button class="btn" id="btn-nova-ent">${icone("mais")}Nova entrada</button>
        </div>
      </div>
      <div class="faixa-numeros bloco">
        <div><span>Recebido em ${anoFin}</span><strong>${dinheiro(totalAno)}</strong><small>${plural(doAno.length, "entrada", "entradas")}</small></div>
        ${ehAnoAtual ? `<div><span>Recebido em ${MESES[mesHoje]}</span><strong>${dinheiro(porMes[mesHoje])}</strong><small>${mesHoje > 0 ? `${MESES[mesHoje - 1]}: ${dinheiro(porMes[mesHoje - 1])}` : "primeiro mês do ano"}</small></div>` : ""}
        <div><span>Média por mês</span><strong>${dinheiro(media)}</strong><small>${mesesMedia > 0 ? (mesesMedia === 1 ? `em ${MESES[primeiro]}` : `de ${MESES[primeiro]} a ${MESES[ultimo]}`) : "aparece com as entradas"}</small></div>
        <div><span>Melhor mês</span><strong>${totalAno > 0 ? nomeMes(melhor) : "Ainda sem entradas"}</strong>${totalAno > 0 ? `<small>${dinheiro(porMes[melhor])}</small>` : ""}</div>
        <div class="destaque"><span>A receber</span><strong>${dinheiro(totalReceber)}</strong><small>${aReceberFin.length ? plural(aReceberFin.length, "marca", "marcas") : "nada pendente"}</small></div>
      </div>
      <div class="grade-2 grade-fin bloco">
        <div class="cartao">
          <div class="bloco-titulo"><h2>Quanto entrou em cada mês de ${anoFin}</h2></div>
          ${totalAno === 0 ? `<p class="vazio">Quando você lançar entradas de ${anoFin}, o gráfico aparece aqui.</p>`
            : `<div class="grafico grafico-fin" role="img" aria-label="Entradas por mês em ${anoFin}">${porMes.map((v, i) => `
              <div class="barra${ehAnoAtual && i === mesHoje ? " hoje" : ""}" title="${nomeMes(i)}: ${dinheiro(v)}">
                <i style="height:${(v / maxMes) * 100}%">${v ? `<b>${curto(v)}</b>` : ""}</i>
                <span>${MESES_CURTOS[i]}</span>
              </div>`).join("")}</div>`}
        </div>
        <div class="cartao">
          <div class="bloco-titulo"><h2>A receber</h2><strong class="valor-receber">${dinheiro(totalReceber)}</strong></div>
          ${aReceberFin.length ? `<ul class="receber" id="lista-receber">${aReceberFin.map((c) => `
            <li>
              <div><strong>${esc(c.cliente || c.campanha)}</strong><span class="suave">${esc([detalheCampanha(c), c.fechado_em ? `fechada em ${mesAno(c.fechado_em)}` : ""].filter(Boolean).join(" · "))}</span></div>
              <b>${dinheiro(c.valor)}</b>
              <button class="btn claro" data-recebi="${c.id}">Recebi</button>
            </li>`).join("")}</ul>`
            : `<p class="vazio">Nada a receber. Tudo em dia!</p>`}
        </div>
      </div>
      <div class="bloco">
        <div class="bloco-titulo"><h2>Entradas de ${anoFin}</h2><span class="suave">Clique numa linha para editar ou apagar</span></div>
        <div class="tabela-caixa"><table>
          <thead><tr><th>Data</th><th>De onde veio</th><th class="num">Valor</th></tr></thead>
          <tbody id="tabela-ent"></tbody>
        </table></div>
      </div>`;

    /* Tabela de entradas, agrupada por mês (mais recente primeiro) */
    const linhas = [];
    for (let m = 11; m >= 0; m--) {
      const doMes = doAno.filter((e) => Number(String(e.data).slice(5, 7)) - 1 === m);
      if (!doMes.length) continue;
      linhas.push(`<tr class="mes-linha"><td colspan="2">${nomeMes(m)}</td><td class="num">${dinheiro(porMes[m])}</td></tr>`);
      doMes.sort((a, b) => String(b.data).localeCompare(String(a.data)) || b.id - a.id).forEach((e) => linhas.push(`
        <tr class="clicavel" data-ent="${e.id}"><td style="white-space:nowrap">${dataBr(e.data)}</td><td>${esc(e.descricao)}</td><td class="num">${dinheiro(e.valor)}</td></tr>`));
    }
    $("#tabela-ent").innerHTML = linhas.length ? linhas.join("") : `<tr><td colspan="3"><p class="vazio">Nenhuma entrada em ${anoFin}. Clique em "Nova entrada" ou use o botão "Recebi" ao lado de uma marca.</p></td></tr>`;

    $$("[data-ano]", el).forEach((b) => b.onclick = () => { anoFin = Number(b.dataset.ano); desenharFinanceiro(); });
    $("#btn-nova-ent").onclick = () => formEntrada();
    $("#btn-csv-ent").onclick = () => baixarCsv(`entradas-${anoFin}`, [
      { rotulo: "Data", valor: (e) => dataBr(e.data) }, { rotulo: "De onde veio", valor: (e) => e.descricao },
      { rotulo: "Valor", valor: (e) => String(Number(e.valor) || 0).replace(".", ",") }
    ], [...doAno].sort((a, b) => String(a.data).localeCompare(String(b.data))));
    $("#tabela-ent").onclick = (ev) => {
      const tr = ev.target.closest("tr[data-ent]"); if (!tr) return;
      const e = entradas.find((x) => x.id === Number(tr.dataset.ent)); if (e) formEntrada(e);
    };
    const lista = $("#lista-receber");
    if (lista) lista.onclick = (ev) => {
      const b = ev.target.closest("[data-recebi]"); if (!b) return;
      const c = aReceberFin.find((x) => x.id === Number(b.dataset.recebi)); if (c) formRecebi(c);
    };
  }

  function formEntrada(e) {
    const nomes = [...new Set(entradas.map((x) => x.descricao).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    abrirFormulario({
      titulo: e ? "Editar entrada" : "Nova entrada",
      valores: e || { data: chaveDia(hojeData()), valor: "" },
      campos: [
        { nome: "descricao", rotulo: "De onde veio", obrigatorio: true, inteiro: true, lista: nomes, ajuda: "Ex.: Beyoung, comissão Onda Marinha, consulta" },
        { nome: "data", rotulo: "Data em que entrou", tipo: "date", obrigatorio: true },
        { nome: "valor", rotulo: "Valor (R$)", tipo: "number", passo: "0.01", obrigatorio: true }
      ],
      aoSalvar: async (d) => {
        const ok = e ? await gravar("entradas", (t) => t.update(d).eq("id", e.id), "Entrada salva")
                     : await gravar("entradas", (t) => t.insert(d), "Entrada lançada");
        if (ok) await RENDER.financeiro();
        return ok;
      },
      aoApagar: e ? async () => { const ok = await gravar("entradas", (t) => t.delete().eq("id", e.id), "Entrada apagada"); if (ok) await RENDER.financeiro(); return ok; } : null
    });
  }

  /* "Recebi": lança a entrada e marca a campanha como paga.
     Se entrou menos do que o combinado, o resto continua a receber. */
  function formRecebi(c) {
    const devido = Number(c.valor) || 0;
    abrirFormulario({
      titulo: `Recebi de ${c.cliente || c.campanha}`,
      valores: { data: chaveDia(hojeData()), valor: devido },
      campos: [
        { nome: "data", rotulo: "Quando entrou", tipo: "date", obrigatorio: true },
        { nome: "valor", rotulo: "Quanto entrou (R$)", tipo: "number", passo: "0.01", obrigatorio: true, ajuda: `Combinado: ${dinheiro(devido)}. Se entrou só uma parte, o resto continua em "A receber".` }
      ],
      aoSalvar: async (d) => {
        const recebido = Number(d.valor) || 0;
        if (recebido <= 0) { toast("Coloque quanto entrou.", true); return false; }
        const ok = await gravar("entradas", (t) => t.insert({ data: d.data, valor: recebido, descricao: c.cliente || c.campanha, campanha_id: c.id }));
        if (!ok) return false;
        const resto = Math.round((devido - recebido) * 100) / 100;
        const mudanca = resto > 0 ? { valor: resto } : { pagamento: "pago", ativa: c.status === "Entregue" ? false : c.ativa };
        await gravar("campanhas", (t) => t.update(mudanca).eq("id", c.id), resto > 0 ? `Lançado! Ainda faltam ${dinheiro(resto)}` : "Lançado! Marquei como pago");
        await RENDER.financeiro();
        return true;
      }
    });
  }

  /* =====================================================================
     ABA 7. TAREFAS: o que eu tenho que fazer
     ===================================================================== */
  const GRUPOS_TAREFA = ["Esta semana", "Vídeos TikTok Shop", "Toda semana", "Depois"];
  let tarefas = [];
  const inicioSemana = () => { const d = hojeData(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
  /* "Toda semana" volta a ficar pendente na segunda-feira seguinte */
  const tarefaFeita = (t) => (t.grupo === "Toda semana" ? !!(t.feito && t.feito_em && new Date(t.feito_em) >= inicioSemana()) : !!t.feito);

  RENDER.tarefas = async function () {
    $("#aba-tarefas").innerHTML = `<p class="vazio">Carregando...</p>`;
    const r = await ler("tarefas", (q) => q.order("ordem").order("id"));
    tarefas = r.dados;
    desenharTarefas();
  };

  function desenharTarefas() {
    const el = $("#aba-tarefas");
    const hoje = chaveDia(hojeData());
    const daqui7 = new Date(hojeData()); daqui7.setDate(daqui7.getDate() + 7);
    const pend = tarefas.filter((t) => !tarefaFeita(t));
    const atrasadas = pend.filter((t) => t.prazo && String(t.prazo).slice(0, 10) < hoje);
    const logo = pend.filter((t) => t.prazo && String(t.prazo).slice(0, 10) >= hoje && String(t.prazo).slice(0, 10) <= chaveDia(daqui7));
    const feitasSemana = tarefas.filter((t) => tarefaFeita(t) && t.feito_em && new Date(t.feito_em) >= inicioSemana());
    const grupos = [...new Set(GRUPOS_TAREFA.concat(tarefas.map((t) => t.grupo)))].filter((g) => g === "Esta semana" || tarefas.some((t) => t.grupo === g));
    const opcoesGrupo = [...new Set(GRUPOS_TAREFA.concat(tarefas.map((t) => t.grupo)))];

    el.innerHTML = `
      <div class="faixa-numeros bloco">
        <div><span>Pendentes</span><strong>${numero(pend.length)}</strong></div>
        <div><span>Atrasadas</span><strong class="${atrasadas.length ? "txt-alerta" : ""}">${numero(atrasadas.length)}</strong></div>
        <div><span>Vencem nos próximos 7 dias</span><strong>${numero(logo.length)}</strong></div>
        <div><span>Feitas nesta semana</span><strong>${numero(feitasSemana.length)}</strong></div>
      </div>
      <form class="nova-tarefa cartao bloco" id="form-tarefa">
        <input class="nt-texto" id="nt-texto" placeholder="O que você precisa fazer?" aria-label="Nova tarefa" autocomplete="off">
        <select id="nt-grupo" aria-label="Grupo">${opcoesGrupo.map((g) => `<option>${esc(g)}</option>`).join("")}</select>
        <input id="nt-prazo" type="date" aria-label="Prazo (opcional)" title="Prazo (opcional)">
        <button class="btn" type="submit">${icone("mais")}Adicionar</button>
      </form>
      <div class="grupos-tarefa">${grupos.map(cartaoGrupo).join("")}</div>`;

    $("#form-tarefa").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const texto = $("#nt-texto").value.trim();
      if (!texto) { $("#nt-texto").focus(); toast("Escreva a tarefa.", true); return; }
      const grupo = $("#nt-grupo").value;
      const ordem = Math.max(0, ...tarefas.filter((t) => t.grupo === grupo).map((t) => t.ordem || 0)) + 10;
      if (await gravar("tarefas", (t) => t.insert({ texto, grupo, prazo: $("#nt-prazo").value || null, ordem }), "Tarefa adicionada")) await RENDER.tarefas();
    });
    $(".grupos-tarefa", el).onchange = async (ev) => {
      const cb = ev.target.closest("input[data-check]"); if (!cb) return;
      const t = tarefas.find((x) => x.id === Number(cb.closest("[data-id]").dataset.id)); if (!t) return;
      const mudanca = { feito: cb.checked, feito_em: cb.checked ? new Date().toISOString() : null };
      if (await gravar("tarefas", (q) => q.update(mudanca).eq("id", t.id), cb.checked ? "Feito!" : "Voltou para pendente")) { Object.assign(t, mudanca); desenharTarefas(); }
      else cb.checked = !cb.checked;
    };
    $(".grupos-tarefa", el).onclick = async (ev) => {
      const li = ev.target.closest("[data-id]");
      const t = li && tarefas.find((x) => x.id === Number(li.dataset.id));
      if (t && ev.target.closest("[data-editar]")) { formTarefa(t, opcoesGrupo); return; }
      if (t && ev.target.closest("[data-apagar]")) {
        if (!confirm(`Apagar "${t.texto}"?`)) return;
        if (await gravar("tarefas", (q) => q.delete().eq("id", t.id), "Tarefa apagada")) await RENDER.tarefas();
        return;
      }
      const limpar = ev.target.closest("[data-limpar]");
      if (limpar) {
        const ids = tarefas.filter((x) => x.grupo === limpar.dataset.limpar && tarefaFeita(x)).map((x) => x.id);
        if (!ids.length || !confirm(`Apagar ${plural(ids.length, "tarefa feita", "tarefas feitas")} de "${limpar.dataset.limpar}"?`)) return;
        if (await gravar("tarefas", (q) => q.delete().in("id", ids), "Feitas apagadas")) await RENDER.tarefas();
      }
    };
  }

  function cartaoGrupo(g) {
    const porPrazo = (t) => (t.prazo ? String(t.prazo).slice(0, 10) : "9999-12-31");
    const itens = tarefas.filter((t) => t.grupo === g).sort((a, b) =>
      (tarefaFeita(a) - tarefaFeita(b)) || porPrazo(a).localeCompare(porPrazo(b)) || ((a.ordem || 0) - (b.ordem || 0)) || (a.id - b.id));
    const feitas = itens.filter(tarefaFeita).length;
    return `<div class="cartao">
      <div class="bloco-titulo"><h2>${esc(g)}</h2><span class="suave">${itens.length ? `${feitas} de ${itens.length} feitas${g === "Toda semana" ? " nesta semana" : ""}` : ""}</span></div>
      ${itens.length ? `<ul class="tarefas">${itens.map(linhaTarefa).join("")}</ul>` : `<p class="vazio">Nada aqui. Adicione uma tarefa lá em cima.</p>`}
      ${g !== "Toda semana" && feitas ? `<button class="btn claro limpar" data-limpar="${esc(g)}">Apagar as feitas</button>` : ""}
    </div>`;
  }

  function linhaTarefa(t) {
    const feita = tarefaFeita(t);
    let prazo = "";
    if (t.prazo) {
      const d = diasAte(t.prazo);
      if (!feita && d < 0) prazo = `<span class="etiqueta et-atraso">atrasada ${plural(-d, "dia", "dias")}</span>`;
      else if (!feita && d === 0) prazo = `<span class="etiqueta et-perto">hoje</span>`;
      else if (!feita && d <= 3) prazo = `<span class="etiqueta et-perto">em ${plural(d, "dia", "dias")}</span>`;
      else prazo = `<span class="suave">${dataBr(t.prazo)}</span>`;
    }
    return `<li class="tarefa${feita ? " feito" : ""}" data-id="${t.id}">
      <label><input type="checkbox" data-check ${feita ? "checked" : ""}><span>${esc(t.texto)}</span></label>
      ${prazo}
      <button type="button" class="icone-btn" data-editar aria-label="Editar tarefa">${icone("lapis")}</button>
      <button type="button" class="icone-btn" data-apagar aria-label="Apagar tarefa">${icone("lixo")}</button>
    </li>`;
  }

  function formTarefa(t, grupos) {
    abrirFormulario({
      titulo: "Editar tarefa",
      valores: { texto: t.texto, grupo: t.grupo, prazo: t.prazo ? String(t.prazo).slice(0, 10) : "" },
      campos: [
        { nome: "texto", rotulo: "Tarefa", obrigatorio: true, inteiro: true },
        { nome: "grupo", rotulo: "Grupo", obrigatorio: true, lista: grupos, ajuda: "Escolha um grupo ou escreva um novo" },
        { nome: "prazo", rotulo: "Prazo", tipo: "date" }
      ],
      aoSalvar: async (d) => {
        const ok = await gravar("tarefas", (q) => q.update(d).eq("id", t.id), "Tarefa salva");
        if (ok) await RENDER.tarefas();
        return ok;
      },
      aoApagar: async () => { const ok = await gravar("tarefas", (q) => q.delete().eq("id", t.id), "Tarefa apagada"); if (ok) await RENDER.tarefas(); return ok; }
    });
  }

  /* =====================================================================
     ABA 5. CHECKLIST DO PORTFÓLIO (conteúdo do js/biblioteca.js, sem mudar nada)
     ===================================================================== */
  const B = window.Biblioteca || {};
  const SUBABAS = [["checklist", "Checklist do portfólio"], ["referencias", "Referências de vídeo"], ["roteiros", "Roteiros"], ["nichos", "Ideias por nicho"], ["revisar", "Revisar meu roteiro"]];
  let subaba = "checklist";
  let marcados = new Set();
  let marcadosCarregados = false;
  const revisados = new Set();
  const idYoutube = (url) => { const m = String(url || "").match(/(?:shorts\/|youtu\.be\/|v=|embed\/)([\w-]{11})/); return m ? m[1] : null; };
  const CORES_REF = { coral: "#f6dfd8", verde: "#e1ecdf", azul: "#e2e8f0", roxo: "#e9e0f0", amarelo: "#f7e8c6", rosa: "#f6e1e8" };

  RENDER.checklist = async function () {
    const el = $("#aba-checklist");
    if (!window.Biblioteca) { el.innerHTML = `<p class="vazio">Não encontrei o arquivo js/biblioteca.js. Confira se ele está na pasta js do projeto.</p>`; return; }
    el.innerHTML = `<div class="sub-abas" role="group" aria-label="Partes do checklist">${SUBABAS.map(([v, t]) => `<button type="button" data-sub="${v}" aria-pressed="${subaba === v}">${t}</button>`).join("")}</div><div id="sub-conteudo"></div>`;
    $$("[data-sub]", el).forEach((b) => b.onclick = () => { subaba = b.dataset.sub; $$("[data-sub]", el).forEach((x) => x.setAttribute("aria-pressed", x === b)); desenharSub(); });
    if (!marcadosCarregados) {
      const r = await ler("marcados");
      marcados = new Set(r.dados.filter((m) => m.marcado).map((m) => m.chave));
      marcadosCarregados = r.ok;
    }
    desenharSub();
  };

  function desenharSub() {
    const alvo = $("#sub-conteudo"); if (!alvo) return;
    if (subaba === "checklist") return desenharChecklist(alvo);
    if (subaba === "referencias") return desenharReferencias(alvo);
    if (subaba === "roteiros") return desenharRoteiros(alvo);
    if (subaba === "nichos") return desenharNichos(alvo);
    return desenharRevisao(alvo);
  }

  function desenharChecklist(alvo) {
    const secoes = B.CHECKLIST || [];
    const totalItens = secoes.reduce((s, x) => s + (x.itens || []).length, 0);
    const feitos = secoes.reduce((s, x) => s + (x.itens || []).filter((_, i) => marcados.has(`checklist:${x.id}:${i}`)).length, 0);
    const pct = totalItens ? Math.round((feitos / totalItens) * 100) : 0;
    const abertas = new Set($$("details.sanfona[open]", alvo).map((d) => d.dataset.secao));
    alvo.innerHTML = `
      <div class="cartao bloco"><div class="bloco-titulo"><h2>Seu portfólio está ${pct}% pronto</h2><span class="suave">${feitos} de ${totalItens} itens</span></div>
        <div class="progresso"><i style="width:${pct}%"></i></div></div>
      ${secoes.map((s) => {
        const itens = s.itens || [];
        const f = itens.filter((_, i) => marcados.has(`checklist:${s.id}:${i}`)).length;
        const p = itens.length ? Math.round((f / itens.length) * 100) : 0;
        return `<details class="sanfona" data-secao="${esc(s.id)}" ${abertas.has(s.id) ? "open" : ""}>
          <summary><span class="emoji" aria-hidden="true">${esc(s.emoji)}</span><span><strong>${esc(s.nome)}</strong><br><span class="suave">${esc(s.resumo)}</span></span><span class="suave">${f}/${itens.length}</span>
            <span class="progresso"><i style="width:${p}%"></i></span></summary>
          <div class="corpo">
            <p class="porque"><strong>Por que importa:</strong> ${esc(s.porque)}</p>
            ${itens.map((it, i) => { const k = `checklist:${s.id}:${i}`; const ok = marcados.has(k); return `
              <label class="item-check${ok ? " feito" : ""}"><input type="checkbox" data-chave="${esc(k)}" ${ok ? "checked" : ""}><span>${esc(it.t)}</span><small>${esc(it.d)}</small></label>`; }).join("")}
          </div></details>`;
      }).join("")}`;
    alvo.onchange = async (e) => {
      const cb = e.target.closest("input[data-chave]"); if (!cb) return;
      const k = cb.dataset.chave;
      if (cb.checked) marcados.add(k); else marcados.delete(k);
      desenharChecklist(alvo);
      const ok = cb.checked
        ? await gravar("marcados", (t) => t.upsert({ chave: k, marcado: true, atualizado_em: new Date().toISOString() }))
        : await gravar("marcados", (t) => t.delete().eq("chave", k));
      if (!ok) { if (cb.checked) marcados.delete(k); else marcados.add(k); desenharChecklist(alvo); }
    };
  }

  function desenharReferencias(alvo) {
    alvo.onchange = null;
    const refs = B.REFERENCIAS || [];
    alvo.innerHTML = `<div class="grade-cards">${refs.map((r, i) => {
      const id = idYoutube(r.youtube);
      return `<button type="button" class="ref-card" data-ref="${i}">
        <div class="ref-capa" style="background:${CORES_REF[r.cor] || "var(--creme-escuro)"}">
          ${id ? `<img src="https://i.ytimg.com/vi/${id}/oar2.jpg" alt="" loading="lazy" onerror="this.remove()">` : ""}
          <span class="emoji" aria-hidden="true">${esc(r.emoji)}</span>
        </div>
        <strong>${esc(r.titulo)}</strong>
        <small>${esc(r.estilo)} · ${esc(r.duracao)}</small>
        <small>${esc(r.marca)}</small>
      </button>`;
    }).join("")}</div>`;
    alvo.onclick = (e) => {
      const card = e.target.closest("[data-ref]"); if (!card) return;
      const r = refs[Number(card.dataset.ref)];
      abrirJanela(`${r.emoji} ${r.titulo}`, `
        <p class="suave">${esc(r.estilo)} · ${esc(r.audiencia)} · ${esc(r.duracao)} · ${esc(r.marca)}</p>
        <p class="porque"><strong>Gancho:</strong> ${esc(r.gancho)}</p>
        <p><strong>Por que funciona:</strong> ${esc(r.porque)}</p>
        <p><strong>O diferencial:</strong> ${esc(r.diferencial)}</p>
        <p><strong>Erro comum:</strong> ${esc(r.erro)}</p>
        <strong>Roteiro</strong>
        <ul class="blocos-tempo">${(r.roteiro || []).map((b) => `<li><b class="t">${esc(b.t)}</b><span>${b.o}</span></li>`).join("")}</ul>
        <div class="modal-acoes"><a class="btn" href="${esc(r.youtube)}" target="_blank" rel="noopener">${icone("externo")}Assistir</a></div>`);
    };
  }

  function desenharRoteiros(alvo) {
    alvo.onclick = null; alvo.onchange = null;
    alvo.innerHTML = (B.TIPOS || []).map((t) => `
      <details class="sanfona">
        <summary><span class="emoji" aria-hidden="true">${esc(t.emoji)}</span><span><strong>${esc(t.nome)}</strong></span><span class="suave">${esc(t.duracao)}</span></summary>
        <div class="corpo">
          <p class="porque"><strong>Quando usar:</strong> ${esc(t.porque)}</p>
          <ul class="blocos-tempo">${(t.beats || []).map((b) => `<li><b class="t">${esc(b.t)}</b><span>${b.o}</span></li>`).join("")}</ul>
          ${(t.erros || []).length ? `<p style="margin:12px 0 4px"><strong>Erros comuns</strong></p><ul>${t.erros.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        </div>
      </details>`).join("");
  }

  function desenharNichos(alvo) {
    alvo.onclick = null; alvo.onchange = null;
    const como = B.COMO_USAR || [];
    alvo.innerHTML = `${como.length ? `<div class="cartao bloco"><div class="bloco-titulo"><h2>Como usar os ganchos</h2></div><ul>${como.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>` : ""}
      <div class="grade-cards" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">${(B.NICHOS || []).map((n) => `
        <div class="cartao"><div class="bloco-titulo"><h2>${esc(n.emoji)} ${esc(n.nome)}</h2></div>
          <ul class="ideias">${(n.ideias || []).map((i) => `<li><strong>${esc(i.t)}</strong><em>${esc(i.gancho)}</em></li>`).join("")}</ul></div>`).join("")}</div>`;
  }

  function desenharRevisao(alvo) {
    let rascunho = "";
    try { rascunho = localStorage.getItem("rascunho-roteiro") || ""; } catch (e) {}
    const blocos = B.REVISAO || [];
    const total = blocos.reduce((s, b) => s + (b.itens || []).length, 0);
    alvo.innerHTML = `
      <div class="cartao bloco">
        <div class="bloco-titulo"><h2>Cole o seu roteiro</h2><button class="btn claro" id="rev-limpar">Começar de novo</button></div>
        <textarea class="roteiro" id="rev-texto" placeholder="Cole aqui o roteiro que você quer revisar">${esc(rascunho)}</textarea>
      </div>
      <div class="cartao bloco"><div class="bloco-titulo"><h2>Conferido</h2><span class="suave" id="rev-conta">${revisados.size} de ${total}</span></div>
        <div class="progresso"><i id="rev-barra" style="width:${total ? (revisados.size / total) * 100 : 0}%"></i></div></div>
      ${blocos.map((b, bi) => `<div class="cartao bloco"><div class="bloco-titulo"><h2>${esc(b.emoji)} ${esc(b.bloco)}</h2></div>
        ${(b.itens || []).map((it, i) => { const k = `${bi}:${i}`; return `<label class="item-check${revisados.has(k) ? " feito" : ""}"><input type="checkbox" data-rev="${k}" ${revisados.has(k) ? "checked" : ""}><span>${esc(it.t)}</span><small>${esc(it.d)}</small></label>`; }).join("")}
      </div>`).join("")}`;
    $("#rev-texto").addEventListener("input", (e) => { try { localStorage.setItem("rascunho-roteiro", e.target.value); } catch (er) {} });
    $("#rev-limpar").onclick = () => { revisados.clear(); try { localStorage.removeItem("rascunho-roteiro"); } catch (e) {} desenharRevisao(alvo); };
    alvo.onchange = (e) => {
      const cb = e.target.closest("input[data-rev]"); if (!cb) return;
      if (cb.checked) revisados.add(cb.dataset.rev); else revisados.delete(cb.dataset.rev);
      cb.closest(".item-check").classList.toggle("feito", cb.checked);
      $("#rev-conta").textContent = `${revisados.size} de ${total}`;
      $("#rev-barra").style.width = `${total ? (revisados.size / total) * 100 : 0}%`;
    };
    alvo.onclick = null;
  }

  /* ---------- 5. ABRIR A ABA DO ENDEREÇO (ou Portfólio) ---------- */
  abrirAba((location.hash || "#portfolio").slice(1));
})();
