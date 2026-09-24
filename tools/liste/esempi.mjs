/* Schieramento Old World — le liste da 800 punti cercate con questi strumenti
 *
 * Le tre che sono finite nell'archivio, riscritte come candidate: sono il
 * punto di partenza per cercarne altre (si copia questo file, si cambiano
 * le unità, si lancia valuta.mjs). Accanto, le alternative che sono
 * arrivate vicine, con i numeri che avevano.
 *
 * I numeri sono vinte/perse in percentuale, 240 partite a specchio su sei
 * scenari per avversario, semi 5001-5020 (la verifica finale, su semi mai
 * usati per scegliere): LIZ fun, O&G FUN, Skaven fun, Skaven orda.
 */
import { SK, OG, LZ } from './unita.mjs';

const SKAVEN = 'Skaven', ORCHI = 'Orc and Goblin Tribes', LUCERTOLE = 'Lizardmen';
const mago = (i, level, lore = 'battle') => ({ [i]: { level, lore } });

export const CANDIDATE = {
  /* 23/09/2026, id lmuegsxz4wod0. Contro LIZ fun 70/22, contro O&G FUN 97/2
     (1.200 partite, la serie di allora). */
  skavenOrda: { cat: SKAVEN, name: 'Skaven orda',
    units: [SK.greySeer({ level: 4 }), SK.clanrats({ n: 40, shields: true, c: 'csm', f: 8 }),
            SK.clanrats({ n: 40, shields: true, c: 'csm', f: 8 }), SK.clanrats({ n: 29, shields: true, c: 'sm', f: 6 })],
    prep: { units: mago(0, 4) },
    note: 'Grey Seer Livello 4 (+30 pt), dominio Battle Magic. Scudi su tutti i Clanrats: con la Parry fanno 4+ in mischia. Fronti: 8 per i due da 40 (cinque file), 6 per quello da 29 — ci stanno anche nelle zone da 6″.' },

  /* 24/09/2026, id lmueliwuvm0ao: 70/19, 97/1, 66/22, 60/25 — 73% vinte */
  ogOrdaNera: { cat: ORCHI, name: 'O&G orda nera',
    units: [OG.blackWarboss(), OG.weirdnob(), OG.blackOrcs({ n: 10, c: 'cs', great: true }),
            OG.orcs({ n: 50, c: 'csm' }), OG.orcs({ n: 12, c: 'sm' })],
    prep: { units: mago(1, 4) },
    note: 'Black Orc Warboss generale (Comando 9) con arma grande (+4 pt). Orc Weirdnob Livello 4 (+30 pt), dominio Battle Magic: dentro i 50 Orchi ha la Mob Rule (+1 al lancio). Dieci Orchi Neri con armi grandi: Da Boyz vuole un Boss di Orchi Neri per ogni reggimento di Orchi Neri, e viceversa (p. 45). Niente arma aggiuntiva: il simulatore non ne conta l’attacco in più. Costi: Ravening Hordes pp. 12, 14, 21, 22.' },
  /* la stessa con i blocchi da 40 e 22: 66/20, 98/1, 70/23, 53/29 — 72% */
  ogOrdaNera40: { cat: ORCHI, name: 'O&G orda nera (40 e 22)',
    units: [OG.blackWarboss(), OG.weirdnob(), OG.blackOrcs({ n: 10, c: 'cs', great: true }),
            OG.orcs({ n: 40, c: 'csm' }), OG.orcs({ n: 22, c: 'sm' })],
    prep: { units: mago(1, 4) } },

  /* 24/09/2026, id lmueliwuytkl7: 65/25, 99/1, 64/26, 63/20 — 73% vinte */
  lizGuardia: { cat: LUCERTOLE, name: 'LIZ guardia e sangue freddo',
    units: [LZ.oldblood(), LZ.scarVet({ bsb: true }), LZ.templeGuard({ n: 16, c: 'csm' }), LZ.saurus({ n: 18, c: 'cs' })],
    prep: { bsb: 1 },
    note: 'Saurus Oldblood generale e Scar-Veteran stendardo da battaglia (+25 pt, p. 2), tutti e due con arma grande (+4 pt). Temple Guard con alabarde e scudi, testarda; Saurus Warriors con scudi: con la Parry fanno 3+ in mischia. Costi: Legends: Lizardmen pp. 3 e 6.' },
  /* un personaggio solo e più Temple Guard: 64/28, 97/1, 54/39, 68/20 — 71% */
  lizGuardiaUno: { cat: LUCERTOLE, name: 'LIZ guardia (un personaggio)',
    units: [LZ.scarVet(), LZ.templeGuard({ n: 24, c: 'csm' }), LZ.saurus({ n: 21, c: 'cs' })] },
};
