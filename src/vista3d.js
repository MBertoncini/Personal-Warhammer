/* Schieramento Old World — il tavolo in 3D
 *
 * Un modo di GUARDARE il tavolo con le miniature vere, non un secondo
 * tavolo su cui giocare: le decisioni restano sul disegno 2D, che sa le
 * regole. Entra una fotografia del tavolo — le unita' con il loro centro,
 * la rotazione e le caselle di ogni modello, in millimetri — ed esce una
 * scena three.js. La stessa vista sta in due posti:
 *
 *   - sopra il tavolo dell'app (`apriTavolo3D`), che le passa
 *     `tavolo3D()` di deploy.js a ogni ridisegno: la partita a mano, la
 *     sfida e l'AI contro l'AI;
 *   - dentro la pagina della partita da rivedere (replay.js), che le
 *     passa un fotogramma alla volta.
 *
 * I PEZZI SCIVOLANO. Fra una fotografia e l'altra ogni unita' va dal
 * punto e dalla rotazione in cui era a quelli nuovi, tutta insieme, come
 * fa il disegno 2D (scena.js): un reggimento che ruota gira intorno al
 * suo centro, non si sfalda in trenta modelli che tagliano l'angolo.
 * Chi muore sparisce, chi arriva compare. Una fotografia che arriva a
 * meta' strada riparte da dove il pezzo e' arrivato.
 *
 * IL TERRENO SI TOCCA. Chi sale su una collina ci cammina sopra, con la
 * basetta inclinata come il pendio, e non ci entra dentro; chi entra in
 * un bosco o fra le rovine li fa diventare trasparenti, se no gli alberi
 * e i muri lo nascondono proprio quando combatte li'. I conti (la quota,
 * l'appoggio, chi sta dentro) sono in tavolo3d.js, senza three.js.
 *
 * SI LEGGE COME IL 2D. Sopra ogni unita' il nome con i modelli rimasti,
 * e passando sopra un pezzo la sua scheda: modelli, ferite, chi c'e'
 * unito, fuga, mischia; sopra il terreno, che cosa fa. Chi chiama mette
 * quello che sa in `info` di ogni unita' (vedi tavolo3d.js). Sopra il
 * tavolo dell'app la partita contro l'AI riempie la barra dei comandi e
 * il registro delle mosse (la «regia», in fondo a questo file).
 *
 * I modelli, chi e' chi e il comando in prima fila stanno in
 * modelli3d.js; qui ci sono solo la scena e la finestra.
 *
 * Coordinate: la x del tavolo e' la X di three, la y del tavolo e' la Z,
 * l'alto e' Y. Il fronte di un'unita' e' la y negativa, cioe' -Z; la
 * rotazione del disegno va al contrario perche' l'SVG ha la y in giu'.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as M3 from './modelli3d.js';
import { motore3D } from './fx3d.js';
import * as T3 from './tavolo3d.js';

/* i modelli di Modly guardano verso +Z, il fronte di un'unita' e' -Z */
const FRONTE = Math.PI;
/* il bordino colorato sotto le basette: dice di chi e' la miniatura */
const BORDO = 1.6, ALTO_BORDO = 1.5;
const COL = { A: "#b0413a", B: "#2f6f96" };
const PLASTICA = { A: "#d2c4bc", B: "#bfcbd0" };
const RAD = Math.PI / 180;
/* i colori di ogni istanza: la plastica resta com'e' (bianco moltiplica
   per uno), il bordino ha il colore dell'esercito; l'unita' sotto il
   mouse si scalda e il suo bordino diventa d'oro */
const BIANCO = new THREE.Color(1, 1, 1), LUCE = new THREE.Color(1.5, 1.22, .62);
const TINTA = { A: new THREE.Color(COL.A), B: new THREE.Color(COL.B) }, ORO = new THREE.Color("#f5c542");
const esc =s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* Lo stile della scheda e dei nomi sta qui e non nei fogli delle due
   pagine: la vista vive nell'app e nella partita da rivedere, e deve
   vestirsi uguale in tutte e due. Scura, perche' sta sopra un tavolo
   in penombra. */
const CSS = `
.v3d-nomi{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:2;}
.v3d-nomi[hidden]{display:none;}
.v3d-nome{position:absolute;left:0;top:0;white-space:nowrap;padding:1px 7px 1px;border-radius:999px;
  font:600 11.5px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;color:#fff;background:rgba(18,16,12,.62);
  border-bottom:2px solid var(--c);will-change:transform;}
.v3d-nome.fuga{opacity:.7;font-style:italic;}
.v3d-nome.su{background:#f5c542;color:#1c160b;z-index:1;}
.v3d-tip{position:absolute;z-index:5;max-width:290px;padding:8px 11px;border-radius:9px;pointer-events:none;
  background:rgba(30,27,21,.95);color:#ece6d8;border:1px solid #4d4638;box-shadow:0 8px 24px rgba(0,0,0,.45);
  font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;}
.v3d-tip[hidden]{display:none;}
.v3d-tip > b:first-child{display:block;font-size:14px;margin-bottom:2px;}
.v3d-tip b{color:#fff;}
.v3d-es{display:inline-block;margin:2px 0 4px;padding:1px 8px;border-radius:999px;background:#3b362c;color:#d9d1c1;
  font-size:11.5px;font-weight:600;}
.v3d-es-A{background:${COL.A};color:#fff;} .v3d-es-B{background:${COL.B};color:#fff;}
.v3d-mut{color:#aaa18f;}
.v3d-perso{color:#ff8a7a;}
.v3d-stato-u{color:#f5c542;font-weight:600;}
.v3d-tip ul{margin:2px 0 0;padding-left:16px;}
`;
function stile(){
  if (document.getElementById("v3d-css")) return;
  const s = document.createElement("style");
  s.id = "v3d-css"; s.textContent = CSS;
  document.head.appendChild(s);
}

