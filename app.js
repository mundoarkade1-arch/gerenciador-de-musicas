(function () {
  'use strict';
  var EXT = ['mp3', 'm4a', 'flac', 'wav', 'ogg', 'wma', 'aac', 'opus', 'm4b', 'aif', 'aiff', 'ape', 'wv', 'mka'];
  var CH = window.CHARTS || { atualizado: null, listas: {}, historico: [] };
  var $ = function (id) { return document.getElementById(id); };
  var estado = { arquivos: [], b: [], aba: 'repetidas', lista: null, soFalta: false, tinhaSalvo: false, n: 50, cache: {}, aviso: '' };

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
            lista.push({ c: cam + item.name, k: limpar(s, false), b: limpar(s, true), t: f.size });
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

  // "Artista - Título.mp3" vira artista e título.
  function lerNome(c) {
    var nome = nomeDoArquivo(c);
    var i = nome.lastIndexOf('.');
    var sem = i < 0 ? nome : nome.slice(0, i);
    var j = sem.indexOf(' - ');
    if (j > 0) return { a: sem.slice(0, j).trim(), t: sem.slice(j + 3).trim() };
    return { a: '', t: sem.trim() };
  }

  function faixaLocal(m) {
    var n = lerNome(m.c);
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
    return { nome: L.nome.replace(/^Top 200/, 'Top ' + n) + (/^Top 200/.test(L.nome) ? '' : ' (primeiras ' + n + ')'), origem: L.fonte, faixas: faixasDaLista(id, n) };
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

  function baixar(arquivo, playlists) {
    playlists = playlists.filter(function (p) { return p.faixas.length > 0; });
    if (!playlists.length) {
      aviso('Não achei nenhuma música dessa playlist na sua pasta. Nada foi baixado.');
      return;
    }
    var obj = { formato: 'toxic-playlists', v: 1, gerado: new Date().toISOString(), playlists: playlists };
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
    return { nome: texto.trim(), origem: 'Cantor', faixas: faixas };
  }

  function artistas() {
    var mapa = {};
    estado.arquivos.forEach(function (m) {
      var n = lerNome(m.c);
      if (!n.a) return;
      var k = limpar(n.a, true);
      if (!k) return;
      if (!mapa[k]) mapa[k] = { nome: n.a, faixas: [] };
      mapa[k].faixas.push(faixaLocal(m));
    });
    return Object.keys(mapa).map(function (k) { return mapa[k]; }).sort(function (x, y) { return y.faixas.length - x.faixas.length; });
  }

  function pastas() {
    var mapa = {};
    estado.arquivos.forEach(function (m) {
      var p = pastaDoArquivo(m.c);
      (mapa[p] = mapa[p] || []).push(faixaLocal(m));
    });
    return Object.keys(mapa).map(function (p) {
      var nome = p.slice(p.lastIndexOf('/') + 1) || p;
      return { nome: nome, origem: 'Pasta', faixas: mapa[p] };
    });
  }

  function abaDrive(c) {
    if (!estado.arquivos.length) {
      c.appendChild(el('div', 'Primeiro escolha a pasta das suas músicas (botão roxo lá em cima). O arquivo JSON usa os nomes reais dos seus arquivos.', 'cartao'));
      return;
    }
    if (estado.aviso) c.appendChild(el('div', estado.aviso, 'cartao'));

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
      c2.appendChild(el('p', 'Cantores que você mais tem (pelo nome do arquivo "Cantor - Música"):', 'suave'));
      var chips = el('div', null, 'barra');
      arts.slice(0, 30).forEach(function (a) {
        var b = el('button', a.nome + ' (' + a.faixas.length + ')', 'leve');
        b.onclick = function () { baixar('playlist-' + nomeSeguro(a.nome) + '.json', [{ nome: a.nome, origem: 'Cantor', faixas: a.faixas }]); };
        chips.appendChild(b);
      });
      c2.appendChild(chips);
      var muitos = arts.filter(function (a) { return a.faixas.length >= 5; });
      var botCada = el('button', '⬇ Uma playlist para cada cantor com 5 músicas ou mais (' + muitos.length + ')');
      botCada.onclick = function () {
        baixar('playlists-cantores.json', muitos.map(function (a) { return { nome: a.nome, origem: 'Cantor', faixas: a.faixas }; }));
      };
      if (muitos.length) c2.appendChild(botCada);
    } else {
      c2.appendChild(el('p', 'Os nomes dos seus arquivos não têm o formato "Cantor - Música", então não consegui listar os cantores. Você ainda pode digitar o nome do cantor acima.', 'suave'));
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
    try {
      $('mensagem').textContent = 'Lendo as músicas... aguarde um pouco.';
      var lista = [];
      var stats = { pastas: 0, ignorados: {}, pastasComProblema: [] };
      await varrer(pasta, pasta.name + '/', lista, stats);
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
  };

  carregar();
  desenhar();
})();
