const TILE_SIZE = 36;
const TILE = { WALL: 0, FLOOR: 1, EXIT: 2, TRAP: 3, DOOR_OPEN: 4, DOOR_CLOSED: 5 };

const COLORS = {
  wall: '#2a1a0a',
  floor: '#3b2a1a',
  exit: '#00ff88',
  trap_off: '#3b2a1a',
  trap_on: '#ff4400',
  door_open: '#8b6914',
  door_closed: '#5a3a00',
  monster: '#aa00ff',
};

let ws, myId, myRole, state;
let spawnMode = false;

// DOM refs
const screens = {
  lobby: document.getElementById('screen-lobby'),
  game: document.getElementById('screen-game'),
  end: document.getElementById('screen-end'),
};
const inputName = document.getElementById('input-name');
const btnJoin = document.getElementById('btn-join');
const btnStart = document.getElementById('btn-start');
const btnSpawn = document.getElementById('btn-spawn');
const btnRestart = document.getElementById('btn-restart');
const playerListEl = document.getElementById('player-list-lobby');
const roleBanner = document.getElementById('role-banner');
const hpDisplay = document.getElementById('hp-display');
const dmPanel = document.getElementById('dm-panel');
const dmStatus = document.getElementById('dm-status');
const logEl = document.getElementById('log');
const endTitle = document.getElementById('end-title');
const endMsg = document.getElementById('end-msg');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

function addLog(msg, important = false) {
  const div = document.createElement('div');
  div.className = 'log-entry' + (important ? ' important' : '');
  div.textContent = msg;
  logEl.prepend(div);
}

// WebSocket
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.onopen = () => addLog('Conectado al servidor.');

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    handleMessage(msg);
  };

  ws.onclose = () => addLog('Desconectado del servidor.');
}

function send(data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'connected':
      myId = msg.id;
      state = msg.state;
      break;

    case 'player_joined':
      state = msg.state;
      renderLobby();
      addLog(`${msg.name} se unió.`);
      break;

    case 'player_left':
      state = msg.state;
      renderLobby();
      addLog('Un jugador abandonó la partida.');
      break;

    case 'game_started':
      state = msg.state;
      myRole = state.players[myId]?.role;
      setupGameScreen();
      showScreen('game');
      renderGame();
      addLog(myRole === 'dm' ? '¡Eres el Dungeon Master! Sabotea a los aventureros.' : '¡Eres aventurero! Llega a la salida verde.', true);
      break;

    case 'state_update':
      state = msg.state;
      renderGame();
      break;

    case 'player_died':
      addLog(`☠️ ${msg.name} ha muerto.`, true);
      break;

    case 'game_over':
      state.phase = 'ended';
      endTitle.textContent = msg.winner === 'dm' ? '💀 El Dungeon Master Gana' : '🏆 ¡Los Aventureros Escaparon!';
      endMsg.textContent = msg.message;
      showScreen('end');
      break;

    case 'restarted':
      state = msg.state;
      myRole = null;
      spawnMode = false;
      showScreen('lobby');
      renderLobby();
      break;
  }
}

// LOBBY
function renderLobby() {
  if (!state) return;
  playerListEl.innerHTML = '';
  const players = Object.values(state.players);
  players.forEach(p => {
    const div = document.createElement('div');
    div.className = 'player-entry';
    div.textContent = `⚔️ ${p.name}`;
    playerListEl.appendChild(div);
  });
  if (players.length >= 2) btnStart.classList.remove('hidden');
  else btnStart.classList.add('hidden');
}

btnJoin.addEventListener('click', () => {
  const name = inputName.value.trim() || 'Anónimo';
  connect();
  setTimeout(() => send({ type: 'join', name }), 300);
  btnJoin.disabled = true;
  inputName.disabled = true;
});

btnStart.addEventListener('click', () => send({ type: 'start_game' }));
btnRestart.addEventListener('click', () => send({ type: 'restart' }));

// GAME SCREEN SETUP
function setupGameScreen() {
  if (!state) return;
  const rows = state.map.length;
  const cols = state.map[0].length;
  canvas.width = cols * TILE_SIZE;
  canvas.height = rows * TILE_SIZE;

  if (myRole === 'dm') {
    dmPanel.classList.remove('hidden');
    roleBanner.textContent = '🔮 Dungeon Master';
    roleBanner.className = 'dm';
    hpDisplay.textContent = '';
  } else {
    dmPanel.classList.add('hidden');
    roleBanner.textContent = '⚔️ Aventurero';
    roleBanner.className = 'adventurer';
  }
}