/* ============================================================
   1 · IL TAVOLO E IL TERRENO
   ============================================================ */

/* un generatore di numeri ripetibile: lo stesso bosco ha gli alberi
   negli stessi posti a ogni ridisegno */
function semeDa(n){ return () => ((n = (n * 1664525 + 1013904223) >>> 0) / 4294967296); }

/* Il tappeto: il colore del campo, la griglia da 6" del disegno e la
   linea di meta' tavolo, dipinti su una texture. */
function tappeto(W, H){
  const c = document.createElement("canvas");
  const k = 2048 / Math.max(W, H);
  c.width = Math.round(W * k); c.height = Math.round(H * k);
  const g = c.getContext("2d");
  g.fillStyle = "#7d8a5c"; g.fillRect(0, 0, c.width, c.height);
  const rnd = semeDa(7);
  for (let i = 0; i < 2500; i++){
    g.fillStyle = rnd() < .5 ? "rgba(255,255,230,.035)" : "rgba(30,40,10,.04)";
    g.beginPath(); g.arc(rnd() * c.width, rnd() * c.height, 4 + rnd() * 22, 0, 7); g.fill();
  }
  g.strokeStyle = "rgba(255,255,240,.10)"; g.lineWidth = 1.2;
  for (let x = 6 * 25.4; x < W - 1; x += 6 * 25.4){ g.beginPath(); g.moveTo(x * k, 0); g.lineTo(x * k, c.height); g.stroke(); }
  for (let y = 6 * 25.4; y < H - 1; y += 6 * 25.4){ g.beginPath(); g.moveTo(0, y * k); g.lineTo(c.width, y * k); g.stroke(); }
  g.strokeStyle = "rgba(255,255,240,.22)"; g.setLineDash([14, 9]); g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, c.height / 2); g.lineTo(c.width, c.height / 2); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function pezzoTerreno(t, i){
  const g = new THREE.Group();
  const col = new THREE.Color(t.colore || "#c8bda8");
  const mat = (c = col, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .95, ...extra });
  const ombra = m => { m.castShadow = m.receiveShadow = true; return m; };
  const rnd = semeDa(i * 7919 + 13);
  const tondo = t.forma === "circle" || t.forma === "token";
  const piatto = (alto, m = mat()) => ombra(new THREE.Mesh(
    tondo ? new THREE.CylinderGeometry(t.w / 2, t.w / 2, alto, 48) : new THREE.BoxGeometry(t.w, alto, t.h), m));
  /* gli alberi e i muri: si fanno trasparenti quando dentro c'e' qualcuno */
  const velo = [], alti = [];

  switch (t.kind){
    case "hill": {
      g.add(ombra(new THREE.Mesh(geoCollina(t), mat())));
      break;
    }
    case "wood": {
      const base = piatto(3); base.position.y = 1.5; g.add(base);
      const quanti = Math.max(3, Math.round(t.w * t.h / 4500));
      const tronco = mat(new THREE.Color("#5a4632")), chioma = mat(new THREE.Color("#3f5a32"));
      for (let k = 0; k < quanti; k++){
        const x = (rnd() - .5) * t.w * .8, z = (rnd() - .5) * t.h * .8, s = .8 + rnd() * .5;
        const tr = ombra(new THREE.Mesh(new THREE.CylinderGeometry(4 * s, 6 * s, 40 * s, 8), tronco));
        tr.position.set(x, 20 * s, z);
        const ch = ombra(new THREE.Mesh(new THREE.ConeGeometry(28 * s, 90 * s, 10), chioma));
        ch.position.set(x, 80 * s, z);
        g.add(tr, ch);
        alti.push(tr, ch);
      }
      velo.push(tronco, chioma);
      break;
    }
    case "marsh": {
      const m = piatto(1.5, mat(col, { roughness: .25, metalness: .1 })); m.position.y = .8; g.add(m);
      break;
    }
    case "ruins": {
      const base = piatto(3); base.position.y = 1.5; g.add(base);
      const pietra = mat(new THREE.Color("#a59d8e"));
      for (const [lx, lz, w, d] of [[0, -.45, 1, .08], [-.45, 0, .08, .9], [.3, .45, .4, .08]]){
        const alto = 30 + rnd() * 50;
        const m = ombra(new THREE.Mesh(new THREE.BoxGeometry(Math.max(8, w * t.w), alto, Math.max(8, d * t.h)), pietra));
        m.position.set(lx * t.w, alto / 2, lz * t.h);
        g.add(m);
        alti.push(m);
      }
      velo.push(pietra);
      break;
    }
    case "wall": {
      const m = ombra(new THREE.Mesh(new THREE.BoxGeometry(t.w, 25, Math.max(t.h, 10)), mat()));
      m.position.y = 12.5; g.add(m);
      break;
    }
    case "pyramid": {
      const m = ombra(new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4), mat()));
      m.rotation.y = Math.PI / 4; m.scale.set(t.w / Math.SQRT2, 150, t.h / Math.SQRT2); m.position.y = 75;
      g.add(m);
      break;
    }
    case "treasure": {
      const m = piatto(4); m.position.y = 2; g.add(m);
      break;
    }
    default: {
      /* monoliti, punti di riferimento e quello che verra': un pezzo
         alto se blocca la vista, basso se no */
      const alto = /impass|highWall|alto|monolith|landmark/i.test((t.cat || "") + " " + (t.kind || "")) ? 120 : 6;
      const m = piatto(alto); m.position.y = alto / 2; g.add(m);
    }
  }
  g.position.set(t.x, 0, t.y);
  g.rotation.y = -(t.rot || 0) * RAD;
  g.userData = { pezzo: i, velo, alti, opacita: 1 };
  return g;
}

/* La collina: la cupola che `T3.quota` misura, anello per anello, cosi'
   chi ci cammina sopra la tocca davvero. Prima era mezza sfera alta
   cinque centimetri e le miniature ci stavano dentro fino alla vita. */
