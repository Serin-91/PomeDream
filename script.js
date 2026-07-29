// ===== 게임 상태 =====
// ready -> countdown -> playing -> pause -> gameOver -> (재시작) -> countdown -> ...
let gameState = "ready";

const GAME_DURATION = 45;
let score = 0;
let goldenCount = 0; // 황금 뼈다귀 획득 개수
let timeLeft = GAME_DURATION;
let finished = false;
let isFalling = false; // 낙사 추락 상태
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
let jumpCount = 0; // 0: 지면, 1: 1차 점프, 2: 2차 점프
let lastPhysicsTime = null;

// ===== 화면 요소 =====
const screens = {
  ready: document.getElementById("screen-ready"),
  countdown: document.getElementById("screen-countdown"),
  playing: document.getElementById("screen-playing"),
  pause: document.getElementById("screen-pause"),
  gameOver: document.getElementById("screen-gameover"),
};

const btnStart = document.getElementById("btn-start");
const btnRestart = document.getElementById("btn-restart");
const countdownNumberEl = document.getElementById("countdown-number");

const hudScoreEl = document.getElementById("hud-score");
const hudGoldenEl = document.getElementById("hud-treats");
const hudTimeEl = document.getElementById("hud-time");

const resultScoreEl = document.getElementById("result-score");
const resultGoldenEl = document.getElementById("result-treats");
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
  win: "images/result-win-card.png",
  gameover: "images/result-gameover-card.png",
};

const loadedImages = {};
Object.values(SPRITES).forEach((src) => {
  const img = new Image();
  img.src = src;
  if ("decode" in img) {
    img.decode().catch(() => {});
  }
  loadedImages[src] = img;
});

// ===== 횡스크롤 =====
let SCROLL_SPEED = 300; // px/s, 시간 구간에 따라 매 프레임 갱신되는 실제 속도 (초기값 = 0~15초 구간 값)
const PLATFORM_WIDTH = 240;

// 구름 틈: 있을 때도, 없을 때도 있도록 확률로 결정.
const GAP_CHANCE_EARLY = 0.70; // 0~15초 (추가 상향)
const GAP_CHANCE_MID = 0.84;  // 15~30초 (추가 상향)
const GAP_CHANCE_LATE = 0.95; // 30~45초 (추가 상향)
const GAP_WIDTH = 115;         // 구름 하나 너비 수준 (단일 틈도 도전적)
const DOUBLE_GAP_WIDTH = 200;  // 구름 두 개 너비 수준 (이단점프필요)
const MIN_TILES_BETWEEN_GAPS = 1; // 틈 사이 최소 발판 1개
const MAX_CONSECUTIVE_GAPS = 2;   // 최대 연속 틈 2개

// 이중 틈 등장 확률 (구간별)
const DOUBLE_GAP_CHANCE_EARLY = 0.30;  // 0~15초
const DOUBLE_GAP_CHANCE_MID = 0.45;   // 15~30초
const DOUBLE_GAP_CHANCE_LATE = 0.60;  // 30~45초

let platforms = []; // { el, x, width }
let tilesSinceGap = 0;
let consecutiveGapCount = 0;
let lastTileHadHazard = false;
let bgOffset = 0;

// ===== 간식 아이템 =====
const ITEM_SIZE = 44;
const ITEM_HEIGHT_ABOVE_GROUND = 130;
const ITEM_SCORE = 10;
const GOLDEN_SIZE = 46;
const GOLDEN_SCORE = 25;
const HAZARD_SCORE_PENALTY = 40; // 먹구름 피격 시 점수 감점 (-40점)
const GUARANTEED_GOLDEN_SPAWN_TIMES = [8, 17, 26, 34, 41]; // 확정 등장 5개 (약 8~9초 간격)
const CHAR_HITBOX_WIDTH = 55;
const CHAR_HITBOX_HEIGHT = 58;
const CHAR_GROUND_OFFSET = 26;

let items = []; // { el, x, collected, type }
let guaranteedGoldenSpawnIndex = 0;

// ===== 위험 요소 (비 내리는 회색 먹구름) =====
const HAZARD_SIZE = 38;
const HAZARD_HITBOX_SIZE = 22;
const HAZARD_HEIGHT = 58;
const INVINCIBLE_DURATION = 1000;

let hazards = []; // { el, x }
let isInvincible = false;
let invincibleTimeoutId = null;

