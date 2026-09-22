/* Schieramento Old World — la mappa di cento partite
 *
 * `partita.mjs --partite N --heatmap mappa.html` gioca N partite e,
 * invece di guardarne una, le guarda tutte insieme: per ogni unita',
 *
 *   SCHIERAMENTO  in quale posto e' partita, e quante partite ha vinto
 *                 la sua parte quando e' partita da li';
 *   MOVIMENTO     dove passa i turni quando la sua parte vince, e dove
 *                 quando perde — la differenza e' la strada buona;
 *   SCONTRI       dove combatte, e come va quando combatte li'; dove
 *                 muore.
 *
 * Il colore non dice «qui si vince»: dice «qui si vince PIU' (o meno)
 * del solito». Se gli Skaven vincono nove partite su dieci, un posto
 * all'ottanta per cento e' un posto cattivo, e la mappa lo deve far
 * vedere rosso e non verde.
 *
 * Due cose che la pagina scrive in chiaro, perche' chi la legge non le
 * dimentichi: il meglio e' il meglio PER L'EURISTICA, non per un
 * giocatore bravo; e ogni numero porta quante partite ci stanno dietro,
 * perche' un 100% su tre partite non e' un verdetto.
 *
 * Qui dentro non si tira un dado: entra lo stato della partita a ogni
 * passo, esce un mucchio di conteggi e una pagina sola, senza rete.
 */

const MM = 25.4;
/* le caselle del movimento e degli scontri: tre pollici, sedici per
   dodici su un tavolo da 48×36 — abbastanza per vedere un fianco, non
   cosi' fini da restare vuote con cento partite */
const CASELLA = 3 * MM;
const COLONNE = ["sinistra", "centro-sinistra", "centro", "centro-destra", "destra"];