function geoCollina(t){
  const ANELLI = 20, SPICCHI = 64, H = T3.altezzaCollina(t);
  const pos = [0, H * T3.profilo(0), 0], ind = [];
  for (let i = 1; i <= ANELLI; i++){
    const r = i / ANELLI;
    for (let j = 0; j < SPICCHI; j++){
      const [u, v] = T3.bordoCollina(t, j / SPICCHI * Math.PI * 2);
      pos.push(u * r * t.w / 2, H * T3.profilo(r), v * r * t.h / 2);
    }
  }
  /* i triangoli girano in senso antiorario visti dall'alto: la faccia
     buona guarda in su */
  for (let j = 0; j < SPICCHI; j++) ind.push(0, 1 + (j + 1) % SPICCHI, 1 + j);
  for (let i = 1; i < ANELLI; i++){
    const a = 1 + (i - 1) * SPICCHI, b = 1 + i * SPICCHI;
    for (let j = 0; j < SPICCHI; j++){
      const j1 = (j + 1) % SPICCHI;
      ind.push(a + j, a + j1, b + j, a + j1, b + j1, b + j);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(ind);
  geo.computeVertexNormals();
  return geo;
}

/* un bosco o una rovina piu' o meno trasparente: i materiali sono suoi */
function vela(g, o){
  const { velo, alti } = g.userData;
  const vetro = o < .995;
  for (const m of velo){
    if (m.transparent !== vetro){ m.transparent = vetro; m.depthWrite = !vetro; m.needsUpdate = true; }
    m.opacity = o;
  }
  /* un albero quasi invisibile non fa ombra su chi ci sta sotto */
  for (const m of alti) m.castShadow = o > .6;
  g.userData.opacita = o;
}

/* le geometrie dei modelli e i materiali condivisi restano: si buttano
   solo le cose fatte apposta per questo disegno */
function liberaGruppo(g){
  g.traverse(o => {
    if (o.isInstancedMesh){ o.dispose(); return; }
    if (!o.isMesh) return;
    if (!o.geometry.userData.tenere) o.geometry.dispose();
    for (const m of [].concat(o.material)) if (!m.userData.tenere) m.dispose();
  });
}

/* ============================================================
   2 · LA VISTA
   `scelta(catId, nome, id)`: il modello scelto a mano (undefined =
   automatico, "" = nessuno). `nomeCatalogo(catId, id)`: il nome della
   voce del catalogo, che abbina meglio del nome della lista. `stato(s)`: a
   ogni disegno, quante miniature e quali senza modello.
   ============================================================ */
export async function creaVista(host, { scelta = () => undefined, nomeCatalogo = () => null, stato = () => {} } = {}){
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.className = "v3d-canvas";
  host.appendChild(renderer.domElement);
  stile();
  if (getComputedStyle(host).position === "static") host.style.position = "relative";
  /* i nomi sopra le teste e la scheda di chi ci passi sopra: HTML sopra
     la tela, che si legge meglio di una scritta dentro la scena */
  const strato = document.createElement("div");
  strato.className = "v3d-nomi";
  const tip = document.createElement("div");
  tip.className = "v3d-tip"; tip.hidden = true; tip.setAttribute("role", "tooltip");
  host.append(strato, tip);

  const scena = new THREE.Scene();
  scena.background = new THREE.Color("#1d211c");
  const camera = new THREE.PerspectiveCamera(40, 1, 5, 20000);
  /* il terreno dell'ultimo tavolo: dice quanto sale il suolo */
  let suolo = [];
  /* frecce, incantesimi, mischie: fx3d.js, sopra le miniature e alla
     quota del suolo, se no su una collina partono da dentro la terra */
  const fx = motore3D(scena, { quota: (x, y) => T3.quota(suolo, x, y) });
  const controlli = new OrbitControls(camera, renderer.domElement);
  controlli.enableDamping = true;
  controlli.maxPolarAngle = Math.PI / 2 - .04;
  controlli.minDistance = 40; controlli.maxDistance = 4000;

  let sorgente = await M3.trovaSorgente();
  let cat = M3.catalogoModelli(sorgente && sorgente.indice);
  const caricate = new Map();          // file -> Promise<BufferGeometry>
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const geometria = file => {
    if (!caricate.has(file)) caricate.set(file, sorgente.leggi(file).then(buf => new Promise((ok, ko) =>
      loader.parse(buf, "", g => {
        let geo = null;
        g.scene.traverse(o => { if (o.isMesh && !geo) geo = o.geometry; });
        if (geo) geo.userData.tenere = true;
        geo ? ok(geo) : ko(new Error("vuoto: " + file));
      }, ko))));
    return caricate.get(file);
  };
  const scatola = new THREE.BoxGeometry(1, 1, 1);
  scatola.userData.tenere = true;
  const materiali = {};
  const mat = (k, fare) => {
    if (!materiali[k]){ materiali[k] = fare(); materiali[k].userData.tenere = true; }
    return materiali[k];
  };

  /* ---- il tavolo e la luce, che cambiano solo con le misure ---- */
  let fisso = null;
  function preparaTavolo(W, H){
    if (fisso && fisso.W === W && fisso.H === H) return;
    if (fisso){ scena.remove(fisso.g); liberaGruppo(fisso.g); }
    const g = new THREE.Group();
    const legno = new THREE.MeshStandardMaterial({ color: "#4a3d2e", roughness: .9 });
    const piano = new THREE.Mesh(new THREE.BoxGeometry(W, 20, H),
      [legno, legno, new THREE.MeshStandardMaterial({ map: tappeto(W, H), roughness: .95 }), legno, legno, legno]);
    piano.position.set(W / 2, -10, H / 2);
    piano.receiveShadow = true;
    g.add(piano);
    g.add(new THREE.HemisphereLight("#e8efff", "#4a4030", 1.1));
    const sole = new THREE.DirectionalLight("#fff3e0", 2.4);
    sole.position.set(W * .25, 1400, -H * .3);
    sole.target.position.set(W / 2, 0, H / 2);
    sole.castShadow = true;
    sole.shadow.mapSize.set(4096, 4096);
    const m = Math.max(W, H) * .75;
    Object.assign(sole.shadow.camera, { left: -m, right: m, top: m, bottom: -m, near: 100, far: 4000 });
    sole.shadow.bias = -0.0004;
    sole.shadow.normalBias = 0.6;
    g.add(sole, sole.target);
    scena.add(g);
    fisso = { W, H, g };
    if (!camera.userData.messa){ inquadra("A"); camera.userData.messa = true; }
  }

  let terreno = null, firmaTerreno = "";
  function preparaTerreno(lista){
    suolo = lista;
    const firma = JSON.stringify(lista);
    if (firma === firmaTerreno) return;
    if (terreno){ scena.remove(terreno); liberaGruppo(terreno); }
    terreno = new THREE.Group();
    lista.forEach((t, i) => terreno.add(pezzoTerreno(t, i)));
    scena.add(terreno);
    firmaTerreno = firma;
  }

  /* ---- le miniature ----
     `pose`: dove ogni unita' e' disegnata ADESSO, anche a meta' viaggio */
  const pose = new Map();
  let pezzi = null, istanze = [], viaggi = new Map(), t0 = 0, durata = 0, giro = 0, durata1 = 450;
  let ultimo = null, tipi = [];

  const modelloDi = (catId, nome, id) => M3.modelloPer(cat, {
    catId, nome, nomeCatalogo: nomeCatalogo(catId, id), scelta: scelta(catId, nome, id) });

  async function costruisci(tv, { salto }){
    const mio = ++giro;
    const nuovo = new THREE.Group();
    const gruppi = new Map(), blocchi = [], bordi = [], senza = new Map(), elenco = new Map();
    let modelli = 0;
    /* i tipi di unita' sul tavolo, per il pannello delle scelte */
    const segna = (catId, nome, id, m) => {
      const k = M3.chiaveScelta(catId, nome);
      if (!elenco.has(k)) elenco.set(k, { catId, nome, nomeCatalogo: nomeCatalogo(catId, id),
                                          modello: m ? m.id : null, scelto: scelta(catId, nome, id) !== undefined, quanti: 0 });
      return elenco.get(k);
    };
    const metti = (u, c, posa, chi) => {
      modelli++;
      chi.quanti++;
      bordi.push({ es: u.esercito, uid: u.uid, c, alto: ALTO_BORDO / 2, sx: c.w + BORDO, sy: ALTO_BORDO, sz: c.h + BORDO,
                   tinta: TINTA[u.esercito === "B" ? "B" : "A"], luce: ORO });
      if (!posa){
        const n = chi.nomeCatalogo || chi.nome;
        senza.set(n, (senza.get(n) || 0) + 1);
        const alto = Math.min(45, Math.max(20, Math.min(c.w, c.h) * 1.1));
        blocchi.push({ es: u.esercito, uid: u.uid, c, alto: ALTO_BORDO + alto / 2, sx: c.w, sy: alto, sz: c.h, tinta: BIANCO, luce: LUCE });
        return;
      }
      const s = Math.min(c.w / posa.base.w, c.h / posa.base.d);
      const k = posa.file + "|" + u.esercito;
      if (!gruppi.has(k)) gruppi.set(k, { file: posa.file, es: u.esercito, l: [] });
      gruppi.get(k).l.push({ uid: u.uid, c, alto: ALTO_BORDO, sx: s, sy: s, sz: s, giro: FRONTE, tinta: BIANCO, luce: LUCE });
    };

    for (const u of tv.unita){
      const truppa = u.celle.filter(c => !c.char);
      if (truppa.length){
        const m = modelloDi(u.catId, u.nome, u.uid);
        const chi = segna(u.catId, u.nome, u.uid, m);
        const pp = m ? M3.posePerCelle(m, truppa, { command: u.command, armi: u.armi }) : [];
        /* `blocco`: una partita vecchia senza le basette una per una */
        truppa.forEach((c, j) => metti(u, c, c.blocco ? null : pp[j] || null, chi));
      }
      for (const c of u.celle.filter(c => c.char)){
        const m = modelloDi(c.catId, c.nome, c.id);
        const chi = segna(c.catId, c.nome, c.id, m);
        metti(u, c, m ? M3.posePerCelle(m, [c], { armi: c.armi })[0] : null, chi);
      }
    }

    const nuove = [];
    /* ogni istanza sa di chi e' (per la scheda e per accendersi) e ha il
       suo colore: quello di sempre, e quello di quando la si guarda */
    const istanzia = (geo, materiale, lista) => {
      const im = new THREE.InstancedMesh(geo, materiale, lista.length);
      im.castShadow = im.receiveShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.userData.chi = lista.map(x => ({ uid: x.uid, c: x.c }));
      lista.forEach((x, i) => { nuove.push({ im, i, ...x }); im.setColorAt(i, x.uid === acceso ? x.luce : x.tinta); });
      nuovo.add(im);
    };
    for (const es of ["A", "B"]){
      const b = bordi.filter(x => x.es === es), k = blocchi.filter(x => x.es === es);
      if (b.length) istanzia(scatola, mat("bordo", () => new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: .7 })), b);
      if (k.length) istanzia(scatola, mat("blocco" + es, () => new THREE.MeshStandardMaterial({ color: COL[es], roughness: .7, transparent: true, opacity: .85 })), k);
    }
    let triangoli = 0;
    const errori = [];
    const lista = [...gruppi.values()];
    const geos = await Promise.all(lista.map(gr => geometria(gr.file).catch(() => { errori.push(gr.file); return null; })));
    if (mio !== giro){ liberaGruppo(nuovo); return; }      // nel frattempo e' arrivato un altro tavolo
    lista.forEach((gr, j) => {
      const geo = geos[j];
      if (!geo) return;
      istanzia(geo, mat("plastica" + gr.es, () => new THREE.MeshStandardMaterial({ color: PLASTICA[gr.es], roughness: .62, metalness: .05 })), gr.l);
      triangoli += (geo.index ? geo.index.count : geo.attributes.position.count) / 3 * gr.l.length;
    });

    /* il viaggio: ogni unita' da dove e' disegnata ora a dove deve stare */
    viaggi = new Map();
    for (const u of tv.unita){
      const a = pose.get(u.uid), b = { x: u.x, y: u.y, rot: u.rot || 0 };
      viaggi.set(u.uid, { a: !salto && a ? a : b, b });
    }
    for (const k of [...pose.keys()]) if (!viaggi.has(k)) pose.delete(k);
    t0 = performance.now(); durata = salto ? 0 : durata1;

    if (pezzi){ scena.remove(pezzi); liberaGruppo(pezzi); }
    pezzi = nuovo; istanze = nuove;
    scena.add(pezzi);
    muovi(t0);
    tipi = [...elenco.values()];
    unita = new Map(tv.unita.map(u => [u.uid, u]));
    nomi = tv.nomi || {};
    etichette(tv.unita);
    if (guardato && guardato.uid != null && !unita.has(guardato.uid)){ guardato = null; fermo = false; }
    aggiornaTip();
    stato({ unita: tv.unita.length, modelli, senza, triangoli, errori,
            fonte: !sorgente ? "nessuno" : sorgente.come, tipi });
  }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  const su = new THREE.Vector3(0, 1, 0), qPendio = new THREE.Quaternion(), qGiro = new THREE.Quaternion();
  /* i boschi e le rovine con qualcuno dentro */
  let velati = new Set();
  const morbido = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  /* mette ogni istanza dove la sua unita' e' arrivata */
  function muovi(ora){
    const t = durata > 0 ? Math.min(1, (ora - t0) / durata) : 1, e = morbido(t);
    for (const [uid, v] of viaggi){
      const d = ((v.b.rot - v.a.rot) % 360 + 540) % 360 - 180;
      pose.set(uid, { x: v.a.x + (v.b.x - v.a.x) * e, y: v.a.y + (v.b.y - v.a.y) * e, rot: v.a.rot + d * e });
    }
    /* Ogni basetta si appoggia al suolo (`T3.appoggio`): sale sulla
       collina, si inclina come il pendio, e la miniatura con lei. La
       basetta e il modello che ci sta sopra sono due istanze della
       stessa casella: il conto si fa una volta. */
    const toccate = new Set(), appoggi = new Map(), centri = [];
    for (const x of istanze){
      const u = pose.get(x.uid);
      if (!u) continue;
      let ap = appoggi.get(x.c);
      if (!ap){
        const a = u.rot * RAD, co = Math.cos(a), si = Math.sin(a);
        const cx = u.x + x.c.lx * co - x.c.ly * si, cz = u.y + x.c.lx * si + x.c.ly * co;
        const s = T3.appoggio(suolo, cx, cz, x.c.w, x.c.h, u.rot + (x.c.rot || 0));
        ap = { cx, cz, z: s.z, n: new THREE.Vector3(-s.gx, 1, -s.gy).normalize() };
        appoggi.set(x.c, ap);
        centri.push([cx, cz]);
      }
      qGiro.setFromAxisAngle(su, -(u.rot + (x.c.rot || 0)) * RAD + (x.giro || 0));
      qPendio.setFromUnitVectors(su, ap.n);
      q.multiplyQuaternions(qPendio, qGiro);
      pos.set(ap.cx, ap.z, ap.cz).addScaledVector(ap.n, x.alto);
      x.im.setMatrixAt(x.i, m4.compose(pos, q, sc.set(x.sx, x.sy, x.sz)));
      toccate.add(x.im);
    }
    for (const im of toccate){ im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
    velati = T3.occupati(suolo, centri);
    /* i pezzi passano sotto il mouse fermo: si riguarda chi c'e' */
    cercare = true;
  }

  /* ---- i boschi che si velano ----
     Chi entra in un bosco o fra le rovine sparisce dietro gli alberi e i
     muri: il pezzo si fa trasparente finche' c'e' qualcuno dentro, e
     torna pieno quando escono. Piano, per non lampeggiare. */
  function sfuma(dt){
    if (!terreno) return;
    for (const g of terreno.children){
      if (!g.userData.velo || !g.userData.velo.length) continue;
      const voluto = velati.has(g.userData.pezzo) ? .22 : 1;
      let o = g.userData.opacita;
      if (o === voluto) continue;
      o += (voluto - o) * Math.min(1, dt / 140);
      vela(g, Math.abs(o - voluto) < .01 ? voluto : o);
    }
  }

  /* ---- chi c'e' sotto il mouse ----
     Passando sopra un'unita' si legge che cos'e' e quanti ne restano,
     come nel disegno 2D, e l'unita' si accende; passando sopra un pezzo
     di terreno, che cosa fa. Un clic (o un tocco col dito) la ferma, un
     altro clic la lascia. */
  let unita = new Map(), nomi = {}, acceso = null, guardato = null, fermo = false;
  let puntatore = null, cercare = false;
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  function colpito(cx, cy){
    const r = renderer.domElement.getBoundingClientRect();
    mouse.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
    ray.setFromCamera(mouse, camera);
    /* prima le miniature: dentro un bosco velato gli alberi sono piu'
       vicini, ma chi guarda vuole il reggimento */
    if (pezzi) for (const h of ray.intersectObject(pezzi, true)){
      const k = h.object.userData.chi && h.object.userData.chi[h.instanceId];
      if (k) return { uid: k.uid, c: k.c };
    }
    if (terreno) for (const h of ray.intersectObject(terreno, true)){
      let o = h.object;
      while (o && o.userData.pezzo == null) o = o.parent;
      if (o && suolo[o.userData.pezzo]) return { t: o.userData.pezzo };
    }
    return null;
  }
  function accendi(uid){
    if (uid === acceso) return;
    acceso = uid;
    const toccate = new Set();
    for (const x of istanze){ x.im.setColorAt(x.i, x.uid === uid ? x.luce : x.tinta); toccate.add(x.im); }
    for (const im of toccate) if (im.instanceColor) im.instanceColor.needsUpdate = true;
    for (const [id, el] of nomiSu) el.classList.toggle("su", id === uid);
  }
  function aggiornaTip(){
    const g = guardato;
    const html = !g ? "" : g.uid != null ? (unita.has(g.uid) ? T3.schedaHTML(unita.get(g.uid), { nomi, cella: g.c }) : "")
                     : suolo[g.t] ? T3.terrenoHTML(suolo[g.t]) : "";
    accendi(g && g.uid != null && html ? g.uid : null);
    if (!html){ tip.hidden = true; return; }
    tip.innerHTML = html;
    tip.hidden = false;
    const r = host.getBoundingClientRect();
    const x = g.dove.x - r.left, y = g.dove.y - r.top;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = Math.max(4, Math.min(r.width - tw - 4, x + 14)) + "px";
    tip.style.top = (y + th + 18 > r.height ? Math.max(4, y - th - 12) : y + 16) + "px";
  }
  /* la stessa cosa anche dopo un ridisegno, che rifa' le caselle */
  const stessa = (a, b) => !!a && !!b && a.uid === b.uid && (a.c && a.c.i) === (b.c && b.c.i) && a.t === b.t;
  function guarda(cx, cy){
    if (fermo) return;
    const k = colpito(cx, cy);
    guardato = k ? { ...k, dove: { x: cx, y: cy } } : null;
    aggiornaTip();
  }
  const tela = renderer.domElement;
  /* anche la telecamera che gira (a mano, o con «Da A») cambia chi c'e'
     sotto il mouse; mentre si trascina no, la scheda resta dov'era */
  controlli.addEventListener("change", () => { if (!giu) cercare = true; });
  tela.addEventListener("pointermove", e => {
    /* trascinando si gira la telecamera: non si cerca niente */
    if (e.pointerType !== "mouse" || e.buttons) return;
    puntatore = { x: e.clientX, y: e.clientY }; cercare = true;
  });
  tela.addEventListener("pointerleave", () => { puntatore = null; if (!fermo){ guardato = null; aggiornaTip(); } });
  let giu = null;
  tela.addEventListener("pointerdown", e => { giu = { x: e.clientX, y: e.clientY }; });
  tela.addEventListener("pointerup", e => {
    const da = giu;
    giu = null;
    if (!da || Math.hypot(e.clientX - da.x, e.clientY - da.y) > 6) return;
    const k = colpito(e.clientX, e.clientY);
    if (!k || (fermo && stessa(k, guardato))){ fermo = false; guardato = null; }
    else { fermo = true; guardato = { ...k, dove: { x: e.clientX, y: e.clientY } }; }
    aggiornaTip();
  });

  /* ---- i nomi sopra le teste ----
     Come le etichette del disegno 2D: il nome, i modelli rimasti, le
     ferite, chi fugge e chi e' in mischia. Si spengono dalla barra. */
  const nomiSu = new Map();
  let nomiAccesi = true;
  function etichette(lista){
    const visti = new Set();
    for (const u of lista){
      visti.add(u.uid);
      let el = nomiSu.get(u.uid);
      if (!el){ el = document.createElement("div"); el.className = "v3d-nome"; strato.appendChild(el); nomiSu.set(u.uid, el); }
      el.textContent = T3.etichetta(u);
      el.style.setProperty("--c", COL[u.esercito === "B" ? "B" : "A"]);
      el.classList.toggle("fuga", !!(u.info && u.info.fuga));
      el.classList.toggle("su", u.uid === acceso);
    }
    for (const [id, el] of nomiSu) if (!visti.has(id)){ el.remove(); nomiSu.delete(id); }
  }
  /* l'altezza a cui sta il nome: sopra le teste, piu' in alto per i mostri */
  const altoDi = u => {
    const c = (u.celle || [])[0];
    return c ? Math.min(110, Math.max(40, Math.max(c.w, c.h) * 1.1)) : 45;
  };
  const proietta = new THREE.Vector3();
  function posaNomi(){
    strato.hidden = !nomiAccesi;
    if (!nomiAccesi) return;
    const w = host.clientWidth, h = host.clientHeight;
    for (const [uid, el] of nomiSu){
      const p = pose.get(uid), u = unita.get(uid);
      if (!p || !u){ el.style.display = "none"; continue; }
      proietta.set(p.x, T3.quota(suolo, p.x, p.y) + altoDi(u), p.y).project(camera);
      if (proietta.z > 1 || Math.abs(proietta.x) > 1.2 || Math.abs(proietta.y) > 1.2){ el.style.display = "none"; continue; }
      el.style.display = "";
      el.style.transform = `translate(${((proietta.x + 1) / 2 * w).toFixed(1)}px,${((1 - proietta.y) / 2 * h).toFixed(1)}px) translate(-50%,-100%)`;
    }
  }

  /* ---- il giro del disegno ---- */
  let vivo = true, inMoto = false, prima = performance.now();
  function ciclo(){
    if (!vivo || !host.isConnected){ inMoto = false; return; }
    const ora = performance.now(), dt = Math.min(100, ora - prima);
    prima = ora;
    if (durata > 0 && ora - t0 <= durata + 50) muovi(ora);
    sfuma(dt);
    fx.aggiorna(ora);
    controlli.update();
    if (cercare && puntatore){ cercare = false; guarda(puntatore.x, puntatore.y); }
    renderer.render(scena, camera);
    posaNomi();
    requestAnimationFrame(ciclo);
  }
  const parti = () => { if (!inMoto){ inMoto = true; requestAnimationFrame(ciclo); } };

  function inquadra(da){
    if (!fisso) return;
    const { W, H } = fisso;
    controlli.target.set(W / 2, 0, H / 2);
    if (da === "alto") camera.position.set(W / 2, Math.max(W, H) * 1.15, H / 2 + 1);
    else if (da === "B") camera.position.set(W / 2, H * .75, -H * .55);
    else camera.position.set(W / 2, H * .75, H * 1.55);
    controlli.update();
  }
  function adatta(){
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(adatta).observe(host);
  adatta();

  renderer.domElement.addEventListener("dblclick", e => {
    const r = renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera);
    const hit = ray.intersectObjects(scena.children, true)[0];
    if (hit) controlli.target.copy(hit.point);
  });

  parti();
  return {
    /* `salto`: niente viaggio (si e' saltati a un altro punto della
       partita); `durata`: quanto dura la scivolata, in millisecondi */
    mostra(tv, { salto = false, durata: d } = {}){
      ultimo = tv;
      if (d != null) durata1 = d;
      preparaTavolo(tv.W, tv.H);
      preparaTerreno(tv.terreno || []);
      parti();
      return costruisci(tv, { salto });
    },
    /* rifa' la scena con le stesse posizioni: una scelta cambiata */
    rifai(){ return ultimo ? costruisci(ultimo, { salto: true }) : Promise.resolve(); },
    cambiaSorgente(s){ sorgente = s; cat = M3.catalogoModelli(s && s.indice); caricate.clear(); return this.rifai(); },
    inquadra, adatta,
    accendi(){ vivo = true; adatta(); parti(); },
    spegni(){ vivo = false; fx.pulisci(); fermo = false; guardato = null; aggiornaTip(); },
    /* i nomi sopra le teste: accesi o spenti */
    nomi(si){ if (si != null) nomiAccesi = !!si; posaNomi(); return nomiAccesi; },
    /* gli effetti: `giocaEffetti(f, prima, { ritmo })` per un fotogramma
       dell'arbitro, `gioca(fx, f, prima)` per un colpo solo */
    effetti: fx,
    get catalogo(){ return cat; },
    get sorgente(){ return sorgente; },
    get tipi(){ return tipi; },
  };
}

/* ============================================================
   3 · LA FINESTRA SOPRA IL TAVOLO DELL'APP
   ============================================================ */
let box = null, vista = null, foto = null, attesa = 0, nomeDaCatalogo = null, ascolto = null;

function testoStato(s){
  const fonte = s.fonte === "nessuno" ? "nessun modello 3D trovato: ogni miniatura e' un blocco"
    : s.fonte === "server" ? "modelli dalla cartella dell'app" : "modelli dalla cartella scelta";
  const mancano = [...s.senza].map(([n, k]) => `${esc(n)} (${k})`).join(", ");
  return `<b>${s.unita}</b> unità, <b>${s.modelli}</b> miniature, ${(s.triangoli / 1e6).toFixed(2)} M triangoli · ${fonte}`
    + (mancano ? `<br><span class="v3d-manca">Senza modello: ${mancano}</span>` : "")
    + (s.errori.length ? `<br><span class="v3d-manca">Non leggo: ${s.errori.map(esc).join(", ")}</span>` : "");
}

function pannelloModelli(){
  const host = box.querySelector(".v3d-scelte");
  const cat = vista.catalogo;
  if (!cat.modelli.length){
    host.innerHTML = `<p class="note">Nessun modello trovato: prepara la cartella con <span class="mono">node tools/modelli-3d.mjs</span>.</p>`;
    return;
  }
  const righe = [...vista.tipi].sort((a, b) => (a.nomeCatalogo || a.nome).localeCompare(b.nomeCatalogo || b.nome));
  host.innerHTML = `<p class="note">Il modello di ogni unità sul tavolo. «Automatico» lo cerca per nome; quello scelto qui vale per tutte le partite, anche quelle da rivedere.</p>`
    + righe.map((t, i) => `<label class="field v3d-riga"><span>${esc(t.nomeCatalogo || t.nome.replace(/\s+\d+$/, ""))}
        <span class="dim">×${t.quanti}${t.catId ? "" : " · fuori collezione"}</span></span>
        <select data-scelta="${i}">${M3.opzioniModello(cat, M3.sceltaPer(t.catId, t.nome), M3.nomeAutomatico(cat, t))}</select></label>`).join("");
  host.querySelectorAll("[data-scelta]").forEach(s => s.addEventListener("change", async () => {
    const t = righe[+s.dataset.scelta];
    await M3.salvaScelta(t.catId, t.nome, s.value === "auto" ? undefined : s.value);
    await vista.rifai();
  }));
}

/* I posti della REGIA: la vista non sa niente della partita, ma sopra
   di lei la partita contro l'AI (controai.js) si deve poter seguire e
   comandare come dal disegno 2D — fermarla con lo spazio, tornare
   indietro, cambiare velocita', leggere le mosse e il perche'. La vista
   lascia i posti vuoti (la barra in fondo, il pannello delle mosse) e
   dice con l'evento `v3d` sul documento quando si apre e si chiude; chi
   ha una partita li riempie e mette `data-regia` sulla finestra. */
const leggi = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const scrivi = (k, v) => { try { localStorage.setItem(k, v); } catch { /* niente */ } };
const NOMI = "tow-3d-nomi";
let mosseViste = false;
const avvisa = aperta => document.dispatchEvent(new CustomEvent("v3d", { detail: { aperta } }));

function monta(){
  box = document.createElement("div");
  box.className = "v3d";
  box.innerHTML = `
    <div class="v3d-barra">
      <strong>Tavolo in 3D</strong>
      <span class="v3d-stato mono"></span>
      <span class="spacer"></span>
      <button class="btn tiny" data-v3d="nomi" title="I nomi sopra le unità, con i modelli rimasti">Nomi</button>
      <button class="btn tiny" data-v3d="mosse" title="Il registro delle mosse">Mosse</button>
      <button class="btn tiny" data-v3d="modelli" title="Scegli il modello di ogni unità">Modelli…</button>
      <button class="btn tiny" data-v3d="cartella" title="Scegli la cartella modelli-3d preparata da tools/modelli-3d.mjs">Cartella dei modelli…</button>
      <button class="btn tiny" data-v3d="A" title="Guarda dal lato dell'esercito A">Da A</button>
      <button class="btn tiny" data-v3d="B" title="Guarda dal lato dell'esercito B">Da B</button>
      <button class="btn tiny" data-v3d="alto" title="Guarda dall'alto">Dall'alto</button>
      <button class="btn tiny primary" data-v3d="chiudi">Chiudi</button>
    </div>
    <div class="v3d-corpo">
      <div class="v3d-tela"><p class="v3d-aiuto">Passa sopra un'unità per leggerla, clic per fermare la scheda · trascina per girare · rotella per avvicinarti · tasto destro per spostarti · doppio clic per guardare un punto</p></div>
      <aside class="v3d-mosse" hidden>
        <div class="panel-title">Le mosse</div>
        <ol class="sf-registro v3d-mosse-lista"></ol>
      </aside>
      <aside class="v3d-scelte" hidden></aside>
    </div>
    <div class="v3d-regia sf-cinema-barra"></div>`;
  document.body.appendChild(box);
  box.addEventListener("click", async e => {
    const b = e.target.closest("[data-v3d]");
    if (!b) return;
    /* il pulsante non tiene il fuoco: lo spazio deve fermare la partita,
       non premere di nuovo «Dall'alto» */
    b.blur();
    const k = b.dataset.v3d;
    if (k === "chiudi") chiudi();
    else if (k === "nomi"){
      const si = vista.nomi(!vista.nomi());
      scrivi(NOMI, si ? "1" : "0");
      b.classList.toggle("on", si);
    } else if (k === "mosse") mostraMosse(box.querySelector(".v3d-mosse").hidden);
    else if (k === "modelli"){
      const p = box.querySelector(".v3d-scelte");
      p.hidden = !p.hidden;
      b.classList.toggle("on", !p.hidden);
      if (!p.hidden) pannelloModelli();
    } else if (k === "cartella"){
      try { await vista.cambiaSorgente(await M3.scegliCartella()); aggiornaBarra(); }
      catch (err){ if (err.name !== "AbortError") alert(err.message); }
    } else vista.inquadra(k);
  });
  addEventListener("keydown", e => { if (e.key === "Escape" && box && !box.hidden) chiudi(); });
}

function mostraMosse(si){
  box.querySelector(".v3d-mosse").hidden = !si;
  box.querySelector('[data-v3d="mosse"]').classList.toggle("on", si);
}

function aggiornaBarra(){
  box.querySelector('[data-v3d="cartella"]').hidden = vista.sorgente?.come === "server";
  box.querySelector('[data-v3d="nomi"]').classList.toggle("on", vista.nomi());
}

/* `fotografia()`: il tavolo di adesso; `osservatore(fn)`: chiamera' fn a
   ogni ridisegno del tavolo; `nomeCatalogo(catId)`: il nome della voce;
   `effetti(fn)`: si iscrive agli effetti del tavolo (scena.js) */
export async function apriTavolo3D(fotografia, { osservatore, nomeCatalogo, effetti } = {}){
  foto = fotografia;
  nomeDaCatalogo = nomeCatalogo || null;
  if (!box) monta();
  box.hidden = false;
  document.body.classList.add("v3d-aperta");
  await M3.caricaScelte();
  if (!vista){
    vista = await creaVista(box.querySelector(".v3d-tela"), {
      scelta: (catId, nome) => M3.sceltaPer(catId, nome),
      nomeCatalogo: catId => (catId && nomeDaCatalogo && nomeDaCatalogo(catId)) || null,
      stato: s => {
        box.querySelector(".v3d-stato").innerHTML = testoStato(s);
        if (!box.querySelector(".v3d-scelte").hidden) pannelloModelli();
      },
    });
    vista.nomi(leggi(NOMI, "1") === "1");
  } else vista.accendi();
  aggiornaBarra();
  /* chi ha una partita riempie la regia; la prima volta, su uno schermo
     largo, le mosse si vedono subito come nel pannello della sfida */
  avvisa(true);
  if (box.hasAttribute("data-regia") && !mosseViste){ mosseViste = true; mostraMosse(innerWidth > 900); }
  /* le frecce, gli incantesimi e chi cade: gli stessi del disegno 2D */
  if (effetti && !ascolto) ascolto = effetti((tipo, a, b, c) => {
    if (!vista || box.hidden) return 0;
    return tipo === "recita" ? vista.effetti.giocaEffetti(a, b, c) : vista.effetti.gioca(a, b, c);
  });
  /* il tavolo cambia: la scena segue, con la scivolata. Un trascinamento
     ridisegna a ogni pixel: si aspetta che si fermi un attimo. */
  osservatore && osservatore(() => {
    clearTimeout(attesa);
    attesa = setTimeout(() => { if (!box.hidden) vista.mostra(foto()); }, 60);
  });
  await vista.mostra(foto(), { salto: true });
}

export function chiudi(){
  if (!box) return;
  box.hidden = true;
  vista && vista.spegni();
  document.body.classList.remove("v3d-aperta");
  avvisa(false);
}
