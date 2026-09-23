/* Il perche' sul tavolo (src/spiega.js), e le spiegazioni che
 * l'arbitro attacca alle righe del registro.
 *
 * Due meta'. La prima guarda il modulo da solo: dalla riga alla scheda,
 * i conti, i dadi accesi e scartati, i nomi che non diventano HTML. La
 * seconda gioca partite intere e controlla che ogni scheda dica la
 * verita' — che i dadi, i modificatori e il numero da battere diano
 * davvero l'esito che la scheda scrive. Una scheda che spiega un tiro
 * con conti che non tornano insegna una regola sbagliata, ed e' peggio
 * di nessuna scheda.
 *
 * Si lancia con:  node test/spiega.mjs
 */
import fs from 'node:fs';
import * as AR from '../src/arbitro.js';
import * as AG from '../src/agente.js';
import * as D from '../src/dice.js';
import * as PR from '../src/profiles.js';
import * as SP from '../src/spiega.js';

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};

/* ---- 1 · il modulo da solo ---- */
{
  const riga = { text: 'Clanrats: …', dice: [4, 5], page: 154, army: 'B',
    x: { k: 'rotta', u: 'Clanrats', uid: 7, tot: 9, piu: [{ t: 'perso di 3', v: 3 }],
         vs: { v: 7, op: '<=', t: 'Comando' },
         f: [{ t: 'Comando 7 di Grey Seer, a 5″', f: 'generale' }], e: 'Va in rotta', ok: false } };
  const c = SP.scheda(riga);
  ok('la scheda del test di rotta ha il suo titolo', c.titolo === 'Test di rotta' && c.chi === 'Clanrats');
  ok('i dadi, se la spiegazione non li dice, sono quelli della riga', c.dadi.join() === '4,5');
  ok('il totale somma lo scarto ai dadi: 9 + 3 = 12', SP.totale(c) === 12);
  ok('la pagina viene dalla riga', c.pagina === 154);
  const h = SP.schedaHTML(c);
  ok('nell\'HTML ci sono il numero da battere e il modificatore', /serve ≤ <b>7<\/b>/.test(h) && /perso di 3/.test(h));
  ok('l\'esito cattivo si colora da fallimento', /class="sp sp-ko/.test(h) && /✗ Va in rotta/.test(h));
  ok('il generale ha il suo pallino', /sp-f-generale/.test(h));
  ok('l\'unita\' e\' scritta sulla scheda, per accenderla sul tavolo', /data-sp-uid="7"/.test(h));
  ok('l\'esercito colora il bordo', /sp-B/.test(h));
}
{
  const c = SP.scheda({ dice: [2, 6], x: { k: 'carica', tot: 6, via: [0], piu: [{ t: 'Movimento', v: 4 }],
                                            vs: { v: 9, op: '>=' }, e: 'arriva', ok: true } });
  const h = SP.schedaHTML(c);
  ok('il dado scartato della carica si vede, spento', (h.match(/sp-d-via/g) || []).length === 1);
  ok('carica: 6 + 4 di Movimento = 10', SP.totale(c) === 10);
}
{
  const h = SP.rigaHTML({ x: { k: 'tiro', passi: [{ t: 'colpire', serve: 4, d: [1, 4, 6, 3] },
                                                  { t: 'ferire', serve: 5, d: [5, 2] }] }, dice: [1, 4, 6, 3, 5, 2] });
  ok('con i passi la fila intera dei dadi non si ripete', (h.match(/class="sp-d[ "]/g) || []).length === 6);
  ok('i dadi riusciti si accendono: due per colpire, uno per ferire', (h.match(/sp-d-si/g) || []).length === 3);
  ok('e il conto di ogni passo sta in fondo alla sua riga', /<span class="sp-q">2<\/span>/.test(h) && /<span class="sp-q">1<\/span>/.test(h));
  const p = SP.rigaHTML({ x: { k: 'pericoloso', passi: [{ t: 'gli 1 feriscono', uno: true, d: [1, 3, 1, 6] }] } });
  ok('nel terreno pericoloso contano gli 1, e contano male', (p.match(/sp-d-ko/g) || []).length === 2 && /<span class="sp-q">2<\/span>/.test(p));
}
{
  ok('una riga senza spiegazione non fa nessuna scheda', SP.scheda({ text: 'x' }) === null && SP.rigaHTML({ text: 'x' }) === '');
  const h = SP.rigaHTML({ x: { k: 'scelta', u: '<img src=x onerror=alert(1)>', testo: 'carico "adesso" & basta' } });
  ok('i nomi e le frasi che vengono da fuori non diventano HTML', !/<img/.test(h) && /&lt;img/.test(h) && /&amp; basta/.test(h));
  ok('un tipo che la scheda non conosce ha lo stesso una scheda', SP.scheda({ x: { k: 'nuovo' } }).titolo === 'nuovo');
  ok('lo stile c\'e\', e ripiega sui colori carta fuori dall\'app', /var\(--panel, #fffdf8\)/.test(SP.SPIEGA_CSS));
}

/* ---- 2 · le partite vere ----
   Tre semi, con le liste di Battle March e con le due «fun» che
   portano l'Abominio, il Terrore e il Movimento che si tira. */
const dati = f => JSON.parse(fs.readFileSync(new URL('../dati/' + f, import.meta.url), 'utf8'));
PR.useProfiles(dati('profili.json'));
const liste = dati('liste.json');
const lista = id => liste.find(l => l.id === id);
const coppie = [['lmtl5sa4300nt', 'lmtl5sn694u6w', 'bm-strada', 3],     // La Strada delle Pietre
                ['lmubp2kimjzhw', 'lmubp01267euf', 'bm-strada', 11],    // LIZ fun contro Skaven fun
                ['lmubp2kimjzhw', 'lmucdz1grir4h', 'bm-rovine', 5]];    // LIZ fun contro O&G FUN
const righe = [];
for (const [a, b, sc, seme] of coppie){
  if (!lista(a) || !lista(b)) continue;
  D.setSource(D.seeded(seme));
  const G = AR.newBattle({ A: lista(a), B: lista(b), scenario: sc });
  await AG.giocaPartita(AR, G, { A: AG.agenteEuristico({}), B: AG.agenteEuristico({}) });
  righe.push(...G.log);
}
const spiegate = righe.filter(r => r.x);
const tipi = new Set(spiegate.map(r => r.x.k));
ok(`le partite hanno righe spiegate (${spiegate.length} su ${righe.length})`, spiegate.length > 50);
ok(`e di tanti tipi diversi: ${[...tipi].sort().join(', ')}`,
   ['rotta', 'carica', 'tiro', 'mischia', 'risultato'].every(k => tipi.has(k)));

let rotte = true;
for (const r of spiegate){
  try { if (!SP.rigaHTML(r)) rotte = false; } catch (e){ rotte = false; console.log('       ' + e.message); }
}
ok('ogni riga spiegata diventa una scheda, senza errori', rotte);

/* i conti: dadi tenuti, piu' i modificatori, contro il numero da
   battere, danno l'esito che la scheda scrive */
const tenuti = r => { const d = r.x.d || r.dice || []; const via = new Set(r.x.via || []);
                      return d.filter((_, i) => !via.has(i)).reduce((s, v) => s + v, 0); };
const somma = r => SP.totale(SP.scheda(r));
const doppioUno = r => { const d = r.x.d || r.dice || []; return d.filter(v => v === 1).length >= 2 && tenuti(r) === 2; };
const falsi = [];
for (const r of spiegate){
  const x = r.x;
  if (x.tot != null && (r.dice || x.d) && x.k !== 'primo' && x.k !== 'movimento' || x.k === 'movimento' && x.d && x.d.length){
    if (x.k !== 'fiasco' && tenuti(r) !== x.tot) falsi.push(`${x.k}: dadi tenuti ${tenuti(r)} ma tot ${x.tot} — ${r.text}`);
  }
  if (!x.vs || typeof x.ok !== 'boolean') continue;
  const t = somma(r), v = x.vs.v;
  const regge = x.vs.op === '<=' ? t <= v : x.vs.op === '>=' ? t >= v - 0.01 : t > v;
  /* il test di Comando: passa se regge, o con il doppio uno */
  if (['panico', 'paura', 'terrore', 'stupidita', 'raduno', 'marcia'].includes(x.k)){
    if (x.ok !== (regge || doppioUno(r))) falsi.push(`${x.k}: ${t} contro ${v} ma ok=${x.ok} — ${r.text}`);
  }
  /* la carica: arrivare vuol dire che i pollici bastavano (l'inverso
     no: si puo' non arrivare per il posto che manca sulla faccia) */
  if (x.k === 'carica' && x.ok && !regge) falsi.push(`carica: ${t} contro ${v} e arriva — ${r.text}`);
  if (x.k === 'inseguimento' && x.ok !== regge) falsi.push(`inseguimento: ${t} contro ${v} ma ok=${x.ok} — ${r.text}`);
  /* il lancio: il doppio uno non lancia, il doppio sei si' */
  if (x.k === 'lancio'){
    const d = r.dice || [];
    const perfetto = d[0] === 6 && d[1] === 6, fiasco = d[0] === 1 && d[1] === 1;
    if (!fiasco && !perfetto && x.ok !== regge) falsi.push(`lancio: ${t} contro ${v} ma ok=${x.ok} — ${r.text}`);
  }
}
if (falsi.length) console.log('       ' + falsi.slice(0, 5).join('\n       '));
ok('ogni scheda con un numero da battere dà l\'esito che i suoi conti danno', falsi.length === 0);

/* il test di rotta: le tre fasce del libro (p. 154) */
const rottaMale = spiegate.filter(r => r.x.k === 'rotta' && r.x.tot != null).filter(r => {
  const x = r.x, nat = x.tot, mod = somma(r), ld = x.vs.v;
  if (r.text.includes('doppio uno')) return false;
  if (mod <= ld) return !/cede/i.test(x.e);
  if (nat > ld) return !/rotta/i.test(x.e);
  return !/ripiega|rotta|cede/i.test(x.e);
});
ok('il test di rotta cede con la somma nel Comando, va in rotta con i soli dadi fuori', rottaMale.length === 0);

/* il Comando che la scheda nomina e' quello con cui si e' tirato */
const psico = spiegate.filter(r => ['panico', 'paura', 'terrore', 'raduno'].includes(r.x.k) && r.x.vs);
ok('i test di Comando dicono da dove viene il Comando',
   psico.every(r => r.x.f.some(f => f.f === 'profilo' && /^Comando \d+ dal profilo$/.test(f.t))));

/* le copie della ricerca non si portano dietro il registro */
const G = AR.newBattle({ A: lista(coppie[0][0]), B: lista(coppie[0][1]), scenario: 'bm-strada' });
G.log.push({ text: 'x', x: { k: 'rotta' } });
ok('la copia di una partita riparte con il registro vuoto, spiegazioni comprese', AR.clona(G).log.length === 0);

console.log(fails ? `\n${fails} prove fallite` : '\ntutte le prove passano');
process.exit(fails ? 1 : 0);
