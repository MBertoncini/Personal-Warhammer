/* Schieramento Old World — gli effetti sul tavolo
 *
 * Frecce che volano, palle di cannone, fulmini, incantesimi, scintille
 * della mischia, la polvere di una carica e il numero rosso di chi cade.
 * Nascevano dentro la pagina della partita da rivedere (`replay.js`), e
 * il tavolo dal vivo — la sfida, AI contro AI, la partita al tavolo —
 * restava muto: i pezzi saltavano da un posto all'altro e i morti
 * sparivano senza che nessuno lo vedesse. Adesso il motore e' uno solo,
 * e lo usano tutti e due.
 *
 * Per questo la funzione e' scritta in un modo un po' strano: non tocca
 * niente fuori da se', perche' la pagina da rivedere la copia cosi'
 * com'e' dentro il suo <script> (`motoreFx.toString()`), dove gli import
 * non ci sono. Riceve lo strato SVG su cui disegnare e due domande:
 *
 *   strato   il <g> degli effetti, sopra i pezzi
 *   tipoDi   id -> tipo di truppa ("monstrousCreature", …): le bestie graffiano
 *   colore   esercito -> colore, per la scia di chi marcia e il fantasma di chi muore
 *   attivo   () -> false quando gli effetti sono spenti
 *
 * e lavora sui fotogrammi di `RP.fotogramma`: le unita' con centro,
 * misure e rotazione in millimetri, e le righe nuove del registro con i
 * loro `fx`. L'animazione non decide niente — i dadi sono gia' caduti —
 * e chi ha chiesto meno movimento al sistema operativo non la vede.
 */

