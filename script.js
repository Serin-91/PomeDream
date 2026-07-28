// ===== 게임 상태 =====
// ready -> countdown -> playing -> gameOver -> (재시작) -> countdown -> ...
let gameState = "ready";

const GAME_DURATION = 45;

let score = 0;
let goldenCount = 0; // 황금 뼈다귀 획득 개수
let hearts = 3;
let timeLeft = GAME_DURATION;
let finished = false;
let phase15Shown = false;
let phase30Shown = false;

let countdownTimerId = null;
let gameTimerId = null;
let physicsRafId = null;

// ===== 캐릭터 점프/중력 =====
const GRAVITY = 2200; // px/s^2
const JUMP_VELOCITY = 700; // px/s (위로)
const GROUND_RATIO = 0.46; // 발판의 bottom 비율 (HUD를 제외한 플레이 영역의 중간)

let velocityY = 0;
let jumpOffset = 0; // 발판 기준 위로 올라간 거리(px)
let isOnGround = true;
let lastPhysicsTime = null;

// ===== 화면 요소 =====
const screens = {
  ready: document.getElementById("screen-ready"),
  countdown: document.getElementById("screen-countdown"),
  playing: document.getElementById("screen-playing"),
  gameOver: document.getElementById("screen-gameover"),
};

const btnStart = document.getElementById("btn-start");
const btnRestart = document.getElementById("btn-restart");
const countdownNumberEl = document.getElementById("countdown-number");

const hudScoreEl = document.getElementById("hud-score");
const hudGoldenEl = document.getElementById("hud-treats");
const hudHeartsEl = document.getElementById("hud-hearts");
const hudTimeEl = document.getElementById("hud-time");

const resultScoreEl = document.getElementById("result-score");
const resultGoldenEl = document.getElementById("result-treats");
const resultHeartsEl = document.getElementById("result-hearts");
const resultFinishedEl = document.getElementById("result-finished");
const resultGradeEl = document.getElementById("result-grade");

const gameShellEl = document.getElementById("game-shell");
const gameContainerEl = document.getElementById("game-container");
const stageEl = document.getElementById("stage");
const characterEl = document.getElementById("character");
const characterVisualEl = document.getElementById("character-visual");
const platformsEl = document.getElementById("platforms");
const itemsEl = document.getElementById("items");
const hazardsEl = document.getElementById("hazards");
const bgTile1El = document.getElementById("bg-tile-1");
const bgTile2El = document.getElementById("bg-tile-2");
const bgTile3El = document.getElementById("bg-tile-3");
const scorePopupsEl = document.getElementById("score-popups");
const resultCharImgEl = document.getElementById("result-char-img");
const phaseAnnounceEl = document.getElementById("phase-announce");

const GAME_VIEW_WIDTH = 960;
const GAME_VIEW_HEIGHT = 540;

const SPRITES = {
  idle: "images/캐릭터_Idle.png",
  run: "images/캐릭터_Run.png",
  jump: "images/캐릭터_Jump.png",
  hurt: "images/캐릭터_Hurt.png",
  win: "images/캐릭터_Win.png",
  gameover: "images/캐릭터_Gameover.png",
};

Object.values(SPRITES).forEach((src) => {
  const img = new Image();
  img.src = src;
});

// ===== 횡스크롤 =====
let SCROLL_SPEED = 300; // px/s, 시간 구간에 따라 매 프레임 갱신되는 실제 속도 (초기값 = 0~15초 구간 값)
const PLATFORM_WIDTH = 240;

// 구름 틈: 있을 때도, 없을 때도 있도록 확률로 결정. 점프는 한 번뿐이므로
// 점프 체공시간(약 0.64초 = 240px/s * 0.64 ≈ 153px) 안에 건널 수 있는 폭으로 제한한다.
// 시간 구간별로 등장 확률을 점진적으로 높여서(초반<중반<후반) 난이도가 서서히 올라가게 한다.
const GAP_CHANCE_EARLY = 0.6; // 0~15초
const GAP_CHANCE_MID = 0.72; // 15~30초
const GAP_CHANCE_LATE = 0.82; // 30~45초 (너무 불가능해지지 않도록 상한을 둠)
const GAP_WIDTH = 110;
const MIN_TILES_BETWEEN_GAPS = 1; // 틈 사이 최소 발판 간격 (착지 불가능한 연쇄 방지)
const MAX_CONSECUTIVE_GAPS = 2; // 틈은 최대 2회까지만 연속 생성, 그 다음엔 반드시 일반 발판

let platforms = []; // { el, x, width }
let tilesSinceGap = 0;
let consecutiveGapCount = 0;
let lastTileHadHazard = false;
let bgOffset = 0;

