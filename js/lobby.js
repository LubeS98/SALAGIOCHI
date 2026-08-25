import { supabase, isConfigured, genCode, genId, PLAYER_COLORS, savePlayerSession, logHistory } from "./supabaseClient.js";

const tablesGrid = document.getElementById("tablesGrid");
const connStatus = document.getElementById("connStatus");
let pendingType = "risiko";
let chosenColor = PLAYER_COLORS[0].hex;
let chosenColorJoin = PLAYER_COLORS[0].hex;

function toast(msg){
  const wrap = document.getElementById("toastWrap");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(()=> el.remove(), 4200);
}

if(!isConfigured()){
  connStatus.textContent = "⚠ Supabase non configurato";
  connStatus.style.color = "#e46b57";
  toast("Configura js/supabaseClient.js con URL e chiave anon del tuo progetto Supabase prima di giocare.");
} else {
  connStatus.textContent = "● connesso";
  connStatus.style.color = "#5fce80";
}

function buildColorPicker(container, onPick, selected){
  container.innerHTML = "";
  PLAYER_COLORS.forEach(c=>{
    const dot = document.createElement("button");
    dot.type = "button";
    dot.title = c.name;
    dot.style.cssText = `width:32px;height:32px;border-radius:50%;background:${c.hex};border:3px solid ${c.hex===selected? '#241a12':'transparent'};cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.3);`;
    dot.onclick = ()=>{ onPick(c.hex); buildColorPicker(container, onPick, c.hex); };
    container.appendChild(dot);
  });
}
buildColorPicker(document.getElementById("colorPicker"), (c)=>chosenColor=c, chosenColor);
buildColorPicker(document.getElementById("joinColorPicker"), (c)=>chosenColorJoin=c, chosenColorJoin);

window.openCreate = function(type){
  pendingType = type;
  document.getElementById("createTitle").textContent = `Nuova partita — ${type === 'risiko' ? 'Risiko' : 'Monopoly'}`;
  document.getElementById("createModal").style.display = "flex";
};
window.openJoin = function(type){
  document.getElementById("joinModal").style.display = "flex";
};
window.closeModals = function(){
  document.getElementById("createModal").style.display = "none";
  document.getElementById("joinModal").style.display = "none";
};

document.getElementById("createConfirmBtn").onclick = async () => {
  const name = document.getElementById("gameNameInput").value.trim() || "Partita senza nome";
  const hostName = document.getElementById("hostNameInput").value.trim();
  if(!hostName){ toast("Inserisci il tuo nome"); return; }

  const btn = document.getElementById("createConfirmBtn");
  btn.disabled = true; btn.textContent = "Creazione…";

  try{
    const code = genCode();
    const initialState = pendingType === "risiko" ? { phase: "lobby" } : { phase: "lobby" };

    const { data: game, error } = await supabase.from("games").insert({
      code, type: pendingType, name, status: "lobby", state: initialState
    }).select().single();
    if(error) throw error;

    const { data: player, error: perr } = await supabase.from("players").insert({
      game_id: game.id, name: hostName, color: chosenColor, seat: 0, is_host: true
    }).select().single();
    if(perr) throw perr;

    savePlayerSession(game.id, player.id, hostName);
    await logHistory(game.id, player.id, hostName, "create_game", `${hostName} ha creato il tavolo "${name}"`);

    location.href = `${pendingType}.html?game=${game.id}`;
  }catch(e){
    console.error(e);
    toast("Errore nella creazione: " + (e.message||e));
    btn.disabled = false; btn.textContent = "Crea tavolo →";
  }
};

