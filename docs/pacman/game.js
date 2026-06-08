const TILE = 20;
const SCORE_KEY = "pacdev-leaderboard-v1";
const NAME_KEY = "pacdev-player-name";
const MAX_SCORES = 10;

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
  "     #.##### ## #####.#     ",
  "     #.##          ##.#     ",
  "     #.## ###--### ##.#     ",
  "######.## #      # ##.######",
  "      .   #      #   .      ",
  "######.## #      # ##.######",
  "     #.## ######## ##.#     ",
  "     #.##          ##.#     ",
  "     #.## ######## ##.#     ",
  "######.## ######## ##.######",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#.####.#####.##.#####.####.#",
  "#o..##.......  .......##..o#",
  "###.##.##.########.##.##.###",
  "#......##....##....##......#",
  "#.##########.##.##########.#",
  "#..........................#",
  "############################",
];

const WALL = 0;
const DOT = 1;
const POWER = 2;
const EMPTY = 3;

const DIR = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  none: { x: 0, y: 0 },
};

const GHOST_COLORS = ["#f43f5e", "#38bdf8", "#34d399", "#fb923c"];

let grid = [];
let dotsLeft = 0;
let score = 0;
let lives = 3;
let level = 1;
let started = false;
let frightenedTimer = 0;
let pendingScoreEntry = null;

const pacman = {
  x: 14,
  y: 23,
  dir: DIR.none,
  nextDir: DIR.none,
  mouth: 0,
  speed: 0.12,
};

let ghosts = [];

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

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
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
    for (let x = 0; x < MAZE[y].length; x++) {
      const ch = MAZE[y][x];
      if (ch === "#") row.push(WALL);
      else if (ch === ".") { row.push(DOT); dotsLeft++; }
      else if (ch === "o") { row.push(POWER); dotsLeft++; }
      else row.push(EMPTY);
    }
    grid.push(row);
  }
}

function resetPositions() {
  pacman.x = 14;
  pacman.y = 23;
  pacman.dir = DIR.none;
  pacman.nextDir = DIR.none;

  const starts = [
    { x: 13, y: 14 },
    { x: 14, y: 14 },
    { x: 15, y: 14 },
    { x: 16, y: 14 },
  ];

  ghosts = starts.map((pos, i) => ({
    x: pos.x,
    y: pos.y,
    dir: [DIR.left, DIR.right, DIR.up, DIR.down][i % 4],
    color: GHOST_COLORS[i % GHOST_COLORS.length],
    speed: 0.07 + level * 0.008,
    inHouse: true,
    releaseTimer: 60 + i * 40,
  }));
}

function tileCenter(x, y) {
  return { cx: x * TILE + TILE / 2, cy: y * TILE + TILE / 2 };
}

function isWall(tx, ty) {
  if (ty < 0 || ty >= grid.length) return true;
  if (tx < 0 || tx >= grid[0].length) return true;
  return grid[ty][tx] === WALL;
}

function canMove(x, y, dir) {
  const nx = Math.round(x + dir.x * 0.5);
  const ny = Math.round(y + dir.y * 0.5);
  return !isWall(nx, ny);
}

function aligned(entity) {
  const dx = Math.abs(entity.x - Math.round(entity.x));
  const dy = Math.abs(entity.y - Math.round(entity.y));
  return dx < 0.08 && dy < 0.08;
}

function wrap(entity) {
  if (entity.x < -0.5) entity.x = grid[0].length - 0.5;
  if (entity.x > grid[0].length - 0.5) entity.x = -0.5;
}

