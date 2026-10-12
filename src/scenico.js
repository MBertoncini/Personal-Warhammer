/* Schieramento Old World — gli elementi scenici disegnati
 *
 * Il bosco con gli alberi, la collina con le curve di livello, la palude
 * con le canne, le rovine con i muri rotti, il muretto di pietre, il
 * tesoro con la sua gemma. Nascevano dentro la pagina della partita da
 * rivedere (`replay.js`), e il tavolo dell'app restava con i rettangoli
 * a tinta unita: la stessa partita, guardata nei due posti, sembrava
 * giocata su due tavoli diversi. Adesso il disegno e' uno solo.
 *
 * Come `motoreFx` (fxmotore.js) la funzione non tocca niente fuori da
 * se': la pagina da rivedere la copia cosi' com'e' dentro il suo
 * <script> (`scenico.toString()`), dove gli import non ci sono.
 *
 *   DEFS        i motivi (erba, canne, pietre, macerie), da mettere una
 *               volta nei <defs> del disegno
 *   scena(t, i) il disegno di un pezzo, centrato sull'origine e non
 *               ruotato: chi chiama lo mette in un <g> con la sua
 *               traslazione e rotazione. `t` ha w, h, colore, kind,
 *               forma; `i` fa da seme, e gli alberi di un bosco stanno
 *               sempre negli stessi posti.
 *
 * Il bordo del pezzo ha la classe «contorno»: chi lo disegna puo'
 * accenderlo al passaggio del mouse o quando qualcosa non va.
 */

