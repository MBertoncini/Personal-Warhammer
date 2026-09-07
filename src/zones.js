/* Schieramento Old World — zone di schieramento disegnate a mano
 *
 * scenarios.js conosce cinque disposizioni: campale, fianchi opposti,
 * attacco sul fianco, passo, incontro. Sono quelle che servono nove
 * volte su dieci, e restano. Il problema e' la decima: lo scenario di
 * un libro, quello di un torneo, quello inventato al circolo. O
 * rientrava in una delle cinque, o non si poteva rappresentare — e
 * quel problema si sarebbe ripresentato per sempre, uno scenario alla
 * volta.
 *
 * Qui si disegna il rettangolo a mano e si dice di chi e'. Da quel
 * momento QUALSIASI scenario e' rappresentabile senza che l'app ne
 * sappia niente, che e' esattamente il tipo di liberta' che vale la
 * pena comprare.
 *
 * Le zone disegnate SOSTITUISCONO quelle calcolate: se ce n'e' almeno
 * una che appartiene a un esercito, la geometria dello scenario non si
 * usa piu'. Cosi' non si sommano due verita' diverse sullo stesso
 * tavolo.
 *
 * Convenzione delle misure: centro in millimetri come le unita' e il
 * terreno, larghezza e profondita' in millimetri anche loro, perche'
 * i rettangoli degli scenari sono gia' cosi'.
 */

import { inch } from './util.js';

export const ZONE_KINDS = [
  { id:"A",       label:"Zona dell'Esercito A", army:"A" },
  { id:"B",       label:"Zona dell'Esercito B", army:"B" },
  { id:"both",    label:"Zona di tutti e due",  army:null },
  { id:"blocked", label:"Area vietata",         army:null },
  { id:"note",    label:"Solo un promemoria",   army:null },
];
export const zoneKind = id => ZONE_KINDS.find(k => k.id === id) || ZONE_KINDS[0];

export function makeZone({ zid, x, y, w, h, kind = "A", label = "" }){
  return { zid, x, y, w: Math.abs(w), h: Math.abs(h), kind: zoneKind(kind).id, label: String(label || "") };
}

export function ensureZone(z, fallbackId = 0){
  if (!z || typeof z !== "object") return null;
  const w = Math.abs(+z.w) || 0, h = Math.abs(+z.h) || 0;
  if (w < 1 || h < 1) return null;
  return {
    zid: z.zid ?? fallbackId,
    x: +z.x || 0, y: +z.y || 0, w, h,
    kind: zoneKind(z.kind).id,
    label: String(z.label || ""),
  };
}

/* il rettangolo con l'angolo in alto a sinistra, che e' la forma che
   usano gli scenari e i controlli di legalita' */
export const zoneRect = z => ({ x: z.x - z.w / 2, y: z.y - z.h / 2, w: z.w, h: z.h });
/* la scatola centrata, che e' la forma che usano trascinamento e disegno */
export const zoneBox = z => ({ x: z.x, y: z.y, w: z.w, h: z.h, rot: 0 });

export const hasCustomZones = list => (list || []).some(z => z.kind === "A" || z.kind === "B" || z.kind === "both");

/* La geometria che il tavolo usa davvero: quella dello scenario, o
   quella disegnata a mano se ce n'e'. Le aree vietate si sommano
   sempre, perche' non sono in concorrenza con niente. */
export function applyZones(geo, list){
  const zones = (list || []).filter(Boolean);
  const blocked = [...(geo.blocked || []), ...zones.filter(z => z.kind === "blocked").map(zoneRect)];
  if (!hasCustomZones(zones)) return { ...geo, blocked };
  const out = { A: [], B: [] };
  for (const z of zones){
    if (z.kind === "A" || z.kind === "both") out.A.push(zoneRect(z));
    if (z.kind === "B" || z.kind === "both") out.B.push(zoneRect(z));
  }
  /* le zone ausiliarie dello scenario (l'arrivo dal fianco) valgono
     per la sua geometria, non per una disegnata a mano */
  return { zones: out, aux: [], blocked };
}

/* la fotografia per il report e per lo scenario salvato, in pollici */
export function zoneSnapshot(list){
  const r1 = v => Math.round(v * 10) / 10;
  return (list || []).map(z => ({
    zid: z.zid, kind: z.kind, label: z.label || "",
    x: r1(inch(z.x)), y: r1(inch(z.y)),
    w: r1(inch(z.w)), h: r1(inch(z.h)),
  }));
}