// ===== 간식 아이템 =====
const ITEM_SIZE = 44;
const ITEM_HEIGHT_ABOVE_GROUND = 130; // px, 캐릭터 기준 더 높은 위치(점프 정점 부근)에서 닿도록 조정
const ITEM_SCORE = 10; // 별 간식
const GOLDEN_SIZE = 46;
const GOLDEN_SCORE = 25; // 황금 뼈다귀 (희귀 보너스)
const HEART_PENALTY = 80; // 피해 감점
const GUARANTEED_GOLDEN_SPAWN_TIMES = [6, 14, 22, 31, 39]; // 전설 등급 도전 기회 보장용 출현 시점
const CHAR_HITBOX_WIDTH = 55;
const CHAR_HITBOX_HEIGHT = 58;
const CHAR_GROUND_OFFSET = 26; // 캐릭터를 구름 발판 위쪽(뭉게구름 위)에 서 있는 것처럼 살짝 띄움

let items = []; // { el, x, collected, type }
let guaranteedGoldenSpawnIndex = 0;

// ===== 위험 요소 (번개 구름) =====
const HAZARD_SIZE = 38; // 시각적 크기
const HAZARD_HITBOX_SIZE = 22; // 실제 충돌 판정은 그림보다 살짝 관대하게 좁힘
const HAZARD_HEIGHT = 58; // 이 높이보다 낮게 점프하면 충돌 (기존 72 → 더 낮은 점프로도 회피 가능하게 완화)
const INVINCIBLE_DURATION = 1000;

let hazards = []; // { el, x }
let isInvincible = false;
let invincibleTimeoutId = null;

// ===== 등장 확률 (시간 구간별) =====
// 시작 직후 SAFE_START_SECONDS 동안은 번개 구름 없이 간식만 등장 (기획안 9번 항목 "초반 조작 적응 구간"과 동일한 취지)
const SAFE_START_SECONDS = 3;
const SPAWN_PHASES = [
  { untilElapsed: 15, hazard: 0.17, item: 0.6, golden: 0.1 }, // 초반
  { untilElapsed: 30, hazard: 0.25, item: 0.55, golden: 0.14 }, // 중반
  { untilElapsed: GAME_DURATION, hazard: 0.33, item: 0.5, golden: 0.18 }, // 후반
];

function getSpawnRates() {
  const elapsed = GAME_DURATION - timeLeft;
  if (elapsed < SAFE_START_SECONDS) {
    return { hazard: 0, item: 0.65, golden: 0.08 };
  }
  const phase = SPAWN_PHASES.find((p) => elapsed < p.untilElapsed) || SPAWN_PHASES[SPAWN_PHASES.length - 1];
  return { hazard: phase.hazard, item: phase.item, golden: phase.golden };
}

// 구름 틈 등장 확률: 초반(0~15초) < 중반(15~30초) < 후반(30~45초) 순으로 점진 증가
function getGapChance(elapsed) {
  if (elapsed < 15) return GAP_CHANCE_EARLY;
  if (elapsed < 30) return GAP_CHANCE_MID;
  return GAP_CHANCE_LATE;
}

// 장애물(발판/아이템 등) 이동 속도: 초반 276 → 중반 324 → 후반 352 px/s로 점진 증가
const SCROLL_SPEED_EARLY = 300;
const SCROLL_SPEED_MID = 334;
const SCROLL_SPEED_LATE = 372;

function updateScrollSpeedForPhase() {
  const elapsed = GAME_DURATION - timeLeft;
  if (elapsed >= 30) {
    SCROLL_SPEED = SCROLL_SPEED_LATE;
  } else if (elapsed >= 15) {
    SCROLL_SPEED = SCROLL_SPEED_MID;
  } else {
    SCROLL_SPEED = SCROLL_SPEED_EARLY;
  }
}

// ===== 사운드 (효과음/배경음, Web Audio API로 직접 생성) =====
let soundOn = true;
let audioCtx = null;
let bgmTimeoutId = null;
let audioUnlockPromise = null;

function ensureAudio() {
  try {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtxClass) return false;
    if (!audioCtx) {
      audioCtx = new AudioCtxClass();
    }
    if (audioCtx.state === "suspended") {
      const resumePromise = audioCtx.resume();
      if (resumePromise && typeof resumePromise.catch === "function") {
        resumePromise.catch(() => {});
      }
    }
    return true;
  } catch (err) {
    console.warn("Audio initialization skipped.", err);
    return false;
  }
}

async function unlockAudio() {
  if (!ensureAudio() || !audioCtx) return false;
  if (audioCtx.state !== "suspended") return audioCtx.state === "running";

  if (!audioUnlockPromise) {
    audioUnlockPromise = audioCtx
      .resume()
      .catch((err) => {
        console.warn("Audio resume skipped.", err);
        return false;
      })
      .finally(() => {
        audioUnlockPromise = null;
      });
  }

  await audioUnlockPromise;
  return audioCtx && audioCtx.state === "running";
}

function playTone(freq, startTime, duration, type, peakVolume) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakVolume, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.03);
}

function playSweep(startFreq, endFreq, startTime, duration, type, peakVolume) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, startTime);
  osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakVolume, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration + 0.02);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
}

function playNoiseBurst(startTime, duration, volume, filterFreq) {
  const bufferSize = Math.max(1, Math.floor(audioCtx.sampleRate * duration));
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;

  const filter = audioCtx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = filterFreq;
  filter.Q.value = 0.8;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  noise.connect(filter).connect(gain).connect(audioCtx.destination);
  noise.start(startTime);
  noise.stop(startTime + duration + 0.02);
}

