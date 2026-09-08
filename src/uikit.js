/* Schieramento Old World — i mattoni condivisi dell'interfaccia
 *
 * Tre pannelli diversi hanno bisogno delle stesse quattro cose:
 * contatori, etichette, una fila di scorciatoie da toccare e una
 * finestra per chiedere qualcosa. Prima ognuno se le sarebbe rifatte,
 * e per chiedere un testo si usava prompt().
 *
 * prompt(), confirm() e alert() sono comodi da scrivere e pessimi da
 * usare: sul telefono coprono lo schermo, in un'app installata hanno
 * l'aria di un errore, e proprio dove servono davvero — annotare
 * mentre giochi — sono il gesto sbagliato. Qui c'e' una finestra che
 * ha l'aspetto del resto e, soprattutto, una fila di scorciatoie: in
 * partita nessuno scrive frasi su una tastiera virtuale, e un
 * registro vuoto vale un report vuoto.
 *
 * Niente stato globale se non la finestra aperta, che e' una sola per
 * definizione.
 */

import { esc } from './util.js';

/* ============================================================
   1 · FINESTRA
   ============================================================ */
let openDlg = null;

function closeDlg(value){
  if (!openDlg) return;
  const { el, resolve, onKey } = openDlg;
  openDlg = null;
  document.removeEventListener("keydown", onKey, true);
  el.remove();
  resolve(value);
}