// ===== 작은 별 (점프 궤적) =====
// ★ 생성 확률 조정 위치: MINI_STAR_SPAWN_CHANCE
const MINI_STAR_SPAWN_CHANCE = 0.30;  // 발판 1개당 작은별 곡선 생성 확률 (판당 편차 완화를 위해 30%로 상향)
const MINI_STAR_SCORE = 2;            // 작은 별 1개당 점수
const MINI_STAR_SIZE = 26;            // 작은 별 크기(px, 일반 별 44px 대비 축소하여 통일)
const MINI_STAR_MAX_COUNT = 5;        // 곡선당 최대 별 개수

let miniStars = []; // { el, x, bottomPx, arcId, collected }
let nextArcId = 0;
let arcTrackers = {}; // { [arcId]: { total, collected, bonusAwarded } }

// ===== 초콜릿 장애물 (2단계 및 3단계 전용) =====
// ★ 생성 확률 조정 위치: CHOCOLATE_SPAWN_RATE_STAGE_2, CHOCOLATE_SPAWN_RATE_STAGE_3
const CHOCOLATE_SPAWN_RATE_STAGE_2 = 0.15; // 2단계 (15~30초) 초콜릿 생성 확률 (15%)
const CHOCOLATE_SPAWN_RATE_STAGE_3 = 0.32; // 3단계 (30~45초) 초콜릿 생성 확률 (32%)
const CHOCOLATE_SCORE_PENALTY = 15;   // 초콜릿 충돌 시 점수 감소
const CHOCOLATE_SIZE = 32;            // 초콜릿 충돌 판정 크기(px)
const CHOCOLATE_FLY_SPEED_ADD = 180;  // 초콜릿 비행 추가 속도(px/s)
// 다채로운 4가지 비행 높이 (낮음 68px, 중간 112px, 높음 156px, 초고공 198px)
const CHOCOLATE_HEIGHTS = [68, 112, 156, 198];

let chocolates = []; // { el, x, baseHeight, isWave, wavePhase, hit }
let lastChocolateSpawnTileIndex = -2; // 초콜릿 쿨다운: 마지막 생성 타일 인덱스
let totalTileSpawnCount = 0;          // 발판 총 생성 수 (쿨다운 추적)

// ===== 등장 확률 (시간 구간별) =====
// ★ 황금 뼈다귀 무작위 등장 확률 적정화 (8% ~ 12%)
const SAFE_START_SECONDS = 2; // 초반 무적 안전 구간 2초
const SPAWN_PHASES = [
  { untilElapsed: 15, hazard: 0.32, item: 0.54, golden: 0.08 },  // 1단계 (8%)
  { untilElapsed: 30, hazard: 0.42, item: 0.46, golden: 0.10 },  // 2단계 (10%)
  { untilElapsed: GAME_DURATION, hazard: 0.52, item: 0.40, golden: 0.12 }, // 3단계 (12%)
];

function getSpawnRates() {
  const elapsed = GAME_DURATION - timeLeft;
  if (elapsed < SAFE_START_SECONDS) {
    return { hazard: 0, item: 0.65, golden: 0.08 };
  }
  const phase = SPAWN_PHASES.find((p) => elapsed < p.untilElapsed) || SPAWN_PHASES[SPAWN_PHASES.length - 1];
  return { hazard: phase.hazard, item: phase.item, golden: phase.golden };
}

function getGapChance(elapsed) {
  if (elapsed < 15) return GAP_CHANCE_EARLY;
  if (elapsed < 30) return GAP_CHANCE_MID;
  return GAP_CHANCE_LATE;
}

const SCROLL_SPEED_EARLY = 350;  // 1단계 속도
const SCROLL_SPEED_MID = 410;    // 2단계 속도
const SCROLL_SPEED_LATE = 500;   // 3단계 속도 (500으로 상향)

function getDoubleGapChance(elapsed) {
  if (elapsed < 15) return DOUBLE_GAP_CHANCE_EARLY;
  if (elapsed < 30) return DOUBLE_GAP_CHANCE_MID;
  return DOUBLE_GAP_CHANCE_LATE;
}

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
      .then(() => {
        // 첫 웜업용 무음 오디오 즉시 발사하여 브라우저 사운드 하드웨어를 깨움
        try {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          gain.gain.value = 0.00001;
          osc.connect(gain).connect(audioCtx.destination);
          osc.start(0);
          osc.stop(0.001);
        } catch (e) {}
        return true;
      })
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

function playDoubleJumpSound() {
  if (!soundOn) return;
  if (!ensureAudio()) return;
  const t = audioCtx.currentTime;
  playTone(680, t, 0.09, "triangle", 0.16);
  playTone(1020, t + 0.04, 0.12, "sine", 0.18);
}

function playStarSound() {
  if (!soundOn) return;
  if (!ensureAudio()) return;
  const t = audioCtx.currentTime;
  playTone(880, t, 0.1, "sine", 0.18);
  playTone(1320, t + 0.07, 0.14, "sine", 0.16);
}