function playJumpSound() {
  if (!soundOn) return;
  if (!ensureAudio()) return;
  const t = audioCtx.currentTime;
  playTone(500, t, 0.1, "triangle", 0.14);
  playTone(760, t + 0.05, 0.12, "triangle", 0.12);
}

function playStarSound() {
  if (!soundOn) return;
  if (!ensureAudio()) return;
  const t = audioCtx.currentTime;
  playTone(880, t, 0.1, "sine", 0.18);
  playTone(1320, t + 0.07, 0.14, "sine", 0.16);
}

function playGoldenSound() {
  if (!soundOn) return;
  if (!ensureAudio()) return;
  const t = audioCtx.currentTime;
  // 화려한 상승 아르페지오
  [784, 988, 1175, 1568, 1976].forEach((f, i) => playTone(f, t + i * 0.055, 0.22, "triangle", 0.2));
  // 위에 얹는 반짝이는 화음
  [1568, 1976, 2349].forEach((f, i) => playTone(f, t + 0.26 + i * 0.05, 0.32, "sine", 0.12));
}

function playHurtSound() {
  if (!soundOn) return;
  if (!ensureAudio()) return;
  const t = audioCtx.currentTime;
  playTone(220, t, 0.16, "sawtooth", 0.15);
  playTone(140, t + 0.08, 0.2, "sawtooth", 0.13);
}

function playFallSound() {
  if (!soundOn) return;
  if (!ensureAudio()) return;
  const t = audioCtx.currentTime;
  playSweep(520, 130, t, 0.35, "sine", 0.16);
}

function playWinSound() {
  if (!soundOn) return;
  if (!ensureAudio()) return;
  const t = audioCtx.currentTime;

  // 화성이 실린 팡파레 (삼화음 상승 진행, 마지막이 클라이맥스)
  const chords = [
    [523.25, 659.25, 784.0], // C
    [587.33, 739.99, 880.0], // D
    [659.25, 830.61, 987.77], // E
    [783.99, 987.77, 1174.66], // G (클라이맥스)
  ];
  chords.forEach((chord, i) => {
    const start = t + i * 0.22;
    const isClimax = i === chords.length - 1;
    chord.forEach((f) => playTone(f, start, isClimax ? 0.6 : 0.32, isClimax ? "triangle" : "square", 0.1));
  });

  // 고급스러운 박수 텍스처 (밴드패스 노이즈 버스트를 살짝 랜덤한 타이밍으로)
  for (let i = 0; i < 7; i++) {
    playNoiseBurst(t + 0.18 + i * 0.085 + Math.random() * 0.02, 0.09, 0.05, 2600 + Math.random() * 900);
  }

  // 마무리 반짝임
  [1568, 1976, 2349, 3136].forEach((f, i) => playTone(f, t + 1.0 + i * 0.09, 0.35, "sine", 0.1));
}

function playGameOverSound() {
  if (!soundOn) return;
  if (!ensureAudio()) return;
  const t = audioCtx.currentTime;
  [400, 320, 240, 180].forEach((f, i) => playTone(f, t + i * 0.15, 0.32, "sawtooth", 0.14));
}

function playStartChime() {
  if (!soundOn) return;
  if (!ensureAudio()) return;
  const t = audioCtx.currentTime;
  playTone(660, t, 0.12, "sine", 0.15);
  playTone(990, t + 0.1, 0.18, "sine", 0.15);
}

function playCountdownTick() {
  if (!soundOn) return;
  if (!ensureAudio()) return;
  const t = audioCtx.currentTime;
  playTone(440, t, 0.12, "square", 0.12);
}

function playCountdownGo() {
  if (!soundOn) return;
  if (!ensureAudio()) return;
  const t = audioCtx.currentTime;
  playTone(660, t, 0.1, "square", 0.14);
  playTone(880, t + 0.09, 0.28, "triangle", 0.18);
}

// 따뜻한 저음 패드 + 반짝이는 고음 레이어를 겹쳐서 "반짝반짝하고 따뜻한" 느낌을 낸다
const BGM_PAD_NOTES = [261.63, 293.66, 329.63, 392.0, 440.0, 392.0, 329.63, 293.66]; // C D E G A G E D
const BGM_SPARKLE_NOTES = [1046.5, 1318.5, 1567.98, 1318.5]; // C6 E6 G6 E6

function scheduleBgmStep(i) {
  if (!soundOn || gameState !== "playing") {
    bgmTimeoutId = null;
    return;
  }
  if (!ensureAudio()) return;
  const t = audioCtx.currentTime;
  playTone(BGM_PAD_NOTES[i % BGM_PAD_NOTES.length], t, 1.1, "sine", 0.045);
  playTone(BGM_SPARKLE_NOTES[i % BGM_SPARKLE_NOTES.length], t + 0.06, 0.4, "triangle", 0.032);
  bgmTimeoutId = setTimeout(() => scheduleBgmStep(i + 1), 650);
}

function startBgm() {
  stopBgm();
  scheduleBgmStep(0);
}

function stopBgm() {
  if (bgmTimeoutId !== null) {
    clearTimeout(bgmTimeoutId);
    bgmTimeoutId = null;
  }
}

