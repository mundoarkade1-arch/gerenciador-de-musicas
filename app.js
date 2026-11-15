(function () {
  'use strict';
  var EXT = ['mp3', 'm4a', 'flac', 'wav', 'ogg', 'wma', 'aac', 'opus', 'm4b', 'aif', 'aiff', 'ape', 'wv', 'mka'];
  var CLIENT_ID = '22049376827-k0tavpkj93lp2e2bc43ga600fp7ktu59.apps.googleusercontent.com';
  var ESCOPOS = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file';
  var PASTA_RAIZ = 'Músicas do Site';
  var CH = window.CHARTS || { atualizado: null, listas: {}, historico: [] };
  var $ = function (id) { return document.getElementById(id); };
  var estado = { arquivos: [], b: [], aba: 'repetidas', lista: null, soFalta: false, tinhaSalvo: false, n: 50, cache: {}, aviso: '' };
  var D = { token: null, itens: null, msg: '', ocupado: false };

  function el(tag, txt, cls) {
    var e = document.createElement(tag);
    if (txt != null) e.textContent = txt;
    if (cls) e.className = cls;
    return e;
  }
  function esvaziar(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  // Deixa o nome "limpo" para comparar: sem acento, sem (1), sem "copia", sem símbolos.
  function limpar(t, tiraParenteses) {
    t = (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    t = t.replace(/\(\d+\)/g, ' ').replace(/\b(copia|copy)\b/g, ' ').replace(/\[[^\]]*\]/g, ' ');
    if (tiraParenteses) t = t.replace(/\([^)]*\)/g, ' ');
    t = t.replace(/\b(official|oficial|audio|video|clipe|lyrics|letra|hd|hq)\b/g, ' ');
    return t.replace(/[^a-z0-9]+/g, ' ').trim();
  }

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
            lista.push({ c: cam + item.name, k: limpar(s, false), b: limpar(s, true), t: f.size, h: item });
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
      localStorage.setItem('gm_biblioteca', JSON.stringify({ d: Date.now(), b: estado.b }));
    } catch (e) { /* sem problema */ }
  }
  function carregar() {
    try {
      var x = JSON.parse(localStorage.getItem('gm_biblioteca') || 'null');
      if (x && x.b && x.b.length) {
        estado.b = x.b;
        estado.tinhaSalvo = true;
        $('mensagem').textContent = 'Última leitura salva: ' + new Date(x.d).toLocaleDateString('pt-BR') + '. Para ver as repetidas, escolha a pasta de novo.';
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
    for (var i = 0; i < estado.b.length; i++) {
      var b = estado.b[i];
      if (b.indexOf(t) >= 0 && (!a || b.indexOf(a) >= 0)) return true;
    }
    return false;
  }

  function numero(valor, rotulo) {
    var d = el('div', null, 'numero');
    d.appendChild(el('b', String(valor)));
    d.appendChild(document.createTextNode(rotulo));
    return d;
  }

  function desenharNumeros() {
    var n = $('numeros');
    esvaziar(n);
    n.appendChild(numero(estado.b.length, 'músicas na pasta'));
    var g = grupos();
    n.appendChild(numero(g.lista.length, 'grupos repetidos'));
    n.appendChild(numero(g.sobra, 'cópias a mais'));
    n.appendChild(numero(CH.atualizado ? new Date(CH.atualizado).toLocaleDateString('pt-BR') : '—', 'listas atualizadas'));
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
    if (!estado.arquivos.length) {
      c.appendChild(el('div', 'Escolha a pasta das suas músicas para ver as repetidas.', 'cartao'));
      return;
    }
    var g = grupos();
    if (!g.lista.length) {
      c.appendChild(el('div', 'Não achei nenhuma música repetida. 🎉', 'cartao'));
      return;
    }
    c.appendChild(el('p', 'Em laranja: mesmo nome e mesmo tamanho. Quase certo que é o mesmo arquivo.', 'suave'));
    g.lista.forEach(function (k) {
      var arr = g.mapa[k];
      var caixa = el('div', null, 'grupo');
      caixa.appendChild(el('h3', k + '  (' + arr.length + ' arquivos)'));
      var tam = {};
      arr.forEach(function (m) { tam[m.t] = (tam[m.t] || 0) + 1; });
      arr.forEach(function (m) {
        var igual = tam[m.t] > 1;
        caixa.appendChild(el('div', m.c + '  —  ' + (m.t / 1048576).toFixed(2) + ' MB' + (igual ? '  — mesmo tamanho' : ''), 'item' + (igual ? ' forte' : '')));
      });
      c.appendChild(caixa);
    });
  }

  function abaTop(c) {
    var ids = Object.keys(CH.listas);
    if (!ids.length) {
      c.appendChild(el('div', 'Ainda não tem listas. Elas aparecem depois da primeira atualização no GitHub.', 'cartao'));
      return;
    }
    if (!estado.lista || !CH.listas[estado.lista]) estado.lista = ids[0];
    var barra = el('div', null, 'barra');
    ids.forEach(function (id) {
      var b = el('button', CH.listas[id].nome, 'leve' + (id === estado.lista ? ' ativa' : ''));
      b.onclick = function () { estado.lista = id; desenhar(); };
      barra.appendChild(b);
    });
    c.appendChild(barra);

    var L = CH.listas[estado.lista];
    var marcadas = L.faixas.map(function (f) { return { f: f, tem: estado.b.length ? tenho(f) : null }; });
    var temN = marcadas.filter(function (m) { return m.tem; }).length;
    var faltam = marcadas.filter(function (m) { return m.tem === false; });

    c.appendChild(el('p', 'Fonte: ' + L.fonte + '.' + (estado.b.length ? ' Você já tem ' + temN + ' de ' + L.faixas.length + '.' : ' Escolha a pasta para ver o que você já tem.'), 'suave'));

    var acoes = el('div', null, 'barra');
    var filtro = el('button', estado.soFalta ? 'Mostrar todas' : 'Mostrar só o que falta', 'leve');
    filtro.onclick = function () { estado.soFalta = !estado.soFalta; desenhar(); };
    var copiar = el('button', '📋 Copiar o que falta');
    copiar.onclick = function () {
      var txt = faltam.map(function (m) { return m.f.a + ' - ' + m.f.t; }).join('\n');
      navigator.clipboard.writeText(txt).then(function () { copiar.textContent = 'Copiado! ✔'; }, function () { copiar.textContent = 'Não consegui copiar'; });
    };
    acoes.appendChild(filtro);
    if (faltam.length) acoes.appendChild(copiar);
    c.appendChild(acoes);

    var caixa = el('div', null, 'cartao rolagem');
    marcadas.forEach(function (m, i) {
      if (estado.soFalta && m.tem !== false) return;
      var l = el('div', null, 'linha');
      l.appendChild(el('span', String(i + 1), 'pos'));
      var nome = el('div', m.f.t, 'nome');
      nome.appendChild(el('small', m.f.a));
      l.appendChild(nome);
      if (m.tem !== null) l.appendChild(el('span', m.tem ? 'já tenho' : 'falta', 'selo ' + (m.tem ? 'tenho' : 'falta')));
      caixa.appendChild(l);
    });
    c.appendChild(caixa);
  }

  function listaFaixas(c, titulo, faixas, mostrarTenho) {
    if (!faixas || !faixas.length) return;
    c.appendChild(el('h2', titulo));
    faixas.forEach(function (f) {
      var l = el('div', null, 'linha');
      var nome = el('div', f.t, 'nome');
      nome.appendChild(el('small', f.a));
      l.appendChild(nome);
      if (mostrarTenho && estado.b.length) {
        var t = tenho(f);
        l.appendChild(el('span', t ? 'já tenho' : 'falta', 'selo ' + (t ? 'tenho' : 'falta')));
      }
      c.appendChild(l);
    });
  }

  function abaNovidades(c) {
    if (!CH.historico.length) {
      c.appendChild(el('div', 'Ainda sem novidades. Elas aparecem quando uma lista mudar entre duas atualizações.', 'cartao'));
      return;
    }
    CH.historico.slice(0, 40).forEach(function (h) {
      var caixa = el('div', null, 'cartao');
      caixa.appendChild(el('h2', new Date(h.d + 'T12:00:00').toLocaleDateString('pt-BR') + ' — ' + h.nome));
      listaFaixas(caixa, 'Entraram agora', h.entraram, true);
      listaFaixas(caixa, 'Saíram da lista', h.sairam, false);
      c.appendChild(caixa);
    });
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
      var b = estado.arquivos[i].b;
      if (b.indexOf(t) >= 0 && (!a || b.indexOf(a) >= 0)) return estado.arquivos[i];
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

  // Aviso que aparece embaixo da tela, sempre visível, e some sozinho.
  function aviso(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:90vw;padding:14px 20px;border-radius:14px;background:#6d28d9;color:#fff;font-size:18px;box-shadow:0 8px 30px rgba(0,0,0,.35);z-index:99;';
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 7000);
  }

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

  function carregarGoogle() {
    return new Promise(function (ok, erro) {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) { ok(); return; }
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = function () { ok(); };
      s.onerror = function () { erro(new Error('Não consegui carregar o login do Google.')); };
      document.head.appendChild(s);
    });
  }

  async function entrar() {
    try {
      await carregarGoogle();
      var cliente = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: ESCOPOS,
        callback: function (r) {
          if (r && r.access_token) {
            D.token = r.access_token;
            D.msg = 'Conectado ao Google Drive. Agora clique em "Ler músicas do Drive".';
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
    if (r.status === 401) { D.token = null; throw new Error('O login do Google venceu. Clique em "Entrar com Google" de novo.'); }
    if (!r.ok) throw new Error('O Google respondeu com erro ' + r.status + '.');
    return r.json();
  }

  async function listarDrive(q, campos) {
    var out = [];
    var tk = '';
    do {
      var u = API + '?q=' + encodeURIComponent(q) + '&fields=' + encodeURIComponent('nextPageToken,files(' + campos + ')') + '&pageSize=1000' + (tk ? '&pageToken=' + encodeURIComponent(tk) : '');
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
        D.itens.push({ id: f.id, fn: f.name, p: cam, k: limpar(s, false), b: limpar(s, true), t: Number(f.size || 0), site: cam === PASTA_RAIZ || cam.indexOf(PASTA_RAIZ + '/') === 0 });
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
    var achados = await listarDrive("name='" + aspas(nome) + "' and mimeType='application/vnd.google-apps.folder' and '" + paiId + "' in parents and trashed=false", 'id');
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

  function listaSimples(c, titulo, linhas) {
    c.appendChild(el('h3', titulo + ' (' + linhas.length + ')'));
    if (!linhas.length) { c.appendChild(el('p', 'Nenhuma. 🎉', 'suave')); return; }
    var caixa = el('div', null, 'rolagem');
    linhas.slice(0, 200).forEach(function (t) { caixa.appendChild(el('div', t, 'item')); });
    c.appendChild(caixa);
    if (linhas.length > 200) c.appendChild(el('p', 'Mostrando só as 200 primeiras.', 'suave'));
  }

  // ---------- Google Drive: repetidas (só manda para a LIXEIRA, nunca apaga de vez) ----------

  // Em cada grupo de repetidas DA PASTA DO SITE, escolhe qual fica:
  // a maior; se o tamanho for quase igual (até 2% de diferença), a de nome mais curto.
  // Só manda para a lixeira cópias com tamanho parecido (até 10% menores). O resto não é mexido.
  function planoLixeira() {
    var gs = {};
    (D.itens || []).forEach(function (d) {
      if (d.site && d.k) (gs[d.k] = gs[d.k] || []).push(d);
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
    if (!window.confirm('Vou mandar ' + total + ' cópia(s) repetida(s) para a LIXEIRA do Drive. Em cada grupo, fica a cópia maior. Nada é apagado de vez: você pode recuperar pela lixeira do Drive por 30 dias. Continuar?')) return 'cancelado';
    D.ocupado = true;
    var certas = 0;
    var falhas = 0;
    var idsOk = {};
    try {
      for (var g = 0; g < plano.length; g++) {
        for (var x = 0; x < plano[g].lixo.length; x++) {
          var d = plano[g].lixo[x];
          D.msg = 'Mandando para a lixeira ' + (certas + falhas + 1) + ' de ' + total + '... (não feche esta página)';
          desenhar();
          try {
            await api(API + '/' + encodeURIComponent(d.id) + '?fields=id', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
            idsOk[d.id] = true;
            certas++;
          } catch (e1) {
            if (!D.token) throw e1;
            falhas++;
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
    var texto = 'Mandei ' + certas + ' cópia(s) para a lixeira do Drive.' + (falhas ? ' ' + falhas + ' não deu certo. Clique no botão de novo para tentar essas.' : '');
    if (certas > 0 && estado.arquivos.length && !quieto) {
      await enviarParaDrive();
      D.msg = texto + ' ' + D.msg;
    } else if (certas > 0 && !quieto) {
      D.msg = texto + ' Para atualizar o arquivo de playlists, escolha a pasta das músicas (botão lá em cima) e clique em "Colocar playlists no Drive".';
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
      if (partes.length) D.msg = partes.join(' ');
      desenhar();
    }
  }

  function linhaDrive(d) {
    var l = el('div', null, 'item');
    l.appendChild(el('span', (d.site ? '[pasta do site] ' : '[fora do site] ') + (d.p ? d.p + '/' : '') + d.fn + ' (' + (d.t / 1048576).toFixed(1) + ' MB)  '));
    var a = el('a', 'abrir no Drive');
    a.href = 'https://drive.google.com/file/d/' + encodeURIComponent(d.id) + '/view';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.cssText = 'color:var(--cor);font-weight:600;';
    l.appendChild(a);
    return l;
  }

  function cartaoNuvem(c) {
    var n = el('div', null, 'cartao');
    n.appendChild(el('h2', '☁ Ligar ao Google Drive'));
    n.appendChild(el('p', 'O site lê os nomes dos seus áudios no Drive. Só envia arquivos quando você clica em um botão de subir. Nunca apaga de vez: as repetidas da pasta "' + PASTA_RAIZ + '" só vão para a lixeira do Drive, depois que você confirma.', 'suave'));
    var barra = el('div', null, 'barra');
    var bEntrar = el('button', D.token ? 'Entrar de novo' : 'Entrar com Google', D.token ? 'leve' : '');
    bEntrar.onclick = entrar;
    barra.appendChild(bEntrar);
    if (D.token) {
      var bLer = el('button', 'Ler músicas do Drive');
      bLer.onclick = lerDrive;
      barra.appendChild(bLer);
    }
    n.appendChild(barra);
    if (D.token) {
      if (estado.arquivos.length) {
        var bTudo = el('button', '🔄 Atualizar tudo (ler o Drive, subir o que falta, limpar repetidas e atualizar as playlists)');
        bTudo.style.marginBottom = '10px';
        bTudo.disabled = D.ocupado || D.tudo;
        bTudo.onclick = function () { atualizarTudo(); };
        n.appendChild(bTudo);
      } else {
        n.appendChild(el('p', 'Para usar o "Atualizar tudo", escolha a pasta das músicas (botão lá em cima).', 'suave'));
      }
    }
    if (D.msg) n.appendChild(el('p', D.msg));

    if (D.itens) {
      var noSite = {};
      var gd = {};
      var nSite = 0;
      D.itens.forEach(function (d) {
        if (d.site) { noSite[d.k] = true; nSite++; }
        if (d.k) (gd[d.k] = gd[d.k] || []).push(d);
      });
      n.appendChild(el('p', 'Na pasta "' + PASTA_RAIZ + '" do Drive: ' + nSite + ' músicas. No resto do Drive: ' + (D.itens.length - nSite) + '.', 'suave'));

      if (estado.arquivos.length) {
        var faltam = faltamSubir();
        var jaTem = estado.arquivos.filter(function (m) { return noSite[m.k]; }).length;
        n.appendChild(el('p', 'Do seu PC: ' + jaTem + ' já estão na pasta "' + PASTA_RAIZ + '" e ' + faltam.length + ' ainda faltam subir para ela. Se a mesma música está em duas pastas do PC, só uma cópia sobe.'));
        if (faltam.length && D.token) {
          var bSubir = el('button', '⬆ Subir as ' + faltam.length + ' que faltam para o Drive');
          bSubir.onclick = function () { subirFaltantes(); };
          bSubir.disabled = D.ocupado || D.tudo;
          n.appendChild(bSubir);
        }
        listaSimples(n, 'Faltam subir para a pasta "' + PASTA_RAIZ + '"', faltam.map(function (m) { return m.c; }));
      } else {
        n.appendChild(el('p', 'Para comparar com o PC, escolha a pasta das músicas (botão lá em cima).', 'suave'));
      }

      // Repetidas DENTRO da pasta do site: o site limpa (lixeira).
      var plano = planoLixeira();
      var totalLixo = plano.reduce(function (s, g) { return s + g.lixo.length; }, 0);
      listaSimples(n, 'Repetidas dentro da pasta "' + PASTA_RAIZ + '"', plano.map(function (g) {
        return 'Fica: ' + g.manter.p + '/' + g.manter.fn + ' (' + (g.manter.t / 1048576).toFixed(1) + ' MB)  →  Lixeira: ' + g.lixo.map(function (d) { return d.p + '/' + d.fn + ' (' + (d.t / 1048576).toFixed(1) + ' MB)'; }).join('  |  ');
      }));
      if (totalLixo && D.token) {
        var bLixo = el('button', '🗑 Mandar ' + totalLixo + ' cópia(s) repetida(s) para a lixeira do Drive');
        bLixo.style.marginTop = '8px';
        bLixo.onclick = function () { mandarParaLixeira(); };
        bLixo.disabled = D.ocupado || D.tudo;
        n.appendChild(bLixo);
      }

      // Repetidas que envolvem arquivos FORA da pasta do site: o site não pode mexer, você apaga pelo Drive.
      var fora = Object.keys(gd).filter(function (k) {
        return gd[k].length > 1 && gd[k].some(function (d) { return !d.site; });
      }).sort(function (a, b) { return gd[b].length - gd[a].length; });
      n.appendChild(el('h3', 'Repetidas com arquivos fora da pasta "' + PASTA_RAIZ + '" (' + fora.length + ')'));
      if (!fora.length) {
        n.appendChild(el('p', 'Nenhuma. 🎉', 'suave'));
      } else {
        n.appendChild(el('p', 'O site não consegue mexer nos arquivos "fora do site". Clique em "abrir no Drive" e apague por lá.', 'suave'));
        var caixaF = el('div', null, 'rolagem');
        fora.slice(0, 100).forEach(function (k) {
          var gr = el('div', null, 'grupo');
          gd[k].forEach(function (d) { gr.appendChild(linhaDrive(d)); });
          caixaF.appendChild(gr);
        });
        n.appendChild(caixaF);
        if (fora.length > 100) n.appendChild(el('p', 'Mostrando só os 100 primeiros grupos.', 'suave'));
      }

      if (estado.arquivos.length) {
        var bEnv = el('button', '⬆ Colocar playlists no Drive (com o id de cada música)');
        bEnv.style.marginTop = '12px';
        bEnv.onclick = enviarParaDrive;
        n.appendChild(bEnv);
      }
    }
    c.appendChild(n);
  }

  function abaDrive(c) {
    cartaoNuvem(c);
    if (!estado.arquivos.length) {
      c.appendChild(el('div', 'Para gerar os arquivos JSON, escolha a pasta das suas músicas (botão roxo lá em cima). O arquivo JSON usa os nomes reais dos seus arquivos.', 'cartao'));
      return;
    }
    if (estado.aviso) c.appendChild(el('div', estado.aviso, 'cartao'));

    // 0) Tudo de uma vez
    var c0 = el('div', null, 'cartao');
    c0.appendChild(el('h2', 'Tudo de uma vez: playlists inteligentes'));
    c0.appendChild(el('p', 'Um único arquivo com as listas top, uma playlist para cada cantor (5 músicas ou mais) e uma para cada pasta. Cada playlist leva também uma regra, para o seu app achar músicas novas sozinho quando o Drive crescer.', 'suave'));
    var botTudo = el('button', '⬇ Baixar playlists inteligentes');
    botTudo.onclick = function () {
      baixar('playlists-inteligentes.json', D.itens ? playlistsComId() : todasPlaylists(), true);
    };
    c0.appendChild(botTudo);
    c.appendChild(c0);

    // 1) Playlists das listas top
    var c1 = el('div', null, 'cartao');
    c1.appendChild(el('h2', '1. Playlists das listas top'));
    c1.appendChild(el('p', 'Cada lista vira uma playlist com as músicas que você já tem. Escolha o tamanho:', 'suave'));
    var barraN = el('div', null, 'barra');
    [50, 100, 200].forEach(function (n) {
      var b = el('button', 'Top ' + n, 'leve' + (estado.n === n ? ' ativa' : ''));
      b.onclick = function () { estado.n = n; estado.aviso = ''; desenhar(); };
      barraN.appendChild(b);
    });
    c1.appendChild(barraN);
    var ids = Object.keys(CH.listas);
    if (!ids.length) c1.appendChild(el('p', 'Ainda não tem listas top. Rode a atualização no GitHub.', 'suave'));
    ids.forEach(function (id) {
      var L = CH.listas[id];
      var tem = faixasDaLista(id, estado.n).length;
      var total = Math.min(estado.n, L.faixas.length);
      var l = el('div', null, 'linha');
      var nome = el('div', playlistDaLista(id, estado.n).nome, 'nome');
      nome.appendChild(el('small', 'Você tem ' + tem + ' de ' + total));
      l.appendChild(nome);
      var b = el('button', 'Baixar JSON', 'leve');
      b.onclick = function () { baixar('playlist-' + nomeSeguro(L.nome) + '-' + estado.n + '.json', [playlistDaLista(id, estado.n)]); };
      l.appendChild(b);
      c1.appendChild(l);
    });
    if (ids.length) {
      var todas = el('button', '⬇ Baixar JSON com TODAS as listas');
      todas.style.marginTop = '12px';
      todas.onclick = function () {
        baixar('playlists-listas-top-' + estado.n + '.json', ids.map(function (id) { return playlistDaLista(id, estado.n); }));
      };
      c1.appendChild(todas);
    }
    c.appendChild(c1);

    // 2) Por cantor
    var c2 = el('div', null, 'cartao');
    c2.appendChild(el('h2', '2. Playlist por cantor'));
    c2.appendChild(el('p', 'Escreva o nome do cantor. Ele procura no nome do arquivo e no nome da pasta.', 'suave'));
    var linha = el('div', null, 'barra');
    var campo = document.createElement('input');
    campo.type = 'text';
    campo.placeholder = 'Nome do cantor';
    campo.style.cssText = 'flex:1 1 220px;padding:12px;font-size:18px;border-radius:12px;border:1px solid var(--borda);background:var(--cartao);color:var(--texto);';
    var gerar = el('button', 'Baixar JSON');
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
      c2.appendChild(el('p', 'Cantores que você mais tem (o site entende "Cantor - Música" e "Música - Cantor"):', 'suave'));
      var chips = el('div', null, 'barra');
      arts.slice(0, 30).forEach(function (a) {
        var b = el('button', a.nome + ' (' + a.faixas.length + ')', 'leve');
        b.onclick = function () { baixar('playlist-' + nomeSeguro(a.nome) + '.json', [plArtista(a)]); };
        chips.appendChild(b);
      });
      c2.appendChild(chips);
      var muitos = arts.filter(function (a) { return a.faixas.length >= 5; });
      var botCada = el('button', '⬇ Uma playlist para cada cantor com 5 músicas ou mais (' + muitos.length + ')');
      botCada.onclick = function () {
        baixar('playlists-cantores.json', muitos.map(function (a) { return plArtista(a); }));
      };
      if (muitos.length) c2.appendChild(botCada);
    } else {
      c2.appendChild(el('p', 'Os nomes dos seus arquivos não têm um traço separando música e cantor (" - "), então não consegui listar os cantores. Você ainda pode digitar o nome do cantor acima.', 'suave'));
    }
    c.appendChild(c2);

    // 3) Por pasta
    var c3 = el('div', null, 'cartao');
    c3.appendChild(el('h2', '3. Uma playlist para cada pasta'));
    var ps = pastas();
    c3.appendChild(el('p', 'Você tem ' + ps.length + ' pasta(s) com música. Cada pasta vira uma playlist.', 'suave'));
    var botPastas = el('button', '⬇ Baixar JSON das pastas');
    botPastas.onclick = function () { baixar('playlists-pastas.json', ps); };
    c3.appendChild(botPastas);
    c.appendChild(c3);
  }

  function desenhar() {
    desenharNumeros();
    var c = $('conteudo');
    esvaziar(c);
    document.querySelectorAll('.abas button').forEach(function (b) {
      b.classList.toggle('ativa', b.getAttribute('data-aba') === estado.aba);
    });
    if (estado.aba === 'repetidas') abaRepetidas(c);
    else if (estado.aba === 'top') abaTop(c);
    else if (estado.aba === 'drive') abaDrive(c);
    else abaNovidades(c);
  }

  var botaoDrive = document.createElement('button');
  botaoDrive.setAttribute('data-aba', 'drive');
  botaoDrive.textContent = 'Google Drive';
  document.querySelector('.abas').appendChild(botaoDrive);

  document.querySelectorAll('.abas button').forEach(function (b) {
    b.onclick = function () { estado.aba = b.getAttribute('data-aba'); desenhar(); };
  });

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
      $('mensagem').textContent = 'Lendo as músicas... aguarde um pouco.';
      var lista = [];
      var stats = { pastas: 0, ignorados: {}, pastasComProblema: [] };
      await varrer(pasta, pasta.name + '/', lista, stats);
      preparar(lista);
      estado.arquivos = lista;
      estado.cache = {};
      estado.b = lista.map(function (m) { return m.b; });
      salvar();
      estado.aviso = '';
      $('mensagem').textContent = resumo(pasta.name, lista.length, stats);
      desenhar();
    } catch (e2) {
      $('mensagem').textContent = 'Deu erro ao ler as músicas (' + (e2 && e2.name ? e2.name : 'erro') + '). Tente de novo.';
    }
  }

  var botao = $('botaoPasta');
  if (!window.showDirectoryPicker) {
    $('mensagem').textContent = 'Para ler a pasta, abra no Google Chrome ou no Microsoft Edge.';
    botao.disabled = true;
  }
  botao.onclick = async function () {
    var pasta;
    try {
      pasta = await window.showDirectoryPicker({ mode: 'read' });
    } catch (e) {
      $('mensagem').textContent = 'A escolha da pasta foi cancelada ou o navegador não deixou (' + (e && e.name ? e.name : 'erro') + '). Tente uma pasta que não seja Downloads, Documentos ou Área de Trabalho.';
      return;
    }
    await guardarPasta(pasta);
    await lerPasta(pasta);
  };

  // Botão "Usar a pasta de antes": aparece se o site lembra de uma pasta.
  async function iniciar() {
    if (!window.showDirectoryPicker) return;
    var guardada = await pastaGuardada();
    if (!guardada) return;
    var botaoAntes = el('button', '↩ Usar a pasta de antes (' + guardada.name + ')', 'leve');
    botaoAntes.style.marginLeft = '10px';
    botao.parentNode.insertBefore(botaoAntes, botao.nextSibling);
    botaoAntes.onclick = async function () {
      try {
        var perm = await guardada.requestPermission({ mode: 'read' });
        if (perm !== 'granted') {
          $('mensagem').textContent = 'Você não deixou o acesso à pasta. Clique de novo e escolha "Permitir", ou use o botão "Escolher pasta das músicas".';
          return;
        }
        await lerPasta(guardada);
      } catch (e) {
        $('mensagem').textContent = 'Não consegui abrir a pasta de antes (' + (e && e.name ? e.name : 'erro') + '). Use o botão "Escolher pasta das músicas".';
      }
    };
    try {
      if (await guardada.queryPermission({ mode: 'read' }) === 'granted') await lerPasta(guardada);
    } catch (e) { /* sem problema */ }
  }

  carregar();
  desenhar();
  iniciar();
})();
