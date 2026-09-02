/* Schieramento Old World — utilita di base */

const MM = 25.4;
const $ = s => document.querySelector(s);
const SVGNS = "http://www.w3.org/2000/svg";
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const inch = mm => mm / MM;
export { MM, $, SVGNS, esc, inch };
