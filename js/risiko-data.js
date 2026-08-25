// ============================================================
// DATI DI GIOCO — RISIKO
// Mappa schematica a 42 territori / 6 continenti, regole standard.
// ============================================================

export const CONTINENTS = {
  nordamerica: { name: "Nord America", bonus: 5, color: "#c9704a" },
  sudamerica:  { name: "Sud America",  bonus: 2, color: "#c9a24b" },
  europa:      { name: "Europa",       bonus: 5, color: "#5f8fc9" },
  africa:      { name: "Africa",       bonus: 3, color: "#caa24b" },
  asia:        { name: "Asia",         bonus: 7, color: "#6fae6f" },
  oceania:     { name: "Oceania",      bonus: 2, color: "#b06fc9" },
};

// id, nome, continente, coordinate SVG (viewBox 0 0 860 560)
export const TERRITORIES = [
  // ---- Nord America ----
  { id:"alaska", name:"Alaska", cont:"nordamerica", x:55, y:55 },
  { id:"territori_nordovest", name:"Territori del Nordovest", cont:"nordamerica", x:150, y:50 },
  { id:"groenlandia", name:"Groenlandia", cont:"nordamerica", x:290, y:35 },
  { id:"alberta", name:"Alberta", cont:"nordamerica", x:110, y:125 },
  { id:"ontario", name:"Ontario", cont:"nordamerica", x:195, y:120 },
  { id:"quebec", name:"Quebec", cont:"nordamerica", x:275, y:130 },
  { id:"usa_ovest", name:"Stati Uniti Occ.", cont:"nordamerica", x:115, y:205 },
  { id:"usa_est", name:"Stati Uniti Or.", cont:"nordamerica", x:215, y:205 },
  { id:"america_centrale", name:"America Centrale", cont:"nordamerica", x:150, y:275 },
  // ---- Sud America ----
  { id:"venezuela", name:"Venezuela", cont:"sudamerica", x:205, y:335 },
  { id:"brasile", name:"Brasile", cont:"sudamerica", x:265, y:405 },
  { id:"peru", name:"Perù", cont:"sudamerica", x:190, y:425 },
  { id:"argentina", name:"Argentina", cont:"sudamerica", x:210, y:505 },
  // ---- Europa ----
  { id:"islanda", name:"Islanda", cont:"europa", x:335, y:60 },
  { id:"gran_bretagna", name:"Gran Bretagna", cont:"europa", x:335, y:145 },
  { id:"scandinavia", name:"Scandinavia", cont:"europa", x:415, y:50 },
  { id:"ucraina", name:"Ucraina", cont:"europa", x:480, y:120 },
  { id:"europa_nord", name:"Europa del Nord", cont:"europa", x:405, y:145 },
  { id:"europa_ovest", name:"Europa Occ.", cont:"europa", x:335, y:215 },
  { id:"europa_sud", name:"Europa del Sud", cont:"europa", x:405, y:215 },
  // ---- Africa ----
  { id:"africa_nord", name:"Africa del Nord", cont:"africa", x:355, y:305 },
  { id:"egitto", name:"Egitto", cont:"africa", x:425, y:295 },
  { id:"africa_est", name:"Africa Orientale", cont:"africa", x:465, y:365 },
  { id:"congo", name:"Congo", cont:"africa", x:405, y:405 },
  { id:"africa_sud", name:"Africa del Sud", cont:"africa", x:415, y:475 },
  { id:"madagascar", name:"Madagascar", cont:"africa", x:485, y:465 },
  // ---- Asia ----
  { id:"ural", name:"Ural", cont:"asia", x:540, y:95 },
  { id:"siberia", name:"Siberia", cont:"asia", x:610, y:60 },
  { id:"jakutsk", name:"Jakutsk", cont:"asia", x:680, y:40 },
  { id:"kamchatka", name:"Kamchatka", cont:"asia", x:775, y:50 },
  { id:"irkutsk", name:"Irkutsk", cont:"asia", x:670, y:115 },
  { id:"mongolia", name:"Mongolia", cont:"asia", x:710, y:145 },
  { id:"giappone", name:"Giappone", cont:"asia", x:800, y:145 },
  { id:"afghanistan", name:"Afghanistan", cont:"asia", x:525, y:175 },
  { id:"cina", name:"Cina", cont:"asia", x:620, y:195 },
  { id:"medio_oriente", name:"Medio Oriente", cont:"asia", x:505, y:245 },
  { id:"india", name:"India", cont:"asia", x:590, y:265 },
  { id:"siam", name:"Siam", cont:"asia", x:650, y:265 },
  // ---- Oceania ----
  { id:"indonesia", name:"Indonesia", cont:"oceania", x:660, y:335 },
  { id:"nuova_guinea", name:"Nuova Guinea", cont:"oceania", x:745, y:325 },
  { id:"australia_ovest", name:"Australia Occ.", cont:"oceania", x:690, y:405 },
  { id:"australia_est", name:"Australia Or.", cont:"oceania", x:760, y:405 },
];