function setSoundOn(value) {
  soundOn = value;
  const icon = soundOn ? "🔊" : "🔇";
  document.getElementById("btn-sound-ready").textContent = icon;
  document.getElementById("btn-sound-playing").textContent = icon;
  if (!soundOn) {
    stopBgm();
  } else if (gameState === "playing") {
    startBgm();
  }
}

function showScreen(name) {
  Object.values(screens).forEach((el) => el.classList.add("hidden"));
  screens[name].classList.remove("hidden");
  updateMobileHint();
}

function updateHud() {
  hudScoreEl.textContent = score;
  hudGoldenEl.textContent = goldenCount;
  hudHeartsEl.textContent = hearts;
  hudTimeEl.textContent = timeLeft;
}

function resetGameData() {
  score = 0;
  goldenCount = 0;
  guaranteedGoldenSpawnIndex = 0;
  hearts = 3;
  timeLeft = GAME_DURATION;
  finished = false;
  phase15Shown = false;
  phase30Shown = false;
  phaseAnnounceEl.classList.remove("show");
  updateHud();
}

// 난이도 구간 전환 안내 문구 (한 번만, 약 1.5초간 페이드 인/아웃)
function showPhaseAnnounce(icon, message, fontSizePx, strokeColor) {
  phaseAnnounceEl.textContent = `${icon} ${message}`;
  phaseAnnounceEl.style.fontSize = `${fontSizePx}px`;
  phaseAnnounceEl.style.setProperty("-webkit-text-stroke", `1.5px ${strokeColor}`);
  phaseAnnounceEl.classList.remove("show");
  // 리플로우 한 번만으로는 브라우저가 애니메이션 재시작을 놓치는 경우가 있어
  // rAF로 한 프레임 넘긴 뒤 클래스를 다시 붙여 확실하게 재생되도록 한다.
  void phaseAnnounceEl.offsetWidth;
  requestAnimationFrame(() => {
    phaseAnnounceEl.classList.add("show");
  });
}

function clearAllTimers() {
  if (countdownTimerId !== null) {
    clearInterval(countdownTimerId);
    countdownTimerId = null;
  }
  if (gameTimerId !== null) {
    clearInterval(gameTimerId);
    gameTimerId = null;
  }
  if (physicsRafId !== null) {
    cancelAnimationFrame(physicsRafId);
    physicsRafId = null;
  }
  if (invincibleTimeoutId !== null) {
    clearTimeout(invincibleTimeoutId);
    invincibleTimeoutId = null;
  }
}

const GROUND_Y_SHIFT_DOWN = 60; // 오브젝트들이 위쪽에 몰려 보여서 전체적으로 60px 아래로 이동

function getStageWidth() {
  return stageEl.clientWidth || GAME_VIEW_WIDTH;
}

function getStageHeight() {
  return stageEl.clientHeight || GAME_VIEW_HEIGHT;
}

function getGroundBottomPx() {
  return getStageHeight() * GROUND_RATIO - GROUND_Y_SHIFT_DOWN;
}

function resizeGameToViewport() {
  const isPortrait = window.innerWidth < window.innerHeight;
  const scale = isPortrait
    ? Math.min(window.innerWidth / GAME_VIEW_HEIGHT, window.innerHeight / GAME_VIEW_WIDTH, 1)
    : Math.min(window.innerWidth / GAME_VIEW_WIDTH, window.innerHeight / GAME_VIEW_HEIGHT, 1);
  gameShellEl.style.width = `${(isPortrait ? GAME_VIEW_HEIGHT : GAME_VIEW_WIDTH) * scale}px`;
  gameShellEl.style.height = `${(isPortrait ? GAME_VIEW_WIDTH : GAME_VIEW_HEIGHT) * scale}px`;
  gameContainerEl.style.transform = isPortrait
    ? `translateX(${GAME_VIEW_HEIGHT * scale}px) rotate(90deg) scale(${scale})`
    : `scale(${scale})`;
  updateMobileHint();
}

function updateMobileHint() {
  const hintEl = document.getElementById("orientation-hint");
  const isLikelyMobile = window.innerWidth <= 900 || window.matchMedia("(pointer: coarse)").matches;
  hintEl.textContent = "가로 화면, 무음모드 제거를 권장합니다";
  document.body.classList.toggle("show-orientation-hint", isLikelyMobile && gameState === "ready");
}

function queueResizeGameToViewport() {
  resizeGameToViewport();
  [80, 220, 500].forEach((delay) => {
    setTimeout(resizeGameToViewport, delay);
  });
}

function getCharBaseBottomPx() {
  return getGroundBottomPx() + CHAR_GROUND_OFFSET;
}

function resetCharacterPhysics() {
  velocityY = 0;
  jumpOffset = 0;
  isOnGround = true;
  lastPhysicsTime = null;
  characterEl.classList.remove("airborne");
  characterEl.classList.remove("invincible");
  characterEl.style.bottom = `${getCharBaseBottomPx()}px`;
  characterVisualEl.src = SPRITES.run;

  isInvincible = false;
  if (invincibleTimeoutId !== null) {
    clearTimeout(invincibleTimeoutId);
    invincibleTimeoutId = null;
  }
}

