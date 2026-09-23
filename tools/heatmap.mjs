/* Schieramento Old World — la mappa di tante partite
 *
 * `partita.mjs --partite N --heatmap mappa.html` gioca N partite e,
 * invece di guardarne una, le guarda tutte insieme: per ogni unita',
 *
 *   SCHIERAMENTO  da quale posto e' partita, e come e' andata la sua
 *                 lista quando e' partita da li';
 *   DOVE STA      dove passa i turni nelle partite vinte e in quelle
 *                 perse, turno per turno;
 *   SCONTRI       dove combatte, come va quando combatte li', e dove
 *                 muore davvero.
 *
 * La prima versione di questo file aveva tre difetti da statistico, e
 * questa esiste per toglierli.
 *
 * 1. I COLORI GRIDAVANO SUL NIENTE. Un posto con quattro partite e il
 *    75% era verde pieno quanto uno con ottanta. Adesso ogni
 *    percentuale passa dal restringimento beta-binomiale
 *    (`statistica.mjs`): la famiglia dei posti di un'unita' dice da
 *    sola quanto i posti variano davvero, e un posto con poche partite
 *    torna verso la media della sua lista. Il colore e' la stima
 *    ristretta, su una scala FISSA — pieno a ±20 punti percentuali —
 *    e non riscalata sul massimo di quella mappa: prima ogni mappa
 *    sembrava forte, anche quella in cui niente contava.
 *
 * 2. SI CONTAVANO MEZZI TURNI COME PARTITE. Negli scontri una partita
 *    in cui l'unita' combatteva sei mezzi turni nella stessa casella
 *    pesava sei volte. Adesso scontri e morti si contano UNA VOLTA PER
 *    PARTITA: una casella e' «ci ha combattuto in questa partita, si'
 *    o no», e la percentuale e' fra partite, che e' la sola unita' in
 *    cui un intervallo vuol dire qualcosa.
 *
 * 3. LA MAPPA DEL MOVIMENTO SI LEGGEVA AL CONTRARIO. «Dove sta quando
 *    vince» e' una conseguenza, non una causa: un reggimento e' avanti
 *    PERCHE' la sua parte sta vincendo, e chiamarla «la strada buona»
 *    era leggere la freccia al rovescio. Resta, perche' descrivere
 *    come si muove chi vince serve, ma si chiama per quello che e' e
 *    si sfoglia turno per turno: al primo turno la differenza e' vicina
 *    a zero, e l'occhio vede quando comincia ad aprirsi.
 *
 * E due cose piu' piccole: la posizione di un'unita' copre tutte le
 * caselle che il suo ingombro tocca, non solo quella del centro; e la
 * croce della morte sta dove l'unita' e' morta, non all'ultima
 * fotografia di inizio mezzo turno.
 *
 * Con lo specchio (`serie.mjs`) la stessa unita' gioca meta' partite in
 * basso e meta' in alto, su un terreno che non e' simmetrico: le due
 * meta' restano due schede diverse, «in basso» e «in alto».
 *
 * Qui dentro non si tira un dado: entra lo stato della partita a ogni
 * passo, escono conteggi e una pagina sola, senza rete.
 */

import { restringi, wilson } from './statistica.mjs';

const MM = 25.4;
/* le caselle: tre pollici, sedici per dodici su un tavolo da 48×36 */
const CASELLA = 3 * MM;
/* il colore pieno: venti punti percentuali sopra o sotto il solito */
const SCALA = 0.2;
const COLONNE = ["sinistra", "centro-sinistra", "centro", "centro-destra", "destra"];