function chooseGhostDir(ghost) {
  const options = [DIR.up, DIR.down, DIR.left, DIR.right].filter((d) => {
    if (d.x === -ghost.dir.x && d.y === -ghost.dir.y) return false;
    return canMove(ghost.x, ghost.y, d);
  });

  if (!options.length) return ghost.dir;
  if (frightenedTimer > 0) {
    return options[Math.floor(Math.random() * options.length)];
  }

  let best = options[0];
  let bestDist = Infinity;
  for (const d of options) {
    const nx = Math.round(ghost.x) + d.x;
    const ny = Math.round(ghost.y) + d.y;
    const dist = (pacman.x - nx) ** 2 + (pacman.y - ny) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

function updatePacman() {
  if (aligned(pacman)) {
    pacman.x = Math.round(pacman.x);
    pacman.y = Math.round(pacman.y);

    if (canMove(pacman.x, pacman.y, pacman.nextDir)) {
      pacman.dir = pacman.nextDir;
    } else if (!canMove(pacman.x, pacman.y, pacman.dir)) {
      pacman.dir = DIR.none;
    }

    const tx = Math.round(pacman.x);
    const ty = Math.round(pacman.y);
    const cell = grid[ty]?.[tx];
    if (cell === DOT) {
      grid[ty][tx] = EMPTY;
      dotsLeft--;
      score += 10;
    } else if (cell === POWER) {
      grid[ty][tx] = EMPTY;
      dotsLeft--;
      score += 50;
      frightenedTimer = 280;
    }
  }

  if (pacman.dir !== DIR.none) {
    pacman.x += pacman.dir.x * pacman.speed;
    pacman.y += pacman.dir.y * pacman.speed;
    wrap(pacman);
  }

  pacman.mouth = (pacman.mouth + 0.25) % (Math.PI * 2);
}

function updateGhosts() {
  for (const ghost of ghosts) {
    if (ghost.inHouse) {
      ghost.releaseTimer--;
      if (ghost.releaseTimer <= 0) ghost.inHouse = false;
      continue;
    }

    if (aligned(ghost)) {
      ghost.x = Math.round(ghost.x);
      ghost.y = Math.round(ghost.y);
      ghost.dir = chooseGhostDir(ghost);
    }

    const spd = frightenedTimer > 0 ? ghost.speed * 0.55 : ghost.speed;
    ghost.x += ghost.dir.x * spd;
    ghost.y += ghost.dir.y * spd;
    wrap(ghost);

    const dist = Math.hypot(pacman.x - ghost.x, pacman.y - ghost.y);
    if (dist < 0.55) {
      if (frightenedTimer > 0) {
        ghost.x = 14;
        ghost.y = 14;
        ghost.inHouse = true;
        ghost.releaseTimer = 90;
        score += 200;
      } else {
        loseLife();
        return;
      }
    }
  }
}

function loseLife() {
  lives--;
  updateHud();
  if (lives <= 0) {
    gameOver();
    return;
  }
  statusEl.textContent = "Você perdeu uma vida! Continue...";
  resetPositions();
  started = false;
}

function nextLevel() {
  level++;
  pacman.speed = Math.min(0.18, pacman.speed + 0.008);
  statusEl.textContent = `Nível ${level}! Boa sorte.`;
  parseMaze();
  resetPositions();
  updateHud();
}

function gameOver() {
  started = false;
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

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const px = x * TILE;
      const py = y * TILE;
      if (grid[y][x] === WALL) {
        ctx.fillStyle = THEME.wall;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.strokeStyle = THEME.wallStroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2);
      } else if (grid[y][x] === DOT) {
        ctx.fillStyle = THEME.dot;
        ctx.beginPath();
        ctx.arc(px + TILE / 2, py + TILE / 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (grid[y][x] === POWER) {
        ctx.fillStyle = frightenedTimer > 0 && Math.floor(Date.now() / 200) % 2
          ? THEME.powerFlash
          : THEME.power;
        ctx.beginPath();
        ctx.arc(px + TILE / 2, py + TILE / 2, 5, 0, Math.PI * 2);
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

  const open = 0.35 + Math.sin(pacman.mouth) * 0.2;
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
    const scared = frightenedTimer > 0;

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
      ctx.arc(cx - 4, cy - 2, 3.5, 0, Math.PI * 2);
      ctx.arc(cx + 4, cy - 2, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = THEME.ghostEyes;
      ctx.beginPath();
      ctx.arc(cx - 4 + ghost.dir.x, cy - 2 + ghost.dir.y, 1.8, 0, Math.PI * 2);
      ctx.arc(cx + 4 + ghost.dir.x, cy - 2 + ghost.dir.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function draw() {
  drawMaze();
  drawPacman();
  drawGhosts();
}

function tick() {
  if (started) {
    updatePacman();
    updateGhosts();
    if (frightenedTimer > 0) frightenedTimer--;
    if (dotsLeft <= 0) nextLevel();
    updateHud();
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
    pacman.speed = 0.12;
    parseMaze();
    updateHud();
  }
  resetPositions();
  started = true;
  if (!pendingScoreEntry) {
    statusEl.textContent = "Boa sorte!";
  }
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
