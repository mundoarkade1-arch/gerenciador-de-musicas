/* ui.js — parte VISUAL do site: faixa de aviso, cartão principal, janelas, tema.
   Não mexe no Drive nem nas músicas. O app.js chama UI.msg(...), UI.confirmar(...) e UI.hero(...).
   Sem animações: tudo muda na hora. O único movimento é a barra de progresso crescendo. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var $ = function (id) { return document.getElementById(id); };

  function el(tag, txt, cls) {
    var e = document.createElement(tag);
    if (txt != null) e.textContent = txt;
    if (cls) e.className = cls;
    return e;
  }
  function esvaziar(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  // ---------- Ícones (SVG criado por JS, por causa da CSP) ----------
  var ICONES = {
    musica: ['M9 18V6l11-2v12', 'M9 18a3 3 0 11-6 0 3 3 0 016 0z', 'M20 16a3 3 0 11-6 0 3 3 0 016 0z'],
    pasta: ['M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z'],
    usuario: ['M12 12a4 4 0 100-8 4 4 0 000 8z', 'M4 20a8 8 0 0116 0'],
    atualizar: ['M20 11a8 8 0 00-14.5-4.5L4 8', 'M4 4v4h4', 'M4 13a8 8 0 0014.5 4.5L20 16', 'M20 20v-4h-4'],
    subir: ['M12 19V5', 'M6 11l6-6 6 6'],
    lixeira: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12', 'M9 7V4h6v3'],
    documento: ['M14 3H6v18h12V7z', 'M14 3v4h4', 'M9 13h6', 'M9 17h4'],
    check: ['M5 12.5l4.5 4.5L19 7.5'],
    alerta: ['M12 6.5v7', 'M12 17.5h.01'],
    escudo: ['M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z'],
    seta: ['M5 12h14', 'M13 6l6 6-6 6'],
    lua: ['M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z'],
    sol: ['M12 9a3 3 0 100 6 3 3 0 000-6z', 'M12 3v2', 'M12 19v2', 'M3 12h2', 'M19 12h2', 'M5.6 5.6L7 7', 'M17 17l1.4 1.4', 'M18.4 5.6L17 7', 'M7 17l-1.4 1.4'],
    info: ['M12 11v6', 'M12 7.5h.01']
  };
  function icone(nome) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'ico');
    s.setAttribute('aria-hidden', 'true');
    (ICONES[nome] || ICONES.info).forEach(function (d) {
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      s.appendChild(p);
    });
    return s;
  }

  var UI = { ultima: '', quieto: false, acaoEntrar: null, aoMudar: null, hist: [], icone: icone };
  // Estado do que está acontecendo agora (para a faixa e para o cartão principal).
  function novoAndamento() { return { ativo: false, etapa: -1, titulo: '', arquivo: '', pct: null, confirmando: false }; }
  UI.andamento = novoAndamento();
  function mudou() { if (UI.aoMudar) UI.aoMudar(); }

  // ---------- Tema (escuro é o padrão; claro é opcional) ----------
  var tema = 'escuro';
  try { if (localStorage.getItem('gm_tema2') === 'claro') tema = 'claro'; } catch (e) { /* sem problema */ }
  document.documentElement.setAttribute('data-tema', tema);

  // ---------- Que tipo de mensagem é? ----------
  var ERRO_INICIO = /^(Deu erro|Parou|O login|Não consegui|A escolha|Você não deixou|O Google)/;
  var ERRO_MEIO = /(Deu erro|Parou depois|O Google respondeu)/;
  function tipoDe(t) {
    if (ERRO_INICIO.test(t) || ERRO_MEIO.test(t)) return 'erro';
    if (/^(Subindo|Mandando para a lixeira|Lendo|Enviando|Atualizando|Preparando)/.test(t)) return 'prog';
    if (/^(Para ler a pasta|Não|Clique|Escolha|Escreva)/.test(t)) return 'aviso';
    if (/^(Pronto|Subi|Mandei|Conectado)/.test(t)) return 'ok';
    return 'info';
  }
  UI.tipoDe = tipoDe;

  function etapaDe(t) {
    if (/^Lendo o seu Drive/.test(t)) return 0;
    if (/^(Preparando a pasta|Subindo)/.test(t)) return 1;
    if (/^Mandando para a lixeira/.test(t)) return 2;
    if (/^Enviando para o YouTube/.test(t)) return 'yt';
    if (/^Enviando/.test(t)) return 3;
    if (/^Lendo as músicas/.test(t)) return 'pasta';
    return null; // "Atualizando tudo..." não muda a etapa
  }

  // ---------- A FAIXA de aviso ----------
  var faixa = $('faixa');
  var atual = null;     // { tipo, refs } da faixa que está na tela
  var tempo = null;

  function limparFaixa() {
    clearTimeout(tempo);
    atual = null;
    esvaziar(faixa);
    faixa.hidden = true;
    faixa.removeAttribute('data-tipo');
  }
  UI.fecharFaixa = limparFaixa;

  var ICONE_TIPO = { erro: 'alerta', ok: 'check', aviso: 'alerta', info: 'info' };
  var ICONE_ETAPA = { 0: 'documento', 1: 'subir', 2: 'lixeira', 3: 'atualizar', pasta: 'pasta', yt: 'subir' };

  // Faixa de progresso: atualiza no mesmo lugar (não recria a cada arquivo).
  function faixaProgresso(a) {
    var icone_ = ICONE_ETAPA[a.etapa] || 'atualizar';
    if (!atual || atual.tipo !== 'prog') {
      limparFaixa();
      faixa.hidden = false;
      faixa.setAttribute('data-tipo', 'prog');
      faixa.setAttribute('role', 'status');
      var linha = el('div', null, 'f-linha');
      var circ = el('span', null, 'f-circ');
      var corpo = el('div', null, 'f-corpo');
      var t = el('b', null, 'f-t');
      var d = el('span', null, 'f-d');
      corpo.appendChild(t); corpo.appendChild(d);
      var dir = el('div', null, 'f-dir');
      dir.appendChild(el('span', 'Não feche esta página', 'f-nao'));
      linha.appendChild(circ); linha.appendChild(corpo); linha.appendChild(dir);
      var barra = el('div', null, 'f-barra');
      barra.setAttribute('role', 'progressbar');
      barra.setAttribute('aria-valuemin', '0');
      barra.setAttribute('aria-valuemax', '100');
      var i = document.createElement('i');
      barra.appendChild(i);
      faixa.appendChild(linha); faixa.appendChild(barra);
      atual = { tipo: 'prog', refs: { circ: circ, t: t, d: d, barra: barra, i: i, ico: null } };
    }
    var r = atual.refs;
    if (r.ico !== icone_) {
      esvaziar(r.circ);
      r.circ.appendChild(icone(icone_));
      r.ico = icone_;
    }
    r.t.textContent = a.titulo;
    r.d.textContent = a.arquivo;
    r.d.hidden = !a.arquivo;
    if (a.pct == null) {
      r.barra.hidden = true;
    } else {
      r.barra.hidden = false;
      r.i.style.width = a.pct + '%';
      r.barra.setAttribute('aria-valuenow', String(a.pct));
    }
  }

  // Faixa de erro, sucesso, atenção ou informação.
  function faixaAviso(tipo, titulo, detalhe, acao) {
    limparFaixa();
    faixa.hidden = false;
    faixa.setAttribute('data-tipo', tipo);
    faixa.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
    var linha = el('div', null, 'f-linha');
    var circ = el('span', null, 'f-circ');
    circ.appendChild(icone(ICONE_TIPO[tipo] || 'info'));
    var corpo = el('div', null, 'f-corpo');
    corpo.appendChild(el('b', titulo, 'f-t'));
    if (detalhe) corpo.appendChild(el('span', detalhe, 'f-d'));
    var acoes = el('div', null, 'f-acoes');
    if (acao) {
      var b = el('button', acao.rotulo, 'f-acao');
      b.type = 'button';
      b.onclick = function () { limparFaixa(); acao.fazer(); };
      acoes.appendChild(b);
    }
    var x = el('button', 'Fechar', 'f-fechar');
    x.type = 'button';
    x.onclick = limparFaixa;
    acoes.appendChild(x);
    linha.appendChild(circ); linha.appendChild(corpo); linha.appendChild(acoes);
    faixa.appendChild(linha);
    atual = { tipo: tipo };
    // Erro e atenção ficam até fechar. O resto some em 15 segundos.
    if (tipo !== 'erro' && tipo !== 'aviso') tempo = setTimeout(limparFaixa, 15000);
  }

  // Quebra um texto em frases curtas.
  function frases(texto) {
    return texto.split(/(?<=[.!])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/).map(function (f) { return f.replace(/^Pronto!\s*/, '').trim(); }).filter(Boolean);
  }

  // ---------- Entrada única: o app.js manda o texto, aqui decidimos como mostrar ----------
  UI.msg = function (texto) {
    UI.ultima = texto || '';
    if (!texto) return;
    var tipo = tipoDe(texto);

    if (tipo === 'prog') {
      var a = UI.andamento;
      a.ativo = true;
      var e = etapaDe(texto);
      if (e !== null) a.etapa = e;
      var m = /(\d+) de (\d+)/.exec(texto);
      var arq = /^[^:]*: (.*) \(não feche/.exec(texto);
      var pedacos = texto.replace(/\s*\(não feche esta página\)\.?/, '').split('...');
      if (m) {
        a.titulo = texto.slice(0, texto.indexOf(m[0]) + m[0].length);
        a.pct = Math.round(100 * Number(m[1]) / Number(m[2]));
      } else {
        a.titulo = pedacos[0].trim();
        a.pct = null;
      }
      a.arquivo = arq ? arq[1] : (m ? '' : (pedacos[1] || '').trim());
      UI.limparResumo();
      faixaProgresso(a);
      mudou();
      return;
    }

    // Terminou a operação (ou é uma mensagem solta).
    if (!UI.quieto || tipo === 'erro') UI.andamento = novoAndamento(); // um erro sempre encerra o que estava rodando
    if (UI.quieto && tipo !== 'erro') { mudou(); return; } // "Atualizar tudo" mostra só o resumo final

    var titulo, detalhe, acao = null;
    var partes = frases(texto);
    var haResumo = partes.length > 1 && /^(Subi|Mandei|Pronto! (Achei|O arquivo))/.test(texto); // só operações do Drive
    if (tipo === 'erro') {
      var ie = texto.search(ERRO_MEIO);
      var t2 = ie > 0 ? texto.slice(ie) : texto;
      if (/login.*(venceu|cancelado|bloqueado|não deu certo)/i.test(t2)) {
        t2 = t2.replace(/^Deu erro[^:]*:\s*/, '');
        titulo = /venceu/.test(t2) ? 'O login do Google venceu' : 'Não consegui entrar no Google';
        detalhe = /venceu/.test(t2)
          ? t2.replace(/O login do Google venceu\.\s*/, '').replace(/Clique em "Entrar com Google" de novo\./, 'Entre de novo para continuar.').trim()
          : t2;
        if (UI.acaoEntrar) acao = { rotulo: 'Entrar de novo', fazer: UI.acaoEntrar };
      } else {
        titulo = 'Algo não deu certo';
        detalhe = t2;
      }
    } else if (tipo === 'ok') {
      titulo = 'Tudo certo!';
      detalhe = haResumo ? 'Veja o resumo logo abaixo.' : texto;
    } else if (tipo === 'aviso') {
      titulo = 'Atenção';
      detalhe = texto;
    } else {
      titulo = 'Aviso';
      detalhe = texto;
    }
    faixaAviso(tipo, titulo, detalhe, acao);
    UI.hist.unshift({ d: new Date(), tipo: tipo, texto: texto });
    if (UI.hist.length > 20) UI.hist.length = 20;

    // Resumo grande no meio da tela, depois de uma operação que deu certo (ou deu certo em parte).
    if (haResumo && (tipo === 'ok' || tipo === 'erro')) UI.resumo(partes);
    mudou();
  };

  // ---------- Resumo final (fica até a próxima operação) ----------
  UI.resumo = function (lista) {
    var r = $('resumo');
    esvaziar(r);
    r.appendChild(el('h2', 'O que aconteceu', 'eyebrow'));
    var ul = el('ul');
    lista.forEach(function (f) {
      var erro = ERRO_MEIO.test(f) || ERRO_INICIO.test(f);
      var li = el('li', null, erro ? 'erro' : '');
      li.appendChild(icone(erro ? 'alerta' : 'check'));
      li.appendChild(el('span', f));
      ul.appendChild(li);
    });
    r.appendChild(ul);
    var b = el('button', 'Ver últimos avisos', 'link resumo-rodape');
    b.type = 'button';
    b.onclick = UI.historico;
    r.appendChild(b);
    r.hidden = false;
  };
  UI.limparResumo = function () { var r = $('resumo'); esvaziar(r); r.hidden = true; };

  // ---------- Janela (foco preso, Esc, clique explícito) ----------
  // opc: { titulo, intro, corpo (nó), aviso, botoes: [{rotulo, vermelho, valor}], esc }
  function janela(opc) {
    return new Promise(function (resolve) {
      var antes = document.activeElement;
      var fundo = el('div', null, 'modal-fundo');
      var m = el('div', null, 'janela');
      m.setAttribute('role', 'dialog');
      m.setAttribute('aria-modal', 'true');
      m.setAttribute('aria-labelledby', 'janelaTitulo');
      var h = el('h2', opc.titulo);
      h.id = 'janelaTitulo';
      m.appendChild(h);
      if (opc.intro) m.appendChild(el('p', opc.intro, 'janela-intro'));
      if (opc.corpo) m.appendChild(opc.corpo);
      if (opc.aviso) {
        var av = el('p', null, 'janela-aviso');
        var ic = el('span', null, 'ico-verde');
        ic.appendChild(icone('escudo'));
        av.appendChild(ic);
        av.appendChild(el('span', opc.aviso));
        m.appendChild(av);
      }
      var barra = el('div', null, 'janela-botoes');
      var botoes = opc.botoes.map(function (b) {
        var x = el('button', b.rotulo, b.vermelho ? 'btn-v' : 'btn-s');
        x.type = 'button';
        x.onclick = function () { fim(b.valor); };
        barra.appendChild(x);
        return x;
      });
      m.appendChild(barra);
      fundo.appendChild(m);
      document.body.appendChild(fundo);
      document.body.classList.add('travado');
      botoes[0].focus();
      function fim(r) {
        document.removeEventListener('keydown', tecla, true);
        fundo.remove();
        document.body.classList.remove('travado');
        if (antes && antes.focus) antes.focus();
        resolve(r);
      }
      function tecla(e) {
        if (e.key === 'Escape') { e.preventDefault(); fim(opc.esc); }
        if (e.key === 'Tab') { // foco preso dentro da janela
          var f = m.querySelectorAll('button');
          var primeiro = f[0], ultimo = f[f.length - 1];
          if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
          else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
        }
      }
      document.addEventListener('keydown', tecla, true);
    });
  }

  function tamanho(t) { return (t / 1048576).toFixed(1).replace('.', ',') + ' MB'; }

  // Confirmação da lixeira. dados = { total, itens: [{ fica, tam, vai: [caminhos] }] }
  UI.confirmar = async function (dados) {
    UI.andamento.confirmando = true;
    mudou();
    var lista = el('div', null, 'janela-lista');
    dados.itens.slice(0, 300).forEach(function (g) {
      var a = el('div', null, 'lj fica');
      a.appendChild(el('span', 'Fica', 'pilula ok'));
      a.appendChild(el('span', g.fica + (g.tam ? ' · ' + tamanho(g.tam) : ''), 'cam'));
      lista.appendChild(a);
      g.vai.forEach(function (v) {
        var b = el('div', null, 'lj');
        b.appendChild(el('span', 'Lixeira', 'pilula verm'));
        b.appendChild(el('span', v, 'cam'));
        lista.appendChild(b);
      });
    });
    var intro = 'Em cada grupo, fica a cópia maior. Confira antes de confirmar.' + (dados.itens.length > 300 ? ' Mostrando só os 300 primeiros grupos de ' + dados.itens.length + '.' : '');
    var r = await janela({
      titulo: 'Mandar ' + dados.total + (dados.total === 1 ? ' cópia' : ' cópias') + ' para a lixeira?',
      intro: intro,
      corpo: lista,
      aviso: 'Nada é apagado de vez. Dá para recuperar pela lixeira do Drive por 30 dias.',
      botoes: [{ rotulo: 'Cancelar', valor: false }, { rotulo: 'Mandar para a lixeira', vermelho: true, valor: true }],
      esc: false
    });
    UI.andamento.confirmando = false;
    mudou();
    return r;
  };

  // Últimos 20 avisos.
  UI.historico = function () {
    var ol = el('ol', null, 'hist janela-lista');
    if (!UI.hist.length) ol.appendChild(el('li', 'Ainda não teve nenhum aviso.'));
    UI.hist.forEach(function (h) {
      var li = el('li');
      li.appendChild(el('time', h.d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })));
      var rot = { erro: 'Erro', ok: 'Pronto', aviso: 'Atenção', info: 'Aviso' }[h.tipo];
      li.appendChild(el('span', rot, 'pilula ' + (h.tipo === 'erro' ? 'verm' : h.tipo === 'ok' ? 'ok' : h.tipo === 'aviso' ? 'am' : '')));
      li.appendChild(el('span', h.texto));
      ol.appendChild(li);
    });
    return janela({ titulo: 'Últimos avisos', corpo: ol, botoes: [{ rotulo: 'Fechar', valor: true }], esc: true });
  };

  // ---------- Cartão principal ("hero") ----------
  var TEXTOS = {
    1: { eb: 'Passo 1 de 3', t: 'Escolha a pasta.', p: 'Onde estão as músicas no seu computador.', b: 'Escolher pasta das músicas', s: 'Só lê. Não muda nada na pasta.' },
    2: { eb: 'Passo 2 de 3', t: 'Entre com o Google.', p: 'Para o site enxergar o seu Drive. Ele nunca vê a sua senha.', b: 'Entrar com Google', s: 'Só lê o seu Drive.' },
    3: { eb: 'Passo 3 de 3 · tudo pronto', t: 'Atualizar tudo.', p: 'Um clique faz os 4 passos ao lado, em ordem.', b: 'Atualizar tudo', s: 'Nada é apagado de vez. A lixeira só com a sua confirmação.' }
  };
  // Os 4 passos do painel da direita.
  var LINHAS = [
    { ico: 'documento', tag: 'Só lê', cls: 'ok', depois: 'Depois' },
    { ico: 'subir', tag: 'Sobe arquivos', cls: '', depois: 'Depois' },
    { ico: 'lixeira', tag: 'Lixeira', cls: 'verm', depois: 'Depois' },
    { ico: 'atualizar', tag: 'Drive', cls: '', depois: 'Depois' }
  ];
  var refs = [];
  function montarPlano() {
    var ol = $('plano');
    LINHAS.forEach(function (L) {
      var li = el('li', null, 'linha-plano');
      var circ = el('span', null, 'circ');
      var corpo = el('div', null, 'plano-corpo');
      var t = el('b', null, 'plano-t');
      var d = el('span', null, 'plano-d');
      var barra = el('div', null, 'barra-mini');
      var i = document.createElement('i');
      barra.appendChild(i);
      barra.hidden = true;
      corpo.appendChild(t); corpo.appendChild(d); corpo.appendChild(barra);
      var tag = el('span', null, 'pilula');
      li.appendChild(circ); li.appendChild(corpo); li.appendChild(tag);
      ol.appendChild(li);
      refs.push({ li: li, circ: circ, t: t, d: d, barra: barra, i: i, tag: tag, ico: '' });
    });
  }

  function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }

  // d = { pasta, google, pastaNome, ocupado, tudo, nSubir, nLixo, nDrive, podePasta, antes }
  UI.hero = function (d) {
    var a = UI.andamento;
    var rodando = !!(a.ativo || a.confirmando || d.ocupado || d.tudo);
    var passo = !d.pasta ? 1 : (!d.google ? 2 : 3);
    var lendoPasta = rodando && a.etapa === 'pasta';
    var noYt = rodando && a.etapa === 'yt';
    var T = TEXTOS[lendoPasta ? 1 : (rodando ? 3 : passo)];
    var hero = $('hero');
    hero.setAttribute('data-passo', rodando ? (lendoPasta ? '1' : 'andamento') : String(passo));
    // Faixa de passos no topo: feito / agora / depois
    var passoAgora = lendoPasta ? 1 : (rodando ? 3 : passo);
    document.querySelectorAll('#passosTopo li').forEach(function (li) {
      var n = Number(li.getAttribute('data-n'));
      li.setAttribute('data-estado', n < passoAgora ? 'feito' : (n === passoAgora ? 'agora' : 'depois'));
    });

    // Etiquetas do topo: só aparecem quando o passo foi feito.
    function etiqueta(id, forte, resto, vale) {
      var e = $(id);
      e.hidden = !vale;
      if (!vale || e.getAttribute('data-v') === resto) return;
      esvaziar(e);
      e.appendChild(icone('check'));
      e.appendChild(el('b', forte));
      e.appendChild(el('span', resto));
      e.setAttribute('data-v', resto);
    }
    etiqueta('etqPasta', 'Pasta', d.pastaNome || '', d.pasta);
    etiqueta('etqGoogle', 'Google', 'conectado', d.google);

    // Lado esquerdo
    if (rodando) {
      $('heroEyebrow').textContent = lendoPasta ? 'Passo 1 de 3 · em andamento' : (noYt ? 'Playlist do YouTube · em andamento' : 'Passo 3 de 3 · em andamento');
      $('heroTitulo').textContent = lendoPasta ? 'Lendo a pasta…' : (noYt ? 'Enviando…' : 'Atualizando…');
      $('heroTexto').textContent = 'Pode deixar esta aba aberta. Eu aviso quando terminar.';
    } else {
      $('heroEyebrow').textContent = T.eb;
      $('heroTitulo').textContent = T.t;
      $('heroTexto').textContent = T.p;
      if (passo === 1 && !d.podePasta) $('heroTexto').textContent = 'Este navegador não consegue ler a pasta. Abra este site no Google Chrome ou no Microsoft Edge, no computador.';
    }
    $('heroSelo').textContent = T.s;
    var b = $('botaoPrincipal');
    esvaziar(b);
    if (rodando) {
      b.appendChild(el('span', 'Não feche esta página'));
      b.disabled = true;
    } else {
      b.appendChild(el('span', T.b));
      if (passo === 3) b.appendChild(icone('seta'));
      b.disabled = passo === 1 && !d.podePasta;
    }
    var antes = $('botaoAntes');
    antes.hidden = !(passo === 1 && !rodando && d.antes);
    $('botaoGoogle').hidden = !(passo === 1 && !rodando && !d.google);
    if (!antes.hidden) antes.textContent = 'Usar a pasta de antes (' + d.antes.nome + ')';

    // Lado direito: o plano
    $('plano').className = 'plano' + (!rodando && passo < 3 ? ' apagado' : '');
    var idx = rodando ? (noYt ? null : lendoPasta ? -2 : (a.confirmando ? 2 : (typeof a.etapa === 'number' ? a.etapa : -1))) : null;
    var ndr = d.nDrive;
    for (var i = 0; i < 4; i++) {
      var R = refs[i], L = LINHAS[i];
      var est = idx === null ? 'parado' : (idx === -2 ? 'depois' : (i < idx ? 'feito' : (i === idx ? 'agora' : 'depois')));
      R.li.setAttribute('data-estado', est);
      var tit, det, tag = L.tag, cls = L.cls, ico = L.ico, pct = null;
      if (i === 0) {
        tit = 'Ler o Drive'; det = 'Vê o que já está na pasta “Músicas do Site”';
        if (est === 'feito') { tit = 'Drive lido'; det = ndr != null ? plural(ndr, 'música encontrada', 'músicas encontradas') : ''; }
        if (est === 'agora') { tit = 'Lendo o Drive'; det = a.arquivo || 'Pode demorar um pouco'; }
      } else if (i === 1) {
        tit = d.nSubir == null ? 'Subir as músicas que faltam' : (d.nSubir === 0 ? 'Nada para subir' : 'Subir ' + plural(d.nSubir, 'música', 'músicas'));
        det = 'As que ainda faltam, só uma cópia de cada';
        if (est === 'feito') { tit = 'Músicas enviadas'; det = 'Pasta “Músicas do Site” em dia'; }
        if (est === 'agora') { tit = a.titulo || 'Subindo'; det = a.arquivo; pct = a.pct; }
      } else if (i === 2) {
        tit = d.nLixo == null ? 'Limpar as repetidas' : (d.nLixo === 0 ? 'Nenhuma repetida para limpar' : 'Limpar ' + plural(d.nLixo, 'repetida', 'repetidas'));
        det = est === 'depois' ? 'Pede a sua confirmação' : 'Fica a maior; você confirma antes';
        if (est === 'feito') { tit = 'Repetidas limpas'; det = 'Foram para a lixeira do Drive'; }
        if (est === 'agora') {
          if (a.confirmando) { tit = 'Esperando você confirmar'; det = 'Confira a janela na tela'; }
          else { tit = a.titulo || 'Mandando para a lixeira'; det = a.arquivo; pct = a.pct; }
        }
      } else {
        tit = 'Atualizar as playlists'; det = 'Arquivo para o app do celular';
        if (est === 'feito') { tit = 'Playlists atualizadas'; det = 'No seu Drive'; }
        if (est === 'agora') { tit = 'Enviando as playlists'; det = 'Para o seu Drive'; }
      }
      if (est === 'feito') { tag = 'Feito'; cls = 'ok'; ico = 'check'; }
      else if (est === 'agora') { tag = 'Agora'; cls = ''; }
      else if (est === 'depois') { tag = L.depois; }
      R.t.textContent = tit;
      R.d.textContent = det || '';
      R.d.hidden = !det;
      R.tag.textContent = tag;
      R.tag.className = 'pilula' + (cls ? ' ' + cls : '');
      if (R.ico !== ico) { esvaziar(R.circ); R.circ.appendChild(icone(ico)); R.ico = ico; }
      R.barra.hidden = pct == null;
      if (pct != null) R.i.style.width = pct + '%';
    }
  };

  // ---------- Janela de ajuda: passo a passo e significado das palavras ----------
  UI.ajuda = function () {
    var c = el('div', null, 'ajuda');
    function p(forte, texto) { var x = el('p'); x.appendChild(el('b', forte)); x.appendChild(document.createTextNode(' ' + texto)); c.appendChild(x); }
    c.appendChild(el('h3', 'Passo a passo'));
    p('1. Escolha a pasta.', 'Clique no botão vermelho grande e escolha a pasta onde estão as músicas no seu computador. O site só LÊ a pasta: não muda nem apaga nada nela.');
    p('2. Entre com o Google.', 'Para o site enxergar o seu Google Drive. Ele nunca vê a sua senha.');
    p('3. Clique em "Atualizar tudo".', 'O site faz sozinho, em ordem: lê o Drive, sobe as músicas que faltam (uma cópia de cada), manda as repetidas para a lixeira do Drive (só depois de você confirmar) e atualiza o arquivo de playlists.');
    c.appendChild(el('h3', 'O que são as abas'));
    p('Repetidas no PC:', 'músicas que aparecem mais de uma vez na sua pasta. Só mostra, não apaga.');
    p('Top 200:', 'as músicas mais tocadas agora, por gênero, com a marca do que você já tem. Daqui também dá para criar uma playlist no YouTube.');
    p('Novidades:', 'o que entrou e o que saiu das listas Top 200.');
    p('Google Drive:', 'os passos 1 a 4 para subir músicas, limpar repetidas e gerar playlists.');
    p('Motor do PC:', 'área avançada, só para quem usa o programa Toxic Engine no computador.');
    c.appendChild(el('h3', 'Palavras que aparecem no site'));
    p('Drive:', 'o seu espaço na internet no Google, onde ficam as músicas guardadas.');
    p('Lixeira do Drive:', 'as repetidas não somem de vez: ficam na lixeira por 30 dias e dá para recuperar.');
    p('JSON:', 'um arquivo de texto com a lista de músicas de uma playlist. É o que o app do celular lê.');
    p('Cota do YouTube:', 'o YouTube deixa criar cerca de 64 itens por dia de graça. O que sobrar continua no dia seguinte.');
    c.appendChild(el('h3', 'Dica'));
    p('O que é clicável?', 'Tudo que tem borda ou fundo de botão, e as linhas com a palavra "Clique para ver". O resto é só texto.');
    return janela({ titulo: 'Como usar o Gerenciador', corpo: c, botoes: [{ rotulo: 'Entendi', vermelho: true, valor: true }], esc: true });
  };

  // ---------- Quando o script carrega ----------
  document.querySelectorAll('[data-ico]').forEach(function (n) { n.appendChild(icone(n.getAttribute('data-ico'))); });
  montarPlano();
  var bt = $('botaoTema');
  function pintarTema() {
    esvaziar(bt);
    bt.appendChild(icone(tema === 'escuro' ? 'lua' : 'sol'));
    bt.setAttribute('aria-label', tema === 'escuro' ? 'Trocar para o tema claro' : 'Trocar para o tema escuro');
  }
  pintarTema();
  bt.onclick = function () {
    tema = tema === 'escuro' ? 'claro' : 'escuro';
    document.documentElement.setAttribute('data-tema', tema);
    try { localStorage.setItem('gm_tema2', tema); } catch (e) { /* sem problema */ }
    pintarTema();
  };
  $('botaoHistorico').onclick = UI.historico;
  $('botaoAjuda').onclick = UI.ajuda;
  // Primeira visita neste navegador: mostra a ajuda uma vez.
  try { if (!localStorage.getItem('gm_ajuda1')) { localStorage.setItem('gm_ajuda1', '1'); setTimeout(UI.ajuda, 400); } } catch (e) { /* sem problema */ }

  window.UI = UI;
})();
