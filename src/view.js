/* Schieramento Old World — zoom e scorrimento del tavolo
 *
 * Fino a ieri l'SVG mostrava sempre tutto il tavolo dentro la finestra:
 * su 96x48 una basetta da 25 mm diventa tre pixel e le foto non si
 * distinguono. Qui il viewBox smette di essere fisso e diventa una
 * finestra mobile: ingrandimento e centro.
 *
 * Il resto del disegno non se ne accorge: continua a lavorare in
 * millimetri sul tavolo, e' solo il viewBox che cambia.
 */

const MIN_Z = 0.4, MAX_Z = 12;

export function createView(svg, { getBase, onChange = () => {} }){
  let z = 1, cx = null, cy = null;      // centro in coordinate tavolo

  const clampZ = v => Math.max(MIN_Z, Math.min(MAX_Z, v));

  function box(){
    const b = getBase();
    if (cx === null){ cx = b.x + b.w / 2; cy = b.y + b.h / 2; }
    const w = b.w / z, h = b.h / z;
    /* si puo' uscire dal tavolo di mezza schermata: serve per lavorare
       comodi sul bordo, non per perdersi nel vuoto */
    const mx = b.w / 2, my = b.h / 2;
    const x = Math.max(b.x - mx, Math.min(cx - w / 2, b.x + b.w + mx - w));
    const y = Math.max(b.y - my, Math.min(cy - h / 2, b.y + b.h + my - h));
    return { x, y, w, h };
  }

  function apply(){
    const v = box();
    svg.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
    onChange({ zoom: z, fitted: Math.abs(z - 1) < 0.001 });
  }

  /* Da pixel di schermo a coordinate del tavolo. getScreenCTM e' la via
     giusta e c'e' ovunque; il calcolo a mano resta per jsdom e per i
     momenti in cui il nodo non e' ancora nel documento. */
  function toBoard(evt){
    const ctm = svg.getScreenCTM && svg.getScreenCTM();
    if (ctm && svg.createSVGPoint){
      const p = svg.createSVGPoint();
      p.x = evt.clientX; p.y = evt.clientY;
      const q = p.matrixTransform(ctm.inverse());
      return [q.x, q.y];
    }
    const r = svg.getBoundingClientRect ? svg.getBoundingClientRect() : { left:0, top:0, width:1, height:1 };
    const v = box();
    const k = Math.min(r.width / v.w, r.height / v.h) || 1;   // xMidYMid meet
    const ox = r.left + (r.width - v.w * k) / 2;
    const oy = r.top + (r.height - v.h * k) / 2;
    return [(evt.clientX - ox) / k + v.x, (evt.clientY - oy) / k + v.y];
  }

  /* ingrandisce tenendo fermo il punto sotto il puntatore: e' la
     differenza fra uno zoom che si guida e uno che scappa via */
  function zoomAt(factor, anchor){
    const before = anchor || [cx, cy];
    const next = clampZ(z * factor);
    if (next === z) return;
    const k = z / next;
    cx = before[0] + (cx - before[0]) * k;
    cy = before[1] + (cy - before[1]) * k;
    z = next;
    apply();
  }

  function zoomBy(factor){ const v = box(); zoomAt(factor, [v.x + v.w/2, v.y + v.h/2]); }

  function panByBoard(dx, dy){ cx -= dx; cy -= dy; apply(); }

  function fit(){ const b = getBase(); z = 1; cx = b.x + b.w/2; cy = b.y + b.h/2; apply(); }

  /* inquadra un rettangolo (un'unita' da mostrare) con un po' d'aria */
  function focus(rect, maxZoom = 3){
    const b = getBase();
    const pad = 1.6;
    const want = Math.min(b.w / (rect.w * pad), b.h / (rect.h * pad));
    z = clampZ(Math.min(want, maxZoom));
    if (z < 1) z = 1;
    cx = rect.x + rect.w / 2; cy = rect.y + rect.h / 2;
    apply();
  }

  return {
    apply, toBoard, zoomAt, zoomBy, panByBoard, fit, focus,
    get zoom(){ return z; },
    set zoom(v){ z = clampZ(v); apply(); },
    get center(){ return [cx, cy]; },
    setCenter(x, y){ cx = x; cy = y; apply(); },
    box,
  };
}

/* ------------------------------------------------------------------
   Gesti: rotella, trascinamento del vuoto, pizzico a due dita.
   Il disegno del tavolo gestisce i pezzi; qui restano i gesti che
   riguardano la finestra e basta.
   ------------------------------------------------------------------ */
export function wireViewGestures(svg, view, { isPanBlocked = () => false, onPanEnd = () => {} } = {}){
  const pointers = new Map();
  let pan = null, pinch = null;

  svg.addEventListener("wheel", e => {
    e.preventDefault();
    const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016));
    view.zoomAt(f, view.toBoard(e));
  }, { passive: false });

  const start = e => {
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2){
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a[0]-b[0], a[1]-b[1]) || 1 };
      pan = null;
      return;
    }
    if (pinch) return;
    if (e.button === 1 || e.shiftKey || isPanBlocked(e)){
      pan = { last: view.toBoard(e), moved: false };
      try { svg.setPointerCapture(e.pointerId); } catch (_) {}
    }
  };

  const move = e => {
    if (!pointers.has(e.pointerId) && !pan) return;
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && pointers.size === 2){
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0]-b[0], a[1]-b[1]) || 1;
      const mid = { clientX:(a[0]+b[0])/2, clientY:(a[1]+b[1])/2 };
      view.zoomAt(d / pinch.d, view.toBoard(mid));
      pinch.d = d;
      return;
    }
    if (!pan) return;
    const p = view.toBoard(e);
    view.panByBoard(p[0] - pan.last[0], p[1] - pan.last[1]);
    pan.moved = true;
    /* dopo lo spostamento il punto sotto il dito e' cambiato: si
       rilegge, altrimenti la mappa scivola via da sola */
    pan.last = view.toBoard(e);
  };

  const end = e => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pan){ const moved = pan.moved; pan = null; onPanEnd(moved); }
    try { svg.releasePointerCapture(e.pointerId); } catch (_) {}
  };

  svg.addEventListener("pointerdown", start);
  svg.addEventListener("pointermove", move);
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  svg.addEventListener("pointerleave", e => { pointers.delete(e.pointerId); });

  return {
    get panning(){ return !!pan; },
    beginPan(e){ pan = { last: view.toBoard(e), moved: false }; try { svg.setPointerCapture(e.pointerId); } catch (_) {} },
  };
}
