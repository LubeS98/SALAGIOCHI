import { supabase, isConfigured, genId, PLAYER_COLORS, savePlayerSession, getPlayerSession, logHistory, fmtTime } from "./supabaseClient.js";
import { CONTINENTS, TERRITORIES, TERRITORY_MAP, ADJACENCY, areAdjacent, buildDeck, cardSetBonus, isValidCardSet, SYMBOL_ICON, assignMissions, MISSION_ICON } from "./risiko-data.js";

const params = new URLSearchParams(location.search);
const gameId = params.get("game");
if(!gameId){ document.body.innerHTML = "<p style='padding:40px;color:#fff'>Nessuna partita specificata.</p>"; throw new Error("no game id"); }

let game = null;       // riga games
let players = [];      // righe players
let me = getPlayerSession(gameId); // {playerId, name}
let selection = { mode:null, from:null, to:null };
let lastHistoryIds = new Set();
let prevArmies = {};       // per animare i floater "+N"
let prevOwners = {};       // per rilevare conquiste
let prevCurrentIndex = null;
let prevPhase = null;
let confettiFired = false;

const $ = (id)=>document.getElementById(id);
function toast(msg){
  const wrap = $("toastWrap");
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(()=>el.remove(), 4200);
}

document.getElementById("inviteBtn").onclick = () => {
  navigator.clipboard?.writeText(location.href);
  toast("Link copiato negli appunti!");
};

// ============================================================
// CARICAMENTO INIZIALE
// ============================================================
async function boot(){
  const { data: g, error } = await supabase.from("games").select("*").eq("id", gameId).single();
  if(error || !g){ toast("Partita non trovata"); return; }
  game = g;
  $("gameCodeBadge").textContent = "Codice: " + g.code;

  const { data: pls } = await supabase.from("players").select("*").eq("game_id", gameId).order("seat");
  players = pls || [];

  if(!me){
    // arrivato via link diretto senza passare dalla lobby: chiedi nome
    const name = prompt("Inserisci il tuo nome per unirti al tavolo Risiko:");
    if(!name){ toast("Nome richiesto"); return; }
    const usedColors = new Set(players.map(p=>p.color));
    const free = PLAYER_COLORS.find(c=>!usedColors.has(c.hex)) || PLAYER_COLORS[0];
    if(game.status !== "lobby"){
      toast("La partita è già iniziata."); return;
    }
    const { data: newPlayer } = await supabase.from("players").insert({
      game_id: gameId, name, color: free.hex, seat: players.length, is_host: players.length===0
    }).select().single();
    me = { playerId: newPlayer.id, name };
    savePlayerSession(gameId, newPlayer.id, name);
    players.push(newPlayer);
    await logHistory(gameId, newPlayer.id, name, "join_game", `${name} si è seduto al tavolo`);
  }

  await loadHistory();
  render();
  subscribe();
}

async function loadHistory(){
  const { data } = await supabase.from("history").select("*").eq("game_id", gameId).order("created_at",{ascending:true}).limit(200);
  (data||[]).forEach(h=>lastHistoryIds.add(h.id));
  renderHistory(data||[]);
}

function subscribe(){
  supabase.channel("risiko-"+gameId)
    .on("postgres_changes", { event:"UPDATE", schema:"public", table:"games", filter:`id=eq.${gameId}` }, (payload)=>{
      game = payload.new; render();
    })
    .on("postgres_changes", { event:"*", schema:"public", table:"players", filter:`game_id=eq.${gameId}` }, async ()=>{
      const { data } = await supabase.from("players").select("*").eq("game_id", gameId).order("seat");
      players = data || []; render();
    })
    .on("postgres_changes", { event:"INSERT", schema:"public", table:"history", filter:`game_id=eq.${gameId}` }, (payload)=>{
      if(lastHistoryIds.has(payload.new.id)) return;
      lastHistoryIds.add(payload.new.id);
      appendHistoryItem(payload.new);
    })
    .subscribe();
}

async function saveState(newState, extra={}){
  game.state = newState;
  const { error } = await supabase.from("games").update({ state:newState, ...extra }).eq("id", gameId);
  if(error){ console.error(error); toast("Errore di sincronizzazione: "+error.message); }
  render();
}

// ============================================================
// RENDER — dispatcher principale
// ============================================================
function render(){
  if(!game) return;
  if(game.status === "lobby"){
    $("lobbyScreen").style.display = "block";
    $("gameScreen").style.display = "none";
    renderLobby();
  } else {
    $("lobbyScreen").style.display = "none";
    $("gameScreen").style.display = "block";
    if(!document.querySelector("#mapSvg circle")) buildMapSvg();
    renderMap();
    renderPlayers();
    renderCards();
    renderMission();
    renderActionPanel();
    renderTurnBanner();
  }
}

// ============================================================
// LOBBY
// ============================================================
function renderLobby(){
  $("lobbyGameName").textContent = game.name;
  const wrap = $("lobbyPlayers");
  wrap.innerHTML = "";
  players.forEach(p=>{
    const chip = document.createElement("div");
    chip.className = "lobby-player-chip";
    chip.innerHTML = `<span style="width:12px;height:12px;border-radius:50%;background:${p.color};display:inline-block;"></span> ${escapeHtml(p.name)} ${p.is_host?'👑':''}`;
    wrap.appendChild(chip);
  });
  const iAmHost = players.find(p=>p.id===me.playerId)?.is_host;
  const controls = $("lobbyControls");
  if(iAmHost){
    controls.innerHTML = "";
    const btn = document.createElement("button");
    btn.className = "btn btn-red btn-block";
    btn.textContent = players.length < 2 ? "Servono almeno 2 giocatori" : `Avvia partita (${players.length} giocatori) →`;
    btn.disabled = players.length < 2;
    btn.onclick = startGame;
    controls.appendChild(btn);
  } else {
    controls.innerHTML = `<div class="text-sm" style="color:var(--ink-soft)">In attesa che l'host avvii la partita…</div>`;
  }
}

