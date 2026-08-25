// ============================================================
// DATI DI GIOCO — MONOPOLY (regole standard, nomi originali)
// ============================================================

export const GROUP_COLORS = {
  brown:   "#7a4a2b",
  lightblue:"#a9dcf2",
  pink:    "#d63b8e",
  orange:  "#e58a2a",
  red:     "#d43b3b",
  yellow:  "#e8d029",
  green:   "#2f9e56",
  darkblue:"#1c4a8a",
  station: "#3a3a3a",
  utility: "#8a8a8a",
};

export const HOUSE_COST = {
  brown:50, lightblue:50, pink:100, orange:100,
  red:150, yellow:150, green:200, darkblue:200,
};

// indice 0..39 in senso orario a partire da "Via" (GO)
export const BOARD = [
  { i:0,  type:"go", name:"Via" },
  { i:1,  type:"property", name:"Vicolo del Mercato", group:"brown", price:60, rent:[2,10,30,90,160,250] },
  { i:2,  type:"chest", name:"Imprevisti" },
  { i:3,  type:"property", name:"Vicolo dei Pescatori", group:"brown", price:60, rent:[4,20,60,180,320,450] },
  { i:4,  type:"tax", name:"Tasse di Proprietà", amount:200 },
  { i:5,  type:"station", name:"Stazione Nord", price:200 },
  { i:6,  type:"property", name:"Via dei Tigli", group:"lightblue", price:100, rent:[6,30,90,270,400,550] },
  { i:7,  type:"chance", name:"Probabilità" },
  { i:8,  type:"property", name:"Via delle Rose", group:"lightblue", price:100, rent:[6,30,90,270,400,550] },
  { i:9,  type:"property", name:"Corso Garibaldi", group:"lightblue", price:120, rent:[8,40,100,300,450,600] },
  { i:10, type:"jail", name:"Prigione · Semplice Visita" },
  { i:11, type:"property", name:"Piazza Navona", group:"pink", price:140, rent:[10,50,150,450,625,750] },
  { i:12, type:"utility", name:"Azienda Elettrica", price:150 },
  { i:13, type:"property", name:"Piazza di Spagna", group:"pink", price:140, rent:[10,50,150,450,625,750] },
  { i:14, type:"property", name:"Via Condotti", group:"pink", price:160, rent:[12,60,180,500,700,900] },
  { i:15, type:"station", name:"Stazione Est", price:200 },
  { i:16, type:"property", name:"Via Veneto", group:"orange", price:180, rent:[14,70,200,550,750,950] },
  { i:17, type:"chest", name:"Imprevisti" },
  { i:18, type:"property", name:"Via del Corso", group:"orange", price:180, rent:[14,70,200,550,750,950] },
  { i:19, type:"property", name:"Piazza del Popolo", group:"orange", price:200, rent:[16,80,220,600,800,1000] },
  { i:20, type:"parking", name:"Parcheggio Gratuito" },
  { i:21, type:"property", name:"Corso Vittorio Emanuele", group:"red", price:220, rent:[18,90,250,700,875,1050] },
  { i:22, type:"chance", name:"Probabilità" },
  { i:23, type:"property", name:"Via Nazionale", group:"red", price:220, rent:[18,90,250,700,875,1050] },
  { i:24, type:"property", name:"Piazza Venezia", group:"red", price:240, rent:[20,100,300,750,925,1100] },
  { i:25, type:"station", name:"Stazione Sud", price:200 },
  { i:26, type:"property", name:"Lungarno Nuovo", group:"yellow", price:260, rent:[22,110,330,800,975,1150] },
  { i:27, type:"property", name:"Ponte Vecchio", group:"yellow", price:260, rent:[22,110,330,800,975,1150] },
  { i:28, type:"utility", name:"Azienda Idrica", price:150 },
  { i:29, type:"property", name:"Piazzale Michelangelo", group:"yellow", price:280, rent:[24,120,360,850,1025,1200] },
  { i:30, type:"gotojail", name:"Vai in Prigione" },
  { i:31, type:"property", name:"Riviera del Golfo", group:"green", price:300, rent:[26,130,390,900,1100,1275] },
  { i:32, type:"property", name:"Corso Italia", group:"green", price:300, rent:[26,130,390,900,1100,1275] },
  { i:33, type:"chest", name:"Imprevisti" },
  { i:34, type:"property", name:"Piazza San Carlo", group:"green", price:320, rent:[28,150,450,1000,1200,1400] },
  { i:35, type:"station", name:"Stazione Ovest", price:200 },
  { i:36, type:"chance", name:"Probabilità" },
  { i:37, type:"property", name:"Galleria Vittorio", group:"darkblue", price:350, rent:[35,175,500,1100,1300,1500] },
  { i:38, type:"tax", name:"Tassa di Lusso", amount:100 },
  { i:39, type:"property", name:"Piazza Duomo", group:"darkblue", price:400, rent:[50,200,600,1400,1700,2000] },
];

