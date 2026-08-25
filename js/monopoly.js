import { supabase, isConfigured, PLAYER_COLORS, savePlayerSession, getPlayerSession, logHistory, fmtTime } from "./supabaseClient.js";
import { BOARD, GROUPS, GROUP_COLORS, HOUSE_COST, STATIONS, UTILITIES, STATION_RENT, CHANCE_CARDS, CHEST_CARDS } from "./monopoly-data.js";

const params = new URLSearchParams(location.search);
const gameId = params.get("game");
if(!gameId){ document.body.innerHTML = "<p style='padding:40px;color:#fff'>Nessuna partita specificata.</p>"; throw new Error("no game id"); }

let game = null;
let players = [];
let me = getPlayerSession(gameId);
let lastHistoryIds = new Set();
let boardBuilt = false;

const $ = (id)=>document.getElementById(id);
function toast(msg){
  const wrap = $("toastWrap");
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(()=>el.remove(), 4200);
}
document.getElementById("inviteBtn").onclick = () => { navigator.clipboard?.writeText(location.href); toast("Link copiato!"); };

async function boot(){
  const { data: g, error } = await supabase.from("games").select("*").eq("id", gameId).single();
  if(error || !g){ toast("Partita non trovata"); return; }
  game = g;
  $("gameCodeBadge").textContent = "Codice: " + g.code;

  const { data: pls } = await supabase.from("players").select("*").eq("game_id", gameId).order("seat");
  players = pls || [];

  if(!me){
    const name = prompt("Inserisci il tuo nome per unirti al tavolo Monopoly:");
    if(!name){ toast("Nome richiesto"); return; }
    if(game.status !== "lobby"){ toast("La partita è già iniziata."); return; }
    const usedColors = new Set(players.map(p=>p.color));
    const free = PLAYER_COLORS.find(c=>!usedColors.has(c.hex)) || PLAYER_COLORS[0];
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
  supabase.channel("monopoly-"+gameId)
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
function render(){
  if(!game) return;
  if(game.status === "lobby"){
    $("lobbyScreen").style.display = "block"; $("gameScreen").style.display = "none";
    renderLobby();
  } else {
    $("lobbyScreen").style.display = "none"; $("gameScreen").style.display = "block";
    if(!boardBuilt){ buildBoardGrid(); boardBuilt = true; }
    renderBoardState();
    renderPlayers();
    renderProperties();
    renderActionPanel();
    renderTurnBanner();
  }
}

// ============================================================ LOBBY
function renderLobby(){
  $("lobbyGameName").textContent = game.name;
  const wrap = $("lobbyPlayers"); wrap.innerHTML = "";
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
    btn.className = "btn btn-blue btn-block";
    btn.textContent = players.length < 2 ? "Servono almeno 2 giocatori" : `Avvia partita (${players.length} giocatori) →`;
    btn.disabled = players.length < 2;
    btn.onclick = startGame;
    controls.appendChild(btn);
  } else {
    controls.innerHTML = `<div class="text-sm" style="color:var(--ink-soft)">In attesa che l'host avvii la partita…</div>`;
  }
}

async function startGame(){
  const properties = {};
  BOARD.forEach(s=>{
    if(s.type==="property" || s.type==="station" || s.type==="utility"){
      properties[s.i] = { owner:null, houses:0, hotel:false, mortgaged:false };
    }
  });
  const order = players.map(p=>p.id).sort(()=>Math.random()-0.5);
  const state = {
    phase: "playing",
    order,
    currentPlayerIndex: 0,
    positions: Object.fromEntries(order.map(id=>[id,0])),
    money: Object.fromEntries(order.map(id=>[id,1500])),
    properties,
    jail: Object.fromEntries(order.map(id=>[id,{inJail:false, turns:0}])),
    jailCards: Object.fromEntries(order.map(id=>[id,0])),
    turn: { hasRolled:false, doublesStreak:0 },
    bankrupt: [],
    winner: null,
    chanceOrder: shuffledIdx(CHANCE_CARDS.length),
    chanceCursor: 0,
    chestOrder: shuffledIdx(CHEST_CARDS.length),
    chestCursor: 0,
  };
  await supabase.from("games").update({ state, status:"playing" }).eq("id", gameId);
  await logHistory(gameId, me.playerId, me.name, "start_game", `La partita è iniziata! Ogni giocatore parte con 1500.`);
  game.status = "playing"; game.state = state;
  render();
}
function shuffledIdx(n){ return Array.from({length:n},(_,i)=>i).sort(()=>Math.random()-0.5); }

// ============================================================ BOARD
function gridPos(i){
  if(i<=10) return { col: 11-i, row: 11 };
  if(i<=20) return { col: 1, row: 11-(i-10) };
  if(i<=30) return { col: 1+(i-20), row: 1 };
  return { col: 11, row: 1+(i-30) };
}

function buildBoardGrid(){
  const grid = $("boardGrid");
  grid.innerHTML = "";
  BOARD.forEach(space=>{
    const { col, row } = gridPos(space.i);
    const cell = document.createElement("div");
    cell.className = "board-cell";
    cell.dataset.index = space.i;
    cell.style.gridColumn = col; cell.style.gridRow = row;
    if(["go","jail","parking","gotojail"].includes(space.type)) cell.classList.add("corner");
    cell.classList.add("type-"+space.type);

    let inner = "";
    if(space.type==="property"){
      inner += `<div class="stripe" style="background:${GROUP_COLORS[space.group]}"></div>`;
    }
    const icon = { chance:"❓", chest:"🎁", tax:"💰", go:"➡️ VIA", jail:"🔒", parking:"🅿️", gotojail:"🚔" }[space.type] || "";
    inner += `<div class="cname">${icon?icon+"<br>":""}${escapeHtml(space.name)}</div>`;
    if(space.price) inner += `<div class="cprice">L.${space.price}</div>`;
    if(space.type==="property"||space.type==="station"||space.type==="utility"){
      inner += `<div class="houses" data-houses></div><div class="owner-bar" data-owner></div>`;
    }
    cell.innerHTML = inner;
    cell.onclick = ()=>showCellInfo(space.i);
    grid.appendChild(cell);
  });

  const center = document.createElement("div");
  center.className = "board-cell center";
  center.innerHTML = `<div class="center-plate"><h2>MONOPOLY</h2><div class="sub">Sala da Gioco Edition</div></div>`;
  grid.appendChild(center);
}

function renderBoardState(){
  const st = game.state;
  BOARD.forEach(space=>{
    if(!(space.type==="property"||space.type==="station"||space.type==="utility")) return;
    const cell = document.querySelector(`.board-cell[data-index="${space.i}"]`);
    if(!cell) return;
    const p = st.properties[space.i];
    const ownerBar = cell.querySelector("[data-owner]");
    const housesEl = cell.querySelector("[data-houses]");
    ownerBar.style.background = p.owner ? colorOf(p.owner) : "transparent";
    let existingFlag = cell.querySelector(".mortgaged-flag");
    if(p.mortgaged){
      if(!existingFlag){ const f=document.createElement("div"); f.className="mortgaged-flag"; f.textContent="IPOTECATO"; cell.appendChild(f); }
    } else if(existingFlag){ existingFlag.remove(); }
    housesEl.innerHTML = "";
    if(p.hotel){ const h=document.createElement("div"); h.className="hotel-icon"; housesEl.appendChild(h); }
    else if(p.houses>0){ for(let i=0;i<p.houses;i++){ const h=document.createElement("div"); h.className="house-icon"; housesEl.appendChild(h); } }
  });

  document.querySelectorAll(".token").forEach(t=>t.remove());
  (st.order||[]).forEach((pid,idx)=>{
    if((st.bankrupt||[]).includes(pid)) return;
    const cell = document.querySelector(`.board-cell[data-index="${st.positions[pid]}"]`);
    if(!cell) return;
    const tok = document.createElement("div");
    tok.className = "token";
    tok.style.background = colorOf(pid);
    tok.style.left = (6 + (idx%3)*16) + "px";
    tok.style.top = (18 + Math.floor(idx/3)*16) + "px";
    tok.title = playerName(pid);
    cell.appendChild(tok);
  });
}

function showCellInfo(i){
  const space = BOARD[i];
  const st = game.state;
  if(space.type==="property"||space.type==="station"||space.type==="utility"){
    const p = st.properties[i];
    const ownerTxt = p.owner ? playerName(p.owner) : "Nessuno (disponibile)";
    toast(`${space.name} — Proprietario: ${ownerTxt}${p.mortgaged?" (ipotecato)":""}`);
  }
}

function colorOf(pid){ const p = players.find(pl=>pl.id===pid); return p?p.color:"#888"; }
function playerName(pid){ const p = players.find(pl=>pl.id===pid); return p?p.name:"—"; }
function isMyTurn(){ const st=game.state; return st && st.order && st.order[st.currentPlayerIndex]===me.playerId; }

// ============================================================ TURNO: TIRO DADI & MOVIMENTO
async function rollDice(){
  const st = structuredClone(game.state);
  if(!isMyTurn() || st.turn.hasRolled) return;

  const d1 = 1+Math.floor(Math.random()*6), d2 = 1+Math.floor(Math.random()*6);
  const isDouble = d1===d2;
  st.turn.lastRoll = [d1,d2];
  st.turn.doublesStreak = isDouble ? (st.turn.doublesStreak||0)+1 : 0;
  $("lastRollBadge").textContent = `🎲 ${d1} + ${d2}`;

  await logHistory(gameId, me.playerId, me.name, "roll", `${me.name} tira ${d1} e ${d2}${isDouble?" — doppio!":""}`);

  if(st.turn.doublesStreak >= 3){
    sendToJail(st, me.playerId);
    await logHistory(gameId, me.playerId, me.name, "triple_double", `${me.name} fa tre doppi consecutivi e finisce dritto in prigione!`);
    st.turn.hasRolled = true;
    await saveState(st);
    return;
  }

  const steps = d1+d2;
  const from = st.positions[me.playerId];
  await animateLocalMove(from, steps);
  const to = (from+steps)%40;
  const passedGo = from+steps >= 40;
  st.positions[me.playerId] = to;
  if(passedGo){ st.money[me.playerId]+=200; await logHistory(gameId, me.playerId, me.name, "pass_go", `${me.name} passa dal Via e incassa 200`); }

  pendingBuyIndex = null;
  const forceEnd = await resolveLanding(st, me.playerId, to, d1+d2, 0);
  st.turn.hasRolled = forceEnd ? true : !isDouble;

  await saveState(st);
  checkVictory(st);
  if(pendingBuyIndex !== null) openBuyModal(pendingBuyIndex);
}

async function animateLocalMove(from, steps){
  let pos = from;
  for(let i=0;i<steps;i++){
    pos = (pos+1)%40;
    const cell = document.querySelector(`.board-cell[data-index="${pos}"]`);
    if(cell){
      let ghost = document.getElementById("ghostToken");
      if(!ghost){ ghost = document.createElement("div"); ghost.id="ghostToken"; ghost.className="token"; ghost.style.background = colorOf(me.playerId); ghost.style.left="6px"; ghost.style.top="6px"; }
      cell.appendChild(ghost);
    }
    await sleep(80);
  }
  document.getElementById("ghostToken")?.remove();
}

// ============================================================ LANDING / RENDITA / TASSE / CARTE
let pendingBuyIndex = null;

async function resolveLanding(st, pid, idx, diceTotal, depth){
  if(depth > 4) return false; // guardia anti-loop per catene di carte
  const space = BOARD[idx];
  if(space.type === "property" || space.type === "station" || space.type === "utility"){
    const p = st.properties[idx];
    if(!p.owner){
      if(pid === me.playerId) pendingBuyIndex = idx;
      return false;
    }
    if(p.owner !== pid && !p.mortgaged){
      const rent = computeRent(st, idx, diceTotal);
      payDebt(st, pid, rent, p.owner);
      await logHistory(gameId, pid, playerName(pid), "pay_rent", `${playerName(pid)} paga ${rent} di affitto a ${playerName(p.owner)} per ${space.name}`);
    }
    return false;
  }
  if(space.type === "tax"){
    payDebt(st, pid, space.amount, null);
    await logHistory(gameId, pid, playerName(pid), "pay_tax", `${playerName(pid)} paga ${space.amount} di tasse (${space.name})`);
    return false;
  }
  if(space.type === "gotojail"){
    sendToJail(st, pid);
    await logHistory(gameId, pid, playerName(pid), "goto_jail", `${playerName(pid)} finisce in prigione!`);
    return true;
  }
  if(space.type === "chance" || space.type === "chest"){
    const card = drawCard(st, space.type);
    await logHistory(gameId, pid, playerName(pid), "draw_card", `${playerName(pid)} pesca ${space.type==='chance'?'Probabilità':'Imprevisti'}: "${card.text}"`);
    if(pid === me.playerId) showCardModal(space.type, card.text);
    return await applyCardEffect(st, pid, card.effect, diceTotal, depth+1);
  }
  return false;
}

function computeRent(st, idx, diceTotal){
  const space = BOARD[idx];
  const p = st.properties[idx];
  if(space.type === "property"){
    if(p.hotel) return space.rent[5];
    if(p.houses>0) return space.rent[p.houses];
    const ownedInGroup = GROUPS[space.group].filter(i=>st.properties[i].owner===p.owner).length;
    let base = space.rent[0];
    if(ownedInGroup === GROUPS[space.group].length) base *= 2;
    return base;
  }
  if(space.type === "station"){
    const count = STATIONS.filter(i=>st.properties[i].owner===p.owner).length;
    return STATION_RENT[Math.min(count,4)-1];
  }
  if(space.type === "utility"){
    const count = UTILITIES.filter(i=>st.properties[i].owner===p.owner).length;
    return diceTotal * (count===2 ? 10 : 4);
  }
  return 0;
}

function payDebt(st, payerId, amount, creditorId){
  st.money[payerId] -= amount;
  if(creditorId) st.money[creditorId] += amount;
  if(st.money[payerId] < 0){
    // prima vende le costruzioni per liquidità (anche più livelli sulla stessa proprietà)
    let guard = 0;
    while(st.money[payerId] < 0 && guard < 200){
      guard++;
      const withHouses = Object.entries(st.properties).filter(([i,p])=>p.owner===payerId && (p.houses>0 || p.hotel));
      if(!withHouses.length) break;
      const [i,p] = withHouses[0];
      const refund = Math.floor(HOUSE_COST[BOARD[i].group]/2);
      if(p.hotel){ p.hotel=false; p.houses=4; } else { p.houses--; }
      st.money[payerId]+=refund;
    }
    // poi ipoteca le proprietà libere da costruzioni
    let owned = Object.entries(st.properties).filter(([i,p])=>p.owner===payerId && !p.mortgaged && p.houses===0 && !p.hotel);
    for(const [i,p] of owned){
      if(st.money[payerId] >= 0) break;
      p.mortgaged = true;
      st.money[payerId] += Math.floor(BOARD[i].price/2);
    }
    if(st.money[payerId] < 0) declareBankrupt(st, payerId, creditorId);
  }
}

function declareBankrupt(st, playerId, creditorId){
  if((st.bankrupt||[]).includes(playerId)) return;
  st.bankrupt.push(playerId);
  Object.entries(st.properties).forEach(([i,p])=>{
    if(p.owner === playerId){
      if(creditorId){ p.owner = creditorId; } else { p.owner = null; p.mortgaged = false; }
      p.houses = 0; p.hotel = false;
    }
  });
  st.money[playerId] = 0;
  logHistory(gameId, playerId, playerName(playerId), "bankrupt", `💸 ${playerName(playerId)} è in bancarotta ed esce dalla partita!`);
}

function sendToJail(st, pid){
  st.positions[pid] = 10;
  st.jail[pid] = { inJail:true, turns:0 };
}

function drawCard(st, type){
  const orderKey = type==="chance" ? "chanceOrder" : "chestOrder";
  const cursorKey = type==="chance" ? "chanceCursor" : "chestCursor";
  const deck = type==="chance" ? CHANCE_CARDS : CHEST_CARDS;
  if(st[cursorKey] >= st[orderKey].length){ st[orderKey] = shuffledIdx(deck.length); st[cursorKey] = 0; }
  const card = deck[st[orderKey][st[cursorKey]]];
  st[cursorKey]++;
  return card;
}

async function applyCardEffect(st, pid, effect, diceTotal, depth){
  switch(effect.type){
    case "collect": st.money[pid] += effect.amount; return false;
    case "pay": payDebt(st, pid, effect.amount, null); return false;
    case "pay_each": st.order.forEach(o=>{ if(o!==pid && !st.bankrupt.includes(o)) payDebt(st, pid, effect.amount, o); }); return false;
    case "collect_each": st.order.forEach(o=>{ if(o!==pid && !st.bankrupt.includes(o)) payDebt(st, o, effect.amount, pid); }); return false;
    case "get_out_of_jail": st.jailCards[pid] = (st.jailCards[pid]||0)+1; return false;
    case "goto_jail": sendToJail(st, pid); return true;
    case "repair": {
      let total = 0;
      Object.values(st.properties).forEach(p=>{ if(p.owner===pid){ if(p.hotel) total += effect.perHotel; else total += p.houses*effect.perHouse; } });
      payDebt(st, pid, total, null);
      return false;
    }
    case "move_relative": {
      const from = st.positions[pid];
      let to = from + effect.delta;
      while(to<0) to += 40;
      to = to % 40;
      st.positions[pid] = to;
      return await resolveLanding(st, pid, to, diceTotal, depth);
    }
    case "move_to": {
      const from = st.positions[pid];
      const to = effect.to;
      const passedGo = effect.collectGo && to < from;
      st.positions[pid] = to;
      if(passedGo){ st.money[pid] += 200; }
      return await resolveLanding(st, pid, to, diceTotal, depth);
    }
    case "move_nearest_station": {
      const from = st.positions[pid];
      let to = STATIONS.find(s=>s>from);
      if(to === undefined) to = STATIONS[0];
      const passedGo = to < from;
      st.positions[pid] = to;
      if(passedGo) st.money[pid] += 200;
      const p = st.properties[to];
      if(!p.owner){ if(pid===me.playerId) pendingBuyIndex = to; return false; }
      if(p.owner !== pid){
        const rent = computeRent(st, to, diceTotal) * (effect.pay2x ? 2 : 1);
        payDebt(st, pid, rent, p.owner);
      }
      return false;
    }
    default: return false;
  }
}

function checkVictory(st){
  const active = st.order.filter(pid=>!(st.bankrupt||[]).includes(pid));
  if(active.length === 1 && st.order.length > 1){
    st.phase = "gameover"; st.winner = active[0];
    supabase.from("games").update({ state: st, status:"finished", winner_id: active[0] }).eq("id", gameId);
    logHistory(gameId, null, "Sistema", "victory", `🏆 ${playerName(active[0])} vince la partita: tutti gli altri sono in bancarotta!`);
    game.state = st; game.status = "finished"; render();
  }
}

// ============================================================ CARD MODAL
function showCardModal(type, text){
  $("cardModalTitle").textContent = type==="chance" ? "❓ Probabilità" : "🎁 Imprevisti";
  $("cardModalBody").innerHTML = `<div class="card-icon">${type==="chance"?"❓":"🎁"}</div><p>${escapeHtml(text)}</p>`;
  $("cardModal").style.display = "flex";
  $("cardModalOk").onclick = ()=>{ $("cardModal").style.display="none"; if(pendingBuyIndex!==null) openBuyModal(pendingBuyIndex); };
}

// ============================================================ ACQUISTO PROPRIETÀ
function openBuyModal(idx){
  const space = BOARD[idx];
  const st = game.state;
  $("buyModalTitle").textContent = `Acquisti ${space.name}?`;
  $("buyModalBody").innerHTML = `
    <p class="text-sm" style="color:var(--ink-soft)">Prezzo: <b>${space.price}</b> · Il tuo saldo: <b>${st.money[me.playerId]}</b></p>
    <div class="flex gap-8" style="margin-top:14px;">
      <button class="btn btn-gold" id="confirmBuy" ${st.money[me.playerId]<space.price?"disabled":""}>Compra</button>
      <button class="btn btn-ghost" id="declineBuy">No, grazie</button>
    </div>
  `;
  $("buyModal").style.display = "flex";
  $("confirmBuy").onclick = async ()=>{
    const st2 = structuredClone(game.state);
    st2.money[me.playerId] -= space.price;
    st2.properties[idx].owner = me.playerId;
    pendingBuyIndex = null;
    $("buyModal").style.display = "none";
    await logHistory(gameId, me.playerId, me.name, "buy", `${me.name} acquista ${space.name} per ${space.price}`);
    await saveState(st2);
  };
  $("declineBuy").onclick = ()=>{
    pendingBuyIndex = null;
    $("buyModal").style.display = "none";
  };
}

// ============================================================ PRIGIONE
async function payOutOfJail(){
  const st = structuredClone(game.state);
  st.money[me.playerId] -= 50;
  st.jail[me.playerId] = { inJail:false, turns:0 };
  await logHistory(gameId, me.playerId, me.name, "jail_pay", `${me.name} paga 50 per uscire di prigione`);
  await saveState(st);
}
async function useJailCard(){
  const st = structuredClone(game.state);
  if((st.jailCards[me.playerId]||0) <= 0) return;
  st.jailCards[me.playerId]--;
  st.jail[me.playerId] = { inJail:false, turns:0 };
  await logHistory(gameId, me.playerId, me.name, "jail_card", `${me.name} usa una carta "Esci di prigione gratis"`);
  await saveState(st);
}
async function rollForJail(){
  const st = structuredClone(game.state);
  const d1 = 1+Math.floor(Math.random()*6), d2 = 1+Math.floor(Math.random()*6);
  await logHistory(gameId, me.playerId, me.name, "jail_roll", `${me.name} tira ${d1} e ${d2} per uscire di prigione`);
  if(d1===d2){
    st.jail[me.playerId] = { inJail:false, turns:0 };
    const steps = d1+d2;
    const from = st.positions[me.playerId];
    await animateLocalMove(from, steps);
    const to = (from+steps)%40;
    st.positions[me.playerId] = to;
    pendingBuyIndex = null;
    await resolveLanding(st, me.playerId, to, d1+d2, 0);
    await logHistory(gameId, me.playerId, me.name, "jail_out", `${me.name} fa doppio ed esce di prigione!`);
  } else {
    st.jail[me.playerId].turns++;
    if(st.jail[me.playerId].turns >= 3){
      st.money[me.playerId] -= 50;
      st.jail[me.playerId] = { inJail:false, turns:0 };
      const steps = d1+d2;
      const from = st.positions[me.playerId];
      st.positions[me.playerId] = (from+steps)%40;
      await resolveLanding(st, me.playerId, st.positions[me.playerId], d1+d2, 0);
      await logHistory(gameId, me.playerId, me.name, "jail_forced", `${me.name} non fa doppio per la 3ª volta: paga 50 ed esce`);
    }
  }
  st.turn.hasRolled = true;
  await saveState(st);
  if(pendingBuyIndex !== null) openBuyModal(pendingBuyIndex);
}

// ============================================================ COSTRUZIONE CASE / HOTEL
function openBuildModal(){
  const st = game.state;
  const body = $("buildModalBody");
  let html = "";
  Object.entries(GROUPS).forEach(([group, indices])=>{
    const fullyOwned = indices.every(i=>st.properties[i].owner===me.playerId);
    if(!fullyOwned) return;
    html += `<div style="margin-bottom:10px;"><b style="color:${GROUP_COLORS[group]}">■</b> Gruppo ${group}</div>`;
    indices.forEach(i=>{
      const space = BOARD[i]; const p = st.properties[i];
      const level = p.hotel ? "Hotel" : (p.houses+" case");
      html += `<div class="build-row">
        <div class="name">${space.name} — ${level}${p.mortgaged?" (ipotecato)":""}</div>
        <button data-sell="${i}" ${p.houses===0 && !p.hotel ? "disabled":""}>−</button>
        <button data-buy="${i}" ${p.hotel || p.mortgaged ? "disabled":""}>+</button>
      </div>`;
    });
  });
  if(!html) html = `<p class="text-sm" style="color:var(--ink-soft)">Non possiedi ancora un gruppo completo di proprietà.</p>`;
  body.innerHTML = html;
  body.querySelectorAll("[data-buy]").forEach(btn=>btn.onclick=()=>buildHouse(parseInt(btn.dataset.buy)));
  body.querySelectorAll("[data-sell]").forEach(btn=>btn.onclick=()=>sellHouse(parseInt(btn.dataset.sell)));
  $("buildModal").style.display = "flex";
}

async function buildHouse(i){
  const st = structuredClone(game.state);
  const space = BOARD[i]; const p = st.properties[i];
  const cost = HOUSE_COST[space.group];
  if(st.money[me.playerId] < cost){ toast("Fondi insufficienti."); return; }
  const groupIdx = GROUPS[space.group];
  const minHouses = Math.min(...groupIdx.map(gi=>st.properties[gi].hotel?5:st.properties[gi].houses));
  const myLevel = p.hotel?5:p.houses;
  if(myLevel > minHouses){ toast("Devi costruire in modo uniforme sul gruppo."); return; }
  if(p.houses === 4 && !p.hotel){
    p.hotel = true; p.houses = 0;
  } else if(!p.hotel){
    p.houses++;
  } else { return; }
  st.money[me.playerId] -= cost;
  await logHistory(gameId, me.playerId, me.name, "build", `${me.name} costruisce su ${space.name} (-${cost})`);
  await saveState(st);
  openBuildModal();
}
async function sellHouse(i){
  const st = structuredClone(game.state);
  const space = BOARD[i]; const p = st.properties[i];
  const refund = Math.floor(HOUSE_COST[space.group]/2);
  if(p.hotel){ p.hotel=false; p.houses=4; } else if(p.houses>0){ p.houses--; } else return;
  st.money[me.playerId] += refund;
  await logHistory(gameId, me.playerId, me.name, "sell_house", `${me.name} vende una costruzione su ${space.name} (+${refund})`);
  await saveState(st);
  openBuildModal();
}

// ============================================================ FINE TURNO
async function endTurn(){
  const st = structuredClone(game.state);
  let nextIdx = st.currentPlayerIndex;
  do { nextIdx = (nextIdx+1) % st.order.length; } while(st.bankrupt.includes(st.order[nextIdx]) && nextIdx !== st.currentPlayerIndex);
  st.currentPlayerIndex = nextIdx;
  st.turn = { hasRolled:false, doublesStreak:0 };
  $("lastRollBadge").textContent = "";
  await logHistory(gameId, null, "Sistema", "end_turn", `Turno di ${playerName(st.order[nextIdx])}`);
  await saveState(st);
}

// ============================================================ PANNELLI
function renderActionPanel(){
  const st = game.state;
  const content = $("actionContent");
  if(st.phase === "gameover"){
    content.innerHTML = `<p><b>🏆 ${playerName(st.winner)} ha vinto la partita!</b></p>`;
    return;
  }
  if(!isMyTurn()){
    content.innerHTML = `<p class="text-sm" style="color:var(--ink-soft)">In attesa che <b>${playerName(st.order[st.currentPlayerIndex])}</b> giochi il suo turno…</p>`;
    return;
  }
  const myJail = st.jail[me.playerId];
  let html = `<p class="text-sm">Saldo: <b>${st.money[me.playerId]}</b></p>`;
  if(myJail?.inJail){
    html += `<p class="text-xs" style="color:var(--danger)">Sei in prigione (tentativo ${myJail.turns+1}/3)</p>
      <div class="flex gap-8" style="flex-wrap:wrap; margin-top:8px;">
        <button class="btn btn-gold btn-sm" id="jailPayBtn">Paga 50</button>
        ${(st.jailCards[me.playerId]||0)>0 ? `<button class="btn btn-blue btn-sm" id="jailCardBtn">Usa carta (${st.jailCards[me.playerId]})</button>`:""}
        <button class="btn btn-ghost btn-sm" id="jailRollBtn">Tira per uscire</button>
      </div>`;
  } else if(!st.turn.hasRolled){
    html += `<button class="btn btn-blue btn-block" id="rollBtn">🎲 Tira i dadi</button>`;
  } else {
    html += `<p class="text-xs" style="color:var(--ink-soft)">Turno risolto. Gestisci le proprietà o termina il turno.</p>
      <button class="btn btn-red btn-block" id="endTurnBtn" style="margin-top:8px;">Termina turno →</button>`;
  }
  html += `<button class="btn btn-ghost btn-block" id="buildBtn" style="margin-top:8px;">🏗️ Gestisci case &amp; hotel</button>`;
  content.innerHTML = html;

  $("rollBtn")?.addEventListener("click", rollDice);
  $("endTurnBtn")?.addEventListener("click", endTurn);
  $("buildBtn")?.addEventListener("click", openBuildModal);
  $("jailPayBtn")?.addEventListener("click", payOutOfJail);
  $("jailCardBtn")?.addEventListener("click", useJailCard);
  $("jailRollBtn")?.addEventListener("click", rollForJail);
}

function renderPlayers(){
  const st = game.state;
  const list = $("playersList"); list.innerHTML = "";
  players.forEach(p=>{
    const isCurrent = st.order && st.order[st.currentPlayerIndex] === p.id;
    const isBankrupt = (st.bankrupt||[]).includes(p.id);
    const propCount = Object.values(st.properties||{}).filter(pr=>pr.owner===p.id).length;
    const row = document.createElement("div");
    row.className = "player-row" + (isCurrent?" current-turn":"") + (isBankrupt?" bankrupt":"");
    row.innerHTML = `
      <div class="player-dot" style="background:${p.color}"></div>
      <div style="flex:1">
        <div class="pname">${escapeHtml(p.name)} ${p.id===me.playerId?"(tu)":""}</div>
        <div class="pstats">L. ${st.money?.[p.id] ?? "—"} · ${propCount} proprietà ${st.jail?.[p.id]?.inJail ? "· 🔒" : ""}</div>
      </div>
      ${isCurrent ? '<span>🎯</span>' : ''}
    `;
    list.appendChild(row);
  });
}

function renderProperties(){
  const st = game.state;
  const list = $("propertiesList"); list.innerHTML = "";
  const mine = Object.entries(st.properties||{}).filter(([i,p])=>p.owner===me.playerId);
  if(!mine.length){ list.innerHTML = `<div class="text-xs" style="color:var(--ink-soft)">Nessuna proprietà.</div>`; return; }
  mine.forEach(([i,p])=>{
    const space = BOARD[i];
    const row = document.createElement("div");
    row.className = "prop-row";
    row.innerHTML = `<span><span class="swatch" style="background:${GROUP_COLORS[space.group]||'#999'}"></span>${space.name}</span>
      <span>${p.hotel?"🏨":p.houses>0?"🏠×"+p.houses:""} ${p.mortgaged?"(ipotecato)":""}</span>`;
    list.appendChild(row);
  });
}

function renderTurnBanner(){
  const st = game.state;
  $("turnBanner").textContent = st.phase==="gameover"
    ? `🏆 Vince ${playerName(st.winner)}`
    : `Turno di ${playerName(st.order[st.currentPlayerIndex])}${isMyTurn()?" (tu)":""}`;
}

function renderHistory(items){ const list=$("historyList"); list.innerHTML=""; items.slice(-100).forEach(appendHistoryItem); }
function appendHistoryItem(h){
  const list = $("historyList");
  const el = document.createElement("div");
  el.className = "history-item";
  el.innerHTML = `<span class="htime">${fmtTime(h.created_at)}</span>${escapeHtml(h.message)}`;
  list.appendChild(el);
  list.scrollTop = list.scrollHeight;
}

function sleep(ms){ return new Promise(res=>setTimeout(res,ms)); }
function escapeHtml(s){ return (s||"").toString().replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

boot();
