/* Schieramento Old World — service worker
 *
 * Serve a due cose, e la seconda vale piu' della prima:
 *
 *  1. al circolo non c'e' campo, e l'app deve aprirsi lo stesso;
 *  2. un sito installato ottiene da Chrome ed Edge la persistenza
 *     dell'archivio senza chiedere niente — cioe' il browser smette di
 *     poter buttare via la collezione nelle sue pulizie automatiche.
 *
 * I dati NON passano di qui: stanno in IndexedDB e non sono richieste
 * di rete. Qui dentro c'e' solo il guscio dell'app.
 */

const VERSION = "v6";
const SHELL = "shell-" + VERSION;
const RUNTIME = "runtime-" + VERSION;

const FILES = [
  "./", "./index.html", "./manifest.webmanifest",
  "./styles/app.css",
  "./src/main.js", "./src/util.js", "./src/bus.js", "./src/bases.js",
  "./src/terrain.js", "./src/scenarios.js", "./src/parser.js", "./src/store.js",
  "./src/catalog.js", "./src/lists.js", "./src/matchup.js", "./src/deploy.js",
  "./src/geom.js", "./src/history.js", "./src/view.js", "./src/imgexport.js",
  "./src/share.js", "./src/tactics.js", "./src/game.js", "./src/scenariokit.js",
  "./src/battlelog.js", "./src/reports.js",
  "./src/formation.js", "./src/formeditor.js", "./src/tableshot.js",
  "./src/extras.js", "./src/movement.js", "./src/zones.js", "./src/uikit.js",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png",
];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    /* uno alla volta: se un file manca (rinominato, non ancora
       pubblicato) addAll fallirebbe in blocco e l'app resterebbe
       senza service worker */
    await Promise.all(FILES.map(f => c.add(f).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys())
      if (k !== SHELL && k !== RUNTIME) await caches.delete(k);
    await self.clients.claim();
  })());
});

/* La pagina puo' chiedere di passare subito alla versione nuova invece
   di aspettare la chiusura di tutte le schede. */
self.addEventListener("message", e => {
  if (e.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  /* La navigazione va servita dalla cache quando la rete non c'e', ma
     provando prima la rete: cosi' una versione nuova arriva appena
     ricarichi, senza aspettare la scadenza di niente. */
  if (req.mode === "navigate"){
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        (await caches.open(SHELL)).put("./index.html", fresh.clone());
        return fresh;
      } catch (_){
        return (await caches.match("./index.html")) || Response.error();
      }
    })());
    return;
  }

  const sameOrigin = url.origin === self.location.origin;

  /* I moduli e il foglio di stile: cache subito, rete dietro le quinte
     per aggiornarli alla prossima apertura. */
  if (sameOrigin){
    e.respondWith((async () => {
      const hit = await caches.match(req);
      const net = fetch(req).then(res => {
        if (res && res.ok) caches.open(SHELL).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
    return;
  }

  /* I font di Google: si tengono da parte alla prima visita, poi
     valgono anche senza rete. */
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)){
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === "opaque"))
          (await caches.open(RUNTIME)).put(req, res.clone());
        return res;
      } catch (_){ return Response.error(); }
    })());
  }
});