export function motoreFx({ strato, tipoDi = () => '', colore = a => a === 'B' ? '#2a6fb0' : '#c0392b', attivo = () => true } = {}){
  const NS = 'http://www.w3.org/2000/svg';
  const MM = 25.4;
  const quieto = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* i gradienti e il bagliore: chi usa il motore li mette nei suoi <defs> */
  const DEFS =
    '<radialGradient id="gr-fuoco"><stop offset="0" stop-color="#fffbe0"/><stop offset=".35" stop-color="#ffd23f"/>' +
    '<stop offset=".7" stop-color="#ff7a1a"/><stop offset="1" stop-color="#d4380d" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="gr-scoppio"><stop offset="0" stop-color="#fff6c8"/><stop offset=".4" stop-color="#ff9a1f" stop-opacity=".9"/>' +
    '<stop offset="1" stop-color="#b3200c" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="gr-ombra"><stop offset="0" stop-color="#f1d9ff"/><stop offset=".4" stop-color="#9b5cff"/>' +
    '<stop offset="1" stop-color="#3b0f6e" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="gr-verde"><stop offset="0" stop-color="#f3ffe0"/><stop offset=".4" stop-color="#7cff4f"/>' +
    '<stop offset="1" stop-color="#1f6b12" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="gr-azzurro"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#6fc3ff"/>' +
    '<stop offset="1" stop-color="#1b4f8a" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="gr-polvere"><stop offset="0" stop-color="#b09a78" stop-opacity=".7"/>' +
    '<stop offset="1" stop-color="#8a775a" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="gr-sangue"><stop offset="0" stop-color="#ff6a5a" stop-opacity=".9"/>' +
    '<stop offset=".5" stop-color="#c0261b" stop-opacity=".6"/><stop offset="1" stop-color="#6e0d08" stop-opacity="0"/></radialGradient>' +
    '<filter id="fl-bagliore" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/>' +
    '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';

  /* dove sta un pezzo in un fotogramma: un personaggio dentro un
     reggimento sta dove sta il reggimento */
  const posDi = (f, id) => {
    if (!f) return null;
    const u = f.unita.find(x => x.id === id);
    if (u) return u;
    const host = f.ospiti && f.ospiti[id];
    return host != null ? f.unita.find(x => x.id === host) || null : null;
  };

  let turnoFx = 0;
  const pulisciFx = () => { turnoFx++; strato.textContent = ''; };
  function el(tag, attrs, padre = strato){
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    padre.appendChild(e);
    return e;
  }
  /* un'animazione: `passo` riceve il tempo da 0 a 1. Se la scheda non
     disegna (e' nascosta, o la finestra e' ridotta) i fotogrammi del
     browser non arrivano: un timer la chiude lo stesso, e niente resta
     appeso sul tavolo a meta' volo. */
  function tween(ms, passo, fine){
    const mio = turnoFx, t0 = performance.now();
    let finita = false;
    const chiudi = () => { if (finita || mio !== turnoFx) return; finita = true; passo(1); if (fine) fine(); };
    const f = now => {
      if (finita || mio !== turnoFx) return;
      const t = Math.min(1, (now - t0) / ms);
      if (t >= 1) return chiudi();
      passo(t);
      requestAnimationFrame(f);
    };
    passo(0);
    requestAnimationFrame(f);
    setTimeout(chiudi, ms + 250);
  }
  const dopo = (ms, fn) => { const mio = turnoFx; setTimeout(() => { if (mio === turnoFx) fn(); }, ms); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - (1 - t) * (1 - t);
  const easeIn = t => t * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const svanisci = (e, ms, da = 1) => tween(ms, t => e.setAttribute('opacity', da * (1 - t)), () => e.remove());

  /* un punto sul bordo del pezzo, dalla parte di chi guarda */
  function bordo(u, verso){
    const dx = verso[0] - u.x, dy = verso[1] - u.y, L = Math.hypot(dx, dy) || 1;
    const a = -u.r * Math.PI / 180;
    const lx = (dx * Math.cos(a) - dy * Math.sin(a)) / L, ly = (dx * Math.sin(a) + dy * Math.cos(a)) / L;
    const k = Math.min(Math.abs(lx) > 1e-6 ? u.w / 2 / Math.abs(lx) : 1e9, Math.abs(ly) > 1e-6 ? u.h / 2 / Math.abs(ly) : 1e9);
    return [u.x + dx / L * k, u.y + dy / L * k];
  }
  /* un punto a caso dentro il pezzo: dove cade la freccia */
  function dentro(u, quanto = .38){
    const lx = rnd(-quanto, quanto) * u.w, ly = rnd(-quanto, quanto) * u.h, a = u.r * Math.PI / 180;
    return [u.x + lx * Math.cos(a) - ly * Math.sin(a), u.y + lx * Math.sin(a) + ly * Math.cos(a)];
  }

  /* ---- i pezzi di un effetto ---- */
  function scintille(p, { n = 7, col = '#ffd23f', r = 22, ms = 380, w = 2.5 } = {}){
    for (let k = 0; k < n; k++){
      const a = rnd(0, Math.PI * 2), l = rnd(r * .5, r);
      const e = el('line', { x1: p[0], y1: p[1], x2: p[0], y2: p[1], stroke: col, 'stroke-width': w, 'stroke-linecap': 'round' });
      tween(ms, t => {
        const q = easeOut(t);
        e.setAttribute('x1', p[0] + Math.cos(a) * l * q * .4); e.setAttribute('y1', p[1] + Math.sin(a) * l * q * .4);
        e.setAttribute('x2', p[0] + Math.cos(a) * l * q); e.setAttribute('y2', p[1] + Math.sin(a) * l * q);
        e.setAttribute('opacity', 1 - t);
      }, () => e.remove());
    }
  }
  function onda(p, { r = 50, col = '#fff', ms = 600, w = 4 } = {}){
    const e = el('circle', { cx: p[0], cy: p[1], r: 1, fill: 'none', stroke: col, 'stroke-width': w });
    tween(ms, t => { e.setAttribute('r', 1 + r * easeOut(t)); e.setAttribute('opacity', 1 - t); }, () => e.remove());
  }
  function scoppio(p, { r = 40, grad = 'gr-scoppio', ms = 650 } = {}){
    const e = el('circle', { cx: p[0], cy: p[1], r: 1, fill: 'url(#' + grad + ')' });
    tween(ms, t => { e.setAttribute('r', 2 + r * easeOut(Math.min(1, t * 1.6))); e.setAttribute('opacity', t < .4 ? 1 : 1 - (t - .4) / .6); }, () => e.remove());
  }
  function fumo(p, { n = 4, r = 18, ms = 1100, col = '#9a9384' } = {}){
    for (let k = 0; k < n; k++){
      const dx = rnd(-10, 10), dy = rnd(-14, -2), e = el('circle', { cx: p[0], cy: p[1], r: 3, fill: col, opacity: .55 });
      tween(ms, t => {
        e.setAttribute('cx', p[0] + dx * t * 2); e.setAttribute('cy', p[1] + dy * t * 2);
        e.setAttribute('r', 3 + r * easeOut(t)); e.setAttribute('opacity', .55 * (1 - t));
      }, () => e.remove());
    }
  }
  function polvere(p, { r = 28, ms = 700 } = {}){
    const e = el('circle', { cx: p[0], cy: p[1], r: 2, fill: 'url(#gr-polvere)' });
    tween(ms, t => { e.setAttribute('r', 2 + r * easeOut(t)); e.setAttribute('opacity', 1 - t); }, () => e.remove());
  }
  function scritta(p, testo, { col = '#fff', ms = 1100, size = 34 } = {}){
    const e = el('text', { x: p[0], y: p[1], 'text-anchor': 'middle', class: 'fxt', fill: col, 'font-size': size, 'stroke-width': 6 });
    e.textContent = testo;
    tween(ms, t => {
      e.setAttribute('y', p[1] - 30 * easeOut(t));
      const s = t < .15 ? .6 + t / .15 * .6 : 1.2 - Math.min(.2, (t - .15));
      e.setAttribute('font-size', size * s);
      e.setAttribute('opacity', t < .7 ? 1 : 1 - (t - .7) / .3);
    }, () => e.remove());
  }
  /* un proiettile che vola: `forma` e' il disegno, orientato lungo +x;
     `arco` lo alza (visto dall'alto: cresce e la sua ombra resta a terra) */
  function volo(da, a, { ms = 600, arco = 0, forma, scia = null, ombra = false, fine = null }){
    const g = el('g', {});
    const om = ombra ? el('ellipse', { rx: 7, ry: 3.5, fill: '#000', opacity: .25 }, g) : null;
    const corpo = el('g', {}, g);
    corpo.innerHTML = forma;
    const ang = Math.atan2(a[1] - da[1], a[0] - da[0]) * 180 / Math.PI;
    let ultimo = 0;
    tween(ms, t => {
      const x = lerp(da[0], a[0], t), y = lerp(da[1], a[1], t);
      const alto = Math.sin(Math.PI * t) * arco;
      if (om){ om.setAttribute('cx', x); om.setAttribute('cy', y); }
      /* l'altezza si vede come un passo verso l'alto e una scala piu' grande */
      const tilt = arco ? Math.atan2(-Math.cos(Math.PI * t) * arco * Math.PI / 60, 1) * 180 / Math.PI * .6 : 0;
      corpo.setAttribute('transform', 'translate(' + x + ',' + (y - alto * .6) + ') rotate(' + (ang + tilt * Math.sign(Math.cos(ang * Math.PI / 180) || 1)) + ') scale(' + (1 + alto / 90) + ')');
      if (scia && t - ultimo > .05){ ultimo = t; scia([x, y - alto * .6], t); }
    }, () => { g.remove(); if (fine) fine(a); });
  }

  const FORME_FX = {
    freccia: '<line x1="-16" y1="0" x2="10" y2="0" stroke="#5a3b1c" stroke-width="2.2"/>' +
             '<path d="M9-4L18 0L9 4Z" fill="#555"/><path d="M-16-4L-11 0L-16 4M-12-4L-7 0L-12 4" stroke="#e8e0d0" stroke-width="1.6" fill="none"/>',
    quadrello: '<line x1="-11" y1="0" x2="8" y2="0" stroke="#3b2a18" stroke-width="2.6"/><path d="M7-4L15 0L7 4Z" fill="#444"/>',
    giavellotto: '<line x1="-24" y1="0" x2="14" y2="0" stroke="#6b4a26" stroke-width="3"/><path d="M13-5L25 0L13 5Z" fill="#666"/>',
    dardone: '<line x1="-34" y1="0" x2="20" y2="0" stroke="#4a3219" stroke-width="5"/><path d="M18-8L36 0L18 8Z" fill="#555"/>' +
             '<path d="M-34-7L-26 0L-34 7" stroke="#bbb" stroke-width="2.5" fill="none"/>',
    pallottola: '<line x1="-26" y1="0" x2="4" y2="0" stroke="#fff3b0" stroke-width="3" stroke-linecap="round" opacity=".85"/><circle r="3" fill="#fff"/>',
    palla: '<circle r="7" fill="#1d1d1d"/><circle cx="-2" cy="-2" r="2.4" fill="#777"/>',
    masso: '<circle r="12" fill="#8c8478"/><circle cx="-3" cy="-4" r="5" fill="#b8b0a2"/><circle cx="4" cy="3" r="3" fill="#5f584e"/>',
    fuoco: '<circle r="13" fill="url(#gr-fuoco)"/>',
    ombra: '<circle r="10" fill="url(#gr-ombra)"/>',
    verde: '<circle r="12" fill="url(#gr-verde)"/>',
    azzurro: '<circle r="10" fill="url(#gr-azzurro)"/>',
  };

  /* che arma e': dal nome, come la chiama la lista */
  function armaDi(nome){
    const n = String(nome || '').toLowerCase();
    if (/lightning|fulmin/.test(n)) return 'fulmine';
    if (/breath|soffio|flame|fiamm|fire|burn|lanciafiamme|warpfire/.test(n)) return 'fiamma';
    if (/cannon|cannone/.test(n)) return 'palla';
    if (/stone|rock|catapult|lobber|trebuchet|diver|mortar|mortaio|lanciapietre|plague claw|globe/.test(n)) return 'masso';
    if (/bolt thrower|chukka|lanciadardi|scorpion|repeater bolt/.test(n)) return 'dardone';
    if (/jezzail|gun|pistol|rifle|musket|blunderbuss|warplock|ratling|archibug|schioppo|moschett/.test(n)) return 'pallottola';
    if (/crossbow|balestra/.test(n)) return 'quadrello';
    if (/javelin|spear|throwing|giavell|lancia|axe|ascia|star|blowpipe|cerbottana|dart/.test(n)) return /blowpipe|cerbottana|dart/.test(n) ? 'quadrello' : 'giavellotto';
    return 'freccia';
  }
  /* che magia e': il colore dal nome, la forma dal tipo */
  function stileMagia(nome, tipo){
    const n = String(nome || '').toLowerCase();
    let col = 'azzurro';
    if (/fire|fiery|flam|burn|sun|pillar|incinerat|fuoco/.test(n)) col = 'fuoco';
    else if (/lightning|storm|tempest|thunder|warp|fulmin/.test(n)) col = 'fulmine';
    else if (/gork|mork|waaagh|'ere we go|green|bad moon/.test(n)) col = 'verde';
    else if (/oak|earth|rampart|leaf|life|shield|saphery|robe/.test(n)) col = 'oro';
    else if (/wind|blast|gust|air|vento/.test(n)) col = 'vento';
    else if (/summon|daemon|dark|doom|death|soul|spirit|shadow|corrupt|pain|curse|spectral|unquiet|gathering|chaos|vessel|vigour|leech|years|cabal|lust/.test(n)) col = 'ombra';
    return { col, tipo: tipo || 'missile' };
  }
  const TINTA = { fuoco: '#ff8a1f', fulmine: '#8dff5a', verde: '#7cff4f', oro: '#ffd86b', vento: '#e8f4ff', ombra: '#b07bff', azzurro: '#6fc3ff' };

  /* ---- gli effetti veri ---- */
  function tiroFx(fx, f, prima){
    const da = posDi(f, fx.da) || posDi(prima, fx.da), su = posDi(f, fx.su) || posDi(prima, fx.su);
    if (!da || !su) return 0;
    const tipo = armaDi(fx.arma);
    const n = Math.max(1, Math.min(8, fx.tiri || 4));
    const partenza = bordo(da, [su.x, su.y]);
    const L = Math.hypot(su.x - partenza[0], su.y - partenza[1]);
    if (tipo === 'fiamma'){
      const bersaglio = bordo(su, partenza);
      for (let k = 0; k < 26; k++) dopo(k * 22, () => {
        const a = [bersaglio[0] + rnd(-su.w / 3, su.w / 3), bersaglio[1] + rnd(-su.h / 3, su.h / 3)];
        const e = el('circle', { cx: partenza[0], cy: partenza[1], r: 5, fill: 'url(#gr-fuoco)' });
        tween(520, t => {
          e.setAttribute('cx', lerp(partenza[0], a[0], t)); e.setAttribute('cy', lerp(partenza[1], a[1], t));
          e.setAttribute('r', 5 + 16 * t); e.setAttribute('opacity', 1 - t * t);
        }, () => e.remove());
      });
      dopo(500, () => fumo([su.x, su.y], { n: 3 }));
      return 1100;
    }
    for (let k = 0; k < n; k++){
      const ritardo = k * (tipo === 'pallottola' ? 160 : tipo === 'freccia' ? 70 : 130);
      const a = dentro(su);
      dopo(ritardo, () => {
        const p0 = [partenza[0] + rnd(-6, 6), partenza[1] + rnd(-6, 6)];
        if (tipo === 'pallottola'){
          scoppio(p0, { r: 16, ms: 220 }); fumo(p0, { n: 2, r: 14 });
          volo(p0, a, { ms: Math.max(140, L * .22), forma: FORME_FX.pallottola, fine: q => scintille(q, { n: 5, r: 14, col: '#fff3b0' }) });
        } else if (tipo === 'palla'){
          scoppio(p0, { r: 26, ms: 280 }); fumo(p0, { n: 5, r: 24 });
          volo(p0, a, { ms: Math.max(260, L * .35), forma: FORME_FX.palla, ombra: true, arco: 10,
                        scia: (q, t) => { if (t > .55 && Math.random() < .5) polvere(q, { r: 14, ms: 500 }); },
                        fine: q => { polvere(q, { r: 36 }); scintille(q, { col: '#6b5a44', n: 8 }); } });
        } else if (tipo === 'masso'){
          fumo(p0, { n: 2 });
          volo(p0, a, { ms: Math.max(700, L * .9), forma: FORME_FX.masso, ombra: true, arco: 70,
                        fine: q => { onda(q, { r: 60, col: '#8a775a', w: 6 }); polvere(q, { r: 55, ms: 900 }); scintille(q, { col: '#7d6b52', n: 10, r: 34 }); } });
        } else {
          const ms = { freccia: Math.max(420, L * .75), giavellotto: Math.max(420, L * .8), quadrello: Math.max(260, L * .4), dardone: Math.max(300, L * .35) }[tipo] || 500;
          const arco = { freccia: 28, giavellotto: 16, quadrello: 4, dardone: 3 }[tipo] || 0;
          volo(p0, a, { ms, arco, forma: FORME_FX[tipo] || FORME_FX.freccia, ombra: arco > 10,
                        fine: q => scintille(q, { n: 3, r: 10, col: '#e8d9b8', w: 2 }) });
        }
      });
    }
    return n * 120 + 900;
  }

  function fulmineFx(fx, f, prima){
    const [p0, p1] = fx.p || [];
    if (!p0 || !p1) return 0;
    /* il fulmine del Warp Lightning Cannon e' verde; quello di un
       incantesimo porta il colore della sua magia */
    const col = fx.col || '#8dff5a';
    const zig = () => {
      const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), n = Math.max(6, Math.round(L / 28));
      const nx = -(p1[1] - p0[1]) / L, ny = (p1[0] - p0[0]) / L;
      let dd = 'M' + p0[0] + ' ' + p0[1];
      for (let k = 1; k < n; k++){
        const t = k / n, j = rnd(-14, 14);
        dd += 'L' + (lerp(p0[0], p1[0], t) + nx * j) + ' ' + (lerp(p0[1], p1[1], t) + ny * j);
      }
      return dd + 'L' + p1[0] + ' ' + p1[1];
    };
    scoppio(p0, { r: 30, grad: 'gr-verde', ms: 400 });
    for (let k = 0; k < 4; k++) dopo(k * 150, () => {
      const g = el('g', { filter: 'url(#fl-bagliore)' });
      const dd = zig();
      el('path', { d: dd, stroke: col, 'stroke-width': 9, fill: 'none', opacity: .55, 'stroke-linejoin': 'round' }, g);
      el('path', { d: dd, stroke: '#fff', 'stroke-width': 3, fill: 'none', 'stroke-linejoin': 'round' }, g);
      svanisci(g, 260);
    });
    dopo(200, () => { scintille(p1, { col, n: 9, r: 30 }); onda(p1, { r: 40, col }); });
    return 900;
  }

  function sagomaFx(fx, f, prima){
    const da = posDi(f, fx.da) || posDi(prima, fx.da);
    const p = (fx.p || [])[0];
    if (!da || !p) return 0;
    const p0 = bordo(da, p);
    const L = Math.hypot(p[0] - p0[0], p[1] - p0[1]);
    fumo(p0, { n: 3 });
    volo(p0, p, { ms: Math.max(700, L * .9), forma: FORME_FX.masso, ombra: true, arco: 80, fine: q => {
      const c = el('circle', { cx: q[0], cy: q[1], r: fx.r || 40, fill: '#ff9a1f', 'fill-opacity': .35, stroke: '#ffd23f', 'stroke-width': 3 });
      svanisci(c, 1100);
      onda(q, { r: (fx.r || 40) * 1.6, col: '#8a775a', w: 7, ms: 800 });
      polvere(q, { r: (fx.r || 40) * 1.2, ms: 1000 });
      scintille(q, { n: 12, r: (fx.r || 40), col: '#7d6b52' });
    } });
    return Math.max(700, L * .9) + 700;
  }

  /* la runa sotto chi lancia */
  function runa(p, col){
    const g = el('g', { transform: 'translate(' + p[0] + ',' + p[1] + ')' });
    el('circle', { r: 30, fill: 'none', stroke: col, 'stroke-width': 2.5, 'stroke-dasharray': '6 5' }, g);
    el('circle', { r: 20, fill: 'none', stroke: col, 'stroke-width': 1.5, opacity: .7 }, g);
    tween(800, t => { g.setAttribute('transform', 'translate(' + p[0] + ',' + p[1] + ') rotate(' + (t * 120) + ') scale(' + (.6 + .5 * easeOut(t)) + ')'); g.setAttribute('opacity', t < .6 ? 1 : 1 - (t - .6) / .4); }, () => g.remove());
  }
  function aura(u, col){
    const g = el('g', {});
    const r0 = Math.max(u.w, u.h) / 2 + 10;
    for (let k = 0; k < 2; k++) dopo(k * 260, () => onda([u.x, u.y], { r: r0 + 20, col, w: 5, ms: 900 }));
    const cerchio = el('circle', { cx: u.x, cy: u.y, r: r0, fill: col, 'fill-opacity': .12, stroke: col, 'stroke-width': 3, 'stroke-dasharray': '10 7' }, g);
    tween(1400, t => { cerchio.setAttribute('stroke-dashoffset', -t * 80); g.setAttribute('opacity', t < .75 ? 1 : 1 - (t - .75) / .25); }, () => g.remove());
    for (let k = 0; k < 10; k++) dopo(k * 90, () => {
      const p = dentro(u, .45), e = el('circle', { cx: p[0], cy: p[1], r: 3, fill: col });
      tween(900, t => { e.setAttribute('cy', p[1] - 40 * t); e.setAttribute('opacity', 1 - t); }, () => e.remove());
    });
  }
  function maledizione(u, col){
    for (let k = 0; k < 9; k++){
      const a = k / 9 * Math.PI * 2, R = Math.max(u.w, u.h) * .8;
      const e = el('circle', { r: 9, fill: '#2a1240', opacity: .0 });
      tween(1200, t => {
        const q = easeIn(t), rr = R * (1 - q), aa = a + t * 3;
        e.setAttribute('cx', u.x + Math.cos(aa) * rr); e.setAttribute('cy', u.y + Math.sin(aa) * rr);
        e.setAttribute('r', 9 + 10 * q); e.setAttribute('opacity', .75 * Math.sin(Math.PI * t));
      }, () => e.remove());
    }
    dopo(900, () => { scoppio([u.x, u.y], { r: Math.max(u.w, u.h) * .5, grad: 'gr-ombra', ms: 800 }); });
  }
  function vortice(u, col){
    const g = el('g', { transform: 'translate(' + u.x + ',' + u.y + ')' });
    let dd = '';
    for (let k = 0; k < 3; k++){
      const a0 = k * 2.09;
      dd += 'M0 0';
      for (let s = 1; s <= 24; s++){ const a = a0 + s * .26, r = s * 3.2; dd += 'L' + (Math.cos(a) * r).toFixed(1) + ' ' + (Math.sin(a) * r).toFixed(1); }
    }
    el('path', { d: dd, stroke: col, 'stroke-width': 4, fill: 'none', opacity: .85, 'stroke-linecap': 'round' }, g);
    tween(1500, t => { g.setAttribute('transform', 'translate(' + u.x + ',' + u.y + ') rotate(' + (t * 540) + ') scale(' + (.3 + t * .9) + ')'); g.setAttribute('opacity', t < .7 ? 1 : 1 - (t - .7) / .3); }, () => g.remove());
  }

  function magiaFx(fx, f, prima){
    const da = posDi(f, fx.da) || posDi(prima, fx.da);
    const su = posDi(f, fx.su) || posDi(prima, fx.su) || da;
    if (!da) return 0;
    const st = stileMagia(fx.nome, fx.tipo), col = TINTA[st.col] || '#6fc3ff';
    runa([da.x, da.y], col);
    const tipo = st.tipo;
    const stessa = su === da || (su.x === da.x && su.y === da.y);
    if (tipo === 'enchantment' || (stessa && tipo !== 'vortex')){ dopo(350, () => aura(su, col)); return 1700; }
    if (tipo === 'hex'){ dopo(300, () => maledizione(su, col)); return 1800; }
    if (tipo === 'vortex'){ dopo(300, () => vortice(su, col)); return 1900; }
    if (tipo === 'conveyance'){ dopo(300, () => { aura(da, col); }); return 1400; }
    /* i dardi e gli assalti: qualcosa parte da chi lancia e arriva */
    const p0 = bordo(da, [su.x, su.y]), p1 = [su.x, su.y];
    const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    if (st.col === 'fulmine'){
      dopo(300, () => fulmineFx({ p: [p0, bordo(su, p0)], col: /warp/i.test(fx.nome) ? '#8dff5a' : '#bfe7ff' }, f, prima));
      return 1300;
    }
    if (st.col === 'vento'){
      for (let k = 0; k < 4; k++) dopo(300 + k * 110, () => {
        const off = rnd(-su.w / 3, su.w / 3);
        volo([p0[0], p0[1]], [p1[0] + off, p1[1] + rnd(-12, 12)], { ms: Math.max(380, L * .5),
          forma: '<path d="M-6-18Q14 0-6 18" stroke="#e8f4ff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".85"/>' +
                 '<path d="M-22-12Q-6 0-22 12" stroke="#e8f4ff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".5"/>' });
      });
      dopo(300 + Math.max(380, L * .5), () => { onda(p1, { r: 60, col: '#e8f4ff', w: 5 }); polvere(p1, { r: 40 }); });
      return 1500;
    }
    if (st.col === 'ombra' && tipo === 'missile'){
      for (let k = 0; k < 3; k++) dopo(300 + k * 140, () => {
        const a = dentro(su, .3), fase = rnd(0, 6);
        const g = el('g', {}); g.innerHTML = FORME_FX.ombra;
        const ms = Math.max(600, L * .8);
        tween(ms, t => {
          const nx = -(a[1] - p0[1]) / (L || 1), ny = (a[0] - p0[0]) / (L || 1), w = Math.sin(t * Math.PI * 3 + fase) * 22 * (1 - t);
          g.setAttribute('transform', 'translate(' + (lerp(p0[0], a[0], t) + nx * w) + ',' + (lerp(p0[1], a[1], t) + ny * w) + ')');
        }, () => { g.remove(); scoppio(a, { r: 30, grad: 'gr-ombra', ms: 600 }); scintille(a, { col: '#d9b8ff', n: 6 }); });
      });
      return 1800;
    }
    const forma = FORME_FX[st.col === 'oro' ? 'azzurro' : st.col] || FORME_FX.azzurro;
    const grad = { fuoco: 'gr-scoppio', verde: 'gr-verde', ombra: 'gr-ombra' }[st.col] || 'gr-azzurro';
    const ms = tipo === 'assailment' ? 380 : Math.max(520, L * .7);
    dopo(300, () => volo(p0, p1, { ms, forma, scia: (q, t) => {
      const e = el('circle', { cx: q[0] + rnd(-3, 3), cy: q[1] + rnd(-3, 3), r: st.col === 'fuoco' ? 7 : 5, fill: 'url(#' + (st.col === 'fuoco' ? 'gr-fuoco' : grad) + ')' });
      tween(420, s => { e.setAttribute('r', (st.col === 'fuoco' ? 7 : 5) * (1 - s) + 1); e.setAttribute('opacity', 1 - s); }, () => e.remove());
    }, fine: q => {
      scoppio(q, { r: Math.max(su.w, su.h) * .55 + 10, grad });
      scintille(q, { col, n: 10, r: 38 });
      if (st.col === 'fuoco') dopo(250, () => fumo(q, { n: 4, r: 22 }));
    } }));
    return 300 + ms + 800;
  }

  function dissoltoFx(fx, f, prima){
    const da = posDi(f, fx.da) || posDi(prima, fx.da);
    const su = posDi(f, fx.su) || posDi(prima, fx.su) || da;
    const dal = fx.dal != null ? posDi(f, fx.dal) || posDi(prima, fx.dal) : null;
    if (!da) return 0;
    const col = TINTA[stileMagia(fx.nome, fx.tipo).col] || '#6fc3ff';
    runa([da.x, da.y], col);
    if (dal) dopo(150, () => { runa([dal.x, dal.y], '#bfe9ff'); onda([dal.x, dal.y], { r: 50, col: '#bfe9ff' }); });
    const p0 = [da.x, da.y], p1 = su === da ? [da.x, da.y - 60] : [su.x, su.y];
    const q = [lerp(p0[0], p1[0], .5), lerp(p0[1], p1[1], .5)];
    dopo(300, () => volo(p0, q, { ms: 450, forma: '<circle r="9" fill="' + col + '" opacity=".85"/>', fine: z => {
      /* e a meta' strada si rompe */
      for (let k = 0; k < 8; k++){
        const a = rnd(0, Math.PI * 2), e = el('path', { d: 'M0-5L3 0L0 5L-3 0Z', fill: col });
        tween(600, t => { e.setAttribute('transform', 'translate(' + (z[0] + Math.cos(a) * 40 * t) + ',' + (z[1] + Math.sin(a) * 40 * t) + ') rotate(' + (t * 360) + ')'); e.setAttribute('opacity', 1 - t); }, () => e.remove());
      }
      scritta([z[0], z[1] - 10], '✕', { col: '#bfe9ff', size: 30, ms: 900 });
    } }));
    return 1500;
  }

  function fiascoFx(fx, f, prima){
    const da = posDi(f, fx.da) || posDi(prima, fx.da);
    if (!da) return 0;
    const p = [da.x, da.y];
    scoppio(p, { r: 3 * MM / 2 + 30, grad: 'gr-ombra', ms: 800 });
    dopo(120, () => { scoppio(p, { r: 3 * MM / 2, ms: 700 }); onda(p, { r: 3 * MM, col: '#d9b8ff', w: 6 }); scintille(p, { n: 14, r: 60, col: '#ff9a1f' }); });
    dopo(400, () => fumo(p, { n: 5, r: 26, col: '#5b4a6b' }));
    scritta([p[0], p[1] - 40], 'Fiasco!', { col: '#ffd23f', size: 30, ms: 1300 });
    return 1400;
  }

  const BESTIE = /monstrous|behemoth|warBeasts|monstrousCreature|Chariot/;
  function mischiaFx(fx, f, prima){
    const A = (fx.a || []).map(id => posDi(f, id) || posDi(prima, id)).filter(Boolean);
    const B = (fx.b || []).map(id => posDi(f, id) || posDi(prima, id)).filter(Boolean);
    if (!A.length || !B.length) return 0;
    let t0 = 0;
    for (const a of A) for (const b of B){
      const pa = bordo(a, [b.x, b.y]), pb = bordo(b, [a.x, a.y]);
      const c = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
      const dir = Math.atan2(b.y - a.y, b.x - a.x), lato = [-Math.sin(dir), Math.cos(dir)];
      const largo = Math.min(Math.max(a.w, a.h), Math.max(b.w, b.h)) * .45;
      for (let k = 0; k < 5; k++) dopo(t0 + k * 170, () => {
        const off = rnd(-largo, largo), p = [c[0] + lato[0] * off, c[1] + lato[1] * off];
        scintille(p, { n: 6, r: 20, col: k % 2 ? '#fff6c8' : '#ffd23f', ms: 300 });
      });
      dopo(t0, () => scritta([c[0], c[1] - 6], '⚔', { col: '#fff', size: 40, ms: 1000 }));
      /* le bestie graffiano: tre segni sul nemico */
      for (const [chi, su] of [[a, b], [b, a]]){
        const tp = tipoDi(chi.id) || '';
        if (!BESTIE.test(tp)) continue;
        dopo(t0 + 250, () => {
          const p = dentro(su, .2), ang = rnd(-40, 40);
          const g = el('g', { transform: 'translate(' + p[0] + ',' + p[1] + ') rotate(' + ang + ')' });
          const tagli = [];
          for (let k = -1; k <= 1; k++){
            const e = el('path', { d: 'M' + (k * 12 - 8) + ' -26Q' + (k * 12 + 6) + ' 0 ' + (k * 12 - 4) + ' 26', stroke: '#ff3b2f',
                                    'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round', 'stroke-dasharray': 60, 'stroke-dashoffset': 60 }, g);
            tagli.push(e);
          }
          tween(260, t => tagli.forEach(e => e.setAttribute('stroke-dashoffset', 60 * (1 - t))), () => svanisci(g, 700));
        });
      }
      t0 += 250;
    }
    return t0 + 1100;
  }

  function caricaFx(fx, f, prima){
    const ora = posDi(f, fx.da), era = posDi(prima, fx.da);
    if (!ora) return 0;
    if (era && Math.hypot(ora.x - era.x, ora.y - era.y) > 10)
      for (let k = 0; k < 6; k++) dopo(k * 80, () => polvere([lerp(era.x, ora.x, k / 6) + rnd(-12, 12), lerp(era.y, ora.y, k / 6) + rnd(-12, 12)], { r: 26, ms: 800 }));
    if (fx.ok){
      const su = posDi(f, fx.su);
      if (su) dopo(520, () => { const p = bordo(ora, [su.x, su.y]); scintille(p, { n: 10, r: 30 }); onda(p, { r: 40, col: '#ffd23f' }); });
    }
    return 1000;
  }
  function paniconeFx(fx, f, prima, testo, col){
    const u = posDi(f, fx.da) || posDi(prima, fx.da);
    if (!u) return 0;
    scritta([u.x, u.y - Math.max(u.w, u.h) / 2 - 10], testo, { col, size: 38, ms: 1200 });
    return 900;
  }
  function fugaFx(fx, f, prima){
    const ora = posDi(f, fx.da), era = posDi(prima, fx.da);
    const u = ora || era;
    if (!u) return 0;
    if (ora && era) for (let k = 0; k < 5; k++) dopo(k * 90, () => polvere([lerp(era.x, ora.x, k / 5), lerp(era.y, ora.y, k / 5)], { r: 22 }));
    scritta([u.x, u.y - Math.max(u.w, u.h) / 2 - 10], '!', { col: '#ffd23f', size: 46, ms: 1200 });
    return 1000;
  }


  /* ---- chi cade, chi muore, chi marcia ----
     Questi non li scrive l'arbitro: si leggono confrontando un
     fotogramma con quello prima. Un reggimento che perde tre modelli
     lampeggia e fa salire un «−3»; uno che sparisce si sbriciola dove
     stava; uno che si e' spostato lascia per un attimo la sua scia, cosi'
     si vede da dove e' venuto anche quando la mossa e' gia' finita. */
  function lampo(u, col, ms = 750){
    const e = el('rect', { x: -u.w / 2 - 3, y: -u.h / 2 - 3, width: u.w + 6, height: u.h + 6, rx: 4,
                           transform: 'translate(' + u.x + ',' + u.y + ') rotate(' + (u.r || 0) + ')',
                           fill: col, 'fill-opacity': .5, stroke: col, 'stroke-width': 4 });
    tween(ms, t => e.setAttribute('opacity', t < .12 ? t / .12 : 1 - (t - .12) / .88), () => e.remove());
  }
  function perditeFx(fx, f, prima){
    const u = posDi(f, fx.da) || posDi(prima, fx.da);
    if (!u) return 0;
    lampo(u, '#ff3b2f');
    const n = Math.min(10, fx.n || 1);
    for (let k = 0; k < Math.min(7, n + 2); k++) dopo(k * 70, () => {
      const p = dentro(u, .38);
      const e = el('circle', { cx: p[0], cy: p[1], r: 2, fill: 'url(#gr-sangue)' });
      tween(700, t => { e.setAttribute('r', 2 + 13 * easeOut(t)); e.setAttribute('opacity', 1 - t); }, () => e.remove());
    });
    scritta([u.x, u.y - Math.max(u.w, u.h) / 2 - 12], '−' + (fx.n || 1) + (fx.ferite ? ' ♥' : ''),
            { col: fx.ferite ? '#ff8a7a' : '#ff4a3d', size: 32 + Math.min(16, n * 2), ms: 1500 });
    return 1300;
  }
  function distruttoFx(fx, f, prima){
    const u = posDi(prima, fx.da);
    if (!u) return 0;
    const col = colore(u.a);
    const g = el('g', { transform: 'translate(' + u.x + ',' + u.y + ') rotate(' + (u.r || 0) + ')' });
    el('rect', { x: -u.w / 2, y: -u.h / 2, width: u.w, height: u.h, rx: 2, fill: col, 'fill-opacity': .55,
                 stroke: '#000', 'stroke-opacity': .35, 'stroke-width': 2 }, g);
    tween(1100, t => {
      g.setAttribute('transform', 'translate(' + u.x + ',' + u.y + ') rotate(' + (u.r || 0) + ') scale(' + (1 - .3 * easeIn(t)) + ')');
      g.setAttribute('opacity', 1 - t);
    }, () => g.remove());
    /* i pezzi che volano via */
    const R = Math.max(u.w, u.h) * .6 + 20;
    for (let k = 0; k < 12; k++){
      const p = dentro(u, .4), a = rnd(0, Math.PI * 2), l = rnd(R * .4, R), giro = rnd(-300, 300), s = rnd(4, 9);
      const e = el('rect', { x: -s / 2, y: -s / 2, width: s, height: s * .7, fill: k % 3 ? col : '#5c5448' });
      tween(900 + rnd(0, 300), t => {
        const q = easeOut(t);
        e.setAttribute('transform', 'translate(' + (p[0] + Math.cos(a) * l * q) + ',' + (p[1] + Math.sin(a) * l * q) + ') rotate(' + giro * t + ')');
        e.setAttribute('opacity', 1 - t * t);
      }, () => e.remove());
    }
    polvere([u.x, u.y], { r: R * 1.1, ms: 1200 });
    dopo(200, () => fumo([u.x, u.y], { n: 4, r: 26, col: '#7d756a' }));
    scritta([u.x, u.y - 6], fx.fuga ? '⚑' : '☠', { col: '#fff', size: 48, ms: 1700 });
    return 1500;
  }
  function marciaFx(fx, f, prima){
    const da = posDi(prima, fx.da), a = posDi(f, fx.da);
    if (!da || !a) return 0;
    const col = colore(a.a);
    /* dove stava: il contorno, che si spegne */
    const g = el('rect', { x: -da.w / 2, y: -da.h / 2, width: da.w, height: da.h, rx: 3,
                           transform: 'translate(' + da.x + ',' + da.y + ') rotate(' + (da.r || 0) + ')',
                           fill: col, 'fill-opacity': .08, stroke: col, 'stroke-width': 2.5, 'stroke-dasharray': '7 6' });
    tween(1500, t => g.setAttribute('opacity', .8 * (1 - t)), () => g.remove());
    /* e la strada: orme che corrono verso dove e' arrivato */
    const L = Math.hypot(a.x - da.x, a.y - da.y);
    if (L < 30) return 0;
    const sc = el('line', { x1: da.x, y1: da.y, x2: a.x, y2: a.y, stroke: col, 'stroke-width': 7, 'stroke-linecap': 'round',
                            'stroke-dasharray': '1 16', opacity: 0 });
    tween(1500, t => {
      sc.setAttribute('opacity', .6 * Math.sin(Math.PI * Math.min(1, t * 1.15)));
      sc.setAttribute('stroke-dashoffset', -t * 70);
    }, () => sc.remove());
    return 0;
  }

  /* gli effetti di un fotogramma: quelli scritti dall'arbitro (`fx`),
     quelli che si leggono dalla spiegazione (`x`), e quelli che si
     vedono confrontandolo con il fotogramma prima */
  function effettiDi(f){
    const out = [];
    for (const r of f.testo || []){
      if (r.fx){ out.push(r.fx); continue; }
      const x = r.x;
      if (!x) continue;
      if (x.k === 'tiro' && x.uid != null && x.su != null){
        const tiri = +((/(\d+) tir[io]/.exec(r.t) || [])[1]) || 3;
        out.push({ k: 'tiro', da: x.uid, su: x.su, arma: String(x.t || '').replace(/^Tiro · /, ''), tiri });
      } else if (x.k === 'fiasco') out.push({ k: 'fiasco', da: x.uid });
      else if (x.k === 'carica') out.push({ k: 'carica', da: x.uid, su: x.su, ok: !!x.ok });
      else if (x.k === 'fuga') out.push({ k: 'fuga', da: x.uid });
      else if (/^(panico|paura|terrore|rotta)$/.test(x.k) && x.ok === false) out.push({ k: 'paura', da: x.uid });
    }
    return out;
  }
  function cambiDi(f, prima){
    const marce = [], dopoFx = [];
    if (!prima || !f) return { marce, dopoFx };
    const giaMosse = new Set();
    for (const r of f.testo || []){
      const k = r.fx ? r.fx.k : r.x ? r.x.k : '';
      if (k === 'carica' || k === 'fuga') giaMosse.add(r.fx ? r.fx.da : r.x.uid);
    }
    for (const u of f.unita){
      const pu = prima.unita.find(x => x.id === u.id);
      if (!pu) continue;
      if (u.v < pu.v) dopoFx.push({ k: 'perdite', da: u.id, n: pu.v - u.v });
      else if (u.fw && pu.fw && (u.fp || 0) > (pu.fp || 0)) dopoFx.push({ k: 'perdite', da: u.id, n: u.fp - (pu.fp || 0), ferite: true });
      if (!giaMosse.has(u.id) && (Math.hypot(u.x - pu.x, u.y - pu.y) > 20 || Math.abs((u.r || 0) - (pu.r || 0)) > 20))
        marce.push({ k: 'marcia', da: u.id });
    }
    for (const pu of prima.unita){
      if (f.unita.some(x => x.id === pu.id)) continue;
      if (f.ospiti && f.ospiti[pu.id] != null) continue;     // si e' unito a un reggimento
      dopoFx.push({ k: 'distrutto', da: pu.id, fuga: !!pu.f });
    }
    return { marce: marce.slice(0, 10), dopoFx: dopoFx.slice(0, 8) };
  }
  const FX = { tiro: tiroFx, fulmine: fulmineFx, sagoma: sagomaFx, magia: magiaFx, dissolto: dissoltoFx,
               fiasco: fiascoFx, mischia: mischiaFx, carica: caricaFx, fuga: fugaFx,
               paura: (fx, f, p) => paniconeFx(fx, f, p, '!', '#ff5a4a'),
               perdite: perditeFx, distrutto: distruttoFx, marcia: marciaFx };
  const acceso = () => !!strato && attivo() && !quieto();

  /* Torna quanto dura, in millisecondi: chi guarda aspetta tanto prima
     della mossa dopo. `ritmo` accorcia le pause fra un effetto e l'altro
     quando la partita va in fretta. */
  function giocaEffetti(f, prima, { ritmo = 1 } = {}){
    if (!acceso() || !f) return 0;
    const passo = 650 / Math.max(1, ritmo);
    const lista = effettiDi(f).slice(0, 8);
    const { marce, dopoFx } = cambiDi(f, prima);
    for (const fx of marce) FX.marcia(fx, f, prima);
    let t = 250, fine = marce.length ? 900 : 0;
    for (const fx of lista){
      const fn = FX[fx.k];
      if (!fn) continue;
      const parti = t;
      dopo(parti, () => fn(fx, f, prima));
      /* quanto dura lo stima la stessa funzione solo quando parte: qui
         si mette in fila con un passo fisso, e ci si ferma a un tetto */
      t += passo;
      fine = parti + 1400;
    }
    /* chi cade cade dopo che i colpi sono arrivati */
    const poi = lista.length ? t + 250 : 150;
    for (const fx of dopoFx){
      dopo(poi, () => FX[fx.k](fx, f, prima));
      fine = Math.max(fine, poi + 1300);
    }
    return Math.min(4800, fine);
  }
  /* un effetto solo, per chi non ha un fotogramma ma sa cosa e' successo:
     la partita al tavolo, dove i dadi li tira chi gioca */
  function gioca(fx, f, prima){
    if (!acceso() || !FX[fx.k]) return 0;
    return FX[fx.k](fx, f, prima || f) || 0;
  }

  return { DEFS, giocaEffetti, gioca, pulisci: pulisciFx, effettiDi, cambiDi, scritta: (p, t, o) => acceso() && scritta(p, t, o) };
}
