/* ui.js — parte VISUAL do site (avisos, progresso, janela de confirmação, tema, passos).
   Não mexe no Drive nem nas músicas. O app.js chama UI.msg(...) e UI.confirmar(...). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var NS = 'http://www.w3.org/2000/svg';
  var reduzir = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Tema (claro / escuro), lembrado neste navegador ----------
  var tema = null;
  try { tema = localStorage.getItem('gm_tema'); } catch (e) { /* sem problema */ }
  if (tema !== 'claro' && tema !== 'escuro') tema = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'escuro' : 'claro';
  document.documentElement.setAttribute('data-tema', tema);

  function el(tag, txt, cls) {
    var e = document.createElement(tag);
    if (txt != null) e.textContent = txt;
    if (cls) e.className = cls;
    return e;
  }
  // Ícone SVG simples (traços), criado por JS por causa da CSP.
  var ICONES = {
    ok: 'M5 12.5l4.5 4.5L19 7.5',
    erro: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
    aviso: 'M12 7.5v6M12 17h.01',
    info: 'M12 11v6M12 7.5h.01',
    prog: 'M12 5v3M12 16v3M5 12h3M16 12h3',
    sol: 'M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4M12 9a3 3 0 100 6 3 3 0 000-6z',
    lua: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z',
    ajuda: 'M9.5 9.5a2.5 2.5 0 114 2c-.8.6-1.5 1-1.5 2M12 17h.01'
  };
  function icone(nome) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'ico');
    s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(NS, 'path');
    p.setAttribute('d', ICONES[nome] || ICONES.info);
    s.appendChild(p);
    return s;
  }

  var UI = { ultima: '', quieto: false, acaoEntrar: null };

  // ---------- Que tipo de mensagem é? (para escolher cor e ícone) ----------
  function tipoDe(t) {
    if (/^(Deu erro|Parou|O login|Não consegui|A escolha|Você não deixou|O Google|Para ler a pasta)/.test(t)) return 'erro';
    if (/^(Subindo|Mandando para a lixeira|Lendo|Enviando|Atualizando|Preparando)/.test(t)) return 'prog';
    if (/^(Não|Clique|Escolha|Escreva)/.test(t)) return 'aviso';
    if (/^(Pronto|Subi|Mandei|Conectado)/.test(t)) return 'ok';
    return 'info';
  }
  var TITULOS = { ok: 'Tudo certo!', erro: 'Algo não deu certo', aviso: 'Atenção', info: 'Aviso', prog: 'Trabalhando...' };
  UI.tipoDe = tipoDe;

  // ---------- Faixa de progresso (fica no topo, sempre visível) ----------
  function progresso(t) {
    var f = $('faixa');
    if (!f) return;
    var m = /(\d+) de (\d+)/.exec(t);
    var arq = /: (.*?) \(não feche/.exec(t);
    $('faixaTitulo').textContent = m ? t.slice(0, t.indexOf(m[0]) + m[0].length) : t.replace(/\s*\(não feche.*$/, '');
    $('faixaArquivo').textContent = arq ? arq[1] : '';
    var b = $('faixaBarra');
    if (m) { b.classList.remove('indet'); b.firstChild.style.width = Math.round(100 * m[1] / m[2]) + '%'; }
    else { b.classList.add('indet'); b.firstChild.style.width = '40%'; }
    f.hidden = false;
  }
  function fimProgresso() { var f = $('faixa'); if (f) f.hidden = true; }

  // ---------- Avisos (toasts) ----------
  function toast(tipo, titulo, texto, acao) {
    var area = $('avisos');
    if (!area) return;
    var t = el('div', null, 'toast t-' + tipo);
    t.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
    t.appendChild(icone(tipo));
    var corpo = el('div', null, 'toast-corpo');
    corpo.appendChild(el('b', titulo));
    corpo.appendChild(el('span', texto));
    if (acao) {
      var b = el('button', acao.rotulo, 'leve pequeno');
      b.onclick = function () { fechar(); acao.fazer(); };
      corpo.appendChild(b);
    }
    t.appendChild(corpo);
    var x = el('button', '×', 'fechar');
    x.setAttribute('aria-label', 'Fechar aviso');
    function fechar() {
      t.classList.add('saindo');
      setTimeout(function () { t.remove(); }, reduzir ? 0 : 250);
    }
    x.onclick = fechar;
    t.appendChild(x);
    area.appendChild(t);
    if (tipo !== 'erro' && tipo !== 'aviso') setTimeout(fechar, 8000); // erros e atenção ficam até fechar
  }
  UI.toast = toast;

  // Porta de entrada única: o app.js manda o texto, aqui decidimos como mostrar.
  UI.msg = function (texto) {
    UI.ultima = texto || '';
    if (!texto) return;
    var tipo = tipoDe(texto);
    if (tipo === 'prog') { progresso(texto); return; }
    fimProgresso();
    if (UI.quieto && tipo !== 'erro') return; // "Atualizar tudo" mostra só o resumo final
    var acao = null;
    if (/login.*(venceu|cancelado|não deu certo)/.test(texto) && UI.acaoEntrar) acao = { rotulo: 'Entrar de novo', fazer: UI.acaoEntrar };
    var curto = texto.length > 260 ? texto.slice(0, 257) + '...' : texto;
    toast(tipo, TITULOS[tipo], curto, acao);
  };

  // Cartão colorido de resumo (no lugar de parágrafos soltos).
  UI.resumo = function (texto) {
    var tipo = tipoDe(texto);
    var c = el('div', null, 'resumo t-' + (tipo === 'prog' ? 'info' : tipo));
    c.appendChild(icone(tipo === 'prog' ? 'info' : tipo));
    var ul = el('ul');
    texto.split(/(?<=[.!])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/).forEach(function (frase) { ul.appendChild(el('li', frase)); });
    c.appendChild(ul);
    return c;
  };

  // ---------- Janela de confirmação da lixeira ----------
  UI.confirmar = function (dados) {
    return new Promise(function (resolve) {
      var antes = document.activeElement;
      var fundo = el('div', null, 'modal-fundo');
      var m = el('div', null, 'modal cartao');
      m.setAttribute('role', 'dialog');
      m.setAttribute('aria-modal', 'true');
      m.setAttribute('aria-labelledby', 'modalTitulo');
      var h = el('h2', 'Mandar ' + dados.total + ' cópia(s) para a lixeira?');
      h.id = 'modalTitulo';
      m.appendChild(h);
      m.appendChild(el('p', 'Em cada grupo, fica a cópia maior. Nada é apagado de vez: você pode recuperar pela lixeira do Drive por 30 dias.', 'suave'));
      var lista = el('div', null, 'rolagem modal-lista');
      dados.itens.slice(0, 60).forEach(function (g) {
        var l = el('div', null, 'grupo');
        var a = el('div', null, 'item'); a.appendChild(el('span', 'Fica', 'selo tenho')); a.appendChild(document.createTextNode(' ' + g.fica));
        l.appendChild(a);
        g.vai.forEach(function (v) {
          var b = el('div', null, 'item'); b.appendChild(el('span', 'Lixeira', 'selo falta')); b.appendChild(document.createTextNode(' ' + v));
          l.appendChild(b);
        });
        lista.appendChild(l);
      });
      m.appendChild(lista);
      if (dados.itens.length > 60) m.appendChild(el('p', 'Mostrando só os 60 primeiros grupos de ' + dados.itens.length + '.', 'suave'));
      var barra = el('div', null, 'barra modal-botoes');
      var nao = el('button', 'Cancelar', 'leve');
      var sim = el('button', 'Mandar para a lixeira');
      barra.appendChild(nao); barra.appendChild(sim);
      m.appendChild(barra);
      fundo.appendChild(m);
      document.body.appendChild(fundo);
      document.body.classList.add('travado');
      nao.focus();
      function fim(r) {
        document.removeEventListener('keydown', tecla, true);
        fundo.remove();
        document.body.classList.remove('travado');
        if (antes && antes.focus) antes.focus();
        resolve(r);
      }
      function tecla(e) {
        if (e.key === 'Escape') { e.preventDefault(); fim(false); }
        if (e.key === 'Tab') { // foco preso dentro do modal
          var f = m.querySelectorAll('button');
          var primeiro = f[0], ultimo = f[f.length - 1];
          if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
          else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
        }
      }
      document.addEventListener('keydown', tecla, true);
      nao.onclick = function () { fim(false); };
      sim.onclick = function () { fim(true); };
    });
  };

  // ---------- Números que contam de 0 até o valor ----------
  UI.contar = function (raiz) {
    raiz.querySelectorAll('[data-alvo]').forEach(function (b) {
      var alvo = Number(b.getAttribute('data-alvo'));
      if (reduzir || !alvo) { b.textContent = alvo.toLocaleString('pt-BR'); return; }
      var ini = performance.now();
      (function passo(agora) {
        var p = Math.min(1, (agora - ini) / 700);
        b.textContent = Math.round(alvo * (1 - Math.pow(1 - p, 3))).toLocaleString('pt-BR');
        if (p < 1) requestAnimationFrame(passo);
      })(ini);
    });
  };

  // ---------- Os 3 passos do topo ----------
  UI.passos = function (pasta, google, tudo) {
    var feito = [pasta, google, tudo];
    var atual = feito.indexOf(false);
    document.querySelectorAll('#passos .passo').forEach(function (p, i) {
      p.setAttribute('data-estado', feito[i] ? 'feito' : (i === atual ? 'atual' : 'pendente'));
      var s = p.querySelector('.passo-estado');
      if (s) s.textContent = feito[i] ? '✔ Feito' : (i === atual ? 'Agora' : 'Depois');
    });
  };

  var PARA_QUE = {
    repetidas: 'Para que serve: mostra músicas com o mesmo nome na sua pasta do PC, para você saber o que está repetido.',
    top: 'Para que serve: compara as músicas mais tocadas do momento (Deezer) com as suas e mostra o que falta.',
    novidades: 'Para que serve: mostra o que entrou e o que saiu das listas desde a última atualização.',
    drive: 'Para que serve: liga ao Google Drive, sobe o que falta, limpa repetidas e gera as playlists para o app do celular.'
  };
  UI.paraQue = function (aba) { var p = $('paraque'); if (p) p.textContent = PARA_QUE[aba] || ''; };

  // ---------- Selo de segurança dentro de um botão ----------
  UI.selo = function (botao, texto) { botao.appendChild(el('small', texto, 'selo-botao')); return botao; };

  // ---------- Dica "?" (O que faz / Mexe em quê / É seguro?) ----------
  UI.dica = function (texto) {
    var partes = texto.split('|');
    var rot = ['O que isso faz: ', 'Mexe em quê: ', 'É seguro? '];
    var b = el('button', null, 'dica');
    b.type = 'button';
    b.setAttribute('aria-label', 'Explicação');
    b.setAttribute('aria-expanded', 'false');
    b.appendChild(icone('ajuda'));
    var pop = el('div', null, 'dica-caixa');
    pop.setAttribute('role', 'tooltip');
    pop.hidden = true;
    partes.forEach(function (p, i) { var l = el('p'); l.appendChild(el('b', rot[i] || '')); l.appendChild(document.createTextNode(p)); pop.appendChild(l); });
    var caixa = el('span', null, 'dica-area');
    caixa.appendChild(b); caixa.appendChild(pop);
    b.onclick = function (e) {
      e.stopPropagation();
      var abrir = pop.hidden;
      document.querySelectorAll('.dica-caixa').forEach(function (x) { x.hidden = true; });
      pop.hidden = !abrir;
      b.setAttribute('aria-expanded', String(abrir));
    };
    return caixa;
  };
  document.addEventListener('click', function () { document.querySelectorAll('.dica-caixa').forEach(function (x) { x.hidden = true; }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') document.querySelectorAll('.dica-caixa').forEach(function (x) { x.hidden = true; }); });

  // ---------- Quando a página termina de carregar ----------
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-dica]').forEach(function (n) { n.appendChild(UI.dica(n.getAttribute('data-dica'))); });
    var bt = $('botaoTema');
    function pintar() {
      while (bt.firstChild) bt.removeChild(bt.firstChild);
      bt.appendChild(icone(tema === 'escuro' ? 'sol' : 'lua'));
      bt.setAttribute('aria-label', tema === 'escuro' ? 'Trocar para o tema claro' : 'Trocar para o tema escuro');
    }
    pintar();
    bt.onclick = function () {
      tema = tema === 'escuro' ? 'claro' : 'escuro';
      document.documentElement.setAttribute('data-tema', tema);
      try { localStorage.setItem('gm_tema', tema); } catch (e) { /* sem problema */ }
      pintar();
    };
    // Efeito de "brilho" que segue o mouse nos botões
    document.addEventListener('pointermove', function (e) {
      var b = e.target.closest && e.target.closest('button');
      if (b) { var r = b.getBoundingClientRect(); b.style.setProperty('--mx', (e.clientX - r.left) + 'px'); }
    });
  });

  window.UI = UI;
})();
