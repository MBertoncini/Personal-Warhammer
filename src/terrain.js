/* Schieramento Old World — tipi di elemento scenico */

/* ============================================================
   3 · TERRENO
   ============================================================ */
/* `cover` dice quanto ripara chi ci sta dentro o dietro dal tiro:
   niente, leggera (-1 per colpire), pesante (-2). E' l'unica cosa che
   il tipo di elemento sa dire da solo; il resto lo decidono i due
   giocatori guardando il pezzo vero. */
const TERRAIN = {
  hill:     { label:"Collina",  color:"var(--t-hill)",     shape:"rect",   pass:"open",     los:false, cover:"",     w:10, h:6 },
  wood:     { label:"Bosco",    color:"var(--t-wood)",     shape:"rect",   pass:"difficult",los:true,  cover:"soft", w:8,  h:6 },
  marsh:    { label:"Palude",   color:"var(--t-marsh)",    shape:"rect",   pass:"difficult",los:false, cover:"",     w:9,  h:5 },
  ruins:    { label:"Rovine",   color:"var(--t-ruins)",    shape:"rect",   pass:"difficult",los:true,  cover:"hard", w:6,  h:5 },
  wall:     { label:"Muretto",  color:"var(--t-wall)",     shape:"wall",   pass:"obstacle", los:false, cover:"hard", w:8,  h:0.8 },
  monolith: { label:"Monolite", color:"var(--t-mono)",     shape:"circle", pass:"blocked",  los:true,  cover:"hard", w:4,  h:4 },
  pyramid:  { label:"Piramide", color:"var(--t-ruins)",    shape:"rect",   pass:"blocked",  los:true,  cover:"hard", w:8,  h:7 },
  treasure: { label:"Tesoro",   color:"var(--t-treasure)", shape:"token",  pass:"open",     los:false, cover:"",     w:1.575, h:1.575 },
};
const TREASURE_CLEAR = 3;      // pollici minimi da ogni elemento scenico
const BM_MAX_SIDE = 12;        // limite Battle March sul lato lungo
export { TERRAIN, TREASURE_CLEAR, BM_MAX_SIDE };
