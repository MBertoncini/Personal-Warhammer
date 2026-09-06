/* Schieramento Old World — il tavolo in miniatura, turno per turno
 *
 * Il registro della partita e' un elenco di numeri: x, y, gradi. Sono
 * quelli giusti da esportare, ma nessuno guarda una tabella e «vede»
 * il tavolo. Questo modulo rifa' il disegno partendo dalla fotografia
 * di fine turno: terreno dov'era in quel momento, unita' dov'erano,
 * grandi quanto erano dopo le perdite.
 *
 * Non e' una copia del campo di gioco di deploy.js: e' apposta piu'
 * povero — niente foto, niente maniglie, niente griglia fitta — perche'
 * sta in una colonna larga trecento pixel e deve dire tre cose sole:
 * chi sta dove, chi tocca chi, cosa e' cambiato dal turno prima.
 *
 * Non conosce lo stato dell'app: entra una fotografia, esce una
 * stringa di SVG. Cosi' lo stesso disegno serve al pannello della
 * partita, alla scheda Partite e, volendo, al PNG da scaricare.
 *
 * Tutte le misure in POLLICI: e' la lingua delle fotografie.
 */

import { esc } from './util.js';

const TCOL = {
  hill:"var(--t-hill)", wood:"var(--t-wood)", marsh:"var(--t-marsh)",
  ruins:"var(--t-ruins)", wall:"var(--t-wall)", monolith:"var(--t-mono)",
  pyramid:"var(--t-ruins)", treasure:"var(--t-treasure)",
};
const ROUND = new Set(["monolith", "treasure"]);

const n2 = v => Math.round((+v || 0) * 100) / 100;

/* ============================================================
   La fotografia disegnabile
   Le fotografie di fine turno tengono le unita' in coordinate e con
   l'ingombro gia' calcolato (w, h): qui si prende quello che c'e' e si
   tira via il resto. Le partite scritte a mano non hanno coordinate:
   in quel caso non c'e' niente da disegnare e si dice, invece di
   ammucchiare tutti nell'angolo 0,0.
   ============================================================ */
export function shotFromTurn(rep, turn){
  const units = (turn && turn.units || [])
    .filter(r => r.placed && !r.dead && (r.x || r.y))
    .map(r => ({
      uid: r.uid, army: r.army, name: r.name, idx: r.idx,
      x: n2(r.x), y: n2(r.y), rot: Math.round(r.rot || 0),
      w: n2(r.w || 1.2), h: n2(r.h || 1.2),
      alive: r.alive, models: r.models, fled: !!r.fled,
      moved: r.moved || 0,
    }));
  return {
    table: rep.table || { w:48, h:36 },
    terrain: (turn && turn.terrain) || rep.terrain || [],
    contacts: (turn && turn.contacts) || [],
    units,
    armies: rep.armies || { A:{ name:"A" }, B:{ name:"B" } },
    label: turn ? (turn.kind === "deploy" ? "Schieramento"
      : `Turno ${turn.n}${turn.army ? " — gioca " + (rep.armies[turn.army]?.name || turn.army) : ""}`) : "",
  };
}

/* ============================================================
   Il disegno
   ============================================================ */
export function shotSVG(shot, { height = 190, numbers = true, contacts = true } = {}){
  const W = Math.max(1, +shot.table.w || 48), H = Math.max(1, +shot.table.h || 36);
  const pad = 0.6;
  const S = [];
  const add = (s) => S.push(s);

  /* --- campo --- */
  add(`<rect x="0" y="0" width="${W}" height="${H}" fill="var(--field)" stroke="var(--line-strong)" stroke-width=".18"/>`);
  add(`<line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="var(--line-strong)" stroke-width=".12" stroke-dasharray=".7 .5" opacity=".8"/>`);

  /* --- terreno --- */
  for (const t of shot.terrain || []){
    const col = TCOL[t.kind] || "var(--t-ruins)";
    const tw = +t.w || 1, th = +t.h || tw;
    if (ROUND.has(t.kind))
      add(`<circle cx="${n2(t.x)}" cy="${n2(t.y)}" r="${n2(tw / 2)}" fill="${col}" opacity=".8" stroke="${col}" stroke-width=".1"/>`);
    else
      add(`<g transform="translate(${n2(t.x)} ${n2(t.y)}) rotate(${Math.round(t.rot || 0)})">` +
          `<rect x="${n2(-tw / 2)}" y="${n2(-th / 2)}" width="${n2(tw)}" height="${n2(th)}" rx=".3" ` +
          `fill="${col}" opacity=".55" stroke="${col}" stroke-width=".14"/></g>`);
  }

  /* --- contatti: prima delle unita', cosi' non coprono i numeri --- */
  if (contacts && shot.contacts && shot.contacts.length){
    const at = new Map(shot.units.map(u => [u.uid, u]));
    for (const c of shot.contacts){
      const a = at.get(c.a), b = at.get(c.b);
      if (!a || !b) continue;
      add(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${c.enemy ? "var(--bad)" : "var(--muted)"}" ` +
          `stroke-width=".16" opacity=".65" stroke-dasharray="${c.enemy ? "none" : ".4 .3"}"/>`);
    }
  }

  /* --- unita' --- */
  for (const u of shot.units){
    const col = `var(--army${u.army === "B" ? "B" : "A"})`;
    add(`<g transform="translate(${u.x} ${u.y}) rotate(${u.rot})">` +
        `<rect x="${n2(-u.w / 2)}" y="${n2(-u.h / 2)}" width="${n2(u.w)}" height="${n2(u.h)}" ` +
        `fill="${col}" opacity="${u.fled ? ".35" : ".75"}" stroke="${col}" stroke-width=".12" ` +
        `stroke-dasharray="${u.fled ? ".4 .3" : "none"}"/>` +
        /* la riga chiara e' il fronte: senza, un'unita' girata di 180
           gradi e' identica a una che non lo e' */
        `<line x1="${n2(-u.w / 2)}" y1="${n2(-u.h / 2)}" x2="${n2(u.w / 2)}" y2="${n2(-u.h / 2)}" ` +
        `stroke="var(--paper)" stroke-width=".22" opacity=".9"/></g>`);
  }
  if (numbers) for (const u of shot.units){
    if (!u.idx) continue;
    add(`<text x="${u.x}" y="${n2(u.y + 0.45)}" text-anchor="middle" font-size="1.25" ` +
        `fill="var(--paper)" stroke="rgba(0,0,0,.35)" stroke-width=".08" paint-order="stroke">${u.idx}</text>`);
  }

  return `<svg class="shot" viewBox="${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}" ` +
    `preserveAspectRatio="xMidYMid meet" style="height:${height}px" ` +
    `xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(shot.label || "Tavolo")}">${S.join("")}</svg>`;
}

/* La didascalia sotto il disegno: due righe di numeri che dicono se
   quello che si sta guardando e' un turno tranquillo o quello in cui
   la partita e' girata. */
export function shotCaption(shot, turn){
  if (!turn) return "";
  const lost = { A:0, B:0 };
  for (const r of turn.units || []) if (lost[r.army] !== undefined) lost[r.army] += r.dLost || 0;
  const touch = (shot.contacts || []).filter(c => c.enemy).length;
  const bits = [];
  if (turn.kind === "deploy") bits.push(`${shot.units.length} unità schierate`);
  else bits.push(`perdite ${lost.A}/${lost.B}`);
  if (touch) bits.push(`${touch} ${touch === 1 ? "contatto" : "contatti"}`);
  return bits.join(" · ");
}