export function scenico(){
  /* un generatore fisso: gli alberi di un bosco stanno sempre negli
     stessi posti, fotogramma dopo fotogramma e pagina dopo pagina */
  const semeDi = n => { let s = (n * 2654435761) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

  const DEFS =
    '<pattern id="pt-erba" width="22" height="22" patternUnits="userSpaceOnUse">' +
    '<path d="M3 18l2-5M11 9l1-5M17 20l2-4" stroke="#2f5a2a" stroke-opacity=".35" stroke-width="1.4" fill="none"/></pattern>' +
    '<pattern id="pt-canne" width="26" height="20" patternUnits="userSpaceOnUse">' +
    '<path d="M4 17v-9M7 17l2-8M16 12v-8M19 12l2-7" stroke="#3d5a52" stroke-opacity=".6" stroke-width="1.5" fill="none"/>' +
    '<path d="M0 19h9M13 14h10" stroke="#5f7f86" stroke-opacity=".5" stroke-width="1.2"/></pattern>' +
    '<pattern id="pt-pietre" width="30" height="16" patternUnits="userSpaceOnUse">' +
    '<path d="M0 0h30M0 8h30M8 0v8M22 8v8" stroke="#5c5448" stroke-opacity=".45" stroke-width="1.2" fill="none"/></pattern>' +
    '<pattern id="pt-macerie" width="24" height="24" patternUnits="userSpaceOnUse">' +
    '<circle cx="5" cy="6" r="2" fill="#6a6258" fill-opacity=".5"/><circle cx="16" cy="15" r="2.6" fill="#6a6258" fill-opacity=".4"/>' +
    '<rect x="14" y="3" width="5" height="3" fill="#6a6258" fill-opacity=".45" transform="rotate(20 16 4)"/></pattern>';

  function scena(t, i){
    const w = t.w, h = t.h, c = t.colore || '#c8bda8', rnd = semeDi(i + 7);
    const tondo = t.forma === 'circle' || t.forma === 'token';
    const rr = Math.min(w, h) / 2;
    let s = '';
    if (t.kind === 'treasure'){
      s += '<circle class="contorno" r="' + rr + '" fill="' + c + '" stroke="#7a5a12" stroke-width="2"/>' +
           '<circle r="' + (rr * .62) + '" fill="none" stroke="#fff3c0" stroke-width="1.6"/>' +
           '<path d="M0 ' + (-rr * .45) + 'L' + (rr * .13) + ' ' + (-rr * .13) + 'L' + (rr * .45) + ' 0L' + (rr * .13) + ' ' + (rr * .13) +
           'L0 ' + (rr * .45) + 'L' + (-rr * .13) + ' ' + (rr * .13) + 'L' + (-rr * .45) + ' 0L' + (-rr * .13) + ' ' + (-rr * .13) + 'Z" fill="#fff3c0"/>';
    } else if (tondo){
      s += '<circle class="contorno" r="' + rr + '" fill="' + c + '" stroke="#3e3a35" stroke-width="2"/>' +
           '<circle r="' + (rr * .7) + '" fill="#8a847c" fill-opacity=".5"/>' +
           '<circle cx="' + (-rr * .25) + '" cy="' + (-rr * .25) + '" r="' + (rr * .25) + '" fill="#fff" fill-opacity=".15"/>';
    } else if (t.kind === 'wood'){
      s += '<rect class="contorno" x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h +
           '" rx="' + Math.min(w, h) * .28 + '" fill="' + c + '" fill-opacity=".75" stroke="#4d6b40" stroke-width="2" stroke-dasharray="6 4"/>' +
           '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" rx="' + Math.min(w, h) * .28 + '" fill="url(#pt-erba)"/>';
      const n = Math.max(4, Math.round(w * h / 2600));
      for (let k = 0; k < n; k++){
        const x = (rnd() - .5) * (w - 34), y = (rnd() - .5) * (h - 34), r = 11 + rnd() * 8;
        s += '<circle cx="' + (x + 3) + '" cy="' + (y + 4) + '" r="' + r + '" fill="#000" fill-opacity=".16"/>' +
             '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="#3f6b35"/>' +
             '<circle cx="' + (x - r * .3) + '" cy="' + (y - r * .3) + '" r="' + (r * .55) + '" fill="#5d8f4c"/>';
      }
    } else if (t.kind === 'hill'){
      const R = Math.min(w, h) * .48;
      s += '<rect class="contorno" x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h +
           '" rx="' + R + '" fill="' + c + '" stroke="#a8945e" stroke-width="2"/>';
      for (const k of [.72, .45])
        s += '<rect x="' + (-w * k / 2) + '" y="' + (-h * k / 2) + '" width="' + (w * k) + '" height="' + (h * k) +
             '" rx="' + (R * k) + '" fill="#fff" fill-opacity=".12" stroke="#a8945e" stroke-opacity=".7" stroke-width="1.5"/>';
    } else if (t.kind === 'marsh'){
      s += '<rect class="contorno" x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h +
           '" rx="' + Math.min(w, h) * .45 + '" fill="' + c + '" fill-opacity=".8" stroke="#5f7f86" stroke-width="2"/>' +
           '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" rx="' + Math.min(w, h) * .45 + '" fill="url(#pt-canne)"/>';
    } else if (t.kind === 'ruins' || t.kind === 'pyramid'){
      s += '<rect class="contorno" x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h +
           '" rx="4" fill="' + c + '" fill-opacity=".7" stroke="#7d7466" stroke-width="2"/>' +
           '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" fill="url(#pt-macerie)"/>';
      if (t.kind === 'pyramid')
        s += '<path d="M' + (-w / 2) + ' ' + (-h / 2) + 'L0 0L' + (w / 2) + ' ' + (-h / 2) + 'M' + (-w / 2) + ' ' + (h / 2) + 'L0 0L' + (w / 2) + ' ' + (h / 2) +
             '" stroke="#7d6a45" stroke-width="2" fill="none"/>';
      else {
        /* i muri rotti: due angoli di pietra e qualche blocco caduto */
        const sp = 9;
        s += '<path d="M' + (-w / 2 + 8) + ' ' + (-h / 2 + 30) + 'V' + (-h / 2 + 8) + 'H' + (-w * .05) +
             'M' + (w / 2 - 8) + ' ' + (h / 2 - 34) + 'V' + (h / 2 - 8) + 'H' + (w * .12) +
             '" stroke="#5f574c" stroke-width="' + sp + '" fill="none" stroke-linecap="square"/>' +
             '<path d="M' + (-w / 2 + 8) + ' ' + (-h / 2 + 30) + 'V' + (-h / 2 + 8) + 'H' + (-w * .05) +
             'M' + (w / 2 - 8) + ' ' + (h / 2 - 34) + 'V' + (h / 2 - 8) + 'H' + (w * .12) +
             '" stroke="url(#pt-pietre)" stroke-width="' + sp + '" fill="none"/>';
        for (let k = 0; k < 5; k++)
          s += '<rect x="' + ((rnd() - .5) * w * .7) + '" y="' + ((rnd() - .5) * h * .7) + '" width="' + (6 + rnd() * 6) +
               '" height="' + (5 + rnd() * 4) + '" fill="#6d655a" transform="rotate(' + Math.round(rnd() * 90) + ')"/>';
      }
    } else if (t.kind === 'wall'){
      s += '<rect class="contorno" x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + Math.max(h, 8) +
           '" fill="' + c + '" stroke="#5c5448" stroke-width="1.5"/>' +
           '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + Math.max(h, 8) + '" fill="url(#pt-pietre)"/>';
    } else {
      s += '<rect class="contorno" x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h +
           '" rx="6" fill="' + c + '" fill-opacity=".6" stroke="#b9ab90" stroke-width="2"/>';
    }
    return s;
  }

  return { DEFS, scena };
}