export const TERRITORY_MAP = Object.fromEntries(TERRITORIES.map(t=>[t.id, t]));

const RAW_ADJ = {
  alaska: ["territori_nordovest","alberta","kamchatka"],
  territori_nordovest: ["alaska","alberta","ontario","groenlandia"],
  groenlandia: ["territori_nordovest","ontario","quebec","islanda"],
  alberta: ["alaska","territori_nordovest","ontario","usa_ovest"],
  ontario: ["alberta","territori_nordovest","groenlandia","quebec","usa_est","usa_ovest"],
  quebec: ["ontario","groenlandia","usa_est"],
  usa_ovest: ["alberta","ontario","usa_est","america_centrale"],
  usa_est: ["usa_ovest","ontario","quebec","america_centrale"],
  america_centrale: ["usa_ovest","usa_est","venezuela"],

  venezuela: ["america_centrale","brasile","peru"],
  brasile: ["venezuela","peru","argentina","africa_nord"],
  peru: ["venezuela","brasile","argentina"],
  argentina: ["peru","brasile"],

  islanda: ["groenlandia","gran_bretagna","scandinavia"],
  gran_bretagna: ["islanda","scandinavia","europa_nord","europa_ovest"],
  scandinavia: ["islanda","gran_bretagna","europa_nord","ucraina"],
  ucraina: ["scandinavia","europa_nord","europa_sud","ural","afghanistan","medio_oriente"],
  europa_nord: ["gran_bretagna","scandinavia","ucraina","europa_sud","europa_ovest"],
  europa_ovest: ["gran_bretagna","europa_nord","europa_sud","africa_nord"],
  europa_sud: ["europa_nord","ucraina","europa_ovest","africa_nord","egitto","medio_oriente"],

  africa_nord: ["brasile","europa_ovest","europa_sud","egitto","africa_est","congo"],
  egitto: ["europa_sud","africa_nord","africa_est","medio_oriente"],
  africa_est: ["egitto","africa_nord","congo","africa_sud","madagascar","medio_oriente"],
  congo: ["africa_nord","africa_est","africa_sud"],
  africa_sud: ["congo","africa_est","madagascar"],
  madagascar: ["africa_est","africa_sud"],

  ural: ["ucraina","siberia","cina","afghanistan"],
  siberia: ["ural","jakutsk","irkutsk","mongolia","cina"],
  jakutsk: ["siberia","kamchatka","irkutsk"],
  kamchatka: ["jakutsk","irkutsk","mongolia","giappone","alaska"],
  irkutsk: ["siberia","jakutsk","kamchatka","mongolia"],
  mongolia: ["siberia","irkutsk","kamchatka","giappone","cina"],
  giappone: ["kamchatka","mongolia"],
  afghanistan: ["ural","cina","india","medio_oriente","ucraina"],
  cina: ["ural","siberia","mongolia","afghanistan","india","siam"],
  medio_oriente: ["ucraina","europa_sud","egitto","africa_est","afghanistan","india"],
  india: ["afghanistan","cina","medio_oriente","siam"],
  siam: ["cina","india","indonesia"],

  indonesia: ["siam","nuova_guinea","australia_ovest"],
  nuova_guinea: ["indonesia","australia_ovest","australia_est"],
  australia_ovest: ["indonesia","nuova_guinea","australia_est"],
  australia_est: ["nuova_guinea","australia_ovest"],
};

