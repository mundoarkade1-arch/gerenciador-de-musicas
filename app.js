(function () {
  'use strict';
  var EXT = ['mp3', 'm4a', 'flac', 'wav', 'ogg', 'wma', 'aac', 'opus'];
  var CH = window.CHARTS || { atualizado: null, listas: {}, historico: [] };
  var $ = function (id) { return document.getElementById(id); };
  var estado = { arquivos: [], b: [], aba: 'repetidas', lista: null, soFalta: false, tinhaSalvo: false };

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

  async function varrer(dir, cam, lista) {
    for await (var e of dir.values()) {
      if (e.kind === 'directory') {
        await varrer(e, cam + e.name + '/', lista);
      } else {
        var i = e.name.lastIndexOf('.');
        var ext = i < 0 ? '' : e.name.slice(i + 1).toLowerCase();
        if (EXT.indexOf(ext) >= 0) {
          var f = await e.getFile();
          var s = e.name.slice(0, i);
          lista.push({ c: cam + e.name, k: limpar(s, false), b: limpar(s, true), t: f.size });
        }
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

  function desenhar() {
    desenharNumeros();
    var c = $('conteudo');
    esvaziar(c);
    document.querySelectorAll('.abas button').forEach(function (b) {
      b.classList.toggle('ativa', b.getAttribute('data-aba') === estado.aba);
    });
    if (estado.aba === 'repetidas') abaRepetidas(c);
    else if (estado.aba === 'top') abaTop(c);
    else abaNovidades(c);
  }

  document.querySelectorAll('.abas button').forEach(function (b) {
    b.onclick = function () { estado.aba = b.getAttribute('data-aba'); desenhar(); };
  });

  var botao = $('botaoPasta');
  if (!window.showDirectoryPicker) {
    $('mensagem').textContent = 'Para ler a pasta, abra no Google Chrome ou no Microsoft Edge.';
    botao.disabled = true;
  }
  botao.onclick = async function () {
    try {
      var pasta = await window.showDirectoryPicker({ mode: 'read' });
      $('mensagem').textContent = 'Lendo as músicas... aguarde um pouco.';
      var lista = [];
      await varrer(pasta, pasta.name + '/', lista);
      estado.arquivos = lista;
      estado.b = lista.map(function (m) { return m.b; });
      salvar();
      $('mensagem').textContent = 'Pronto! Pasta lida: ' + pasta.name;
      desenhar();
    } catch (e) {
      $('mensagem').textContent = 'Não foi possível ler a pasta. Tente de novo.';
    }
  };

  carregar();
  desenhar();
})();
