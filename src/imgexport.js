/* Schieramento Old World — il tavolo come immagine
 *
 * Serve a una cosa sola: mandare lo schieramento nel gruppo o
 * stamparlo. L'SVG sul quale disegniamo e' pieno di var(--field),
 * var(--armyA) e compagnia: dentro un <img> quelle variabili non
 * esistono piu' e verrebbe fuori una figura nera. Quindi prima di
 * serializzare si risolvono tutte, una per una.
 *
 * Le foto sono gia' dataURL dentro i <symbol>, quindi viaggiano da
 * sole senza richieste di rete.
 */

const PAINT_ATTRS = ["fill", "stroke", "color", "stop-color", "flood-color"];

function resolver(){
  const cs = typeof getComputedStyle === "function"
    ? getComputedStyle(document.documentElement) : null;
  const cache = new Map();
  return function resolve(v){
    if (!v || v.indexOf("var(") === -1) return v;
    return v.replace(/var\(\s*(--[\w-]+)\s*(?:,([^)]*))?\)/g, (_, name, fallback) => {
      if (!cache.has(name)){
        const got = cs ? cs.getPropertyValue(name).trim() : "";
        cache.set(name, got);
      }
      return cache.get(name) || (fallback || "").trim() || "#000";
    });
  };
}

/* copia l'SVG risolvendo i colori e ci mette sotto uno sfondo pieno:
   un PNG trasparente stampato su carta bianca perde meta' del disegno */
export function inlineSvg(svg, { background = true, scale = 1 } = {}){
  const resolve = resolver();
  const clone = svg.cloneNode(true);
  const vb = (svg.getAttribute("viewBox") || "0 0 100 100").split(/[\s,]+/).map(Number);
  const [vx, vy, vw, vh] = vb;

  const walk = el => {
    for (const attr of PAINT_ATTRS){
      const v = el.getAttribute && el.getAttribute(attr);
      if (v) el.setAttribute(attr, resolve(v));
    }
    const st = el.getAttribute && el.getAttribute("style");
    if (st) el.setAttribute("style", resolve(st));
    for (const c of el.children || []) walk(c);
  };
  walk(clone);

  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  clone.setAttribute("width", Math.round(vw * scale));
  clone.setAttribute("height", Math.round(vh * scale));

  if (background){
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x", vx); bg.setAttribute("y", vy);
    bg.setAttribute("width", vw); bg.setAttribute("height", vh);
    bg.setAttribute("fill", resolve("var(--paper)") || "#f4f2ec");
    clone.insertBefore(bg, clone.firstChild);
  }

  /* i font di sistema bastano: il woff di Google non e' raggiungibile
     da dentro un <img> e senza questa riga i numeri sparirebbero */
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = "text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;}";
  clone.insertBefore(style, clone.firstChild);

  return new XMLSerializer().serializeToString(clone);
}

export function svgDataUrl(svg, opts){
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(inlineSvg(svg, opts));
}

/* Il viewBox e' quello che si sta guardando; per l'immagine vogliamo
   sempre il tavolo intero, quindi si passa un riquadro esplicito e si
   rimette a posto quello di prima appena finito. */
export async function exportPNG(svg, { box = null, width = 2000, filename = "schieramento.png" } = {}){
  const prev = svg.getAttribute("viewBox");
  if (box) svg.setAttribute("viewBox", `${box.x} ${box.y} ${box.w} ${box.h}`);
  const vb = (svg.getAttribute("viewBox") || "0 0 100 100").split(/[\s,]+/).map(Number);
  const ratio = vb[3] / vb[2];
  const W = Math.min(width, 4000), H = Math.round(W * ratio);
  const url = svgDataUrl(svg);
  if (box) svg.setAttribute("viewBox", prev);

  const img = new Image();
  img.decoding = "sync";
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error("non riesco a rasterizzare il tavolo"));
    img.src = url;
  });

  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0, W, H);

  const blob = await new Promise(res => c.toBlob ? c.toBlob(res, "image/png") : res(null));
  if (blob) download(URL.createObjectURL(blob), filename, true);
  else download(c.toDataURL("image/png"), filename, false);
  return { width: W, height: H };
}

export function download(href, filename, revoke){
  const a = document.createElement("a");
  a.href = href; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (revoke) setTimeout(() => URL.revokeObjectURL(href), 4000);
}
