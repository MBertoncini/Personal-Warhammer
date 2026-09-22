import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as AR from './src/arbitro.js';
import * as AG from './src/agente.js';
import * as D from './src/dice.js';
import * as PR from './src/profiles.js';
import * as ARM from './src/armies.js';
import * as MG from './src/magic.js';
import { SCENARIOS } from './src/scenarios.js';

async function main() {
  const qui = path.dirname(fileURLToPath(import.meta.url));
  const dati = f => JSON.parse(fs.readFileSync(path.join(qui, 'dati', f), 'utf8'));

  PR.useProfiles(dati('profili.json'));
  const idx = dati(path.join('eserciti', 'indice.json'));
  ARM.useArmies(ARM.makeArmies((idx.file || []).map(f => dati(path.join('eserciti', f)))));
  const magia = MG.useMagic(MG.makeMagic(dati(path.join('magia', 'domini.json'))));

  const liste = dati('liste.json');
  const A = liste[0];
  const B = liste[1];

  const S = AR.newBattle({ A, B, scenario: 'bm-strada', nomi: {A: 'ListaA', B: 'ListaB'}, magia });

  let interceptedText = "";

  const mockRete = async (url, options) => {
    const body = JSON.parse(options.body);
    interceptedText = body.contents[0].parts[0].text;
    console.log(JSON.stringify({
      url,
      method: options.method,
      headers: options.headers,
      body: body
    }, null, 2));
    
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: `{"scelta": 1, "perche": "Mock response"}` }] } }]
      })
    };
  };

  const ai = AG.agenteGemini({ apiKey: "test-key", fetchFn: mockRete, model: "gemini-3.6-flash" });
  
  const o = AR.options(S);
  const ctx = {
    opzioni: o,
    fotografia: AR.fotografia(S, { per: o.player }),
    registro: AR.ultimeRighe(S, 10),
    stato: S,
  };

  await ai.scegli(ctx);
}

main().catch(console.error);
