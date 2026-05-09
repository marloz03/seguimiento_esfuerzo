const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = 3000;

const TILE = { WALL: 0, FLOOR: 1, EXIT: 2, TRAP: 3, DOOR_OPEN: 4, DOOR_CLOSED: 5 };

const MAP_TEMPLATE = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,1,1,1,1,0,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,0,0,1,1,0,1,0,0,0,0,1,0,0,0,0,0,1,0],
  [0,1,0,0,1,1,4,1,0,0,0,0,1,0,0,0,0,0,1,0],
  [0,1,1,1,1,1,0,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0],
  [0,1,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0],
  [0,1,1,1,1,1,1,1,1,4,1,1,1,1,1,1,1,1,1,0],
  [0,1,0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,1,0],
  [0,1,0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0,1,0],
  [0,1,1,1,4,1,1,1,1,1,1,1,1,1,1,1,4,1,1,0],
  [0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0],
  [0,1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,1,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];

const MAP_ROWS = MAP_TEMPLATE.length;
const MAP_COLS = MAP_TEMPLATE[0].length;

let gameState = null;
const clients = new Map(); // ws -> playerId

function initGame() {
  const map = MAP_TEMPLATE.map(row => [...row]);
  return {
    phase: 'lobby', // lobby | playing | ended
    map,
    players: {},
    trapPositions: findTraps(map),
    doorPositions: findDoors(map),
    monsters: [],
    nextMonsterId: 1,
    winner: null,
  };
}

function findTraps(map) {
  const traps = [];
  for (let r = 0; r < MAP_ROWS; r++)
    for (let c = 0; c < MAP_COLS; c++)
      if (map[r][c] === TILE.TRAP) traps.push({ r, c, active: false });
  return traps;
}

function findDoors(map) {
  const doors = [];
  for (let r = 0; r < MAP_ROWS; r++)
    for (let c = 0; c < MAP_COLS; c++)
      if (map[r][c] === TILE.DOOR_OPEN || map[r][c] === TILE.DOOR_CLOSED)
        doors.push({ r, c, open: map[r][c] === TILE.DOOR_OPEN });
  return doors;
}

function spawnPosition() {
  return { r: 1, c: 1 };
}

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const [ws] of clients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

function sendTo(ws, data) {
  if (ws.readyState === 1) ws.send(JSON.stringify(data));
}

function isWalkable(r, c, map) {
  if (r < 0 || r >= MAP_ROWS || c < 0 || c >= MAP_COLS) return false;
  const t = map[r][c];
  return t === TILE.FLOOR || t === TILE.EXIT || t === TILE.TRAP || t === TILE.DOOR_OPEN;
}

function checkTrapHits() {
  if (!gameState) return;
  const activeTrapCoords = new Set(
    gameState.trapPositions.filter(t => t.active).map(t => `${t.r},${t.c}`)
  );
  for (const id in gameState.players) {
    const p = gameState.players[id];
    if (p.role === 'dm' || !p.alive) continue;
    if (activeTrapCoords.has(`${p.r},${p.c}`)) {
      p.hp -= 1;
      if (p.hp <= 0) {
        p.alive = false;
        broadcast({ type: 'player_died', id, name: p.name });
      }
    }
  }
  checkWinCondition();
}

function checkMonsterHits() {
  if (!gameState) return;
  for (const monster of gameState.monsters) {
    for (const id in gameState.players) {
      const p = gameState.players[id];
      if (p.role === 'dm' || !p.alive) continue;
      if (p.r === monster.r && p.c === monster.c) {
        p.hp -= 1;
        if (p.hp <= 0) {
          p.alive = false;
          broadcast({ type: 'player_died', id, name: p.name });
        }
      }
    }
  }
  checkWinCondition();
}

function checkWinCondition() {
  if (!gameState || gameState.phase !== 'playing') return;

  const adventurers = Object.values(gameState.players).filter(p => p.role === 'adventurer');
  const exitR = 13, exitC = 17;

  for (const p of adventurers) {
    if (p.alive && p.r === exitR && p.c === exitC) {
      gameState.phase = 'ended';
      gameState.winner = 'adventurers';
      broadcast({ type: 'game_over', winner: 'adventurers', message: '¡Los aventureros escaparon!' });
      return;
    }
  }

  const allDead = adventurers.length > 0 && adventurers.every(p => !p.alive);
  if (allDead) {
    gameState.phase = 'ended';
    gameState.winner = 'dm';
    broadcast({ type: 'game_over', winner: 'dm', message: '¡El Dungeon Master eliminó a todos!' });
  }
}