// ----- 발판(구름 발판) -----
function clearPlatforms() {
  platforms.forEach((p) => p.el.remove());
  platforms = [];
}

function spawnPlatformAt(xStart, opts) {
  opts = opts || {};
  const el = document.createElement("div");
  el.className = "platform";
  el.style.width = `${PLATFORM_WIDTH}px`;
  el.style.left = `${xStart}px`;
  el.style.bottom = `${getGroundBottomPx()}px`; // 캐릭터/아이템/장애물과 동일한 기준(getGroundBottomPx)을 쓰도록 통일

  const extraBump = document.createElement("div");
  extraBump.className = "platform-bump-extra";
  el.appendChild(extraBump);

  platformsEl.appendChild(el);
  platforms.push({ el, x: xStart, width: PLATFORM_WIDTH });

  if (opts.noContent) {
    // 캐릭터 시작 위치와 겹치거나 이미 지나간 자리라 점프해도 닿을 수 없으므로 아이템/장애물을 두지 않음
    lastTileHadHazard = false;
    return;
  }

  const rates = getSpawnRates();
  const hazardChance = opts.suppressHazard ? 0 : rates.hazard;
  const shouldSpawnGuaranteedGolden = isGuaranteedGoldenDue();
  const roll = Math.random();
  if (shouldSpawnGuaranteedGolden) {
    spawnItemAt(xStart + PLATFORM_WIDTH / 2 - GOLDEN_SIZE / 2, 1);
    guaranteedGoldenSpawnIndex += 1;
    lastTileHadHazard = false;
  } else if (roll < hazardChance) {
    spawnHazardAt(xStart + PLATFORM_WIDTH / 2 - HAZARD_SIZE / 2);
    lastTileHadHazard = true;
  } else if (roll < hazardChance + rates.item) {
    spawnItemAt(xStart + PLATFORM_WIDTH / 2 - ITEM_SIZE / 2, rates.golden);
    lastTileHadHazard = false;
  } else {
    lastTileHadHazard = false;
  }
}

function initPlatforms() {
  clearPlatforms();
  tilesSinceGap = 0;
  consecutiveGapCount = 0;
  lastTileHadHazard = false;
  const stageWidth = getStageWidth();
  const charCenterX = stageWidth * 0.25;
  let x = 0;
  while (x < stageWidth + PLATFORM_WIDTH) {
    const tileCenter = x + PLATFORM_WIDTH / 2;
    // 캐릭터 위치보다 앞쪽에 최소 한 칸 여유가 있어야 점프해서 닿을 시간이 생긴다
    const reachable = tileCenter > charCenterX + PLATFORM_WIDTH;
    spawnPlatformAt(x, { noContent: !reachable });
    x += PLATFORM_WIDTH;
  }
}

function updatePlatforms(dt) {
  const stageWidth = getStageWidth();

  platforms.forEach((p) => {
    p.x -= SCROLL_SPEED * dt;
    p.el.style.left = `${p.x}px`;
  });

  while (platforms.length && platforms[0].x + platforms[0].width < 0) {
    platforms.shift().el.remove();
  }

  const last = platforms[platforms.length - 1];
  const rightEdge = last ? last.x + last.width : 0;
  if (rightEdge < stageWidth) {
    const elapsed = GAME_DURATION - timeLeft;
    // 번개 구름 바로 뒤에는 틈을 두지 않고, 틈은 최대 2회까지만 연속으로 나오게 한다
    const spacingOk = tilesSinceGap >= MIN_TILES_BETWEEN_GAPS;
    const canGap =
      elapsed >= SAFE_START_SECONDS && spacingOk && !lastTileHadHazard && consecutiveGapCount < MAX_CONSECUTIVE_GAPS;

    if (canGap && Math.random() < getGapChance(elapsed)) {
      tilesSinceGap = 0;
      consecutiveGapCount += 1;
      spawnPlatformAt(rightEdge + GAP_WIDTH, { suppressHazard: true }); // 틈 직후 발판엔 번개 구름을 두지 않음
    } else {
      tilesSinceGap += 1;
      // 최소 간격 때문에 어쩔 수 없이 나온 일반 발판(스페이서)에서는 연속 카운트를 유지하고,
      // 간격이 충분한데도 일반 발판이 나온 경우(확률 실패 또는 연속 한도 도달)에만 초기화한다.
      if (spacingOk) {
        consecutiveGapCount = 0;
      }
      spawnPlatformAt(rightEdge);
    }
  }
}

function hasPlatformUnderX(x) {
  return platforms.some((p) => x >= p.x && x <= p.x + p.width);
}

// ----- 간식 아이템 -----
function clearItems() {
  items.forEach((it) => it.el.remove());
  items = [];
}

function clearScorePopups() {
  scorePopupsEl.innerHTML = "";
}

function isGuaranteedGoldenDue() {
  const nextSpawnTime = GUARANTEED_GOLDEN_SPAWN_TIMES[guaranteedGoldenSpawnIndex];
  if (nextSpawnTime === undefined) return false;
  const elapsed = GAME_DURATION - timeLeft;
  return elapsed >= nextSpawnTime;
}

