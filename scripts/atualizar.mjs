// Busca as listas na API pública do Deezer (sem senha, sem chave) e compara com a última vez.
import { readFile, writeFile } from 'node:fs/promises';

const API = 'https://api.deezer.com';
const ARQ = 'data/charts.js';

// Para mudar uma lista, edite aqui.
// "max" = quantas músicas. "busca" = nomes de playlist procurados no Deezer.
const LISTAS = [
  { id: 'mundo', nome: 'Top 200 Mundo', tipo: 'chart', max: 200 },
  { id: 'brasil', nome: 'Top 200 Brasil', tipo: 'playlist', max: 200, busca: ['Top Brasil', 'Top Brazil'] },
  { id: 'funk', nome: 'Funk em alta', tipo: 'playlist', max: 50, busca: ['Top Funk', 'Funk Hits', 'Funk Brasil'] },
  { id: 'funk-tiktok', nome: 'Funk viral do TikTok', tipo: 'playlist', max: 50, busca: ['Funk TikTok', 'Funk Viral', 'Funk Tiktok Brasil'] },
  { id: 'sertanejo', nome: 'Sertanejo em alta', tipo: 'playlist', max: 100, busca: ['Top Sertanejo', 'Sertanejo Hits'] },
  { id: 'sertanejo-classicos', nome: 'Sertanejo de todos os tempos', tipo: 'playlist', max: 200, busca: ['Sertanejo Clássicos', 'Sertanejo Raiz', 'Os maiores sucessos sertanejos'] },
  { id: 'sertanejo-uni', nome: 'Sertanejo universitário', tipo: 'playlist', max: 100, busca: ['Sertanejo Universitário', 'Sertanejo Universitario Hits'] },
  { id: 'eletronica', nome: 'Eletrônica em alta', tipo: 'genero', max: 100, genero: /electro/i },
  { id: 'eletronica-2010', nome: 'Eletrônica 2006 a 2014', tipo: 'playlist', max: 100, busca: ['Electro Hits 2010', 'EDM Hits 2012', 'Electro House Hits', 'Best of Electro 2010s'] },
  { id: 'pop', nome: 'Pop em alta', tipo: 'genero', max: 100, genero: /^pop$/i },
  { id: 'pop-2010', nome: 'Pop 2006 a 2014', tipo: 'playlist', max: 100, busca: ['Pop Hits 2010', 'Pop Hits 2012', 'Anos 2010 Pop', 'Best of Pop 2010s'] },
  { id: 'tiktok', nome: 'Viral do TikTok', tipo: 'playlist', max: 50, busca: ['TikTok Hits', 'Viral TikTok', 'TikTok Brasil'] },
];

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

async function acharPlaylist(buscas) {
  for (const q of buscas) {
    const j = await pegar('/search/playlist?limit=25&q=' + encodeURIComponent(q));
    const bons = (j.data || []).filter((p) => p.nb_tracks >= 30);
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
    const p = await acharPlaylist(l.busca);
    faixas = await paginar(`/playlist/${p.id}/tracks`, l.max);
    fonte = 'Deezer: ' + p.title;
  }
  const limpas = faixas.filter((x) => x && x.id).map((x) => ({ id: x.id, t: x.title_short || x.title, a: x.artist?.name || '' }));
  if (limpas.length < 10) throw new Error('Lista muito curta');
  return { nome: l.nome, fonte, faixas: limpas };
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
    if (antigo.listas?.[l.id]) novo.listas[l.id] = antigo.listas[l.id];
  }
  await espera(300);
}

novo.historico = novo.historico.slice(0, 300);
if (!Object.keys(novo.listas).length) {
  console.log('Nenhuma lista foi buscada. Nada foi salvo.');
  process.exit(1);
}
await writeFile(ARQ, 'window.CHARTS=' + JSON.stringify(novo) + ';\n');