export const GROUPS = {};
BOARD.filter(s=>s.type==="property").forEach(s=>{
  GROUPS[s.group] = GROUPS[s.group] || [];
  GROUPS[s.group].push(s.i);
});

export const STATIONS = BOARD.filter(s=>s.type==="station").map(s=>s.i);
export const UTILITIES = BOARD.filter(s=>s.type==="utility").map(s=>s.i);

export const STATION_RENT = [25,50,100,200]; // in base a quante possedute (1..4)

export const CHANCE_CARDS = [
  { text:"Avanza fino alla Via: incassi 200.", effect:{type:"move_to", to:0, collectGo:false} },
  { text:"Vai in Prigione. Non passi dalla Via, non incassi 200.", effect:{type:"goto_jail"} },
  { text:"La banca ti paga un dividendo: incassi 50.", effect:{type:"collect", amount:50} },
  { text:"Multa per eccesso di velocità: paghi 15.", effect:{type:"pay", amount:15} },
  { text:"Vai alla Stazione più vicina. Se è libera puoi comprarla, altrimenti paghi il doppio dell'affitto.", effect:{type:"move_nearest_station", pay2x:true} },
  { text:"Fai un passo indietro di 3 caselle.", effect:{type:"move_relative", delta:-3} },
  { text:"Carta \"Esci di prigione gratis\": conservala finché ti serve.", effect:{type:"get_out_of_jail"} },
  { text:"Sei stato eletto presidente del condominio: paga 50 a testa a ogni giocatore.", effect:{type:"pay_each", amount:50} },
  { text:"Vai a Piazza Duomo.", effect:{type:"move_to", to:39, collectGo:true} },
  { text:"La tua auto è dal meccanico: paga 50 per le riparazioni oppure tira di nuovo.", effect:{type:"pay", amount:50} },
  { text:"Ricevi un rimborso fiscale: incassi 20.", effect:{type:"collect", amount:20} },
  { text:"Vai alla Stazione Nord.", effect:{type:"move_to", to:5, collectGo:true} },
];

export const CHEST_CARDS = [
  { text:"Errore della banca a tuo favore: incassi 200.", effect:{type:"collect", amount:200} },
  { text:"Spese mediche: paghi 100.", effect:{type:"pay", amount:100} },
  { text:"Vendita di azioni: incassi 50.", effect:{type:"collect", amount:50} },
  { text:"Ricevi un'eredità: incassi 100.", effect:{type:"collect", amount:100} },
  { text:"Vai in Prigione. Non passi dalla Via.", effect:{type:"goto_jail"} },
  { text:"Carta \"Esci di prigione gratis\": conservala finché ti serve.", effect:{type:"get_out_of_jail"} },
  { text:"Ogni giocatore ti paga 10 per il tuo compleanno.", effect:{type:"collect_each", amount:10} },
  { text:"Paga la retta scolastica: paghi 50.", effect:{type:"pay", amount:50} },
  { text:"Ritorna alla Via e incassa 200.", effect:{type:"move_to", to:0, collectGo:false} },
  { text:"Vinci il secondo premio in un concorso di bellezza: incassi 10.", effect:{type:"collect", amount:10} },
  { text:"Paga per la manutenzione: 25 per casa, 100 per hotel.", effect:{type:"repair", perHouse:25, perHotel:100} },
  { text:"Hai venduto un immobile: incassi 45.", effect:{type:"collect", amount:45} },
];
