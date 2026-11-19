(function () {
  'use strict';
  var EXT = ['mp3', 'm4a', 'flac', 'wav', 'ogg', 'wma', 'aac', 'opus', 'm4b', 'aif', 'aiff', 'ape', 'wv', 'mka'];
  var CLIENT_ID = '22049376827-k0tavpkj93lp2e2bc43ga600fp7ktu59.apps.googleusercontent.com';
  var ESCOPOS = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file';
  var PASTA_RAIZ = 'Músicas do Site';
  var CH = window.CHARTS || { atualizado: null, listas: {}, historico: [] };
  var $ = function (id) { return document.getElementById(id); };
  var estado = { arquivos: [], b: [], aba: 'repetidas', lista: null, soFalta: false, soFaltaYt: false, tinhaSalvo: false, n: 50, cache: {}, aviso: '', pastaNome: '', lim: { repetidas: 50, top: 50, novidades: 50, motor: 50 }, abertos: {}, antes: null, ocupDesenhado: false };
  var D = { token: null, itens: null, ocupado: false };
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
            lista.push({ c: cam + item.name, k: chaveNome(s, false), b: chaveNome(s, true), t: f.size, h: item });
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
        UI.msg('Última leitura salva: ' + new Date(x.d).toLocaleDateString('pt-BR') + '. Para ver as repetidas, escolha a pasta de novo.');
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

  function numero(valor, rotulo, vermelho) {
    var d = el('div', null, 'numero');
    d.appendChild(el('b', String(valor), 'num' + (vermelho ? ' vermelho' : '')));
    d.appendChild(el('span', rotulo));
    return d;
  }

  // Os 4 números em uma faixa só. Só aparecem quando há dados.
  function desenharNumeros(faltam) {
    var n = $('numeros');
    esvaziar(n);
    if (!estado.b.length) { n.hidden = true; return; }
    n.hidden = false;
    var g = estado.arquivos.length ? grupos() : null;
    var noDrive = D.itens ? D.itens.filter(function (d) { return d.site; }).length : null;
    n.appendChild(numero(estado.b.length.toLocaleString('pt-BR'), 'músicas na pasta'));
    n.appendChild(numero(g ? g.sobra.toLocaleString('pt-BR') : '—', 'repetidas', !!(g && g.sobra)));
    n.appendChild(numero(faltam == null ? '—' : faltam.toLocaleString('pt-BR'), 'faltam enviar'));
    n.appendChild(numero(noDrive == null ? '—' : noDrive.toLocaleString('pt-BR'), 'já estão no Drive'));
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
    cal.appendChild(el('p', 'Esta lista só mostra as repetidas do seu computador. Nada é apagado daqui. Para limpar as repetidas que já estão no Drive, use o botão "Atualizar tudo" lá em cima, ou a aba Drive (manual).'));
    var ir = el('button', 'Abrir a aba Drive (manual)', 'btn-s');
    ir.type = 'button';
    ir.onclick = function () { estado.aba = 'drive'; desenhar(true); var ab = document.querySelector('.abas'); if (ab) ab.scrollIntoView(); };
    cal.appendChild(ir);
    c.appendChild(cal);
    var caixa = el('div', null, 'lista');
    g.lista.slice(0, estado.lim.repetidas).forEach(function (k) {
      var arr = g.mapa[k];
      var maior = arr.reduce(function (a, b) { return b.t > a.t ? b : a; }, arr[0]);
      var vistas = {};
      var pastasTxt = [];
      arr.forEach(function (m) { var p = pastaCurta(m.c); if (!vistas[p]) { vistas[p] = 1; pastasTxt.push(p); } });
      caixa.appendChild(itemLista(nomeSemExt(maior.c), pastasTxt.join('  ·  '), [pilula(arr.length + ' cópias', 'verm'), pilula(tamanhoTxt(maior.t), 'tam')]));
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
      var bE = el('button', 'Entrar com YouTube', 'btn-v');
      bE.type = 'button';
      bE.onclick = ytEntrar;
      bar.appendChild(bE);
    } else {
      var bV = el('button', q.lote.length ? 'Enviar as próximas ' + q.lote.length + ' músicas' : (q.pendentes ? 'A cota de hoje acabou. Volte amanhã' : 'Playlist completa'), 'btn-v');
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
    for (var i = 0; i < estado.arquivos.length; i++) {
      if (casa(estado.arquivos[i].b, t, a)) return estado.arquivos[i];
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
    estado.arquivos.forEach(function (m) {
      var h = limpar(m.c, true);
      if (toks.every(function (t) { return h.indexOf(t) >= 0; })) faixas.push(faixaLocal(m));
    });
    return { nome: texto.trim(), origem: 'Cantor', regra: { tipo: 'artista', nome: texto.trim() }, faixas: faixas };
  }

  function artistas() {
    var mapa = {};
    estado.arquivos.forEach(function (m) {
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

  function pastas() {
    var mapa = {};
    estado.arquivos.forEach(function (m) {
      var p = pastaDoArquivo(m.c);
      (mapa[p] = mapa[p] || []).push(faixaLocal(m));
    });
    return Object.keys(mapa).map(function (p) {
      var nome = p.slice(p.lastIndexOf('/') + 1) || p;
      return { nome: nome, origem: 'Pasta', regra: { tipo: 'pasta', nome: nome }, faixas: mapa[p] };
    });
  }

  function todasPlaylists() {
    var todas = Object.keys(CH.listas).map(function (id) { return playlistDaLista(id, estado.n); });
    artistas().filter(function (a) { return a.faixas.length >= 5; }).forEach(function (a) { todas.push(plArtista(a)); });
    pastas().forEach(function (p) { todas.push(p); });
    return todas;
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
            D.msg = 'Conectado ao Google. Agora clique em "Atualizar tudo".';
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
      function caminho(id) {
        var partes = [];
        var n = 0;
        while (id && mp[id] && n++ < 30) { partes.unshift(mp[id].name); id = (mp[id].parents || [])[0]; }
        return partes.join('/');
      }
      var arqs = await listarDrive("(mimeType contains 'audio/' or mimeType='application/octet-stream') and trashed=false", 'id,name,size,parents');
      D.itens = [];
      arqs.forEach(function (f) {
        var i = f.name.lastIndexOf('.');
        if (i < 0 || EXT.indexOf(f.name.slice(i + 1).toLowerCase()) < 0) return;
        var s = f.name.slice(0, i);
        var cam = caminho((f.parents || [])[0]);
        D.itens.push({ id: f.id, fn: f.name, p: cam, k: chaveNome(s, false), b: chaveNome(s, true), t: Number(f.size || 0), site: cam === PASTA_RAIZ || cam.indexOf(PASTA_RAIZ + '/') === 0 });
      });
      D.msg = 'Pronto! Achei ' + D.itens.length + ' músicas no seu Drive.';
      okLer = true;
    } catch (e) {
      D.msg = 'Deu erro: ' + e.message;
    }
    D.ocupado = false;
    desenhar();
    return okLer;
  }

  function playlistsComId() {
    var mapa = {};
    D.itens.forEach(function (d) {
      var ch = d.fn.toLowerCase();
      if (!mapa[ch] || d.site) mapa[ch] = d.id;
    });
    return todasPlaylists().map(function (p) {
      p.faixas = p.faixas.map(function (f) {
        var id = mapa[f.fn.toLowerCase()];
        return id ? Object.assign({ id: id }, f) : f;
      });
      return p;
    });
  }

  async function enviarParaDrive() {
    if (D.ocupado) return;
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
      D.msg = 'Pronto! O arquivo ' + nomeArq + ' está no seu Drive, na pasta "Toxic Playlists".';
    } catch (e) {
      D.msg = 'Deu erro ao enviar: ' + e.message;
    }
    D.ocupado = false;
    desenhar();
  }

  // ---------- Google Drive: subir as músicas que faltam ----------

  function faltamSubir() {
    if (!D.itens) return [];
    var noDrive = {};
    D.itens.forEach(function (d) { if (d.site) noDrive[d.k] = true; });
    // Se a mesma música está em duas pastas do PC, sobe só uma cópia: a maior.
    var melhor = {};
    estado.arquivos.forEach(function (m) {
      if (m.k && !noDrive[m.k] && (!melhor[m.k] || m.t > melhor[m.k].t)) melhor[m.k] = m;
    });
    return estado.arquivos.filter(function (m) {
      if (!m.h) return false;
      if (!m.k) return true;
      return melhor[m.k] === m;
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
          D.itens.push({ id: r.id, fn: nomeDoArquivo(m.c), p: PASTA_RAIZ + '/' + pastaDoArquivo(m.c), k: m.k, b: m.b, t: m.t, site: true });
          certas++;
        } catch (e1) {
          if (!D.token) throw e1;
          falhas++;
        }
      }
    } catch (e) {
      D.ocupado = false;
      D.msg = 'Parou depois de subir ' + certas + ' música(s). ' + e.message;
      desenhar();
      return false;
    }
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
      D.ocupado = false;
      D.msg = 'Parou depois de mandar ' + certas + ' cópia(s) para a lixeira. ' + e.message;
      desenhar();
      return false;
    }
    D.itens = D.itens.filter(function (d) { return !idsOk[d.id]; });
    D.ocupado = false;
    var texto = 'Mandei ' + certas + ' cópia(s) para a lixeira do Drive.' + (falhas ? ' ' + falhas + ' não deu certo. Clique no botão de novo para tentar essas.' : '') + (semPerm ? ' ' + semPerm + ' cópia(s) o site não tem permissão para mexer (foram colocadas na pasta por fora do site). Apague essas pelo próprio Drive: veja a lista "Repetidas com arquivos fora da pasta".' : '');
    if (certas > 0 && estado.arquivos.length && !quieto) {
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

  // Um botão só: lê o Drive, sobe o que falta, limpa repetidas e atualiza as playlists.
  async function atualizarTudo() {
    if (D.ocupado || D.tudo) return;
    if (!D.token) { aviso('Clique em "Entrar com Google" primeiro.'); return; }
    if (!estado.arquivos.length) { aviso('Escolha a pasta das músicas (botão lá em cima) primeiro.'); return; }
    D.tudo = true;
    UI.quieto = true;
    var partes = [];
    try {
      D.msg = 'Atualizando tudo... (não feche esta página)';
      desenhar();
      if (!(await lerDrive())) return;
      partes.push(D.msg);
      if (faltamSubir().length) {
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
      desenhar();
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
    dir.appendChild(pilula(String(contador), contador ? 'verm' : ''));
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
      var bLogin = el('button', 'Entrar com Google', 'btn-v');
      bLogin.type = 'button';
      bLogin.style.marginTop = '16px';
      bLogin.onclick = entrar;
      sit.appendChild(bLogin);
    } else if (!D.itens) {
      sit.appendChild(el('p', 'Ainda não li o seu Drive. Use "Ler o Drive" aqui embaixo, ou "Atualizar tudo" lá em cima.', 'situacao'));
    }
    var nSite = 0;
    var noSite = {};
    var gd = {};
    var faltam = [];
    var plano = [];
    var totalLixo = 0;
    if (D.itens) {
      D.itens.forEach(function (d) {
        if (d.site) { noSite[d.k] = true; nSite++; }
        if (d.k) (gd[d.k] = gd[d.k] || []).push(d);
      });
      if (estado.arquivos.length) {
        faltam = faltamSubir();
        var jaTem = estado.arquivos.filter(function (m) { return noSite[m.k]; }).length;
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
      var motBase = !lido ? 'faça o passo 1 primeiro.' : (!temPasta ? 'escolha a pasta das músicas lá em cima primeiro.' : '');
      caixaAc.appendChild(acaoItem('1. ' + (lido ? 'Ler o Drive de novo' : 'Ler o Drive'), 'Só lê', 'Vê o que já está no seu Drive. Comece por aqui: os outros passos dependem deste.', function () { lerDrive(); }, ocup));
      caixaAc.appendChild(acaoItem('2. ' + (faltam.length ? 'Subir as ' + faltam.length + ' que faltam' : 'Subir as que faltam'), 'Sobe arquivos', 'Cria a pasta \"' + PASTA_RAIZ + '\" no Drive e sobe só uma cópia de cada música (a maior).', function () { subirFaltantes(); }, ocup || !!motBase || !faltam.length, motBase || 'não falta nada: tudo já está no Drive.'));
      caixaAc.appendChild(acaoItem('3. ' + (totalLixo ? 'Mandar ' + totalLixo + ' repetidas para a lixeira' : 'Limpar as repetidas'), 'Você confirma antes', 'Só dentro de \"' + PASTA_RAIZ + '\". Fica a cópia maior; dá para recuperar pela lixeira do Drive.', function () { mandarParaLixeira(); }, ocup || !lido || !totalLixo, !lido ? 'faça o passo 1 primeiro.' : 'não há repetidas dentro de \"' + PASTA_RAIZ + '\".'));
      caixaAc.appendChild(acaoItem('4. Atualizar as playlists no Drive', 'Drive', 'Coloca o arquivo de playlists (para o app do celular) na pasta \"Toxic Playlists\" do seu Drive.', function () { enviarParaDrive(); }, ocup || !!motBase, motBase));
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

    // (d) Ferramentas avançadas (fechada)
    var av = secao(c, 'Extras (opcional): playlists para o app do celular');
    var caixaAv = el('div', null, 'lista');
    caixaAv.appendChild(ferramentas());
    av.appendChild(caixaAv);
  }

  // Arquivos de playlists em JSON (o formato que o app do celular lê). Termos técnicos só aqui.
  function ferramentas() {
    var d = document.createElement('details');
    d.className = 'rec';
    if (estado.abertos.avancado) d.open = true;
    d.addEventListener('toggle', function () { estado.abertos.avancado = d.open; });
    d.appendChild(el('summary', 'Clique aqui para abrir as ferramentas de playlist (arquivos JSON)'));
    var corpo = el('div', null, 'avancado-corpo');
    d.appendChild(corpo);

    var intro = el('div', null, 'bloco');
    intro.appendChild(el('p', 'Só precisa disto se você usa o app Toxic Player no celular; se não usa, pode ignorar. Arquivos de playlists para o app do celular. O formato é JSON, um arquivo de texto com a lista das músicas. Ele usa os nomes reais dos seus arquivos.', 'nota'));
    corpo.appendChild(intro);
    if (!estado.arquivos.length) {
      intro.appendChild(el('p', 'Para gerar os arquivos, escolha primeiro a pasta das suas músicas.', 'nota'));
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
      var bLogin = el('button', 'Entrar com Google', 'btn-v');
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

  // ---------- Montar a tela ----------

  var PARA_QUE = {
    repetidas: { o: 'Músicas com o mesmo nome que aparecem mais de uma vez na pasta que você escolheu. A linha mostra o tamanho da maior.', f: 'Só para conferir: nada é apagado do seu computador. A limpeza no Drive é feita pelo botão "Atualizar tudo", lá em cima.' },
    top: { o: 'As 200 músicas mais tocadas agora (fonte: Deezer), por gênero. O site marca as que você já tem.', f: 'Escolha o gênero, escolha a lista e veja o que falta. Se quiser, crie uma playlist no YouTube mais abaixo.' },
    novidades: { o: 'O que entrou e o que saiu das listas de músicas mais tocadas desde a última atualização (feita todo dia).', f: 'Nada a fazer: é só para ver o que há de novo.' },
    drive: { o: 'Os mesmos passos do botão "Atualizar tudo", mas um de cada vez, para quem quer controlar cada etapa.', f: 'Normalmente você não precisa desta aba. Se usar, entre com o Google e siga os passos de 1 a 4, de cima para baixo.' },
    motor: { o: 'Área avançada. Mostra o que o programa do PC (Toxic Engine) descobriu: quais músicas das listas ainda faltam na sua biblioteca.', f: 'Só use se você roda esse programa no PC. Entre com o Google e clique em \"Ler o motor\". Aqui o site só lê.' }
  };

  // Cartão principal + números (rápido: não refaz a lista de baixo).
  function desenharTopo() {
    var temItens = !!D.itens && estado.arquivos.length > 0;
    var nSubir = temItens ? faltamSubir().length : null;
    var nLixo = D.itens ? planoLixeira().reduce(function (s, g) { return s + g.lixo.length; }, 0) : null;
    UI.hero({
      pasta: estado.arquivos.length > 0,
      google: !!D.token,
      pastaNome: estado.pastaNome,
      ocupado: !!D.ocupado,
      tudo: !!D.tudo,
      nSubir: nSubir,
      nLixo: nLixo,
      nDrive: D.itens ? D.itens.length : null,
      podePasta: !!window.showDirectoryPicker,
      antes: estado.antes ? { nome: estado.antes.nome } : null
    });
    desenharNumeros(nSubir);
  }

  // Desenha tudo. Durante uma operação longa só o topo é refeito (para ficar rápido).
  function desenhar(forcar) {
    desenharTopo();
    var ocup = !!(D.ocupado || D.tudo);
    if (ocup && estado.ocupDesenhado && !forcar) return;
    estado.ocupDesenhado = ocup;
    var c = $('conteudo');
    esvaziar(c);
    document.querySelectorAll('.abas button').forEach(function (b) {
      if (b.getAttribute('data-aba') === estado.aba) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
    var pq = PARA_QUE[estado.aba] || { o: '', f: '' };
    $('paraque').textContent = pq.o;
    $('comofazer').textContent = pq.f;
    if (estado.aba === 'repetidas') abaRepetidas(c);
    else if (estado.aba === 'top') abaTop(c);
    else if (estado.aba === 'drive') abaDrive(c);
    else if (estado.aba === 'motor') abaMotor(c);
    else abaNovidades(c);
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

  // Lê as músicas de uma pasta (escolhida agora ou lembrada de antes).
  async function lerPasta(pasta) {
    try {
      UI.msg('Lendo as músicas... aguarde um pouco.');
      var lista = [];
      var stats = { pastas: 0, ignorados: {}, pastasComProblema: [] };
      await varrer(pasta, pasta.name + '/', lista, stats);
      preparar(lista);
      estado.arquivos = lista;
      estado.pastaNome = pasta.name;
      estado.cache = {};
      estado.b = lista.map(function (m) { return m.b; });
      memoTenho = {};
      salvar();
      estado.aviso = '';
      if (!lista.length) UI.msg('Não achei nenhuma música na pasta ' + pasta.name + ' (' + stats.pastas + ' pasta(s) lida(s)). Escolha a pasta que tem os arquivos de música, como mp3 ou m4a.' + (function () {
        var t = Object.keys(stats.ignorados).sort(function (a, b) { return stats.ignorados[b] - stats.ignorados[a]; }).slice(0, 6);
        return t.length ? ' O que tem nessa pasta: ' + t.map(function (x) { return x + ' (' + stats.ignorados[x] + ')'; }).join(', ') + '.' : ' A pasta está vazia.';
      })());
      else UI.msg(resumo(pasta.name, lista.length, stats));
      desenhar();
    } catch (e2) {
      UI.msg('Deu erro ao ler as músicas (' + (e2 && e2.name ? e2.name : 'erro') + '). Tente de novo.');
      desenhar();
    }
  }

  // O botão grande do cartão principal faz o passo certo.
  async function escolherPasta() {
    var pasta;
    try {
      pasta = await window.showDirectoryPicker({ mode: 'read' });
    } catch (e) {
      if (e && e.name === 'AbortError') { UI.msg('Escolha a pasta quando quiser. Nada foi mudado.'); return; }
      UI.msg('A escolha da pasta foi cancelada ou o navegador não deixou (' + (e && e.name ? e.name : 'erro') + '). Tente uma pasta que não seja Downloads, Documentos ou Área de Trabalho.');
      return;
    }
    await guardarPasta(pasta);
    await lerPasta(pasta);
  }

  function acaoPrincipal() {
    if (D.ocupado || D.tudo || UI.andamento.ativo) return;
    if (!estado.arquivos.length) { escolherPasta(); return; }
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
      usar: async function () {
        try {
          var perm = await guardada.requestPermission({ mode: 'read' });
          if (perm !== 'granted') {
            UI.msg('Você não deixou o acesso à pasta. Clique de novo e escolha "Permitir", ou use o botão "Escolher pasta das músicas".');
            return;
          }
          await lerPasta(guardada);
        } catch (e) {
          UI.msg('Não consegui abrir a pasta de antes (' + (e && e.name ? e.name : 'erro') + '). Use o botão "Escolher pasta das músicas".');
        }
      }
    };
    desenharTopo();
    try {
      if (await guardada.queryPermission({ mode: 'read' }) === 'granted') await lerPasta(guardada);
    } catch (e) { /* sem problema */ }
  }

  UI.acaoEntrar = entrar;
  UI.aoMudar = desenharTopo;
  $('botaoPrincipal').onclick = acaoPrincipal;
  $('botaoAntes').onclick = function () { if (estado.antes) estado.antes.usar(); };
  $('botaoGoogle').onclick = function () { if (!D.ocupado && !D.tudo && !UI.andamento.ativo) entrar(); };
  document.querySelectorAll('.abas button').forEach(function (b) {
    b.onclick = function () {
      estado.aba = b.getAttribute('data-aba');
      desenhar(true);
      if (estado.aba === 'motor' && D.token && !M.status && !M.erro && !M.ocupado) lerMotor();
    };
  });

  if (!window.showDirectoryPicker) UI.msg('Para ler a pasta, abra no Google Chrome ou no Microsoft Edge.');
  carregar();
  desenhar(true);
  iniciar();
})();
