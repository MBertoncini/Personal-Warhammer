/* Schieramento Old World — piccolo bus di eventi
 *
 * Serve solo a evitare che i moduli si importino a vicenda: il
 * catalogo non deve sapere che esiste il tavolo, gli manda un
 * segnale e chi ascolta si ridisegna.
 */

const subs = new Map();

export function on(evt, fn){
  if (!subs.has(evt)) subs.set(evt, []);
  subs.get(evt).push(fn);
  return () => off(evt, fn);
}

export function off(evt, fn){
  const l = subs.get(evt);
  if (l) subs.set(evt, l.filter(f => f !== fn));
}

export function emit(evt, data){
  for (const fn of subs.get(evt) || []) {
    try { fn(data); } catch (err) { console.warn("handler", evt, err); }
  }
}
