/* Schieramento Old World — gli effetti sul tavolo in 3D
 *
 * Frecce che volano ad arco, palle di cannone, massi, fulmini, fiamme,
 * incantesimi, scintille della mischia, la polvere di una carica e il
 * numero rosso di chi cade: quello che fa `fxmotore.js` sul disegno 2D,
 * fatto con three.js sopra il tavolo della vista 3D.
 *
 * Che cosa succede in un fotogramma non lo decide questo file: lo dice
 * lo stesso motore 2D (`effettiDi`, `cambiDi`, `armaDi`, `stileMagia`),
 * cosi' una partita guardata in 2D e in 3D racconta le stesse cose, con
 * gli stessi colori. Qui c'e' solo come si vedono.
 *
 * Lavora sui fotogrammi di `RP.fotogramma` (la partita da rivedere) e di
 * `fotoTavolo()` (il tavolo dal vivo): le unita' con centro, misure e
 * rotazione in millimetri. L'animazione non decide niente — i dadi sono
 * gia' caduti — e chi ha chiesto al sistema meno movimento non la vede.
 */

import * as THREE from 'three';
import { motoreFx } from './fxmotore.js';

const RAD = Math.PI / 180;
const quieto = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const easeOut = t => 1 - (1 - t) * (1 - t);

