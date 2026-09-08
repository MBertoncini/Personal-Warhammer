/* Prova dell'archivio su GitHub: la conversione fra chiavi e file, e
 * un salva/scarica completo contro un GitHub finto tenuto in memoria.
 * Si lancia con:  node test/sync.mjs
 */
import 'fake-indexeddb/auto';

/* localStorage non esiste in node: le impostazioni della sincronia
   stanno li', quindi serve un sostituto minimo. */
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
  clear: () => mem.clear(),
};

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};

/* ================================================================
   Un GitHub finto: blob, alberi, commit e un ramo.
   ================================================================ */
const S = await import('../src/sync.js');
const store = await import('../src/store.js');

const gh = {
  blobs: new Map(),     // sha -> base64
  trees: new Map(),     // sha -> [{path, sha}]
  commits: new Map(),   // sha -> {tree, message, parents}
  head: '',
  calls: { blobs: 0, commits: 0, patch: 0, getBlob: 0 },
};
let seq = 0;
const fakeSha = p => (p + (++seq)).padEnd(40, '0').slice(0, 40);

function newTree(base, patch){
  const map = new Map((gh.trees.get(base) || []).map(e => [e.path, e.sha]));
  for (const e of patch){
    if (e.sha === null) map.delete(e.path);
    else map.set(e.path, e.sha);
  }
  const sha = fakeSha('t');
  gh.trees.set(sha, [...map].map(([path, s]) => ({ path, sha: s, type: 'blob', mode: '100644' })));
  return sha;
}

/* un commit iniziale vuoto, come un repository appena creato */
gh.trees.set('t0', []);
gh.commits.set('c0', { tree: 't0', message: 'primo', parents: [] });
gh.head = 'c0';

const reply = (status, body) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => body,
});

globalThis.fetch = async (url, opt = {}) => {
  const u = new URL(url);
  const p = u.pathname;
  const body = opt.body ? JSON.parse(opt.body) : null;
  const m = opt.method || 'GET';

  if (p === '/repos/tizio/archivio')
    return reply(200, { full_name: 'tizio/archivio', private: true, permissions: { push: true } });

  if (p === '/repos/tizio/archivio/git/ref/heads/main')
    return reply(200, { object: { sha: gh.head } });

  let mm;
  if ((mm = p.match(/^\/repos\/tizio\/archivio\/git\/commits\/(.+)$/)) && m === 'GET'){
    const c = gh.commits.get(mm[1]);
    return c ? reply(200, { sha: mm[1], tree: { sha: c.tree } }) : reply(404, { message: 'no' });
  }
  if ((mm = p.match(/^\/repos\/tizio\/archivio\/git\/trees\/(.+)$/)) && m === 'GET')
    return reply(200, { tree: gh.trees.get(mm[1]) || [], truncated: false });

  if ((mm = p.match(/^\/repos\/tizio\/archivio\/git\/blobs\/(.+)$/)) && m === 'GET'){
    gh.calls.getBlob++;
    return reply(200, { content: gh.blobs.get(mm[1]) || '', encoding: 'base64' });
  }
  if (p === '/repos/tizio/archivio/git/blobs' && m === 'POST'){
    gh.calls.blobs++;
    const sha = await S.blobSha(body.content);
    gh.blobs.set(sha, body.content);
    return reply(201, { sha });
  }
  if (p === '/repos/tizio/archivio/git/trees' && m === 'POST')
    return reply(201, { sha: newTree(body.base_tree, body.tree) });

  if (p === '/repos/tizio/archivio/git/commits' && m === 'POST'){
    gh.calls.commits++;
    const sha = fakeSha('c');
    gh.commits.set(sha, { tree: body.tree, message: body.message, parents: body.parents });
    return reply(201, { sha });
  }
  if (p === '/repos/tizio/archivio/git/refs/heads/main' && m === 'PATCH'){
    gh.calls.patch++;
    gh.head = body.sha;
    return reply(200, { object: { sha: gh.head } });
  }
  return reply(404, { message: 'percorso ignoto ' + m + ' ' + p });
};

const filesOf = commit =>
  new Map((gh.trees.get(gh.commits.get(commit).tree) || []).map(e => [e.path, e.sha]));

/* ================================================================
   1 · chiavi e percorsi
   ================================================================ */
console.log('nomi dei file');
ok('il catalogo si chiama catalogo.json', S.pathOf('catalog:entries') === 'catalogo.json');
ok('le partite si chiamano partite.json', S.pathOf('reports:all') === 'partite.json');
ok('una foto jpeg diventa un .jpg',
   S.pathOf('photo:abc', 'data:image/jpeg;base64,AAAA') === 'foto/abc.jpg');
ok('una foto png diventa un .png',
   S.pathOf('photo:abc', 'data:image/png;base64,AAAA') === 'foto/abc.png');
ok('una chiave sconosciuta finisce in altro/',
   S.pathOf('roba:nuova', 1) === 'altro/roba%3Anuova.json');

ok('catalogo.json torna la sua chiave', S.keyOf('catalogo.json') === 'catalog:entries');
ok('foto/abc.png torna la sua chiave', S.keyOf('foto/abc.png') === 'photo:abc');
ok('altro/ torna la chiave com\'era', S.keyOf('altro/roba%3Anuova.json') === 'roba:nuova');
ok('un file non nostro si ignora', S.keyOf('README.md') === null);
ok('l\'indice non e\' un documento', S.keyOf('indice.json') === null);