function playMiniStarSound() {
  if (!soundOn) return;
  if (!ensureAudio()) return;
  const t = audioCtx.currentTime;
  playTone(1200, t, 0.07, "sine", 0.1);
  playTone(1600, t + 0.04, 0.06, "sine", 0.08);
}

function playChocolateHitSound() {
  if (!soundOn) return;
  if (!ensureAudio()) return;
  const t = audioCtx.currentTime;
  playSweep(300, 180, t, 0.18, "sawtooth", 0.12);
  playTone(160, t + 0.12, 0.14, "square", 0.08);
}

function playGoldenSound() {
  if (!soundOn) return;
  if (!ensureAudio()) return;
  const t = audioCtx.currentTime;
  [784, 988, 1175, 1568, 1976].forEach((f, i) => playTone(f, t + i * 0.055, 0.22, "triangle", 0.2));
  [1568, 1976, 2349].forEach((f, i) => playTone(f, t + 0.26 + i * 0.05, 0.32, "sine", 0.12));
}

function playComboSound() {
  if (!soundOn || !ensureAudio()) return;
  const t = audioCtx.currentTime;
  // 신나고 또렷한 콤보 팡파르 3연음 (E5 -> G5 -> C6 -> E6 축하음)
  playTone(659.25, t, 0.12, "triangle", 0.22);
  playTone(783.99, t + 0.08, 0.12, "triangle", 0.24);
  playTone(1046.50, t + 0.16, 0.28, "sine", 0.28);
  playTone(1318.51, t + 0.24, 0.35, "triangle", 0.25);
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

  const chords = [
    [523.25, 659.25, 784.0],
    [587.33, 739.99, 880.0],
    [659.25, 830.61, 987.77],
    [783.99, 987.77, 1174.66],
  ];
  chords.forEach((chord, i) => {
    const start = t + i * 0.22;
    const isClimax = i === chords.length - 1;
    chord.forEach((f) => playTone(f, start, isClimax ? 0.6 : 0.32, isClimax ? "triangle" : "square", 0.1));
  });

  for (let i = 0; i < 7; i++) {
    playNoiseBurst(t + 0.18 + i * 0.085 + Math.random() * 0.02, 0.09, 0.05, 2600 + Math.random() * 900);
  }

  [1568, 1976, 2349, 3136].forEach((f, i) => playTone(f, t + 1.0 + i * 0.09, 0.35, "sine", 0.1));
}

function playGameOverSound() {
  if (!soundOn) return;
  if (!ensureAudio()) return;
  const t = audioCtx.currentTime;
  [400, 320, 240, 180].forEach((f, i) => playTone(f, t + i * 0.15, 0.32, "sawtooth", 0.14));
}

function playStartChime() {
  if (!soundOn) return 0;
  if (!ensureAudio()) return 0;
  const t = audioCtx.currentTime;
  playTone(660, t, 0.12, "sine", 0.15);
  playTone(990, t + 0.1, 0.18, "sine", 0.15);
  return t; // 발수 오디오 시각(t) 반환하여 카운트다운 사운드 정박자 기준점으로 사용
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

const BGM_PAD_NOTES = [261.63, 293.66, 329.63, 392.0, 440.0, 392.0, 329.63, 293.66];
const BGM_SPARKLE_NOTES = [1046.5, 1318.5, 1567.98, 1318.5];

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
  const readySoundBtn = document.getElementById("btn-sound-ready");
  const playingSoundBtn = document.getElementById("btn-sound-playing");
  if (readySoundBtn) readySoundBtn.textContent = icon;
  if (playingSoundBtn) playingSoundBtn.textContent = icon;
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
  hudTimeEl.textContent = timeLeft;
}

function resetGameData() {
  score = 0;
  goldenCount = 0;
  guaranteedGoldenSpawnIndex = 0;
  timeLeft = GAME_DURATION;
  finished = false;
  isFalling = false;
  nextArcId = 0;
  arcTrackers = {};
  phase15Shown = false;
  phase30Shown = false;
  phaseAnnounceEl.classList.remove("show");
  updateHud();
}