// RENDER
function renderGame() {
  if (!state || !state.map) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const map = state.map;
  const rows = map.length;
  const cols = map[0].length;

  // Tiles
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = map[r][c];
      let color = COLORS.wall;
      if (t === TILE.FLOOR) color = COLORS.floor;
      else if (t === TILE.EXIT) color = COLORS.exit;
      else if (t === TILE.DOOR_OPEN) color = COLORS.door_open;
      else if (t === TILE.DOOR_CLOSED) color = COLORS.door_closed;
      else if (t === TILE.TRAP) {
        const trap = state.trapPositions?.find(tp => tp.r === r && tp.c === c);
        color = trap?.active ? COLORS.trap_on : COLORS.trap_off;
      }
      ctx.fillStyle = color;
      ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);

      // Grid lines on floor
      if (t !== TILE.WALL) {
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.strokeRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  // Trap icons (DM can always see them; adventurers see active ones)
  if (state.trapPositions) {
    for (const trap of state.trapPositions) {
      if (!trap.active && myRole !== 'dm') continue;
      ctx.font = `${TILE_SIZE * 0.6}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = trap.active ? 1 : 0.5;
      ctx.fillText('⚙️', trap.c * TILE_SIZE + TILE_SIZE / 2, trap.r * TILE_SIZE + TILE_SIZE / 2);
      ctx.globalAlpha = 1;
    }
  }

  // Door icons
  if (state.doorPositions) {
    for (const door of state.doorPositions) {
      ctx.font = `${TILE_SIZE * 0.6}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(door.open ? '🚪' : '🔒', door.c * TILE_SIZE + TILE_SIZE / 2, door.r * TILE_SIZE + TILE_SIZE / 2);
    }
  }

  // Exit label
  ctx.font = `${TILE_SIZE * 0.6}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🏁', 17 * TILE_SIZE + TILE_SIZE / 2, 13 * TILE_SIZE + TILE_SIZE / 2);

  // Monsters
  if (state.monsters) {
    for (const m of state.monsters) {
      ctx.font = `${TILE_SIZE * 0.7}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🐀', m.c * TILE_SIZE + TILE_SIZE / 2, m.r * TILE_SIZE + TILE_SIZE / 2);
    }
  }

  // Players
  for (const [id, p] of Object.entries(state.players)) {
    if (p.role === 'dm') continue;
    if (!p.alive) continue;
    const x = p.c * TILE_SIZE + TILE_SIZE / 2;
    const y = p.r * TILE_SIZE + TILE_SIZE / 2;
    const radius = TILE_SIZE * 0.35;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = id === myId ? '#fff' : p.color;
    ctx.fill();
    if (id === myId) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Name tag
    ctx.font = '10px Segoe UI';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(p.name, x, y - radius - 2);
  }

  // HP
  const me = state.players[myId];
  if (me && myRole !== 'dm') {
    hpDisplay.textContent = '❤️'.repeat(Math.max(0, me.hp));
  }

  // DM status
  if (myRole === 'dm') {
    const alive = Object.values(state.players).filter(p => p.role === 'adventurer' && p.alive).length;
    const total = Object.values(state.players).filter(p => p.role === 'adventurer').length;
    dmStatus.textContent = `Aventureros vivos: ${alive}/${total}\nMonstruos: ${state.monsters?.length ?? 0}/6`;
    dmStatus.style.whiteSpace = 'pre';
  }
}

// CANVAS CLICK — DM actions
canvas.addEventListener('click', (e) => {
  if (!state || state.phase !== 'playing' || myRole !== 'dm') return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const px = (e.clientX - rect.left) * scaleX;
  const py = (e.clientY - rect.top) * scaleY;
  const c = Math.floor(px / TILE_SIZE);
  const r = Math.floor(py / TILE_SIZE);

  if (spawnMode) {
    send({ type: 'spawn_monster', r, c });
    spawnMode = false;
    btnSpawn.textContent = '🐀 Invocar Monstruo (clic en el mapa)';
    return;
  }

  // Check trap
  const trap = state.trapPositions?.find(t => t.r === r && t.c === c);
  if (trap) { send({ type: 'toggle_trap', r, c }); return; }

  // Check door
  const door = state.doorPositions?.find(d => d.r === r && d.c === c);
  if (door) { send({ type: 'toggle_door', r, c }); return; }
});

btnSpawn.addEventListener('click', () => {
  spawnMode = !spawnMode;
  btnSpawn.textContent = spawnMode
    ? '🎯 Clic en el mapa para colocar...'
    : '🐀 Invocar Monstruo (clic en el mapa)';
});

// KEYBOARD — adventurer movement
const KEYS = {
  ArrowUp: { dr: -1, dc: 0 }, w: { dr: -1, dc: 0 }, W: { dr: -1, dc: 0 },
  ArrowDown: { dr: 1, dc: 0 }, s: { dr: 1, dc: 0 }, S: { dr: 1, dc: 0 },
  ArrowLeft: { dr: 0, dc: -1 }, a: { dr: 0, dc: -1 }, A: { dr: 0, dc: -1 },
  ArrowRight: { dr: 0, dc: 1 }, d: { dr: 0, dc: 1 }, D: { dr: 0, dc: 1 },
};

document.addEventListener('keydown', (e) => {
  if (myRole !== 'adventurer') return;
  if (!state || state.phase !== 'playing') return;
  const dir = KEYS[e.key];
  if (!dir) return;
  e.preventDefault();
  send({ type: 'move', ...dir });
});

// Init
showScreen('lobby');
