/* Schieramento Old World — la scheda di preparazione della lista
 *
 * Il file di New Recruit dice moltissimo e tace su cinque cose, sempre
 * le stesse, e sono cinque cose che servono dal primo turno (piano
 * §3.2):
 *
 *   chi e' il generale e chi porta lo stendardo da battaglia;
 *   quali incantesimi sono stati generati, che si tirano prima dello
 *     schieramento (p. 106) mentre il file dice solo dominio e livello;
 *   quale arma impugna chi ne ha due, e se lo scudo e' in uso;
 *   gli oggetti magici, che i cataloghi scrivono come testo libero;
 *   le regole d'esercito, che stanno negli army book e non nel file.
 *
 * Senza, ogni partita comincia con dieci minuti di correzioni a mano.
 * Con, si compila una volta per lista e resta salvata.
 *
 * Questo modulo non disegna niente: guarda una lista e dice **quali
 * domande sono aperte** e **quali hanno gia' risposta**. Il disegno lo
 * fa `lists.js`, che sa dov'e' il pannello.
 */

import { troopType } from './troops.js';

/* ============================================================
   1 · DOVE STANNO LE RISPOSTE
   Una sola busta per lista, cosi' il backup e la sincronia se la
   portano dietro senza sapere cosa c'e' dentro.
   ============================================================ */
export const prepOf = l => (l && l.prep) || { general:null, bsb:null, units:{}, note:"" };

export function setPrep(l, patch){
  if (!l) return null;
  l.prep = { ...prepOf(l), ...patch };
  return l.prep;
}
export function setUnitPrep(l, i, patch){
  if (!l) return null;
  const p = prepOf(l);
  const units = { ...p.units, [i]: { ...(p.units[i] || {}), ...patch } };
  l.prep = { ...p, units };
  return l.prep;
}

/* ============================================================
   2 · CHI PUO' ESSERE COSA
   ============================================================ */
/* Un personaggio, per il file, e' un'unita' della categoria Personaggi,
   oppure una che porta la parentesi «(character)» nel tipo di truppa.
   Il modello solo e' un indizio, non una prova: un carro, un
   lanciapietre e un Hell Pit Abomination sono tutti «un modello solo»
   e nessuno dei tre puo' essere il generale o portare uno stendardo.
   Il tipo di truppa dice quali possono, e chiederlo di un carro era
   rumore che riempiva la scheda di domande finte. */
const NOT_A_CHARACTER = ["lightChariot","heavyChariot","warMachine","behemoth","monstrousCreature","swarm"];
export const isCharacter = u => {
  if (/^character/i.test(u.slot || "")) return true;
  const t = troopType(u.troop);
  if (t.isCharacter) return true;
  if (NOT_A_CHARACTER.includes(t.id)) return false;
  return (u.models || 1) === 1;
};

export const characters = l => (l.units || [])
  .map((u, i) => ({ u, i }))
  .filter(x => isCharacter(x.u));

/* Il generale e lo stendardo da battaglia sono spesso deducibili dalle
   regole, non sempre. Quando il file lo dice, si propone; quando tace,
   si chiede. */
const RE_GENERAL = /^general\b|comandante|generale/i;
const RE_BSB     = /battle standard|stendardo da battaglia/i;
const says = (u, re) => (u.rules || []).some(r => re.test(String(r))) || re.test(u.name || "");

export const guessGeneral = l => {
  const c = characters(l);
  const said = c.find(x => says(x.u, RE_GENERAL));
  if (said) return said.i;
  /* altrimenti il Comando piu' alto, che al tavolo e' quello che si fa */
  const best = c.reduce((a, x) => {
    const ld = +String((x.u.stats || {}).Ld || "").replace(/\D/g, "") || 0;
    return !a || ld > a.ld ? { i:x.i, ld } : a;
  }, null);
  return best ? best.i : null;
};
export const guessBsb = l => {
  const said = characters(l).find(x => says(x.u, RE_BSB));
  return said ? said.i : null;
};

/* ============================================================
   3 · LE DOMANDE APERTE
   Una domanda entra in elenco solo se e' davvero aperta: un'unita' con
   una sola arma da mischia non ha niente da scegliere, e chiederglielo
   sarebbe rumore.
   ============================================================ */
const RE_WIZARD = /\bwizard\b|\blore of\b|\bmago\b|\bdominio\b|level \d/i;
const melee = u => (u.weapons || []).filter(w => !/\d/.test(String(w.range || "")));

export function questions(l){
  if (!l) return [];
  const p = prepOf(l);
  const out = [];

  if (p.general == null)
    out.push({ id:"general", what:"chi e' il generale",
               why:"il suo Comando serve a tutte le unita' entro la sua portata",
               suggest: guessGeneral(l) });

  if (p.bsb == null && characters(l).some(x => says(x.u, RE_BSB)))
    out.push({ id:"bsb", what:"chi porta lo stendardo da battaglia",
               why:"vale un punto nel risultato del combattimento e aiuta i test di rotta",
               suggest: guessBsb(l) });

  (l.units || []).forEach((u, i) => {
    const mine = p.units[i] || {};
    const arms = melee(u);
    if (arms.length > 1 && !mine.weapon)
      out.push({ id:"weapon", unit:i, name:u.name,
                 what:"quale arma impugna " + u.name,
                 why:"cambia Forza e perforazione di ogni colpo",
                 options: arms.map(w => w.name) });

    if ((u.rules || []).some(r => RE_WIZARD.test(String(r))) && !mine.spells)
      out.push({ id:"spells", unit:i, name:u.name,
                 what:"quali incantesimi ha generato " + u.name,
                 why:"si tirano prima dello schieramento (p. 106): il file dice solo il dominio" });
  });

  return out;
}

/* Le domande gia' chiuse, per far vedere che la scheda serve a
   qualcosa: un pannello che mostra solo quello che manca sembra sempre
   pieno di buchi anche quando e' quasi finito. */
export function answered(l){
  if (!l) return [];
  const p = prepOf(l), units = l.units || [];
  const out = [];
  if (p.general != null && units[p.general]) out.push({ what:"generale", value:units[p.general].name });
  if (p.bsb != null && units[p.bsb])         out.push({ what:"stendardo da battaglia", value:units[p.bsb].name });
  for (const [i, v] of Object.entries(p.units || {})){
    const u = units[i]; if (!u) continue;
    if (v.weapon) out.push({ what:u.name + " impugna", value:v.weapon });
    if (v.shield) out.push({ what:u.name, value:"scudo in uso" });
    if (v.spells) out.push({ what:"incantesimi di " + u.name, value:v.spells });
    if (v.items)  out.push({ what:"oggetti di " + u.name, value:v.items });
  }
  if (p.note) out.push({ what:"nota", value:p.note });
  return out;
}

/* A che punto siamo: due numeri e nient'altro, per la riga di
   riassunto accanto al nome della lista. */
export const readiness = l => {
  const open = questions(l).length, done = answered(l).length;
  return { open, done, ready: open === 0 };
};