function showPhaseAnnounce(icon, message, fontSizePx, strokeColor) {
  phaseAnnounceEl.textContent = `${icon} ${message}`;
  phaseAnnounceEl.style.fontSize = `${fontSizePx}px`;
  phaseAnnounceEl.style.setProperty("-webkit-text-stroke", `1.5px ${strokeColor}`);
  phaseAnnounceEl.classList.remove("show");
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

const GROUND_Y_SHIFT_DOWN = 60;

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
  jumpOffset = 0;
  velocityY = 0;
  isOnGround = true;
  jumpCount = 0;
  isFalling = false;
  lastPhysicsTime = null;
  characterEl.classList.remove("airborne");
  characterEl.classList.remove("invincible");
  characterEl.classList.remove("falling");
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
  el.style.bottom = `${getGroundBottomPx()}px`;

  const extraBump = document.createElement("div");
  extraBump.className = "platform-bump-extra";
  el.appendChild(extraBump);

  platformsEl.appendChild(el);
  platforms.push({ el, x: xStart, width: PLATFORM_WIDTH });

  if (opts.noContent) {
    lastTileHadHazard = false;
    return;
  }

  totalTileSpawnCount += 1;
  const elapsed = GAME_DURATION - timeLeft;
  const isPhase3 = elapsed >= 30;

  // 현재 단계에 따른 초콜릿 스폰 확률 선택 (1단계: 0, 2단계: 15%, 3단계: 30%)
  let chocoSpawnRate = 0;
  if (isPhase3) {
    chocoSpawnRate = CHOCOLATE_SPAWN_RATE_STAGE_3;
  } else if (elapsed >= 15) {
    chocoSpawnRate = CHOCOLATE_SPAWN_RATE_STAGE_2;
  }

  // --- 2단계 & 3단계: 초콜릿 우선 판단 ---
  // 초콜릿이 생성되면 이 발판엔 지상 장애물도, 틈도 생성하지 않음
  let chocolateSpawnedThisTile = false;
  if (chocoSpawnRate > 0 && !opts.suppressHazard && !opts.suppressChocolate) {
    const cooldownOk = (totalTileSpawnCount - lastChocolateSpawnTileIndex) >= 2;
    if (cooldownOk && Math.random() < chocoSpawnRate) {
      // 1. 4가지 높이 중 랜덤 선택 (2단계: 3가지, 3단계: 4가지 높이)
      const randomHeightIndex = Math.floor(Math.random() * (isPhase3 ? 4 : 3));
      const firstHeight = CHOCOLATE_HEIGHTS[randomHeightIndex];
      const isWave1 = Math.random() < 0.22; // 22% 확률로 둥실거리는 S자 물결 초콜릿
      spawnChocolate(getStageWidth() + 60, firstHeight, isWave1);

      // 2. 3단계에서는 60% 확률로 '높이가 서로 다른 변칙 콤보' 2연속 초콜릿 날아옴!
      if (isPhase3 && Math.random() < 0.60) {
        let secondHeightIndex = Math.floor(Math.random() * 4);
        if (secondHeightIndex === randomHeightIndex) {
          secondHeightIndex = (randomHeightIndex + 1 + Math.floor(Math.random() * 3)) % 4; // 다른 높이 강제
        }
        const secondHeight = CHOCOLATE_HEIGHTS[secondHeightIndex];
        const isWave2 = Math.random() < 0.22;
        // X축 간격도 160px ~ 270px 사이의 변칙 무작위 간격
        const gapOffset = 160 + Math.random() * 110;
        spawnChocolate(getStageWidth() + 60 + gapOffset, secondHeight, isWave2);
      }

      lastChocolateSpawnTileIndex = totalTileSpawnCount;
      chocolateSpawnedThisTile = true;
      lastTileHadHazard = true; // 틈 생성 억제에도 활용
    }
  }

  // --- 작은 별 곡선 생성 여부 사전 결정 ---
  const canSpawnMiniStars = !opts.suppressHazard && Math.random() < MINI_STAR_SPAWN_CHANCE;

  // --- 지상 아이템/장애물 (초콜릿 생성 시에는 스킵) ---
  if (!chocolateSpawnedThisTile) {
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
      // ★ 일반 별과 작은 별 중복 생성 방지: 작은 별 곡선이 생기는 발판이면 일반 별 생성 스킵!
      if (!canSpawnMiniStars) {
        spawnItemAt(xStart + PLATFORM_WIDTH / 2 - ITEM_SIZE / 2, rates.golden);
      }
      lastTileHadHazard = false;
    } else {
      lastTileHadHazard = false;
    }
  }

  // --- 작은 별 궤적: 사전 결정된 경우 이 발판 위 공간에 생성 ---
  if (canSpawnMiniStars) {
    spawnMiniStarArc(xStart, PLATFORM_WIDTH);
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
    // 0~30초: 연속 구름 1~2개 섞임, 30초 이후: 구름 무조건 1개씩 징검다리
    const maxConsecutiveTiles = elapsed >= 30 ? 1 : 2;
    const maxConsecutiveGaps = elapsed >= 30 ? 1 : MAX_CONSECUTIVE_GAPS;
    const forceGap = tilesSinceGap >= maxConsecutiveTiles;
    const canGap =
      elapsed >= SAFE_START_SECONDS && tilesSinceGap >= 1 && !lastTileHadHazard && consecutiveGapCount < maxConsecutiveGaps;

    if (canGap && (forceGap || Math.random() < getGapChance(elapsed))) {
      tilesSinceGap = 0;
      consecutiveGapCount += 1;
      // 이중 틈 vs 단일 틈 확률적 선택
      const useDoubleGap = Math.random() < getDoubleGapChance(elapsed);
      const chosenGap = useDoubleGap ? DOUBLE_GAP_WIDTH : GAP_WIDTH;
      spawnPlatformAt(rightEdge + chosenGap, { suppressHazard: true });
    } else {
      tilesSinceGap += 1;
      consecutiveGapCount = 0;
      spawnPlatformAt(rightEdge);
    }
  }
}

