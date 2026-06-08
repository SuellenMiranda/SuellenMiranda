const TILE = 20;
const COLS = 28;
const SCORE_KEY = "pacdev-leaderboard-v1";
const NAME_KEY = "pacdev-player-name";
const MAX_SCORES = 10;
const TURN_EPS = 0.18;
const TUNNEL_ROW = 14;

const THEME = {
  wall: "#1e293b",
  wallStroke: "#6366f1",
  dot: "#c4b5fd",
  power: "#fbbf24",
  powerFlash: "#fef3c7",
  pacman: "#fbbf24",
  frightened: "#818cf8",
  ghostEyes: "#0f172a",
  canvasBg: "#05070f",
  door: "#05070f",
};

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const levelEl = document.getElementById("level");
const bestEl = document.getElementById("best");
const statusEl = document.getElementById("status");
const leaderboardEl = document.getElementById("leaderboard");
const nameForm = document.getElementById("name-form");
const nameInput = document.getElementById("player-name");
const clearScoresBtn = document.getElementById("clear-scores");

// Labirinto clássico — 28 colunas em TODAS as linhas (sem espaços nas bordas)
const MAZE = [
  "############################",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#o####.#####.##.#####.####o#",
  "#.####.#####.##.#####.####.#",
  "#..........................#",
  "#.####.##.########.##.####.#",
  "#.####.##.########.##.####.#",
  "#......##....##....##......#",
  "######.##### ## #####.######",
  "######.##### ## #####.######",
  "######.##          ##.######",
  "######.## ###--### ##.######",
  "#......## #      # ##......#",
  "######.## #      # ##.######",
  "######.## #      # ##.######",
  "######.## #      # ##.######",
  "######.## #      # ##.######",
  "######.## ######## ##.######",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#.####.#####.##.#####.####.#",
  "#o..##................##..o#",
  "###.##.##.########.##.##.###",
  "#......##....##....##......#",
  "#.##########.##.##########.#",
  "#..........................#",
  "############################",
];

const ROWS = MAZE.length;

const WALL = 0;
const DOT = 1;
const POWER = 2;
const EMPTY = 3;
const DOOR = 4;

const DIR = {
  up: { x: 0, y: -1, name: "up" },
  down: { x: 0, y: 1, name: "down" },
  left: { x: -1, y: 0, name: "left" },
  right: { x: 1, y: 0, name: "right" },
  none: { x: 0, y: 0, name: "none" },
};

const PAC_START = { x: 13.5, y: 26 };
const GHOST_DOOR = { x: 14, y: 13 };
const GHOST_HOME = { x: 13.5, y: 16 };

const GHOST_DEFS = [
  { color: "#f43f5e", mode: "chase", releaseDelay: 0 },
  { color: "#38bdf8", mode: "chase", releaseDelay: 120 },
  { color: "#fb923c", mode: "scatter", releaseDelay: 240 },
  { color: "#34d399", mode: "random", releaseDelay: 360 },
];

let grid = [];
let dotsLeft = 0;
let score = 0;
let lives = 3;
let level = 1;
let started = false;
let frightenedTimer = 0;
let pendingScoreEntry = null;
let frame = 0;
let respawnPause = 0;

const pacman = {
  x: PAC_START.x,
  y: PAC_START.y,
  dir: DIR.left,
  nextDir: DIR.left,
  mouth: 0,
};

let ghosts = [];
let pacSpeed = 0.085;
let ghostBaseSpeed = 0.07;