document.getElementById("joinConfirmBtn").onclick = async () => {
  const code = document.getElementById("joinCodeInput").value.trim().toUpperCase();
  const name = document.getElementById("joinNameInput").value.trim();
  if(!code || !name){ toast("Compila codice e nome"); return; }

  const btn = document.getElementById("joinConfirmBtn");
  btn.disabled = true; btn.textContent = "Ricerca tavolo…";

  try{
    const { data: game, error } = await supabase.from("games").select("*").eq("code", code).maybeSingle();
    if(error) throw error;
    if(!game){ toast("Nessun tavolo trovato con quel codice"); btn.disabled=false; btn.textContent="Entra al tavolo →"; return; }

    const { data: existingPlayers } = await supabase.from("players").select("*").eq("game_id", game.id);
    if(game.status !== "lobby" && !(existingPlayers||[]).length===0){
      // allow rejoin even if playing, handled below by name match
    }
    let player = (existingPlayers||[]).find(p=>p.name.toLowerCase() === name.toLowerCase());

    if(!player){
      if(game.status !== "lobby"){
        toast("La partita è già iniziata: non puoi entrare come nuovo giocatore.");
        btn.disabled=false; btn.textContent="Entra al tavolo →";
        return;
      }
      if((existingPlayers||[]).length >= game.max_players){
        toast("Tavolo pieno.");
        btn.disabled=false; btn.textContent="Entra al tavolo →";
        return;
      }
      const usedColors = new Set((existingPlayers||[]).map(p=>p.color));
      let color = chosenColorJoin;
      if(usedColors.has(color)){
        const free = PLAYER_COLORS.find(c=>!usedColors.has(c.hex));
        color = free ? free.hex : color;
      }
      const seat = (existingPlayers||[]).length;
      const { data: newPlayer, error: perr } = await supabase.from("players").insert({
        game_id: game.id, name, color, seat, is_host:false
      }).select().single();
      if(perr) throw perr;
      player = newPlayer;
      await logHistory(game.id, player.id, name, "join_game", `${name} si è seduto al tavolo`);
    }

    savePlayerSession(game.id, player.id, name);
    location.href = `${game.type}.html?game=${game.id}`;
  }catch(e){
    console.error(e);
    toast("Errore: " + (e.message||e));
    btn.disabled = false; btn.textContent = "Entra al tavolo →";
  }
};

// ---------- lista tavoli in tempo reale ----------
async function loadTables(){
  tablesGrid.innerHTML = `<div class="empty-state">Caricamento tavoli…</div>`;
  const { data: games, error } = await supabase
    .from("games")
    .select("*, players(id,name,color)")
    .neq("status", "finished")
    .order("created_at", { ascending:false })
    .limit(30);

  if(error){
    tablesGrid.innerHTML = `<div class="empty-state">Impossibile caricare i tavoli.<br><span class="text-xs">${error.message}</span></div>`;
    return;
  }
  if(!games || !games.length){
    tablesGrid.innerHTML = `<div class="empty-state">Nessun tavolo aperto al momento.<br>Crea la prima partita! 🎲</div>`;
    return;
  }
  tablesGrid.innerHTML = "";
  games.forEach(g=>{
    const card = document.createElement("div");
    card.className = "table-card parchment";
    card.style.cursor = "pointer";
    const players = g.players || [];
    card.innerHTML = `
      <div class="wax-seal">${g.code.slice(0,2)}</div>
      <div class="info">
        <h3>${escapeHtml(g.name)}</h3>
        <div class="text-xs" style="color:var(--ink-soft)">${players.map(p=>p.name).join(", ") || "nessun giocatore"}</div>
        <div class="meta">
          <span class="pill ${g.type==='risiko'?'pill-risiko':'pill-monopoly'}">${g.type==='risiko'?'Risiko':'Monopoly'}</span>
          <span class="pill ${g.status==='lobby'?'pill-lobby':'pill-playing'}">${g.status==='lobby'?'In attesa':'In corso'}</span>
          <span class="pill" style="background:rgba(0,0,0,.08); color:var(--ink-soft);">${players.length}/${g.max_players} giocatori</span>
        </div>
      </div>
    `;
    card.onclick = () => location.href = `${g.type}.html?game=${g.id}`;
    tablesGrid.appendChild(card);
  });
}
function escapeHtml(s){ return (s||"").replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

document.getElementById("refreshBtn").onclick = loadTables;
loadTables();

if(isConfigured()){
  supabase.channel("lobby-games")
    .on("postgres_changes", { event:"*", schema:"public", table:"games" }, loadTables)
    .on("postgres_changes", { event:"*", schema:"public", table:"players" }, loadTables)
    .subscribe();
}