// ----- 작은 별 (점프 궤적) -----
function spawnMiniStarArc(tileX, tileWidth) {
  const groundY = getGroundBottomPx();
  // 항상 5~7개 스폰 → 모두 콤보 대상
  const count = 5 + Math.floor(Math.random() * 3);
  const currentArcId = ++nextArcId;

  arcTrackers[currentArcId] = {
    total: count,
    collected: 0,
    bonusAwarded: false
  };

  const PATTERNS = [
    "jump_rainbow",    // 1단 점프 무지개 (80px ~ 140px)
    "double_jump_arc", // 2단 점프 고공  (90px ~ 185px)
    "air_rising",      // 공중 우상향    (80px ~ 175px)
    "air_falling",     // 공중 우하향    (175px ~ 80px)
    "air_wave",        // 둥실 물결      (85px ~ 155px)
  ];
  const chosenPattern = PATTERNS[Math.floor(Math.random() * PATTERNS.length)];

  const startOffsetPct = 0.02;
  const widthPct = 0.96;
  const arcWidth = tileWidth * widthPct;
  const startX = tileX + tileWidth * startOffsetPct;

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const xPos = startX + arcWidth * t;

    let heightAboveGround = 0;
    if (chosenPattern === "jump_rainbow") {
      heightAboveGround = 80 + Math.sin(t * Math.PI) * 60;  // 80px ~ 140px
    } else if (chosenPattern === "double_jump_arc") {
      heightAboveGround = 90 + Math.sin(t * Math.PI) * 95;  // 90px ~ 185px
    } else if (chosenPattern === "air_rising") {
      heightAboveGround = 80 + Math.sin(t * 0.5 * Math.PI) * 95; // 80px ~ 175px
    } else if (chosenPattern === "air_falling") {
      heightAboveGround = 80 + Math.cos(t * 0.5 * Math.PI) * 95; // 175px ~ 80px
    } else if (chosenPattern === "air_wave") {
      heightAboveGround = 85 + Math.sin(t * Math.PI) * 70;  // 85px ~ 155px
    }

    const bottomPx = groundY + heightAboveGround;

    const el = document.createElement("div");
    el.className = "mini-star";
    el.textContent = "⭐";
    el.style.left = `${xPos}px`;
    el.style.bottom = `${bottomPx}px`;
    el.style.animationDelay = `${i * 0.07}s`;
    itemsEl.appendChild(el);
    miniStars.push({ el, x: xPos, bottomPx, arcId: currentArcId, collected: false });
  }
}

function clearMiniStars() {
  miniStars.forEach((s) => s.el.remove());
  miniStars = [];
}