console.log('\nandata e ritorno');
const pezzi = {
  'catalog:entries': [{ id: 'a1', name: 'Saurus Warriors', owned: 12, note: 'accentata: perché' }],
  'lists:all': [{ id: 'l1', units: [{ name: 'Skinks', models: 10 }] }],
  'photo:a1': 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ==',
  'photo:a2': 'data:image/png;base64,iVBORw0KGgo=',
  'reports:all': [], 'scenarios:custom': [], 'roba:nuova': { x: 1 },
};
const round = S.dataFromFiles(S.filesFromData(pezzi, { who: 'Michele' }));
ok('tutte le chiavi tornano', Object.keys(round.data).length === Object.keys(pezzi).length);
ok('il JSON torna identico',
   JSON.stringify(round.data['catalog:entries']) === JSON.stringify(pezzi['catalog:entries']));
ok('gli accenti sopravvivono al base64',
   round.data['catalog:entries'][0].note === 'accentata: perché');
ok('la foto jpeg torna identica', round.data['photo:a1'] === pezzi['photo:a1']);
ok('la foto png torna identica con il suo mime', round.data['photo:a2'] === pezzi['photo:a2']);
ok('l\'indice porta la firma', round.index && round.index.da === 'Michele');

console.log('\nsha di git');
ok('il blob vuoto ha la sha che conosce git',
   (await S.blobSha('')) === 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');

/* ================================================================
   2 · salva e scarica per davvero
   ================================================================ */
console.log('\nsalvataggio');
for (const [k, v] of Object.entries(pezzi)) await store.saveDoc(k, v);
let cfg = S.saveCfg({ owner: 'tizio', repo: 'archivio', branch: 'main', dir: 'dati',
                      token: 'finto', who: 'Michele', sha: '', at: '' });

const p1 = await S.push(cfg);
ok('un commit solo per tutto l\'archivio', gh.calls.commits === 1 && gh.calls.patch === 1);
ok('ha scritto tutti i file piu\' l\'indice', p1.changed === Object.keys(pezzi).length);
const dopo = filesOf(gh.head);
ok('i file stanno nella cartella dati/', dopo.has('dati/catalogo.json') && dopo.has('dati/foto/a1.jpg'));
ok('c\'e\' anche l\'indice', dopo.has('dati/indice.json'));
ok('il messaggio dice cosa e\' cambiato',
   /^Archivio: .*\(Michele\)/.test(gh.commits.get(gh.head).message));
ok('l\'allineamento e\' segnato', S.loadCfg().sha === gh.head);

console.log('\nsalvataggio a vuoto');
const commitPrima = gh.head, blobPrima = gh.calls.blobs;
const p2 = await S.push(S.loadCfg());
ok('niente e\' cambiato: niente commit', p2.vuoto === true && gh.head === commitPrima);
ok('e nemmeno un blob caricato', gh.calls.blobs === blobPrima);

console.log('\nun documento cambiato');
await store.saveDoc('reports:all', [{ id: 'r1', nome: 'Guado di Sangue' }]);
const p3 = await S.push(S.loadCfg());
ok('un file solo nel commit', p3.changed === 1 && p3.paths[0] === 'partite.json');
ok('due blob caricati: il file e l\'indice', gh.calls.blobs === blobPrima + 2);
ok('il ramo e\' avanzato', gh.head !== commitPrima);

console.log('\ncancellazione');
await store.deleteDoc('photo:a2');
const p4 = await S.push(S.loadCfg());
ok('la foto sparisce anche dal repository', p4.removed === 1);
ok('e non e\' piu\' nell\'albero', !filesOf(gh.head).has('dati/foto/a2.png'));

console.log('\nqualcun altro ha salvato');
const mio = S.saveCfg({ sha: 'c0' });
let conflitto = null;
try { await S.push(mio); } catch (err){ conflitto = err; }
ok('il salvataggio si ferma', conflitto && conflitto.name === 'ConflictError');
ok('e dice dove sta il ramo', conflitto.sha === gh.head);
const forz = await S.push(S.loadCfg(), { force: true });
ok('con la forza passa lo stesso', !!forz.commit);

console.log('\nscaricamento su un dispositivo vuoto');
for (const k of await store.listKeys()) await store.deleteDoc(k);
await store.saveDoc('solo:qui', { mio: true });
S.saveCfg({ sha: '', at: '' });
const r1 = await S.pull(S.loadCfg(), { replace: false });
ok('ha riportato tutti i documenti', r1.letti === Object.keys(pezzi).length - 1);   // a2 cancellata
ok('il catalogo e\' quello di prima',
   JSON.stringify(await store.loadDoc('catalog:entries')) === JSON.stringify(pezzi['catalog:entries']));
ok('la foto e\' di nuovo una data URL', await store.loadDoc('photo:a1') === pezzi['photo:a1']);
ok('unendo, quello che c\'era solo qui resta', !!(await store.loadDoc('solo:qui')));
ok('l\'allineamento segue il ramo', S.loadCfg().sha === gh.head);

console.log('\nsostituzione');
const r2 = await S.pull(S.loadCfg(), { replace: true });
ok('quello che c\'era solo qui viene tolto', r2.tolti === 1 && !(await store.loadDoc('solo:qui')));

console.log('\nscaricare non riscarica il gia\' uguale');
const prima = gh.calls.getBlob;
await S.pull(S.loadCfg(), { replace: false });
/* l'unico che si riscarica sempre e' l'indice: porta data e firma
   dell'ultimo salvataggio, e quelle da qui non le sappiamo */
ok('si riscarica solo l\'indice', gh.calls.getBlob === prima + 1);

console.log(fails ? `\n${fails} controlli falliti` : '\nTutto a posto.');
process.exit(fails ? 1 : 0);