function spawnItemAt(xStart, goldenRatio) {
  const isGolden = Math.random() < goldenRatio;
  const size = isGolden ? GOLDEN_SIZE : ITEM_SIZE;

  const el = document.createElement("div");
  el.className = isGolden ? "item item-golden" : "item";
  el.textContent = isGolden ? "🍖" : "⭐";
  el.style.left = `${xStart}px`;
  itemsEl.appendChild(el);
  items.push({ el, x: xStart, collected: false, type: isGolden ? "golden" : "star", size });
}

function collectItem(it) {
  it.collected = true;
  it.el.classList.add("collected");
  setTimeout(() => it.el.remove(), 260);

  const gainedScore = it.type === "golden" ? GOLDEN_SCORE : ITEM_SCORE;
  score += gainedScore;
  showScorePopup(gainedScore, "plus", it.x + it.size / 2, getGroundBottomPx() + ITEM_HEIGHT_ABOVE_GROUND + it.size + 4);
  if (it.type === "golden") {
    goldenCount += 1;
  }
  updateHud();

  if (it.type === "golden") {
    playGoldenSound();
  } else {
    playStarSound();
  }
}

function updateItems(dt) {
  const groundY = getGroundBottomPx();
  const itemBottom = groundY + ITEM_HEIGHT_ABOVE_GROUND;

  const stageWidth = getStageWidth();
  const charCenterX = stageWidth * 0.25;
  const charLeft = charCenterX - CHAR_HITBOX_WIDTH / 2;
  const charRight = charCenterX + CHAR_HITBOX_WIDTH / 2;
  const charBottom = groundY + CHAR_GROUND_OFFSET + jumpOffset;
  const charTop = charBottom + CHAR_HITBOX_HEIGHT;

  items.forEach((it) => {
    if (it.collected) return;

    it.x -= SCROLL_SPEED * dt;
    it.el.style.left = `${it.x}px`;
    it.el.style.bottom = `${itemBottom}px`;

    const itemLeft = it.x;
    const itemRight = it.x + it.size;
    const itemTop = itemBottom + it.size;

    const overlap =
      charLeft < itemRight &&
      charRight > itemLeft &&
      charBottom < itemTop &&
      charTop > itemBottom;

    if (overlap) {
      collectItem(it);
    }
  });

  items = items.filter((it) => {
    if (!it.collected && it.x + it.size < 0) {
      it.el.remove();
      return false;
    }
    return !it.collected || it.el.isConnected;
  });
}

// ----- 위험 요소 (번개 구름) -----
function clearHazards() {
  hazards.forEach((h) => h.el.remove());
  hazards = [];
}

function spawnHazardAt(xStart) {
  const el = document.createElement("div");
  el.className = "hazard";
  el.textContent = "⛈️";
  el.style.left = `${xStart}px`;
  hazardsEl.appendChild(el);
  hazards.push({ el, x: xStart });
}

// 피해 공통 처리 (번개 구름 충돌 / 구름 틈 추락 모두 사용)
function applyDamage() {
  loseHeart();
  if (gameState !== "playing") return; // 하트 0으로 게임이 끝난 경우

  isInvincible = true;
  characterEl.classList.add("invincible");
  characterVisualEl.src = SPRITES.hurt;

  invincibleTimeoutId = setTimeout(() => {
    isInvincible = false;
    characterEl.classList.remove("invincible");
    if (gameState === "playing") {
      characterVisualEl.src = isOnGround ? SPRITES.run : SPRITES.jump;
    }
  }, INVINCIBLE_DURATION);
}

