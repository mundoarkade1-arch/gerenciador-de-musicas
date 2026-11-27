/* ui.js — parte VISUAL do site: faixa de aviso, painel principal, janelas, tema.
   Não mexe no Drive nem nas músicas. O app.js chama UI.msg(...), UI.confirmar(...), UI.janela(...) e UI.painel(...).
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

  // ---------- Tema (claro é o padrão; escuro é opcional) ----------
  var tema = 'claro';
  try { if (localStorage.getItem('gm_tema3') === 'escuro') tema = 'escuro'; } catch (e) { /* sem problema */ }
  document.documentElement.setAttribute('data-tema', tema);

  // ---------- Que tipo de mensagem é? ----------
  var ERRO_INICIO = /^(Deu erro|Parou|O login|Não consegui|A escolha|Você não deixou|O Google)/;
  var ERRO_MEIO = /(Deu erro|Parou depois|O Google respondeu)/;
  function tipoDe(t) {
    if (ERRO_INICIO.test(t) || ERRO_MEIO.test(t)) return 'erro';
    if (/^(Subindo|Mandando para a lixeira|Lendo|Enviando|Atualizando|Preparando|Conferindo)/.test(t)) return 'prog';
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
    if (/^Conferindo/.test(t)) return 'dz';
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
  var ICONE_ETAPA = { 0: 'documento', 1: 'subir', 2: 'lixeira', 3: 'atualizar', pasta: 'pasta', yt: 'subir', dz: 'atualizar' };

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
  // opc: { titulo, intro, corpo (nó), aviso, botoes: [{rotulo, principal, valor}], esc }
  var fecharAtual = null;
  UI.fecharJanela = function (r) { if (fecharAtual) fecharAtual(r); };
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
        var x = el('button', b.rotulo, b.principal ? 'btn-p' : 'btn-s');
        x.type = 'button';
        x.onclick = function () { fim(b.valor); };
        barra.appendChild(x);
        return x;
      });
      m.appendChild(barra);
      fundo.appendChild(m);
      document.body.appendChild(fundo);
      document.body.classList.add('travado');
      (opc.foco ? opc.foco : botoes[0]).focus();
      fecharAtual = fim;
      function fim(r) {
        fecharAtual = null;
        document.removeEventListener('keydown', tecla, true);
        fundo.remove();
        document.body.classList.remove('travado');
        if (antes && antes.focus) antes.focus();
        resolve(r);
      }
      function tecla(e) {
        if (e.key === 'Escape') { e.preventDefault(); fim(opc.esc); }
        if (e.key === 'Tab') { // foco preso dentro da janela
          var f = m.querySelectorAll('button, input, select, textarea, a[href]');
          var primeiro = f[0], ultimo = f[f.length - 1];
          if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
          else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
        }
      }
      document.addEventListener('keydown', tecla, true);
    });
  }

  UI.janela = janela;

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
        b.appendChild(el('span', 'Lixeira', 'pilula am'));
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
      botoes: [{ rotulo: 'Cancelar', valor: false }, { rotulo: 'Mandar para a lixeira', principal: true, valor: true }],
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

  // ---------- Painel principal ----------
  // d = { google, rodando, nDrive, nPlaylists, nSubir, nLixo, pcNome, antesNome, podePasta }
  function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }
  UI.painel = function (d) {
    var a = UI.andamento;
    var rodando = !!(a.ativo || a.confirmando || d.rodando);

    var g = $('etqGoogle');
    g.textContent = d.google ? 'Google: conectado' : 'Google: não conectado';
    g.className = 'pilula ' + (d.google ? 'ok' : 'am');

    var info = $('etqDrive');
    if (d.google && d.nDrive != null) info.textContent = 'No Drive: ' + plural(d.nDrive, 'música', 'músicas') + ' em ' + plural(d.nPlaylists || 0, 'playlist', 'playlists');
    else info.textContent = d.google ? 'Drive: ainda não li' : '';

    var b = $('botaoPrincipal');
    esvaziar(b);
    if (rodando) {
      b.appendChild(el('span', 'Trabalhando… não feche esta página'));
      b.disabled = true;
    } else if (!d.google) {
      b.appendChild(el('span', 'Entrar com o Google'));
      b.disabled = false;
    } else {
      b.appendChild(el('span', 'Atualizar tudo'));
      b.appendChild(icone('seta'));
      b.disabled = false;
    }

    var dica = '';
    if (rodando) dica = '';
    else if (!d.google) dica = 'Entre para ver as suas playlists do Drive. O site nunca vê a sua senha.';
    else {
      var p = [];
      if (d.nSubir) p.push(plural(d.nSubir, 'música nova do PC vai', 'músicas novas do PC vão') + ' para o Drive');
      if (d.nLixo) p.push(plural(d.nLixo, 'repetida vai', 'repetidas vão') + ' para a lixeira (você confirma antes)');
      dica = p.length ? 'Agora: ' + p.join('; ') + '.' : 'Lê o Drive e atualiza o arquivo de playlists do app.';
    }
    $('painelDica').textContent = dica;

    var pc = $('pcTexto');
    var bAntes = $('botaoAntes');
    var bPasta = $('botaoPasta');
    if (!d.podePasta) {
      pc.textContent = 'Pasta do PC (opcional): para enviar músicas novas, abra no Google Chrome ou no Microsoft Edge, no computador.';
      bAntes.hidden = true;
      bPasta.hidden = true;
      return;
    }
    bPasta.hidden = false;
    bPasta.disabled = rodando;
    bAntes.disabled = rodando;
    if (d.pcNome) {
      pc.textContent = 'Pasta do PC (opcional): ' + d.pcNome + ' · ' + plural(d.pcTotal || 0, 'música', 'músicas');
      bAntes.hidden = true;
      bPasta.textContent = 'Trocar pasta';
    } else if (d.antesNome) {
      pc.textContent = 'Pasta do PC (opcional): só serve para enviar músicas novas ao Drive.';
      bAntes.hidden = false;
      bAntes.textContent = 'Usar a pasta de antes: ' + d.antesNome;
      bPasta.textContent = 'Escolher outra pasta';
    } else {
      pc.textContent = 'Pasta do PC (opcional): só serve para enviar músicas novas ao Drive.';
      bAntes.hidden = true;
      bPasta.textContent = 'Escolher pasta do PC';
    }
  };

  // ---------- Quando o script carrega ----------
  document.querySelectorAll('[data-ico]').forEach(function (n) { n.appendChild(icone(n.getAttribute('data-ico'))); });
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
    try { localStorage.setItem('gm_tema3', tema); } catch (e) { /* sem problema */ }
    pintarTema();
  };

  window.UI = UI;
})();
