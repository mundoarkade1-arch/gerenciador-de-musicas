(function () {
  'use strict';
  var EXT = ['mp3', 'm4a', 'flac', 'wav', 'ogg', 'wma', 'aac', 'opus', 'm4b', 'aif', 'aiff', 'ape', 'wv', 'mka'];
  var CLIENT_ID = '22049376827-k0tavpkj93lp2e2bc43ga600fp7ktu59.apps.googleusercontent.com';
  var ESCOPOS = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file';
  var PASTA_RAIZ = 'Músicas do Site';
  var CH = window.CHARTS || { atualizado: null, listas: {}, historico: [] };
  var $ = function (id) { return document.getElementById(id); };
  var estado = { arquivos: [], b: [], lib: [], ver: 0, fantasmas: [], aba: 'repetidas', lista: null, soFalta: false, soFaltaYt: false, tinhaSalvo: false, n: 50, cache: {}, aviso: '', pastaNome: '', lim: { repetidas: 50, top: 50, novidades: 50, motor: 50, playlists: 40, cantores: 20, faltam: 20 }, abertos: {}, antes: null, ocupDesenhado: false, extras: false, ferramenta: null };
  // D = o Drive. itens: tudo que o Drive tem (música). anterior: o que o arquivo de playlists antigo dizia (memória).
  var D = { token: null, itens: null, anterior: null, ocupado: false };
  // Conferência com o Deezer
  var DZ = { ocupado: false, parar: false };
  // Motor Toxic: o que o motor deixou na pasta "Toxic Engine" do Drive (só leitura).
  var M = { status: null, pendentes: null, ocupado: false, erro: '' };
  // D.msg manda o texto para a faixa de aviso (ui.js) e devolve o último texto.
  Object.defineProperty(D, 'msg', { get: function () { return UI.ultima || ''; }, set: function (v) { UI.msg(v); } });

  function el(tag, txt, cls) {
    var e = document.createElement(tag);
    if (txt != null) e.textContent = txt;
    if (cls) e.className = cls;
    return e;
  }
  function esvaziar(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  // Deixa o nome "limpo" para comparar: sem acento, sem (1), sem "copia", sem símbolos.
  // Colchetes só somem se forem "lixo": id de vídeo (ex.: [dQw4w9WgXcQ]) ou palavra de ruído.
  // [Remix], [Ao Vivo] etc. ficam, para não confundir versões diferentes.
  var RUIDO = /\b(official|oficial|audio|video|clipe|lyrics|letra|hd|hq|copia|copy)\b/;
  function limpar(t, tiraParenteses) {
    t = (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
    t = t.replace(/\(\d+\)/g, ' ').replace(/\b(copia|copy)\b/g, ' ');
    t = t.replace(/\[([^\]]*)\]/g, function (tudo, dentro) {
      var d = dentro.trim();
      var ehId = /^[\w-]{11}$/.test(d) && /[\d_-]/.test(d);
      return (ehId || RUIDO.test(d)) ? ' ' : ' ' + d + ' ';
    });
    if (tiraParenteses) t = t.replace(/\([^)]*\)/g, ' ');
    t = t.replace(/\b(official|oficial|audio|video|clipe|lyrics|letra|hd|hq)\b/g, ' ');
    // Mantém letras e números de QUALQUER idioma (japonês, coreano, russo, árabe...).
    return t.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }
  // Nunca devolve vazio: se o nome só tem símbolos, usa o nome em minúsculas.
  function chaveNome(s, tira) { return limpar(s, tira) || (s || '').toLowerCase().trim(); }

  // Compara título e cantor com o nome de um arquivo (tudo já "limpo"), por palavras inteiras.
  // "Love" não casa com "glove"; "Alone" não casa com "Alone in the dark ... remix".
  // Aceita até 3 palavras sobrando (outros cantores, "4k", etc.).
  function casa(b, t, a) {
    var B = ' ' + b + ' ';
    var ti = B.indexOf(' ' + t + ' ');
    if (ti < 0) return false;
    var resto = B.slice(0, ti) + ' ' + B.slice(ti + t.length + 1);
    if (a) {
      if (B.indexOf(' ' + a + ' ') < 0) return false;
      var ai = resto.indexOf(' ' + a + ' ');
      if (ai >= 0) resto = resto.slice(0, ai) + ' ' + resto.slice(ai + a.length + 1);
    }
    return resto.split(' ').filter(Boolean).length <= 3;
  }
  var memoTenho = {};

  // Lê a pasta e todas as subpastas. Se uma pasta der problema, pula ela e continua.
  async function varrer(dir, cam, lista, stats) {
    stats.pastas++;
    var entradas = [];
    try {
      for await (var e of dir.values()) { entradas.push(e); }
    } catch (erro) {
      stats.pastasComProblema.push(cam);
      return;
    }
    for (var n = 0; n < entradas.length; n++) {
      var item = entradas[n];
      try {
        if (item.kind === 'directory') {
          await varrer(item, cam + item.name + '/', lista, stats);
        } else {
          var i = item.name.lastIndexOf('.');
          var ext = i < 0 ? '(sem tipo)' : item.name.slice(i + 1).toLowerCase();
          if (EXT.indexOf(ext) >= 0) {
            var f = await item.getFile();
            var s = item.name.slice(0, i);
            lista.push({ c: cam + item.name, k: chaveNome(s, false), b: chaveNome(s, true), t: f.size, m: f.lastModified, h: item });
          } else {
            stats.ignorados[ext] = (stats.ignorados[ext] || 0) + 1;
          }
        }
      } catch (erro2) {
        stats.pastasComProblema.push(cam + item.name);
      }
    }
  }

  // Guarda só os nomes limpos (nunca o conteúdo) neste navegador, para lembrar da última leitura.
  function salvar() {
    try {
      localStorage.setItem('gm_biblioteca', JSON.stringify({ v: 2, d: Date.now(), b: estado.b }));
    } catch (e) { /* sem problema */ }
  }
  function carregar() {
    try {
      var x = JSON.parse(localStorage.getItem('gm_biblioteca') || 'null');
      if (x && x.v === 2 && x.b && x.b.length) {
        estado.b = x.b;
        memoTenho = {};
        estado.tinhaSalvo = true;
      }
    } catch (e) { /* sem problema */ }
  }

  // ---------- Lembrar a pasta escolhida (fica só neste navegador) ----------

  function abrirBanco() {
    return new Promise(function (ok, erro) {
      var r = indexedDB.open('gm_banco', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('pastas'); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { erro(r.error); };
    });
  }

  async function guardarPasta(handle) {
    try {
      var db = await abrirBanco();
      await new Promise(function (ok, erro) {
        var t = db.transaction('pastas', 'readwrite');
        t.objectStore('pastas').put(handle, 'musicas');
        t.oncomplete = function () { ok(); };
        t.onerror = function () { erro(t.error); };
      });
    } catch (e) { /* sem problema */ }
  }

  async function pastaGuardada() {
    try {
      var db = await abrirBanco();
      return await new Promise(function (ok) {
        var q = db.transaction('pastas').objectStore('pastas').get('musicas');
        q.onsuccess = function () { ok(q.result || null); };
        q.onerror = function () { ok(null); };
      });
    } catch (e) { return null; }
  }

  function tenho(f) {
    var t = limpar(f.t, true);
    if (!t) return false;
    var a = limpar((f.a || '').split(/,|&| feat/)[0], true);
    var chave = t + '|' + a;
    if (memoTenho[chave] !== undefined) return memoTenho[chave];
    var achou = false;
    for (var i = 0; i < estado.b.length; i++) {
      if (casa(estado.b[i], t, a)) { achou = true; break; }
    }
    memoTenho[chave] = achou;
    return achou;
  }

  // ---------- Peças de tela (sem animação) ----------

  var PAGINA = 50; // quantas linhas aparecem por vez (botão "Mostrar mais")

  function pilula(txt, cls) { return el('span', txt, 'pilula' + (cls ? ' ' + cls : '')); }
  function vazio(txt) { return el('div', txt, 'vazio'); }
  function tamanhoTxt(t) { return (t / 1048576).toFixed(1).replace('.', ',') + ' MB'; }
  function nomeSemExt(c) { var n = nomeDoArquivo(c); var i = n.lastIndexOf('.'); return i < 0 ? n : n.slice(0, i); }
  // Pasta sem o nome da pasta raiz (que é igual para todas): "Funk/Hits 2023".
  function pastaCurta(c) { var p = pastaDoArquivo(c); var i = p.indexOf('/'); return i < 0 ? p : p.slice(i + 1); }

  // Uma linha de lista: nome + apoio à esquerda, pílulas à direita.
  function itemLista(nome, sub, pilulas, pos) {
    var l = el('div', null, 'item-lista');
    var esq = el('div', null, 'item-esq');
    if (pos != null) esq.appendChild(el('span', String(pos), 'pos'));
    var t = el('div', null, 'item-txt');
    t.appendChild(el('div', nome, 'item-nome'));
    if (sub) t.appendChild(el('div', sub, 'item-sub'));
    esq.appendChild(t);
    l.appendChild(esq);
    var dir = el('div', null, 'item-dir');
    pilulas.forEach(function (p) { dir.appendChild(p); });
    l.appendChild(dir);
    return l;
  }

  // Rodapé "Mostrar mais N" (no máximo PAGINA linhas por vez).
  function rodapeMais(caixa, chave, total) {
    var vistas = estado.lim[chave];
    if (total <= vistas) return;
    var b = el('button', 'Mostrar mais ' + Math.min(PAGINA, total - vistas), 'mais');
    b.type = 'button';
    b.onclick = function () {
      estado.lim[chave] += PAGINA;
      desenhar(true);
      var nb = document.querySelector('.mais');
      if (nb) nb.focus();
    };
    caixa.appendChild(b);
  }

  function grupos() {
    var mapa = {};
    estado.arquivos.forEach(function (m) {
      if (m.k) (mapa[m.k] = mapa[m.k] || []).push(m);
    });
    var lista = Object.keys(mapa).filter(function (k) { return mapa[k].length > 1; });
    var sobra = 0;
    lista.forEach(function (k) { sobra += mapa[k].length - 1; });
    lista.sort(function (a, b) { return mapa[b].length - mapa[a].length; });
    return { mapa: mapa, lista: lista, sobra: sobra };
  }

  function abaRepetidas(c) {
    if (!estado.arquivos.length) { c.appendChild(vazio('Escolha a pasta das suas músicas para ver as repetidas.')); return; }
    var g = grupos();
    if (!g.lista.length) { c.appendChild(vazio('Não achei nenhuma música repetida.')); return; }
    var cal = el('div', null, 'callout');
    cal.appendChild(el('p', 'Esta lista só mostra as repetidas do seu computador. Nada é apagado daqui. Para limpar as repetidas que já estão no Drive, use o botão "Atualizar tudo" na tela principal.'));
    var ir = el('button', 'Abrir os passos manuais do Drive', 'btn-s');
    ir.type = 'button';
    ir.onclick = function () { location.hash = 'extras/drive'; };
    cal.appendChild(ir);
    c.appendChild(cal);
    var caixa = el('div', null, 'lista');
    g.lista.slice(0, estado.lim.repetidas).forEach(function (k) {
      var arr = g.mapa[k];
      var maior = arr.reduce(function (a, b) { return b.t > a.t ? b : a; }, arr[0]);
      var vistas = {};
      var pastasTxt = [];
      arr.forEach(function (m) { var p = pastaCurta(m.c); if (!vistas[p]) { vistas[p] = 1; pastasTxt.push(p); } });
      caixa.appendChild(itemLista(nomeSemExt(maior.c), pastasTxt.join('  ·  '), [pilula(arr.length + ' cópias', 'am'), pilula(tamanhoTxt(maior.t), 'tam')]));
    });
    rodapeMais(caixa, 'repetidas', g.lista.length);
    c.appendChild(caixa);
  }

  function abaTop(c) {
    var ids = Object.keys(CH.listas);
    if (!ids.length) { c.appendChild(vazio('Ainda não tem listas. Elas aparecem depois da primeira atualização no GitHub.')); return; }
    if (!estado.lista || !CH.listas[estado.lista]) estado.lista = ids[0];
    // Uma fileira de botões por gênero; embaixo ficam as listas daquele gênero.
    var grupoDe = function (id) { return CH.listas[id].grupo || 'Outras'; };
    var gens = [];
    ids.forEach(function (id) { if (gens.indexOf(grupoDe(id)) < 0) gens.push(grupoDe(id)); });
    var gAtual = grupoDe(estado.lista);
    if (gens.length > 1) {
      c.appendChild(el('p', '1. Escolha o gênero:', 'rotulo'));
      var barraG = el('div', null, 'barra-chips');
      gens.forEach(function (g) {
        var bg = el('button', g, 'chip' + (g === gAtual ? ' ativa' : ''));
        bg.type = 'button';
        bg.setAttribute('aria-pressed', g === gAtual ? 'true' : 'false');
        bg.onclick = function () { estado.lista = ids.filter(function (id) { return grupoDe(id) === g; })[0]; estado.lim.top = PAGINA; desenhar(true); };
        barraG.appendChild(bg);
      });
      c.appendChild(barraG);
    }
    c.appendChild(el('p', (gens.length > 1 ? '2. ' : '1. ') + 'Escolha a lista:', 'rotulo'));
    var chips = el('div', null, 'barra-chips');
    ids.forEach(function (id) {
      if (grupoDe(id) !== gAtual) return;
      var b = el('button', CH.listas[id].nome, 'chip' + (id === estado.lista ? ' ativa' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', id === estado.lista ? 'true' : 'false');
      b.onclick = function () { estado.lista = id; estado.lim.top = PAGINA; desenhar(true); };
      chips.appendChild(b);
    });
    c.appendChild(chips);

    var L = CH.listas[estado.lista];
    var marcadas = L.faixas.map(function (f) { return { f: f, tem: estado.b.length ? tenho(f) : null }; });
    var temN = marcadas.filter(function (m) { return m.tem; }).length;
    var faltam = marcadas.filter(function (m) { return m.tem === false; });
    c.appendChild(el('p', 'Fonte: ' + L.fonte + '.' + (estado.b.length ? ' Você já tem ' + temN + ' de ' + L.faixas.length + '.' : ' Escolha a pasta para ver o que você já tem.'), 'nota'));

    c.appendChild(el('p', 'Etiquetas: "já tenho" = a música está na sua pasta. "falta" = você ainda não tem. Botões abaixo:', 'nota'));
    var acoes = el('div', null, 'barra-chips');
    var filtro = el('button', estado.soFalta ? 'Mostrar todas' : 'Mostrar só o que falta', 'chip');
    filtro.type = 'button';
    filtro.onclick = function () { estado.soFalta = !estado.soFalta; estado.lim.top = PAGINA; desenhar(true); };
    acoes.appendChild(filtro);
    if (faltam.length) {
      var copiar = el('button', 'Copiar o que falta', 'btn-s');
      copiar.type = 'button';
      copiar.onclick = function () {
        var txt = faltam.map(function (m) { return m.f.a + ' - ' + m.f.t; }).join('\n');
        navigator.clipboard.writeText(txt).then(function () { copiar.textContent = 'Copiado!'; }, function () { copiar.textContent = 'Não consegui copiar'; });
      };
      acoes.appendChild(copiar);
    }
    c.appendChild(acoes);

    var ytl = YT.lista(estado.lista);
    cartaoYoutube(c, estado.lista, L, ytl);

    var linhas = [];
    marcadas.forEach(function (m, i) {
      if (estado.soFalta && m.tem !== false) return;
      if (estado.soFaltaYt && ytl.playlistId && (ytl.feitas[m.f.id] || ytl.manual[m.f.id])) return;
      linhas.push({ m: m, pos: i + 1 });
    });
    var caixa = el('div', null, 'lista');
    linhas.slice(0, estado.lim.top).forEach(function (x) {
      var pil = x.m.tem === null ? [] : [pilula(x.m.tem ? 'já tenho' : 'falta', x.m.tem ? 'ok' : 'am')];
      if (ytl.playlistId) {
        var noYt = !!(ytl.feitas[x.m.f.id] || ytl.manual[x.m.f.id]);
        pil.push(pilula(noYt ? 'no YouTube' : (ytl.sem[x.m.f.id] ? 'sem resultado' : 'falta no YouTube'), noYt ? 'ok' : 'am'));
      }
      caixa.appendChild(itemLista(x.m.f.t, x.m.f.a, pil, x.pos));
    });
    rodapeMais(caixa, 'top', linhas.length);
    c.appendChild(caixa);
  }

  // ---------- YouTube: criar a playlist aos poucos (grátis, respeitando a cota do dia) ----------

  function cartaoYoutube(c, id, L, ytl) {
    var q = YT.quantas(id, L.faixas);
    var feitas = L.faixas.filter(function (f) { return ytl.feitas[f.id] || ytl.manual[f.id]; }).length;
    var sem = L.faixas.filter(function (f) { return ytl.sem[f.id]; }).length;
    var cx = el('section', null, 'yt');
    cx.appendChild(el('h2', 'Playlist no YouTube (opcional)', 'eyebrow'));
    cx.appendChild(el('p', 'Passo a passo: 1) clique em "Entrar com YouTube". 2) clique em "Enviar as próximas músicas". 3) Se a cota do dia acabar, volte amanhã e clique de novo: continua de onde parou.', 'nota'));
    var txt = ytl.playlistId
      ? 'Já estão na playlist: ' + feitas + ' de ' + L.faixas.length + '.' + (sem ? ' Sem resultado na busca: ' + sem + '.' : '') + ' Faltam: ' + (L.faixas.length - feitas - sem) + '.'
      : 'A playlist ainda não foi criada. Ela é criada como privada, só você vê.';
    cx.appendChild(el('p', txt, 'yt-texto'));
    if (sem) {
      var fora = [];
      L.faixas.forEach(function (f, i) { if (ytl.sem[f.id]) fora.push((i + 1) + '. ' + f.a + ' - ' + f.t); });
      var caixaSem = el('div', null, 'yt-sem');
      caixaSem.appendChild(el('p', 'Não consegui colocar ' + sem + ' música(s) na playlist (não achei no YouTube):'));
      var ulSem = el('ul');
      fora.forEach(function (t) { ulSem.appendChild(el('li', t)); });
      caixaSem.appendChild(ulSem);
      var barraSem = el('div', null, 'barra-chips');
      var bCop = el('button', 'Copiar essa lista', 'btn-s');
      bCop.type = 'button';
      bCop.onclick = function () {
        navigator.clipboard.writeText(fora.join('\n')).then(function () { bCop.textContent = 'Copiado!'; }, function () { bCop.textContent = 'Não consegui copiar'; });
      };
      barraSem.appendChild(bCop);
      var bMan = el('button', 'Já adicionei na mão (' + sem + ')', 'btn-s');
      bMan.type = 'button';
      bMan.onclick = function () { YT.marcarManual(id); desenhar(true); };
      barraSem.appendChild(bMan);
      caixaSem.appendChild(barraSem);
      cx.appendChild(caixaSem);
    }
    cx.appendChild(el('p', 'Cota grátis de hoje: usei ' + YT.usado() + ' de ' + YT.COTA + '. Hoje ainda cabem cerca de ' + q.lote.length + ' músicas. O que não couber continua amanhã, de onde parou.', 'nota'));
    var bar = el('div', null, 'barra-chips');
    if (!YT.token) {
      var bE = el('button', 'Entrar com YouTube', 'btn-p');
      bE.type = 'button';
      bE.onclick = ytEntrar;
      bar.appendChild(bE);
    } else {
      var bV = el('button', q.lote.length ? 'Enviar as próximas ' + q.lote.length + ' músicas' : (q.pendentes ? 'A cota de hoje acabou. Volte amanhã' : 'Playlist completa'), 'btn-p');
      bV.type = 'button';
      bV.disabled = YT.ocupado || !q.lote.length;
      bV.onclick = function () { ytEnviar(id, L); };
      bar.appendChild(bV);
    }
    if (ytl.playlistId) {
      var bA = el('button', 'Abrir no YouTube', 'btn-s');
      bA.type = 'button';
      bA.onclick = function () { window.open('https://www.youtube.com/playlist?list=' + encodeURIComponent(ytl.playlistId), '_blank', 'noopener'); };
      bar.appendChild(bA);
      var bF = el('button', estado.soFaltaYt ? 'Mostrar todas' : 'Mostrar só o que falta no YouTube', 'btn-s');
      bF.type = 'button';
      bF.onclick = function () { estado.soFaltaYt = !estado.soFaltaYt; estado.lim.top = PAGINA; desenhar(true); };
      bar.appendChild(bF);
    }
    if (sem) {
      var bS = el('button', 'Tentar de novo as ' + sem + ' sem resultado', 'btn-s');
      bS.type = 'button';
      bS.onclick = function () { YT.liberarSem(id); desenhar(true); };
      bar.appendChild(bS);
    }
    cx.appendChild(bar);
    c.appendChild(cx);
  }

  async function ytEntrar() {
    try {
      await carregarGoogle();
      var cliente = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: YT.ESCOPO,
        include_granted_scopes: false,
        callback: function (r) {
          if (r && r.access_token) {
            YT.token = r.access_token;
            D.msg = 'Conectado ao YouTube. Agora clique em "Enviar as próximas músicas".';
          } else {
            D.msg = 'Não consegui entrar no YouTube' + (r && r.error ? ' (' + r.error + ')' : '') + '. Tente de novo.';
          }
          desenhar(true);
        },
        error_callback: function (e) {
          D.msg = 'Não consegui entrar no YouTube' + (e && e.type ? ' (' + e.type + ')' : '') + '. Tente de novo.';
          desenhar(true);
        }
      });
      cliente.requestAccessToken({ prompt: '' });
    } catch (e) {
      D.msg = e.message;
    }
  }

  async function ytEnviar(id, L) {
    if (YT.ocupado) return;
    UI.quieto = false;
    var p = YT.enviar(id, L.nome, L.faixas, function (i, total, f) {
      D.msg = 'Enviando para o YouTube ' + i + ' de ' + total + ': ' + f.a + ' - ' + f.t + ' (não feche esta página)';
    });
    desenhar(true);
    try {
      var r = await p;
      var ytl = YT.lista(id);
      var feitas = L.faixas.filter(function (f) { return ytl.feitas[f.id] || ytl.manual[f.id]; }).length;
      var txt = 'Pronto! Coloquei ' + r.colocadas + ' música(s) na playlist.';
      if (r.semNovas) txt += ' ' + r.semNovas + ' não achei no YouTube (veja quais no quadro amarelo da playlist).';
      if (r.parou === 'completa') txt += ' A playlist está completa.';
      else txt += ' Já estão ' + feitas + ' de ' + L.faixas.length + '.' + (r.parou === 'cota' ? ' A cota grátis de hoje acabou: volte amanhã (ela renova de madrugada, entre 4h e 5h em Brasília) e clique de novo para continuar.' : ' Clique de novo para continuar.');
      D.msg = txt;
    } catch (e) {
      D.msg = e.message;
    }
    desenhar(true);
  }

  function abaNovidades(c) {
    if (!CH.historico.length) { c.appendChild(vazio('Ainda sem novidades. Elas aparecem quando uma lista mudar entre duas atualizações.')); return; }
    var itens = [];
    CH.historico.slice(0, 40).forEach(function (h) {
      itens.push({ cab: new Date(h.d + 'T12:00:00').toLocaleDateString('pt-BR') + ' · ' + h.nome });
      (h.entraram || []).forEach(function (f) { itens.push({ f: f, entrou: true }); });
      (h.sairam || []).forEach(function (f) { itens.push({ f: f, entrou: false }); });
    });
    var caixa = el('div', null, 'lista');
    itens.slice(0, estado.lim.novidades).forEach(function (x) {
      if (x.cab) { caixa.appendChild(el('div', x.cab, 'cab-lista')); return; }
      var pil = [pilula(x.entrou ? 'entrou' : 'saiu', x.entrou ? 'ok' : '')];
      if (x.entrou && estado.b.length) { var t = tenho(x.f); pil.push(pilula(t ? 'já tenho' : 'falta', t ? 'ok' : 'am')); }
      caixa.appendChild(itemLista(x.f.t, x.f.a, pil));
    });
    rodapeMais(caixa, 'novidades', itens.length);
    c.appendChild(caixa);
  }



  // ---------- Google Drive: gerar arquivos JSON de playlists ----------

  function nomeDoArquivo(c) { return c.slice(c.lastIndexOf('/') + 1); }
  function pastaDoArquivo(c) { return c.slice(0, c.lastIndexOf('/')); }

  // Separa "Grelo, Henrique & Juliano" em ["Grelo", "Henrique & Juliano"].
  function nomesArtistas(s) {
    return (s || '').split(/\s*,\s*|\s+(?:feat|ft|part)\.?\s+/i).map(function (x) { return x.trim(); }).filter(Boolean);
  }

  // Descobre, para cada arquivo, onde está o cantor: no começo ("Cantor - Música")
  // ou no fim ("Música - Cantor"). Aceita os dois jeitos, misturados.
  // Ele vê quais nomes se repetem em muitos arquivos: esses são os cantores.
  function preparar(lista) {
    var cont = {};
    var dados = lista.map(function (m) {
      var nome = nomeDoArquivo(m.c);
      var i = nome.lastIndexOf('.');
      var sem = i < 0 ? nome : nome.slice(0, i);
      return { m: m, sem: sem, ps: sem.split(' - ').map(function (x) { return x.trim(); }).filter(Boolean), lado: null };
    });
    function chaves(s) {
      return nomesArtistas(s).map(function (x) { return limpar(x, true); }).filter(Boolean);
    }
    function forca(s) {
      var mx = 0;
      chaves(s).forEach(function (k) { if (cont[k] > mx) mx = cont[k]; });
      return mx;
    }
    dados.forEach(function (d) {
      if (d.ps.length < 2) return;
      chaves(d.ps[0]).concat(chaves(d.ps[d.ps.length - 1])).forEach(function (k) {
        cont[k] = (cont[k] || 0) + 1;
      });
    });
    var votos = { first: 0, last: 0 };
    dados.forEach(function (d) {
      if (d.ps.length < 2) return;
      var f = forca(d.ps[0]);
      var l = forca(d.ps[d.ps.length - 1]);
      if (Math.max(f, l) >= 3 && f !== l) {
        d.lado = f > l ? 'first' : 'last';
        votos[d.lado]++;
      }
    });
    // Se não deu para saber, usa o jeito que mais aparece. Empate: "Música - Cantor".
    var padrao = votos.first > votos.last ? 'first' : 'last';
    dados.forEach(function (d) {
      var n;
      if (d.ps.length < 2) {
        n = { a: '', as: [], t: d.sem.trim() };
      } else {
        var lado = d.lado || padrao;
        var a = lado === 'first' ? d.ps[0] : d.ps[d.ps.length - 1];
        var t = lado === 'first' ? d.ps.slice(1).join(' - ') : d.ps.slice(0, -1).join(' - ');
        n = { a: a, as: nomesArtistas(a), t: t };
      }
      d.m.n = n;
    });
  }

  function lerNome(m) {
    if (m.n) return m.n;
    var nome = nomeDoArquivo(m.c);
    var i = nome.lastIndexOf('.');
    return { a: '', as: [], t: (i < 0 ? nome : nome.slice(0, i)).trim() };
  }

  function faixaLocal(m) {
    var n = lerNome(m);
    return { fn: nomeDoArquivo(m.c), p: pastaDoArquivo(m.c), t: n.t, a: n.a };
  }

  function achar(f) {
    var t = limpar(f.t, true);
    if (!t) return null;
    var a = limpar((f.a || '').split(/,|&| feat/)[0], true);
    for (var i = 0; i < estado.lib.length; i++) {
      if (casa(estado.lib[i].b, t, a)) return estado.lib[i];
    }
    return null;
  }

  function faixasDaLista(id, n) {
    var chave = id + '|' + n;
    if (estado.cache[chave]) return estado.cache[chave];
    var vistos = {};
    var out = [];
    CH.listas[id].faixas.slice(0, n).forEach(function (f) {
      var m = achar(f);
      if (m && !vistos[m.c]) {
        vistos[m.c] = true;
        out.push({ fn: nomeDoArquivo(m.c), p: pastaDoArquivo(m.c), t: f.t, a: f.a });
      }
    });
    estado.cache[chave] = out;
    return out;
  }

  function playlistDaLista(id, n) {
    var L = CH.listas[id];
    return {
      nome: L.nome.replace(/^Top 200/, 'Top ' + n) + (/^Top 200/.test(L.nome) ? '' : ' (primeiras ' + n + ')'),
      origem: L.fonte,
      regra: { tipo: 'lista', itens: L.faixas.slice(0, n).map(function (f) { return { t: f.t, a: f.a }; }) },
      faixas: faixasDaLista(id, n)
    };
  }

  function nomeSeguro(t) {
    return limpar(t, false).replace(/ /g, '-').slice(0, 40) || 'playlist';
  }

  // Aviso grande na faixa do topo (ui.js).
  function aviso(msg) { UI.msg(msg); }

  function baixar(arquivo, playlists, manterVazias) {
    if (!manterVazias) playlists = playlists.filter(function (p) { return p.faixas.length > 0; });
    if (!playlists.length) {
      aviso('Não achei nenhuma música dessa playlist na sua pasta. Nada foi baixado.');
      return;
    }
    var obj = { formato: 'toxic-playlists', v: 2, gerado: new Date().toISOString(), playlists: playlists };
    var blob = new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = arquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
    var total = playlists.reduce(function (s, p) { return s + p.faixas.length; }, 0);
    aviso('Pronto! Baixei ' + arquivo + ' com ' + playlists.length + ' playlist(s) e ' + total + ' músicas.');
  }

  function playlistPorCantor(texto) {
    var toks = limpar(texto, true).split(' ').filter(function (x) { return x && x !== 'e' && x !== 'x' && x !== 'and'; });
    if (!toks.length) return null;
    var faixas = [];
    estado.lib.forEach(function (m) {
      var h = limpar(m.c, true);
      if (toks.every(function (t) { return h.indexOf(t) >= 0; })) faixas.push(faixaLocal(m));
    });
    return { nome: texto.trim(), origem: 'Cantor', regra: { tipo: 'artista', nome: texto.trim() }, faixas: faixas };
  }

  function artistas() {
    var mapa = {};
    estado.lib.forEach(function (m) {
      var n = lerNome(m);
      if (!n.as || !n.as.length) return;
      var jaFoi = {};
      n.as.forEach(function (nomeArt) {
        var k = limpar(nomeArt, true);
        if (!k || jaFoi[k]) return;
        jaFoi[k] = true;
        if (!mapa[k]) mapa[k] = { nome: nomeArt, faixas: [] };
        mapa[k].faixas.push(faixaLocal(m));
      });
    });
    return Object.keys(mapa).map(function (k) { return mapa[k]; }).sort(function (x, y) { return y.faixas.length - x.faixas.length; });
  }

  function plArtista(a) {
    return { nome: a.nome, origem: 'Cantor', regra: { tipo: 'artista', nome: a.nome }, faixas: a.faixas };
  }

  // ---------- Minhas playlists: o que mudou em cada pasta e o que vira playlist ----------
  // O registro fica só neste navegador. Guarda códigos curtos das músicas, nunca nomes nem conteúdo.
  var REG_CH = 'gm_playlists_v1';
  var reg = { v: 1, base: null, vistas: {}, cfg: {}, hist: [], dias: 14, semRec: false, rev: 0, zerado: false };

  function hsh(s) {
    var a = 5381, b = 2166136261;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      a = ((a << 5) + a + c) | 0;
      b = Math.imul(b ^ c, 16777619) | 0;
    }
    return (a >>> 0).toString(36) + (b >>> 0).toString(36);
  }
  function hk(m) { return m.hk || (m.hk = hsh(oDe(m))); }

  function regCarregar() {
    try {
      var x = JSON.parse(localStorage.getItem(REG_CH) || 'null');
      if (x && x.v === 1) {
        reg.base = x.base || null;
        reg.vistas = x.vistas || {};
        reg.cfg = x.cfg || {};
        reg.hist = x.hist || [];
        reg.dias = x.dias || 14;
        reg.semRec = !!x.semRec;
      }
    } catch (e) { /* sem problema */ }
  }
  function regSalvar() {
    reg.rev++;
    try { localStorage.setItem(REG_CH, JSON.stringify(reg)); return true; } catch (e) {
      aviso('Não consegui guardar o registro das playlists neste navegador (sem espaço). O site continua funcionando, mas pode esquecer o que mudou.');
      return false;
    }
  }

  // Dia em que o site viu a música pela primeira vez. Na primeira leitura usa a data do arquivo no PC.
  function regVistas(lista) {
    if (!lista.length) return;
    var primeira = !Object.keys(reg.vistas).length;
    var agora = Date.now();
    lista.forEach(function (m) {
      var k = hk(m);
      if (!reg.vistas[k]) reg.vistas[k] = m.dr ? (m.m || agora) : (primeira ? (m.m || agora) : agora);
    });
    regSalvar();
  }
  function dataDe(m) { return reg.vistas[hk(m)] || m.m || 0; }

  // ---------- Biblioteca: junta o Drive, a pasta do PC (se houver) e a memória do arquivo de playlists ----------
  // O Drive é a fonte principal. A pasta do PC só ajuda a ver o que ainda falta subir.
  // Memória: quando a mesma música está em duas playlists, o site sobe UMA cópia só (fica em uma pasta do Drive).
  // O arquivo de playlists antigo lembra em quais playlists ela estava, então a gente usa isso para não perder a música.

  function relDoDrive(cam) { return cam === PASTA_RAIZ ? PASTA_RAIZ : cam.slice(PASTA_RAIZ.length + 1); }

  // Uma música do Drive no mesmo formato das músicas da pasta do PC (c = caminho/arquivo).
  function itemDoDrive(d) {
    if (!d.mm) d.mm = { c: relDoDrive(d.p) + '/' + d.fn, k: d.k, b: d.b, t: d.t, m: d.m || 0, id: d.id, dr: 1 };
    return d.mm;
  }

  var cacheInfo = null;
  function reconstruir() {
    estado.ver++;
    estado.cache = {};
    cacheInfo = null;
    dzMemo = {};
    var vistos = {};
    var lib = [];
    var idsSite = {};
    function add(m) {
      var ch = pastaDoArquivo(m.c) + '\u0001' + oDe(m);
      if (vistos[ch]) return;
      vistos[ch] = true;
      lib.push(m);
    }
    if (D.itens) {
      D.itens.forEach(function (d) {
        if (!d.site) return;
        var o = oDe(d);
        if (!idsSite[o]) idsSite[o] = d.id;
        add(itemDoDrive(d));
      });
    }
    estado.arquivos.forEach(add);
    if (D.itens) {
      (D.anterior || []).concat(estado.fantasmas).forEach(function (a) {
        var o = chaveOrdem(a.k);
        if (idsSite[o]) add({ c: a.c, k: a.k, b: a.b, t: 0, m: 0, id: idsSite[o], carry: 1 });
      });
    }
    preparar(lib);
    estado.lib = lib;
    var unicos = {};
    lib.forEach(function (m) { unicos[m.b] = 1; });
    estado.b = Object.keys(unicos);
    memoTenho = {};
    regVistas(lib);
    if (lib.length) salvar();
  }

  // Lê o arquivo de playlists que já está no Drive e guarda só quais músicas estavam em cada pasta.
  async function lerAnterior() {
    D.anterior = [];
    try {
      var pastasT = await listarDrive("name='Toxic Playlists' and mimeType='application/vnd.google-apps.folder' and trashed=false", 'id');
      for (var i = 0; i < pastasT.length; i++) {
        var arq = await listarDrive("name='playlists-inteligentes.json' and '" + pastasT[i].id + "' in parents and trashed=false", 'id');
        if (!arq.length) continue;
        var j = await api(API + '/' + encodeURIComponent(arq[0].id) + '?alt=media&supportsAllDrives=true');
        if (j && j.formato === 'toxic-playlists' && Array.isArray(j.playlists)) {
          j.playlists.forEach(function (p) {
            if (!p || !p.regra || p.regra.tipo !== 'pasta' || !Array.isArray(p.faixas)) return;
            p.faixas.forEach(function (f) {
              if (!f || !f.fn || !f.p) return;
              var i2 = f.fn.lastIndexOf('.');
              var sem = i2 < 0 ? f.fn : f.fn.slice(0, i2);
              D.anterior.push({ c: f.p + '/' + f.fn, k: chaveNome(sem, false), b: chaveNome(sem, true) });
            });
          });
        }
        break;
      }
    } catch (e) {
      if (!D.token) throw e; // o login venceu: avisa
      D.anterior = []; // sem o arquivo antigo o site continua; só não lembra das playlists que dividem músicas
    }
  }

  // Se o registro de "o que é novo" veio da pasta do PC e as pastas do Drive não batem, recomeça a contar (sem inventar novidade).
  function conferirBase() {
    if (!reg.base || !estado.lib.length) return;
    var chaves = Object.keys(reg.base.pastas);
    if (!chaves.length) return;
    var atuais = {};
    estado.lib.forEach(function (m) { atuais[pastaDoArquivo(m.c)] = 1; });
    var iguais = chaves.filter(function (p) { return atuais[p]; }).length;
    if (iguais < chaves.length / 2) { reg.base = null; reg.zerado = true; regSalvar(); }
  }

  // Uma linha por pasta: quantas músicas, quantas são novas desde a última atualização, quantas ainda faltam subir.
  function infoPastas() {
    var chave = estado.ver + ':' + reg.rev + ':' + (D.itens ? D.itens.length : -1);
    if (cacheInfo && cacheInfo.k === chave) return cacheInfo.v;
    var mapa = {}, ordem = [];
    estado.lib.forEach(function (m) {
      var p = pastaDoArquivo(m.c);
      if (!mapa[p]) { mapa[p] = { p: p, nome: p.slice(p.lastIndexOf('/') + 1) || p, ms: [], ch: {} }; ordem.push(p); }
      mapa[p].ms.push(m);
      mapa[p].ch[hk(m)] = 1;
    });
    var noSite = null;
    if (D.itens) { noSite = {}; D.itens.forEach(function (d) { if (d.site) noSite[oDe(d)] = 1; }); }
    var lista = ordem.map(function (p) {
      var x = mapa[p];
      x.ms.sort(function (a, b) { var na = nomeDoArquivo(a.c).toLowerCase(), nb = nomeDoArquivo(b.c).toLowerCase(); return na < nb ? -1 : (na > nb ? 1 : 0); });
      var cfg = reg.cfg[p] || {};
      var base = reg.base && reg.base.pastas[p];
      var bs = {};
      if (base) base.forEach(function (h) { bs[h] = 1; });
      x.base = !!base;
      x.bs = bs;
      x.novas = base ? Object.keys(x.ch).filter(function (h) { return !bs[h]; }).length : 0;
      x.saiu = base ? base.filter(function (h) { return !x.ch[h]; }).length : 0;
      x.nova = !!reg.base && !base;
      x.oculta = !!cfg.oculta;
      x.mostrado = cfg.nome || x.nome;
      x.cantor = ehPastaDeCantor(p);
      x.semDrive = noSite ? x.ms.filter(function (m) { return !m.dr && !m.carry && !noSite[oDe(m)]; }).length : 0;
      return x;
    });
    var sumiram = reg.base ? Object.keys(reg.base.pastas).filter(function (p) { return !mapa[p]; }) : [];
    var v = { lista: lista, sumiram: sumiram };
    cacheInfo = { k: chave, v: v };
    return v;
  }

  function fotoPastas(info) {
    var o = {};
    info.lista.forEach(function (x) { o[x.p] = Object.keys(x.ch); });
    return o;
  }
  // "Já atualizei antes": passa a contar o que é novo a partir de agora, sem registrar no histórico.
  function marcarBase() {
    reg.base = { d: Date.now(), pastas: fotoPastas(infoPastas()) };
    regSalvar();
  }
  // Chamada quando o arquivo de playlists foi enviado: guarda o histórico e passa a contar a partir daqui.
  function registrarAtualizacao() {
    var info = infoPastas();
    var itens = [];
    info.lista.forEach(function (x) {
      if (x.oculta) return;
      if (x.nova) itens.push({ p: x.mostrado, mais: x.ms.length, menos: 0, nova: 1 });
      else if (x.novas || x.saiu) itens.push({ p: x.mostrado, mais: x.novas, menos: x.saiu });
    });
    info.sumiram.forEach(function (p) { itens.push({ p: p.slice(p.lastIndexOf('/') + 1), mais: 0, menos: reg.base.pastas[p].length, sumiu: 1 }); });
    var h = { d: Date.now(), itens: itens.slice(0, 60), primeira: reg.base ? 0 : 1 };
    reg.hist.unshift(h);
    reg.hist = reg.hist.slice(0, 30);
    reg.base = { d: h.d, pastas: fotoPastas(info) };
    regSalvar();
    return h;
  }
  function textoMudanca(h) {
    if (h.primeira) return ' Primeira atualização registrada: da próxima vez, o site mostra só o que mudou em cada playlist.';
    var mais = 0, n = 0;
    h.itens.forEach(function (i) { mais += i.mais; if (i.mais) n++; });
    return mais ? ' Mudou: ' + mais + ' música(s) nova(s) em ' + n + ' playlist(s).' : ' Nenhuma música nova nas playlists desta vez.';
  }

  // Playlist automática com o que chegou nos últimos N dias (mais novas primeiro).
  function playlistRecentes() {
    if (reg.semRec) return null;
    var lim = Date.now() - reg.dias * 86400000;
    var vistos = {};
    var arr = [];
    estado.lib.forEach(function (m) {
      var d = dataDe(m);
      var h = hk(m);
      if (d >= lim && !vistos[h]) { vistos[h] = 1; arr.push({ m: m, d: d }); }
    });
    if (!arr.length) return null;
    arr.sort(function (a, b) { return b.d - a.d; });
    var faixas = arr.slice(0, 500).map(function (x) { return faixaLocal(x.m); });
    return { nome: 'Adicionadas recentemente', origem: 'Pasta', regra: { tipo: 'lista', itens: faixas.map(function (f) { return { t: f.t, a: f.a }; }) }, faixas: faixas };
  }

  // Uma playlist por pasta. Pastas escondidas ficam de fora; as músicas novas (desde a última atualização) vão para o topo.
  function pastas() {
    var info = infoPastas().lista;
    var vezes = {};
    info.forEach(function (x) { vezes[x.nome] = (vezes[x.nome] || 0) + 1; });
    return info.filter(function (x) { return !x.oculta; }).map(function (x) {
      var cfg = reg.cfg[x.p] || {};
      var nome = cfg.nome || (vezes[x.nome] > 1 ? x.p.split('/').slice(-2).join(' / ') : x.nome);
      var ms = x.ms.map(function (m, i) { return { m: m, i: i, nova: (x.base && !x.bs[hk(m)]) ? 1 : 0, d: dataDe(m) }; });
      ms.sort(function (a, b) { return (b.nova - a.nova) || (a.nova ? b.d - a.d : 0) || (a.i - b.i); });
      return { nome: nome, origem: 'Pasta', regra: { tipo: 'pasta', nome: x.nome }, faixas: ms.map(function (y) { return faixaLocal(y.m); }) };
    });
  }

  function todasPlaylists() {
    var todas = Object.keys(CH.listas).map(function (id) { return playlistDaLista(id, estado.n); });
    artistas().filter(function (a) { return a.faixas.length >= 5; }).forEach(function (a) { todas.push(plArtista(a)); });
    pastas().forEach(function (p) { todas.push(p); });
    var rec = playlistRecentes();
    if (rec) todas.unshift(rec);
    return todas;
  }

  function dataTxt(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function ehPastaDeCantor(p) { return p.split('/').slice(0, -1).some(function (s) { return s.toLowerCase() === 'artistas'; }); }

  // ---------- Deezer: conferir o que falta em cada playlist ----------
  // O Deezer não deixa o navegador fazer chamadas diretas (CORS). Por isso usamos o modo "JSONP" do Deezer:
  // o site carrega um pequeno script de https://api.deezer.com (liberado só esse endereço na CSP do index.html).
  // Sem chave, sem senha. As escolhas e os resultados ficam só neste navegador.

  var DZ_CH = 'gm_deezer_v1';
  var dz = { v: 1, cfg: {}, res: {}, quando: 0 };
  var dzMemo = {};
  var dzSeq = 0;
  var dzUltimo = 0;

  function dzCarregar() {
    try {
      var x = JSON.parse(localStorage.getItem(DZ_CH) || 'null');
      if (x && x.v === 1) { dz.cfg = x.cfg || {}; dz.res = x.res || {}; dz.quando = x.quando || 0; }
    } catch (e) { /* sem problema */ }
  }
  var dzAvisouEspaco = false;
  function dzSalvar() {
    try { localStorage.setItem(DZ_CH, JSON.stringify(dz)); } catch (e) {
      if (!dzAvisouEspaco) { dzAvisouEspaco = true; aviso('Não consegui guardar o resultado do Deezer neste navegador (sem espaço). O site continua funcionando, mas vai esquecer ao fechar.'); }
    }
  }

  function pausa(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Nome sem acento, sem maiúsculas e sem símbolos.
  function normNome(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }
  function palavrasDe(s) { var o = {}; s.split(' ').forEach(function (w) { if (w) o[w] = 1; }); return o; }
  function parecido(a, b) {
    if (!a || !b) return false;
    if ((' ' + a + ' ').indexOf(' ' + b + ' ') >= 0 || (' ' + b + ' ').indexOf(' ' + a + ' ') >= 0) return true;
    var pa = palavrasDe(a), pb = palavrasDe(b);
    var ka = Object.keys(pa), kb = Object.keys(pb);
    var comum = ka.filter(function (w) { return pb[w]; }).length;
    var uniao = ka.length + kb.length - comum;
    return uniao > 0 && comum / uniao >= 0.6;
  }

  // Uma chamada ao Deezer pelo modo JSONP. Espera um pouco entre chamadas (limite do Deezer: 50 a cada 5 segundos).
  async function dzChamar(caminho, params, tentativa) {
    var agora = Date.now();
    var falta = dzUltimo + 300 - agora;
    dzUltimo = Math.max(agora, dzUltimo) + (falta > 0 ? falta : 0);
    if (falta > 0) await pausa(falta);
    var dados = await new Promise(function (ok, erro) {
      var nome = 'gmdz' + (++dzSeq) + '_' + Date.now().toString(36);
      var s = document.createElement('script');
      var fim = false;
      var tempo = setTimeout(function () {
        if (fim) return;
        fim = true;
        window[nome] = function () { /* resposta que chegou tarde: ignora */ };
        s.remove();
        var e = new Error('O Deezer não respondeu a tempo.');
        e.rede = true;
        erro(e);
      }, 15000);
      window[nome] = function (d) {
        if (fim) return;
        fim = true;
        clearTimeout(tempo);
        try { delete window[nome]; } catch (e2) { window[nome] = undefined; }
        s.remove();
        ok(d);
      };
      s.onerror = function () {
        if (fim) return;
        fim = true;
        clearTimeout(tempo);
        window[nome] = function () { /* ignora */ };
        s.remove();
        var e = new Error('Não consegui falar com o Deezer. Pode ser um bloqueador de anúncios ou a internet.');
        e.rede = true;
        erro(e);
      };
      s.src = 'https://api.deezer.com' + caminho + '?' + (params ? params + '&' : '') + 'output=jsonp&callback=' + nome;
      document.head.appendChild(s);
    });
    if (dados && dados.error) {
      var cod = dados.error.code;
      if (cod === 4 || /quota/i.test(dados.error.message || '')) {
        if (!tentativa) { await pausa(6000); return dzChamar(caminho, params, 1); }
        var el1 = new Error('O Deezer pediu para esperar um pouco (limite de chamadas).');
        el1.limite = true;
        throw el1;
      }
      var e3 = new Error('O Deezer respondeu com erro' + (dados.error.message ? ' (' + dados.error.message + ')' : '') + '.');
      e3.codigo = cod;
      e3.naoAchou = cod === 800 || /no data|not found/i.test(dados.error.message || '');
      throw e3;
    }
    return dados || {};
  }

  // Dentre os resultados da busca, acha a playlist certa: uma só com o mesmo nome (vale), ou várias parecidas (você escolhe).
  function dzEscolher(nomeBusca, resultados, nLocal) {
    var alvo = normNome(nomeBusca);
    var lista = (resultados || []).filter(function (r) { return r && r.id && r.title; }).map(function (r) {
      return { id: String(r.id), nome: String(r.title), n: Number(r.nb_tracks) || 0, dono: (r.user && r.user.name) ? String(r.user.name) : '', norm: normNome(String(r.title)) };
    });
    var exatas = lista.filter(function (c) { return c.norm === alvo; });
    if (exatas.length === 1) return { auto: exatas[0] };
    var cand = exatas.length ? exatas : lista.filter(function (c) { return parecido(alvo, c.norm); });
    if (!cand.length) return { nada: true };
    cand.sort(function (a, b) { return Math.abs(a.n - nLocal) - Math.abs(b.n - nLocal); });
    return { cand: cand.slice(0, 5).map(function (c) { return { id: c.id, nome: c.nome, n: c.n, dono: c.dono }; }) };
  }

  // Todas as músicas de uma playlist do Deezer (de 100 em 100).
  async function dzFaixas(id) {
    var out = [];
    var idx = 0;
    var total = null;
    for (var pag = 0; pag < 40; pag++) {
      var r = await dzChamar('/playlist/' + encodeURIComponent(id) + '/tracks', 'limit=100&index=' + idx);
      var data = Array.isArray(r.data) ? r.data : [];
      if (total === null && r.total != null) total = Number(r.total);
      data.forEach(function (t) {
        if (!t) return;
        var a = (t.artist && t.artist.name) || '';
        var ti = t.title || '';
        var ts = t.title_short || '';
        out.push(ts && ts !== ti ? [a, ti, ts] : [a, ti]);
      });
      idx += data.length;
      if (!data.length || (total !== null && idx >= total) || (total === null && !r.next)) break;
    }
    return { fx: out, total: total };
  }

  // Confere uma playlist: acha no Deezer (ou usa o link/escolha guardados) e guarda as músicas de lá.
  async function dzUma(x) {
    var cfg = dz.cfg[x.p] || {};
    var r = { q: Date.now() };
    var id = cfg.id || null;
    if (!id) {
      var busca = await dzChamar('/search/playlist', 'q=' + encodeURIComponent(x.nome) + '&limit=25');
      var esc = dzEscolher(x.nome, busca.data, x.ms.length);
      if (esc.auto) { id = esc.auto.id; r.nome = esc.auto.nome; r.dono = esc.auto.dono; r.n = esc.auto.n; }
      else if (esc.cand) { r.est = 'varias'; r.cand = esc.cand; dz.res[x.p] = r; return; }
      else { r.est = 'naoachei'; dz.res[x.p] = r; return; }
    }
    try {
      if (!r.nome) {
        var meta = await dzChamar('/playlist/' + encodeURIComponent(id), '');
        r.nome = meta.title ? String(meta.title) : '';
        r.dono = (meta.creator && meta.creator.name) ? String(meta.creator.name) : '';
      }
      var f = await dzFaixas(id);
      r.est = 'ok';
      r.id = String(id);
      r.fx = f.fx;
      r.n = f.total !== null ? f.total : f.fx.length;
    } catch (e) {
      if (e.naoAchou && cfg.id) { r.est = 'naoachei'; r.msg = 'Esse link não abriu no Deezer (a playlist pode ser privada ou ter sido apagada).'; }
      else throw e;
    }
    dz.res[x.p] = r;
  }

  // Tira "e", "x" e "and" ("Henrique e Juliano" = "Henrique & Juliano").
  function semE(s) { return (s || '').split(' ').filter(function (w) { return w && w !== 'e' && w !== 'x' && w !== 'and'; }).join(' '); }

  // A música do Deezer [cantor, título, título curto] está nesta playlist? (reaproveita casa(), que compara título e cantor)
  function dzTem(ms, f) {
    var a = limpar((f[0] || '').split(/,|&| feat/)[0], true);
    var vars = [];
    [f[1], f[2], (f[1] || '').split(' - ')[0]].forEach(function (tv) {
      var t = limpar(tv || '', true);
      if (t && vars.indexOf(t) < 0) vars.push(t);
    });
    for (var v = 0; v < vars.length; v++) {
      var t = vars[v];
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i];
        var semArt = !!(m.n && !m.n.a);
        if (casa(m.b, t, semArt ? '' : a)) return true;
        if (casa(semE(m.b), semE(t), semArt ? '' : semE(a))) return true;
      }
    }
    return false;
  }

  // Lista (sempre atual) do que falta nesta playlist, comparando com o que o Drive tem agora.
  function dzFaltam(x) {
    var r = dz.res[x.p];
    if (!r || r.est !== 'ok' || !Array.isArray(r.fx)) return null;
    var memo = dzMemo[x.p];
    if (memo && memo.q === r.q && memo.n === x.ms.length) return memo.f;
    var f = [];
    r.fx.forEach(function (t) { if (!dzTem(x.ms, t)) f.push({ a: t[0], t: t[1] }); });
    dzMemo[x.p] = { q: r.q, n: x.ms.length, f: f };
    return f;
  }

  // Palavra + cor de cada playlist.
  function dzStatus(x) {
    var cfg = dz.cfg[x.p] || {};
    if (cfg.nao) return { cls: 'neutro', txt: 'não procurei', botao: 'Opções' };
    var r = dz.res[x.p];
    if (!r) return { cls: 'neutro', txt: 'ainda não conferi', botao: 'Opções' };
    if (r.est === 'erro') return { cls: 'verm', txt: 'deu erro', botao: 'Opções' };
    if (r.est === 'naoachei') return { cls: 'am', txt: 'não achei', botao: 'Colar link' };
    if (r.est === 'varias') return { cls: 'am', txt: 'escolha uma', botao: 'Escolher' };
    var f = dzFaltam(x);
    if (f && f.length) return { cls: 'am', txt: (f.length === 1 ? 'falta 1' : 'faltam ' + f.length), botao: 'Ver lista', n: f.length };
    return { cls: 'ok', txt: 'em dia', botao: 'Opções' };
  }

  function pastaPorChave(p) { return infoPastas().lista.filter(function (x) { return x.p === p; })[0] || null; }

  // Playlists que entram na conferência: pastas de playlist (não as de cantor), que não estão escondidas nem marcadas "não procurar".
  function candidatasDz() {
    return infoPastas().lista.filter(function (x) { return !x.oculta && !x.cantor && !(dz.cfg[x.p] && dz.cfg[x.p].nao); });
  }

  // Confere um grupo de playlists, uma de cada vez, com pausas. Guarda o resultado a cada playlist.
  async function dzConferir(chaves) {
    if (DZ.ocupado || D.ocupado || D.tudo) return;
    DZ.ocupado = true;
    DZ.parar = false;
    UI.quieto = false;
    var feitas = 0, erros = 0, seguidos = 0, parou = '';
    desenhar(true);
    try {
      for (var i = 0; i < chaves.length; i++) {
        if (DZ.parar) { parou = 'voce'; break; }
        var x = pastaPorChave(chaves[i]);
        if (!x) continue;
        D.msg = 'Conferindo com o Deezer ' + (i + 1) + ' de ' + chaves.length + ': ' + x.nome + ' (não feche esta página)';
        try {
          await dzUma(x);
          seguidos = 0;
          feitas++;
        } catch (e) {
          if (e.limite) { parou = 'limite'; break; }
          dz.res[x.p] = { q: Date.now(), est: 'erro', msg: e.message };
          erros++;
          seguidos++;
          if (e.rede && seguidos >= 2) { parou = 'rede'; break; }
        }
        dzSalvar();
        if ((i + 1) % 5 === 0) { desenhar(true); await pausa(40); }
      }
    } finally {
      DZ.ocupado = false;
      dz.quando = Date.now();
      dzSalvar();
    }
    var txt;
    if (parou === 'rede') txt = 'Não consegui falar com o Deezer. Pode ser um bloqueador de anúncios, a internet ou o Deezer fora do ar. Conferi ' + feitas + ' antes de parar; o resultado ficou guardado.';
    else if (parou === 'limite') txt = 'O Deezer pediu para esperar um pouco (limite de chamadas). Conferi ' + feitas + '; o resultado ficou guardado. Tente de novo em alguns minutos.';
    else if (parou === 'voce') txt = 'Pronto! Parei como você pediu. Conferi ' + feitas + ' playlist(s); o resultado ficou guardado.';
    else txt = 'Pronto! Conferi ' + feitas + ' playlist(s) no Deezer.' + (erros ? ' ' + erros + ' deu erro; clique em Conferir de novo para tentar essas.' : '');
    D.msg = txt;
    desenhar(true);
  }

  // Link ou número da playlist do Deezer -> número.
  function idDoLink(txt) {
    var t = (txt || '').trim();
    var m = /playlist\/(\d+)/.exec(t);
    if (m) return m[1];
    if (/^\d{3,}$/.test(t)) return t;
    return null;
  }

  function copiar(txt, botao) {
    var padrao = botao.textContent;
    function ok() { botao.textContent = 'Copiado!'; setTimeout(function () { botao.textContent = padrao; }, 2500); }
    function nao() { botao.textContent = 'Não consegui copiar'; }
    try { navigator.clipboard.writeText(txt).then(ok, nao); } catch (e) { nao(); }
  }

  function pilulasMudanca(x) {
    var pil = [];
    if (x.nova) pil.push(pilula('playlist nova', 'am'));
    if (x.novas) pil.push(pilula('+' + x.novas + ' novas', 'am'));
    if (x.saiu) pil.push(pilula('−' + x.saiu + ' saíram', 'am'));
    if (x.semDrive) pil.push(pilula(x.semDrive + ' por enviar', 'am'));
    return pil;
  }

  function botaoPeq(txt, fazer) {
    var b = el('button', txt, 'btn-s peq');
    b.type = 'button';
    b.onclick = fazer;
    return b;
  }

  // ----- Janela de uma playlist: Deezer, renomear, esconder -----
  function abrirPlaylist(x0) {
    var corpo = el('div', null, 'dz-caixa');
    function atual() { return pastaPorChave(x0.p) || x0; }

    async function rodar(x) {
      await dzConferir([x.p]);
      montar();
    }

    function montar() {
      esvaziar(corpo);
      var x = atual();
      var cfg = dz.cfg[x.p] || {};
      var r = dz.res[x.p];
      var st = dzStatus(x);
      var ocup = !!(DZ.ocupado || D.ocupado || D.tudo);

      // 1) O que o Deezer diz
      corpo.appendChild(el('h3', 'Deezer'));
      var linha = el('div', null, 'dz-linha');
      linha.appendChild(pilula(st.txt, 'st ' + st.cls));
      if (r && r.est === 'ok' && r.nome) linha.appendChild(el('span', 'Playlist do Deezer: ' + r.nome + (r.n ? ' (' + r.n + ' músicas)' : '') + (r.dono ? ', de ' + r.dono : '')));
      corpo.appendChild(linha);
      if (r && r.est === 'ok' && r.id) {
        var ab = botaoPeq('Abrir no Deezer', function () { window.open('https://www.deezer.com/playlist/' + encodeURIComponent(r.id), '_blank', 'noopener'); });
        corpo.appendChild(ab);
      }

      if (cfg.nao) {
        corpo.appendChild(el('p', 'Você escolheu não procurar esta playlist no Deezer.', 'dz-msg'));
      } else if (!r) {
        corpo.appendChild(el('p', 'Ainda não conferi esta playlist. Clique em "Conferir esta agora".', 'dz-msg'));
      } else if (r.est === 'erro') {
        corpo.appendChild(el('p', (r.msg || 'Deu erro.') + ' Tente de novo.', 'dz-msg verm'));
      } else if (r.est === 'naoachei') {
        corpo.appendChild(el('p', r.msg || 'Não achei no Deezer uma playlist com o nome "' + x.nome + '". Se você renomeou a pasta, cole abaixo o link da playlist do Deezer. Se é uma playlist de nicho, marque "Não procurar esta".', 'dz-msg am'));
      } else if (r.est === 'varias') {
        corpo.appendChild(el('p', 'Achei mais de uma parecida. Escolha a certa (a sua pasta tem ' + x.ms.length + ' músicas):', 'dz-msg am'));
        (r.cand || []).forEach(function (c) {
          var b = el('button', null, 'dz-opcao');
          b.type = 'button';
          b.disabled = ocup;
          b.appendChild(el('b', c.nome));
          b.appendChild(el('span', c.n + ' músicas' + (c.dono ? ' · de ' + c.dono : '')));
          b.onclick = function () {
            dz.cfg[x.p] = { id: c.id };
            dzSalvar();
            rodar(x);
          };
          corpo.appendChild(b);
        });
      } else if (r.est === 'ok') {
        var f = dzFaltam(x) || [];
        if (!f.length) {
          corpo.appendChild(el('p', 'Você tem todas as músicas desta playlist do Deezer.', 'dz-msg ok'));
        } else {
          corpo.appendChild(el('p', 'Faltam ' + f.length + ' música(s) nesta playlist. Baixe só essas e coloque na pasta:', 'dz-msg am'));
          var lst = el('div', null, 'janela-lista');
          f.forEach(function (m) { lst.appendChild(el('div', (m.a ? m.a + ' - ' : '') + m.t, 'linha-simples')); });
          corpo.appendChild(lst);
          var bc = el('button', 'Copiar lista', 'btn-p peq');
          bc.type = 'button';
          bc.style.marginTop = '12px';
          bc.onclick = function () { copiar(f.map(function (m) { return (m.a ? m.a + ' - ' : '') + m.t; }).join('\n'), bc); };
          corpo.appendChild(bc);
        }
        if (r.q) corpo.appendChild(el('p', 'Conferido no Deezer em ' + dataTxt(r.q) + '. A lista acima se atualiza sozinha quando o Drive muda.', 'nota'));
      }

      // 2) Ações do Deezer
      var acoes = el('div', null, 'dz-linha');
      var bConf = el('button', r ? 'Conferir de novo' : 'Conferir esta agora', 'btn-s peq');
      bConf.type = 'button';
      bConf.disabled = ocup || !!cfg.nao;
      bConf.onclick = function () { rodar(x); };
      acoes.appendChild(bConf);
      corpo.appendChild(acoes);

      corpo.appendChild(el('p', 'Link da playlist do Deezer (se o site não achou sozinho):', 'rotulo'));
      var lk = el('div', null, 'dz-linha');
      var campo = document.createElement('input');
      campo.type = 'text';
      campo.className = 'campo';
      campo.placeholder = 'https://www.deezer.com/br/playlist/123456';
      campo.setAttribute('aria-label', 'Link da playlist do Deezer');
      if (cfg.id) campo.value = 'https://www.deezer.com/playlist/' + cfg.id;
      lk.appendChild(campo);
      var bLk = el('button', 'Usar este link', 'btn-s peq');
      bLk.type = 'button';
      bLk.disabled = ocup;
      var msgLk = el('p', '', 'dz-msg verm');
      msgLk.hidden = true;
      bLk.onclick = function () {
        var id = idDoLink(campo.value);
        if (!id) { msgLk.textContent = 'Não entendi esse link. Copie o endereço da playlist na barra do navegador (tem "playlist/" e um número).'; msgLk.hidden = false; return; }
        dz.cfg[x.p] = { id: id };
        dzSalvar();
        rodar(x);
      };
      lk.appendChild(bLk);
      if (cfg.id) {
        var bSem = botaoPeq('Procurar pelo nome de novo', function () { delete dz.cfg[x.p]; dzSalvar(); montar(); desenhar(true); });
        lk.appendChild(bSem);
      }
      corpo.appendChild(lk);
      corpo.appendChild(msgLk);

      var l2 = el('div', null, 'dz-linha');
      var lab = el('label');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!cfg.nao;
      cb.onchange = function () {
        var c2 = dz.cfg[x.p] || {};
        if (cb.checked) c2.nao = true; else delete c2.nao;
        if (c2.nao || c2.id) dz.cfg[x.p] = c2; else delete dz.cfg[x.p];
        dzSalvar();
        montar();
        desenhar(true);
      };
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode('Não procurar esta (playlist de nicho)'));
      l2.appendChild(lab);
      corpo.appendChild(l2);

      // 3) Nome no app e esconder
      corpo.appendChild(el('h3', 'No app'));
      var l3 = el('div', null, 'dz-linha');
      var nome = document.createElement('input');
      nome.type = 'text';
      nome.className = 'campo';
      nome.value = x.mostrado;
      nome.maxLength = 80;
      nome.setAttribute('aria-label', 'Nome da playlist no app');
      l3.appendChild(nome);
      l3.appendChild(botaoPeq('Salvar nome', function () {
        var novo = nome.value.trim().slice(0, 80);
        var c3 = reg.cfg[x.p] || {};
        if (novo && novo !== x.nome) c3.nome = novo; else delete c3.nome;
        if (c3.nome || c3.oculta) reg.cfg[x.p] = c3; else delete reg.cfg[x.p];
        regSalvar();
        desenhar(true);
        UI.fecharJanela(true);
      }));
      corpo.appendChild(l3);
      corpo.appendChild(el('p', 'O nome da pasta no Drive não muda; só o nome da playlist no app.', 'nota'));
      var l4 = el('div', null, 'dz-linha');
      l4.appendChild(botaoPeq('Esta pasta não vira playlist', function () {
        var c4 = reg.cfg[x.p] || {};
        c4.oculta = true;
        reg.cfg[x.p] = c4;
        regSalvar();
        desenhar(true);
        UI.fecharJanela(true);
      }));
      corpo.appendChild(l4);
    }
    montar();
    var x1 = atual();
    return UI.janela({ titulo: x1.mostrado, intro: x1.ms.length + ' músicas no Drive · pasta: ' + pastaCurta(x1.p + '/x'), corpo: corpo, botoes: [{ rotulo: 'Fechar', valor: true }], esc: true });
  }

  function abrirRecentes() {
    var corpo = el('div', null, 'dz-caixa');
    var l = el('div', null, 'dz-linha');
    var lab = el('label');
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !reg.semRec;
    cb.onchange = function () { reg.semRec = !cb.checked; regSalvar(); desenhar(true); };
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode('Criar a playlist "Adicionadas recentemente" com o que chegou nos últimos'));
    l.appendChild(lab);
    var sel = document.createElement('select');
    sel.setAttribute('aria-label', 'Quantos dias contam como recentes');
    [7, 14, 30, 60].forEach(function (n) {
      var o = document.createElement('option');
      o.value = String(n);
      o.textContent = n + ' dias';
      if (n === reg.dias) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = function () { reg.dias = parseInt(sel.value, 10) || 14; regSalvar(); desenhar(true); };
    l.appendChild(sel);
    corpo.appendChild(l);
    return UI.janela({ titulo: 'Adicionadas recentemente', intro: 'Playlist automática: as músicas mais novas do Drive ficam juntas no app.', corpo: corpo, botoes: [{ rotulo: 'Fechar', valor: true }], esc: true });
  }

  function abrirEscondidas() {
    var corpo = el('div', null, 'janela-lista');
    function montar() {
      esvaziar(corpo);
      var oc = infoPastas().lista.filter(function (x) { return x.oculta; });
      if (!oc.length) { corpo.appendChild(el('div', 'Nenhuma.', 'linha-simples mu')); return; }
      oc.forEach(function (x) {
        var l = el('div', null, 'linha-simples');
        l.appendChild(document.createTextNode(pastaCurta(x.p + '/x') + ' (' + x.ms.length + ' músicas)  '));
        l.appendChild(botaoPeq('Voltar a virar playlist', function () {
          var cfg = reg.cfg[x.p] || {};
          delete cfg.oculta;
          if (cfg.nome) reg.cfg[x.p] = cfg; else delete reg.cfg[x.p];
          regSalvar();
          desenhar(true);
          montar();
        }));
        corpo.appendChild(l);
      });
    }
    montar();
    return UI.janela({ titulo: 'Pastas que não viram playlist', corpo: corpo, botoes: [{ rotulo: 'Fechar', valor: true }], esc: true });
  }

  // ----- A tela das playlists -----
  function linhaPlaylist(x) {
    var l = el('div', null, 'pl-linha');
    var n = el('div', null, 'pl-nome');
    n.appendChild(el('b', x.mostrado));
    var pai = pastaCurta(x.p + '/x');
    pai = pai.indexOf('/') < 0 ? '' : pai.slice(0, pai.lastIndexOf('/'));
    n.appendChild(el('small', (x.ms.length === 1 ? '1 música' : x.ms.length + ' músicas') + (pai ? ' · ' + pai : '')));
    l.appendChild(n);
    var et = el('div', null, 'pl-etqs');
    pilulasMudanca(x).forEach(function (p) { et.appendChild(p); });
    l.appendChild(et);
    var st = dzStatus(x);
    var dzc = el('div', null, 'pl-dz');
    dzc.appendChild(pilula(st.txt, 'st ' + st.cls));
    l.appendChild(dzc);
    var fim = el('div', null, 'pl-fim');
    fim.appendChild(botaoPeq(st.botao, function () { abrirPlaylist(x); }));
    l.appendChild(fim);
    return l;
  }

  function cabecalho() {
    var c = el('div', null, 'pl-cab');
    c.appendChild(el('span', 'Playlist'));
    c.appendChild(el('span', 'O que mudou'));
    c.appendChild(el('span', 'Deezer'));
    c.appendChild(el('span', ''));
    return c;
  }

  function desenharPlaylists() {
    var c = $('playlists');
    esvaziar(c);
    c.appendChild(el('h2', 'Minhas playlists', 'pl-titulo'));
    if (!estado.lib.length) {
      if (D.itens) c.appendChild(vazio('Não achei músicas na pasta "' + PASTA_RAIZ + '" do seu Drive. Escolha a pasta do PC e clique em "Atualizar tudo" para enviar as primeiras.'));
      else c.appendChild(vazio('Entre com o Google para o site ler as suas playlists do Drive.'));
      return;
    }

    var info = infoPastas();
    var ativas = info.lista.filter(function (x) { return !x.oculta; });
    var pls = ativas.filter(function (x) { return !x.cantor; });
    var cant = ativas.filter(function (x) { return x.cantor; });
    var nOcultas = info.lista.length - ativas.length;
    var totNovas = 0, totSaiu = 0, mudou = 0;
    ativas.forEach(function (x) {
      totNovas += x.novas;
      totSaiu += x.saiu;
      if (x.nova || x.novas || x.saiu) mudou++;
    });

    // Status
    var st;
    if (!reg.base) st = (reg.zerado ? 'O registro antigo não combinava com as pastas do Drive, então o site recomeçou a contar. ' : '') + 'Ainda não há uma atualização registrada neste navegador, por isso o site não sabe o que é novo.';
    else st = 'Última atualização: ' + dataTxt(reg.base.d) + '. Desde então: ' + totNovas + ' música(s) nova(s)' + (totSaiu ? ' e ' + totSaiu + ' que saiu/saíram' : '') + (info.sumiram.length ? '; ' + info.sumiram.length + ' pasta(s) sumiram do Drive e saem do app' : '') + '.';
    c.appendChild(el('p', st, 'pl-status'));
    if (!D.itens) c.appendChild(el('p', 'Estas playlists vêm só da pasta do PC. Entre com o Google para ver o que está de verdade no Drive.', 'nota'));

    // Barra de ações
    var barra = el('div', null, 'pl-barra');
    if (DZ.ocupado) {
      var bp = el('button', 'Parar a conferência', 'btn-s');
      bp.type = 'button';
      bp.onclick = function () { DZ.parar = true; bp.disabled = true; bp.textContent = 'Parando…'; };
      barra.appendChild(bp);
    } else {
      var cand = candidatasDz();
      var pend = cand.filter(function (x) { var r = dz.res[x.p]; return !r || r.est === 'erro'; });
      var bd = el('button', pend.length && pend.length < cand.length ? 'Conferir as ' + pend.length + ' que faltam' : (pend.length ? 'Conferir com o Deezer' : 'Conferir de novo com o Deezer'), 'btn-s');
      bd.type = 'button';
      bd.disabled = !cand.length || !!(D.ocupado || D.tudo);
      bd.onclick = function () { dzConferir((pend.length ? pend : cand).map(function (x) { return x.p; })); };
      barra.appendChild(bd);
      if (dz.quando) barra.appendChild(el('span', 'Última conferência: ' + dataTxt(dz.quando), 'nota'));
    }
    if (!reg.base) barra.appendChild(botaoPeq('Já atualizei antes: contar o que é novo a partir de agora', function () { marcarBase(); desenhar(true); }));
    c.appendChild(barra);

    // Resumo em pílulas
    var faltando = [];
    var nProcurou = 0;
    pls.forEach(function (x) {
      var s = dzStatus(x);
      if (s.n) faltando.push({ x: x, n: s.n });
      if (dz.res[x.p] && !(dz.cfg[x.p] && dz.cfg[x.p].nao)) nProcurou++;
    });
    var res = el('div', null, 'pl-resumo');
    res.appendChild(pilula(pls.length + ' playlist(s)', 'tam'));
    res.appendChild(pilula(mudou ? mudou + ' com novidade' : 'sem novidade', mudou ? 'am' : 'ok'));
    if (nProcurou) res.appendChild(pilula(faltando.length ? faltando.length + ' com música faltando no Deezer' : 'nada falta no Deezer', faltando.length ? 'am' : 'ok'));
    c.appendChild(res);

    // Lista do topo: só as que têm música faltando
    if (faltando.length) {
      faltando.sort(function (a, b) { return b.n - a.n; });
      var cx = el('div', null, 'pl-falta');
      cx.appendChild(el('h3', 'Playlists com música faltando no Deezer'));
      faltando.slice(0, estado.lim.faltam).forEach(function (f) {
        var li = itemLista(f.x.mostrado, f.n + ' música(s) para baixar e colocar na pasta', [pilula(f.n === 1 ? 'falta 1' : 'faltam ' + f.n, 'st am')]);
        li.querySelector('.item-dir').appendChild(botaoPeq('Ver lista', function () { abrirPlaylist(f.x); }));
        cx.appendChild(li);
      });
      if (faltando.length > estado.lim.faltam) {
        var bm = el('button', 'Mostrar mais ' + Math.min(PAGINA, faltando.length - estado.lim.faltam), 'mais');
        bm.type = 'button';
        bm.onclick = function () { estado.lim.faltam += PAGINA; desenhar(true); };
        cx.appendChild(bm);
      }
      c.appendChild(cx);
    }

    // Todas as playlists
    c.appendChild(el('h3', 'Todas as playlists (' + pls.length + ')', 'pl-sub'));
    var ordem = pls.slice().sort(function (a, b) {
      var ma = (a.nova || a.novas || a.saiu) ? 0 : 1;
      var mb = (b.nova || b.novas || b.saiu) ? 0 : 1;
      return (ma - mb) || a.mostrado.localeCompare(b.mostrado, 'pt-BR');
    });
    var caixa = el('div', null, 'lista');
    caixa.appendChild(cabecalho());
    var rec = playlistRecentes();
    var rl = el('div', null, 'pl-linha especial');
    var rn = el('div', null, 'pl-nome');
    rn.appendChild(el('b', 'Adicionadas recentemente'));
    rn.appendChild(el('small', reg.semRec ? 'Desligada' : (rec ? rec.faixas.length + (rec.faixas.length === 1 ? ' música' : ' músicas') + ' dos últimos ' + reg.dias + ' dias · automática' : 'Nenhuma música nova nos últimos ' + reg.dias + ' dias · automática')));
    rl.appendChild(rn);
    rl.appendChild(el('div', null, 'pl-etqs'));
    var rdz = el('div', null, 'pl-dz');
    rdz.appendChild(pilula('automática', 'st neutro'));
    rl.appendChild(rdz);
    var rf = el('div', null, 'pl-fim');
    rf.appendChild(botaoPeq('Opções', abrirRecentes));
    rl.appendChild(rf);
    caixa.appendChild(rl);
    if (!ordem.length) caixa.appendChild(el('div', 'Nenhuma pasta está virando playlist agora.', 'linha-simples mu'));
    ordem.slice(0, estado.lim.playlists).forEach(function (x) { caixa.appendChild(linhaPlaylist(x)); });
    rodapeMais(caixa, 'playlists', ordem.length);
    c.appendChild(caixa);

    // Cantores (pastas dentro de "Artistas"): separados, sem conferência no Deezer
    if (cant.length) {
      c.appendChild(el('h3', 'Pastas de cantor (' + cant.length + ')', 'pl-sub'));
      c.appendChild(el('p', 'São as pastas dentro de "Artistas". Ficam separadas das playlists e não são conferidas no Deezer.', 'nota'));
      var cc = el('div', null, 'lista pl-cantores');
      cant.slice().sort(function (a, b) { return a.mostrado.localeCompare(b.mostrado, 'pt-BR'); }).slice(0, estado.lim.cantores).forEach(function (x) {
        var li = el('div', null, 'pl-linha');
        var n = el('div', null, 'pl-nome');
        n.appendChild(el('b', x.mostrado));
        var sub = el('small', x.ms.length + ' músicas');
        n.appendChild(sub);
        li.appendChild(n);
        var et = el('div', null, 'pl-etqs');
        pilulasMudanca(x).forEach(function (p) { et.appendChild(p); });
        li.appendChild(et);
        cc.appendChild(li);
      });
      rodapeMais(cc, 'cantores', cant.length);
      c.appendChild(cc);
      var rc = el('div', null, 'pl-rodape');
      rc.appendChild(el('span', 'Cantores com 5 músicas ou mais já ganham uma playlist própria no app. Se estas pastas só repetem isso:'));
      rc.appendChild(botaoPeq('Não criar playlist das pastas de Artistas', function () {
        cant.forEach(function (x) { var cfg = reg.cfg[x.p] || {}; cfg.oculta = true; reg.cfg[x.p] = cfg; });
        regSalvar();
        desenhar(true);
      }));
      c.appendChild(rc);
    }

    if (nOcultas) {
      var ro = el('div', null, 'pl-rodape');
      ro.appendChild(el('span', nOcultas + ' pasta(s) escondida(s) (não viram playlist).'));
      ro.appendChild(botaoPeq('Ver escondidas', abrirEscondidas));
      c.appendChild(ro);
    }
  }

  // ---------- Google Drive: entrar com a conta e ler o Drive ----------

  var API = 'https://www.googleapis.com/drive/v3/files';

  var promessaGoogle = null;
  function carregarGoogle() {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
    if (promessaGoogle) return promessaGoogle;
    promessaGoogle = new Promise(function (ok, erro) {
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = function () { ok(); };
      s.onerror = function () { promessaGoogle = null; s.remove(); erro(new Error('Não consegui carregar o login do Google.')); };
      document.head.appendChild(s);
    });
    return promessaGoogle;
  }

  async function entrar() {
    try {
      await carregarGoogle();
      var cliente = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: ESCOPOS,
        include_granted_scopes: false,
        callback: function (r) {
          if (r && r.access_token) {
            D.token = r.access_token;
            setTimeout(lerDrive, 0);
          } else {
            D.msg = 'O login não deu certo' + (r && r.error ? ' (' + r.error + ')' : '') + '. Tente de novo.';
          }
          desenhar();
        },
        error_callback: function (e) {
          D.msg = 'O login foi cancelado ou bloqueado' + (e && e.type ? ' (' + e.type + ')' : '') + '. Tente de novo.';
          desenhar();
        }
      });
      cliente.requestAccessToken({ prompt: '' });
    } catch (e) {
      D.msg = e.message;
      desenhar();
    }
  }

  async function api(url, opcoes) {
    opcoes = opcoes || {};
    opcoes.headers = Object.assign({ Authorization: 'Bearer ' + D.token }, opcoes.headers || {});
    var r = await fetch(url, opcoes);
    if (r.status === 401) { D.token = null; throw new Error('O login do Google venceu (ele dura cerca de 1 hora). Clique em "Entrar com Google" de novo e depois em "Atualizar tudo": continua de onde parou.'); }
    if (!r.ok) { var ee = new Error('O Google respondeu com erro ' + r.status + '.'); ee.status = r.status; throw ee; }
    return r.json();
  }

  async function listarDrive(q, campos) {
    var out = [];
    var tk = '';
    do {
      var u = API + '?q=' + encodeURIComponent(q) + '&fields=' + encodeURIComponent('nextPageToken,files(' + campos + ')') + '&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true' + (tk ? '&pageToken=' + encodeURIComponent(tk) : '');
      var r = await api(u);
      out = out.concat(r.files || []);
      tk = r.nextPageToken;
    } while (tk);
    return out;
  }

  async function lerDrive() {
    if (D.ocupado) return false;
    D.ocupado = true;
    var okLer = false;
    try {
      D.msg = 'Lendo o seu Drive... pode demorar um pouco.';
      desenhar();
      var pastasDrive = await listarDrive("mimeType='application/vnd.google-apps.folder' and trashed=false", 'id,name,parents');
      var mp = {};
      pastasDrive.forEach(function (p) { mp[p.id] = p; });
      var camCache = {};
      function caminho(id) {
        if (camCache[id] !== undefined) return camCache[id];
        var partes = [];
        var n = 0;
        var i0 = id;
        while (id && mp[id] && n++ < 30) { partes.unshift(mp[id].name); id = (mp[id].parents || [])[0]; }
        camCache[i0] = partes.join('/');
        return camCache[i0];
      }
      var arqs = await listarDrive("(mimeType contains 'audio/' or mimeType='application/octet-stream') and trashed=false", 'id,name,size,parents,createdTime');
      var itens = [];
      arqs.forEach(function (f) {
        var i = f.name.lastIndexOf('.');
        if (i < 0 || EXT.indexOf(f.name.slice(i + 1).toLowerCase()) < 0) return;
        var s = f.name.slice(0, i);
        var cam = caminho((f.parents || [])[0]);
        itens.push({ id: f.id, fn: f.name, p: cam, k: chaveNome(s, false), b: chaveNome(s, true), t: Number(f.size || 0), m: Date.parse(f.createdTime || '') || 0, site: cam === PASTA_RAIZ || cam.indexOf(PASTA_RAIZ + '/') === 0 });
      });
      D.itens = itens;
      await lerAnterior();
      reg.zerado = false;
      reconstruir();
      conferirBase();
      var nSite = itens.filter(function (d) { return d.site; }).length;
      var nPl = infoPastas().lista.filter(function (x) { return !x.cantor; }).length;
      D.msg = 'Pronto! Achei ' + nSite + ' músicas na pasta "' + PASTA_RAIZ + '" do seu Drive, em ' + nPl + ' playlists.';
      okLer = true;
    } catch (e) {
      D.msg = 'Deu erro: ' + e.message;
    }
    D.ocupado = false;
    desenhar();
    return okLer;
  }

  // Põe o número (id) do Drive em cada faixa das playlists.
  // Acha a música pelo nome limpo e sem ligar para a ordem das palavras. Assim, a mesma música que está em
  // duas pastas do PC (mesmo com nomes um pouco diferentes) entra nas duas playlists, usando a cópia que subiu.
  function playlistsComId() {
    var porChave = {};
    var porNome = {};
    D.itens.forEach(function (d) {
      var o = oDe(d);
      if (o && (!porChave[o] || d.site)) porChave[o] = d.id;
      var ch = d.fn.toLowerCase();
      if (!porNome[ch] || d.site) porNome[ch] = d.id;
    });
    return todasPlaylists().map(function (p) {
      p.faixas = p.faixas.map(function (f) {
        var i = f.fn.lastIndexOf('.');
        var sem = i < 0 ? f.fn : f.fn.slice(0, i);
        var id = porChave[chaveOrdem(chaveNome(sem, false))] || porNome[f.fn.toLowerCase()];
        return id ? Object.assign({ id: id }, f) : f;
      });
      return p;
    });
  }

  async function enviarParaDrive() {
    if (D.ocupado) return;
    if (!D.itens) { aviso('Leia o Drive primeiro (botão "Atualizar tudo").'); return; }
    if (!estado.lib.length) { aviso('Não achei músicas na pasta "' + PASTA_RAIZ + '" do Drive, então não mexi no arquivo de playlists.'); return; }
    D.ocupado = true;
    try {
      D.msg = 'Enviando o JSON para o Drive...';
      desenhar();
      var obj = { formato: 'toxic-playlists', v: 2, gerado: new Date().toISOString(), playlists: playlistsComId() };
      var conteudo = JSON.stringify(obj, null, 1);
      var pastasT = await listarDrive("name='Toxic Playlists' and mimeType='application/vnd.google-apps.folder' and trashed=false", 'id');
      var pastaId;
      if (pastasT.length) {
        pastaId = pastasT[0].id;
      } else {
        var nova = await api(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Toxic Playlists', mimeType: 'application/vnd.google-apps.folder' }) });
        pastaId = nova.id;
      }
      var nomeArq = 'playlists-inteligentes.json';
      var antigos = await listarDrive("name='" + nomeArq + "' and '" + pastaId + "' in parents and trashed=false", 'id');
      var lim = 'gm' + Date.now();
      var meta = antigos.length ? {} : { name: nomeArq, parents: [pastaId] };
      var corpo = '--' + lim + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n--' + lim + '\r\nContent-Type: application/json\r\n\r\n' + conteudo + '\r\n--' + lim + '--';
      var url = 'https://www.googleapis.com/upload/drive/v3/files' + (antigos.length ? '/' + antigos[0].id : '') + '?uploadType=multipart';
      await api(url, { method: antigos.length ? 'PATCH' : 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + lim }, body: corpo });
      var mudou = textoMudanca(registrarAtualizacao());
      D.msg = 'Pronto! O arquivo ' + nomeArq + ' está no seu Drive, na pasta "Toxic Playlists".' + mudou;
    } catch (e) {
      D.msg = 'Deu erro ao enviar: ' + e.message;
    }
    D.ocupado = false;
    desenhar();
  }

  // ---------- Google Drive: subir as músicas que faltam ----------

  // Chave que não liga para a ordem das palavras: "Numb - Linkin Park" e "Linkin Park - Numb" dão a mesma.
  // Fica guardada no próprio item (campo "o") para não refazer a conta toda hora.
  function chaveOrdem(k) { return (k || '').split(' ').filter(Boolean).sort().join(' '); }
  function oDe(x) { if (x.o === undefined) x.o = chaveOrdem(x.k); return x.o; }

  // Nome de cantor para comparar: sem acento, sem símbolos e sem "e", "x", "and" ("Henrique e Juliano" = "Henrique & Juliano").
  function nomeDeCantor(s) {
    return limpar(s, true).split(' ').filter(function (w) { return w && w !== 'e' && w !== 'x' && w !== 'and'; }).join(' ');
  }

  // A música está numa pasta com o nome do cantor? (ex.: "Artistas/Linkin Park/...")
  function naPastaDoCantor(m) {
    var p = pastaDoArquivo(m.c);
    var pk = nomeDeCantor(p.slice(p.lastIndexOf('/') + 1));
    if (!pk) return false;
    var n = lerNome(m);
    if (n.as && n.as.length) return n.as.some(function (a) { return nomeDeCantor(a) === pk; });
    return (' ' + nomeDeCantor(m.b) + ' ').indexOf(' ' + pk + ' ') >= 0;
  }

  // Mesma música em várias pastas do PC: escolhe qual cópia sobe.
  // Só entram as cópias de tamanho parecido com a maior (até 2% menores). Entre elas, a da pasta do cantor ganha.
  // Se ainda sobrar mais de uma, vale a primeira em ordem de nome da pasta (sempre a mesma, não muda a cada vez).
  function escolherCopia(grupo) {
    if (grupo.length === 1) return grupo[0];
    var maior = Math.max.apply(null, grupo.map(function (m) { return m.t; }));
    var perto = grupo.filter(function (m) { return m.t >= maior * 0.98; });
    var doCantor = perto.filter(naPastaDoCantor);
    var lista = doCantor.length ? doCantor : perto;
    lista.sort(function (a, b) { return a.c < b.c ? -1 : (a.c > b.c ? 1 : 0); });
    return lista[0];
  }

  function faltamSubir() {
    if (!D.itens) return [];
    var noDrive = {};
    D.itens.forEach(function (d) { if (d.site) noDrive[oDe(d)] = true; });
    // Se a mesma música está em duas pastas do PC, sobe só uma cópia. As outras pastas continuam
    // com a música nas playlists, porque o arquivo de playlists aponta para essa cópia (veja playlistsComId).
    var grupos = {};
    estado.arquivos.forEach(function (m) {
      if (m.k && !noDrive[oDe(m)]) (grupos[oDe(m)] = grupos[oDe(m)] || []).push(m);
    });
    var melhor = {};
    Object.keys(grupos).forEach(function (k) { melhor[k] = escolherCopia(grupos[k]); });
    return estado.arquivos.filter(function (m) {
      if (!m.h) return false;
      if (!m.k) return true;
      return melhor[oDe(m)] === m;
    });
  }

  function aspas(s) { return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

  // Acha (ou cria) uma pasta dentro de outra, no Drive.
  async function achaOuCriaPasta(nome, paiId) {
    var achados = await listarDrive("name='" + aspas(nome) + "' and mimeType='application/vnd.google-apps.folder' and '" + paiId + "' in parents and trashed=false", 'id,createdTime');
    achados.sort(function (x, y) { return (x.createdTime || '') < (y.createdTime || '') ? -1 : 1; });
    if (achados.length) return achados[0].id;
    var nova = await api(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nome, mimeType: 'application/vnd.google-apps.folder', parents: [paiId] }) });
    return nova.id;
  }

  // Cria o caminho inteiro, tipo "Sunnify/Henrique & Juliano Radio - Spotify".
  async function pastaDoCaminho(caminho, cache) {
    if (cache[caminho] !== undefined) return cache[caminho];
    var i = caminho.lastIndexOf('/');
    var paiCam = i < 0 ? '' : caminho.slice(0, i);
    var nome = i < 0 ? caminho : caminho.slice(i + 1);
    var paiId = paiCam ? await pastaDoCaminho(paiCam, cache) : cache[''];
    var id = await achaOuCriaPasta(nome, paiId);
    cache[caminho] = id;
    return id;
  }

  async function subirArquivo(m, pastaId) {
    var f = await m.h.getFile();
    var lim = 'gm' + Date.now() + Math.random().toString(36).slice(2);
    var meta = JSON.stringify({ name: nomeDoArquivo(m.c), parents: [pastaId] });
    var cab = '--' + lim + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n--' + lim + '\r\nContent-Type: ' + (f.type || 'audio/mpeg') + '\r\n\r\n';
    var corpo = new Blob([cab, f, '\r\n--' + lim + '--']);
    return api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + lim },
      body: corpo
    });
  }

  async function subirFaltantes(quieto) {
    if (D.ocupado) return false;
    var lista = faltamSubir();
    if (!lista.length) { aviso('Não falta nenhuma música para subir.'); return true; }
    D.ocupado = true;
    var certas = 0;
    var falhas = 0;
    var cache = {};
    try {
      D.msg = 'Preparando a pasta "' + PASTA_RAIZ + '" no Drive...';
      desenhar();
      cache[''] = await achaOuCriaPasta(PASTA_RAIZ, 'root');
      for (var i = 0; i < lista.length; i++) {
        var m = lista[i];
        D.msg = 'Subindo ' + (i + 1) + ' de ' + lista.length + ': ' + nomeDoArquivo(m.c) + ' (não feche esta página)';
        desenhar();
        try {
          var pid = await pastaDoCaminho(pastaDoArquivo(m.c), cache);
          var r = await subirArquivo(m, pid);
          D.itens.push({ id: r.id, fn: nomeDoArquivo(m.c), p: PASTA_RAIZ + '/' + pastaDoArquivo(m.c), k: m.k, b: m.b, t: m.t, m: Date.now(), site: true });
          certas++;
        } catch (e1) {
          if (!D.token) throw e1;
          falhas++;
        }
      }
    } catch (e) {
      reconstruir();
      D.ocupado = false;
      D.msg = 'Parou depois de subir ' + certas + ' música(s). ' + e.message;
      desenhar();
      return false;
    }
    reconstruir();
    D.ocupado = false;
    var texto = 'Subi ' + certas + ' música(s) para a pasta "' + PASTA_RAIZ + '".' + (falhas ? ' ' + falhas + ' não deu certo. Clique no botão de novo para tentar essas.' : '');
    if (certas > 0 && !quieto) {
      await enviarParaDrive();
      D.msg = texto + ' ' + D.msg;
    } else {
      D.msg = texto;
    }
    desenhar();
    return falhas === 0;
  }


  // ---------- Google Drive: repetidas (só manda para a LIXEIRA, nunca apaga de vez) ----------

  // Em cada grupo de repetidas DA PASTA DO SITE, escolhe qual fica:
  // a maior; se o tamanho for quase igual (até 2% de diferença), a de nome mais curto.
  // Só manda para a lixeira cópias com tamanho parecido (até 10% menores). O resto não é mexido.
  function planoLixeira() {
    var gs = {};
    (D.itens || []).forEach(function (d) {
      if (d.site && d.k && !d.semPerm) (gs[d.k] = gs[d.k] || []).push(d);
    });
    var out = [];
    Object.keys(gs).forEach(function (k) {
      var arr = gs[k];
      if (arr.length < 2) return;
      var maior = Math.max.apply(null, arr.map(function (d) { return d.t; }));
      if (!maior) return;
      var perto = arr.filter(function (d) { return d.t >= maior * 0.98; });
      perto.sort(function (a, b) {
        return (a.fn.length - b.fn.length) || ((a.p + '/' + a.fn) < (b.p + '/' + b.fn) ? -1 : 1);
      });
      var manter = perto[0];
      var lixo = arr.filter(function (d) { return d !== manter && d.t >= maior * 0.9; });
      if (lixo.length) out.push({ manter: manter, lixo: lixo });
    });
    return out;
  }

  async function mandarParaLixeira(quieto) {
    if (D.ocupado) return false;
    var plano = planoLixeira();
    var total = plano.reduce(function (s, g) { return s + g.lixo.length; }, 0);
    if (!total) { aviso('Não tem repetidas na pasta "' + PASTA_RAIZ + '" para limpar.'); return true; }
    if (!(await UI.confirmar({ total: total, itens: plano.map(function (g) { return { fica: g.manter.p + '/' + g.manter.fn, tam: g.manter.t, vai: g.lixo.map(function (d) { return d.p + '/' + d.fn; }) }; }) }))) return 'cancelado';
    D.ocupado = true;
    var certas = 0;
    var falhas = 0;
    var semPerm = 0;
    var idsOk = {};
    try {
      for (var g = 0; g < plano.length; g++) {
        for (var x = 0; x < plano[g].lixo.length; x++) {
          var d = plano[g].lixo[x];
          D.msg = 'Mandando para a lixeira ' + (certas + falhas + 1) + ' de ' + total + '... (não feche esta página)';
          desenhar();
          try {
            await api(API + '/' + encodeURIComponent(d.id) + '?fields=id&supportsAllDrives=true', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
            idsOk[d.id] = true;
            estado.fantasmas.push({ c: relDoDrive(d.p) + '/' + d.fn, k: d.k, b: d.b });
            certas++;
          } catch (e1) {
            if (!D.token) throw e1;
            // 403/404: o site só mexe em arquivos que ele mesmo criou. Os outros você apaga pelo Drive.
            if (e1.status === 403 || e1.status === 404) { d.semPerm = true; semPerm++; } else { falhas++; }
          }
        }
      }
    } catch (e) {
      D.itens = D.itens.filter(function (d) { return !idsOk[d.id]; });
      reconstruir();
      D.ocupado = false;
      D.msg = 'Parou depois de mandar ' + certas + ' cópia(s) para a lixeira. ' + e.message;
      desenhar();
      return false;
    }
    D.itens = D.itens.filter(function (d) { return !idsOk[d.id]; });
    reconstruir();
    D.ocupado = false;
    var texto = 'Mandei ' + certas + ' cópia(s) para a lixeira do Drive.' + (falhas ? ' ' + falhas + ' não deu certo. Clique no botão de novo para tentar essas.' : '') + (semPerm ? ' ' + semPerm + ' cópia(s) o site não tem permissão para mexer (foram colocadas na pasta por fora do site). Apague essas pelo próprio Drive: veja a lista "Repetidas com arquivos fora da pasta".' : '');
    if (certas > 0 && !quieto) {
      await enviarParaDrive();
      D.msg = texto + ' ' + D.msg;
    } else if (certas > 0 && !quieto) {
      D.msg = texto + ' Para atualizar o arquivo de playlists, escolha a pasta das músicas e clique em "Atualizar tudo".';
    } else {
      D.msg = texto;
    }
    desenhar();
    return falhas === 0;
  }

  // Um botão só: lê o Drive, sobe o que falta (se você escolheu a pasta do PC), limpa repetidas e atualiza as playlists.
  async function atualizarTudo() {
    if (D.ocupado || D.tudo || DZ.ocupado) return;
    if (!D.token) { aviso('Clique em "Entrar com o Google" primeiro.'); return; }
    D.tudo = true;
    UI.quieto = true;
    var partes = [];
    try {
      D.msg = 'Atualizando tudo... (não feche esta página)';
      desenhar();
      if (!(await lerDrive())) return;
      partes.push(D.msg);
      if (estado.arquivos.length && faltamSubir().length) {
        var okSubir = await subirFaltantes(true);
        partes.push(D.msg);
        if (!okSubir) return;
      }
      if (planoLixeira().length) {
        var okLixo = await mandarParaLixeira(true);
        partes.push(D.msg);
        if (okLixo === false) return;
      }
      await enviarParaDrive();
      partes.push(D.msg);
    } finally {
      D.tudo = false;
      UI.quieto = false;
      if (partes.length) D.msg = partes.join(' ');
      desenhar(true);
    }
  }

  // ---------- Aba "Google Drive" (organizada na ordem do que a pessoa faz) ----------

  // Linha recolhível (fechada no começo), com contador à direita.
  function recolhivel(chave, titulo, contador, preencher) {
    var d = document.createElement('details');
    d.className = 'rec';
    if (estado.abertos[chave]) d.open = true;
    d.addEventListener('toggle', function () { estado.abertos[chave] = d.open; });
    var s = document.createElement('summary');
    s.appendChild(el('span', titulo));
    var dir = el('span', null, 'dir');
    dir.appendChild(el('span', 'Clique para ver', 'ver'));
    dir.appendChild(pilula(String(contador), contador ? 'am' : ''));
    s.appendChild(dir);
    d.appendChild(s);
    var corpo = el('div', null, 'rec-corpo');
    preencher(corpo);
    d.appendChild(corpo);
    return d;
  }

  function linhasSimples(corpo, linhas, max) {
    if (!linhas.length) { corpo.appendChild(el('div', 'Nenhuma.', 'linha-simples mu')); return; }
    linhas.slice(0, max).forEach(function (t) { corpo.appendChild(el('div', t, 'linha-simples')); });
    if (linhas.length > max) corpo.appendChild(el('div', 'Mostrando só as ' + max + ' primeiras.', 'linha-simples mu'));
  }

  function linhaDrive(d) {
    var l = el('div', null, 'linha-simples');
    l.appendChild(document.createTextNode((d.semPerm ? '[sem permissão do site] ' : (d.site ? '[pasta do site] ' : '[fora do site] ')) + (d.p ? d.p + '/' : '') + d.fn + ' (' + (d.t / 1048576).toFixed(1) + ' MB)  '));
    var a = el('a', 'abrir no Drive');
    a.href = 'https://drive.google.com/file/d/' + encodeURIComponent(d.id) + '/view';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    l.appendChild(a);
    return l;
  }

  // Uma ação: botão + selo de segurança + UMA linha explicando.
  function acaoItem(rotulo, selo, linha, fazer, desativar, motivo) {
    var a = el('div', null, 'acao');
    var l = el('div', null, 'acao-linha');
    var b = el('button', rotulo, 'btn-s');
    b.type = 'button';
    b.disabled = !!desativar;
    b.onclick = fazer;
    l.appendChild(b);
    if (selo) l.appendChild(el('span', selo, 'selo'));
    a.appendChild(l);
    a.appendChild(el('p', linha, 'acao-texto'));
    if (desativar && motivo) a.appendChild(el('p', 'Por que está cinza: ' + motivo, 'acao-motivo'));
    return a;
  }

  function secao(c, titulo) {
    var s = el('section', null, 'secao');
    s.appendChild(el('h2', titulo, 'eyebrow secao-titulo'));
    c.appendChild(s);
    return s;
  }

  function abaDrive(c) {
    var ocup = !!(D.ocupado || D.tudo);

    // (a) Situação
    var sit = secao(c, 'Situação');
    if (!D.token) {
      sit.appendChild(el('p', 'Entre com o Google para ver o seu Drive aqui. Não precisa escolher a pasta antes.', 'situacao'));
      var bLogin = el('button', 'Entrar com Google', 'btn-p');
      bLogin.type = 'button';
      bLogin.style.marginTop = '16px';
      bLogin.onclick = entrar;
      sit.appendChild(bLogin);
    } else if (!D.itens) {
      sit.appendChild(el('p', 'Ainda não li o seu Drive. Use "Ler o Drive" aqui embaixo, ou "Atualizar tudo" na tela principal.', 'situacao'));
    }
    var nSite = 0;
    var noSite = {};
    var gd = {};
    var faltam = [];
    var plano = [];
    var totalLixo = 0;
    if (D.itens) {
      D.itens.forEach(function (d) {
        if (d.site) { noSite[oDe(d)] = true; nSite++; }
        if (d.k) (gd[d.k] = gd[d.k] || []).push(d);
      });
      if (estado.arquivos.length) {
        faltam = faltamSubir();
        var jaTem = estado.arquivos.filter(function (m) { return noSite[oDe(m)]; }).length;
        sit.appendChild(el('p', jaTem + ' já estão na pasta "' + PASTA_RAIZ + '". ' + faltam.length + ' ainda faltam enviar.', 'situacao'));
      } else {
        sit.appendChild(el('p', 'Na pasta "' + PASTA_RAIZ + '" do Drive há ' + nSite + ' músicas. Escolha a pasta do PC para comparar.', 'situacao'));
      }
      sit.appendChild(el('p', 'No Drive: ' + nSite + ' na pasta "' + PASTA_RAIZ + '" e ' + (D.itens.length - nSite) + ' no resto.', 'nota'));
      plano = planoLixeira();
      totalLixo = plano.reduce(function (s, g) { return s + g.lixo.length; }, 0);
    }

    // (b) Passo a passo: os 4 passos sempre aparecem, na ordem certa. Os que não dá para usar ficam cinza, com o motivo.
    if (D.token) {
      var ac = secao(c, 'Controle manual: um passo de cada vez (de cima para baixo)');
      var caixaAc = el('div', null, 'lista');
      var lido = !!D.itens;
      var temPasta = estado.arquivos.length > 0;
      var motBase = !lido ? 'faça o passo 1 primeiro.' : (!temPasta ? 'escolha a pasta do PC na tela principal primeiro.' : '');
      caixaAc.appendChild(acaoItem('1. ' + (lido ? 'Ler o Drive de novo' : 'Ler o Drive'), 'Só lê', 'Vê o que já está no seu Drive. Comece por aqui: os outros passos dependem deste.', function () { lerDrive(); }, ocup));
      caixaAc.appendChild(acaoItem('2. ' + (faltam.length ? 'Subir as ' + faltam.length + ' que faltam' : 'Subir as que faltam'), 'Sobe arquivos', 'Cria a pasta \"' + PASTA_RAIZ + '\" no Drive e sobe só uma cópia de cada música (a maior).', function () { subirFaltantes(); }, ocup || !!motBase || !faltam.length, motBase || 'não falta nada: tudo já está no Drive.'));
      caixaAc.appendChild(acaoItem('3. ' + (totalLixo ? 'Mandar ' + totalLixo + ' repetidas para a lixeira' : 'Limpar as repetidas'), 'Você confirma antes', 'Só dentro de \"' + PASTA_RAIZ + '\". Fica a cópia maior; dá para recuperar pela lixeira do Drive.', function () { mandarParaLixeira(); }, ocup || !lido || !totalLixo, !lido ? 'faça o passo 1 primeiro.' : 'não há repetidas dentro de \"' + PASTA_RAIZ + '\".'));
      caixaAc.appendChild(acaoItem('4. Atualizar as playlists no Drive', 'Drive', 'Coloca o arquivo de playlists (para o app do celular) na pasta \"Toxic Playlists\" do seu Drive.', function () { enviarParaDrive(); }, ocup || !lido, 'faça o passo 1 primeiro.'));
      ac.appendChild(caixaAc);

      var saiba = document.createElement('details');
      saiba.className = 'saiba';
      saiba.open = true;
      saiba.appendChild(el('summary', 'Segurança: o que o site mexe'));
      [['O que faz: ', 'Mostra o que está no seu Drive, sobe o que falta e limpa as repetidas.'],
       ['Mexe em quê: ', 'Só na pasta \"' + PASTA_RAIZ + '\" e na pasta \"Toxic Playlists\", que o próprio site cria.'],
       ['É seguro? ', 'Sim. Nada é apagado de vez: as repetidas vão para a lixeira do Drive, só depois que você confirma.']].forEach(function (x) {
        var p = el('p');
        p.appendChild(el('b', x[0]));
        p.appendChild(document.createTextNode(x[1]));
        saiba.appendChild(p);
      });
      ac.appendChild(saiba);
    }

    // (c) Listas longas (fechadas)
    if (D.itens) {
      var ls = secao(c, 'Listas para conferir (clique numa linha para abrir)');
      var caixaL = el('div', null, 'lista');
      if (estado.arquivos.length) {
        caixaL.appendChild(recolhivel('faltam', 'Faltam subir para "' + PASTA_RAIZ + '"', faltam.length, function (corpo) {
          linhasSimples(corpo, faltam.map(function (m) { return m.c; }), 200);
        }));
      }
      caixaL.appendChild(recolhivel('dentro', 'Repetidas dentro da pasta "' + PASTA_RAIZ + '"', plano.length, function (corpo) {
        linhasSimples(corpo, plano.map(function (g) {
          return 'Fica: ' + g.manter.p + '/' + g.manter.fn + ' (' + (g.manter.t / 1048576).toFixed(1) + ' MB)  →  Lixeira: ' + g.lixo.map(function (d) { return d.p + '/' + d.fn + ' (' + (d.t / 1048576).toFixed(1) + ' MB)'; }).join('  |  ');
        }), 200);
      }));
      // Repetidas que envolvem arquivos FORA da pasta do site: o site não mexe, você apaga pelo Drive.
      var fora = Object.keys(gd).filter(function (k) {
        return gd[k].length > 1 && gd[k].some(function (d) { return !d.site || d.semPerm; });
      }).sort(function (a, b) { return gd[b].length - gd[a].length; });
      caixaL.appendChild(recolhivel('fora', 'Repetidas com arquivos fora da pasta "' + PASTA_RAIZ + '"', fora.length, function (corpo) {
        if (!fora.length) { corpo.appendChild(el('div', 'Nenhuma.', 'linha-simples mu')); return; }
        corpo.appendChild(el('div', 'O site não consegue mexer nos arquivos "fora do site". Clique em "abrir no Drive" e apague por lá.', 'linha-simples mu'));
        fora.slice(0, 100).forEach(function (k) {
          var gr = el('div', null, 'grupo-simples');
          gd[k].forEach(function (d) { gr.appendChild(linhaDrive(d)); });
          corpo.appendChild(gr);
        });
        if (fora.length > 100) corpo.appendChild(el('div', 'Mostrando só os 100 primeiros grupos.', 'linha-simples mu'));
      }));
      ls.appendChild(caixaL);
    }

  }

  // Arquivos de playlists em JSON (o formato que o app do celular lê). Termos técnicos só aqui.
  function ferramentas() {
    var d = el('div', null, 'lista');
    var corpo = el('div', null, 'avancado-corpo');
    d.appendChild(corpo);

    var intro = el('div', null, 'bloco');
    intro.appendChild(el('p', 'Só precisa disto se você usa o app Toxic Player no celular; se não usa, pode ignorar. Arquivos de playlists para o app do celular. O formato é JSON, um arquivo de texto com a lista das músicas. Ele usa os nomes reais dos seus arquivos.', 'nota'));
    corpo.appendChild(intro);
    if (!estado.lib.length) {
      intro.appendChild(el('p', 'Para gerar os arquivos, entre com o Google ou escolha a pasta do PC.', 'nota'));
      return d;
    }
    if (estado.aviso) corpo.appendChild(el('div', estado.aviso, 'bloco'));

    // 0) Tudo de uma vez
    var c0 = el('div', null, 'bloco');
    c0.appendChild(el('h3', 'Tudo de uma vez: playlists inteligentes'));
    c0.appendChild(el('p', 'Um único arquivo com as listas top, uma playlist para cada cantor (5 músicas ou mais) e uma para cada pasta. Cada playlist leva também uma regra, para o seu app achar músicas novas sozinho quando o Drive crescer.', 'nota'));
    var botTudo = el('button', 'Baixar playlists inteligentes', 'btn-s');
    botTudo.type = 'button';
    botTudo.onclick = function () { baixar('playlists-inteligentes.json', D.itens ? playlistsComId() : todasPlaylists(), true); };
    c0.appendChild(botTudo);
    corpo.appendChild(c0);

    // 1) Playlists das listas top
    var c1 = el('div', null, 'bloco');
    c1.appendChild(el('h3', '1. Playlists das listas top'));
    c1.appendChild(el('p', 'Cada lista vira uma playlist com as músicas que você já tem. Escolha o tamanho:', 'nota'));
    var barraN = el('div', null, 'barra-chips');
    [50, 100, 200].forEach(function (n) {
      var b = el('button', 'Top ' + n, 'chip' + (estado.n === n ? ' ativa' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', estado.n === n ? 'true' : 'false');
      b.onclick = function () { estado.n = n; estado.aviso = ''; desenhar(true); };
      barraN.appendChild(b);
    });
    c1.appendChild(barraN);
    var ids = Object.keys(CH.listas);
    if (!ids.length) c1.appendChild(el('p', 'Ainda não tem listas top. Rode a atualização no GitHub.', 'nota'));
    var caixaListas = el('div', null, 'lista');
    ids.forEach(function (id) {
      var L = CH.listas[id];
      var tem = faixasDaLista(id, estado.n).length;
      var total = Math.min(estado.n, L.faixas.length);
      var b = el('button', 'Baixar JSON', 'btn-s');
      b.type = 'button';
      b.onclick = function () { baixar('playlist-' + nomeSeguro(L.nome) + '-' + estado.n + '.json', [playlistDaLista(id, estado.n)]); };
      var l = itemLista(playlistDaLista(id, estado.n).nome, 'Você tem ' + tem + ' de ' + total, []);
      l.lastChild.appendChild(b);
      caixaListas.appendChild(l);
    });
    if (ids.length) {
      c1.appendChild(caixaListas);
      var todas = el('button', 'Baixar JSON com TODAS as listas', 'btn-s');
      todas.type = 'button';
      todas.style.marginTop = '12px';
      todas.onclick = function () {
        baixar('playlists-listas-top-' + estado.n + '.json', ids.map(function (id) { return playlistDaLista(id, estado.n); }));
      };
      c1.appendChild(todas);
    }
    corpo.appendChild(c1);

    // 2) Por cantor
    var c2 = el('div', null, 'bloco');
    c2.appendChild(el('h3', '2. Playlist por cantor'));
    c2.appendChild(el('p', 'Escreva o nome do cantor. Ele procura no nome do arquivo e no nome da pasta.', 'nota'));
    var linha = el('div', null, 'barra-chips');
    var campo = document.createElement('input');
    campo.type = 'text';
    campo.className = 'campo';
    campo.placeholder = 'Nome do cantor';
    campo.setAttribute('aria-label', 'Nome do cantor');
    var gerar = el('button', 'Baixar JSON', 'btn-s');
    gerar.type = 'button';
    function gerarCantor() {
      var p = playlistPorCantor(campo.value);
      if (!p) { aviso('Escreva o nome de um cantor.'); return; }
      baixar('playlist-' + nomeSeguro(campo.value) + '.json', [p]);
    }
    gerar.onclick = gerarCantor;
    campo.onkeydown = function (e) { if (e.key === 'Enter') gerarCantor(); };
    linha.appendChild(campo);
    linha.appendChild(gerar);
    c2.appendChild(linha);
    var arts = artistas();
    if (arts.length) {
      c2.appendChild(el('p', 'Cantores que você mais tem (o site entende "Cantor - Música" e "Música - Cantor"):', 'nota'));
      var chips = el('div', null, 'barra-chips');
      arts.slice(0, 30).forEach(function (a) {
        var b = el('button', a.nome + ' (' + a.faixas.length + ')', 'chip');
        b.type = 'button';
        b.onclick = function () { baixar('playlist-' + nomeSeguro(a.nome) + '.json', [plArtista(a)]); };
        chips.appendChild(b);
      });
      c2.appendChild(chips);
      var muitos = arts.filter(function (a) { return a.faixas.length >= 5; });
      if (muitos.length) {
        var botCada = el('button', 'Uma playlist para cada cantor com 5 músicas ou mais (' + muitos.length + ')', 'btn-s');
        botCada.type = 'button';
        botCada.style.marginTop = '12px';
        botCada.onclick = function () { baixar('playlists-cantores.json', muitos.map(function (a) { return plArtista(a); })); };
        c2.appendChild(botCada);
      }
    } else {
      c2.appendChild(el('p', 'Os nomes dos seus arquivos não têm um traço separando música e cantor (" - "), então não consegui listar os cantores. Você ainda pode digitar o nome do cantor acima.', 'nota'));
    }
    corpo.appendChild(c2);

    // 3) Por pasta
    var c3 = el('div', null, 'bloco');
    c3.appendChild(el('h3', '3. Uma playlist para cada pasta'));
    var ps = pastas();
    c3.appendChild(el('p', 'Você tem ' + ps.length + ' pasta(s) com música. Cada pasta vira uma playlist.', 'nota'));
    var botPastas = el('button', 'Baixar JSON das pastas', 'btn-s');
    botPastas.type = 'button';
    botPastas.onclick = function () { baixar('playlists-pastas.json', ps); };
    c3.appendChild(botPastas);
    corpo.appendChild(c3);
    return d;
  }

  // ---------- Motor Toxic: ler o que o motor deixou no Drive (SÓ LEITURA) ----------

  var PASTA_MOTOR = 'Toxic Engine';

  // Confere se o arquivo tem a cara certa. Campos que não conheço são ignorados.
  function motorStatusValido(x) { return !!x && x.formato === 'toxic-engine-status' && typeof x.contagem === 'object' && x.contagem !== null; }
  function motorPendentesValido(x) { return !!x && x.formato === 'toxic-engine-pendentes' && Array.isArray(x.itens); }

  async function lerMotor() {
    if (M.ocupado) return;
    M.ocupado = true;
    M.erro = '';
    desenhar(true);
    try {
      D.msg = 'Lendo o que o motor deixou no seu Drive...';
      var pastas = await listarDrive("name='" + PASTA_MOTOR + "' and mimeType='application/vnd.google-apps.folder' and trashed=false", 'id');
      if (!pastas.length) {
        M.status = null; M.pendentes = null;
        M.erro = 'Não achei a pasta "' + PASTA_MOTOR + '" no seu Drive. No PC, dê dois cliques em "2-atualizar-tudo.bat" e depois tente de novo.';
      } else {
        var st = null;
        var pe = null;
        for (var i = 0; i < pastas.length && !st; i++) {
          var arqs = await listarDrive("'" + pastas[i].id + "' in parents and trashed=false", 'id,name');
          var idSt = null;
          var idPe = null;
          arqs.forEach(function (a) { if (a.name === 'engine-status.json') idSt = a.id; else if (a.name === 'pendentes.json') idPe = a.id; });
          if (idSt) {
            st = await api(API + '/' + encodeURIComponent(idSt) + '?alt=media');
            if (idPe) pe = await api(API + '/' + encodeURIComponent(idPe) + '?alt=media');
          }
        }
        if (!motorStatusValido(st)) {
          M.status = null; M.pendentes = null;
          M.erro = 'Achei a pasta "' + PASTA_MOTOR + '", mas não achei um "engine-status.json" válido dentro dela. Rode o "2-atualizar-tudo.bat" no PC.';
        } else {
          M.status = st;
          M.pendentes = motorPendentesValido(pe) ? pe : null;
          estado.lim.motor = PAGINA;
          D.msg = 'Pronto! Li o que o motor deixou no seu Drive.';
        }
      }
    } catch (e) {
      M.erro = 'Deu erro: ' + e.message;
      D.msg = M.erro;
    }
    M.ocupado = false;
    desenhar(true);
  }

  function motorData(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function motorNum(v) { var n = Number(v); return isFinite(n) ? n.toLocaleString('pt-BR') : '—'; }

  function abaMotor(c) {
    var sit = secao(c, 'Situação');
    if (!D.token) {
      sit.appendChild(el('p', 'Entre com o Google para ver o que o motor descobriu. Aqui o site só lê: não muda nada.', 'situacao'));
      var bLogin = el('button', 'Entrar com Google', 'btn-p');
      bLogin.type = 'button';
      bLogin.style.marginTop = '16px';
      bLogin.onclick = entrar;
      sit.appendChild(bLogin);
      return;
    }
    if (M.ocupado) { sit.appendChild(el('p', 'Lendo o que o motor deixou no seu Drive...', 'situacao')); return; }
    if (M.erro) sit.appendChild(el('p', M.erro, 'situacao'));
    if (!M.status && !M.erro) sit.appendChild(el('p', 'Ainda não li o motor. Use o botão "Ler o motor" aqui embaixo.', 'situacao'));

    var st = M.status;
    if (st) {
      var estadoTxt = { ocioso: 'parado, sem tarefa', trabalhando: 'trabalhando agora', pausado: 'pausado', erro: 'com erro' }[st.motor && st.motor.estado] || '—';
      var ue = st.ultimaExecucao || {};
      sit.appendChild(el('p', 'Motor: ' + estadoTxt + '. Última execução: ' + motorData(ue.fim || ue.inicio) + (ue.resultado ? ' (' + ue.resultado + ')' : '') + '.', 'situacao'));
      var ct = st.contagem;
      sit.appendChild(el('p', motorNum(ct.pendentes) + ' faltam na biblioteca · ' + motorNum(ct.duplicadas) + ' repetidas · ' + motorNum(ct.comErro) + ' com erro · ' + motorNum(ct.naFila) + ' na fila.', 'nota'));
      var idade = Date.now() - new Date(st.gerado).getTime();
      if (isFinite(idade) && idade > 3 * 86400000) {
        sit.appendChild(el('p', 'Atenção: estes dados são de ' + motorData(st.gerado) + '. Dê dois cliques em "2-atualizar-tudo.bat" no PC para atualizar.', 'nota'));
      } else {
        sit.appendChild(el('p', 'Dados gerados em ' + motorData(st.gerado) + '.', 'nota'));
      }
      (Array.isArray(st.avisos) ? st.avisos : []).slice(0, 5).forEach(function (a) { sit.appendChild(el('p', String(a), 'nota')); });
    }

    var ac = secao(c, 'Ações');
    var caixaAc = el('div', null, 'lista');
    caixaAc.appendChild(acaoItem(st ? 'Ler o motor de novo' : 'Ler o motor', 'Só lê', 'Lê os arquivos da pasta "' + PASTA_MOTOR + '" do seu Drive. Não muda nada.', function () { lerMotor(); }, false));
    ac.appendChild(caixaAc);

    if (st && M.pendentes) {
      var itens = M.pendentes.itens;
      var ls = secao(c, 'Faltam na biblioteca (' + motorNum(itens.length) + ')');
      if (!itens.length) { ls.appendChild(vazio('Nada falta. Você já tem tudo das listas.')); return; }
      var caixa = el('div', null, 'lista');
      itens.slice(0, estado.lim.motor).forEach(function (it) {
        var pils = it.origem ? [pilula(String(it.origem))] : [];
        caixa.appendChild(itemLista(String(it.t || '—'), String(it.a || ''), pils, it.posicao != null ? it.posicao : null));
      });
      rodapeMais(caixa, 'motor', itens.length);
      ls.appendChild(caixa);
    } else if (st) {
      c.appendChild(vazio('O motor não deixou a lista "pendentes.json". Rode o "2-atualizar-tudo.bat" no PC.'));
    }
  }

  // ---------- Página "Ferramentas extras" ----------

  var FERRAMENTAS = [
    { id: 'repetidas', nome: 'Músicas repetidas no PC', desc: 'Mostra as músicas repetidas da pasta do PC. Só mostra, não apaga.', para: 'Músicas com o mesmo nome que aparecem mais de uma vez na pasta do PC. A linha mostra o tamanho da maior. Nada é apagado do seu computador.' },
    { id: 'top', nome: 'Top 200, mais tocadas e playlist no YouTube', desc: 'As músicas mais tocadas por gênero (Deezer) e a playlist no YouTube.', para: 'As 200 músicas mais tocadas agora (fonte: Deezer), por gênero. O site marca as que você já tem. Mais abaixo dá para criar uma playlist no YouTube.' },
    { id: 'novidades', nome: 'Novidades das listas', desc: 'O que entrou e saiu das listas mais tocadas.', para: 'O que entrou e o que saiu das listas de músicas mais tocadas desde a última atualização (feita todo dia pelo GitHub).' },
    { id: 'drive', nome: 'Passos manuais do Drive', desc: 'Os passos do botão "Atualizar tudo", um de cada vez.', para: 'Os mesmos passos do botão "Atualizar tudo", um de cada vez, para quem quer controlar cada etapa.' },
    { id: 'json', nome: 'Ferramentas de JSON', desc: 'Baixar arquivos de playlists para o app Toxic Player.', para: 'Arquivos de playlists em JSON (o formato que o app Toxic Player lê). O arquivo principal já é enviado ao Drive pelo "Atualizar tudo".' },
    { id: 'motor', nome: 'Motor do PC (Toxic Engine)', desc: 'Só para quem usa o programa Toxic Engine no computador.', para: 'Mostra o que o programa do PC (Toxic Engine) descobriu: quais músicas das listas ainda faltam na sua biblioteca. Aqui o site só lê.' },
    { id: 'historico', nome: 'Histórico de atualizações e avisos', desc: 'As últimas atualizações das playlists e os últimos avisos do site.', para: 'O que mudou em cada atualização (guardado só neste navegador) e os últimos avisos que o site mostrou.' }
  ];

  function abaHistorico(c) {
    var s1 = secao(c, 'Atualizações das playlists');
    var cx = el('div', null, 'lista');
    if (!reg.hist.length) cx.appendChild(el('div', 'Ainda não há atualizações registradas.', 'linha-simples mu'));
    reg.hist.forEach(function (h) {
      var txt;
      if (h.primeira) txt = 'primeira atualização registrada';
      else if (!h.itens.length) txt = 'nada mudou';
      else {
        txt = h.itens.slice(0, 8).map(function (i) {
          return i.p + ' (' + (i.nova ? 'nova, ' + i.mais + ' músicas' : (i.sumiu ? 'pasta removida' : '+' + i.mais + (i.menos ? ' −' + i.menos : ''))) + ')';
        }).join('; ') + (h.itens.length > 8 ? '; e mais ' + (h.itens.length - 8) : '');
      }
      cx.appendChild(el('div', dataTxt(h.d) + ' — ' + txt, 'linha-simples'));
    });
    s1.appendChild(cx);
    var s2 = secao(c, 'Últimos avisos do site');
    var cy = el('div', null, 'lista');
    if (!UI.hist.length) cy.appendChild(el('div', 'Ainda não teve nenhum aviso.', 'linha-simples mu'));
    UI.hist.forEach(function (h) {
      var rot = { erro: 'Erro', ok: 'Pronto', aviso: 'Atenção', info: 'Aviso' }[h.tipo];
      cy.appendChild(el('div', h.d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' — ' + rot + ': ' + h.texto, 'linha-simples'));
    });
    s2.appendChild(cy);
  }

  function desenharExtras() {
    var menu = $('extrasMenu');
    esvaziar(menu);
    var ferr = estado.ferramenta;
    menu.hidden = !!ferr;
    $('extrasCorpo').hidden = !ferr;
    if (!ferr) {
      FERRAMENTAS.forEach(function (f) {
        var b = el('button', null, 'extras-item');
        b.type = 'button';
        b.appendChild(el('b', f.nome));
        b.appendChild(el('span', f.desc));
        b.onclick = function () { location.hash = 'extras/' + f.id; };
        menu.appendChild(b);
      });
      return;
    }
    var f = FERRAMENTAS.filter(function (x) { return x.id === ferr; })[0];
    $('extrasNome').textContent = f.nome;
    $('extrasPara').textContent = f.para;
    var c = $('conteudo');
    esvaziar(c);
    estado.aba = ferr;
    if (ferr === 'repetidas') abaRepetidas(c);
    else if (ferr === 'top') abaTop(c);
    else if (ferr === 'novidades') abaNovidades(c);
    else if (ferr === 'drive') abaDrive(c);
    else if (ferr === 'json') c.appendChild(ferramentas());
    else if (ferr === 'motor') abaMotor(c);
    else abaHistorico(c);
  }

  // ---------- Montar a tela ----------

  var topoCache = { nSubir: null, nLixo: null, nSite: null, nPl: 0 };

  // Painel do topo (rápido: não refaz a lista de baixo).
  function desenharTopo() {
    var rodando = !!(D.ocupado || D.tudo || DZ.ocupado);
    if (!rodando) {
      topoCache.nSubir = (D.itens && estado.arquivos.length) ? faltamSubir().length : null;
      topoCache.nLixo = D.itens ? planoLixeira().reduce(function (s, g) { return s + g.lixo.length; }, 0) : null;
      topoCache.nSite = D.itens ? D.itens.filter(function (d) { return d.site; }).length : null;
      topoCache.nPl = D.itens ? infoPastas().lista.filter(function (x) { return !x.oculta && !x.cantor; }).length : 0;
    }
    UI.painel({
      google: !!D.token,
      rodando: rodando,
      nDrive: topoCache.nSite,
      nPlaylists: topoCache.nPl,
      nSubir: topoCache.nSubir,
      nLixo: topoCache.nLixo,
      pcNome: estado.arquivos.length > 0 ? estado.pastaNome : '',
      pcTotal: estado.arquivos.length,
      antesNome: estado.antes ? estado.antes.nome : '',
      podePasta: !!window.showDirectoryPicker
    });
  }

  // Desenha tudo. Durante uma operação longa só o topo é refeito (para ficar rápido).
  function desenhar(forcar) {
    desenharTopo();
    var ocup = !!(D.ocupado || D.tudo);
    if (ocup && estado.ocupDesenhado && !forcar) return;
    estado.ocupDesenhado = ocup;
    if (estado.extras) desenharExtras();
    else desenharPlaylists();
  }

  // Texto que explica o que foi lido e o que foi ignorado.
  function resumo(pastaNome, achadas, stats) {
    var txt = 'Pronto! Pasta: ' + pastaNome + '. Pastas lidas: ' + stats.pastas + '. Músicas achadas: ' + achadas + '.';
    var tipos = Object.keys(stats.ignorados).sort(function (a, b) { return stats.ignorados[b] - stats.ignorados[a]; }).slice(0, 6);
    if (tipos.length) {
      txt += ' Outros arquivos ignorados: ' + tipos.map(function (t) { return t + ' (' + stats.ignorados[t] + ')'; }).join(', ') + '.';
    }
    if (stats.pastasComProblema.length) {
      txt += ' Não consegui abrir ' + stats.pastasComProblema.length + ' item(ns), por exemplo: ' + stats.pastasComProblema.slice(0, 3).join(' | ') + '.';
    }
    return txt;
  }

  // Lê as músicas de uma pasta do PC (escolhida agora ou lembrada de antes).
  async function lerPasta(pasta) {
    try {
      UI.msg('Lendo as músicas... aguarde um pouco.');
      var lista = [];
      var stats = { pastas: 0, ignorados: {}, pastasComProblema: [] };
      await varrer(pasta, pasta.name + '/', lista, stats);
      preparar(lista);
      estado.arquivos = lista;
      estado.pastaNome = pasta.name;
      reconstruir();
      estado.aviso = '';
      if (!lista.length) UI.msg('Não achei nenhuma música na pasta ' + pasta.name + ' (' + stats.pastas + ' pasta(s) lida(s)). Escolha a pasta que tem os arquivos de música, como mp3 ou m4a.' + (function () {
        var t = Object.keys(stats.ignorados).sort(function (a, b) { return stats.ignorados[b] - stats.ignorados[a]; }).slice(0, 6);
        return t.length ? ' O que tem nessa pasta: ' + t.map(function (x) { return x + ' (' + stats.ignorados[x] + ')'; }).join(', ') + '.' : ' A pasta está vazia.';
      })());
      else UI.msg(resumo(pasta.name, lista.length, stats));
      desenhar(true);
    } catch (e2) {
      UI.msg('Deu erro ao ler as músicas (' + (e2 && e2.name ? e2.name : 'erro') + '). Tente de novo.');
      desenhar(true);
    }
  }

  async function escolherPasta() {
    var pasta;
    try {
      var opc = { mode: 'read', id: 'musicas-toxic' };
      if (estado.antes && estado.antes.handle) opc.startIn = estado.antes.handle;
      try {
        pasta = await window.showDirectoryPicker(opc);
      } catch (e0) {
        if (e0 && e0.name === 'TypeError') pasta = await window.showDirectoryPicker({ mode: 'read' }); // Chrome mais antigo: sem as opções extras
        else throw e0;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') { UI.msg('Escolha a pasta quando quiser. Nada foi mudado.'); return; }
      UI.msg('A escolha da pasta foi cancelada ou o navegador não deixou (' + (e && e.name ? e.name : 'erro') + '). Tente uma pasta que não seja Downloads, Documentos ou Área de Trabalho.');
      return;
    }
    await guardarPasta(pasta);
    await lerPasta(pasta);
  }

  function ocupadoAgora() { return !!(D.ocupado || D.tudo || DZ.ocupado || UI.andamento.ativo); }

  // O botão grande: entra com o Google ou atualiza tudo.
  function acaoPrincipal() {
    if (ocupadoAgora()) return;
    if (!D.token) { entrar(); return; }
    atualizarTudo();
  }

  // "Usar a pasta de antes": aparece se o site lembra de uma pasta.
  async function iniciar() {
    if (!window.showDirectoryPicker) return;
    var guardada = await pastaGuardada();
    if (!guardada) return;
    estado.antes = {
      nome: guardada.name,
      handle: guardada,
      usar: async function () {
        if (ocupadoAgora()) return;
        var espera = null;
        try {
          UI.msg('Abrindo a pasta de antes. Se o Chrome perguntar, clique em \"Permitir\".');
          var perm = await guardada.queryPermission({ mode: 'read' });
          if (perm !== 'granted') {
            espera = setTimeout(function () { UI.msg('Estou esperando o Chrome. Procure a janelinha no alto da página e clique em \"Permitir\". Se ela não aparecer, use o botão \"Escolher outra pasta\".'); }, 6000);
            perm = await guardada.requestPermission({ mode: 'read' });
            clearTimeout(espera);
            espera = null;
          }
          if (perm === 'granted') { await lerPasta(guardada); return; }
          UI.msg('O Chrome não liberou a pasta de antes. Vou abrir a janela de escolher pasta, já dentro dela: clique em \"Selecionar pasta\".');
          await escolherPasta();
        } catch (e) {
          if (espera) clearTimeout(espera);
          UI.msg('Não consegui abrir a pasta de antes (' + (e && e.name ? e.name : 'erro') + '). Clique em \"Escolher outra pasta\" e escolha a pasta das músicas.');
        }
      }
    };
    desenharTopo();
    try {
      if (await guardada.queryPermission({ mode: 'read' }) === 'granted') await lerPasta(guardada);
    } catch (e) { /* sem problema */ }
  }

  // Qual tela está aberta: principal (#) ou extras (#extras e #extras/nome).
  function lerHash() {
    var partes = (location.hash || '').replace(/^#/, '').split('/');
    estado.extras = partes[0] === 'extras';
    estado.ferramenta = (estado.extras && partes[1] && FERRAMENTAS.some(function (f) { return f.id === partes[1]; })) ? partes[1] : null;
    $('telaPrincipal').hidden = estado.extras;
    $('telaExtras').hidden = !estado.extras;
    $('botaoExtras').hidden = estado.extras;
    try { window.scrollTo(0, 0); } catch (e) { /* sem problema */ }
    desenhar(true);
    if (estado.ferramenta === 'motor' && D.token && !M.status && !M.erro && !M.ocupado) lerMotor();
  }

  UI.acaoEntrar = entrar;
  UI.aoMudar = desenharTopo;
  $('botaoPrincipal').onclick = acaoPrincipal;
  $('botaoAntes').onclick = function () { if (!ocupadoAgora() && estado.antes) estado.antes.usar(); };
  $('botaoPasta').onclick = function () { if (!ocupadoAgora()) escolherPasta(); };
  $('botaoExtras').onclick = function () { location.hash = 'extras'; };
  $('botaoVoltar').onclick = function () { location.hash = ''; };
  $('botaoVoltarMenu').onclick = function () { location.hash = 'extras'; };
  window.addEventListener('hashchange', lerHash);

  carregar();
  regCarregar();
  dzCarregar();
  lerHash();
  iniciar();
})();