function showScorePopup(amount, type, x, y) {
  const el = document.createElement("div");
  el.className = `score-popup ${type}`;
  el.textContent = `${type === "minus" ? "-" : "+"}${amount}`;
  el.style.left = `${x}px`;
  el.style.bottom = `${y}px`;
  scorePopupsEl.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

function hitHazard() {
  if (isInvincible || gameState !== "playing") return;
  playHurtSound();
  applyDamage();
}

function fallIntoGap() {
  if (isInvincible || gameState !== "playing") return;
  playFallSound();
  applyDamage();
}

// 구름 틈 추락 판정: 캐릭터가 거의 지면 높이(점프 중이 아님)인데 그 아래에 발판이 없으면 추락
function checkGapFall() {
  if (gameState !== "playing" || isInvincible) return;
  if (jumpOffset > 4) return; // 점프 중이면(공중에 충분히 떠 있으면) 검사하지 않음

  const stageWidth = getStageWidth();
  const charCenterX = stageWidth * 0.25;

  if (!hasPlatformUnderX(charCenterX)) {
    fallIntoGap();
  }
}

function updateHazards(dt) {
  const groundY = getGroundBottomPx();

  const stageWidth = getStageWidth();
  const charCenterX = stageWidth * 0.25;
  const hazardHitboxMargin = (HAZARD_SIZE - HAZARD_HITBOX_SIZE) / 2;
  const charHitboxMargin = 6; // 캐릭터 쪽도 살짝 안쪽으로 좁혀서 그레이징 판정 방지
  const charLeft = charCenterX - CHAR_HITBOX_WIDTH / 2 + charHitboxMargin;
  const charRight = charCenterX + CHAR_HITBOX_WIDTH / 2 - charHitboxMargin;
  const charBottom = groundY + CHAR_GROUND_OFFSET + jumpOffset;

  hazards.forEach((h) => {
    h.x -= SCROLL_SPEED * dt;
    h.el.style.left = `${h.x}px`;
    h.el.style.bottom = `${groundY}px`;

    const hazardLeft = h.x + hazardHitboxMargin;
    const hazardRight = h.x + HAZARD_SIZE - hazardHitboxMargin;
    const hazardTop = groundY + HAZARD_HEIGHT;

    const overlapX = charLeft < hazardRight && charRight > hazardLeft;
    const tooLow = charBottom < hazardTop;

    if (overlapX && tooLow && !isInvincible) {
      hitHazard();
    }
  });

  hazards = hazards.filter((h) => {
    if (h.x + HAZARD_SIZE < 0) {
      h.el.remove();
      return false;
    }
    return true;
  });
}

// ----- 배경 이미지 스크롤 (두 장을 이어붙여 무한 반복) -----
function updateBgScroll(dt) {
  const stageWidth = getStageWidth();
  const bgLoopWidth = stageWidth * 2;

  bgOffset -= SCROLL_SPEED * 0.35 * dt; // 배경은 근경보다 느리게 (패럴랙스), 속도 배율은 SCROLL_SPEED를 따라감
  if (bgOffset <= -bgLoopWidth) bgOffset += bgLoopWidth;

  bgTile1El.style.width = `${stageWidth}px`;
  bgTile2El.style.width = `${stageWidth}px`;
  bgTile3El.style.width = `${stageWidth}px`;
  bgTile1El.style.left = `${bgOffset}px`;
  bgTile2El.style.left = `${bgOffset + stageWidth}px`;
  bgTile3El.style.left = `${bgOffset + bgLoopWidth}px`;
}

function resetScrollWorld() {
  SCROLL_SPEED = SCROLL_SPEED_EARLY; // 재시작 시 속도를 반드시 초반값(300)으로 초기화
  clearItems();
  clearHazards();
  clearScorePopups();
  initPlatforms();
  bgOffset = 0;
  updateBgScroll(0);
}

function jump() {
  if (gameState !== "playing" || !isOnGround) return;
  velocityY = JUMP_VELOCITY;
  isOnGround = false;
  characterEl.classList.add("airborne");
  characterVisualEl.src = SPRITES.jump;
  playJumpSound();
}

function physicsLoop(timestamp) {
  if (gameState !== "playing") {
    physicsRafId = null;
    return;
  }
  if (lastPhysicsTime === null) lastPhysicsTime = timestamp;
  const dt = Math.min((timestamp - lastPhysicsTime) / 1000, 0.05);
  lastPhysicsTime = timestamp;

  velocityY -= GRAVITY * dt;
  jumpOffset += velocityY * dt;

  if (jumpOffset <= 0) {
    jumpOffset = 0;
    velocityY = 0;
    if (!isOnGround) {
      isOnGround = true;
      characterEl.classList.remove("airborne");
      characterVisualEl.src = SPRITES.run;
    }
  }

  characterEl.style.bottom = `${getCharBaseBottomPx() + jumpOffset}px`;

  updateScrollSpeedForPhase();
  updatePlatforms(dt);
  checkGapFall();
  updateItems(dt);
  updateHazards(dt);
  updateBgScroll(dt);

  physicsRafId = requestAnimationFrame(physicsLoop);
}

function startCountdown() {
  gameState = "countdown";
  showScreen("countdown");

  let count = 3;
  countdownNumberEl.textContent = count;
  playCountdownTick();

  countdownTimerId = setInterval(() => {
    count -= 1;
    if (count > 0) {
      countdownNumberEl.textContent = count;
      playCountdownTick();
    } else if (count === 0) {
      countdownNumberEl.textContent = "START!";
      playCountdownGo();
    } else {
      clearInterval(countdownTimerId);
      countdownTimerId = null;
      startPlaying();
    }
  }, 1000);
}

function startPlaying() {
  gameState = "playing";
  showScreen("playing");
  updateHud();
  resetCharacterPhysics();
  resetScrollWorld();
  physicsRafId = requestAnimationFrame(physicsLoop);
  startBgm();

  gameTimerId = setInterval(() => {
    timeLeft -= 1;
    updateHud();

    const elapsed = GAME_DURATION - timeLeft;
    if (!phase15Shown && elapsed >= 15) {
      phase15Shown = true;
      showPhaseAnnounce("☁️", "구름이 빨라지고 있어요!", 42, "#67B8FF");
    }
    if (!phase30Shown && elapsed >= 30) {
      phase30Shown = true;
      showPhaseAnnounce("🌈", "마지막 꿈길!", 46, "#A47CFF");
    }

    if (timeLeft <= 0) {
      finished = true;
      endGame();
    }
  }, 1000);
}

function loseHeart() {
  if (gameState !== "playing") return;
  hearts -= 1;
  score = Math.max(0, score - HEART_PENALTY);
  const stageWidth = getStageWidth();
  showScorePopup(HEART_PENALTY, "minus", stageWidth * 0.25, getCharBaseBottomPx() - 18);
  updateHud();
  if (hearts <= 0) {
    finished = false;
    endGame();
  }
}

function endGame() {
  clearAllTimers();
  gameState = "gameOver";
  stopBgm();

  showResult();
  showScreen("gameOver");
  btnRestart.disabled = false;

  if (finished) {
    playWinSound();
  } else {
    playGameOverSound();
  }
}

const GRADES = [
  { min: 240, minGolden: 5, name: "전설의 솜뭉치", tier: 4, icon: "👑" },
  { min: 120, name: "별빛 모험가", tier: 2, icon: "⭐" },
  { min: 0, name: "꿈길 초보", tier: 0, icon: "🐾" },
];

function calcGrade(finalScore, finalGoldenCount) {
  return GRADES.find((g) => finalScore >= g.min && finalGoldenCount >= (g.minGolden || 0));
}

function showResult() {
  resultScoreEl.textContent = score;
  resultGoldenEl.textContent = goldenCount;
  resultHeartsEl.textContent = hearts;
  resultFinishedEl.textContent = finished ? "완주 성공" : "게임 오버";

  const badgeEl = document.querySelector(".result-grade-badge");
  if (finished) {
    const grade = calcGrade(score, goldenCount);
    resultGradeEl.textContent = `${grade.icon} ${grade.name}`;
    badgeEl.className = `result-grade-badge grade-tier-${grade.tier}`;
    badgeEl.style.display = "";
  } else {
    // 게임오버 시에는 등급을 표시하지 않는다
    badgeEl.style.display = "none";
  }

  document.getElementById("result-title").textContent = finished
    ? "완주 성공!"
    : "게임 오버";
  resultCharImgEl.src = finished ? SPRITES.win : SPRITES.gameover;
  screens.gameOver.classList.toggle("result-sad", !finished);
  document.querySelector(".result-card").classList.toggle("win-flair", finished);
  showWinSparkles(finished);
}

const WIN_SPARKLE_SPOTS = [
  { top: "-4%", left: "8%" },
  { top: "8%", left: "82%" },
  { top: "50%", left: "0%" },
  { top: "62%", left: "92%" },
  { top: "-6%", left: "45%" },
  { top: "30%", left: "94%" },
  { top: "30%", left: "2%" },
  { top: "80%", left: "20%" },
  { top: "80%", left: "70%" },
  { top: "5%", left: "62%" },
];
const WIN_SPARKLE_EMOJI = ["✨", "⭐", "🌟", "💫", "🎉"];

function showWinSparkles(finished) {
  const container = document.getElementById("win-sparkles");
  container.innerHTML = "";
  if (!finished) return;

  WIN_SPARKLE_SPOTS.forEach((spot, i) => {
    const el = document.createElement("div");
    el.className = "win-sparkle";
    el.textContent = WIN_SPARKLE_EMOJI[i % WIN_SPARKLE_EMOJI.length];
    el.style.top = spot.top;
    el.style.left = spot.left;
    el.style.animationDelay = `${i * 0.08}s`;
    container.appendChild(el);
  });
}

// ===== 시작 버튼 =====
btnStart.addEventListener("click", async () => {
  if (gameState === "countdown" || gameState === "playing") return;
  await unlockAudio();
  playStartChime();
  resetGameData();
  startCountdown();
});

// ===== 다시 시작 버튼 (중복 클릭 방지) =====
btnRestart.addEventListener("click", async () => {
  if (gameState === "countdown" || gameState === "playing") return;

  btnRestart.disabled = true;
  await unlockAudio();
  playStartChime();
  clearAllTimers();
  resetGameData();
  startCountdown();
});

// ===== 점프 입력 =====
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    jump();
  }
});