function moveMonsters() {
  if (!gameState || gameState.phase !== 'playing') return;
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  for (const m of gameState.monsters) {
    const valid = dirs.filter(([dr,dc]) => isWalkable(m.r+dr, m.c+dc, gameState.map));
    if (valid.length === 0) continue;
    const [dr, dc] = valid[Math.floor(Math.random() * valid.length)];
    m.r += dr;
    m.c += dc;
  }
  checkMonsterHits();
  broadcast({ type: 'state_update', state: publicState() });
}

function publicState() {
  return {
    phase: gameState.phase,
    map: gameState.map,
    players: gameState.players,
    monsters: gameState.monsters,
    trapPositions: gameState.trapPositions,
    doorPositions: gameState.doorPositions,
    winner: gameState.winner,
  };
}

let monsterInterval = null;

function startMonsterLoop() {
  if (monsterInterval) clearInterval(monsterInterval);
  monsterInterval = setInterval(() => {
    moveMonsters();
    checkTrapHits();
  }, 1500);
}

// HTTP server for static files
const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

gameState = initGame();

wss.on('connection', (ws) => {
  const playerId = 'p' + Date.now() + Math.floor(Math.random() * 1000);
  clients.set(ws, playerId);

  sendTo(ws, { type: 'connected', id: playerId, state: publicState() });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const id = clients.get(ws);
    if (!id || !gameState) return;

    if (msg.type === 'join') {
      if (gameState.phase !== 'lobby') return;
      const pos = spawnPosition();
      gameState.players[id] = {
        id, name: msg.name || 'Jugador', role: null,
        r: pos.r, c: pos.c, hp: 3, alive: true,
        color: `hsl(${Math.floor(Math.random()*360)},70%,55%)`,
      };
      broadcast({ type: 'player_joined', id, name: msg.name, state: publicState() });
    }

    if (msg.type === 'start_game') {
      if (gameState.phase !== 'lobby') return;
      const pids = Object.keys(gameState.players);
      if (pids.length < 2) return;
      const dmId = pids[Math.floor(Math.random() * pids.length)];
      for (const pid of pids) {
        gameState.players[pid].role = pid === dmId ? 'dm' : 'adventurer';
      }
      gameState.phase = 'playing';
      startMonsterLoop();
      broadcast({ type: 'game_started', dmId, state: publicState() });
    }

    if (msg.type === 'move') {
      if (gameState.phase !== 'playing') return;
      const p = gameState.players[id];
      if (!p || !p.alive || p.role !== 'adventurer') return;
      const { dr, dc } = msg;
      const nr = p.r + dr, nc = p.c + dc;
      if (!isWalkable(nr, nc, gameState.map)) return;
      p.r = nr; p.c = nc;
      checkTrapHits();
      checkWinCondition();
      broadcast({ type: 'state_update', state: publicState() });
    }

    if (msg.type === 'toggle_trap') {
      if (gameState.phase !== 'playing') return;
      const p = gameState.players[id];
      if (!p || p.role !== 'dm') return;
      const trap = gameState.trapPositions.find(t => t.r === msg.r && t.c === msg.c);
      if (!trap) return;
      trap.active = !trap.active;
      checkTrapHits();
      broadcast({ type: 'state_update', state: publicState() });
    }

    if (msg.type === 'toggle_door') {
      if (gameState.phase !== 'playing') return;
      const p = gameState.players[id];
      if (!p || p.role !== 'dm') return;
      const door = gameState.doorPositions.find(d => d.r === msg.r && d.c === msg.c);
      if (!door) return;
      door.open = !door.open;
      gameState.map[door.r][door.c] = door.open ? TILE.DOOR_OPEN : TILE.DOOR_CLOSED;
      broadcast({ type: 'state_update', state: publicState() });
    }

    if (msg.type === 'spawn_monster') {
      if (gameState.phase !== 'playing') return;
      const p = gameState.players[id];
      if (!p || p.role !== 'dm') return;
      if (gameState.monsters.length >= 6) return;
      const { r, c } = msg;
      if (!isWalkable(r, c, gameState.map)) return;
      gameState.monsters.push({ id: gameState.nextMonsterId++, r, c });
      broadcast({ type: 'state_update', state: publicState() });
    }

    if (msg.type === 'restart') {
      if (monsterInterval) clearInterval(monsterInterval);
      gameState = initGame();
      broadcast({ type: 'restarted', state: publicState() });
    }
  });

  ws.on('close', () => {
    const id = clients.get(ws);
    clients.delete(ws);
    if (id && gameState && gameState.players[id]) {
      delete gameState.players[id];
      broadcast({ type: 'player_left', id, state: publicState() });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Traición en la Mazmorra corriendo en http://localhost:${PORT}`);
});