async function startGame(){
  const n = players.length;
  const armiesTable = {2:40,3:35,4:30,5:25,6:20};
  const startArmies = armiesTable[Math.min(n,6)] || 20;

  // distribuzione casuale territori
  const shuffled = [...TERRITORIES].sort(()=>Math.random()-0.5);
  const territories = {};
  shuffled.forEach((t,i)=>{
    const owner = players[i % n].id;
    territories[t.id] = { owner, armies: 1 };
  });
  const armiesLeft = {};
  players.forEach(p=>{
    const owned = Object.values(territories).filter(t=>t.owner===p.id).length;
    armiesLeft[p.id] = startArmies - owned;
  });

  const order = players.map(p=>p.id).sort(()=>Math.random()-0.5);
  const deck = buildDeck().sort(()=>Math.random()-0.5);
  const missions = assignMissions(players);

  const state = {
    phase: "setup_placement",
    order,
    currentPlayerIndex: 0,
    territories,
    armiesLeftSetup: armiesLeft,
    reinforcementsRemaining: armiesLeft[order[0]],
    deck,
    discard: [],
    hands: Object.fromEntries(players.map(p=>[p.id, []])),
    setsPlayed: 0,
    conqueredThisTurn: false,
    fortifyUsed: false,
    eliminated: [],
    eliminatedBy: {},
    missions,
    winner: null,
    winReason: null,
    pendingCardAward: false,
  };
  await supabase.from("games").update({ state, status:"playing" }).eq("id", gameId);
  await logHistory(gameId, me.playerId, me.name, "start_game", `La partita è iniziata! Ordine di turno definito e territori assegnati.`);
  game.status = "playing"; game.state = state;
  render();
}