function handleScreenJumpInput(e) {
  if (gameState !== "playing") return;
  if (e.target.closest("button")) return;
  if (typeof e.preventDefault === "function") {
    e.preventDefault();
  }
  jump();
}

gameContainerEl.addEventListener("pointerdown", handleScreenJumpInput, { passive: false });
gameContainerEl.addEventListener("touchstart", handleScreenJumpInput, { passive: false });
gameContainerEl.addEventListener("click", handleScreenJumpInput);

["pointerdown", "touchstart", "click"].forEach((eventName) => {
  document.addEventListener(
    eventName,
    () => {
      unlockAudio();
    },
    { capture: true, passive: true }
  );
});

window.addEventListener("resize", queueResizeGameToViewport);
window.addEventListener("orientationchange", queueResizeGameToViewport);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", queueResizeGameToViewport);
  window.visualViewport.addEventListener("scroll", queueResizeGameToViewport);
}

// ===== 사운드 버튼 (배경음/효과음 전체 on-off) =====
document.getElementById("btn-sound-ready").addEventListener("click", async () => {
  await unlockAudio();
  setSoundOn(!soundOn);
});
document.getElementById("btn-sound-playing").addEventListener("click", async () => {
  await unlockAudio();
  setSoundOn(!soundOn);
});

// 초기 화면
queueResizeGameToViewport();
showScreen("ready");
