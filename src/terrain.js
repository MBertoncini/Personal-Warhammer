/* Schieramento Old World — tipi di elemento scenico */

/* ============================================================
   3 · TERRENO
   ============================================================ */
const TERRAIN = {
  hill:     { label:"Collina",  color:"var(--t-hill)",     shape:"rect",   pass:"open",     los:false, w:10, h:6 },
  wood:     { label:"Bosco",    color:"var(--t-wood)",     shape:"rect",   pass:"difficult",los:true,  w:8,  h:6 },
  marsh:    { label:"Palude",   color:"var(--t-marsh)",    shape:"rect",   pass:"difficult",los:false, w:9,  h:5 },
  ruins:    { label:"Rovine",   color:"var(--t-ruins)",    shape:"rect",   pass:"difficult",los:true,  w:6,  h:5 },
  wall:     { label:"Muretto",  color:"var(--t-wall)",     shape:"wall",   pass:"obstacle", los:false, w:8,  h:0.8 },
  monolith: { label:"Monolite", color:"var(--t-mono)",     shape:"circle", pass:"blocked",  los:true,  w:4,  h:4 },
  pyramid:  { label:"Piramide", color:"var(--t-ruins)",    shape:"rect",   pass:"blocked",  los:true,  w:8,  h:7 },
  treasure: { label:"Tesoro",   color:"var(--t-treasure)", shape:"token",  pass:"open",     los:false, w:1.575, h:1.575 },
};
const TREASURE_CLEAR = 3;      // pollici minimi da ogni elemento scenico
const BM_MAX_SIDE = 12;        // limite Battle March sul lato lungo
export { TERRAIN, TREASURE_CLEAR, BM_MAX_SIDE };
