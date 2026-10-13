/* Chi e' chi fra le unita' e i modelli 3D (src/modelli3d.js).
 *
 * Le cartelle sono quelle vere di Modly, scritte qui: la prova non deve
 * avere bisogno dei modelli sul disco, che stanno solo sul computer di
 * chi li ha. Conta piu' il «no» del «si'»: un Orco con la faccia di un
 * Black Orc sarebbe una cosa falsa detta sul tavolo, un blocco no.
 *
 * Si lancia con:  node test/modelli3d.mjs
 */
import { abbina, parole, catalogoModelli, modelloPer, posePerCelle, ruoloDi, sceltaPer, chiaveScelta } from '../src/modelli3d.js';

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};

const CARTELLE = [
  'beastmen-brayherds-gor-herd-2025', 'beastmen-brayherds-ungor-herd-2025', 'beastmen-brayherds-razorgor-2025',
  'beastmen-brayherds-centigor-herd-2025', 'beastmen-brayherds-centigor-herd-command-2025',
  'dwarf-mountain-holds-dwarf-ironbreakers-2024', 'dwarfen-mountain-holds-dwarf-quarrellers-2024',
  'dwarfen-mountain-holds-dwarf-warriors-2024', 'dwarfen-mountain-holds-slayers-2024',
  'dwarfen-mountain-holds-slayer-of-legend-2024', 'dwarfen-mountain-holds-goblin-hewer-2024',
  'orc-and-goblin-tribes-black-orc-mob-2024', 'orc-and-goblin-tribes-goblin-wolf-rider-mob-2024',
  'orc-goblin-tribes-orc-warboss-on-wyvern-2024', 'Seraphon-Terradon-Riders',
  'wood-elf-realms-glade-guard-2025', 'wood-elf-realms-wood-elf-nobles-2025',
  'wood-elf-realms-wood-elf-noble-on-stag-2025', 'wood-elf-realms-wardancer-troupe-2025',
];

ok('il prefisso della fazione, l anno e i plurali non contano',
   parole('orc-and-goblin-tribes-black-orc-mob-2024').join(' ') === 'black orc');
ok('anche quando la cartella dei Nani dice dwarf invece di dwarfen',
   parole('dwarf-mountain-holds-dwarf-ironbreakers-2024').join(' ') === 'ironbreaker');

const si = {
  'Black Orc Mobs': 'orc-and-goblin-tribes-black-orc-mob-2024',
  'Gor Herd': 'beastmen-brayherds-gor-herd-2025',
  'Razorgor Herd': 'beastmen-brayherds-razorgor-2025',
  'Centigor Herd': 'beastmen-brayherds-centigor-herd-2025',
  'Quarrellers': 'dwarfen-mountain-holds-dwarf-quarrellers-2024',
  'Ironbreakers': 'dwarf-mountain-holds-dwarf-ironbreakers-2024',
  'Slayers': 'dwarfen-mountain-holds-slayers-2024',
  'Terradon Riders': 'Seraphon-Terradon-Riders',
  'Wood Elf Nobles': 'wood-elf-realms-wood-elf-nobles-2025',
  'Wardancers': 'wood-elf-realms-wardancer-troupe-2025',
};
for (const [nome, cartella] of Object.entries(si))
  ok(`«${nome}» trova ${cartella}`, abbina(nome, CARTELLE) === cartella);

for (const nome of ['Orc Mobs', 'Goblin Mobs', 'Orc Warboss', 'Black Orc Warboss', 'Dragon Slayer',
                    'Razorgor Chariot', 'Saurus Warriors', 'Night Goblin Mobs', ''])
  ok(`«${nome}» resta senza modello piuttosto che prenderne uno sbagliato`, abbina(nome, CARTELLE) === null);

console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