function updateMiniStars(dt) {
  const groundY = getGroundBottomPx();
  const stageWidth = getStageWidth();
  const charCenterX = stageWidth * 0.25;
  const charLeft = charCenterX - CHAR_HITBOX_WIDTH / 2;
  const charRight = charCenterX + CHAR_HITBOX_WIDTH / 2;
  const charBottom = groundY + CHAR_GROUND_OFFSET + jumpOffset;
  const charTop = charBottom + CHAR_HITBOX_HEIGHT;

  miniStars.forEach((s) => {
    if (s.collected) return;

    s.x -= SCROLL_SPEED * dt;
    s.el.style.left = `${s.x}px`;
    // bottomPx는 고정 (발판 기준 포물선 높이)
    s.el.style.bottom = `${s.bottomPx}px`;

    const sLeft = s.x;
    const sRight = s.x + MINI_STAR_SIZE;
    const sBottom = s.bottomPx;
    const sTop = s.bottomPx + MINI_STAR_SIZE;

    const overlap =
      charLeft < sRight &&
      charRight > sLeft &&
      charBottom < sTop &&
      charTop > sBottom;

    if (overlap) {
      s.collected = true;
      s.el.classList.add("collected");
      setTimeout(() => s.el.remove(), 200);
      score += MINI_STAR_SCORE;
      showScorePopup(MINI_STAR_SCORE, "plus", s.x + MINI_STAR_SIZE / 2, s.bottomPx + MINI_STAR_SIZE + 4);

      // 5개 이상 한 번에 모두 먹은 콤보(Combo!) 달성 시
      if (s.arcId > 0) {
        const tracker = arcTrackers[s.arcId];
        if (tracker && !tracker.bonusAwarded) {
          tracker.collected += 1;
          if (tracker.collected >= tracker.total) {
            tracker.bonusAwarded = true;
            const BONUS_SCORE = 5;
            score += BONUS_SCORE;
            showComboPopup(s.x + MINI_STAR_SIZE / 2, s.bottomPx + MINI_STAR_SIZE + 28);
            playComboSound(); // 신나는 콤보 전용 팡파르 효과음!
          }
        }
      }

      updateHud();
      playMiniStarSound();
    }
  });

  miniStars = miniStars.filter((s) => {
    if (!s.collected && s.x + MINI_STAR_SIZE < 0) {
      s.el.remove();
      return false;
    }
    return !s.collected || s.el.isConnected;
  });
}

// ----- 초콜릿 장애물 (2단계 및 3단계 전용) -----
function spawnChocolate(xStart, heightPx, isWave = false) {
  const groundY = getGroundBottomPx();
  const el = document.createElement("div");
  el.className = "chocolate";
  el.textContent = "🍫";
  el.style.left = `${xStart}px`;
  el.style.bottom = `${groundY + heightPx}px`;
  hazardsEl.appendChild(el);
  chocolates.push({
    el,
    x: xStart,
    baseHeight: heightPx,
    isWave,
    wavePhase: Math.random() * Math.PI * 2,
    hit: false
  });
}

function clearChocolates() {
  chocolates.forEach((c) => c.el.remove());
  chocolates = [];
}