// chiusura simmetrica dell'adiacenza
export const ADJACENCY = {};
for(const t of TERRITORIES) ADJACENCY[t.id] = new Set(RAW_ADJ[t.id]||[]);
for(const [a, list] of Object.entries(RAW_ADJ)){
  for(const b of list){ ADJACENCY[b] = ADJACENCY[b]||new Set(); ADJACENCY[b].add(a); }
}
export function areAdjacent(a,b){ return ADJACENCY[a] && ADJACENCY[a].has(b); }

// mazzo carte territorio: simboli fanteria/cavalleria/artiglieria + 2 jolly
const SYMBOLS = ["fanteria","cavalleria","artiglieria"];
export function buildDeck(){
  const deck = TERRITORIES.map((t,i)=>({ territory:t.id, symbol: SYMBOLS[i % 3] }));
  deck.push({ territory:null, symbol:"jolly" });
  deck.push({ territory:null, symbol:"jolly" });
  return deck;
}

// bonus armate per tris di carte giocate (progressione standard)
export function cardSetBonus(setNumber){
  const table = [4,6,8,10,12,15];
  if(setNumber <= table.length) return table[setNumber-1];
  return 15 + (setNumber - table.length) * 5;
}

export function isValidCardSet(cards){
  if(cards.length !== 3) return false;
  const symbols = cards.map(c=>c.symbol);
  const wild = symbols.filter(s=>s==="jolly").length;
  const real = symbols.filter(s=>s!=="jolly");
  const uniqueReal = new Set(real);
  if(real.length + wild < 3) return false;
  if(uniqueReal.size <= 1) return true; // tutte uguali (+ eventuali jolly)
  if(uniqueReal.size === real.length && real.length + wild === 3) return true; // tutte diverse
  return false;
}

export const SYMBOL_ICON = { fanteria:"🪖", cavalleria:"🐎", artiglieria:"💣", jolly:"⭐" };

// ============================================================
// OBIETTIVI SEGRETI (missioni) — variante classica italiana
// ============================================================
// Le missioni "a continenti fissi" sono uguali per tutte le partite;
// le missioni "distruggi il giocatore X" e le due "24 territori" completano
// il mazzo in base al numero di giocatori seduti al tavolo.
export const FIXED_MISSIONS = [
  { id:"m_na_af", type:"continents", continents:["nordamerica","africa"], text:"Conquistare i territori del Nord America e dell'Africa." },
  { id:"m_as_sa", type:"continents", continents:["asia","sudamerica"], text:"Conquistare i territori dell'Asia e del Sud America." },
  { id:"m_as_af", type:"continents", continents:["asia","africa"], text:"Conquistare i territori dell'Asia e dell'Africa." },
  { id:"m_na_oc", type:"continents", continents:["nordamerica","oceania"], text:"Conquistare i territori del Nord America e dell'Oceania." },
  { id:"m_eu_oc_x", type:"continents_plus_one", continents:["europa","oceania"], text:"Conquistare i territori dell'Europa, dell'Oceania e di un terzo continente a scelta." },
  { id:"m_eu_sa_x", type:"continents_plus_one", continents:["europa","sudamerica"], text:"Conquistare i territori dell'Europa, del Sud America e di un terzo continente a scelta." },
  { id:"m_24a", type:"territories", count:24, text:"Conquistare 24 territori a scelta, occupando ciascuno con almeno 1 armata." },
  { id:"m_24b", type:"territories", count:24, text:"Conquistare 24 territori a scelta, occupando ciascuno con almeno 1 armata." },
];

export function buildMissionPool(players){
  const destroyMissions = players.map(p=>({
    id:"destroy_"+p.id, type:"destroy", targetId:p.id,
    text:`Distruggere completamente le armate del giocatore di colore ${p.name}. (Se qualcun altro lo elimina per primo, il tuo obiettivo diventa conquistare 24 territori.)`
  }));
  return [...FIXED_MISSIONS.map(m=>({...m})), ...destroyMissions];
}

export function assignMissions(players){
  const pool = buildMissionPool(players).sort(()=>Math.random()-0.5);
  const assigned = {};
  players.forEach(p=>{
    let idx = pool.findIndex(m=> !(m.type==="destroy" && m.targetId===p.id));
    if(idx === -1) idx = 0;
    const mission = pool.splice(idx,1)[0];
    assigned[p.id] = mission;
  });
  return assigned;
}

export const MISSION_ICON = { continents:"🌍", continents_plus_one:"🗺️", territories:"🚩", destroy:"⚔️" };