export function raccoglitore({ AR, FM }){
  const unita = new Map();          // uid -> i conteggi di tutte le partite
  const terreni = new Set();        // per dire se il terreno cambiava da una partita all'altra
  let W = 0, H = 0, cols = 0, rows = 0;
  let partite = 0, vinte = { A: 0, B: 0 };
  let meta = null;
  let g = null;                     // la partita in corso

  const cella = (x, y) => {
    const c = Math.min(cols - 1, Math.max(0, Math.floor(x / CASELLA)));
    const r = Math.min(rows - 1, Math.max(0, Math.floor(y / CASELLA)));
    return r * cols + c;
  };
  const scheda = u => {
    let s = unita.get(u.uid);
    if (!s){
      s = { uid: u.uid, n: u.name, a: u.army, giocate: 0, w: 0, l: 0,
            vive: { n: 0, w: 0 }, morte: { n: 0, w: 0 },
            posti: new Map(),
            mov: { w: new Float64Array(cols * rows), l: new Float64Array(cols * rows) },
            lotta: { w: new Float64Array(cols * rows), l: new Float64Array(cols * rows) },
            fine: new Float64Array(cols * rows) };
      unita.set(u.uid, s);
    }
    return s;
  };
  /* dove sta un'unita': un personaggio unito sta dentro il suo
     reggimento, e la sua posizione e' quella del reggimento */
  const dove = (S, u) => {
    const h = FM.joinedHost(u);
    const o = h != null ? S.units.find(x => x.uid === h) || u : u;
    if (!o.placed || o.dead) return null;
    const b = AR.boxOf(o, S.units);
    return { x: b.x, y: b.y, o };
  };

  return {
    nuova(S){
      if (!W){
        W = S.table.w; H = S.table.h;
        cols = Math.ceil(W / CASELLA); rows = Math.ceil(H / CASELLA);
      }
      terreni.add(JSON.stringify(S.terrain.map(t => [t.kind, Math.round(t.x), Math.round(t.y), Math.round(t.rot || 0)])));
      if (!meta) meta = {
        w: W, h: H,
        terreno: S.terrain.map(t => ({ x: t.x, y: t.y, w: t.w, h: t.h, rot: t.rot, kind: t.kind, label: t.label })),
        zone: [...(S.zones.A || []).map(z => ({ ...z, army: 'A' })), ...(S.zones.B || []).map(z => ({ ...z, army: 'B' }))],
        nomi: { ...S.nomi },
      };
      g = { chiave: '', posto: new Map(), ultimo: new Map(), mov: new Map(), lotta: new Map() };
    },

    /* dopo ogni mossa: lo schieramento quando finisce, poi una
       fotografia all'inizio di ogni mezzo turno */
    passo(S){
      if (!g || S.schierando) return;
      const k = S.turno + ':' + S.army;
      if (k === g.chiave) return;
      const prima = !g.chiave;
      g.chiave = k;
      for (const u of S.units){
        const p = dove(S, u);
        if (!p) continue;
        if (prima) g.posto.set(u.uid, [Math.round(p.x), Math.round(p.y)]);
        g.ultimo.set(u.uid, p);
        const c = cella(p.x, p.y);
        (g.mov.get(u.uid) || g.mov.set(u.uid, []).get(u.uid)).push(c);
        if (AR.ingaggiata(S, p.o)) (g.lotta.get(u.uid) || g.lotta.set(u.uid, []).get(u.uid)).push(c);
      }
    },

    fine(S, esito){
      if (!g) return;
      partite++;
      const vince = esito && esito.winner;
      if (vince) vinte[vince]++;
      for (const u of S.units){
        const s = scheda(u);
        s.giocate++;
        const w = vince === u.army, l = vince && vince !== u.army;
        if (w) s.w++; if (l) s.l++;
        const viva = !u.dead && u.placed && !u.fled;
        const esiti = viva ? s.vive : s.morte;
        esiti.n++; if (w) esiti.w++;
        const pp = g.posto.get(u.uid);
        if (pp){
          const key = pp.join(',');
          const e = s.posti.get(key) || { x: pp[0], y: pp[1], n: 0, w: 0, vp: 0 };
          e.n++; if (w) e.w++;
          e.vp += esito ? (u.army === 'A' ? esito.A - esito.B : esito.B - esito.A) : 0;
          s.posti.set(key, e);
        }
        if (w || l){
          const dest = w ? 'w' : 'l';
          for (const c of g.mov.get(u.uid) || []) s.mov[dest][c]++;
          for (const c of g.lotta.get(u.uid) || []) s.lotta[dest][c]++;
        }
        if (!viva){
          const p = g.ultimo.get(u.uid);
          if (p) s.fine[cella(p.x, p.y)]++;
        }
      }
      g = null;
    },

    /* quello che va nella pagina: numeri tondi e niente Map */
    dati(){
      const zonaDi = a => (meta.zone.find(z => z.army === a) || null);
      const lista = [...unita.values()].map(s => {
        const z = zonaDi(s.a);
        const posti = [...s.posti.values()];
        /* il nome del posto come lo dice l'euristica: la colonna, e la
           fila contata dal fronte */
        const file = [...new Set(posti.map(p => p.y))]
          .sort((p, q) => s.a === 'A' ? q - p : p - q);
        for (const p of posti){
          const col = z ? Math.min(4, Math.max(0, Math.floor((p.x - z.x) / z.w * 5))) : 2;
          const fila = file.indexOf(p.y);
          p.dove = COLONNE[col] + (file.length > 1 ? `, ${fila + 1}ª fila` : '');
        }
        const arr = f => Array.from(f, v => Math.round(v));
        return { uid: s.uid, n: s.n, a: s.a, giocate: s.giocate, w: s.w, l: s.l,
                 vive: s.vive, morte: s.morte, posti,
                 mov: { w: arr(s.mov.w), l: arr(s.mov.l) },
                 lotta: { w: arr(s.lotta.w), l: arr(s.lotta.l) },
                 fine: arr(s.fine) };
      });
      /* i nomi doppi («Orc Mobs» due volte) prendono un numero */
      const quanti = new Map();
      for (const u of lista) quanti.set(u.a + u.n, (quanti.get(u.a + u.n) || 0) + 1);
      const visti = new Map();
      for (const u of lista) if (quanti.get(u.a + u.n) > 1){
        const k = (visti.get(u.a + u.n) || 0) + 1;
        visti.set(u.a + u.n, k);
        u.n += ' ' + k;
      }
      return { meta: { ...meta, cols, rows, casella: CASELLA, partite, vinte, terreniDiversi: terreni.size },
               unita: lista };
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
  .schermo{ display:grid; grid-template-columns:minmax(0,1fr) 360px; }
  @media (max-width:900px){ .schermo{ grid-template-columns:1fr; } }
  .tavolo{ padding:12px 14px; min-width:0; }
  svg{ width:100%; height:auto; background:${cT}; border:1px solid var(--linea); border-radius:6px; display:block; }
  .pannello{ border-left:1px solid var(--linea); background:var(--carta); padding:12px 16px; }
  @media (max-width:900px){ .pannello{ border-left:0; border-top:1px solid var(--linea); } }
  label{ display:block; font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--muto); margin:10px 0 4px; }
  select{ width:100%; font:inherit; padding:5px 6px; border:1px solid var(--linea); border-radius:5px;
          background:var(--sfondo); color:inherit; }
  .modi{ display:flex; gap:4px; }
  .modi button{ flex:1; font:inherit; font-size:14px; padding:5px 4px; border:1px solid var(--linea);
                background:var(--sfondo); color:inherit; border-radius:5px; cursor:pointer; }
  .modi button[aria-pressed=true]{ background:var(--testo); color:var(--carta); }
  .come{ font-size:13px; color:var(--muto); margin:10px 0; }
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
    <div class="scala"><span id="scala-sx">peggio del solito</span><i></i><span id="scala-dx">meglio del solito</span></div>
  </div>
  <div class="pannello">
    <label for="chi">Unità</label>
    <select id="chi"></select>
    <label>Mappa</label>
    <div class="modi" role="group">
      <button data-modo="posti" aria-pressed="true">Schieramento</button>
      <button data-modo="mov" aria-pressed="false">Movimento</button>
      <button data-modo="lotta" aria-pressed="false">Scontri</button>
    </div>
    <p class="come" id="come"></p>
    <div id="numeri"></div>
  </div>
</div>

<footer>Il meglio che si legge qui è il meglio per l'euristica di questa app, che gioca con poche regole di buon senso:
  un giocatore vero può fare meglio da un posto che qui perde. Ogni percentuale porta fra parentesi quante partite ci sono dietro,
  e l'intervallo al 95% dice quanto può essere solo fortuna.</footer>

<script>
var P = ${json};
var M = P.meta;
var campo = document.getElementById('campo');
var esc = function(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
var pc = function(x){ return Math.round(x * 100) + '%'; };
var wilson = function(k, n){
  if (!n) return '';
  var z = 1.96, p = k / n, d = 1 + z * z / n;
  var c = (p + z * z / (2 * n)) / d, m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return Math.max(0, Math.round(100 * (c - m))) + '–' + Math.min(100, Math.round(100 * (c + m))) + '%';
};
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

/* le scelte: ogni unità, e tutte quelle di una parte insieme */
var sel = document.getElementById('chi');
['A', 'B'].forEach(function(a){
  var og = document.createElement('optgroup');
  og.label = a + ' · ' + M.nomi[a];
  var tutte = document.createElement('option');
  tutte.value = 'tutte:' + a; tutte.textContent = 'tutte le unità di ' + M.nomi[a];
  og.appendChild(tutte);
  P.unita.filter(function(u){ return u.a === a; }).forEach(function(u){
    var o = document.createElement('option');
    o.value = String(u.uid); o.textContent = u.n;
    og.appendChild(o);
  });
  sel.appendChild(og);
});
sel.selectedIndex = 1;

/* «tutte le unità» è la somma delle schede */
function scelta(){
  var v = sel.value;
  if (v.indexOf('tutte:') !== 0) return P.unita.find(function(u){ return String(u.uid) === v; });
  var a = v.slice(6), us = P.unita.filter(function(u){ return u.a === a; });
  var somma = function(k, s){ return us[0][k][s].map(function(_, i){ return us.reduce(function(t, u){ return t + u[k][s][i]; }, 0); }); };
  var posti = {};
  us.forEach(function(u){ u.posti.forEach(function(p){
    var k = p.x + ',' + p.y, e = posti[k] || (posti[k] = { x: p.x, y: p.y, n: 0, w: 0, vp: 0, dove: p.dove });
    e.n += p.n; e.w += p.w; e.vp += p.vp;
  }); });
  return { tutte: true, n: 'tutte le unità di ' + M.nomi[a], a: a,
           giocate: M.partite, w: M.vinte[a], l: M.vinte[a === 'A' ? 'B' : 'A'],
           vive: null, morte: null,
           posti: Object.keys(posti).map(function(k){ return posti[k]; }),
           mov: { w: somma('mov', 'w'), l: somma('mov', 'l') },
           lotta: { w: somma('lotta', 'w'), l: somma('lotta', 'l') },
           fine: us[0].fine.map(function(_, i){ return us.reduce(function(t, u){ return t + u.fine[i]; }, 0); }) };
}

var modo = 'posti';
document.querySelectorAll('.modi button').forEach(function(b){
  b.onclick = function(){
    modo = b.dataset.modo;
    document.querySelectorAll('.modi button').forEach(function(x){ x.setAttribute('aria-pressed', String(x === b)); });
    disegna();
  };
});
sel.onchange = disegna;

var rett = function(i, colore, alfa, titolo){
  var c = i % M.cols, r = Math.floor(i / M.cols);
  return '<rect x="' + c * M.casella + '" y="' + r * M.casella + '" width="' + M.casella + '" height="' + M.casella +
    '" fill="' + colore + '" fill-opacity="' + alfa.toFixed(2) + '"><title>' + esc(titolo) + '</title></rect>';
};

function disegna(){
  var u = scelta();
  var base = u.giocate ? u.w / u.giocate : 0;       // quanto vince di solito la sua parte
  var sopra = '', come = '', righe = '';
  document.getElementById('scala-sx').textContent = 'peggio del solito';
  document.getElementById('scala-dx').textContent = 'meglio del solito';

  if (modo === 'posti'){
    var maxN = Math.max.apply(null, u.posti.map(function(p){ return p.n; }).concat([1]));
    var ord = u.posti.slice().sort(function(p, q){ return (q.w / q.n) - (p.w / p.n) || q.n - p.n; });
    sopra = ord.slice().reverse().map(function(p){
      var t = (p.w / p.n - base) / 0.3;
      var r = 10 + 20 * Math.sqrt(p.n / maxN);
      return '<g><circle cx="' + p.x + '" cy="' + p.y + '" r="' + r.toFixed(1) + '" fill="' + mescola(t) +
        '" stroke="' + (u.a === 'A' ? 'var(--A)' : 'var(--B)') + '" stroke-width="4"><title>' + esc(p.dove) + ': ' +
        pc(p.w / p.n) + ' su ' + p.n + ' partite</title></circle>' +
        '<text class="nome piccolo" x="' + p.x + '" y="' + (p.y + 5) + '" text-anchor="middle">' + pc(p.w / p.n) + ' · ' + p.n + '</text></g>';
    }).join('');
    come = 'Ogni cerchio è un posto da cui ' + esc(u.n) + ' è partita. Il numero è quante partite ha vinto ' +
      esc(M.nomi[u.a]) + ' quando è partita da lì, e quante sono; il cerchio è più grande dove è partita più spesso. ' +
      'Verde vuol dire meglio del solito (' + pc(base) + '), rosso peggio.';
    righe = '<table><tr><th>posto</th><th class="n">vince</th><th class="n">95%</th><th class="n">punti ±</th></tr>' +
      ord.map(function(p){ return '<tr><td>' + esc(p.dove) + '</td><td class="n">' + pc(p.w / p.n) + ' (' + p.n + ')</td><td class="n">' +
        wilson(p.w, p.n) + '</td><td class="n">' + (p.vp / p.n >= 0 ? '+' : '') + Math.round(p.vp / p.n) + '</td></tr>'; }).join('') + '</table>';
    if (u.posti.length === 1) righe += '<p class="come">Un posto solo: senza <b>--estro</b> l’euristica schiera sempre uguale, e non c’è niente da confrontare.</p>';
  }

  if (modo === 'mov'){
    if (!u.w || !u.l){
      /* senza vittorie o senza sconfitte non c'è differenza da fare: si
         mostra solo dove sta */
      var tot = u.mov.w.map(function(v, i){ return v + u.mov.l[i]; });
      var mx = Math.max.apply(null, tot.concat([1]));
      sopra = tot.map(function(v, i){ return v ? rett(i, '#6b5b3e', 0.15 + 0.6 * v / mx, v + ' mezzi turni qui') : ''; }).join('');
      come = esc(M.nomi[u.a]) + (u.w ? ' non ha mai perso' : ' non ha mai vinto') +
        ': non c’è una differenza da mostrare, solo dove ' + esc(u.n) + ' passa i turni (più scuro, più spesso).';
    } else {
      var d = u.mov.w.map(function(v, i){ return v / u.w - u.mov.l[i] / u.l; });
      var pres = u.mov.w.map(function(v, i){ return v / u.w + u.mov.l[i] / u.l; });
      var mxd = Math.max.apply(null, d.map(Math.abs).concat([0.01]));
      var mxp = Math.max.apply(null, pres.concat([0.01]));
      sopra = d.map(function(v, i){
        if (!pres[i]) return '';
        return rett(i, mescola(v / mxd), 0.25 + 0.6 * Math.sqrt(pres[i] / mxp),
          (v >= 0 ? 'più' : 'meno') + ' presente quando vince: ' + (u.mov.w[i] / u.w).toFixed(2) + ' contro ' +
          (u.mov.l[i] / u.l).toFixed(2) + ' mezzi turni a partita');
      }).join('');
      come = 'Dove passa i turni ' + esc(u.n) + ': verde dove sta di più nelle partite che ' + esc(M.nomi[u.a]) +
        ' vince, rosso dove sta di più in quelle che perde. Più pieno il colore, più spesso ci passa. ' +
        'Una casella è tre pollici; si conta all’inizio di ogni mezzo turno.';
      document.getElementById('scala-sx').textContent = 'quando perde';
      document.getElementById('scala-dx').textContent = 'quando vince';
    }
  }

  if (modo === 'lotta'){
    var n = u.lotta.w.map(function(v, i){ return v + u.lotta.l[i]; });
    var mxn = Math.max.apply(null, n.concat([1]));
    sopra = n.map(function(v, i){
      if (!v) return '';
      var q = u.lotta.w[i] / v;
      return rett(i, mescola((q - base) / 0.3), 0.3 + 0.6 * Math.sqrt(v / mxn),
        'combatte qui ' + v + ' mezzi turni; la sua parte vince il ' + pc(q) + ' di quelle partite');
    }).join('');
    var mxf = Math.max.apply(null, u.fine.concat([1]));
    sopra += u.fine.map(function(v, i){
      if (!v) return '';
      var c = i % M.cols, r = Math.floor(i / M.cols), s = 8 + 18 * Math.sqrt(v / mxf);
      var cx = (c + 0.5) * M.casella, cy = (r + 0.5) * M.casella;
      return '<g stroke="#1d1b18" stroke-width="5" stroke-linecap="round"><title>finisce qui ' + v + ' volte</title>' +
        '<line x1="' + (cx - s) + '" y1="' + (cy - s) + '" x2="' + (cx + s) + '" y2="' + (cy + s) + '"/>' +
        '<line x1="' + (cx - s) + '" y1="' + (cy + s) + '" x2="' + (cx + s) + '" y2="' + (cy - s) + '"/></g>';
    }).join('');
    come = 'Dove combatte ' + esc(u.n) + ': il colore dice come vanno le partite in cui combatte lì rispetto al solito (' +
      pc(base) + '), più pieno dove combatte più spesso. La croce è dove l’hanno vista l’ultima volta le partite in cui ' +
      'è morta o fuggita.';
  }

  campo.innerHTML = zone + fondo + sopra;
  document.getElementById('come').innerHTML = come;

  var testa = '<table><tr><td>partite</td><td class="n">' + u.giocate + '</td></tr>' +
    '<tr><td>' + esc(M.nomi[u.a]) + ' vince</td><td class="n">' + pc(base) + ' (' + wilson(u.w, u.giocate) + ')</td></tr>';
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