function getLeaderboard() {
  try {
    const raw = localStorage.getItem(SCORE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLeaderboard(entries) {
  localStorage.setItem(SCORE_KEY, JSON.stringify(entries.slice(0, MAX_SCORES)));
}

function getBestScore() {
  const board = getLeaderboard();
  return board.length ? board[0].score : 0;
}

function renderLeaderboard(highlightId = null) {
  const board = getLeaderboard();
  leaderboardEl.innerHTML = "";

  if (!board.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Nenhuma pontuação ainda. Seja a primeira!";
    leaderboardEl.appendChild(li);
    return;
  }

  board.forEach((entry, index) => {
    const li = document.createElement("li");
    if (entry.id === highlightId) li.classList.add("is-new");
    li.innerHTML = `
      <span class="rank">${index + 1}</span>
      <span class="name" title="${entry.name}">${entry.name}</span>
      <span class="pts">${entry.score}</span>
    `;
    leaderboardEl.appendChild(li);
  });
}

function qualifiesForBoard(points) {
  const board = getLeaderboard();
  return board.length < MAX_SCORES || points > board[board.length - 1].score;
}

function submitScore(name, points) {
  const trimmed = name.trim().slice(0, 16) || "Jogador";
  localStorage.setItem(NAME_KEY, trimmed);

  const entry = {
    id: crypto.randomUUID(),
    name: trimmed,
    score: points,
    level,
    date: new Date().toISOString(),
  };

  const board = getLeaderboard();
  board.push(entry);
  board.sort((a, b) => b.score - a.score);
  saveLeaderboard(board);
  renderLeaderboard(entry.id);
  bestEl.textContent = getBestScore();
  return entry;
}

function showNameForm(points) {
  pendingScoreEntry = points;
  nameForm.classList.remove("hidden");
  nameInput.value = localStorage.getItem(NAME_KEY) || "";
  nameInput.focus();
  statusEl.textContent = `Novo recorde! ${points} pts — salve seu nome no ranking.`;
}

function hideNameForm() {
  pendingScoreEntry = null;
  nameForm.classList.add("hidden");
}

function handleScoreEnd(points) {
  if (points <= 0 || !qualifiesForBoard(points)) {
    hideNameForm();
    return;
  }
  showNameForm(points);
}

function parseMaze() {
  grid = [];
  dotsLeft = 0;

  for (let y = 0; y < MAZE.length; y++) {
    const row = [];
    const line = MAZE[y].padEnd(COLS, "#").slice(0, COLS);
    for (let x = 0; x < line.length; x++) {
      const ch = line[x];
      if (ch === "#") row.push(WALL);
      else if (ch === ".") { row.push(DOT); dotsLeft++; }
      else if (ch === "o") { row.push(POWER); dotsLeft++; }
      else if (ch === "-") row.push(DOOR);
      else row.push(EMPTY);
    }
    grid.push(row);
  }
}

function tileCenter(x, y) {
  return { cx: x * TILE + TILE / 2, cy: y * TILE + TILE / 2 };
}

function isWall(tx, ty) {
  if (ty < 0 || ty >= ROWS) return true;
  if (tx < 0 || tx >= COLS) return false;
  const cell = grid[ty][tx];
  return cell === WALL;
}

function isWalkable(tx, ty) {
  if (ty < 0 || ty >= ROWS) return false;
  if (tx < 0 || tx >= COLS) return ty === TUNNEL_ROW;
  const cell = grid[ty][tx];
  return cell !== WALL;
}

function canMoveFrom(tx, ty, dir) {
  return isWalkable(tx + dir.x, ty + dir.y);
}

function nearCenter(entity) {
  const tx = Math.round(entity.x);
  const ty = Math.round(entity.y);
  return Math.abs(entity.x - tx) < TURN_EPS && Math.abs(entity.y - ty) < TURN_EPS;
}

function snapToCenter(entity) {
  entity.x = Math.round(entity.x);
  entity.y = Math.round(entity.y);
}

function applyTunnel(entity) {
  if (Math.round(entity.y) !== TUNNEL_ROW) return;
  if (entity.x < -0.4) entity.x = COLS - 0.6;
  if (entity.x > COLS - 0.6) entity.x = -0.4;
}

function getTargetTile(ghost) {
  if (frightenedTimer > 0) return null;

  const px = Math.round(pacman.x);
  const py = Math.round(pacman.y);

  if (ghost.mode === "scatter") {
    const corners = [
      { x: COLS - 2, y: 1 },
      { x: 1, y: 1 },
      { x: COLS - 2, y: ROWS - 2 },
      { x: 1, y: ROWS - 2 },
    ];
    return corners[ghosts.indexOf(ghost) % corners.length];
  }

  if (ghost.mode === "random") {
    return {
      x: Math.floor(Math.random() * COLS),
      y: Math.floor(Math.random() * ROWS),
    };
  }

  return { x: px, y: py };
}

function chooseGhostDir(ghost) {
  const options = [DIR.up, DIR.down, DIR.left, DIR.right].filter((d) => {
    if (d.x === -ghost.dir.x && d.y === -ghost.dir.y && ghost.dir !== DIR.none) return false;
    return canMoveFrom(Math.round(ghost.x), Math.round(ghost.y), d);
  });

  if (!options.length) return ghost.dir;

  if (frightenedTimer > 0) {
    return options[Math.floor(Math.random() * options.length)];
  }

  const target = getTargetTile(ghost);
  if (!target) {
    return options[Math.floor(Math.random() * options.length)];
  }

  let best = options[0];
  let bestDist = Infinity;
  for (const d of options) {
    const nx = Math.round(ghost.x) + d.x;
    const ny = Math.round(ghost.y) + d.y;
    const dist = (target.x - nx) ** 2 + (target.y - ny) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

function createGhosts() {
  ghosts = GHOST_DEFS.map((def, i) => ({
    x: GHOST_HOME.x + (i - 1.5) * 0.6,
    y: GHOST_HOME.y,
    dir: DIR.up,
    color: def.color,
    mode: def.mode,
    speed: ghostBaseSpeed + level * 0.006,
    state: "house",
    releaseTimer: def.releaseDelay,
    bounce: 0,
  }));
}

function resetPositions() {
  pacman.x = PAC_START.x;
  pacman.y = PAC_START.y;
  pacman.dir = DIR.left;
  pacman.nextDir = DIR.left;
  createGhosts();
}

function eatPellet(tx, ty) {
  const cell = grid[ty]?.[tx];
  if (cell === DOT) {
    grid[ty][tx] = EMPTY;
    dotsLeft--;
    score += 10;
  } else if (cell === POWER) {
    grid[ty][tx] = EMPTY;
    dotsLeft--;
    score += 50;
    frightenedTimer = 360;
    for (const g of ghosts) {
      if (g.state === "active") g.dir = DIR.left;
    }
  }
}

function tryTurn(entity, nextDir, currentDir) {
  if (nearCenter(entity)) {
    snapToCenter(entity);
    if (nextDir !== DIR.none && canMoveFrom(entity.x, entity.y, nextDir)) {
      return nextDir;
    }
    if (currentDir !== DIR.none && canMoveFrom(entity.x, entity.y, currentDir)) {
      return currentDir;
    }
    return DIR.none;
  }
  return currentDir;
}

function moveEntity(entity, speed) {
  if (entity.dir === DIR.none) return;
  entity.x += entity.dir.x * speed;
  entity.y += entity.dir.y * speed;
  applyTunnel(entity);

  const aheadX = entity.x + entity.dir.x * 0.45;
  const aheadY = entity.y + entity.dir.y * 0.45;
  if (!isWalkable(Math.round(aheadX), Math.round(aheadY))) {
    snapToCenter(entity);
    entity.dir = DIR.none;
  }
}

function updatePacman() {
  pacman.dir = tryTurn(pacman, pacman.nextDir, pacman.dir);
  moveEntity(pacman, pacSpeed);

  if (nearCenter(pacman)) {
    snapToCenter(pacman);
    eatPellet(pacman.x, pacman.y);
  }

  pacman.mouth = (pacman.mouth + 0.3) % (Math.PI * 2);
}

function updateGhostHouse(ghost) {
  ghost.bounce += 0.08;
  ghost.y = GHOST_HOME.y + Math.sin(ghost.bounce) * 0.15;

  if (ghost.releaseTimer > 0) {
    ghost.releaseTimer--;
    return;
  }

  ghost.state = "exiting";
  ghost.x = GHOST_DOOR.x;
  ghost.y = GHOST_HOME.y;
  ghost.dir = DIR.up;
}

function updateGhost(ghost) {
  if (ghost.state === "house") {
    updateGhostHouse(ghost);
    return;
  }

  if (ghost.state === "exiting") {
    ghost.dir = DIR.up;
    moveEntity(ghost, ghost.speed * 0.9);
    if (ghost.y <= GHOST_DOOR.y + 0.1) {
      snapToCenter(ghost);
      ghost.y = GHOST_DOOR.y;
      ghost.state = "active";
      ghost.dir = chooseGhostDir(ghost);
    }
    return;
  }

  if (nearCenter(ghost)) {
    snapToCenter(ghost);
    if (frame % 2 === 0) ghost.dir = chooseGhostDir(ghost);
  }

  const spd = frightenedTimer > 0 ? ghost.speed * 0.5 : ghost.speed;
  moveEntity(ghost, spd);

  const dist = Math.hypot(pacman.x - ghost.x, pacman.y - ghost.y);
  if (dist < 0.42) {
    if (frightenedTimer > 0 && ghost.state === "active") {
      ghost.state = "house";
      ghost.x = GHOST_HOME.x;
      ghost.y = GHOST_HOME.y;
      ghost.releaseTimer = 180;
      ghost.dir = DIR.up;
      score += 200;
    } else if (ghost.state === "active") {
      loseLife();
    }
  }
}

function updateGhosts() {
  for (const ghost of ghosts) updateGhost(ghost);
}

function loseLife() {
  lives--;
  updateHud();
  if (lives <= 0) {
    gameOver();
    return;
  }
  respawnPause = 90;
  statusEl.textContent = "Você perdeu uma vida!";
  resetPositions();
}

function nextLevel() {
  level++;
  pacSpeed = Math.min(0.11, pacSpeed + 0.004);
  ghostBaseSpeed = Math.min(0.095, ghostBaseSpeed + 0.004);
  frightenedTimer = 0;
  statusEl.textContent = `Nível ${level}!`;
  parseMaze();
  resetPositions();
  respawnPause = 60;
  updateHud();
}

function gameOver() {
  started = false;
  respawnPause = 0;
  const finalScore = score;
  statusEl.textContent = `Game Over — ${finalScore} pts. Pressione uma seta para reiniciar.`;
  handleScoreEnd(finalScore);
}

function updateHud() {
  scoreEl.textContent = score;
  livesEl.textContent = lives;
  levelEl.textContent = level;
  bestEl.textContent = getBestScore();
}

function drawMaze() {
  ctx.fillStyle = THEME.canvasBg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const px = x * TILE;
      const py = y * TILE;
      const cell = grid[y][x];

      if (cell === WALL) {
        ctx.fillStyle = THEME.wall;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.strokeStyle = THEME.wallStroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2);
      } else if (cell === DOOR) {
        ctx.fillStyle = THEME.door;
        ctx.fillRect(px, py + TILE / 2 - 2, TILE, 4);
      } else if (cell === DOT) {
        ctx.fillStyle = THEME.dot;
        ctx.beginPath();
        ctx.arc(px + TILE / 2, py + TILE / 2, 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (cell === POWER) {
        const pulse = 4 + Math.sin(frame * 0.12) * 1.2;
        ctx.fillStyle = frightenedTimer > 0 && Math.floor(frame / 12) % 2
          ? THEME.powerFlash
          : THEME.power;
        ctx.beginPath();
        ctx.arc(px + TILE / 2, py + TILE / 2, pulse, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawPacman() {
  const { cx, cy } = tileCenter(pacman.x, pacman.y);
  let angle = 0;
  if (pacman.dir === DIR.right) angle = 0;
  if (pacman.dir === DIR.left) angle = Math.PI;
  if (pacman.dir === DIR.up) angle = -Math.PI / 2;
  if (pacman.dir === DIR.down) angle = Math.PI / 2;

  const open = pacman.dir === DIR.none ? 0.15 : 0.25 + Math.abs(Math.sin(pacman.mouth)) * 0.35;
  ctx.fillStyle = THEME.pacman;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, TILE / 2 - 2, angle + open, angle - open, true);
  ctx.closePath();
  ctx.fill();
}

function drawGhosts() {
  for (const ghost of ghosts) {
    const { cx, cy } = tileCenter(ghost.x, ghost.y);
    const r = TILE / 2 - 2;
    const scared = frightenedTimer > 0 && ghost.state === "active";

    ctx.fillStyle = scared ? THEME.frightened : ghost.color;
    ctx.beginPath();
    ctx.arc(cx, cy - 2, r, Math.PI, 0);
    ctx.lineTo(cx + r, cy + r);
    for (let i = 0; i < 4; i++) {
      const sx = cx + r - (i * (2 * r)) / 3;
      ctx.lineTo(sx, cy + r - (i % 2 === 0 ? 4 : 0));
    }
    ctx.closePath();
    ctx.fill();

    if (!scared) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(cx - 4, cy - 2, 3.2, 0, Math.PI * 2);
      ctx.arc(cx + 4, cy - 2, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = THEME.ghostEyes;
      const ex = ghost.dir.x * 1.5;
      const ey = ghost.dir.y * 1.5;
      ctx.beginPath();
      ctx.arc(cx - 4 + ex, cy - 2 + ey, 1.6, 0, Math.PI * 2);
      ctx.arc(cx + 4 + ex, cy - 2 + ey, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawLives() {
  for (let i = 0; i < lives; i++) {
    const x = 16 + i * 18;
    const y = canvas.height - 10;
    ctx.fillStyle = THEME.pacman;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0.3, Math.PI * 2 - 0.3);
    ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
  }
}

function draw() {
  drawMaze();
  drawPacman();
  drawGhosts();
  drawLives();
}

function tick() {
  frame++;

  if (started) {
    if (respawnPause > 0) {
      respawnPause--;
      if (respawnPause === 0) statusEl.textContent = "Boa sorte!";
    } else {
      updatePacman();
      updateGhosts();
      if (frightenedTimer > 0) frightenedTimer--;
      if (dotsLeft <= 0) nextLevel();
      updateHud();
    }
  }

  draw();
  requestAnimationFrame(tick);
}

function startGame() {
  if (lives <= 0) {
    hideNameForm();
    score = 0;
    lives = 3;
    level = 1;
    pacSpeed = 0.085;
    ghostBaseSpeed = 0.07;
    parseMaze();
    updateHud();
  }
  resetPositions();
  started = true;
  respawnPause = 0;
  if (!pendingScoreEntry) statusEl.textContent = "Boa sorte!";
}

function setDirection(dir) {
  pacman.nextDir = dir;
  if (!started) startGame();
}

const keyMap = {
  ArrowUp: DIR.up,
  ArrowDown: DIR.down,
  ArrowLeft: DIR.left,
  ArrowRight: DIR.right,
  w: DIR.up,
  s: DIR.down,
  a: DIR.left,
  d: DIR.right,
  W: DIR.up,
  S: DIR.down,
  A: DIR.left,
  D: DIR.right,
};

document.addEventListener("keydown", (e) => {
  const dir = keyMap[e.key];
  if (!dir) return;
  e.preventDefault();
  setDirection(dir);
});

document.querySelectorAll(".controls-mobile button").forEach((btn) => {
  btn.addEventListener("click", () => setDirection(DIR[btn.dataset.dir]));
});

nameForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (pendingScoreEntry === null) return;
  submitScore(nameInput.value, pendingScoreEntry);
  hideNameForm();
  statusEl.textContent = "Pontuação salva! Pressione uma seta para jogar de novo.";
});

clearScoresBtn.addEventListener("click", () => {
  if (!confirm("Limpar todo o ranking local deste navegador?")) return;
  localStorage.removeItem(SCORE_KEY);
  hideNameForm();
  renderLeaderboard();
  bestEl.textContent = 0;
  statusEl.textContent = "Ranking limpo.";
});

parseMaze();
resetPositions();
renderLeaderboard();
updateHud();
tick();