function updateChocolates(dt) {
  const groundY = getGroundBottomPx();
  const stageWidth = getStageWidth();
  const charCenterX = stageWidth * 0.25;
  const charHitboxMargin = 6;
  const charLeft = charCenterX - CHAR_HITBOX_WIDTH / 2 + charHitboxMargin;
  const charRight = charCenterX + CHAR_HITBOX_WIDTH / 2 - charHitboxMargin;
  const charBottom = groundY + CHAR_GROUND_OFFSET + jumpOffset;
  const charTop = charBottom + CHAR_HITBOX_HEIGHT;

  chocolates.forEach((c) => {
    if (c.hit) return;
    c.x -= (SCROLL_SPEED + CHOCOLATE_FLY_SPEED_ADD) * dt;
    c.el.style.left = `${c.x}px`;

    // S자 물결 비행인 경우 둥실거리는 Y축 이동 추가
    let currentHeight = c.baseHeight;
    if (c.isWave) {
      c.wavePhase += dt * 4.8;
      currentHeight += Math.sin(c.wavePhase) * 18;
    }

    const cBottom = groundY + currentHeight;
    c.el.style.bottom = `${cBottom}px`;

    const cLeft = c.x;
    const cRight = c.x + CHOCOLATE_SIZE;
    const cTop = cBottom + CHOCOLATE_SIZE;

    const overlapX = charLeft < cRight && charRight > cLeft;
    const overlapY = charBottom < cTop && charTop > cBottom;

    if (overlapX && overlapY) {
      c.hit = true;
      c.el.remove();
      score = Math.max(0, score - CHOCOLATE_SCORE_PENALTY);
      showScorePopup(CHOCOLATE_SCORE_PENALTY, "minus", charCenterX, getCharBaseBottomPx() - 18);
      updateHud();
      playChocolateHitSound();
    }
  });

  chocolates = chocolates.filter((c) => {
    if (c.hit) return false;
    if (c.x + CHOCOLATE_SIZE < 0) {
      c.el.remove();
      return false;
    }
    return true;
  });
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

// ----- 위험 요소 (비 내리는 회색 먹구름) -----
function clearHazards() {
  hazards.forEach((h) => h.el.remove());
  hazards = [];
}

function spawnHazardAt(xStart) {
  const el = document.createElement("div");
  el.className = "hazard";
  el.innerHTML = `
    <div class="hazard-cloud">
      <div class="cloud-body"></div>
      <div class="rain-container">
        <div class="rain-drop d1"></div>
        <div class="rain-drop d2"></div>
        <div class="rain-drop d3"></div>
      </div>
      <div class="lightning-flash">⚡</div>
    </div>
  `;
  el.style.left = `${xStart}px`;
  hazardsEl.appendChild(el);
  hazards.push({ el, x: xStart });
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

function showComboPopup(x, y) {
  const el = document.createElement("div");
  el.className = "score-popup combo";
  el.innerHTML = `
    <div class="combo-dots left"><span></span><span></span><span></span></div>
    <span class="combo-label">combo +5</span>
    <div class="combo-dots right"><span></span><span></span><span></span></div>
  `;
  el.style.left = `${x}px`;
  el.style.bottom = `${y}px`;
  scorePopupsEl.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

function hitHazard() {
  if (isInvincible || gameState !== "playing") return;
  playHurtSound();

  // 먹구름 피격: 하트는 차감하지 않고 점수만 -40점 감점
  score = Math.max(0, score - HAZARD_SCORE_PENALTY);
  const stageWidth = getStageWidth();
  showScorePopup(HAZARD_SCORE_PENALTY, "minus", stageWidth * 0.25, getCharBaseBottomPx() - 18);
  updateHud();

  // 1초간 무적 반짝임 및 다친 애니메이션 적용
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

function fallIntoGap() {
  if (isFalling || gameState !== "playing") return;
  isFalling = true;
  playFallSound();

  // 낭떠러지 추락: 회전하며 아래로 푹 고꾸라지는 리얼 낙사 애니메이션
  characterEl.classList.add("falling");
  characterVisualEl.src = SPRITES.hurt;

  // 0.5초 동안 낙사 연출 후 즉시 게임 오버 (사망)
  setTimeout(() => {
    finished = false;
    endGame();
  }, 500);
}

function checkGapFall() {
  if (gameState !== "playing" || isInvincible || isFalling) return;
  if (jumpOffset > 4) return;

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
  const charHitboxMargin = 6;
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

function updateBgScroll(dt) {
  const stageWidth = getStageWidth();
  const bgLoopWidth = stageWidth * 2;

  bgOffset -= SCROLL_SPEED * 0.35 * dt;
  if (bgOffset <= -bgLoopWidth) bgOffset += bgLoopWidth;

  // 정수 픽셀로 반올림하여 타일 사이 서브픽셀 이음새(세로선) 방지
  const o = Math.round(bgOffset);
  const w = Math.ceil(stageWidth) + 1; // 1px 여유로 틈새 완전 차단
  bgTile1El.style.width = `${w}px`;
  bgTile2El.style.width = `${w}px`;
  bgTile3El.style.width = `${w}px`;
  bgTile1El.style.left = `${o}px`;
  bgTile2El.style.left = `${o + Math.ceil(stageWidth)}px`;
  bgTile3El.style.left = `${o + Math.ceil(stageWidth) * 2}px`;
}

function resetScrollWorld() {
  SCROLL_SPEED = SCROLL_SPEED_EARLY;
  clearItems();
  clearHazards();
  clearChocolates();
  clearMiniStars();
  clearScorePopups();
  totalTileSpawnCount = 0;
  lastChocolateSpawnTileIndex = -2;
  initPlatforms();
  bgOffset = 0;
  updateBgScroll(0);
}

function jump() {
  if (gameState !== "playing") return;
  if (jumpCount === 0) {
    velocityY = JUMP_VELOCITY;
    jumpCount = 1;
    isOnGround = false;
    characterEl.classList.add("airborne");
    characterVisualEl.src = SPRITES.jump;
    playJumpSound();
  } else if (jumpCount === 1) {
    velocityY = JUMP_VELOCITY * 0.92;
    jumpCount = 2;
    characterVisualEl.src = SPRITES.jump;
    playDoubleJumpSound();
  }
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
    jumpCount = 0;
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
  updateMiniStars(dt);
  updateHazards(dt);
  updateChocolates(dt);
  updateBgScroll(dt);

  physicsRafId = requestAnimationFrame(physicsLoop);
}

function startCountdown(chimeStartTime) {
  gameState = "countdown";
  showScreen("countdown");

  let count = 3;
  countdownNumberEl.textContent = count;

  // Web Audio API의 currentTime 기반 음악적 리듬 정밀 스케줄링 적용
  // 시작 차임음(0.0초~0.28초) ➔ 3 (0.35초) ➔ 2 (1.35초) ➔ 1 (2.35초) ➔ START! (3.35초)
  if (soundOn && ensureAudio()) {
    const baseT = (chimeStartTime && chimeStartTime > 0) ? chimeStartTime : audioCtx.currentTime;
    const firstTickTime = baseT + 0.35;

    // 3, 2, 1 틱 사운드를 차임음 직후 1.000초 정박으로 예약
    playTone(440, firstTickTime, 0.12, "square", 0.12);        // '3' (0.35초)
    playTone(440, firstTickTime + 1.0, 0.12, "square", 0.12);  // '2' (1.35초)
    playTone(440, firstTickTime + 2.0, 0.12, "square", 0.12);  // '1' (2.35초)

    // 'START!' 피날레 사운드 (3.35초)
    playTone(660, firstTickTime + 3.0, 0.1, "square", 0.14);
    playTone(880, firstTickTime + 3.09, 0.28, "triangle", 0.18);
  }

  // 화면 UI 숫자 전환 (1초 간격)
  countdownTimerId = setInterval(() => {
    count -= 1;
    if (count > 0) {
      countdownNumberEl.textContent = count;
    } else if (count === 0) {
      countdownNumberEl.textContent = "START!";
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
  { min: 400, minGolden: 5, name: "전설의 솜뭉치", tier: 4, icon: "👑" },
  { min: 200, name: "별빛 모험가", tier: 2, icon: "⭐" },
  { min: 100, name: "꿈길 초보", tier: 0, icon: "🐾" },
];

function calcGrade(finalScore, finalGoldenCount) {
  return (
    GRADES.find((g) => finalScore >= g.min && finalGoldenCount >= (g.minGolden || 0)) ||
    GRADES[GRADES.length - 1]
  );
}

function showResult() {
  resultScoreEl.textContent = score;
  resultGoldenEl.textContent = goldenCount;
  resultFinishedEl.textContent = finished ? "완주 성공" : "게임 오버";

  const badgeEl = document.querySelector(".result-grade-badge");
  if (finished) {
    const grade = calcGrade(score, goldenCount);
    resultGradeEl.textContent = `${grade.icon} ${grade.name}`;
    badgeEl.className = `result-grade-badge grade-tier-${grade.tier}`;
    badgeEl.style.display = "";
  } else {
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
  const container = document.createElement("div");
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
  btnStart.disabled = true;

  await unlockAudio();
  const chimeT = playStartChime();
  resetGameData();

  // 브라우저 GPU 렌더링 파이프라인 사전 예열 (첫 시작 시 텍스처 디코딩 렉 100% 방지)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      btnStart.disabled = false;
      startCountdown(chimeT);
    });
  });
});

// ===== 다시 시작 버튼 =====
btnRestart.addEventListener("click", async () => {
  if (gameState === "countdown" || gameState === "playing") return;

  btnRestart.disabled = true;
  await unlockAudio();
  const chimeT = playStartChime();
  clearAllTimers();
  resetGameData();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      startCountdown(chimeT);
    });
  });
});

