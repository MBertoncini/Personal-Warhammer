/* Schieramento Old World — basette e tipi di truppa */

/* ============================================================
   1 · BASI E TIPI DI TRUPPA
   ============================================================ */
const BASES = [
  { id:"20x20",  label:"20×20 — fanteria leggera", w:20, h:20 },
  { id:"25x25",  label:"25×25 — fanteria",          w:25, h:25 },
  { id:"30x30",  label:"30×30 — fanteria pesante",  w:30, h:30 },
  { id:"40x40",  label:"40×40 — fanteria mostruosa",w:40, h:40 },
  { id:"25x50",  label:"25×50 — cavalleria",        w:25, h:50 },
  { id:"30x60",  label:"30×60 — cavalleria pesante",w:30, h:60 },
  { id:"50x50",  label:"50×50 — cav. mostruosa",    w:50, h:50 },
  { id:"50x100", label:"50×100 — carro / macchina", w:50, h:100 },
  { id:"60x100", label:"60×100 — creatura mostruosa",w:60, h:100 },
  { id:"100x150",label:"100×150 — colosso",         w:100, h:150 },
];
const baseById = id => BASES.find(b => b.id === id);

// larghezza di fronte di default per tipo di truppa
function defaultFrontage(troop, models, loose){
  const t = (troop || "").toLowerCase();
  if (models <= 1) return 1;
  if (loose) return Math.max(1, Math.ceil(models / 2));
  if (/behemoth|monstrous creature|creatura mostruosa|chariot|carro|war machine|macchina/.test(t)) return 1;
  if (/monstrous|mostruos/.test(t)) return Math.min(3, models);
  if (/swarm|sciame/.test(t)) return Math.min(3, models);
  return Math.min(5, models);
}
function guessBase(txt){
  const t = (txt || "").toLowerCase();
  if (/chariot|carro/.test(t)) return "50x100";
  if (/war machine|macchina/.test(t)) return "50x100";
  if (/behemoth|monstrous creature|creatura mostruosa/.test(t)) return "60x100";
  if (/monstrous cavalry/.test(t)) return "50x50";
  if (/heavy cavalry/.test(t)) return "30x60";
  if (/cavalry|cavalleria|mounted/.test(t)) return "25x50";
  if (/monstrous|mostruos|ogre|troll/.test(t)) return "40x40";
  if (/swarm|sciame/.test(t)) return "40x40";
  if (/heavy infantry/.test(t)) return "30x30";
  return "25x25";
}
export { BASES, baseById, defaultFrontage, guessBase };
