/* youtube.js — cria playlists no YouTube aos poucos, respeitando a cota grátis do dia.
   Guarda o progresso neste navegador (localStorage), então dá para parar e continuar amanhã.
   Custos da API (unidades): buscar vídeo = 100, adicionar na playlist = 50, criar playlist = 50, ler página = 1.
   Cota grátis: 10.000 por dia, renova à meia-noite do horário do Pacífico. */
(function (g) {
  'use strict';
  var API = 'https://www.googleapis.com/youtube/v3';
  var COTA = 10000;
  var RESERVA = 300;       // folga para não bater no limite
  var C_BUSCA = 100, C_ITEM = 50, C_CRIAR = 50, C_LER = 5;
  var CHAVE = 'gm_youtube';

  var YT = { ESCOPO: 'https://www.googleapis.com/auth/youtube', COTA: COTA, token: null, ocupado: false };
  var dados = null;

  var FATAIS = ['insufficientPermissions', 'accessNotConfigured', 'youtubeSignupRequired', 'authError', 'forbiddenPlaylist'];
  var MENSAGENS = {
    accessNotConfigured: 'Não consegui usar o YouTube: a "YouTube Data API v3" ainda não foi ativada no projeto do Google Cloud.',
    youtubeSignupRequired: 'Não consegui criar a playlist: essa conta do Google ainda não tem um canal no YouTube. Abra youtube.com, crie o canal e tente de novo.',
    insufficientPermissions: 'Não consegui: faltou a permissão do YouTube. Clique em "Entrar com YouTube" de novo e aceite a permissão.'
  };

  function dormir(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function diaCota() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date()); }

  function ler() {
    var x = null;
    try { x = JSON.parse(g.localStorage.getItem(CHAVE) || 'null'); } catch (e) { x = null; }
    dados = x && typeof x === 'object' ? x : {};
    dados.cota = dados.cota || { dia: diaCota(), usado: 0 };
    dados.videos = dados.videos || {};   // id da música (Deezer) -> id do vídeo no YouTube
    dados.listas = dados.listas || {};
    return dados;
  }
  function salvar() {
    try { g.localStorage.setItem(CHAVE, JSON.stringify(dados)); } catch (e) { /* sem problema */ }
  }
  function D() { return dados || ler(); }

  function usado() {
    var c = D().cota;
    if (c.dia !== diaCota()) { c.dia = diaCota(); c.usado = 0; }
    return c.usado;
  }
  function gastar(n) { if (n) { usado(); D().cota.usado += n; } }

  function lista(id) {
    var l = D().listas[id];
    if (!l) l = D().listas[id] = { playlistId: null, feitas: {}, sem: {}, manual: {} };
    if (!l.manual) l.manual = {};
    return l;
  }

  // Quantas músicas ainda cabem na cota de hoje (na ordem da lista).
  function quantas(id, faixas) {
    var l = lista(id);
    var disp = COTA - usado() - RESERVA - C_LER - (l.playlistId ? 0 : C_CRIAR);
    var pendentes = faixas.filter(function (f) { return !l.feitas[f.id] && !l.sem[f.id] && !l.manual[f.id]; });
    var lote = [], gasto = 0;
    for (var i = 0; i < pendentes.length; i++) {
      var c = (D().videos[pendentes[i].id] ? 0 : C_BUSCA) + C_ITEM;
      if (gasto + c > disp) break;
      gasto += c;
      lote.push(pendentes[i]);
    }
    return { lote: lote, pendentes: pendentes.length, gasto: gasto };
  }

  function liberarSem(id) { lista(id).sem = {}; salvar(); }
  // Você adicionou na mão no YouTube: para de contar como "sem resultado" e nunca tenta de novo.
  function marcarManual(id) {
    var l = lista(id);
    Object.keys(l.sem).forEach(function (k) { l.manual[k] = true; });
    l.sem = {};
    salvar();
  }

  async function chamar(caminho, opcoes, custo) {
    opcoes = opcoes || {};
    opcoes.headers = Object.assign({ Authorization: 'Bearer ' + YT.token }, opcoes.headers || {});
    var r;
    for (var t = 0; t < 2; t++) {
      r = await fetch(API + caminho, opcoes);
      gastar(custo);
      if (r.status !== 409 && r.status < 500) break;
      await dormir(1200);
    }
    var j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (r.status === 401) {
      YT.token = null;
      var e1 = new Error('Parou: o acesso ao YouTube venceu. Clique em "Entrar com YouTube" de novo.');
      e1.expirou = true;
      throw e1;
    }
    if (!r.ok) {
      var motivo = j && j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason;
      var e = new Error(MENSAGENS[motivo] || ('O Google respondeu com erro ' + r.status + (motivo ? ' (' + motivo + ')' : '') + '.'));
      e.status = r.status;
      e.motivo = motivo;
      if (motivo === 'quotaExceeded' || motivo === 'dailyLimitExceeded') {
        e.cota = true;
        D().cota.dia = diaCota();
        D().cota.usado = COTA;
        salvar();
      }
      throw e;
    }
    return j;
  }

  // Lê o que está de verdade na playlist (1 unidade por 50 vídeos) e acerta o nosso controle.
  async function sincronizar(l, faixas) {
    if (!l.playlistId) return;
    var vistos = {}, tk = '';
    try {
      do {
        var j = await chamar('/playlistItems?part=contentDetails&maxResults=50&playlistId=' + encodeURIComponent(l.playlistId) + (tk ? '&pageToken=' + encodeURIComponent(tk) : ''), null, 1);
        (j.items || []).forEach(function (i) { if (i.contentDetails) vistos[i.contentDetails.videoId] = true; });
        tk = j.nextPageToken;
      } while (tk);
    } catch (e) {
      if (e.status === 404) { l.playlistId = null; l.feitas = {}; salvar(); return; }
      throw e;
    }
    // Saiu da playlist (você apagou lá no YouTube): volta a aparecer como "falta".
    Object.keys(l.feitas).forEach(function (k) { if (!vistos[l.feitas[k]]) delete l.feitas[k]; });
    // Está na playlist mas não estava anotado (ex.: a página fechou no meio): anota, para não duplicar.
    faixas.forEach(function (f) {
      var v = D().videos[f.id];
      if (v && vistos[v] && !l.feitas[f.id]) l.feitas[f.id] = v;
    });
    salvar();
  }

  async function achar(f) {
    var q = f.a + ' - ' + f.t;
    var j = await chamar('/search?part=snippet&type=video&videoCategoryId=10&maxResults=1&q=' + encodeURIComponent(q), null, C_BUSCA);
    var it = j.items && j.items[0];
    return (it && it.id && it.id.videoId) || null;
  }

  async function inserir(playlistId, videoId) {
    return chamar('/playlistItems?part=snippet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snippet: { playlistId: playlistId, resourceId: { kind: 'youtube#video', videoId: videoId } } })
    }, C_ITEM);
  }

  async function criar(nome) {
    var j = await chamar('/playlists?part=snippet,status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        snippet: { title: nome, description: 'Criada pelo Gerenciador de Músicas.' },
        status: { privacyStatus: 'private' }
      })
    }, C_CRIAR);
    return j.id;
  }

  // Coloca o próximo lote na playlist. aoAndar(i, total, faixa) avisa o progresso.
  async function enviar(id, nome, faixas, aoAndar) {
    if (YT.ocupado) throw new Error('Já estou enviando. Espere terminar.');
    YT.ocupado = true;
    var l = lista(id);
    var res = { colocadas: 0, parou: null, semNovas: 0 };
    try {
      await sincronizar(l, faixas);
      var q = quantas(id, faixas);
      if (!q.lote.length) { res.parou = q.pendentes ? 'cota' : 'completa'; return res; }
      if (!l.playlistId) { l.playlistId = await criar(nome); salvar(); }
      for (var i = 0; i < q.lote.length; i++) {
        var f = q.lote[i];
        if (aoAndar) aoAndar(i + 1, q.lote.length, f);
        try {
          var vid = D().videos[f.id];
          if (!vid) {
            vid = await achar(f);
            if (vid) { D().videos[f.id] = vid; salvar(); }
          }
          if (!vid) { l.sem[f.id] = true; res.semNovas++; salvar(); continue; }
          await inserir(l.playlistId, vid);
          l.feitas[f.id] = vid;
          delete l.sem[f.id];
          res.colocadas++;
          salvar();
        } catch (e) {
          if (e.cota) { res.parou = 'cota'; break; }
          if (e.motivo === 'playlistNotFound') {
            l.playlistId = null; l.feitas = {}; salvar();
            throw new Error('Parou: essa playlist foi apagada no YouTube. Clique em enviar de novo e eu crio outra.');
          }
          if (e.expirou || FATAIS.indexOf(e.motivo) >= 0 || !(e.status === 400 || e.status === 403 || e.status === 404)) throw e;
          // Esse vídeo não dá para adicionar: pula e anota como "sem resultado".
          l.sem[f.id] = true; res.semNovas++; delete D().videos[f.id]; salvar();
        }
      }
      if (!res.parou) {
        var resta = quantas(id, faixas);
        res.parou = resta.pendentes ? (resta.lote.length ? null : 'cota') : 'completa';
      }
      return res;
    } finally {
      YT.ocupado = false;
      salvar();
    }
  }

  YT.ler = ler;
  YT.lista = lista;
  YT.usado = usado;
  YT.quantas = quantas;
  YT.enviar = enviar;
  YT.liberarSem = liberarSem;
  YT.marcarManual = marcarManual;
  YT.diaCota = diaCota;

  g.YT = YT;
  if (typeof module !== 'undefined' && module.exports) module.exports = YT;
})(typeof window !== 'undefined' ? window : globalThis);
