// Busca as listas na API pública do Deezer (sem senha, sem chave) e compara com a última vez.
import { readFile, writeFile } from 'node:fs/promises';

const API = 'https://api.deezer.com';
const ARQ = 'data/charts.js';

// Para mudar uma lista, edite aqui.
// "max" = quantas músicas. "busca" = nomes de playlist procurados no Deezer (tenta na ordem).
// "exige" = o título da playlist achada precisa bater com isso (evita pegar playlist de outra época).
// "grupo" = em qual botão da aba Top 200 a lista aparece.
const R00 = /2000|\b00'?s\b|anos 2000/i;
const R10 = /2010|\b10'?s\b|anos 2010/i;
const R20 = /202\d|\b20'?s\b|anos 2020/i;

const em = (id, nome, grupo, busca, max = 100) => ({ id, nome, grupo, tipo: 'playlist', max, busca });
const gen = (id, nome, grupo, genero, max = 100) => ({ id, nome, grupo, tipo: 'genero', max, genero });

// Cria 3 listas de "músicas que marcaram época": 2000 a 2009, 2010 a 2019 e 2020 até hoje.
function eras(id, nome, grupo, termos) {
  const q = (anos) => termos.flatMap((t) => anos.map((a) => `${t} ${a}`));
  return [
    { id: id + '-2000', nome: nome + ': 2000 a 2009', grupo, tipo: 'playlist', max: 100, exige: R00,
      busca: q(['2000s', 'Anos 2000', '2000', '00s']) },
    { id: id + '-2010', nome: nome + ': 2010 a 2019', grupo, tipo: 'playlist', max: 100, exige: R10,
      busca: q(['2010s', 'Anos 2010', '2010', '10s']) },
    { id: id + '-2020', nome: nome + ': 2020 até hoje', grupo, tipo: 'playlist', max: 100, exige: R20,
      busca: q(['2020s', '2020', '2023', '2024']) },
  ];
}

const LISTAS = [
  // Gerais
  { id: 'mundo', nome: 'Top 200 Mundo', grupo: 'Gerais', tipo: 'chart', max: 200 },
  { id: 'brasil', nome: 'Top 200 Brasil', grupo: 'Gerais', tipo: 'playlist', max: 200, busca: ['Top Brasil', 'Top Brazil'] },
  { id: 'tiktok', nome: 'Viral do TikTok', grupo: 'Gerais', tipo: 'playlist', max: 50, busca: ['TikTok Hits', 'Viral TikTok', 'TikTok Brasil'] },

  // Hip hop americano
  gen('hiphop', 'Hip hop em alta', 'Hip hop americano', /rap|hip/i),
  ...eras('hiphop', 'Hip hop americano', 'Hip hop americano', ['Hip Hop', 'Rap']),

  // Rap brasileiro
  em('rapbr', 'Rap nacional em alta', 'Rap brasileiro', ['Rap Nacional', 'Rap BR', 'Hip Hop Brasil', 'Rap Brasil']),
  em('trapbr', 'Trap brasileiro em alta', 'Rap brasileiro', ['Trap BR', 'Trap Brasil', 'Trap Nacional']),
  ...eras('rapbr', 'Rap nacional', 'Rap brasileiro', ['Rap Nacional', 'Rap BR']),

  // Funk
  { id: 'funk', nome: 'Funk em alta', grupo: 'Funk', tipo: 'playlist', max: 50, busca: ['Top Funk', 'Funk Hits', 'Funk Brasil'] },
  { id: 'funk-tiktok', nome: 'Funk viral do TikTok', grupo: 'Funk', tipo: 'playlist', max: 50, busca: ['Funk TikTok', 'Funk Viral', 'Funk Tiktok Brasil'] },
  ...eras('funk', 'Funk', 'Funk', ['Funk', 'Funk Brasil']),

  // Sertanejo
  { id: 'sertanejo', nome: 'Sertanejo em alta', grupo: 'Sertanejo', tipo: 'playlist', max: 100, busca: ['Top Sertanejo', 'Sertanejo Hits'] },
  { id: 'sertanejo-classicos', nome: 'Sertanejo de todos os tempos', grupo: 'Sertanejo', tipo: 'playlist', max: 200, busca: ['Sertanejo Clássicos', 'Sertanejo Raiz', 'Os maiores sucessos sertanejos'] },
  { id: 'sertanejo-uni', nome: 'Sertanejo universitário', grupo: 'Sertanejo', tipo: 'playlist', max: 100, busca: ['Sertanejo Universitário', 'Sertanejo Universitario Hits'] },
  ...eras('sertanejo', 'Sertanejo', 'Sertanejo', ['Sertanejo']),

  // Pagode, forró e MPB
  em('pagode', 'Pagode em alta', 'Pagode e forró', ['Top Pagode', 'Pagode Hits', 'Pagode Brasil']),
  ...eras('pagode', 'Pagode', 'Pagode e forró', ['Pagode']),
  em('forro', 'Forró em alta', 'Pagode e forró', ['Top Forró', 'Forró Hits', 'Forró']),
  em('mpb', 'MPB em alta', 'Pagode e forró', ['MPB Hits', 'Top MPB', 'MPB']),

  // Pop
  gen('pop', 'Pop em alta', 'Pop', /^pop$/i),
  { id: 'pop-2006', nome: 'Pop 2006 a 2014', grupo: 'Pop', tipo: 'playlist', max: 100, busca: ['Pop Hits 2010', 'Pop Hits 2012', 'Anos 2010 Pop', 'Best of Pop 2010s'] },
  ...eras('pop', 'Pop', 'Pop', ['Pop']),
  em('kpop', 'K-pop em alta', 'Pop', ['K-Pop Hits', 'Top K-Pop', 'K-Pop']),

  // Rock
  gen('rock', 'Rock em alta', 'Rock', /^rock$/i),
  ...eras('rock', 'Rock', 'Rock', ['Rock']),

  // R&B
  gen('rnb', 'R&B em alta', 'R&B', /r&b|rnb/i),
  ...eras('rnb', 'R&B', 'R&B', ['R&B', 'RnB']),

  // Eletrônica
  gen('eletronica', 'Eletrônica em alta', 'Eletrônica', /electro/i),
  { id: 'eletronica-2006', nome: 'Eletrônica 2006 a 2014', grupo: 'Eletrônica', tipo: 'playlist', max: 100, busca: ['Electro Hits 2010', 'EDM Hits 2012', 'Electro House Hits', 'Best of Electro 2010s'] },
  ...eras('eletronica', 'Eletrônica', 'Eletrônica', ['EDM', 'Electro']),

  // Latina, country e reggae
  gen('latina', 'Música latina em alta', 'Latina e outros', /latin/i),
  ...eras('latina', 'Reggaeton e latina', 'Latina e outros', ['Reggaeton', 'Latin']),
  em('country', 'Country em alta', 'Latina e outros', ['Country Hits', 'Top Country', 'Country']),
  gen('reggae', 'Reggae em alta', 'Latina e outros', /reggae/i),
];