function shell({ title, body, ok = "Va bene", cancel = "Lascia stare", wide = false }){
  return new Promise(resolve => {
    closeDlg(null);
    const el = document.createElement("div");
    el.className = "dlg-back";
    el.innerHTML = `
      <div class="dlg${wide ? " wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="dlg-head">${esc(title)}</div>
        <div class="dlg-body">${body}</div>
        <div class="dlg-foot">
          ${cancel ? `<button class="btn" data-dlg="cancel">${esc(cancel)}</button>` : ""}
          <button class="btn primary" data-dlg="ok">${esc(ok)}</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    const onKey = e => {
      if (e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); closeDlg(null); }
      if (e.key === "Enter" && !/textarea/i.test(e.target.tagName)){
        e.preventDefault(); e.stopPropagation();
        el.querySelector('[data-dlg="ok"]').click();
      }
    };
    document.addEventListener("keydown", onKey, true);
    openDlg = { el, resolve, onKey };
    /* il clic fuori vale come «lascia stare»: e' quello che si aspetta
       chi ha aperto la finestra per sbaglio */
    el.addEventListener("pointerdown", e => { if (e.target === el) closeDlg(null); });
    el.querySelector('[data-dlg="cancel"]')?.addEventListener("click", () => closeDlg(null));
    el.querySelector('[data-dlg="ok"]').addEventListener("click", () => {
      const inp = el.querySelector("[data-dlg-value]");
      closeDlg(inp ? inp.value : true);
    });
    const first = el.querySelector("[data-dlg-value]");
    if (first){ first.focus(); if (first.select) first.select(); }
  });
}

/* Chiede un testo. `chips` e' la parte che conta: le scorciatoie da
   toccare invece che scrivere. Toccarne una scrive e conferma. */
export function askText({ title, label = "", value = "", placeholder = "",
                          chips = [], multiline = false, ok = "Va bene" } = {}){
  const field = multiline
    ? `<textarea rows="4" data-dlg-value placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
    : `<input type="text" data-dlg-value value="${esc(value)}" placeholder="${esc(placeholder)}">`;
  const body =
    (label ? `<p class="note">${esc(label)}</p>` : "") +
    field +
    (chips.length ? `<div class="chiprow">${chips.map(c =>
      `<button class="btn tiny" data-chip="${esc(c)}">${esc(c)}</button>`).join("")}</div>` : "");
  const p = shell({ title, body, ok });
  const el = openDlg && openDlg.el;
  if (el) el.querySelectorAll("[data-chip]").forEach(b => b.addEventListener("click", () => {
    const inp = el.querySelector("[data-dlg-value]");
    /* con il campo vuoto la scorciatoia e' la risposta; con qualcosa
       gia' scritto ci si accoda, che e' come si mettono due note
       insieme senza doverle ribattere */
    inp.value = inp.value.trim() ? inp.value.trim() + " · " + b.dataset.chip : b.dataset.chip;
    el.querySelector('[data-dlg="ok"]').click();
  }));
  return p.then(v => (v === null ? null : String(v)));
}

/* Conferma. Torna true/false invece di bloccare la pagina. */
export function askConfirm(text, { title = "Confermi?", ok = "Procedi", danger = false } = {}){
  return shell({ title, body: `<p class="note">${esc(text).replace(/\n/g, "<br>")}</p>`, ok })
    .then(v => v === true);
}

/* Un avviso che non chiede niente. */
export function say(text, { title = "Attenzione" } = {}){
  return shell({ title, body: `<p class="note">${esc(text)}</p>`, cancel: "" }).then(() => undefined);
}

/* Scelta fra poche voci: torna l'id scelto, o null. */
export function askPick({ title, label = "", options = [] } = {}){
  const body = (label ? `<p class="note">${esc(label)}</p>` : "") +
    `<div class="chiprow big">${options.map(o =>
      `<button class="btn" data-pick="${esc(o.id)}">${esc(o.label)}</button>`).join("")}</div>`;
  const p = shell({ title, body, ok: "", cancel: "Lascia stare" });
  const el = openDlg && openDlg.el;
  if (el){
    el.querySelector('[data-dlg="ok"]').remove();
    el.querySelectorAll("[data-pick]").forEach(b =>
      b.addEventListener("click", () => closeDlg(b.dataset.pick)));
  }
  return p.then(v => (typeof v === "string" ? v : null));
}

/* ============================================================
   2 · CONTATORI
   Un nome e un numero. L'app non sa cosa conta: sa contare.
   ============================================================ */
export function countersHTML(owner, ns, { title = "Contatori", hint = "", vocab = [] } = {}){
  const list = Array.isArray(owner.counters) ? owner.counters : [];
  const free = vocab.filter(v => !list.some(c => c.name.toLowerCase() === v.toLowerCase())).slice(0, 4);
  return `
    <div class="cntbox" data-cnt="${esc(ns)}">
      <div class="readout"><span>${esc(title)}</span><b>${list.length || "—"}</b></div>
      ${hint ? `<p class="note">${esc(hint)}</p>` : ""}
      ${list.map((c, i) => `
        <div class="cntrow">
          <span class="nm">${esc(c.name)}</span>
          <button class="btn tiny" data-cnt-m="${i}" title="Uno in meno">−</button>
          <b class="mono val">${+c.value || 0}</b>
          <button class="btn tiny" data-cnt-p="${i}" title="Uno in più">+</button>
          <button class="btn tiny ghost" data-cnt-x="${i}" title="Togli il contatore">×</button>
        </div>`).join("")}
      <div class="chiprow">
        ${free.map(v => `<button class="btn tiny" data-cnt-quick="${esc(v)}">+ ${esc(v)}</button>`).join("")}
        <button class="btn tiny" data-cnt-add>+ contatore…</button>
      </div>
    </div>`;
}

export function wireCounters(root, owner, ns, { onChange, ask = askText } = {}){
  const box = root && root.querySelector(`[data-cnt="${ns}"]`);
  if (!box) return;
  const list = () => (Array.isArray(owner.counters) ? owner.counters : (owner.counters = []));
  const done = () => onChange && onChange();
  box.querySelectorAll("[data-cnt-m]").forEach(b => b.addEventListener("click", () => {
    const c = list()[+b.dataset.cntM]; if (!c) return;
    c.value = Math.round((+c.value || 0) - 1); done();
  }));
  box.querySelectorAll("[data-cnt-p]").forEach(b => b.addEventListener("click", () => {
    const c = list()[+b.dataset.cntP]; if (!c) return;
    c.value = Math.round((+c.value || 0) + 1); done();
  }));
  box.querySelectorAll("[data-cnt-x]").forEach(b => b.addEventListener("click", () => {
    list().splice(+b.dataset.cntX, 1); done();
  }));
  box.querySelectorAll("[data-cnt-quick]").forEach(b => b.addEventListener("click", () => {
    list().push({ name: b.dataset.cntQuick, value: 0 }); done();
  }));
  const add = box.querySelector("[data-cnt-add]");
  if (add) add.addEventListener("click", async () => {
    const n = await ask({ title:"Nuovo contatore", label:"Come si chiama? L'app non ha bisogno di sapere cosa conta.",
                          placeholder:"dadi, munizioni, cariche…" });
    if (n === null || !n.trim()) return;
    list().push({ name: n.trim().slice(0, 24), value: 0 });
    done();
  });
}

/* ============================================================
   3 · ETICHETTE
   ============================================================ */
export function tagsHTML(u, ns, vocab = []){
  const mine = Array.isArray(u.tags) ? u.tags : [];
  const free = vocab.filter(v => !mine.includes(v)).slice(0, 6);
  return `
    <div class="tagbox" data-tags="${esc(ns)}">
      <div class="readout"><span>Etichette</span><b>${mine.length || "—"}</b></div>
      ${mine.length ? `<div class="tags">${mine.map(t =>
        `<button class="tag on" data-tag-x="${esc(t)}" title="Togli">${esc(t)} ×</button>`).join("")}</div>` : ""}
      <div class="chiprow">
        ${free.map(t => `<button class="btn tiny" data-tag-q="${esc(t)}">+ ${esc(t)}</button>`).join("")}
        <button class="btn tiny" data-tag-add>+ etichetta…</button>
      </div>
    </div>`;
}

export function wireTags(root, u, ns, { onChange, add, remove, ask = askText } = {}){
  const box = root && root.querySelector(`[data-tags="${ns}"]`);
  if (!box) return;
  const done = () => onChange && onChange();
  box.querySelectorAll("[data-tag-x]").forEach(b => b.addEventListener("click", () => { remove(u, b.dataset.tagX); done(); }));
  box.querySelectorAll("[data-tag-q]").forEach(b => b.addEventListener("click", () => { add(u, b.dataset.tagQ); done(); }));
  const btn = box.querySelector("[data-tag-add]");
  if (btn) btn.addEventListener("click", async () => {
    const t = await ask({ title:"Nuova etichetta", label:"Una parola. L'app non sa cosa vuol dire, la scrive e basta.",
                          placeholder:"disordinata, ha caricato, benedetta…" });
    if (t === null || !t.trim()) return;
    add(u, t); done();
  });
}

/* ============================================================
   4 · MENU CONTESTUALE
   Sul tavolo, per ruotare un pezzo o aprirne la formazione bisognava
   scendere nell'ispettore in fondo al pannello: sul telefono vuol dire
   aprire il cassetto, scorrere, tornare indietro. Qui le quattro cose
   che si fanno sempre arrivano dove sta il dito — pressione lunga sul
   tocco, tasto destro col mouse.

   `items` e' una lista di { label, run, danger } piu' { sep:true }.
   ============================================================ */
let openCtx = null;

export function closeMenu(){
  if (!openCtx) return;
  const { el, onKey, onDown } = openCtx;
  openCtx = null;
  document.removeEventListener("keydown", onKey, true);
  document.removeEventListener("pointerdown", onDown, true);
  el.remove();
}

export function showMenu(clientX, clientY, items, { title = "" } = {}){
  closeMenu();
  const el = document.createElement("div");
  el.className = "ctxmenu";
  el.setAttribute("role", "menu");
  el.innerHTML =
    (title ? `<div class="ctx-head">${esc(title)}</div>` : "") +
    items.map((it, i) => it.sep
      ? `<div class="ctx-sep"></div>`
      : `<button class="btn${it.danger ? " ghost" : ""}" data-ctx="${i}"${
          it.danger ? ' style="color:var(--bad)"' : ""}>${esc(it.label)}</button>`).join("");
  document.body.appendChild(el);

  /* il riquadro si mette dove sta il dito, ma dentro lo schermo: aperto
     sul bordo destro del tavolo finirebbe meta' fuori */
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth || 800, vh = window.innerHeight || 600;
  el.style.left = Math.max(8, Math.min(clientX - 12, vw - r.width - 8)) + "px";
  el.style.top  = Math.max(8, Math.min(clientY - 12, vh - r.height - 8)) + "px";

  const onKey = e => { if (e.key === "Escape"){ e.preventDefault(); closeMenu(); } };
  /* si ascolta il pointerdown SUCCESSIVO: quello che ha aperto il menu
     con la pressione lunga e' ancora premuto, e il suo pointerup non
     deve richiudere subito quello che ha appena aperto */
  const onDown = e => { if (!e.target.closest(".ctxmenu")) closeMenu(); };
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("pointerdown", onDown, true);
  openCtx = { el, onKey, onDown };

  el.addEventListener("click", e => {
    const b = e.target.closest("[data-ctx]");
    if (!b) return;
    const it = items[+b.dataset.ctx];
    closeMenu();
    if (it && it.run) it.run();
  });
  return el;
}