export function raccoglitore({ AR, FM, nomiListe = { x: 'x', y: 'y' } }){
  const unita = new Map();          // chiave -> i conteggi di tutte le partite
  const terreni = new Set();
  let W = 0, H = 0, cols = 0, rows = 0, turni = 0;
  let partite = 0;
  const vinte = { x: 0, y: 0 };
  let specchio = false;
  let meta = null;
  let g = null;                     // la partita in corso

  const chiaveDi = (u, ctx) => {
    const L = ctx.zona[u.army];
    return { k: `${L}:${u.uid - (u.army === 'A' ? 1 : 501)}:${u.army}`, L };
  };
  const scheda = (u, ctx) => {
    const { k, L } = chiaveDi(u, ctx);
    let s = unita.get(k);
    if (!s){
      const vuoto = () => new Float64Array(cols * rows);
      s = { k, L, zona: u.army, n: u.name, giocate: 0, w: 0, l: 0, vp: 0,
            vive: { n: 0, w: 0 }, morte: { n: 0, w: 0 },
            posti: new Map(),
            /* dove sta, per turno: pres[t][esito][casella], e quante
               fotografie ci sono dietro */
            pres: [], foto: [],
            lottaN: vuoto(), lottaW: vuoto(), fine: vuoto() };
      unita.set(k, s);
    }
    return s;
  };
  const turno = (s, t) => {
    while (s.pres.length <= t){
      s.pres.push({ w: new Float64Array(cols * rows), l: new Float64Array(cols * rows) });
      s.foto.push({ w: 0, l: 0 });
    }
    return s.pres[t];
  };
  /* dove sta un'unita': un personaggio unito sta dentro il suo
     reggimento, e la sua posizione e' quella del reggimento */
  const ospite = (S, u) => {
    const h = FM.joinedHost(u);
    return h != null ? S.units.find(x => x.uid === h) || u : u;
  };
  const cellaDi = (x, y) => {
    const c = Math.min(cols - 1, Math.max(0, Math.floor(x / CASELLA)));
    const r = Math.min(rows - 1, Math.max(0, Math.floor(y / CASELLA)));
    return r * cols + c;
  };
  /* le caselle che l'ingombro copre: il centro di ogni casella dentro
     il rettangolo ruotato, e comunque quella del centro dell'unita' */
  const caselle = (S, o) => {
    const b = AR.boxOf(o, S.units);
    const out = new Set([cellaDi(b.x, b.y)]);
    const a = (b.rot || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const R = Math.hypot(b.w, b.h) / 2;
    const c0 = Math.max(0, Math.floor((b.x - R) / CASELLA)), c1 = Math.min(cols - 1, Math.floor((b.x + R) / CASELLA));
    const r0 = Math.max(0, Math.floor((b.y - R) / CASELLA)), r1 = Math.min(rows - 1, Math.floor((b.y + R) / CASELLA));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++){
      const dx = (c + 0.5) * CASELLA - b.x, dy = (r + 0.5) * CASELLA - b.y;
      const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
      if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2) out.add(r * cols + c);
    }
    return { b, celle: [...out] };
  };

  return {
    nuova(S, ctx){
      if (!W){
        W = S.table.w; H = S.table.h;
        cols = Math.ceil(W / CASELLA); rows = Math.ceil(H / CASELLA);
      }
      if (ctx.giro) specchio = true;
      terreni.add(JSON.stringify(S.terrain.map(t => [t.kind, Math.round(t.x), Math.round(t.y), Math.round(t.rot || 0)])));
      if (!meta) meta = {
        w: W, h: H,
        terreno: S.terrain.map(t => ({ x: t.x, y: t.y, w: t.w, h: t.h, rot: t.rot, kind: t.kind, label: t.label })),
        zone: [...(S.zones.A || []).map(z => ({ ...z, army: 'A' })), ...(S.zones.B || []).map(z => ({ ...z, army: 'B' }))],
      };
      g = { chiave: '', posto: new Map(), foto: [], lotta: new Map(), vivo: new Map(), morto: new Map() };
    },

    /* dopo ogni mossa. Due cose: dove sta chi e' ancora vivo (per
       sapere dove muore, che succede in mezzo a un mezzo turno), e
       all'inizio di ogni mezzo turno la fotografia */
    passo(S, ctx){
      if (!g || S.schierando) return;
      for (const u of S.units){
        const o = ospite(S, u);
        if (o.placed && !o.dead && !u.dead) g.vivo.set(u.uid, [o.x, o.y]);
        else if ((u.dead || o.dead) && !g.morto.has(u.uid) && g.vivo.has(u.uid)) g.morto.set(u.uid, g.vivo.get(u.uid));
      }
      const k = S.turno + ':' + S.army;
      if (k === g.chiave) return;
      const prima = !g.chiave;
      g.chiave = k;
      turni = Math.max(turni, S.turno);
      for (const u of S.units){
        const o = ospite(S, u);
        const vivo = o.placed && !o.dead;
        const { celle, b } = vivo ? caselle(S, o) : { celle: [], b: null };
        if (prima && b) g.posto.set(u.uid, [Math.round(b.x), Math.round(b.y)]);
        g.foto.push({ uid: u.uid, t: S.turno, celle });
        if (vivo && AR.ingaggiata(S, o)){
          const l = g.lotta.get(u.uid) || g.lotta.set(u.uid, new Set()).get(u.uid);
          for (const c of celle) l.add(c);
        }
      }
    },

    fine(S, esito, ctx){
      if (!g) return;
      partite++;
      const vinceZona = esito && esito.winner;
      const vinceL = vinceZona ? ctx.zona[vinceZona] : null;
      if (vinceL) vinte[vinceL]++;
      const foto = new Map();
      for (const f of g.foto) (foto.get(f.uid) || foto.set(f.uid, []).get(f.uid)).push(f);
      for (const u of S.units){
        const s = scheda(u, ctx);
        const w = vinceL === s.L, l = vinceL && !w;
        s.giocate++; if (w) s.w++; if (l) s.l++;
        s.vp += esito ? (u.army === 'A' ? esito.A - esito.B : esito.B - esito.A) : 0;
        const viva = !u.dead && u.placed && !u.fled;
        const e = viva ? s.vive : s.morte;
        e.n++; if (w) e.w++;
        const pp = g.posto.get(u.uid);
        if (pp){
          const key = pp.join(',');
          const q = s.posti.get(key) || { x: pp[0], y: pp[1], n: 0, w: 0, vp: 0 };
          q.n++; if (w) q.w++;
          q.vp += esito ? (u.army === 'A' ? esito.A - esito.B : esito.B - esito.A) : 0;
          s.posti.set(key, q);
        }
        if (w || l){
          const d = w ? 'w' : 'l';
          for (const f of foto.get(u.uid) || []){
            const T = turno(s, f.t);
            s.foto[f.t][d]++;
            for (const c of f.celle) T[d][c]++;
          }
        }
        for (const c of g.lotta.get(u.uid) || []){ s.lottaN[c]++; if (w) s.lottaW[c]++; }
        if (!viva){
          const p = g.morto.get(u.uid) || g.vivo.get(u.uid);
          if (p) s.fine[cellaDi(p[0], p[1])]++;
        }
      }
      g = null;
    },

    /* quello che va nella pagina: le stime gia' ristrette, numeri tondi
       e niente Map */
    dati(){
      const zonaDi = a => meta.zone.find(z => z.army === a) || null;
      const tonde = f => Array.from(f, v => Math.round(v));
      const lista = [...unita.values()].map(s => pagina(s, zonaDi(s.zona)));
      /* «tutte le unità» di una lista in una zona, come una scheda sola:
         i conteggi si sommano, e i posti di unita' diverse fanno una
         famiglia sola da restringere */
      for (const L of ['x', 'y']) for (const zona of ['A', 'B']){
        const us = [...unita.values()].filter(s => s.L === L && s.zona === zona);
        if (!us.length) continue;
        const somma = { k: `${L}:tutte:${zona}`, L, zona, tutte: true, n: 'tutte le unità',
          giocate: us[0].giocate, w: us[0].w, l: us[0].l, vp: us[0].vp, vive: null, morte: null,
          posti: new Map(us.flatMap(s => [...s.posti.entries()].map(([k, v]) => [s.k + '@' + k, { ...v }]))),
          pres: [], foto: [],
          lottaN: new Float64Array(cols * rows), lottaW: new Float64Array(cols * rows), fine: new Float64Array(cols * rows) };
        for (const s of us){
          s.pres.forEach((T, t) => {
            while (somma.pres.length <= t){ somma.pres.push({ w: new Float64Array(cols * rows), l: new Float64Array(cols * rows) }); somma.foto.push({ w: 0, l: 0 }); }
            for (let c = 0; c < cols * rows; c++){ somma.pres[t].w[c] += T.w[c]; somma.pres[t].l[c] += T.l[c]; }
            somma.foto[t].w += s.foto[t].w; somma.foto[t].l += s.foto[t].l;
          });
          for (let c = 0; c < cols * rows; c++){
            somma.lottaN[c] += s.lottaN[c]; somma.lottaW[c] += s.lottaW[c]; somma.fine[c] += s.fine[c];
          }
        }
        lista.push(pagina(somma, zonaDi(zona)));
      }
      /* i nomi doppi («Orc Mobs» due volte) prendono un numero */
      const quanti = new Map();
      for (const u of lista) if (!u.tutte) quanti.set(u.L + u.zona + u.n, (quanti.get(u.L + u.zona + u.n) || 0) + 1);
      const visti = new Map();
      for (const u of lista) if (!u.tutte && quanti.get(u.L + u.zona + u.n) > 1){
        const k = (visti.get(u.L + u.zona + u.n) || 0) + 1;
        visti.set(u.L + u.zona + u.n, k);
        u.n += ' ' + k;
      }
      return { meta: { ...meta, cols, rows, casella: CASELLA, scala: SCALA, partite, vinte, turni, specchio,
                       nomi: nomiListe, terreniDiversi: terreni.size },
               unita: lista };

      function pagina(s, z){
        const base = s.giocate ? s.w / s.giocate : 0;
        /* i posti: nome, stima ristretta verso il solito dell'unita' */
        const grezzi = [...s.posti.values()].map(p => ({ ...p, k: p.w }));
        const file = [...new Set(grezzi.map(p => p.y))].sort((p, q) => s.zona === 'A' ? p - q : q - p);
        const R = restringi(grezzi, { media: base });
        const posti = R.gruppi.map(p => {
          const col = z ? Math.min(4, Math.max(0, Math.floor((p.x - z.x) / z.w * 5))) : 2;
          const fila = file.indexOf(p.y);
          const w95 = wilson(p.w, p.n);
          return { x: p.x, y: p.y, n: p.n, w: p.w, vp: Math.round(p.vp / p.n),
                   post: +p.post.toFixed(4), sd: +p.sd.toFixed(4), lo: +w95.lo.toFixed(3), hi: +w95.hi.toFixed(3),
                   dove: COLONNE[col] + (file.length > 1 ? `, ${fila + 1}ª fila` : '') };
        });
        /* gli scontri: per casella, in quante partite ci ha combattuto
           e quante di quelle ha vinto la sua lista, ristrette fra le
           caselle */
        const celle = [];
        for (let c = 0; c < cols * rows; c++) if (s.lottaN[c]) celle.push({ c, n: s.lottaN[c], k: s.lottaW[c] });
        const RL = restringi(celle, { media: base });
        return {
          k: s.k, L: s.L, zona: s.zona, tutte: !!s.tutte, n: s.n, giocate: s.giocate, w: s.w, l: s.l,
          vp: s.giocate ? Math.round(s.vp / s.giocate) : 0,
          vive: s.vive, morte: s.morte, posti, forzaPosti: Math.round(Math.min(R.forza, 1e4)),
          pres: s.pres.map(T => ({ w: tonde(T.w), l: tonde(T.l) })), foto: s.foto,
          lotta: RL.gruppi.map(x => ({ c: x.c, n: x.n, k: x.k, post: +x.post.toFixed(4) })),
          fine: tonde(s.fine),
        };
      }
    },
  };
}

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function paginaHeatmap({ dati, titolo, sotto, avvisi = [], colori = {}, coloreTerreno = () => '#c8bda8' }){
  dati.meta.terreno = dati.meta.terreno.map(t => ({ ...t, colore: coloreTerreno(t.kind) }));
  const json = JSON.stringify(dati).replace(/</g, '\\u003c');
  const cA = colori.A || '#3f6fb5', cB = colori.B || '#b5483f', cT = colori.tavolo || '#e9e2cf';
  return `<!doctype html>
<html lang="it">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titolo)}</title>
<style>
  :root{ --sfondo:#f6f1e6; --carta:#fffdf8; --linea:#d8ccb4; --testo:#2b2620; --muto:#7d7264;
         --A:${cA}; --B:${cB}; --bene:#2f8a4c; --male:#c0452f; }
  @media (prefers-color-scheme: dark){
    :root{ --sfondo:#1d1b18; --carta:#26231f; --linea:#433d34; --testo:#ece4d4; --muto:#a89c8a; }
  }
  *{ box-sizing:border-box; }
  body{ margin:0; background:var(--sfondo); color:var(--testo);
        font:15px/1.5 "Iowan Old Style","Palatino Linotype",Georgia,serif; }
  header{ padding:14px 18px 10px; border-bottom:1px solid var(--linea); background:var(--carta); }
  h1{ margin:0 0 4px; font-size:19px; }
  .sotto{ color:var(--muto); font-size:13px; }
  .avvisi{ margin:8px 0 0; padding:8px 12px; border:1px solid #e0b872; background:#fff4dc;
           border-radius:5px; color:#6b4410; font-size:13px; }
  .avvisi ul{ margin:4px 0 0; padding-left:18px; }
  .schermo{ display:grid; grid-template-columns:minmax(0,1fr) 380px; }
  @media (max-width:900px){ .schermo{ grid-template-columns:1fr; } }
  .tavolo{ padding:12px 14px; min-width:0; }
  svg{ width:100%; height:auto; background:${cT}; border:1px solid var(--linea); border-radius:6px; display:block; }
  .pannello{ border-left:1px solid var(--linea); background:var(--carta); padding:12px 16px; min-width:0; }
  @media (max-width:900px){ .pannello{ border-left:0; border-top:1px solid var(--linea); } }
  label{ display:block; font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--muto); margin:10px 0 4px; }
  select{ width:100%; font:inherit; padding:5px 6px; border:1px solid var(--linea); border-radius:5px;
          background:var(--sfondo); color:inherit; }
  .modi{ display:flex; gap:4px; flex-wrap:wrap; }
  .modi button{ flex:1; font:inherit; font-size:14px; padding:5px 4px; border:1px solid var(--linea);
                background:var(--sfondo); color:inherit; border-radius:5px; cursor:pointer; }
  .modi button[aria-pressed=true]{ background:var(--testo); color:var(--carta); }
  .turni{ display:none; }
  .turni.si{ display:block; }
  .turni input{ width:100%; }
  .come{ font-size:13px; color:var(--muto); margin:10px 0; }
  .attenzione{ font-size:13px; margin:10px 0; padding:6px 10px; border-left:3px solid #c9953a; background:rgba(201,149,58,.1); }
  table{ width:100%; border-collapse:collapse; font-size:13.5px; }
  td,th{ padding:4px 4px; border-bottom:1px solid var(--linea); text-align:left; vertical-align:top; }
  th{ font-weight:normal; color:var(--muto); font-size:12px; }
  td.n{ text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .scala{ display:flex; align-items:center; gap:6px; font-size:12px; color:var(--muto); margin-top:8px; }
  .scala i{ flex:1; height:10px; border-radius:3px;
            background:linear-gradient(90deg,var(--male),#eee6d6,var(--bene)); }
  .nome.piccolo{ font-size:14px; stroke-width:4px; }
  .nome{ font-size:20px; fill:#fff; paint-order:stroke; stroke:rgba(0,0,0,.6); stroke-width:5px;
         font-family:system-ui,sans-serif; pointer-events:none; }
  footer{ padding:10px 18px; color:var(--muto); font-size:12.5px; border-top:1px solid var(--linea); }
</style>

<header>
  <h1>${esc(titolo)}</h1>
  <div class="sotto">${esc(sotto)}</div>
  ${avvisi.length ? `<div class="avvisi"><b>Da sapere prima di leggerla:</b><ul>${avvisi.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
</header>

<div class="schermo">
  <div class="tavolo">
    <svg id="campo" viewBox="0 0 ${dati.meta.w} ${dati.meta.h}" role="img" aria-label="il tavolo con la mappa"></svg>
    <div class="scala"><span id="scala-sx"></span><i></i><span id="scala-dx"></span></div>
  </div>
  <div class="pannello">
    <label for="chi">Unità</label>
    <select id="chi"></select>
    <label>Mappa</label>
    <div class="modi" role="group">
      <button data-modo="posti" aria-pressed="true">Schieramento</button>
      <button data-modo="mov" aria-pressed="false">Dove sta</button>
      <button data-modo="lotta" aria-pressed="false">Scontri</button>
    </div>
    <div class="turni" id="turni">
      <label for="turno">Turno: <span id="turno-n"></span></label>
      <input type="range" id="turno" min="0" value="0">
    </div>
    <p class="come" id="come"></p>
    <div id="numeri"></div>
  </div>
</div>

<footer>Il meglio che si legge qui è il meglio per l'euristica di questa app, che gioca con poche regole di buon senso:
  un giocatore vero può fare meglio da un posto che qui perde. I colori sono stime <b>ristrette</b>: dove le partite sono poche
  tornano verso il solito da sole, e il colore pieno vuol dire venti punti percentuali sopra o sotto, sempre, su ogni mappa.</footer>

<script>
var P = ${json};
var M = P.meta;
var campo = document.getElementById('campo');
var esc = function(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
var pc = function(x){ return Math.round(x * 100) + '%'; };
var pp = function(x){ return (x >= 0 ? '+' : '') + Math.round(x * 100); };
var ZONA = { A: 'in basso', B: 'in alto' };
/* dal rosso al verde passando per il colore della carta: t in [-1, 1] */
var mescola = function(t){
  t = Math.max(-1, Math.min(1, t));
  var a = [238, 230, 214], b = t < 0 ? [192, 69, 47] : [47, 138, 76], k = Math.abs(t);
  return 'rgb(' + a.map(function(v, i){ return Math.round(v + (b[i] - v) * k); }).join(',') + ')';
};

var fondo = M.terreno.map(function(t){
  return '<g transform="translate(' + t.x + ',' + t.y + ') rotate(' + (t.rot || 0) + ')">' +
    '<rect x="' + (-t.w / 2) + '" y="' + (-t.h / 2) + '" width="' + t.w + '" height="' + t.h +
    '" rx="6" fill="' + t.colore + '" fill-opacity=".5" stroke="#9c8f76"><title>' + esc(t.label || t.kind) + '</title></rect></g>';
}).join('');
var zone = M.zone.map(function(z){
  return '<rect x="' + z.x + '" y="' + z.y + '" width="' + z.w + '" height="' + z.h +
    '" fill="none" stroke="' + (z.army === 'A' ? 'var(--A)' : 'var(--B)') + '" stroke-width="3" stroke-dasharray="12 8" stroke-opacity=".6"/>';
}).join('');

/* le scelte: per lista, e con lo specchio per zona */
var sel = document.getElementById('chi');
['x', 'y'].forEach(function(L){
  ['A', 'B'].forEach(function(z){
    var us = P.unita.filter(function(u){ return u.L === L && u.zona === z; });
    if (!us.length) return;
    var og = document.createElement('optgroup');
    og.label = M.nomi[L] + (M.specchio ? ' · ' + ZONA[z] : '');
    us.sort(function(a, b){ return (b.tutte ? 1 : 0) - (a.tutte ? 1 : 0); }).forEach(function(u){
      var o = document.createElement('option');
      o.value = u.k; o.textContent = u.tutte ? 'tutte le unità' : u.n;
      og.appendChild(o);
    });
    sel.appendChild(og);
  });
});
sel.selectedIndex = 1;
var scelta = function(){ return P.unita.find(function(u){ return u.k === sel.value; }); };

var modo = 'posti';
document.querySelectorAll('.modi button').forEach(function(b){
  b.onclick = function(){
    modo = b.dataset.modo;
    document.querySelectorAll('.modi button').forEach(function(x){ x.setAttribute('aria-pressed', String(x === b)); });
    disegna();
  };
});
sel.onchange = disegna;
var cursore = document.getElementById('turno');
cursore.max = M.turni;
cursore.oninput = disegna;

var rett = function(i, colore, alfa, titolo){
  var c = i % M.cols, r = Math.floor(i / M.cols);
  return '<rect x="' + c * M.casella + '" y="' + r * M.casella + '" width="' + M.casella + '" height="' + M.casella +
    '" fill="' + colore + '" fill-opacity="' + alfa.toFixed(2) + '"><title>' + esc(titolo) + '</title></rect>';
};

function disegna(){
  var u = scelta();
  var base = u.giocate ? u.w / u.giocate : 0;       // quanto vince di solito la sua lista, da qui
  var chi = esc(M.nomi[u.L]);
  var sopra = '', come = '', righe = '', nota = '';
  document.getElementById('turni').className = 'turni' + (modo === 'mov' ? ' si' : '');
  document.getElementById('scala-sx').textContent = '−' + Math.round(M.scala * 100) + ' punti % sul solito';
  document.getElementById('scala-dx').textContent = '+' + Math.round(M.scala * 100);

  if (modo === 'posti'){
    var maxN = Math.max.apply(null, u.posti.map(function(p){ return p.n; }).concat([1]));
    var ord = u.posti.slice().sort(function(p, q){ return q.post - p.post || q.n - p.n; });
    sopra = ord.slice().reverse().map(function(p){
      var r = 10 + 20 * Math.sqrt(p.n / maxN);
      return '<g><circle cx="' + p.x + '" cy="' + p.y + '" r="' + r.toFixed(1) + '" fill="' + mescola((p.post - base) / M.scala) +
        '" stroke="' + (u.zona === 'A' ? 'var(--A)' : 'var(--B)') + '" stroke-width="4"><title>' + esc(p.dove) + ': ' +
        p.w + ' vinte su ' + p.n + ', stima ristretta ' + pc(p.post) + '</title></circle>' +
        '<text class="nome piccolo" x="' + p.x + '" y="' + (p.y + 5) + '" text-anchor="middle">' + pp(p.post - base) + ' · ' + p.n + '</text></g>';
    }).join('');
    come = 'Ogni cerchio è un posto da cui ' + esc(u.n) + ' è partita; più grande dove è partita più spesso. ' +
      'Il numero è quanto ha vinto ' + chi + ' partendo da lì rispetto al solito (' + pc(base) + '), in punti percentuali, ' +
      'dopo il restringimento: con poche partite la stima torna verso il solito. Accanto, quante partite.';
    if (u.forzaPosti >= 1000) nota = 'Fra i posti di quest’unità non c’è più differenza di quanta ne farebbe il caso: ' +
      'il restringimento li porta tutti sul solito, ed è la risposta giusta.';
    righe = '<table><tr><th>posto</th><th class="n">vinte</th><th class="n">stima</th><th class="n">95% grezzo</th><th class="n">punti ±</th></tr>' +
      ord.map(function(p){ return '<tr><td>' + esc(p.dove) + '</td><td class="n">' + p.w + '/' + p.n + '</td><td class="n">' +
        pc(p.post) + '</td><td class="n">' + pc(p.lo) + '–' + pc(p.hi) + '</td><td class="n">' + (p.vp >= 0 ? '+' : '') + p.vp + '</td></tr>'; }).join('') + '</table>';
    if (u.posti.length === 1) righe += '<p class="come">Un posto solo: senza <b>--estro</b> l’euristica schiera sempre uguale, e non c’è niente da confrontare.</p>';
  }

  if (modo === 'mov'){
    var t = +cursore.value;
    document.getElementById('turno-n').textContent = t ? String(t) : 'tutti';
    var somma = function(d){
      var v = new Array(M.cols * M.rows).fill(0), n = 0;
      u.pres.forEach(function(T, i){
        if (!i || (t && i !== t)) return;
        T[d].forEach(function(x, c){ v[c] += x; });
        n += u.foto[i][d];
      });
      return v.map(function(x){ return n ? x / n : 0; });
    };
    var fw = somma('w'), fl = somma('l');
    if (!u.w || !u.l){
      var tot = fw.map(function(v, i){ return v + fl[i]; });
      var mx = Math.max.apply(null, tot.concat([0.01]));
      sopra = tot.map(function(v, i){ return v ? rett(i, '#6b5b3e', 0.15 + 0.6 * v / mx, pc(v) + ' delle fotografie qui') : ''; }).join('');
      come = chi + (u.w ? ' non ha mai perso' : ' non ha mai vinto') + ': non c’è una differenza da mostrare, solo dove ' +
        esc(u.n) + ' si trova (più scuro, più spesso).';
    } else {
      sopra = fw.map(function(v, i){
        var pres = v + fl[i];
        if (!pres) return '';
        var d = v - fl[i];
        return rett(i, mescola(d / M.scala), 0.2 + 0.6 * Math.min(1, pres / 0.5),
          'qui nel ' + pc(v) + ' delle fotografie delle partite vinte, nel ' + pc(fl[i]) + ' di quelle perse');
      }).join('');
      document.getElementById('scala-sx').textContent = 'più spesso quando perde';
      document.getElementById('scala-dx').textContent = 'quando vince';
      come = 'Dove si trova ' + esc(u.n) + ' (tutte le caselle che il suo ingombro copre), all’inizio di ogni mezzo turno' +
        (t ? ' del turno ' + t : '') + ': verde dove sta più spesso nelle partite che ' + chi + ' vince, rosso in quelle che perde. ' +
        'La scala è la differenza fra le due frequenze, piena a ' + Math.round(M.scala * 100) + ' punti.';
      nota = '<b>Descrittiva, non una ricetta.</b> Un reggimento sta avanti <i>perché</i> la sua parte sta vincendo, non il contrario: ' +
        'questa mappa dice come si muove chi vince, non dove andare per vincere. Sfoglia i turni: al primo la differenza è quasi zero, ' +
        'e si vede quando comincia ad aprirsi.';
    }
  }

  if (modo === 'lotta'){
    var mxn = Math.max.apply(null, u.lotta.map(function(x){ return x.n; }).concat([1]));
    sopra = u.lotta.map(function(x){
      return rett(x.c, mescola((x.post - base) / M.scala), 0.3 + 0.6 * Math.sqrt(x.n / mxn),
        'ci combatte in ' + x.n + ' partite; ' + chi + ' ne vince ' + x.k + ' (stima ristretta ' + pc(x.post) + ')');
    }).join('');
    var mxf = Math.max.apply(null, u.fine.concat([1]));
    sopra += u.fine.map(function(v, i){
      if (!v) return '';
      var c = i % M.cols, r = Math.floor(i / M.cols), s = 8 + 18 * Math.sqrt(v / mxf);
      var cx = (c + 0.5) * M.casella, cy = (r + 0.5) * M.casella;
      return '<g stroke="#1d1b18" stroke-width="5" stroke-linecap="round"><title>muore o fugge qui ' + v + ' volte</title>' +
        '<line x1="' + (cx - s) + '" y1="' + (cy - s) + '" x2="' + (cx + s) + '" y2="' + (cy + s) + '"/>' +
        '<line x1="' + (cx - s) + '" y1="' + (cy + s) + '" x2="' + (cx + s) + '" y2="' + (cy - s) + '"/></g>';
    }).join('');
    come = 'Dove combatte ' + esc(u.n) + ': una casella conta una volta per partita, se ci ha combattuto. Il colore è quanto vince ' +
      chi + ' nelle partite in cui combatte lì rispetto al solito (' + pc(base) + '), ristretto fra le caselle; più pieno dove succede più spesso. ' +
      'La croce è dove muore o si mette a fuggire.';
    nota = 'Anche questa è in parte conseguenza: combattere nella metà campo nemica è più facile quando si sta già vincendo.';
  }

  campo.innerHTML = zone + fondo + sopra;
  document.getElementById('come').innerHTML = come + (nota ? '<div class="attenzione">' + nota + '</div>' : '');

  var w = u.giocate ? u.w / u.giocate : 0;
  var testa = '<table><tr><td>partite' + (M.specchio ? ' ' + ZONA[u.zona] : '') + '</td><td class="n">' + u.giocate + '</td></tr>' +
    '<tr><td>' + chi + ' vince</td><td class="n">' + pc(w) + '</td></tr>' +
    '<tr><td>scarto medio di punti</td><td class="n">' + (u.vp >= 0 ? '+' : '') + u.vp + '</td></tr>';
  if (u.vive){
    testa += '<tr><td>arriva alla fine</td><td class="n">' + pc(u.vive.n / u.giocate) + '</td></tr>' +
      '<tr><td>vince quando arriva alla fine</td><td class="n">' + (u.vive.n ? pc(u.vive.w / u.vive.n) + ' (' + u.vive.n + ')' : '—') + '</td></tr>' +
      '<tr><td>vince quando muore o fugge</td><td class="n">' + (u.morte.n ? pc(u.morte.w / u.morte.n) + ' (' + u.morte.n + ')' : '—') + '</td></tr>';
  }
  document.getElementById('numeri').innerHTML = testa + '</table>' + (righe ? '<label>I posti, dal migliore</label>' + righe : '');
}
disegna();
</script>
</html>`;
}