// ===== 점프 입력 =====
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    jump();
  }
});

let lastJumpInputTime = 0;

function handleScreenJumpInput(e) {
  if (gameState !== "playing") return;
  if (e.target.closest("button")) return;

  const now = performance.now();
  if (now - lastJumpInputTime < 60) {
    if (typeof e.preventDefault === "function" && e.cancelable) {
      e.preventDefault();
    }
    return;
  }
  lastJumpInputTime = now;

  if (typeof e.preventDefault === "function" && e.cancelable) {
    e.preventDefault();
  }
  jump();
}

gameContainerEl.addEventListener("pointerdown", handleScreenJumpInput, { passive: false });

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

// ===== 일시정지 및 홈 제어 =====
function pauseGame() {
  if (gameState !== "playing") return;
  gameState = "paused";
  if (physicsRafId !== null) {
    cancelAnimationFrame(physicsRafId);
    physicsRafId = null;
  }
  if (gameTimerId !== null) {
    clearInterval(gameTimerId);
    gameTimerId = null;
  }
  stopBgm();
  showScreen("pause");
}

function resumeGame() {
  if (gameState !== "paused") return;
  gameState = "playing";
  showScreen("playing");
  lastPhysicsTime = null;
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

function goHome() {
  clearAllTimers();
  stopBgm();
  gameState = "ready";
  resetGameData();
  showScreen("ready");
}

document.getElementById("btn-pause-playing").addEventListener("click", (e) => {
  e.stopPropagation();
  pauseGame();
});

document.getElementById("btn-home-playing").addEventListener("click", (e) => {
  e.stopPropagation();
  goHome();
});

document.getElementById("btn-resume").addEventListener("click", () => {
  resumeGame();
});

document.getElementById("btn-restart-pause").addEventListener("click", async () => {
  await unlockAudio();
  playStartChime();
  clearAllTimers();
  resetGameData();
  startCountdown();
});

document.getElementById("btn-home-pause").addEventListener("click", () => {
  goHome();
});

document.getElementById("btn-home-gameover").addEventListener("click", () => {
  goHome();
});

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