// Trava de segurança: dois ids iguais fazem uma lista apagar a outra.
{
  const vistos = new Set();
  for (const l of LISTAS) {
    if (vistos.has(l.id)) throw new Error('Id de lista repetido: ' + l.id);
    vistos.add(l.id);
  }
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function pegar(caminho) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(API + caminho);
      const j = await r.json();
      if (j && !j.error) return j;
    } catch (e) { /* tenta de novo */ }
    await espera(800);
  }
  throw new Error('Falhou: ' + caminho);
}

async function paginar(caminho, max) {
  const out = [];
  for (let idx = 0; out.length < max; idx += 100) {
    const j = await pegar(`${caminho}${caminho.includes('?') ? '&' : '?'}limit=100&index=${idx}`);
    const d = j.data || [];
    out.push(...d);
    if (d.length < 100) break;
    await espera(150);
  }
  return out.slice(0, max);
}

async function acharPlaylist(buscas, exige) {
  for (const q of buscas) {
    const j = await pegar('/search/playlist?limit=25&q=' + encodeURIComponent(q));
    const bons = (j.data || []).filter((p) => p.nb_tracks >= 30 && (!exige || exige.test(p.title || '')));
    const deezer = bons.find((p) => /deezer/i.test(p.user?.name || ''));
    const p = deezer || bons[0];
    if (p) return p;
    await espera(150);
  }
  throw new Error('Nenhuma playlist achada');
}

async function buscarLista(l) {
  let faixas, fonte = 'Deezer';
  if (l.tipo === 'chart') {
    faixas = await paginar('/chart/0/tracks', l.max);
  } else if (l.tipo === 'genero') {
    const g = (await pegar('/genre')).data.find((x) => l.genero.test(x.name));
    if (!g) throw new Error('Gênero não achado');
    faixas = await paginar(`/chart/${g.id}/tracks`, l.max);
    fonte = 'Deezer: ' + g.name;
  } else {
    const p = await acharPlaylist(l.busca, l.exige);
    faixas = await paginar(`/playlist/${p.id}/tracks`, l.max);
    fonte = 'Deezer: ' + p.title;
  }
  const limpas = faixas.filter((x) => x && x.id).map((x) => ({ id: x.id, t: x.title_short || x.title, a: x.artist?.name || '' }));
  if (limpas.length < 10) throw new Error('Lista muito curta');
  return { nome: l.nome, grupo: l.grupo || 'Outras', fonte, faixas: limpas };
}

async function lerAntigo() {
  try {
    const txt = await readFile(ARQ, 'utf8');
    return JSON.parse(txt.replace(/^window\.CHARTS=/, '').replace(/;\s*$/, ''));
  } catch (e) {
    return { atualizado: null, listas: {}, historico: [] };
  }
}

const antigo = await lerAntigo();
const novo = { atualizado: new Date().toISOString(), listas: {}, historico: antigo.historico || [] };
const hoje = novo.atualizado.slice(0, 10);
const falhas = [];

for (const l of LISTAS) {
  try {
    const nova = await buscarLista(l);
    const velha = antigo.listas?.[l.id];
    if (velha?.faixas?.length) {
      const idsVelhos = new Set(velha.faixas.map((x) => x.id));
      const idsNovos = new Set(nova.faixas.map((x) => x.id));
      const entraram = nova.faixas.filter((x) => !idsVelhos.has(x.id)).slice(0, 50);
      const sairam = velha.faixas.filter((x) => !idsNovos.has(x.id)).slice(0, 50);
      if (entraram.length || sairam.length) {
        novo.historico.unshift({ d: hoje, l: l.id, nome: l.nome, entraram, sairam });
      }
    }
    novo.listas[l.id] = nova;
    console.log('OK', l.nome, nova.faixas.length, nova.fonte);
  } catch (e) {
    console.log('ERRO', l.nome, e.message);
    falhas.push(l.nome);
    if (antigo.listas?.[l.id]) novo.listas[l.id] = { ...antigo.listas[l.id], grupo: l.grupo || 'Outras' };
  }
  await espera(300);
}

novo.historico = novo.historico.slice(0, 300);
if (falhas.length) console.log('Listas que falharam desta vez (' + falhas.length + '): ' + falhas.join(' | '));
if (!Object.keys(novo.listas).length) {
  console.log('Nenhuma lista foi buscada. Nada foi salvo.');
  process.exit(1);
}
await writeFile(ARQ, 'window.CHARTS=' + JSON.stringify(novo) + ';\n');
