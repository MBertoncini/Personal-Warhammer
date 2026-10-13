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

/* i modelli di Modly guardano verso +Z, il fronte di un'unita' e' -Z */
const FRONTE = Math.PI;
/* il bordino colorato sotto le basette: dice di chi e' la miniatura */
const BORDO = 1.6, ALTO_BORDO = 1.5;
const COL = { A: "#b0413a", B: "#2f6f96" };
const PLASTICA = { A: "#d2c4bc", B: "#bfcbd0" };
const RAD = Math.PI / 180;
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

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

  switch (t.kind){
    case "hill": {
      const m = ombra(new THREE.Mesh(new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat()));
      m.scale.set(t.w / 2, 50, t.h / 2);
      g.add(m);
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
      }
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
      }
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
  return g;
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

  const scena = new THREE.Scene();
  scena.background = new THREE.Color("#1d211c");
  const camera = new THREE.PerspectiveCamera(40, 1, 5, 20000);
  /* frecce, incantesimi, mischie: fx3d.js, sopra le miniature */
  const fx = motore3D(scena);
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
      bordi.push({ es: u.esercito, uid: u.uid, c, alto: ALTO_BORDO / 2, sx: c.w + BORDO, sy: ALTO_BORDO, sz: c.h + BORDO });
      if (!posa){
        const n = chi.nomeCatalogo || chi.nome;
        senza.set(n, (senza.get(n) || 0) + 1);
        const alto = Math.min(45, Math.max(20, Math.min(c.w, c.h) * 1.1));
        blocchi.push({ es: u.esercito, uid: u.uid, c, alto: ALTO_BORDO + alto / 2, sx: c.w, sy: alto, sz: c.h });
        return;
      }
      const s = Math.min(c.w / posa.base.w, c.h / posa.base.d);
      const k = posa.file + "|" + u.esercito;
      if (!gruppi.has(k)) gruppi.set(k, { file: posa.file, es: u.esercito, l: [] });
      gruppi.get(k).l.push({ uid: u.uid, c, alto: ALTO_BORDO, sx: s, sy: s, sz: s, giro: FRONTE });
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
    const istanzia = (geo, materiale, lista) => {
      const im = new THREE.InstancedMesh(geo, materiale, lista.length);
      im.castShadow = im.receiveShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      lista.forEach((x, i) => nuove.push({ im, i, ...x }));
      nuovo.add(im);
    };
    for (const es of ["A", "B"]){
      const b = bordi.filter(x => x.es === es), k = blocchi.filter(x => x.es === es);
      if (b.length) istanzia(scatola, mat("bordo" + es, () => new THREE.MeshStandardMaterial({ color: COL[es], roughness: .7 })), b);
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
    stato({ unita: tv.unita.length, modelli, senza, triangoli, errori,
            fonte: !sorgente ? "nessuno" : sorgente.come, tipi });
  }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  const su = new THREE.Vector3(0, 1, 0);
  const morbido = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  /* mette ogni istanza dove la sua unita' e' arrivata */
  function muovi(ora){
    const t = durata > 0 ? Math.min(1, (ora - t0) / durata) : 1, e = morbido(t);
    for (const [uid, v] of viaggi){
      const d = ((v.b.rot - v.a.rot) % 360 + 540) % 360 - 180;
      pose.set(uid, { x: v.a.x + (v.b.x - v.a.x) * e, y: v.a.y + (v.b.y - v.a.y) * e, rot: v.a.rot + d * e });
    }
    const toccate = new Set();
    for (const x of istanze){
      const u = pose.get(x.uid);
      if (!u) continue;
      const a = u.rot * RAD, co = Math.cos(a), si = Math.sin(a);
      pos.set(u.x + x.c.lx * co - x.c.ly * si, x.alto, u.y + x.c.lx * si + x.c.ly * co);
      q.setFromAxisAngle(su, -(u.rot + (x.c.rot || 0)) * RAD + (x.giro || 0));
      x.im.setMatrixAt(x.i, m4.compose(pos, q, sc.set(x.sx, x.sy, x.sz)));
      toccate.add(x.im);
    }
    for (const im of toccate){ im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
  }

  /* ---- il giro del disegno ---- */
  let acceso = true, inMoto = false;
  function ciclo(){
    if (!acceso || !host.isConnected){ inMoto = false; return; }
    const ora = performance.now();
    if (durata > 0 && ora - t0 <= durata + 50) muovi(ora);
    fx.aggiorna(ora);
    controlli.update();
    renderer.render(scena, camera);
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
    accendi(){ acceso = true; adatta(); parti(); },
    spegni(){ acceso = false; fx.pulisci(); },
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

function monta(){
  box = document.createElement("div");
  box.className = "v3d";
  box.innerHTML = `
    <div class="v3d-barra">
      <strong>Tavolo in 3D</strong>
      <span class="v3d-stato mono"></span>
      <span class="spacer"></span>
      <button class="btn tiny" data-v3d="modelli" title="Scegli il modello di ogni unità">Modelli…</button>
      <button class="btn tiny" data-v3d="cartella" title="Scegli la cartella modelli-3d preparata da tools/modelli-3d.mjs">Cartella dei modelli…</button>
      <button class="btn tiny" data-v3d="A" title="Guarda dal lato dell'esercito A">Da A</button>
      <button class="btn tiny" data-v3d="B" title="Guarda dal lato dell'esercito B">Da B</button>
      <button class="btn tiny" data-v3d="alto" title="Guarda dall'alto">Dall'alto</button>
      <button class="btn tiny primary" data-v3d="chiudi">Chiudi</button>
    </div>
    <div class="v3d-corpo">
      <div class="v3d-tela"><p class="v3d-aiuto">Trascina per girare · rotella o due dita per avvicinarti · tasto destro per spostarti · doppio clic per guardare un punto</p></div>
      <aside class="v3d-scelte" hidden></aside>
    </div>`;
  document.body.appendChild(box);
  box.addEventListener("click", async e => {
    const b = e.target.closest("[data-v3d]");
    if (!b) return;
    const k = b.dataset.v3d;
    if (k === "chiudi") chiudi();
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

function aggiornaBarra(){
  box.querySelector('[data-v3d="cartella"]').hidden = vista.sorgente?.come === "server";
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
  } else vista.accendi();
  aggiornaBarra();
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
}