// ============================================================
// GEOMETRIA — sagome dei continenti (convex hull "gonfiato" e arrotondato)
// ============================================================
function convexHull(points){
  const pts = [...points].sort((a,b)=> a.x-b.x || a.y-b.y);
  if(pts.length < 3) return pts;
  const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const lower=[];
  for(const p of pts){
    while(lower.length>=2 && cross(lower[lower.length-2],lower[lower.length-1],p)<=0) lower.pop();
    lower.push(p);
  }
  const upper=[];
  for(let i=pts.length-1;i>=0;i--){
    const p=pts[i];
    while(upper.length>=2 && cross(upper[upper.length-2],upper[upper.length-1],p)<=0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  const hull = lower.concat(upper);
  return hull.length >= 3 ? hull : pts;
}
function inflatePoints(hull, margin){
  const cx = hull.reduce((s,p)=>s+p.x,0)/hull.length;
  const cy = hull.reduce((s,p)=>s+p.y,0)/hull.length;
  return hull.map(p=>{
    const dx=p.x-cx, dy=p.y-cy;
    const len=Math.hypot(dx,dy)||1;
    return { x:p.x+dx/len*margin, y:p.y+dy/len*margin };
  });
}
function smoothBlobPath(points){
  if(points.length<3) return "";
  const mid=(a,b)=>({x:(a.x+b.x)/2, y:(a.y+b.y)/2});
  let d = "";
  const start = mid(points[points.length-1], points[0]);
  d += `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} `;
  for(let i=0;i<points.length;i++){
    const p = points[i];
    const next = points[(i+1)%points.length];
    const m = mid(p,next);
    d += `Q ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${m.x.toFixed(1)} ${m.y.toFixed(1)} `;
  }
  d += "Z";
  return d;
}
function continentBlobPath(contId){
  const pts = TERRITORIES.filter(t=>t.cont===contId).map(t=>({x:t.x,y:t.y}));
  if(pts.length < 3){
    const cx = pts.reduce((s,p)=>s+p.x,0)/pts.length, cy = pts.reduce((s,p)=>s+p.y,0)/pts.length;
    return `M ${cx-40} ${cy-30} Q ${cx} ${cy-60} ${cx+40} ${cy-30} Q ${cx+55} ${cy} ${cx+40} ${cy+30} Q ${cx} ${cy+60} ${cx-40} ${cy+30} Q ${cx-55} ${cy} ${cx-40} ${cy-30} Z`;
  }
  const hull = convexHull(pts);
  const inflated = inflatePoints(hull, 36);
  return smoothBlobPath(inflated);
}
function centroidOf(contId){
  const pts = TERRITORIES.filter(t=>t.cont===contId);
  return { x: pts.reduce((s,p)=>s+p.x,0)/pts.length, y: Math.min(...pts.map(p=>p.y)) - 30 };
}

// ============================================================
// MAPPA SVG
// ============================================================
function buildMapSvg(){
  const svg = $("mapSvg");
  svg.innerHTML = "";
  const NS = "http://www.w3.org/2000/svg";

  // ---------- defs: texture terreno + marker frecce ----------
  const defs = document.createElementNS(NS,"defs");
  defs.innerHTML = `
    <filter id="terrainNoise" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise"/>
      <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.05 0"/>
      <feComposite operator="over" in2="SourceGraphic"/>
    </filter>
    <marker id="arrowGold" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
      <path d="M0,0 L8,4 L0,8 Z" fill="var(--gold-bright)"/>
    </marker>
  `;
  svg.appendChild(defs);

  // ---------- sagome continenti ----------
  const blobLayer = document.createElementNS(NS,"g");
  blobLayer.setAttribute("id","continentBlobs");
  Object.entries(CONTINENTS).forEach(([id,c])=>{
    const path = document.createElementNS(NS,"path");
    path.setAttribute("d", continentBlobPath(id));
    path.setAttribute("class","continent-blob");
    path.setAttribute("data-cont", id);
    path.setAttribute("fill", c.color);
    path.setAttribute("fill-opacity","0.16");
    path.setAttribute("stroke", c.color);
    path.setAttribute("stroke-opacity","0.55");
    path.setAttribute("stroke-width","1.5");
    blobLayer.appendChild(path);

    const centroid = centroidOf(id);
    const label = document.createElementNS(NS,"text");
    label.setAttribute("class","continent-label");
    label.setAttribute("x", centroid.x);
    label.setAttribute("y", centroid.y);
    label.setAttribute("fill", c.color);
    label.setAttribute("font-size","13");
    label.textContent = c.name;
    blobLayer.appendChild(label);
  });
  svg.appendChild(blobLayer);

  // ---------- linee di adiacenza ----------
  const lineLayer = document.createElementNS(NS,"g");
  lineLayer.setAttribute("id","adjLines");
  const drawn = new Set();
  for(const [id, set] of Object.entries(ADJACENCY)){
    const a = TERRITORY_MAP[id];
    set.forEach(otherId=>{
      const key = [id,otherId].sort().join("|");
      if(drawn.has(key)) return; drawn.add(key);
      const b = TERRITORY_MAP[otherId];
      const l = document.createElementNS(NS,"line");
      l.setAttribute("x1",a.x); l.setAttribute("y1",a.y); l.setAttribute("x2",b.x); l.setAttribute("y2",b.y);
      l.setAttribute("class","adj-line");
      lineLayer.appendChild(l);
    });
  }
  svg.appendChild(lineLayer);

  // ---------- overlay mosse possibili (disegnato dinamicamente) ----------
  const moveLayer = document.createElementNS(NS,"g");
  moveLayer.setAttribute("id","moveOverlay");
  svg.appendChild(moveLayer);

  // ---------- nodi territorio ----------
  const nodeLayer = document.createElementNS(NS,"g");
  nodeLayer.setAttribute("id","nodeLayer");
  TERRITORIES.forEach(t=>{
    const g = document.createElementNS(NS,"g");
    g.setAttribute("class","territory-node");
    g.setAttribute("data-id", t.id);
    g.setAttribute("transform", `translate(${t.x},${t.y})`);

    const ring = document.createElementNS(NS,"circle");
    ring.setAttribute("r", 21);
    ring.setAttribute("class","ring");
    g.appendChild(ring);

    const circle = document.createElementNS(NS,"circle");
    circle.setAttribute("r", 16);
    circle.setAttribute("class","territory-circle");
    circle.setAttribute("fill", "#555");
    g.appendChild(circle);

    const label = document.createElementNS(NS,"text");
    label.setAttribute("class","territory-label");
    label.setAttribute("y", -22);
    label.textContent = t.name;
    g.appendChild(label);

    const badge = document.createElementNS(NS,"circle");
    badge.setAttribute("r", 9);
    badge.setAttribute("cy", 0);
    badge.setAttribute("class","armies-badge");
    g.appendChild(badge);

    const armiesText = document.createElementNS(NS,"text");
    armiesText.setAttribute("class","territory-armies");
    armiesText.setAttribute("y", 3.5);
    armiesText.textContent = "1";
    g.appendChild(armiesText);

    g.addEventListener("click", ()=>onTerritoryClick(t.id));
    nodeLayer.appendChild(g);
  });
  svg.appendChild(nodeLayer);

  // ---------- effetti transitori (scintille, floater) ----------
  const fxLayer = document.createElementNS(NS,"g");
  fxLayer.setAttribute("id","fxLayer");
  svg.appendChild(fxLayer);

  // legenda continenti (cliccabile per far lampeggiare la sagoma)
  const legend = $("continentLegend");
  legend.innerHTML = "";
  Object.entries(CONTINENTS).forEach(([id,c])=>{
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-swatch" style="background:${c.color}"></span> ${c.name} (+${c.bonus})`;
    item.onmouseenter = ()=>document.querySelector(`.continent-blob[data-cont="${id}"]`)?.classList.add("blob-highlight");
    item.onmouseleave = ()=>document.querySelector(`.continent-blob[data-cont="${id}"]`)?.classList.remove("blob-highlight");
    legend.appendChild(item);
  });
}

function ownerColor(playerId){
  const p = players.find(pl=>pl.id===playerId);
  return p ? p.color : "#555";
}

function renderMap(){
  const st = game.state;
  if(!st || !st.territories) return;
  const moveLayer = document.getElementById("moveOverlay");
  if(moveLayer) moveLayer.innerHTML = "";

  TERRITORIES.forEach(t=>{
    const node = document.querySelector(`.territory-node[data-id="${t.id}"]`);
    if(!node) return;
    const info = st.territories[t.id];
    const circle = node.querySelector(".territory-circle");
    const armiesText = node.querySelector(".territory-armies");
    const badge = node.querySelector(".armies-badge");
    circle.setAttribute("fill", info?.owner ? ownerColor(info.owner) : "#555");

    // rilevazione cambiamenti per animazioni
    const prevA = prevArmies[t.id];
    const prevO = prevOwners[t.id];
    if(info && prevA !== undefined && info.armies > prevA){
      spawnArmyFloater(t.x, t.y, `+${info.armies - prevA}`);
      badge.setAttribute("r", 11);
      setTimeout(()=>badge.setAttribute("r","9"), 220);
    }
    if(info && prevO !== undefined && prevO !== info.owner){
      node.classList.remove("conquest-flash"); void node.offsetWidth;
      node.classList.add("conquest-flash");
    }
    if(info){ prevArmies[t.id] = info.armies; prevOwners[t.id] = info.owner; }
    armiesText.textContent = info?.armies ?? "-";

    node.classList.remove("selected","selectable","mine","capital-turn");
    if(info?.owner === me.playerId) node.classList.add("mine");
    if(selection.from === t.id || selection.to === t.id) node.classList.add("selected");
    if(isSelectableNow(t.id)) node.classList.add("selectable");
  });

  // ---------- overlay: linee di mossa possibile ----------
  if(moveLayer && selection.from && (st.phase === "attack" || st.phase === "fortify") && isMyTurn()){
    const from = TERRITORY_MAP[selection.from];
    const NS = "http://www.w3.org/2000/svg";
    if(st.phase === "attack"){
      ADJACENCY[selection.from].forEach(otherId=>{
        const info = st.territories[otherId];
        if(info.owner === me.playerId) return;
        const to = TERRITORY_MAP[otherId];
        const line = document.createElementNS(NS,"line");
        line.setAttribute("x1", from.x); line.setAttribute("y1", from.y);
        line.setAttribute("x2", to.x); line.setAttribute("y2", to.y);
        line.setAttribute("class","move-line");
        line.setAttribute("marker-end","url(#arrowGold)");
        moveLayer.appendChild(line);
      });
    } else if(st.phase === "fortify" && !st.fortifyUsed){
      TERRITORIES.forEach(t=>{
        if(t.id === selection.from) return;
        if(st.territories[t.id].owner !== me.playerId) return;
        if(!connectedOwned(st, selection.from, t.id, me.playerId)) return;
        if(!areAdjacent(selection.from, t.id)) return; // mostra solo i collegamenti diretti per non affollare la mappa
        const to = TERRITORY_MAP[t.id];
        const line = document.createElementNS(NS,"line");
        line.setAttribute("x1", from.x); line.setAttribute("y1", from.y);
        line.setAttribute("x2", to.x); line.setAttribute("y2", to.y);
        line.setAttribute("class","move-line fortify-line");
        line.setAttribute("marker-end","url(#arrowGold)");
        moveLayer.appendChild(line);
      });
    }
  }

  updateMapHint();
}

function spawnArmyFloater(x,y,text){
  const fx = document.getElementById("fxLayer");
  if(!fx) return;
  const NS = "http://www.w3.org/2000/svg";
  const t = document.createElementNS(NS,"text");
  t.setAttribute("x", x); t.setAttribute("y", y-18);
  t.setAttribute("class","army-floater");
  t.textContent = text;
  fx.appendChild(t);
  setTimeout(()=>t.remove(), 1000);
}

function spawnClashSpark(x,y){
  const fx = document.getElementById("fxLayer");
  if(!fx) return;
  const NS = "http://www.w3.org/2000/svg";
  const g = document.createElementNS(NS,"g");
  g.setAttribute("class","clash-spark");
  g.setAttribute("transform", `translate(${x},${y})`);
  g.innerHTML = `
    <circle r="14" fill="none" stroke="#ffd873" stroke-width="3"/>
    <path d="M-16,0 L16,0 M0,-16 L0,16 M-11,-11 L11,11 M-11,11 L11,-11" stroke="#ffd873" stroke-width="2.5"/>
  `;
  fx.appendChild(g);
  setTimeout(()=>g.remove(), 600);
}

function updateMapHint(){
  const hint = $("mapHint");
  if(!hint) return;
  const st = game.state;
  if(!isMyTurn()){ hint.textContent = "In attesa del tuo turno…"; return; }
  if(st.phase === "setup_placement" || st.phase === "reinforce"){ hint.textContent = "Clicca un tuo territorio per piazzare armate"; return; }
  if(st.phase === "attack"){
    hint.textContent = selection.from
      ? "Le linee dorate mostrano i territori nemici attaccabili — clicca un bersaglio"
      : "Clicca un tuo territorio con 2+ armate per scegliere da dove attaccare";
    return;
  }
  if(st.phase === "fortify"){
    hint.textContent = selection.from
      ? "Territori raggiungibili evidenziati — clicca la destinazione"
      : "Clicca un tuo territorio per spostare armate verso un altro territorio collegato";
    return;
  }
  hint.textContent = "";
}

function isSelectableNow(tid){
  const st = game.state;
  if(!st || !isMyTurn()) return false;
  const info = st.territories[tid];
  if(st.phase === "setup_placement" || st.phase === "reinforce"){
    return info.owner === me.playerId;
  }
  if(st.phase === "attack"){
    if(!selection.from) return info.owner === me.playerId && info.armies > 1;
    if(selection.from === tid) return true;
    const fromInfo = st.territories[selection.from];
    return areAdjacent(selection.from, tid) && info.owner !== me.playerId;
  }
  if(st.phase === "fortify"){
    if(st.fortifyUsed) return false;
    if(!selection.from) return info.owner === me.playerId && info.armies > 1;
    if(selection.from === tid) return true;
    return info.owner === me.playerId && connectedOwned(st, selection.from, tid, me.playerId);
  }
  return false;
}

function connectedOwned(st, from, to, playerId){
  const seen = new Set([from]);
  const queue = [from];
  while(queue.length){
    const cur = queue.shift();
    if(cur === to) return true;
    ADJACENCY[cur].forEach(n=>{
      if(seen.has(n)) return;
      if(st.territories[n]?.owner !== playerId) return;
      seen.add(n); queue.push(n);
    });
  }
  return seen.has(to);
}

// ============================================================
// INTERAZIONE MAPPA
// ============================================================
function onTerritoryClick(tid){
  const st = game.state;
  if(!isMyTurn()) return;
  if(!isSelectableNow(tid) && selection.from !== tid) return;

  if(st.phase === "setup_placement" || st.phase === "reinforce"){
    if(st.territories[tid].owner !== me.playerId) return;
    openPlaceArmiesModal(tid);
    return;
  }
  if(st.phase === "attack"){
    if(!selection.from){ selection.from = tid; render(); return; }
    if(selection.from === tid){ selection = {mode:null, from:null, to:null}; render(); return; }
    selection.to = tid;
    openAttackModal();
    return;
  }
  if(st.phase === "fortify"){
    if(st.fortifyUsed) return;
    if(!selection.from){ selection.from = tid; render(); return; }
    if(selection.from === tid){ selection = {mode:null, from:null, to:null}; render(); return; }
    selection.to = tid;
    openFortifyModal();
    return;
  }
}

function isMyTurn(){
  const st = game.state;
  if(!st || !st.order) return false;
  return st.order[st.currentPlayerIndex] === me.playerId;
}

// ============================================================
// MODALE: piazzamento armate (setup + rinforzo)
// ============================================================
function openPlaceArmiesModal(tid){
  const st = game.state;
  const remaining = st.phase === "setup_placement" ? st.armiesLeftSetup[me.playerId] : st.reinforcementsRemaining;
  if(remaining <= 0){ toast("Non hai più armate da piazzare."); return; }
  let val = 1;
  const t = TERRITORY_MAP[tid];
  $("numberModalTitle").textContent = `Rinforza ${t.name}`;
  $("numberModalBody").innerHTML = `
    <p class="text-sm" style="color:var(--ink-soft)">Armate disponibili: <b>${remaining}</b></p>
    <div class="stepper">
      <button id="stepMinus">−</button>
      <div class="val" id="stepVal">1</div>
      <button id="stepPlus">+</button>
    </div>
    <button class="btn btn-gold btn-block" id="confirmPlace">Piazza armate</button>
  `;
  $("numberModal").style.display = "flex";
  const upd = ()=>{ $("stepVal").textContent = val; };
  $("stepMinus").onclick = ()=>{ if(val>1) val--; upd(); };
  $("stepPlus").onclick = ()=>{ if(val<remaining) val++; upd(); };
  $("confirmPlace").onclick = async ()=>{
    $("numberModal").style.display = "none";
    await placeArmies(tid, val);
  };
}

async function placeArmies(tid, amount){
  const st = structuredClone(game.state);
  st.territories[tid].armies += amount;
  const t = TERRITORY_MAP[tid];

  if(st.phase === "setup_placement"){
    st.armiesLeftSetup[me.playerId] -= amount;
    await logHistory(gameId, me.playerId, me.name, "setup_place", `${me.name} posiziona ${amount} armate a ${t.name}`);
    if(st.armiesLeftSetup[me.playerId] <= 0){
      // passa al prossimo giocatore per il posizionamento iniziale
      const nextIdx = nextActiveIndex(st, st.currentPlayerIndex);
      const allDone = st.order.every(pid=>st.armiesLeftSetup[pid] <= 0);
      if(allDone){
        st.phase = "reinforce";
        st.currentPlayerIndex = 0;
        st.reinforcementsRemaining = calcReinforcements(st, st.order[0]);
        await logHistory(gameId, null, "Sistema", "setup_done", `Posizionamento iniziale completato. Inizia il turno di ${playerName(st.order[0])}.`);
      } else {
        st.currentPlayerIndex = nextIdx;
        st.reinforcementsRemaining = st.armiesLeftSetup[st.order[nextIdx]];
      }
    }
  } else {
    st.reinforcementsRemaining -= amount;
    await logHistory(gameId, me.playerId, me.name, "reinforce", `${me.name} rinforza ${t.name} con ${amount} armate`);
    if(st.reinforcementsRemaining <= 0) st.phase = "attack";
  }
  await saveState(st);
}

function nextActiveIndex(st, from){
  const n = st.order.length;
  let idx = from;
  for(let i=0;i<n;i++){
    idx = (idx+1)%n;
    if(!st.eliminated.includes(st.order[idx])) return idx;
  }
  return from;
}

function calcReinforcements(st, playerId){
  const owned = Object.entries(st.territories).filter(([,v])=>v.owner===playerId).map(([k])=>k);
  let base = Math.max(3, Math.floor(owned.length/3));
  Object.entries(CONTINENTS).forEach(([cid,c])=>{
    const inCont = TERRITORIES.filter(t=>t.cont===cid).map(t=>t.id);
    if(inCont.every(tid=>st.territories[tid].owner===playerId)) base += c.bonus;
  });
  return base;
}

// ============================================================
// FASE ATTACCO
// ============================================================
function openAttackModal(){
  const from = TERRITORY_MAP[selection.from];
  const to = TERRITORY_MAP[selection.to];
  const fromInfoInit = game.state.territories[from.id];
  const maxDiceInit = Math.min(3, fromInfoInit.armies - 1);
  if(maxDiceInit < 1){ toast("Servono almeno 2 armate per attaccare."); selection={mode:null,from:null,to:null}; render(); return; }

  let diceCount = maxDiceInit;
  const body = $("attackModalBody");
  const draw = ()=>{
    const st = game.state; // sempre lo stato più recente
    const fromInfo = st.territories[from.id];
    const toInfo = st.territories[to.id];
    const maxDice = Math.min(3, fromInfo.armies - 1);
    if(diceCount > maxDice) diceCount = Math.max(1, maxDice);
    body.innerHTML = `
      <p><b>${from.name}</b> (${fromInfo.armies} armate) attacca <b>${to.name}</b> (${toInfo.armies} armate, ${playerName(toInfo.owner)})</p>
      <div class="stepper">
        <button id="diceMinus">−</button>
        <div class="val" id="diceVal">${diceCount}</div>
        <button id="dicePlus">+</button>
      </div>
      <div class="text-xs muted" style="text-align:center; color:var(--ink-soft)">Numero di dadi da attaccante (max ${maxDice})</div>
      <div id="diceResultRow" class="dice-row"></div>
      <div id="battleResultText" class="text-sm" style="text-align:center; min-height:20px;"></div>
      <div class="flex gap-8" style="justify-content:center; margin-top:10px;">
        <button class="btn btn-red" id="rollBtn">🎲 Tira i dadi</button>
        <button class="btn btn-ghost" id="stopAttackBtn">Interrompi</button>
      </div>
    `;
    $("diceMinus").onclick = ()=>{ if(diceCount>1){ diceCount--; draw(); } };
    $("dicePlus").onclick = ()=>{ if(diceCount<Math.min(3, game.state.territories[from.id].armies-1)){ diceCount++; draw(); } };
    $("stopAttackBtn").onclick = ()=>{ $("attackModal").style.display="none"; selection={mode:null,from:null,to:null}; render(); };
    $("rollBtn").onclick = ()=>doAttackRound(from.id, to.id, diceCount, draw);
  };
  draw();
  $("attackModal").style.display = "flex";
}

async function doAttackRound(fromId, toId, diceCount, redraw){
  const st = structuredClone(game.state);
  const attackerArmies = st.territories[fromId].armies;
  const defenderArmies = st.territories[toId].armies;
  const atkDice = Math.min(diceCount, attackerArmies - 1, 3);
  const defDice = Math.min(2, defenderArmies);

  const atkRolls = rollDice(atkDice);
  const defRolls = rollDice(defDice);

  // animazione dadi
  const row = $("diceResultRow");
  row.innerHTML = "";
  atkRolls.forEach(()=>{ const d=document.createElement("div"); d.className="die attacker rolling"; d.textContent="?"; row.appendChild(d); });
  defRolls.forEach(()=>{ const d=document.createElement("div"); d.className="die defender rolling"; d.textContent="?"; row.appendChild(d); });
  await sleep(650);

  let attackerLosses = 0, defenderLosses = 0;
  const pairs = Math.min(atkRolls.length, defRolls.length);
  for(let i=0;i<pairs;i++){
    if(atkRolls[i] > defRolls[i]) defenderLosses++; else attackerLosses++;
  }
  const dice = row.querySelectorAll(".die");
  atkRolls.forEach((v,i)=>{ dice[i].textContent=v; dice[i].classList.remove("rolling"); dice[i].classList.add("settled"); });
  defRolls.forEach((v,i)=>{ dice[atkRolls.length+i].textContent=v; dice[atkRolls.length+i].classList.remove("rolling"); dice[atkRolls.length+i].classList.add("settled"); });
  for(let i=0;i<pairs;i++){
    if(atkRolls[i] > defRolls[i]) dice[i].classList.add("win"); else dice[atkRolls.length+i].classList.add("win");
  }

  st.territories[fromId].armies -= attackerLosses;
  st.territories[toId].armies -= defenderLosses;

  $("battleResultText").textContent = `Attaccante perde ${attackerLosses} armate · Difensore perde ${defenderLosses} armate`;

  const t1 = TERRITORY_MAP[fromId], t2 = TERRITORY_MAP[toId];
  await logHistory(gameId, me.playerId, me.name, "attack",
    `${me.name} attacca ${t2.name} da ${t1.name}: 🎲${atkRolls.join(",")} vs 🎲${defRolls.join(",")} → attaccante -${attackerLosses}, difensore -${defenderLosses}`);

  if(st.territories[toId].armies <= 0){
    // conquista!
    const defenderId = st.territories[toId].owner;
    st.territories[toId].owner = me.playerId;
    st.conqueredThisTurn = true;
    await logHistory(gameId, me.playerId, me.name, "conquer", `⚔ ${me.name} conquista ${t2.name}!`);

    // controlla eliminazione del difensore
    const stillOwns = Object.values(st.territories).some(t=>t.owner===defenderId);
    if(!stillOwns && defenderId){
      st.eliminated.push(defenderId);
      st.eliminatedBy = st.eliminatedBy || {};
      st.eliminatedBy[defenderId] = me.playerId;
      // trasferisci le carte del giocatore eliminato a chi lo elimina
      st.hands[me.playerId] = [...(st.hands[me.playerId]||[]), ...(st.hands[defenderId]||[])];
      st.hands[defenderId] = [];
      await logHistory(gameId, null, "Sistema", "eliminate", `💀 ${playerName(defenderId)} è stato eliminato da ${me.name}!`);
    }

    await saveState(st);
    const winnerCheck = checkVictory(st) || checkMissionVictory(st, me.playerId);
    if(winnerCheck) return;

    $("attackModal").style.display = "none";
    openConquestModal(fromId, toId, atkDice);
    return;
  }

  await saveState(st);
  const maxDiceNow = Math.min(3, st.territories[fromId].armies - 1);
  if(maxDiceNow < 1){
    $("battleResultText").textContent += " · Non hai più armate a sufficienza per continuare l'attacco.";
    setTimeout(()=>{ $("attackModal").style.display="none"; selection={mode:null,from:null,to:null}; render(); }, 1400);
  } else {
    setTimeout(()=>redraw(), 1200);
  }
}

function openConquestModal(fromId, toId, minMove){
  const st = game.state;
  const t1 = TERRITORY_MAP[fromId], t2 = TERRITORY_MAP[toId];
  const maxMove = st.territories[fromId].armies - 1;
  let val = Math.min(Math.max(minMove,1), maxMove);
  $("numberModalTitle").textContent = `Sposta armate a ${t2.name}`;
  $("numberModalBody").innerHTML = `
    <p class="text-sm" style="color:var(--ink-soft)">Territorio conquistato! Quante armate vuoi spostare da ${t1.name}? (min ${minMove}, max ${maxMove})</p>
    <div class="stepper">
      <button id="stepMinus">−</button>
      <div class="val" id="stepVal">${val}</div>
      <button id="stepPlus">+</button>
    </div>
    <button class="btn btn-gold btn-block" id="confirmMove">Conferma</button>
  `;
  $("numberModal").style.display = "flex";
  const upd = ()=>{ $("stepVal").textContent = val; };
  $("stepMinus").onclick = ()=>{ if(val>minMove) val--; upd(); };
  $("stepPlus").onclick = ()=>{ if(val<maxMove) val++; upd(); };
  $("confirmMove").onclick = async ()=>{
    $("numberModal").style.display = "none";
    const st2 = structuredClone(game.state);
    st2.territories[fromId].armies -= val;
    st2.territories[toId].armies += val;
    await saveState(st2);
    selection = {mode:null, from:null, to:null};
    render();
  };
}

// ============================================================
// FASE FORTIFICAZIONE
// ============================================================
function openFortifyModal(){
  const st = game.state;
  const from = TERRITORY_MAP[selection.from], to = TERRITORY_MAP[selection.to];
  const fromInfo = st.territories[from.id];
  const max = fromInfo.armies - 1;
  if(max < 1){ toast("Nessuna armata disponibile da spostare."); selection={mode:null,from:null,to:null}; render(); return; }
  let val = 1;
  $("numberModalTitle").textContent = `Sposta armate`;
  $("numberModalBody").innerHTML = `
    <p class="text-sm" style="color:var(--ink-soft)">Da <b>${from.name}</b> a <b>${to.name}</b> (max ${max})</p>
    <div class="stepper">
      <button id="stepMinus">−</button>
      <div class="val" id="stepVal">1</div>
      <button id="stepPlus">+</button>
    </div>
    <button class="btn btn-gold btn-block" id="confirmFortify">Fortifica</button>
  `;
  $("numberModal").style.display = "flex";
  const upd = ()=>{ $("stepVal").textContent = val; };
  $("stepMinus").onclick = ()=>{ if(val>1) val--; upd(); };
  $("stepPlus").onclick = ()=>{ if(val<max) val++; upd(); };
  $("confirmFortify").onclick = async ()=>{
    $("numberModal").style.display = "none";
    const st2 = structuredClone(game.state);
    st2.territories[from.id].armies -= val;
    st2.territories[to.id].armies += val;
    st2.fortifyUsed = true;
    await logHistory(gameId, me.playerId, me.name, "fortify", `${me.name} sposta ${val} armate da ${from.name} a ${to.name}`);
    await saveState(st2);
    selection = {mode:null, from:null, to:null};
    render();
  };
}

// ============================================================
// CARTE TERRITORIO
// ============================================================
function renderCards(){
  const st = game.state;
  const hand = st.hands?.[me.playerId] || [];
  const list = $("cardsList");
  list.innerHTML = "";
  if(!hand.length){ list.innerHTML = `<div class="text-xs" style="color:var(--ink-soft)">Nessuna carta in mano.</div>`; }
  hand.forEach((card, idx)=>{
    const chip = document.createElement("div");
    chip.className = "card-chip";
    chip.dataset.idx = idx;
    chip.innerHTML = `${SYMBOL_ICON[card.symbol]} ${card.territory ? TERRITORY_MAP[card.territory].name : "Jolly"}`;
    chip.onclick = ()=>{ chip.classList.toggle("selected"); updateTradeButton(); };
    list.appendChild(chip);
  });
  updateTradeButton();
}

function updateTradeButton(){
  const selected = [...document.querySelectorAll(".card-chip.selected")];
  const btn = $("tradeCardsBtn");
  btn.style.display = isMyTurn() && (game.state.phase==="reinforce") ? "inline-block" : "none";
  btn.disabled = selected.length !== 3;
  btn.onclick = tradeCards;
}

async function tradeCards(){
  const selected = [...document.querySelectorAll(".card-chip.selected")].map(el=>parseInt(el.dataset.idx));
  const st = structuredClone(game.state);
  const hand = st.hands[me.playerId];
  const cards = selected.map(i=>hand[i]);
  if(!isValidCardSet(cards)){ toast("Combinazione di carte non valida."); return; }

  st.setsPlayed = (st.setsPlayed||0) + 1;
  const bonus = cardSetBonus(st.setsPlayed);
  // bonus territoriale: +2 armate extra se possiedi un territorio raffigurato in una delle carte giocate
  let territoryBonus = 0;
  cards.forEach(c=>{
    if(c.territory && st.territories[c.territory]?.owner === me.playerId){
      st.territories[c.territory].armies += 2;
      territoryBonus = 2;
    }
  });

  st.hands[me.playerId] = hand.filter((_,i)=>!selected.includes(i));
  st.discard = [...(st.discard||[]), ...cards];
  st.reinforcementsRemaining = (st.reinforcementsRemaining||0) + bonus;

  await logHistory(gameId, me.playerId, me.name, "trade_cards",
    `${me.name} gioca un tris di carte e ottiene ${bonus} armate${territoryBonus? " (+2 bonus territoriale)":""}`);
  await saveState(st);
}

// ============================================================
// OBIETTIVO SEGRETO
// ============================================================
function renderMission(){
  const st = game.state;
  const box = $("missionContent");
  const mission = st.missions?.[me.playerId];
  if(!mission){ box.innerHTML = `<p class="text-xs" style="color:var(--ink-soft)">Nessun obiettivo assegnato.</p>`; return; }

  let progressHtml = "";
  if(mission.type === "territories"){
    const owned = ownedCount(st, me.playerId);
    const pct = Math.min(100, Math.round(owned/mission.count*100));
    progressHtml = `
      <div class="mission-progress-bar"><div class="mission-progress-fill" style="width:${pct}%"></div></div>
      <div class="text-xs" style="color:var(--ink-soft); margin-top:4px;">${owned} / ${mission.count} territori</div>`;
  } else if(mission.type === "continents" || mission.type === "continents_plus_one"){
    const chips = mission.continents.map(c=>{
      const done = continentFullyOwned(st, c, me.playerId);
      return `<span class="mission-chip ${done?'done':''}">${done?'✓':'—'} ${CONTINENTS[c].name}</span>`;
    }).join("");
    let extra = "";
    if(mission.type === "continents_plus_one"){
      const extraCont = Object.keys(CONTINENTS).find(c=>!mission.continents.includes(c) && continentFullyOwned(st, c, me.playerId));
      extra = `<span class="mission-chip ${extraCont?'done':''}">${extraCont ? '✓ '+CONTINENTS[extraCont].name : '— un terzo a scelta'}</span>`;
    }
    progressHtml = `<div class="mission-chips">${chips}${extra}</div>`;
  } else if(mission.type === "destroy"){
    const targetAlive = !(st.eliminated||[]).includes(mission.targetId);
    const byMe = st.eliminatedBy?.[mission.targetId] === me.playerId;
    const status = byMe ? "✓ Eliminato da te!" : targetAlive ? "In gioco" : "Eliminato da un altro giocatore — ripiega su 24 territori";
    progressHtml = `<div class="mission-chip ${byMe?'done':''}">${escapeHtml(playerName(mission.targetId))}: ${status}</div>`;
  }

  box.innerHTML = `
    <div class="mission-icon">${MISSION_ICON[mission.type]}</div>
    <p class="text-sm" style="margin:6px 0 10px;">${escapeHtml(mission.text)}</p>
    ${progressHtml}
    <p class="text-xs" style="color:var(--ink-soft); margin-top:10px;">🤫 Il tuo obiettivo è segreto: solo tu lo vedi nel tuo pannello.</p>
  `;

  if(st.phase === "gameover"){
    const reveal = players.map(p=>{
      const m = st.missions?.[p.id];
      if(!m) return "";
      return `<div class="text-xs" style="margin-top:6px;"><b>${escapeHtml(p.name)}:</b> ${escapeHtml(m.text)}</div>`;
    }).join("");
    box.innerHTML += `<div style="margin-top:14px; border-top:1px dashed rgba(0,0,0,.15); padding-top:10px;">
      <b class="text-xs">Obiettivi rivelati a fine partita</b>${reveal}
    </div>`;
  }
}

// ============================================================
// PANNELLO AZIONI
// ============================================================
function renderActionPanel(){
  const st = game.state;
  const content = $("actionContent");
  if(!isMyTurn()){
    content.innerHTML = `<p class="text-sm" style="color:var(--ink-soft)">In attesa che <b>${playerName(st.order[st.currentPlayerIndex])}</b> completi il suo turno…</p>`;
    return;
  }
  if(st.phase === "setup_placement"){
    content.innerHTML = `<p class="text-sm">Posiziona le tue armate iniziali cliccando sui territori che possiedi.</p>
      <p class="text-sm"><b>Armate rimanenti: ${st.armiesLeftSetup[me.playerId]}</b></p>`;
    return;
  }
  if(st.phase === "reinforce"){
    const forcedTrade = (st.hands[me.playerId]||[]).length >= 5;
    content.innerHTML = `
      <p class="text-sm"><b>Fase di rinforzo</b><br>Armate da piazzare: <b>${st.reinforcementsRemaining}</b></p>
      ${forcedTrade ? `<p class="text-xs" style="color:var(--danger)">Hai 5+ carte: devi giocare un tris prima di continuare.</p>` : ""}
      <p class="text-xs" style="color:var(--ink-soft)">Clicca sui tuoi territori per aggiungere armate.</p>
    `;
    return;
  }
  if(st.phase === "attack"){
    content.innerHTML = `
      <p class="text-sm"><b>Fase di attacco</b></p>
      <p class="text-xs" style="color:var(--ink-soft)">Clicca un tuo territorio, poi un territorio nemico adiacente.</p>
      <button class="btn btn-gold btn-block" id="toFortifyBtn">Vai alla fortificazione →</button>
    `;
    $("toFortifyBtn").onclick = async ()=>{
      const st2 = structuredClone(game.state);
      st2.phase = "fortify";
      await saveState(st2);
      selection = {mode:null, from:null, to:null};
    };
    return;
  }
  if(st.phase === "fortify"){
    content.innerHTML = `
      <p class="text-sm"><b>Fase di fortificazione</b></p>
      <p class="text-xs" style="color:var(--ink-soft)">${st.fortifyUsed ? "Hai già spostato armate questo turno." : "Puoi spostare armate una sola volta tra territori collegati."}</p>
      <button class="btn btn-red btn-block" id="endTurnBtn">Termina turno →</button>
    `;
    $("endTurnBtn").onclick = endTurn;
    return;
  }
  if(st.phase === "gameover"){
    content.innerHTML = st.winReason === "mission"
      ? `<p><b>🏆 ${playerName(st.winner)} ha completato il proprio obiettivo segreto e vince la partita!</b></p>`
      : `<p><b>🏆 ${playerName(st.winner)} ha conquistato il mondo intero!</b></p>`;
  }
}

async function endTurn(){
  const st = structuredClone(game.state);
  if(st.conqueredThisTurn){
    const deckLeft = st.deck.length ? st.deck : st.discard;
    if(st.deck.length === 0 && st.discard.length){ st.deck = [...st.discard]; st.discard = []; }
    if(st.deck.length){
      const card = st.deck.pop();
      st.hands[me.playerId] = [...(st.hands[me.playerId]||[]), card];
      await logHistory(gameId, me.playerId, me.name, "draw_card", `${me.name} pesca una carta territorio`);
    }
  }
  st.conqueredThisTurn = false;
  st.fortifyUsed = false;
  st.currentPlayerIndex = nextActiveIndex(st, st.currentPlayerIndex);
  st.phase = "reinforce";
  st.reinforcementsRemaining = calcReinforcements(st, st.order[st.currentPlayerIndex]);
  await logHistory(gameId, null, "Sistema", "end_turn", `Turno di ${playerName(st.order[st.currentPlayerIndex])}`);
  selection = {mode:null, from:null, to:null};
  await saveState(st);
}

function checkVictory(st){
  const owners = new Set(Object.values(st.territories).map(t=>t.owner));
  if(owners.size === 1){
    const winner = [...owners][0];
    st.phase = "gameover";
    st.winner = winner;
    st.winReason = "world";
    supabase.from("games").update({ state: st, status:"finished", winner_id: winner }).eq("id", gameId);
    logHistory(gameId, null, "Sistema", "victory", `🏆 ${playerName(winner)} ha conquistato il mondo intero!`);
    game.state = st; game.status = "finished";
    render();
    return true;
  }
  return false;
}

function ownedCount(st, playerId){
  return Object.values(st.territories).filter(t=>t.owner===playerId).length;
}
function continentFullyOwned(st, contId, playerId){
  return TERRITORIES.filter(t=>t.cont===contId).every(t=>st.territories[t.id].owner===playerId);
}

function isMissionComplete(st, playerId){
  const mission = st.missions?.[playerId];
  if(!mission) return false;
  if(mission.type === "territories"){
    return ownedCount(st, playerId) >= mission.count;
  }
  if(mission.type === "continents"){
    return mission.continents.every(c=>continentFullyOwned(st, c, playerId));
  }
  if(mission.type === "continents_plus_one"){
    if(!mission.continents.every(c=>continentFullyOwned(st, c, playerId))) return false;
    return Object.keys(CONTINENTS).some(c=>!mission.continents.includes(c) && continentFullyOwned(st, c, playerId));
  }
  if(mission.type === "destroy"){
    if(st.eliminatedBy?.[mission.targetId] === playerId) return true;
    if((st.eliminated||[]).includes(mission.targetId) && st.eliminatedBy?.[mission.targetId] !== playerId){
      return ownedCount(st, playerId) >= 24; // il bersaglio è stato eliminato da un altro: ripiego su 24 territori
    }
    return false;
  }
  return false;
}

function checkMissionVictory(st, playerId){
  if(st.phase === "gameover") return true;
  if(!isMissionComplete(st, playerId)) return false;
  st.phase = "gameover";
  st.winner = playerId;
  st.winReason = "mission";
  supabase.from("games").update({ state: st, status:"finished", winner_id: playerId }).eq("id", gameId);
  logHistory(gameId, null, "Sistema", "victory", `🏆 ${playerName(playerId)} ha completato il proprio obiettivo segreto e vince la partita!`);
  game.state = st; game.status = "finished";
  render();
  return true;
}

// ============================================================
// PANNELLI: giocatori, turno, storico
// ============================================================
function playerName(id){ const p = players.find(pl=>pl.id===id); return p ? p.name : "—"; }

function renderPlayers(){
  const st = game.state;
  const list = $("playersList");
  list.innerHTML = "";
  players.forEach(p=>{
    const owned = Object.values(st.territories||{}).filter(t=>t.owner===p.id).length;
    const armies = Object.values(st.territories||{}).filter(t=>t.owner===p.id).reduce((s,t)=>s+t.armies,0);
    const isEliminated = (st.eliminated||[]).includes(p.id);
    const isCurrent = st.order && st.order[st.currentPlayerIndex] === p.id;
    const row = document.createElement("div");
    row.className = "player-row" + (isCurrent?" current-turn":"") + (isEliminated?" eliminated":"");
    row.innerHTML = `
      <div class="player-dot" style="background:${p.color}"></div>
      <div style="flex:1">
        <div class="pname">${escapeHtml(p.name)} ${p.id===me.playerId?"(tu)":""}</div>
        <div class="pstats">${owned} territori · ${armies} armate · ${(st.hands?.[p.id]||[]).length} carte</div>
      </div>
      ${isCurrent ? '<span title="turno corrente">🎯</span>' : ''}
    `;
    list.appendChild(row);
  });
}

function renderTurnBanner(){
  const st = game.state;
  const phaseNames = { setup_placement:"Posizionamento iniziale", reinforce:"Rinforzo", attack:"Attacco", fortify:"Fortificazione", gameover:"Fine partita" };
  const banner = $("turnBanner");
  banner.textContent = st.phase === "gameover"
    ? `🏆 Vince ${playerName(st.winner)}`
    : `Turno di ${playerName(st.order[st.currentPlayerIndex])}${isMyTurn()?" (tu)":""}`;
  $("phaseBadge").textContent = phaseNames[st.phase] || st.phase;

  if(prevCurrentIndex !== null && prevCurrentIndex !== st.currentPlayerIndex){
    banner.classList.remove("turn-changed"); void banner.offsetWidth;
    banner.classList.add("turn-changed");
  }
  prevCurrentIndex = st.currentPlayerIndex;

  if(st.phase === "gameover" && !confettiFired){
    confettiFired = true;
    fireConfetti();
  }
}

function fireConfetti(){
  const panel = document.querySelector(".map-panel");
  if(!panel) return;
  const colors = players.map(p=>p.color);
  for(let i=0;i<70;i++){
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = Math.random()*100 + "%";
    piece.style.background = colors[Math.floor(Math.random()*colors.length)] || "#c9a24b";
    piece.style.animationDuration = (1.2 + Math.random()*1.4) + "s";
    piece.style.animationDelay = (Math.random()*0.6) + "s";
    panel.appendChild(piece);
    setTimeout(()=>piece.remove(), 3000);
  }
}

function renderHistory(items){
  const list = $("historyList");
  list.innerHTML = "";
  items.slice(-100).forEach(appendHistoryItem);
}
function appendHistoryItem(h){
  const list = $("historyList");
  const el = document.createElement("div");
  el.className = "history-item";
  el.innerHTML = `<span class="htime">${fmtTime(h.created_at)}</span>${escapeHtml(h.message)}`;
  list.appendChild(el);
  list.scrollTop = list.scrollHeight;
}

// ============================================================
// UTILITY
// ============================================================
function rollDice(n){
  const r = [];
  for(let i=0;i<n;i++) r.push(1+Math.floor(Math.random()*6));
  return r.sort((a,b)=>b-a);
}
function sleep(ms){ return new Promise(res=>setTimeout(res,ms)); }
function escapeHtml(s){ return (s||"").toString().replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

boot();