/* la luce morbida di un bagliore, una volta sola per tutti */
let tessBagliore = null;
function bagliore(){
  if (tessBagliore) return tessBagliore;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(.35, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  tessBagliore = new THREE.CanvasTexture(c);
  return tessBagliore;
}
/* una scritta che guarda sempre la telecamera: «−3», «☠», «⚔» */
function tessTesto(testo, col){
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const g = c.getContext("2d");
  g.font = "bold 84px Archivo, 'Segoe UI Symbol', sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = 12; g.strokeStyle = "rgba(20,16,12,.85)"; g.strokeText(testo, 128, 66);
  g.fillStyle = col; g.fillText(testo, 128, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function motore3D(scena){
  const C = motoreFx({});                    // solo per sapere che cosa succede
  const gruppo = new THREE.Group();
  scena.add(gruppo);
  const vivi = new Set();
  let giro = 0;

  /* ---- il tempo ---- */
  const anima = (ms, passo, fine) => vivi.add({ t0: performance.now(), ms, passo, fine });
  const dopo = (ms, fn) => { const g = giro; setTimeout(() => { if (g === giro) fn(); }, ms); };
  function aggiorna(ora){
    for (const a of [...vivi]){
      const t = Math.min(1, (ora - a.t0) / a.ms);
      a.passo(t);
      if (t >= 1){ vivi.delete(a); if (a.fine) a.fine(); }
    }
  }
  function togli(o){
    gruppo.remove(o);
    o.traverse(x => {
      /* gli sprite hanno una geometria sola, di three, condivisa da tutti */
      if (x.geometry && !x.isSprite && !x.geometry.userData.tenere) x.geometry.dispose();
      if (x.material){ if (x.material.map && x.material.map.userData.butta) x.material.map.dispose(); x.material.dispose(); }
    });
  }
  function pulisci(){
    giro++;
    vivi.clear();
    for (const o of [...gruppo.children]) togli(o);
  }

  /* ---- dove: il fotogramma e i punti ---- */
  const posDi = (f, id) => {
    if (!f) return null;
    const u = f.unita.find(x => String(x.id) === String(id));
    if (u) return u;
    const host = f.ospiti && f.ospiti[id];
    return host != null ? f.unita.find(x => String(x.id) === String(host)) || null : null;
  };
  const v3 = (p, y = 0) => new THREE.Vector3(p[0], y, p[1]);
  function bordo(u, verso){
    const dx = verso[0] - u.x, dy = verso[1] - u.y, L = Math.hypot(dx, dy) || 1;
    const a = -(u.r || 0) * RAD;
    const lx = (dx * Math.cos(a) - dy * Math.sin(a)) / L, ly = (dx * Math.sin(a) + dy * Math.cos(a)) / L;
    const k = Math.min(Math.abs(lx) > 1e-6 ? u.w / 2 / Math.abs(lx) : 1e9, Math.abs(ly) > 1e-6 ? u.h / 2 / Math.abs(ly) : 1e9);
    return [u.x + dx / L * k, u.y + dy / L * k];
  }
  function dentro(u, quanto = .38){
    const lx = rnd(-quanto, quanto) * u.w, ly = rnd(-quanto, quanto) * u.h, a = (u.r || 0) * RAD;
    return [u.x + lx * Math.cos(a) - ly * Math.sin(a), u.y + lx * Math.sin(a) + ly * Math.cos(a)];
  }

  /* ---- i pezzi di un effetto ---- */
  function luce(p, { col = "#ffd23f", r = 20, y = 12 } = {}){
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bagliore(), color: col, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    s.position.copy(p.isVector3 ? p : v3(p, y));
    s.scale.setScalar(r);
    gruppo.add(s);
    return s;
  }
  function svanisce(o, ms, { cresce = 1, sale = 0 } = {}){
    const s0 = o.scale.x, y0 = o.position.y;
    anima(ms, t => {
      o.material.opacity = 1 - t * t;
      o.scale.setScalar(s0 * (1 + (cresce - 1) * easeOut(t)));
      o.position.y = y0 + sale * easeOut(t);
    }, () => togli(o));
  }
  function scintille(p, { n = 8, col = "#ffd23f", r = 22, y = 14, ms = 420 } = {}){
    for (let k = 0; k < n; k++){
      const s = luce(p, { col, r: rnd(3, 6), y });
      const a = rnd(0, Math.PI * 2), l = rnd(r * .4, r), su = rnd(4, 18);
      const x0 = s.position.x, z0 = s.position.z;
      anima(ms * rnd(.7, 1.2), t => {
        const q = easeOut(t);
        s.position.set(x0 + Math.cos(a) * l * q, y + su * Math.sin(Math.PI * t), z0 + Math.sin(a) * l * q);
        s.material.opacity = 1 - t;
      }, () => togli(s));
    }
  }
  function nuvola(p, { n = 4, r = 30, col = "#9a8f80", ms = 1100, y = 8 } = {}){
    for (let k = 0; k < n; k++){
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bagliore(), color: col, transparent: true, depthWrite: false, opacity: .7 }));
      s.position.copy(v3([p[0] + rnd(-r / 3, r / 3), p[1] + rnd(-r / 3, r / 3)], y));
      s.scale.setScalar(r * .6);
      gruppo.add(s);
      const ms1 = ms * rnd(.8, 1.2);
      dopo(k * 60, () => svanisce(s, ms1, { cresce: 2.2, sale: 25 }));
    }
  }
  function onda(p, { r = 50, col = "#ffd23f", ms = 700 } = {}){
    const m = new THREE.Mesh(new THREE.RingGeometry(.82, 1, 48),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(v3(p, 1.5));
    gruppo.add(m);
    anima(ms, t => { m.scale.setScalar(Math.max(.01, r * easeOut(t))); m.material.opacity = 1 - t; }, () => togli(m));
  }
  function scritta(p, testo, { col = "#fff", ms = 1400, y = 45, alto = 26 } = {}){
    const tx = tessTesto(testo, col);
    tx.userData.butta = true;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthTest: false, depthWrite: false }));
    s.position.copy(v3(p, y));
    s.scale.set(alto * 2, alto, 1);
    s.renderOrder = 10;
    gruppo.add(s);
    const y0 = y;
    anima(ms, t => { s.position.y = y0 + 22 * easeOut(t); s.material.opacity = t < .7 ? 1 : 1 - (t - .7) / .3; }, () => togli(s));
  }

  /* un proiettile: `fare()` costruisce l'oggetto, che si gira lungo la
     traiettoria se `orienta`; `arco` e' quanto sale a meta' volo */
  const SU = new THREE.Vector3(0, 1, 0);
  function volo(a, b, { ms, arco = 40, fare, orienta = false, scia = null, fine } = {}){
    const o = fare();
    gruppo.add(o);
    const p = new THREE.Vector3(), v = new THREE.Vector3();
    let ultimaScia = 0;
    anima(ms, t => {
      p.lerpVectors(a, b, t); p.y += arco * 4 * t * (1 - t);
      o.position.copy(p);
      if (orienta){
        v.subVectors(b, a); v.y += arco * 4 * (1 - 2 * t);
        if (v.lengthSq() > 1e-6) o.quaternion.setFromUnitVectors(SU, v.normalize());
      }
      if (scia && t - ultimaScia > .06 && t < 1){ ultimaScia = t; svanisce(luce(p.clone(), { col: scia, r: 9 }), 380); }
    }, () => { togli(o); if (fine) fine(b); });
  }
  const geo = (g) => { g.userData.tenere = true; return g; };
  const G = {
    asta: geo(new THREE.CylinderGeometry(.5, .5, 22, 5)),
    punta: geo(new THREE.ConeGeometry(1.4, 4, 6)),
    palla: geo(new THREE.SphereGeometry(4, 14, 10)),
    masso: geo(new THREE.DodecahedronGeometry(8, 0)),
  };
  const freccia = (lungo = 1, spessa = 1) => () => {
    const g = new THREE.Group();
    const asta = new THREE.Mesh(G.asta, new THREE.MeshStandardMaterial({ color: "#6b5233", roughness: .8 }));
    asta.scale.set(spessa, lungo, spessa);
    const punta = new THREE.Mesh(G.punta, new THREE.MeshStandardMaterial({ color: "#9aa0a6", metalness: .6, roughness: .4 }));
    punta.position.y = 11 * lungo + 2;
    punta.scale.setScalar(spessa);
    g.add(asta, punta);
    return g;
  };
  const sfera = (g, col, opz = {}) => () => new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: col, roughness: .7, ...opz }));
  const globo = (col, r = 14) => () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bagliore(), color: col, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.setScalar(r);
    return s;
  };

  function saetta(a, b, col, ms = 650){
    const L = a.distanceTo(b), n = Math.max(6, Math.round(L / 25));
    const punti = () => {
      const out = [];
      for (let k = 0; k <= n; k++){
        const t = k / n, j = k === 0 || k === n ? 0 : 1;
        out.push(new THREE.Vector3(lerp(a.x, b.x, t) + rnd(-10, 10) * j, lerp(a.y, b.y, t) + rnd(-8, 8) * j, lerp(a.z, b.z, t) + rnd(-10, 10) * j));
      }
      return out;
    };
    const linea = new THREE.Line(new THREE.BufferGeometry().setFromPoints(punti()),
      new THREE.LineBasicMaterial({ color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    gruppo.add(linea);
    let scatto = 0;
    anima(ms, t => {
      if (t - scatto > .12){ scatto = t; linea.geometry.setFromPoints(punti()); }
      linea.material.opacity = t < .8 ? (Math.random() < .2 ? .4 : 1) : 1 - (t - .8) / .2;
    }, () => togli(linea));
    svanisce(luce(b, { col, r: 50 }), ms);
    /* una linea WebGL e' larga un pixel: il bagliore lungo la strada la
       fa vedere anche da lontano */
    for (let k = 1; k < n; k += 2) svanisce(luce(a.clone().lerp(b, k / n), { col, r: 22 }), ms * .7);
  }
  /* un cilindro di luce che sale intorno a un'unita' */
  function aura(u, col, { ms = 1500, alto = 60, scende = false } = {}){
    const r = Math.max(u.w, u.h) * .55;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, alto, 40, 1, true),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set(u.x, alto / 2, u.y);
    gruppo.add(m);
    anima(ms, t => {
      /* additivo su un tavolo chiaro: poca opacita', o diventa un muro bianco */
      m.material.opacity = .22 * Math.sin(Math.PI * t);
      m.scale.y = scende ? 1 - .7 * t : .3 + .7 * easeOut(t);
      m.position.y = scende ? alto / 2 * (1 - .7 * t) + 10 : alto / 2 * m.scale.y;
    }, () => togli(m));
    onda([u.x, u.y], { r: r * 1.4, col, ms: ms * .6 });
  }
  function runa(p, col){
    onda(p, { r: 45, col, ms: 900 });
    svanisce(luce(p, { col, r: 40, y: 25 }), 700, { cresce: 1.4, sale: 15 });
  }

  /* ---- gli effetti veri ---- */
  const ALTEZZA = 22;                         // da dove parte un colpo: all'altezza delle armi
  function tiroFx(fx, f, prima){
    const da = posDi(f, fx.da) || posDi(prima, fx.da), su = posDi(f, fx.su) || posDi(prima, fx.su);
    if (!da || !su) return 0;
    const tipo = C.armaDi(fx.arma);
    const n = Math.max(1, Math.min(8, fx.tiri || 4));
    const p0 = bordo(da, [su.x, su.y]);
    const L = Math.hypot(su.x - p0[0], su.y - p0[1]);
    const a = v3(p0, ALTEZZA);
    if (tipo === "fiamma"){
      const p1 = bordo(su, p0);
      for (let k = 0; k < 24; k++) dopo(k * 25, () => {
        const b = v3([p1[0] + rnd(-su.w / 3, su.w / 3), p1[1] + rnd(-su.h / 3, su.h / 3)], 10);
        const s = luce(a.clone(), { col: k % 3 ? "#ff8a1f" : "#ffd23f", r: 10 });
        anima(560, t => { s.position.lerpVectors(a, b, t); s.scale.setScalar(10 + 30 * t); s.material.opacity = 1 - t * t; }, () => togli(s));
      });
      dopo(600, () => nuvola([su.x, su.y], { n: 3, col: "#4a4038" }));
      return 1200;
    }
    if (tipo === "fulmine"){ saetta(a, v3([su.x, su.y], 10), "#8dff5a"); return 800; }
    const cfg = {
      freccia:    { ms: Math.max(550, L * 1.1), arco: Math.max(40, L * .22), fare: freccia(), passo: 70 },
      quadrello:  { ms: Math.max(380, L * .7), arco: Math.max(15, L * .1), fare: freccia(.7, 1.3), passo: 120 },
      giavellotto:{ ms: Math.max(450, L * .9), arco: Math.max(30, L * .2), fare: freccia(1.6, 1.4), passo: 110 },
      dardone:    { ms: Math.max(400, L * .6), arco: Math.max(15, L * .08), fare: freccia(2.4, 3), passo: 150 },
      pallottola: { ms: Math.max(160, L * .25), arco: 3, fare: globo("#fff3b0", 8), passo: 160, scia: "#fff3b0" },
      palla:      { ms: Math.max(300, L * .45), arco: Math.max(20, L * .1), fare: sfera(G.palla, "#1d1d1d", { metalness: .4 }), passo: 0 },
      masso:      { ms: Math.max(700, L * .9), arco: Math.max(80, L * .35), fare: sfera(G.masso, "#8c8478"), passo: 0 },
    }[tipo] || null;
    if (!cfg) return 0;
    const quanti = cfg.passo ? n : 1;
    if (tipo === "pallottola" || tipo === "palla") nuvola(p0, { n: 3, r: 22, col: "#d9d3c7", ms: 900, y: ALTEZZA });
    for (let k = 0; k < quanti; k++) dopo(k * cfg.passo, () => {
      const b = v3(dentro(su), 6);
      volo(a.clone(), b, { ms: cfg.ms * rnd(.92, 1.08), arco: cfg.arco, fare: cfg.fare, orienta: !!cfg.passo && tipo !== "pallottola",
                           scia: cfg.scia, fine: q => {
        if (tipo === "masso" || tipo === "palla"){ nuvola([q.x, q.z], { n: 4, r: 40 }); onda([q.x, q.z], { r: 60, col: "#a08c6c" }); }
        else scintille([q.x, q.z], { n: 3, r: 10, col: "#fff6c8", y: 8 });
      } });
    });
    return quanti * cfg.passo + cfg.ms + 300;
  }
  function fulmineFx(fx){
    const [p0, p1] = fx.p || [];
    if (!p0 || !p1) return 0;
    saetta(v3(p0, ALTEZZA), v3(p1, 8), fx.col || "#8dff5a");
    return 900;
  }
  function sagomaFx(fx, f, prima){
    const da = posDi(f, fx.da) || posDi(prima, fx.da);
    const p = (fx.p || [])[0];
    if (!da || !p) return 0;
    const p0 = bordo(da, p);
    const L = Math.hypot(p[0] - p0[0], p[1] - p0[1]), ms = Math.max(700, L * .9);
    nuvola(p0, { n: 3, r: 25, y: ALTEZZA });
    volo(v3(p0, ALTEZZA), v3(p, 6), { ms, arco: Math.max(90, L * .35), fare: sfera(G.masso, "#8c8478"), fine: () => {
      const r = fx.r || 40;
      const disco = new THREE.Mesh(new THREE.CircleGeometry(r, 48),
        new THREE.MeshBasicMaterial({ color: "#ff9a1f", transparent: true, opacity: .5, depthWrite: false, blending: THREE.AdditiveBlending }));
      disco.rotation.x = -Math.PI / 2; disco.position.copy(v3(p, 2));
      gruppo.add(disco);
      anima(1200, t => { disco.material.opacity = .5 * (1 - t); }, () => togli(disco));
      onda(p, { r: r * 1.6, col: "#c9a46a", ms: 800 });
      nuvola(p, { n: 6, r: r * 1.2 });
      scintille(p, { n: 12, r, col: "#cdb48a" });
    } });
    return ms + 700;
  }
  function pallaFx(fx){
    const [p0, p1, p2] = fx.p || [];
    if (!p0 || !p1) return 0;
    const L1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const L2 = p2 ? Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) : 0;
    const ms1 = Math.max(300, L1 * .4), ms2 = L2 > 2 ? Math.max(220, L2 * .35) : 0;
    svanisce(luce(p0, { col: "#ffb347", r: 45, y: ALTEZZA }), 300);
    nuvola(p0, { n: 5, r: 30, col: "#d9d3c7", y: ALTEZZA });
    const palla = sfera(G.palla, "#1d1d1d", { metalness: .4 });
    volo(v3(p0, ALTEZZA), v3(p1, 4), { ms: ms1, arco: Math.max(25, L1 * .1), fare: palla, fine: q => {
      nuvola([q.x, q.z], { n: 3, r: 30 });
      if (ms2) volo(q, v3(p2, 4), { ms: ms2, arco: 14, fare: palla, fine: r => nuvola([r.x, r.z], { n: 2, r: 22 }) });
    } });
    return ms1 + ms2 + 500;
  }
  function magiaFx(fx, f, prima){
    const da = posDi(f, fx.da) || posDi(prima, fx.da);
    const su = posDi(f, fx.su) || posDi(prima, fx.su) || da;
    if (!da) return 0;
    const st = C.stileMagia(fx.nome, fx.tipo), col = C.TINTA[st.col] || "#6fc3ff";
    runa([da.x, da.y], col);
    const tipo = st.tipo;
    const stessa = su === da || (su.x === da.x && su.y === da.y);
    if (tipo === "enchantment" || (stessa && tipo !== "vortex")){ dopo(350, () => aura(su, col)); return 1700; }
    if (tipo === "hex"){ dopo(300, () => aura(su, col, { scende: true, alto: 90 })); return 1800; }
    if (tipo === "conveyance"){ dopo(300, () => aura(da, col, { ms: 1100 })); return 1400; }
    if (tipo === "vortex"){
      dopo(300, () => {
        const r = Math.max(su.w, su.h) * .5;
        for (let k = 0; k < 14; k++){
          const s = luce([su.x, su.y], { col, r: 14 });
          const a0 = k / 14 * Math.PI * 2;
          anima(1500, t => {
            const a = a0 + t * 9, rr = r * (1 - .6 * t);
            s.position.set(su.x + Math.cos(a) * rr, 8 + 50 * t, su.y + Math.sin(a) * rr);
            s.material.opacity = Math.sin(Math.PI * t);
          }, () => togli(s));
        }
      });
      return 1900;
    }
    /* i dardi e gli assalti: qualcosa parte da chi lancia e arriva */
    if (st.col === "fulmine"){ dopo(300, () => saetta(v3([da.x, da.y], 30), v3([su.x, su.y], 8), col)); return 1100; }
    const p0 = bordo(da, [su.x, su.y]);
    const L = Math.hypot(su.x - p0[0], su.y - p0[1]), ms = Math.max(500, L * .7);
    dopo(300, () => volo(v3(p0, 30), v3([su.x, su.y], 14), { ms, arco: Math.max(20, L * .12), fare: globo(col, 26), scia: col,
      fine: q => {
        svanisce(luce(q, { col, r: 70 }), 600, { cresce: 1.6 });
        scintille([q.x, q.z], { n: 14, r: 45, col });
        onda([q.x, q.z], { r: Math.max(su.w, su.h) * .7, col });
      } }));
    return ms + 900;
  }
  function dissoltoFx(fx, f, prima){
    const da = posDi(f, fx.da) || posDi(prima, fx.da);
    const su = posDi(f, fx.su) || posDi(prima, fx.su) || da;
    const dal = fx.dal != null ? posDi(f, fx.dal) || posDi(prima, fx.dal) : null;
    if (!da) return 0;
    const col = C.TINTA[C.stileMagia(fx.nome, fx.tipo).col] || "#6fc3ff";
    runa([da.x, da.y], col);
    if (dal) dopo(150, () => runa([dal.x, dal.y], "#bfe9ff"));
    const a = v3([da.x, da.y], 30), b = su === da ? v3([da.x, da.y], 90) : v3([su.x, su.y], 30);
    const meta = a.clone().lerp(b, .5);
    dopo(300, () => volo(a, meta, { ms: 450, arco: 15, fare: globo(col, 22), fine: q => {
      scintille([q.x, q.z], { n: 12, r: 40, col: "#bfe9ff", y: q.y });
      svanisce(luce(q, { col: "#ffffff", r: 40 }), 400);
    } }));
    return 1300;
  }
  function fiascoFx(fx, f, prima){
    const da = posDi(f, fx.da) || posDi(prima, fx.da);
    if (!da) return 0;
    svanisce(luce([da.x, da.y], { col: "#b07bff", r: 90, y: 25 }), 900, { cresce: 1.5 });
    onda([da.x, da.y], { r: 90, col: "#b07bff", ms: 900 });
    scintille([da.x, da.y], { n: 18, r: 60, col: "#d8b4ff" });
    nuvola([da.x, da.y], { n: 4, r: 40, col: "#4a2a6e" });
    scritta([da.x, da.y], "✷", { col: "#d8b4ff" });
    return 1400;
  }
  function mischiaFx(fx, f, prima){
    const A = (fx.a || []).map(id => posDi(f, id) || posDi(prima, id)).filter(Boolean);
    const B = (fx.b || []).map(id => posDi(f, id) || posDi(prima, id)).filter(Boolean);
    if (!A.length || !B.length) return 0;
    for (const a of A) for (const b of B){
      const pa = bordo(a, [b.x, b.y]), pb = bordo(b, [a.x, a.y]);
      const c = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
      const dir = Math.atan2(b.y - a.y, b.x - a.x), lato = [-Math.sin(dir), Math.cos(dir)];
      const largo = Math.min(Math.max(a.w, a.h), Math.max(b.w, b.h)) * .45;
      for (let k = 0; k < 6; k++) dopo(k * 160, () => {
        const off = rnd(-largo, largo);
        scintille([c[0] + lato[0] * off, c[1] + lato[1] * off], { n: 6, r: 18, col: k % 2 ? "#fff6c8" : "#ffd23f", y: rnd(12, 26), ms: 320 });
      });
      scritta(c, "⚔", { ms: 1100 });
    }
    return 1200;
  }
  function caricaFx(fx, f, prima){
    const da = posDi(f, fx.da) || posDi(prima, fx.da), prima1 = posDi(prima, fx.da);
    if (!da) return 0;
    const da0 = prima1 || da;
    for (let k = 0; k < 6; k++) dopo(k * 90, () => {
      const t = k / 5;
      nuvola([lerp(da0.x, da.x, t), lerp(da0.y, da.y, t)], { n: 1, r: 35, col: "#b09a78", ms: 1000 });
    });
    scritta([da.x, da.y], fx.ok === false ? "✗" : "!", { col: fx.ok === false ? "#ffb0a6" : "#fff" });
    return 1100;
  }
  function iconaFx(testo, col){
    return (fx, f, prima) => {
      const da = posDi(f, fx.da) || posDi(prima, fx.da);
      if (!da) return 0;
      scritta([da.x, da.y], testo, { col, ms: 1500 });
      return 1300;
    };
  }
  function perditeFx(fx, f, prima){
    const da = posDi(f, fx.da) || posDi(prima, fx.da);
    if (!da) return 0;
    const n = fx.n || 1;
    for (let k = 0; k < Math.min(6, n); k++) dopo(k * 80, () => {
      const p = dentro(da, .4);
      svanisce(luce(p, { col: "#ff4a3a", r: 30, y: 10 }), 650, { cresce: 1.4 });
    });
    scritta([da.x, da.y], (fx.ferite ? "−" + n + "♥" : "−" + n), { col: "#ff6a5a", ms: 1600 });
    return 1300;
  }
  function distruttoFx(fx, f, prima){
    const u = posDi(prima, fx.da) || posDi(f, fx.da);
    if (!u) return 0;
    const R = Math.max(u.w, u.h) * .6 + 20;
    scintille([u.x, u.y], { n: 16, r: R, col: "#7d756a", ms: 900 });
    nuvola([u.x, u.y], { n: 6, r: R, col: "#7d756a", ms: 1300 });
    scritta([u.x, u.y], fx.fuga ? "⚑" : "☠", { ms: 1800, alto: 34 });
    return 1500;
  }
  const FX = { tiro: tiroFx, fulmine: fulmineFx, sagoma: sagomaFx, palla: pallaFx, magia: magiaFx, dissolto: dissoltoFx,
               fiasco: fiascoFx, mischia: mischiaFx, carica: caricaFx, fuga: iconaFx("⚑", "#ffffff"),
               paura: iconaFx("!", "#ff5a4a"), perdite: perditeFx, distrutto: distruttoFx };

  /* Lo stesso calendario del motore 2D: i colpi uno dietro l'altro, chi
     cade dopo che i colpi sono arrivati. Torna quanto dura. */
  function giocaEffetti(f, prima, { ritmo = 1 } = {}){
    if (quieto() || !f) return 0;
    const passo = 650 / Math.max(1, ritmo);
    const lista = C.effettiDi(f).slice(0, 8);
    const { dopoFx } = C.cambiDi(f, prima);
    let t = 250, fine = 0;
    for (const fx of lista){
      const fn = FX[fx.k];
      if (!fn) continue;
      const parti = t;
      dopo(parti, () => fn(fx, f, prima));
      t += passo;
      fine = parti + 1400;
    }
    const poi = lista.length ? t + 250 : 150;
    for (const fx of dopoFx){
      dopo(poi, () => FX[fx.k] && FX[fx.k](fx, f, prima));
      fine = Math.max(fine, poi + 1300);
    }
    return Math.min(4800, fine);
  }
  function gioca(fx, f, prima){
    if (quieto() || !fx || !FX[fx.k]) return 0;
    return FX[fx.k](fx, f, prima || f) || 0;
  }

  return { giocaEffetti, gioca, pulisci, aggiorna, cambiDi: C.cambiDi };
}
