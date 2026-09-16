/* Schieramento Old World — la chiave funziona?
 *
 * Una domanda sola al modello, per sapere se la chiave c'è, se il nome
 * del modello esiste e se la risposta torna nella forma giusta. Una
 * partita sono un centinaio di domande: scoprire al centesimo turno che
 * la chiave era scaduta è il modo peggiore di scoprirlo.
 *
 *   node tools/prova-chiave.mjs
 */
import * as AG from '../src/agente.js';

const chiave = process.env.GEMINI_API_KEY || '';
const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

if (!chiave){
  console.log('✗  GEMINI_API_KEY non c\'è nell\'ambiente di questo terminale.');
  console.log('   PowerShell, per questa finestra:   $env:GEMINI_API_KEY = "la-tua-chiave"');
  console.log('   PowerShell, per sempre:            setx GEMINI_API_KEY "la-tua-chiave"  (poi riapri il terminale)');
  process.exit(1);
}

console.log(`Chiave trovata (${chiave.length} caratteri). Modello: ${model}.`);
console.log('Faccio una domanda sola…\n');

const prova = {
  opzioni: {
    fase: 'Movimento', what: 'una prova: due mosse finte, scegline una',
    list: [
      { id:'avanza', nome:'Saurus Warriors', contro:'Orc Mob',
        why:'12″ verso gli Orchi, che sono a 18″', page:122 },
      { id:'ferma', nome:'Saurus Warriors',
        why:'resta dov\'è: chi non muove spara meglio', page:138 },
    ],
  },
  fotografia: 'Turno 1 di 6. Tu sei le Lucertole (750 punti) contro gli Orchi (750).\n' +
              '  · Saurus Warriors — 12/12 modelli, M 4, WS 3, S 4, T 4, Ld 8, nemico più vicino Orc Mob a 18″',
  registro: '(la partita è appena cominciata)',
};

const t0 = Date.now();
const agente = AG.agenteGemini({ apiKey: chiave, model, ritenta: 1 });
const r = await agente.scegli(prova);
const ms = Date.now() - t0;

if (r.errore){
  /* il corpo dell'errore di Google è JSON a più righe: qui serve la
     riga sola che dice cosa è andato storto */
  const stato = (r.errore.match(/HTTP \d+/) || [''])[0];
  const detto = r.errore.match(/"message":\s*"([^"]+)"/);
  const corto = stato + (detto ? ' — ' + detto[1] : '');
  console.log(`✗  Il modello non ha risposto: ${corto || r.errore.slice(0, 120)}`);
  console.log('   Se è «HTTP 400» la chiave è sbagliata o non abilitata;');
  console.log('   se è «HTTP 404» il nome del modello non esiste — provane un altro con');
  console.log('   $env:GEMINI_MODEL = "gemini-3.5-flash-lite"');
  console.log('   se è «HTTP 429» la quota al minuto è finita: riprova fra un minuto.');
  process.exit(2);
}

console.log(`✓  Ha risposto in ${ms} ms, e ha scelto: ${r.scelta.id} (${r.scelta.nome || ''})`);
console.log(`   Il suo perché: «${r.perche}»`);
console.log('\nTutto a posto: puoi lanciare una partita.');
console.log('   node tools/partita.mjs --gemini --html partita.html');
