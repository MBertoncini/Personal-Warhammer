/* Schieramento Old World — suggerimenti dal catalogo
 *
 * Chi scrive una lista a mano ha gia' le miniature in vetrina: il nome
 * che sta battendo e' quasi sempre una voce del catalogo. Proporgliela
 * mentre scrive risparmia due cose alla volta — il nome storpiato e
 * l'aggancio da rifare dopo — e con la foto accanto si riconosce il
 * pezzo prima di leggerne il nome.
 *
 * E' una tendina e basta: nessuno stato salvato, nessuna scelta
 * imposta. Se il nome che serve non e' in collezione si continua a
 * scrivere e la tendina sparisce da sola.
 */

import { esc } from './util.js';
import { suggestFor, photoFor } from './catalog.js';

/* una sola tendina aperta alla volta, come per le finestre di uikit */
let box = null;

export function closeSuggest(){
  if (!box) return;
  box.el.remove();
  window.removeEventListener("scroll", reposition, true);
  window.removeEventListener("resize", closeSuggest);
  box = null;
}

function reposition(){
  if (!box) return;
  const { el, input } = box;
  if (!input.isConnected) return closeSuggest();
  const r = input.getBoundingClientRect();
  /* sotto il campo, salvo quando sotto non ci sta: allora sopra */
  const room = window.innerHeight - r.bottom;
  el.style.left  = r.left + "px";
  el.style.width = Math.max(r.width, 220) + "px";
  if (room < 160 && r.top > room){
    el.style.top = "auto";
    el.style.bottom = (window.innerHeight - r.top + 4) + "px";
  } else {
    el.style.bottom = "auto";
    el.style.top = (r.bottom + 4) + "px";
  }
}

function draw(input, rows, onPick){
  if (!box || box.input !== input){
    closeSuggest();
    const el = document.createElement("div");
    el.className = "suggest";
    el.setAttribute("role", "listbox");
    document.body.appendChild(el);
    box = { el, input, rows, at: -1 };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", closeSuggest);
  }
  box.rows = rows;
  box.at = -1;
  box.el.innerHTML = rows.map((r, k) => {
    const e = r.entry;
    const p = photoFor(e.id);
    const note = [e.faction, (+e.owned || 0) + " in collezione"].filter(Boolean).join(" · ");
    return `<button type="button" class="sug" role="option" data-k="${k}">
        ${p ? `<img src="${p}" alt="">` : `<span class="ph"></span>`}
        <span class="t"><b>${esc(e.name)}</b><span class="mono">${esc(note)}</span></span>
      </button>`;
  }).join("");
  /* mousedown e non click: il blur del campo chiuderebbe la tendina
     prima che il clic arrivi a destinazione */
  box.el.querySelectorAll("[data-k]").forEach(b =>
    b.addEventListener("mousedown", ev => {
      ev.preventDefault();
      const r = rows[+b.dataset.k];
      closeSuggest();
      if (r) onPick(r.entry);
    }));
  reposition();
}

function highlight(d){
  if (!box || !box.rows.length) return;
  const n = box.rows.length;
  box.at += d;
  /* -1 e' «nessuna riga scelta»: si passa di li' girando in tondo, cosi'
     si torna a quello che si stava scrivendo senza uscire dal campo */
  if (box.at >= n) box.at = -1;
  if (box.at < -1) box.at = n - 1;
  box.el.querySelectorAll(".sug").forEach((b, k) => b.classList.toggle("on", k === box.at));
  const on = box.el.querySelector(".sug.on");
  if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest" });
}

/* Attacca la tendina a un campo di testo. `onPick` riceve la voce di
   catalogo scelta e decide cosa farne: qui non si tocca niente. */
export function attachSuggest(input, onPick){
  if (!input || input.dataset.sug) return;
  input.dataset.sug = "1";
  input.setAttribute("autocomplete", "off");

  const refresh = () => {
    const rows = suggestFor(input.value, 6);
    /* niente tendina quando quello che c'e' scritto e' gia' esattamente
       il nome di una voce: sarebbe una riga che ripete il campo */
    if (!rows.length || (rows.length === 1 && rows[0].score > .999 &&
        rows[0].entry.name.toLowerCase() === input.value.trim().toLowerCase())){
      if (box && box.input === input) closeSuggest();
      return;
    }
    draw(input, rows, onPick);
  };

  input.addEventListener("input", refresh);
  input.addEventListener("focus", refresh);
  input.addEventListener("blur", () => setTimeout(() => {
    if (box && box.input === input) closeSuggest();
  }, 120));
  input.addEventListener("keydown", e => {
    if (!box || box.input !== input) return;
    if (e.key === "ArrowDown"){ e.preventDefault(); highlight(1); }
    else if (e.key === "ArrowUp"){ e.preventDefault(); highlight(-1); }
    else if (e.key === "Escape"){ e.stopPropagation(); closeSuggest(); }
    else if (e.key === "Enter" && box.at >= 0){
      e.preventDefault();
      const r = box.rows[box.at];
      closeSuggest();
      if (r) onPick(r.entry);
    }
  });
}
