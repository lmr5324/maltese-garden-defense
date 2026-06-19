"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const resourceValue = document.getElementById("resourceValue");
const livesValue = document.getElementById("livesValue");
const waveLabel = document.getElementById("waveLabel");
const waveFill = document.getElementById("waveFill");
const unitDock = document.getElementById("unitDock");
const wavePreview = document.getElementById("wavePreview");
const difficultyButtons = Array.from(document.querySelectorAll("[data-difficulty]"));
const hintText = document.getElementById("hintText");
const waveCallout = document.getElementById("waveCallout");
const overlay = document.getElementById("overlay");
const overlayMessage = document.getElementById("overlayMessage");
const startButton = document.getElementById("startButton");
const shovelButton = document.getElementById("shovelButton");
const soundButton = document.getElementById("soundButton");
const pauseButton = document.getElementById("pauseButton");
const restartButton = document.getElementById("restartButton");

const BASE_WIDTH = 1120;
const BASE_HEIGHT = 640;
const ROWS = 5;
const COLS = 9;
const board = { x: 150, y: 158, w: 810, h: 410 };
const cellW = board.w / COLS;
const cellH = board.h / ROWS;

const colors = {
  ink: "#263238",
  sea: "#1f8eb8",
  seaDark: "#16687f",
  limestone: "#f2d894",
  stone: "#ead189",
  garden: "#537f46",
  festa: "#d4433a",
  gold: "#f4b942",
  cactus: "#2d8b57",
  violet: "#58406f",
  ricotta: "#fff0bd",
  bronze: "#b9782f",
  health: "#55b567",
  damage: "#ce3e36",
};

const DIFFICULTIES = {
  chill: {
    name: "Chill",
    tag: "soft start",
    startingResources: 230,
    lives: 4,
    income: 22,
    incomeInterval: 4.55,
    enemyHp: 0.88,
    bite: 0.82,
    reward: 1.18,
    intermission: 4.6,
  },
  festa: {
    name: "Festa",
    tag: "normal chaos",
    startingResources: 190,
    lives: 3,
    income: 18,
    incomeInterval: 4.8,
    enemyHp: 1,
    bite: 1,
    reward: 1,
    intermission: 4,
  },
  siege: {
    name: "Siege",
    tag: "rude finale energy",
    startingResources: 175,
    lives: 2,
    income: 16,
    incomeInterval: 5.05,
    enemyHp: 1.18,
    bite: 1.22,
    reward: 1.08,
    intermission: 3.35,
  },
};

const TRAIT_COPY = {
  scout: "Basic",
  fast: "Fast",
  dance: "Air + buff",
  sneak: "Veiled",
  tank: "Tank",
  boss: "Boss",
  tide: "Regen",
  wander: "Drifter",
};

const sound = {
  ctx: null,
  master: null,
  muted: false,
  lastPlayed: new Map(),
};
const SOUND_MASTER_VOLUME = 0.16;

function ensureAudio() {
  if (sound.ctx || sound.muted) return sound.ctx;
  const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextCtor) return null;

  try {
    sound.ctx = new AudioContextCtor();
    sound.master = sound.ctx.createGain();
    sound.master.gain.value = sound.muted ? 0 : SOUND_MASTER_VOLUME;
    sound.master.connect(sound.ctx.destination);
  } catch {
    sound.ctx = null;
    sound.master = null;
  }

  return sound.ctx;
}

function resumeAudio() {
  const audio = ensureAudio();
  if (audio && audio.state === "suspended") {
    audio.resume().catch(() => {});
  }
  return audio;
}

function updateSoundButton() {
  if (!soundButton) return;
  soundButton.textContent = "♪";
  soundButton.classList.toggle("is-muted", sound.muted);
  soundButton.setAttribute("aria-label", sound.muted ? "Unmute sound" : "Mute sound");
  soundButton.title = sound.muted ? "Unmute sound" : "Mute sound";
}

function setSoundMuted(muted) {
  sound.muted = muted;
  if (sound.ctx && sound.master) {
    const now = sound.ctx.currentTime;
    sound.master.gain.cancelScheduledValues(now);
    sound.master.gain.setTargetAtTime(muted ? 0 : SOUND_MASTER_VOLUME, now, 0.018);
  }
  updateSoundButton();
}

function canPlaySound(name, minGap) {
  const now = performance.now();
  const last = sound.lastPlayed.get(name) || 0;
  if (now - last < minGap * 1000) return false;
  sound.lastPlayed.set(name, now);
  return true;
}

function tone(frequency, duration, options = {}) {
  const audio = sound.ctx;
  if (!audio || !sound.master) return;

  const delay = options.delay || 0;
  const attack = options.attack ?? 0.006;
  const release = options.release ?? 0.055;
  const gainValue = options.gain ?? 0.05;
  const start = audio.currentTime + delay;
  const stop = start + duration + release + 0.025;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();

  oscillator.type = options.type || "sine";
  oscillator.frequency.setValueAtTime(frequency, start);
  if (options.endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, options.endFrequency), start + duration);
  }
  if (options.detune) {
    oscillator.detune.setValueAtTime(options.detune, start);
  }

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(gainValue, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration + release);

  oscillator.connect(gain);
  gain.connect(sound.master);
  oscillator.start(start);
  oscillator.stop(stop);
}

function sweep(startFrequency, endFrequency, duration, options = {}) {
  tone(startFrequency, duration, { ...options, endFrequency });
}

function noise(duration, options = {}) {
  const audio = sound.ctx;
  if (!audio || !sound.master) return;

  const delay = options.delay || 0;
  const attack = options.attack ?? 0.004;
  const release = options.release ?? 0.05;
  const gainValue = options.gain ?? 0.04;
  const start = audio.currentTime + delay;
  const buffer = audio.createBuffer(1, Math.max(1, Math.floor(audio.sampleRate * duration)), audio.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < data.length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();

  source.buffer = buffer;
  filter.type = options.filterType || "bandpass";
  filter.frequency.setValueAtTime(options.filter || 900, start);
  filter.Q.setValueAtTime(options.q || 1.2, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(gainValue, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration + release);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(sound.master);
  source.start(start);
  source.stop(start + duration + release + 0.025);
}

function playSound(name, options = {}) {
  if (sound.muted) return;
  const minGap =
    options.minGap ??
    ({
      burn: 0.18,
      chew: 0.16,
      crack: 0.18,
      defeat: 0.08,
      dogRoar: 0.08,
      boss: 0.5,
      freeze: 0.1,
      hit: 0.045,
      resource: 0.08,
      shoot: 0.055,
      shatter: 0.16,
      sell: 0.12,
      ultra: 0.45,
    }[name] ||
      0.025);
  if (!options.force && !canPlaySound(name, minGap)) return;

  const audio = resumeAudio();
  if (!audio || !sound.master) return;

  switch (name) {
    case "select":
      tone(540, 0.045, { type: "square", gain: 0.032, release: 0.025 });
      break;
    case "place":
      tone(330, 0.055, { type: "triangle", gain: 0.048 });
      tone(560, 0.085, { type: "sine", gain: 0.036, delay: 0.035 });
      break;
    case "start":
      tone(392, 0.11, { type: "triangle", gain: 0.045 });
      tone(523, 0.13, { type: "triangle", gain: 0.04, delay: 0.08 });
      tone(659, 0.16, { type: "sine", gain: 0.035, delay: 0.17 });
      break;
    case "pause":
      sweep(500, 310, 0.12, { type: "triangle", gain: 0.04 });
      break;
    case "resume":
      sweep(320, 520, 0.12, { type: "triangle", gain: 0.04 });
      break;
    case "wave":
      tone(196, 0.18, { type: "sawtooth", gain: 0.035 });
      tone(392, 0.18, { type: "triangle", gain: 0.04, delay: 0.1 });
      noise(0.18, { gain: 0.025, filter: 1500, filterType: "bandpass", delay: 0.02 });
      break;
    case "resource":
      tone(760, 0.075, { type: "sine", gain: 0.037 });
      tone(1040, 0.105, { type: "sine", gain: 0.028, delay: 0.045 });
      break;
    case "upgrade":
      tone(520, 0.07, { type: "triangle", gain: 0.042 });
      tone(760, 0.08, { type: "sine", gain: 0.036, delay: 0.06 });
      tone(1040, 0.12, { type: "sine", gain: 0.03, delay: 0.13 });
      break;
    case "ultra":
      tone(520, 0.08, { type: "triangle", gain: 0.05 });
      tone(760, 0.1, { type: "sine", gain: 0.044, delay: 0.055 });
      tone(1040, 0.12, { type: "sine", gain: 0.04, delay: 0.13 });
      tone(1320, 0.16, { type: "triangle", gain: 0.032, delay: 0.22 });
      noise(0.14, { gain: 0.025, filter: 2600, filterType: "highpass", delay: 0.09 });
      break;
    case "sell":
      sweep(420, 260, 0.09, { type: "triangle", gain: 0.042 });
      tone(680, 0.055, { type: "sine", gain: 0.026, delay: 0.08 });
      noise(0.07, { gain: 0.02, filter: 800, filterType: "bandpass" });
      break;
    case "dogRoar": {
      const power = options.power || 1;
      sweep(360 - power * 34, 210 - power * 18, 0.09 + power * 0.035, {
        type: "triangle",
        gain: 0.024 + power * 0.007,
        release: 0.045,
      });
      tone(610 + power * 95, 0.045, {
        type: "square",
        gain: 0.014 + power * 0.004,
        delay: 0.025,
        release: 0.025,
      });
      noise(0.05 + power * 0.018, {
        gain: 0.01 + power * 0.004,
        filter: 920,
        filterType: "bandpass",
        delay: 0.018,
      });
      break;
    }
    case "boss":
      sweep(130, 62, 0.34, { type: "sawtooth", gain: 0.074, release: 0.12 });
      noise(0.22, { gain: 0.056, filter: 300, filterType: "lowpass" });
      tone(196, 0.1, { type: "triangle", gain: 0.032, delay: 0.18 });
      break;
    case "shoot":
      if (options.kind === "bell") {
        tone(420, 0.16, { type: "sine", gain: 0.04 });
      } else if (options.kind === "spike") {
        sweep(820, 1040, 0.06, { type: "triangle", gain: 0.034 });
      } else if (options.kind === "petal") {
        tone(660, 0.045, { type: "triangle", gain: 0.032 });
      } else if (options.kind === "bone") {
        tone(410, 0.045, { type: "square", gain: 0.028 });
        noise(0.035, { gain: 0.018, filter: 1200, filterType: "bandpass" });
      } else {
        sweep(260, 180, 0.07, { type: "sawtooth", gain: 0.035 });
      }
      break;
    case "hit":
      noise(0.045, { gain: 0.035, filter: 620, filterType: "lowpass" });
      break;
    case "melee":
      noise(0.052, { gain: 0.044, filter: 760, filterType: "bandpass" });
      tone(170, 0.05, { type: "square", gain: 0.022 });
      break;
    case "bell":
      tone(520, 0.34, { type: "sine", gain: 0.065, release: 0.2 });
      tone(780, 0.38, { type: "sine", gain: 0.033, release: 0.24 });
      break;
    case "freeze":
      tone(1180, 0.09, { type: "triangle", gain: 0.04 });
      sweep(1600, 900, 0.18, { type: "sine", gain: 0.03, delay: 0.035 });
      break;
    case "shatter":
      noise(0.12, { gain: 0.065, filter: 2600, filterType: "highpass", q: 0.8 });
      tone(1320, 0.08, { type: "triangle", gain: 0.035, delay: 0.015 });
      break;
    case "pop":
      noise(0.07, { gain: 0.07, filter: 1200, filterType: "bandpass" });
      sweep(520, 220, 0.08, { type: "triangle", gain: 0.042 });
      break;
    case "float":
      sweep(430, 720, 0.2, { type: "sine", gain: 0.036 });
      tone(960, 0.08, { type: "triangle", gain: 0.025, delay: 0.11 });
      break;
    case "reveal":
      noise(0.11, { gain: 0.034, filter: 1800, filterType: "bandpass" });
      sweep(620, 420, 0.16, { type: "triangle", gain: 0.03 });
      break;
    case "burn":
      noise(0.16, { gain: 0.042, filter: 1800, filterType: "bandpass" });
      tone(220, 0.055, { type: "triangle", gain: 0.022 });
      break;
    case "bomb":
      sweep(130, 48, 0.38, { type: "sawtooth", gain: 0.1, release: 0.13 });
      noise(0.32, { gain: 0.1, filter: 165, filterType: "lowpass", q: 0.7 });
      noise(0.18, { gain: 0.04, filter: 2300, filterType: "bandpass", delay: 0.05 });
      break;
    case "chew":
      noise(0.046, { gain: 0.032, filter: 720, filterType: "bandpass" });
      break;
    case "crack":
      noise(0.105, { gain: 0.062, filter: 900, filterType: "bandpass" });
      tone(170, 0.06, { type: "square", gain: 0.035 });
      break;
    case "break":
      noise(0.14, { gain: 0.07, filter: 520, filterType: "lowpass" });
      sweep(240, 90, 0.16, { type: "triangle", gain: 0.04 });
      break;
    case "defeat":
      sweep(340, 150, 0.18, { type: "triangle", gain: 0.038 });
      noise(0.1, { gain: 0.032, filter: 580, filterType: "lowpass", delay: 0.03 });
      break;
    case "gate":
      tone(95, 0.24, { type: "sawtooth", gain: 0.055 });
      noise(0.18, { gain: 0.052, filter: 430, filterType: "lowpass" });
      break;
    case "win":
      tone(392, 0.12, { type: "triangle", gain: 0.046 });
      tone(523, 0.12, { type: "triangle", gain: 0.044, delay: 0.11 });
      tone(659, 0.2, { type: "sine", gain: 0.046, delay: 0.23 });
      break;
    case "lose":
      tone(220, 0.16, { type: "triangle", gain: 0.046 });
      tone(165, 0.2, { type: "triangle", gain: 0.044, delay: 0.12 });
      tone(110, 0.34, { type: "sine", gain: 0.045, delay: 0.28 });
      break;
    default:
      break;
  }
}

const SPRITE_FILES = {
  tie_mascot: "assets/sprites/tie_mascot.png",
  window_mascot: "assets/sprites/window_mascot.png",
  bucket_mascot: "assets/sprites/bucket_mascot.png",
  cone_mascot: "assets/sprites/cone_mascot.png",
  blue_cannon: "assets/sprites/blue_cannon.png",
  green_cannon: "assets/sprites/green_cannon.png",
  mushroom_mascot: "assets/sprites/mushroom_mascot.png",
  chomper_mascot: "assets/sprites/chomper_mascot.png",
  balloon_white: "assets/sprites/balloon_white.png",
  balloon_tan: "assets/sprites/balloon_tan.png",
  pink_bud: "assets/sprites/pink_bud.png",
  flag_mascot: "assets/sprites/flag_mascot.png",
  flower_white: "assets/sprites/flower_white.png",
  pirate_mascot: "assets/sprites/pirate_mascot.png",
  sunflower_white: "assets/sprites/sunflower_white.png",
  sunflower_tan: "assets/sprites/sunflower_tan.png",
  star_mascot: "assets/sprites/star_mascot.png",
  melon_mascot: "assets/sprites/melon_mascot.png",
  apple_mascot: "assets/sprites/apple_mascot.png",
  cherry_mascot: "assets/sprites/cherry_mascot.png",
  dog_pastizz: "assets/sprites/dog-v1/dog_pastizz.png",
  dog_luzzu: "assets/sprites/dog-v1/dog_luzzu.png",
  dog_bajtra: "assets/sprites/dog-v1/dog_bajtra.png",
  dog_knight: "assets/sprites/dog-v1/dog_knight.png",
  dog_bomb: "assets/sprites/dog-v1/dog_bomb.png",
  dog_bell: "assets/sprites/dog-v1/dog_bell.png",
  dog_blue_base: "assets/sprites/dog-v1/dog_blue_base_idle.png",
  dog_blue_upgrade1: "assets/sprites/dog-v1/dog_blue_upgrade1_idle.png",
  dog_blue_ultra: "assets/sprites/dog-v1/dog_blue_ultra_idle.png",
  dog_tourist: "assets/sprites/dog-v1/dog_tourist.png",
  dog_runner: "assets/sprites/dog-v1/dog_runner.png",
  dog_shadow: "assets/sprites/dog-v1/dog_shadow.png",
  dog_limestone: "assets/sprites/dog-v1/dog_limestone.png",
  dog_cruise: "assets/sprites/dog-v1/dog_cruise.png",
  dog_sea: "assets/sprites/dog-v1/dog_sea.png",
};

const DEFENDERS = {
  lantern: {
    name: "Luzzu Lantern",
    short: "LL",
    color: "#1f8eb8",
    sprite: "sunflower_tan",
    spriteWidth: 84,
    spriteHeight: 84,
    cost: 50,
    cooldown: 4,
    health: 160,
    generator: true,
    interval: 5.6,
    glow: 35,
    description: "Makes Harbor Light",
  },
  pastizz: {
    name: "Pastizz Cannon",
    short: "PC",
    color: "#d9a53c",
    sprite: "green_cannon",
    spriteWidth: 86,
    spriteHeight: 80,
    cost: 80,
    cooldown: 3.4,
    health: 175,
    fireRate: 1.35,
    damage: 28,
    projectileSpeed: 340,
    projectile: "pastizz",
    description: "Shatters frosted foes",
  },
  bajtra: {
    name: "Bajtra Cactus",
    short: "BC",
    color: "#2d8b57",
    sprite: "blue_cannon",
    spriteWidth: 86,
    spriteHeight: 80,
    cost: 95,
    cooldown: 4.5,
    health: 185,
    fireRate: 0.92,
    damage: 18,
    projectileSpeed: 390,
    projectile: "spike",
    slow: 0.62,
    slowDuration: 1.15,
    freezeDuration: 0.85,
    description: "Frosty prickly spikes",
  },
  pinkbud: {
    name: "Pink Bud",
    short: "PB",
    color: "#e45a78",
    sprite: "pink_bud",
    spriteWidth: 82,
    spriteHeight: 78,
    cost: 75,
    cooldown: 4.8,
    health: 145,
    fireRate: 0.86,
    damage: 12,
    projectileSpeed: 385,
    projectile: "petal",
    airborneOnly: true,
    popBalloon: true,
    popDamage: 28,
    description: "Pops festa balloons",
  },
  bluepup: {
    name: "Blue Grotto Pup",
    short: "BG",
    color: "#31a6d9",
    sprite: "dog_blue_base",
    spriteWidth: 96,
    spriteHeight: 70,
    spriteOffsetX: 8,
    cost: 110,
    cooldown: 5.2,
    health: 170,
    fireRate: 1.08,
    damage: 17,
    projectileSpeed: 410,
    projectile: "bone",
    projectileScale: 0.78,
    muzzleX: 38,
    muzzleY: -15,
    shots: 1,
    description: "Upgrades into triple bones",
    upgrades: [
      {
        name: "Sharper Bones",
        sprite: "dog_blue_upgrade1",
        spriteWidth: 100,
        spriteHeight: 60,
        spriteOffsetX: 12,
        cost: 85,
        healthBoost: 25,
        fireRate: 0.95,
        damage: 22,
        projectileSpeed: 430,
        projectileScale: 1.05,
        muzzleX: 39,
        muzzleY: -14,
        shots: 1,
      },
      {
        name: "Ultra Bones",
        sprite: "dog_blue_ultra",
        spriteWidth: 104,
        spriteHeight: 64,
        spriteOffsetX: 4,
        cost: 150,
        healthBoost: 35,
        fireRate: 1.18,
        damage: 14,
        projectileSpeed: 440,
        projectileScale: 1.32,
        muzzleX: 48,
        muzzleY: -13,
        shots: 3,
        shotSpread: 17,
      },
    ],
  },
  knight: {
    name: "Knight of Mdina",
    short: "KM",
    color: "#6d7f86",
    sprite: "melon_mascot",
    spriteWidth: 86,
    spriteHeight: 84,
    cost: 70,
    cooldown: 5.8,
    health: 470,
    melee: true,
    damage: 26,
    fireRate: 0.8,
    range: 58,
    description: "Armored blocker",
  },
  bomb: {
    name: "Għajn Tuffieħa Bomb",
    short: "GB",
    color: "#d4433a",
    sprite: "cherry_mascot",
    spriteWidth: 82,
    spriteHeight: 74,
    cost: 130,
    cooldown: 9.5,
    health: 120,
    bomb: true,
    armTime: 2.4,
    damage: 180,
    radius: 126,
    burnDuration: 2.4,
    burnDps: 18,
    description: "Delayed scorch blast",
  },
  bell: {
    name: "Siege Bell",
    short: "SB",
    color: "#b9782f",
    sprite: "star_mascot",
    spriteWidth: 82,
    spriteHeight: 82,
    cost: 110,
    cooldown: 6.8,
    health: 170,
    fireRate: 2.35,
    damage: 8,
    projectileSpeed: 315,
    projectile: "bell",
    slow: 0.45,
    slowDuration: 2.2,
    description: "Extends frost and slows",
  },
};

const ENEMIES = {
  tourist: {
    name: "Grumpy Tourist",
    color: "#efc46d",
    roleColor: "#d9a53c",
    trait: "scout",
    roleLabel: "SCOUT",
    sprite: "tie_mascot",
    spriteWidth: 70,
    spriteHeight: 82,
    hp: 100,
    speed: 25,
    damage: 21,
    radius: 25,
    reward: 8,
    barWidth: 56,
  },
  runner: {
    name: "Festa Firework Runner",
    color: "#d4433a",
    roleColor: "#d4433a",
    trait: "fast",
    roleLabel: "FAST",
    sprite: "cone_mascot",
    spriteWidth: 68,
    spriteHeight: 80,
    hp: 64,
    speed: 58,
    damage: 15,
    radius: 22,
    reward: 9,
    barWidth: 46,
  },
  dancer: {
    name: "Festa Dancer",
    color: "#e45a78",
    roleColor: "#d4433a",
    trait: "dance",
    roleLabel: "BEAT",
    sprite: "balloon_tan",
    spriteWidth: 86,
    spriteHeight: 90,
    hp: 188,
    speed: 21,
    damage: 18,
    radius: 28,
    reward: 16,
    balloon: true,
    floatSkips: 2,
    floatHeight: 24,
    floatBypassSpeed: 92,
    danceAura: true,
    danceCycle: 4.8,
    danceDuration: 1.75,
    danceRadius: 168,
    danceBoost: 0.36,
    barWidth: 66,
  },
  shadow: {
    name: "Ħares Shadow",
    color: "#58406f",
    roleColor: "#58406f",
    trait: "sneak",
    roleLabel: "SLIP",
    sprite: "pirate_mascot",
    spriteWidth: 78,
    spriteHeight: 86,
    hp: 118,
    speed: 34,
    damage: 19,
    radius: 24,
    reward: 10,
    elusive: true,
    revealShield: true,
    veiledSpeedBoost: 1.42,
    revealDamageScale: 0.22,
    barWidth: 58,
  },
  brute: {
    name: "Limestone Brute",
    color: "#b9a372",
    roleColor: "#8d7b56",
    trait: "tank",
    roleLabel: "TANK",
    sprite: "bucket_mascot",
    spriteWidth: 76,
    spriteHeight: 88,
    hp: 340,
    speed: 14,
    damage: 32,
    radius: 34,
    reward: 18,
    barWidth: 78,
  },
  stonehound: {
    name: "St Elmo Stone Hound",
    color: "#c6b079",
    roleColor: "#7c6a3d",
    trait: "boss",
    roleLabel: "BOSS",
    sprite: "dog_limestone",
    spriteWidth: 92,
    spriteHeight: 100,
    hp: 560,
    speed: 11.5,
    damage: 40,
    radius: 38,
    reward: 28,
    barWidth: 90,
  },
  cruise: {
    name: "Lost Cruise Passenger",
    color: "#4a8bb4",
    roleColor: "#4a8bb4",
    trait: "wander",
    roleLabel: "DRIFT",
    sprite: "window_mascot",
    spriteWidth: 76,
    spriteHeight: 86,
    hp: 146,
    speed: 23,
    damage: 20,
    radius: 24,
    reward: 11,
    wander: true,
    barWidth: 62,
  },
  ghoul: {
    name: "Sea Ghoul",
    color: "#1f736f",
    roleColor: "#1f8eb8",
    trait: "tide",
    roleLabel: "TIDE",
    sprite: "flag_mascot",
    spriteWidth: 78,
    spriteHeight: 86,
    hp: 265,
    speed: 21,
    damage: 27,
    radius: 30,
    reward: 17,
    tide: true,
    barWidth: 70,
  },
};

const SPAWN_TUNES = {
  guard: {
    hpMult: 1.18,
    biteMult: 1.08,
    speedMult: 0.96,
    rewardMult: 0.92,
    label: "GUARD",
    color: "#c6b079",
  },
  high: {
    hpMult: 1.28,
    biteMult: 1.04,
    speedMult: 1.04,
    rewardMult: 0.9,
    floatSkipsAdd: 1,
    label: "HIGH",
    color: "#e45a78",
  },
  surge: {
    hpMult: 1.08,
    biteMult: 1.08,
    speedMult: 1.22,
    rewardMult: 0.88,
    label: "SURGE",
    color: colors.festa,
  },
  slip: {
    hpMult: 1.12,
    biteMult: 1.08,
    speedMult: 1.12,
    rewardMult: 0.88,
    label: "SLIP+",
    color: colors.violet,
  },
  captain: {
    hpMult: 1.24,
    biteMult: 1.16,
    speedMult: 0.96,
    rewardMult: 0.95,
    label: "CAPTAIN",
    color: "#7c6a3d",
  },
};

function tuneSpawn(kind, overrides = {}) {
  return { ...(SPAWN_TUNES[kind] || {}), ...overrides };
}

const WAVES = [
  {
    title: "The camera-clicking scouts",
    threat: "learn the basic pace",
    hint: "Build light, then add cannons before the lanes crowd up.",
    hpScale: 0.92,
    biteScale: 0.9,
    rewardScale: 1.06,
    spawns: [
      [1.2, "tourist", 0],
      [3.9, "tourist", 2],
      [6.8, "tourist", 4],
      [10.4, "tourist", 1],
      [13.7, "tourist", 3],
      [17.1, "tourist", 0],
    ],
  },
  {
    title: "Festa sparks in the street",
    threat: "fast but fragile runners",
    hint: "Runners are fragile, but empty lanes punish slow reactions.",
    hpScale: 0.96,
    biteScale: 0.94,
    rewardScale: 1.04,
    spawns: [
      [1.0, "runner", 1],
      [2.6, "tourist", 0],
      [4.8, "tourist", 3],
      [6.8, "runner", 4],
      [9.3, "tourist", 2],
      [11.2, "runner", 0],
      [14.8, "runner", 3],
      [16.4, "tourist", 1],
    ],
  },
  {
    title: "Folklore in the garden shade",
    threat: "slippery shadows and the first festa beat",
    hint: "Bells reveal shadows; Pink Bud pops balloon dancers.",
    hpScale: 1.12,
    biteScale: 1.08,
    spawns: [
      [1.1, "shadow", 2],
      [2.9, "tourist", 1],
      [5.0, "runner", 4],
      [6.4, "dancer", 2],
      [7.4, "cruise", 0],
      [9.8, "shadow", 3],
      [12.3, "tourist", 2],
      [14.2, "runner", 1],
      [16.5, "cruise", 4],
      [18.4, "shadow", 0],
    ],
  },
  {
    title: "A limestone problem with legs",
    threat: "brutes get dangerous near dancers",
    hint: "Support Knights before dancers make the chewing ugly.",
    hpScale: 1.38,
    biteScale: 1.32,
    spawns: [
      [1.0, "brute", 3],
      [2.8, "tourist", 0],
      [4.7, "runner", 2],
      [6.7, "cruise", 4],
      [8.4, "dancer", 2],
      [9.3, "shadow", 1],
      [11.5, "runner", 3],
      [13.0, "tourist", 4],
      [15.6, "brute", 0],
      [17.0, "dancer", 4],
      [18.1, "shadow", 2],
      [20.3, "runner", 4],
    ],
  },
  {
    title: "The harbor sends a warning",
    threat: "mixed pressure before the stone hounds",
    hint: "Start upgrading key lanes. The next waves punish thin defenses.",
    hpScale: 1.54,
    biteScale: 1.48,
    rewardScale: 0.94,
    spawns: [
      [1.0, "ghoul", 2],
      [2.3, "runner", 0],
      [3.9, "shadow", 4],
      [4.8, "dancer", 2],
      [5.3, "tourist", 1],
      [6.7, "brute", 3],
      [8.5, "cruise", 0],
      [10.0, "runner", 2],
      [11.4, "ghoul", 4],
      [13.3, "shadow", 1],
      [15.0, "brute", 2],
      [16.5, "runner", 3],
      [17.2, "dancer", 0],
      [18.2, "cruise", 4],
      [20.0, "ghoul", 0],
      [21.4, "runner", 1],
      [22.8, "shadow", 3],
      [24.0, "tourist", 4],
      [25.4, "cruise", 2],
      [26.8, "runner", 0],
      [28.4, "brute", 4],
    ],
  },
  {
    title: "Stone paws from St Elmo",
    threat: "boss hounds chew through blockers",
    hint: "Knights buy time, but upgraded bones and bombs do the finishing work.",
    hpScale: 1.72,
    biteScale: 1.7,
    rewardScale: 0.86,
    spawns: [
      [1.0, "stonehound", 2, tuneSpawn("guard")],
      [2.4, "runner", 0],
      [3.7, "tourist", 4],
      [5.3, "shadow", 1, tuneSpawn("slip")],
      [6.6, "dancer", 2, tuneSpawn("high")],
      [7.4, "runner", 2, tuneSpawn("surge")],
      [8.4, "ghoul", 3],
      [10.2, "cruise", 0],
      [12.0, "brute", 4],
      [13.4, "dancer", 4, tuneSpawn("high")],
      [14.2, "runner", 1, tuneSpawn("surge")],
      [16.1, "shadow", 3, tuneSpawn("slip")],
      [17.2, "cruise", 2, tuneSpawn("surge", { label: "DRIFT+", color: "#4a8bb4" })],
      [18.6, "stonehound", 0, tuneSpawn("guard", { hpMult: 1.24 })],
      [20.4, "dancer", 4, tuneSpawn("high")],
      [22.0, "ghoul", 2],
      [23.1, "shadow", 1, tuneSpawn("slip")],
      [24.2, "runner", 3, tuneSpawn("surge")],
      [25.0, "dancer", 0, tuneSpawn("high", { hpMult: 1.18 })],
      [26.0, "brute", 1, tuneSpawn("guard")],
    ],
  },
  {
    title: "Grand Harbour last call",
    threat: "everything arrives with boss pressure",
    hint: "Keep Pink Buds ready, save bombs for clusters, and let ultra bones work.",
    hpScale: 1.98,
    biteScale: 1.92,
    rewardScale: 0.78,
    spawns: [
      [1.0, "stonehound", 1, tuneSpawn("guard")],
      [2.0, "dancer", 2, tuneSpawn("high")],
      [3.2, "runner", 0, tuneSpawn("surge")],
      [4.4, "shadow", 4, tuneSpawn("slip")],
      [5.5, "ghoul", 3],
      [6.6, "cruise", 0],
      [7.5, "brute", 2, tuneSpawn("guard")],
      [8.8, "runner", 4, tuneSpawn("surge")],
      [9.5, "dancer", 0, tuneSpawn("high", { hpMult: 1.18 })],
      [10.2, "shadow", 1, tuneSpawn("slip")],
      [11.4, "dancer", 3, tuneSpawn("high")],
      [12.6, "ghoul", 0],
      [14.0, "stonehound", 4, tuneSpawn("captain", { hpMult: 1.18 })],
      [15.4, "runner", 2, tuneSpawn("surge")],
      [16.6, "cruise", 1, tuneSpawn("surge", { label: "DRIFT+", color: "#4a8bb4" })],
      [18.0, "brute", 3, tuneSpawn("guard", { hpMult: 1.26 })],
      [19.5, "shadow", 0, tuneSpawn("slip")],
      [20.8, "dancer", 2, tuneSpawn("high", { hpMult: 1.34 })],
      [22.0, "ghoul", 4],
      [23.6, "runner", 1, tuneSpawn("surge")],
      [24.2, "runner", 3, tuneSpawn("surge")],
      [25.0, "stonehound", 2, tuneSpawn("captain")],
      [26.1, "dancer", 1, tuneSpawn("high")],
      [26.5, "cruise", 3, tuneSpawn("surge", { label: "DRIFT+", color: "#4a8bb4" })],
      [27.8, "shadow", 4, tuneSpawn("slip")],
      [28.4, "dancer", 3, tuneSpawn("high", { hpMult: 1.2 })],
      [29.0, "brute", 0, tuneSpawn("guard")],
      [30.4, "ghoul", 1, tuneSpawn("guard", { label: "TIDE+", color: "#69c7bf" })],
      [31.4, "shadow", 2, tuneSpawn("slip", { hpMult: 1.24 })],
      [32.4, "runner", 4, tuneSpawn("surge")],
    ],
  },
];

const previewParams = new URLSearchParams(globalThis.location?.search || "");

if (previewParams.get("festa") === "early") {
  WAVES[0].title = "A festa beat arrives early";
  WAVES[0].threat = "preview the dancer aura";
  WAVES[0].spawns.splice(1, 0, [2.4, "dancer", 2], [3.0, "runner", 1], [3.6, "runner", 3]);
}

if (previewParams.get("shadow") === "early") {
  WAVES[0].title = "A shadow slips in early";
  WAVES[0].threat = "bells and frost reveal veiled enemies";
  WAVES[0].spawns.splice(1, 0, [2.1, "shadow", 2], [7.2, "shadow", 4]);
}

const requestedDifficulty = previewParams.get("difficulty");
const cardElements = new Map();
const decoration = createDecoration();
const sprites = loadSprites();
const spriteMaskCache = new Map();

let state;
let lastFrame = performance.now();
let idSeed = 0;
let selectedDifficulty = DIFFICULTIES[requestedDifficulty] ? requestedDifficulty : "festa";
let wavePreviewKey = "";

function createDecoration() {
  const items = {
    grassSpeckles: [],
    grassTufts: [],
    flowers: [],
    stonePocks: [],
    stoneCracks: [],
    roadSpeckles: [],
    seaGlints: [],
    wallPocks: [],
  };
  let seed = 7;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const x = board.x + col * cellW;
      const y = board.y + row * cellH;

      for (let i = 0; i < 5; i += 1) {
        items.grassSpeckles.push({
          x: x + 7 + rand() * (cellW - 14),
          y: y + 7 + rand() * (cellH - 14),
          r: 0.6 + rand() * 1.9,
          a: 0.08 + rand() * 0.16,
          light: rand() > 0.55,
        });
      }

      if (rand() > 0.28) {
        items.grassTufts.push({
          x: x + 12 + rand() * (cellW - 24),
          y: y + cellH * (0.64 + rand() * 0.24),
          scale: 0.72 + rand() * 0.65,
          lean: -0.45 + rand() * 0.9,
          color: rand() > 0.5 ? "#3f8b4b" : "#5c9f4f",
          a: 0.28 + rand() * 0.2,
        });
      }

      if (rand() > 0.78) {
        items.flowers.push({
          x: x + 16 + rand() * (cellW - 32),
          y: y + 22 + rand() * (cellH - 38),
          scale: 0.65 + rand() * 0.55,
          color: ["#d4433a", "#f4b942", "#fff8e8", "#66c3d6"][Math.floor(rand() * 4)],
        });
      }
    }
  }

  for (let i = 0; i < 120; i += 1) {
    const side = Math.floor(rand() * 4);
    const horizontal = side < 2;
    items.stonePocks.push({
      x: horizontal
        ? board.x - 12 + rand() * (board.w + 24)
        : board.x - 12 + (side === 2 ? rand() * 12 : board.w + rand() * 12),
      y: horizontal
        ? board.y - 12 + (side === 0 ? rand() * 12 : board.h + rand() * 12)
        : board.y - 12 + rand() * (board.h + 24),
      r: 0.7 + rand() * 2.2,
      a: 0.08 + rand() * 0.12,
    });
  }

  for (let i = 0; i < 22; i += 1) {
    const verticalSide = rand() > 0.5;
    items.stoneCracks.push({
      x: verticalSide
        ? board.x - 9 + (rand() > 0.5 ? board.w + rand() * 12 : rand() * 12)
        : board.x + rand() * board.w,
      y: verticalSide
        ? board.y + rand() * board.h
        : board.y - 9 + (rand() > 0.5 ? board.h + rand() * 12 : rand() * 12),
      len: 10 + rand() * 24,
      angle: rand() * Math.PI,
      a: 0.13 + rand() * 0.12,
    });
  }

  for (let i = 0; i < 90; i += 1) {
    items.roadSpeckles.push({
      x: board.x + board.w + 30 + rand() * 76,
      y: board.y - 4 + rand() * (board.h + 8),
      r: 0.8 + rand() * 2.5,
      a: 0.08 + rand() * 0.16,
    });
  }

  for (let i = 0; i < 34; i += 1) {
    items.seaGlints.push({
      x: 20 + rand() * (BASE_WIDTH - 40),
      y: 96 + rand() * 38,
      w: 18 + rand() * 38,
      a: 0.12 + rand() * 0.16,
    });
  }

  for (let i = 0; i < 150; i += 1) {
    items.wallPocks.push({
      x: rand() * BASE_WIDTH,
      y: 128 + rand() * 58,
      r: 0.8 + rand() * 2.4,
      a: 0.06 + rand() * 0.11,
    });
  }

  return items;
}

function loadSprites() {
  const loaded = {};
  const defenderSprites = Object.values(DEFENDERS).flatMap((unit) => [
    unit.sprite,
    ...(unit.upgrades || []).map((upgrade) => upgrade.sprite),
  ]);
  const usedSprites = new Set([
    ...defenderSprites,
    ...Object.values(ENEMIES).map((unit) => unit.sprite),
  ]);

  Object.entries(SPRITE_FILES).forEach(([key, src]) => {
    if (!usedSprites.has(key)) return;
    const image = new Image();
    image.src = src;
    loaded[key] = image;
  });
  return loaded;
}

function makeId(prefix) {
  idSeed += 1;
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${idSeed}`;
}

function getDifficulty() {
  return DIFFICULTIES[selectedDifficulty] || DIFFICULTIES.festa;
}

function canChangeDifficulty() {
  return !state || state.status === "ready" || state.status === "won" || state.status === "lost";
}

function updateDifficultyControls() {
  const locked = !canChangeDifficulty();
  difficultyButtons.forEach((button) => {
    const active = button.dataset.difficulty === selectedDifficulty;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    button.disabled = locked;
  });
}

function selectDifficulty(type) {
  if (!DIFFICULTIES[type] || selectedDifficulty === type || !canChangeDifficulty()) return;
  selectedDifficulty = type;
  playSound("select");
  resetGame();
}

function getPreviewWaveIndex() {
  if (!state) return 0;
  if (state.waveIndex >= 0) return state.waveIndex;
  if (state.status === "won" || state.status === "lost") return 0;
  return Math.min(WAVES.length - 1, Math.max(0, state.nextWave));
}

function summarizeWave(wave) {
  const summary = new Map();
  wave.spawns.forEach(([, type]) => {
    if (!summary.has(type)) {
      summary.set(type, { type, count: 0 });
    }
    summary.get(type).count += 1;
  });
  return Array.from(summary.values());
}

function updateWavePreview(force = false) {
  if (!wavePreview || !state) return;

  const index = getPreviewWaveIndex();
  const wave = WAVES[index];
  const difficulty = getDifficulty();
  const modeText = state.status === "playing" && state.waveIndex >= 0 ? "Current wave" : "Incoming wave";
  const previewKey = `${state.status}:${state.waveIndex}:${index}:${selectedDifficulty}:${state.spawnCursor}:${state.completedWaves}:${state.nextWave}`;

  if (!force && previewKey === wavePreviewKey) return;
  wavePreviewKey = previewKey;

  const enemyItems = summarizeWave(wave)
    .map(({ type, count }) => {
      const data = ENEMIES[type];
      const trait = TRAIT_COPY[data.trait] || data.roleLabel;
      return `
        <span class="preview-enemy" title="${data.name}">
          <span class="preview-enemy-token" style="--enemy-color: ${data.roleColor || data.color}">
            <img src="${SPRITE_FILES[data.sprite]}" alt="" />
          </span>
          <span class="preview-enemy-copy">
            <strong>${count}× ${data.roleLabel}</strong>
            <small>${trait}</small>
          </span>
        </span>
      `;
    })
    .join("");

  wavePreview.innerHTML = `
    <div class="preview-copy">
      <span class="preview-kicker">${modeText} · ${difficulty.name} · ${difficulty.tag}</span>
      <strong>Wave ${index + 1}: ${wave.title}</strong>
      <small>${wave.hint || wave.threat || ""}</small>
    </div>
    <div class="preview-enemies">${enemyItems}</div>
  `;
}

function newState() {
  const difficulty = getDifficulty();
  const cooldowns = {};
  Object.keys(DEFENDERS).forEach((key) => {
    cooldowns[key] = 0;
  });

  return {
    status: "ready",
    time: 0,
    difficulty: selectedDifficulty,
    resources: difficulty.startingResources,
    lives: difficulty.lives,
    selected: null,
    toolMode: null,
    defenders: [],
    enemies: [],
    deathEffects: [],
    projectiles: [],
    particles: [],
    cooldowns,
    occupied: new Map(),
    pointer: null,
    hoverTile: null,
    intermission: 0,
    nextWave: 0,
    waveIndex: -1,
    completedWaves: 0,
    waveElapsed: 0,
    spawnCursor: 0,
    incomeTimer: difficulty.incomeInterval * 0.88,
    shake: 0,
    waveMessageTimer: 0,
  };
}

function resetGame() {
  state = newState();
  wavePreviewKey = "";
  overlay.classList.add("is-visible");
  overlayMessage.textContent =
    `${getDifficulty().name} route: hold the village garden through seven waves of tourist chaos, folklore shadows, and limestone trouble.`;
  startButton.textContent = "Start the Festa";
  pauseButton.textContent = "II";
  updateToolControls();
  updateSoundButton();
  updateDifficultyControls();
  updateWavePreview(true);
  updateHud();
  updateCards();
}

function startGame() {
  if (state.status === "won" || state.status === "lost") {
    state = newState();
  }

  state.status = "playing";
  state.intermission = 1.0;
  state.nextWave = 0;
  overlay.classList.remove("is-visible");
  startButton.textContent = "Start the Festa";
  playSound("start", { force: true });
  updateDifficultyControls();
  updateToolControls();
  updateWavePreview(true);
  updateHud();
  updateCards();
}

function pauseGame() {
  if (state.status === "playing") {
    state.status = "paused";
    pauseButton.textContent = "▶";
    overlay.classList.add("is-visible");
    overlayMessage.textContent = "The garden is holding its breath. Ready when you are.";
    startButton.textContent = "Resume";
    playSound("pause", { force: true });
    updateToolControls();
    return;
  }

  if (state.status === "paused") {
    state.status = "playing";
    pauseButton.textContent = "II";
    overlay.classList.remove("is-visible");
    playSound("resume", { force: true });
    updateToolControls();
  }
}

function showResult(won) {
  state.status = won ? "won" : "lost";
  overlay.classList.add("is-visible");
  overlayMessage.textContent = won
    ? "The garden survives. The festa committee is pretending they were calm the whole time."
    : "The invaders made it through the gates. The pastizzi committee demands a rematch.";
  startButton.textContent = won ? "Play Again" : "Try Again";
  pauseButton.textContent = "II";
  playSound(won ? "win" : "lose", { minGap: 1.0 });
  updateDifficultyControls();
  updateToolControls();
  updateWavePreview(true);
}

function getUpgradeHint(defender) {
  const nextUpgrade = defender ? getNextUpgrade(defender) : null;
  if (!nextUpgrade) return "";
  const base = DEFENDERS[defender.type];
  const label = nextUpgrade.name || `Stage ${(defender.upgradeStage || 0) + 1}`;
  return state.resources >= nextUpgrade.cost
    ? `Upgrade ${base.name} to ${label} for ${nextUpgrade.cost} Harbor Light.`
    : `Need ${nextUpgrade.cost} Harbor Light to upgrade ${base.name}.`;
}

function buildCards() {
  unitDock.innerHTML = "";

  Object.entries(DEFENDERS).forEach(([type, data], index) => {
    const upgradeText = data.upgrades ? " · upgrades" : "";
    const button = document.createElement("button");
    button.className = "unit-card";
    button.type = "button";
    button.dataset.type = type;
    button.setAttribute(
      "aria-label",
      `${data.name}, costs ${data.cost} Harbor Light. ${data.description}`,
    );
    button.innerHTML = `
      <span class="unit-token" style="--unit-color: ${data.color}">
        <img src="${SPRITE_FILES[data.sprite]}" alt="" />
      </span>
      <span class="unit-copy">
        <strong>${data.name}</strong>
        <small>${data.cost} light · ${Math.round(data.cooldown)}s${upgradeText}</small>
      </span>
      <span class="cooldown-sweep" aria-hidden="true"></span>
    `;
    button.addEventListener("click", () => selectDefender(type));
    unitDock.appendChild(button);
    cardElements.set(type, button);

    window.addEventListener("keydown", (event) => {
      if (event.key === String(index + 1)) {
        selectDefender(type);
      }
    });
  });
}

function selectDefender(type) {
  if (!DEFENDERS[type]) return;
  if (state.status !== "playing") return;
  const data = DEFENDERS[type];
  if (state.resources < data.cost || state.cooldowns[type] > 0) return;
  state.toolMode = null;
  state.selected = state.selected === type ? null : type;
  playSound("select");
  updateToolControls();
  updateCards();
}

function toggleShovel() {
  if (state.status !== "playing") return;
  state.selected = null;
  state.toolMode = state.toolMode === "shovel" ? null : "shovel";
  playSound("select");
  updateToolControls();
  updateCards();
  updateHud();
}

function updateToolControls() {
  if (!shovelButton || !state) return;
  const active = state.status === "playing" && state.toolMode === "shovel";
  shovelButton.disabled = state.status !== "playing";
  shovelButton.classList.toggle("is-active", active);
  shovelButton.setAttribute("aria-pressed", active ? "true" : "false");
}

function updateCards() {
  if (!state) return;

  Object.entries(DEFENDERS).forEach(([type, data]) => {
    const button = cardElements.get(type);
    if (!button) return;

    const cooldown = Math.max(0, state.cooldowns[type]);
    const disabled =
      state.status !== "playing" || state.resources < data.cost || cooldown > 0;
    const cooldownPct = Math.min(1, cooldown / data.cooldown) * 100;

    button.disabled = disabled;
    button.classList.toggle("is-selected", state.selected === type);
    button.style.setProperty("--cooldown", `${cooldownPct}%`);
  });

  updateToolControls();
}

function updateHud() {
  resourceValue.textContent = Math.floor(state.resources);
  livesValue.textContent = state.lives;
  const visibleWave = Math.max(0, state.waveIndex + 1);
  const shownWave = state.waveIndex >= 0 ? visibleWave : state.completedWaves;
  waveLabel.textContent = `Wave ${Math.min(shownWave, WAVES.length)}/${WAVES.length}`;

  let progress = 0;
  if (state.waveIndex >= 0) {
    const wave = WAVES[state.waveIndex];
    const waveProgress = wave
      ? Math.min(1, state.spawnCursor / Math.max(1, wave.spawns.length))
      : 1;
    progress = (state.waveIndex + waveProgress) / WAVES.length;
  } else {
    progress = state.completedWaves / WAVES.length;
  }
  waveFill.style.width = `${Math.round(progress * 100)}%`;

  const selectedData = state.selected ? DEFENDERS[state.selected] : null;
  const hoveredDefender = !selectedData && state.toolMode !== "shovel" ? getDefenderAtTile(state.hoverTile) : null;
  const upgradeHint = state.status === "playing" ? getUpgradeHint(hoveredDefender) : "";
  if (state.status === "playing" && selectedData) {
    hintText.textContent = `Place ${selectedData.name} on an open limestone tile.`;
  } else if (state.status === "playing" && state.toolMode === "shovel") {
    hintText.textContent = "Tap a defender to shovel it out and recover some Harbor Light.";
  } else if (upgradeHint) {
    hintText.textContent = upgradeHint;
  } else if (state.status === "playing") {
    hintText.textContent = "Pick a defender, then place it on an open limestone tile.";
  } else if (state.status === "paused") {
    hintText.textContent = "Paused.";
  } else {
    hintText.textContent = "Seven waves. Three gates. One stubborn garden.";
  }

  if (state.waveMessageTimer > 0 && state.waveIndex >= 0) {
    const wave = WAVES[state.waveIndex];
    const threat = wave.threat ? ` · ${wave.threat}` : "";
    const hint = wave.hint ? ` | ${wave.hint}` : "";
    waveCallout.textContent = `Wave ${state.waveIndex + 1}: ${wave.title}${threat}${hint}`;
  } else if (state.intermission > 0 && state.status === "playing") {
    waveCallout.textContent = `Next wave in ${Math.ceil(state.intermission)}s`;
  } else {
    waveCallout.textContent = "";
  }

  pauseButton.disabled = state.status === "ready" || state.status === "won" || state.status === "lost";
  updateDifficultyControls();
  updateWavePreview();
}

function getPointer(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = BASE_WIDTH / rect.width;
  const scaleY = BASE_HEIGHT / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function tileFromPoint(point) {
  if (!point) return null;
  if (
    point.x < board.x ||
    point.x > board.x + board.w ||
    point.y < board.y ||
    point.y > board.y + board.h
  ) {
    return null;
  }

  return {
    col: Math.floor((point.x - board.x) / cellW),
    row: Math.floor((point.y - board.y) / cellH),
  };
}

function tileKey(row, col) {
  return `${row}:${col}`;
}

function getDefenderAtTile(tile) {
  if (!tile) return null;
  const id = state.occupied.get(tileKey(tile.row, tile.col));
  if (!id) return null;
  return state.defenders.find((defender) => defender.id === id) || null;
}

function getDefenderStats(defender) {
  const base = DEFENDERS[defender.type];
  if (!base) return {};
  const stage = Math.max(0, defender.upgradeStage || 0);
  const upgrade = stage > 0 ? (base.upgrades || [])[stage - 1] : null;
  return upgrade ? { ...base, ...upgrade } : base;
}

function getNextUpgrade(defender) {
  const base = DEFENDERS[defender.type];
  if (!base || !base.upgrades) return null;
  return base.upgrades[defender.upgradeStage || 0] || null;
}

function getDefenderInvestment(defender) {
  const base = DEFENDERS[defender.type];
  if (!base) return 0;
  const upgrades = base.upgrades || [];
  const stage = Math.max(0, defender.upgradeStage || 0);
  return upgrades.slice(0, stage).reduce((total, upgrade) => total + (upgrade.cost || 0), base.cost || 0);
}

function getSellRefund(defender) {
  const investment = getDefenderInvestment(defender);
  if (!investment) return 0;
  return Math.max(10, Math.round((investment * 0.38) / 5) * 5);
}

function shovelHoveredDefender() {
  if (state.status !== "playing" || state.toolMode !== "shovel" || !state.hoverTile) return false;
  const defender = getDefenderAtTile(state.hoverTile);
  if (!defender) {
    playSound("select");
    return false;
  }

  const refund = getSellRefund(defender);
  state.resources += refund;
  burst(defender.x, defender.y - 4, "#d9c07b", 14, 64);
  sparkleBurst(defender.x, defender.y - 24, colors.gold, 6);
  popRing(defender.x, defender.y, colors.bronze, 58, 0.38);
  floatText(defender.x, defender.y - 44, `+${refund}`, colors.gold);
  removeDefender(defender, { quiet: true });
  state.toolMode = null;
  playSound("sell", { force: true });
  updateToolControls();
  updateCards();
  updateHud();
  return true;
}

function ultraUpgradeBurst(defender) {
  defender.ultraFlash = 1.15;
  state.shake = Math.max(state.shake, 4);
  burst(defender.x, defender.y - 12, "#8edff0", 18, 82);
  burst(defender.x, defender.y - 18, colors.gold, 18, 92);
  sparkleBurst(defender.x, defender.y - 42, "#fff8e8", 18);
  sparkleBurst(defender.x + 18, defender.y - 26, "#8edff0", 10);
  confettiBurst(defender.x, defender.y - 54, 12);
  popRing(defender.x, defender.y - 12, "#31a6d9", 82, 0.58);
  popRing(defender.x, defender.y - 14, colors.gold, 112, 0.68);
  floatText(defender.x, defender.y - 68, "ULTRA!", colors.gold);
  playSound("ultra", { force: true });
}

function upgradeHoveredDefender() {
  if (state.status !== "playing" || state.selected || !state.hoverTile) return false;
  const defender = getDefenderAtTile(state.hoverTile);
  const nextUpgrade = defender ? getNextUpgrade(defender) : null;
  if (!defender || !nextUpgrade) return false;

  if (state.resources < nextUpgrade.cost) {
    floatText(defender.x, defender.y - 48, `Need ${nextUpgrade.cost}`, colors.damage);
    playSound("select");
    return false;
  }

  state.resources -= nextUpgrade.cost;
  defender.upgradeStage = (defender.upgradeStage || 0) + 1;
  const finalUpgrade = !getNextUpgrade(defender);
  defender.maxHp += nextUpgrade.healthBoost || 0;
  defender.hp = Math.min(defender.maxHp, defender.hp + (nextUpgrade.healthBoost || 0));
  defender.reload = Math.min(defender.reload, 0.18);
  defender.flash = 0.42;
  burst(defender.x, defender.y - 6, nextUpgrade.color || DEFENDERS[defender.type].color, 16, 58);
  sparkleBurst(defender.x, defender.y - 34, "#8edff0", 9);
  popRing(defender.x, defender.y - 8, "#31a6d9", 66, 0.48);
  if (finalUpgrade) {
    ultraUpgradeBurst(defender);
  } else {
    floatText(defender.x, defender.y - 48, "UPGRADE", "#31a6d9");
    playSound("upgrade");
  }
  updateCards();
  return true;
}

function placeSelected() {
  if (state.status !== "playing" || !state.selected || !state.hoverTile) return false;
  const data = DEFENDERS[state.selected];
  const { row, col } = state.hoverTile;
  const key = tileKey(row, col);

  if (state.occupied.has(key)) return false;
  if (state.resources < data.cost || state.cooldowns[state.selected] > 0) return false;

  const defender = {
    id: makeId("defender"),
    type: state.selected,
    row,
    col,
    x: board.x + col * cellW + cellW / 2,
    y: board.y + row * cellH + cellH / 2,
    bornAt: state.time,
    hp: data.health,
    maxHp: data.health,
    reload: 0.35,
    tick: data.interval || 0,
    arm: data.armTime || 0,
    flash: 0,
    damageFlash: 0,
    crackStage: 0,
    upgradeStage: 0,
  };

  state.defenders.push(defender);
  state.occupied.set(key, defender.id);
  state.resources -= data.cost;
  state.cooldowns[state.selected] = data.cooldown;
  burst(defender.x, defender.y, data.color, 12, 52);
  popRing(defender.x, defender.y + 8, data.color, 56, 0.42);
  charmBurst(defender.x, defender.y - 24, data.color, 5);
  playSound("place");
  state.selected = null;
  updateCards();
  return true;
}

function beginWave(index) {
  state.waveIndex = index;
  state.waveElapsed = 0;
  state.spawnCursor = 0;
  state.intermission = 0;
  state.nextWave = index;
  state.waveMessageTimer = 5.6;
  playSound("wave", { force: true });
  updateWavePreview(true);
}

function spawnEnemy(type, row, hpScale = 1, biteScale = 1, spawnOptions = {}) {
  const data = ENEMIES[type];
  const difficulty = getDifficulty();
  const options = spawnOptions || {};
  const hpMult = options.hpMult || 1;
  const biteMult = options.biteMult || 1;
  const speedMult = options.speedMult || 1;
  const rewardScale = options.waveRewardScale ?? 1;
  const rewardMult = options.rewardMult || 1;
  const y = board.y + row * cellH + cellH / 2;
  const effectiveHpScale = hpScale * hpMult;
  const effectiveBiteScale = biteScale * biteMult;
  const scaledHp = Math.round(data.hp * effectiveHpScale);
  const enemy = {
    id: makeId("enemy"),
    type,
    row,
    x: board.x + board.w + 58,
    y,
    baseY: y,
    hp: scaledHp,
    maxHp: scaledHp,
    hpScale: effectiveHpScale,
    biteScale: effectiveBiteScale,
    speed: data.speed * speedMult,
    damage: data.damage,
    reward: Math.max(1, Math.round(data.reward * difficulty.reward * rewardScale * rewardMult)),
    radius: data.radius,
    age: 0,
    slowTimer: 0,
    slowFactor: 1,
    attackFlash: 0,
    hitFlash: 0,
    roleFlash: 1.35,
    freezeTimer: 0,
    freezeMax: 0,
    burnTimer: 0,
    burnMax: 0,
    burnDps: 0,
    burnPuffTimer: 0,
    blockedTimer: 0,
    silencedTimer: 0,
    revealed: !data.revealShield,
    revealFlash: 0,
    balloonIntact: data.balloon === true,
    floatSkipsLeft: Math.max(0, (data.floatSkips || 0) + (options.floatSkipsAdd || 0)),
    floatBypassTimer: 0,
    poppedTimer: 0,
    dancePower: 0,
    danceBoost: 0,
    danceBeatTimer: 0,
    bossEntrance: data.trait === "boss" ? 1.4 : 0,
    dustTimer: 0.18 + Math.random() * 0.22,
    eliteLabel: options.label || "",
    eliteColor: options.color || data.roleColor || data.color,
    seed: Math.random() * 10,
    reachedGate: false,
  };

  state.enemies.push(enemy);
  popRing(enemy.x, enemy.y + 22, data.color, 48, 0.38);
  floatText(
    enemy.x - 12,
    enemy.y - data.radius - 34,
    options.label || data.roleLabel,
    options.color || data.roleColor || data.color,
  );
  if (data.trait === "boss") {
    const entranceX = board.x + board.w + 8;
    state.shake = Math.max(state.shake, 8);
    popRing(entranceX, enemy.y + data.radius + 8, data.roleColor, 78, 0.62);
    popRing(entranceX - 26, enemy.y + data.radius + 10, colors.limestone, 46, 0.48);
    dustPuff(entranceX + 8, enemy.y + data.radius + 10);
    dustPuff(entranceX - 28, enemy.y + data.radius + 12);
    floatText(board.x + board.w - 36, enemy.y - data.radius - 42, "STONE HOUND!", data.roleColor);
    playSound("boss", { force: true });
  }
  if (!options.label && effectiveHpScale > 1.05) {
    floatText(enemy.x + 14, enemy.y - data.radius - 52, "TOUGH", colors.gold);
  }
  if (!options.label && effectiveBiteScale > 1.08) {
    floatText(enemy.x + 32, enemy.y - data.radius - 36, "FIERCE", colors.festa);
  }
}

function update(dt) {
  state.time += dt;
  state.incomeTimer -= dt;
  state.shake = Math.max(0, state.shake - dt * 32);
  state.waveMessageTimer = Math.max(0, state.waveMessageTimer - dt);

  if (state.incomeTimer <= 0) {
    const difficulty = getDifficulty();
    state.incomeTimer += difficulty.incomeInterval;
    state.resources += difficulty.income;
    floatText(board.x + 38, board.y - 18, `+${difficulty.income}`, colors.gold);
    playSound("resource");
  }

  Object.keys(state.cooldowns).forEach((type) => {
    state.cooldowns[type] = Math.max(0, state.cooldowns[type] - dt);
  });

  updateWaves(dt);
  updateDefenders(dt);
  updateProjectiles(dt);
  updateEnemies(dt);
  updateDeathEffects(dt);
  updateParticles(dt);
  cleanup();
}

function updateWaves(dt) {
  if (state.waveIndex === -1) {
    state.intermission -= dt;
    if (state.intermission <= 0) beginWave(state.nextWave);
    return;
  }

  const wave = WAVES[state.waveIndex];
  if (!wave) return;
  state.waveElapsed += dt;

  while (
    state.spawnCursor < wave.spawns.length &&
    wave.spawns[state.spawnCursor][0] <= state.waveElapsed
  ) {
    const difficulty = getDifficulty();
    const [, type, row, spawnOptions = {}] = wave.spawns[state.spawnCursor];
    spawnEnemy(
      type,
      row,
      (wave.hpScale || 1) * difficulty.enemyHp,
      (wave.biteScale || 1) * difficulty.bite,
      {
        ...spawnOptions,
        waveRewardScale: wave.rewardScale || 1,
      },
    );
    state.spawnCursor += 1;
  }

  if (state.spawnCursor >= wave.spawns.length && state.enemies.length === 0) {
    if (state.waveIndex >= WAVES.length - 1) {
      state.completedWaves = WAVES.length;
      showResult(true);
    } else {
      state.completedWaves = state.waveIndex + 1;
      state.nextWave = state.waveIndex + 1;
      state.waveIndex = -1;
      state.intermission = getDifficulty().intermission;
      updateWavePreview(true);
    }
  }
}

function updateDefenders(dt) {
  state.defenders.forEach((defender) => {
    const data = getDefenderStats(defender);
    defender.flash = Math.max(0, defender.flash - dt);
    defender.damageFlash = Math.max(0, (defender.damageFlash || 0) - dt);
    defender.ultraFlash = Math.max(0, (defender.ultraFlash || 0) - dt);

    if (data.generator) {
      defender.tick -= dt;
      if (defender.tick <= 0) {
        defender.tick += data.interval;
        state.resources += data.glow;
        defender.flash = 0.35;
        burst(defender.x, defender.y - 18, colors.gold, 18, 72);
        sparkleBurst(defender.x, defender.y - 36, colors.gold, 9);
        popRing(defender.x, defender.y - 18, colors.gold, 64, 0.5);
        floatText(defender.x, defender.y - 34, `+${data.glow}`, colors.gold);
        playSound("resource");
      }
    }

    if (data.bomb) {
      defender.arm -= dt;
      if (defender.arm <= 0) {
        explodeBomb(defender);
      }
      return;
    }

    if (data.melee) {
      defender.reload -= dt;
      const target = findMeleeTarget(defender, data.range);
      if (target && defender.reload <= 0) {
        damageEnemy(target, data.damage, { revealReason: "melee" });
        defender.reload = data.fireRate;
        defender.flash = 0.18;
        burst(target.x - 8, target.y, "#d9dce0", 6, 28);
        sparkleBurst(target.x - 10, target.y - 20, "#fff8e8", 4);
        playSound("melee");
      }
      return;
    }

    if (data.projectile) {
      defender.reload -= dt;
      const target = findTargetInLane(defender.row, defender.x + 18, {
        airborneOnly: data.airborneOnly === true,
        preferAirborne: data.preferAirborne === true,
      });
      if (target && defender.reload <= 0) {
        fireProjectile(defender, data);
        defender.reload = data.fireRate;
        defender.flash = 0.16;
        burst(defender.x + 34, defender.y - 12, data.color, 5, 32);
      }
    }
  });
}

function updateProjectiles(dt) {
  state.projectiles.forEach((projectile) => {
    projectile.x += projectile.vx * dt;
    projectile.life -= dt;
    projectile.spin += dt * 9;

    const target = state.enemies.find((enemy) => {
      if (enemy.row !== projectile.row || enemy.hp <= 0) return false;
      if (projectile.airborneOnly && !isBalloonAirborne(enemy)) return false;
      return Math.abs(enemy.x - projectile.x) <= enemy.radius + projectile.radius;
    });

    if (target) {
      const targetWasFrozen = isFrozen(target);
      const targetWasVeiled = isShadowVeiled(target);
      const targetData = ENEMIES[target.type];
      const poppedBalloon = projectile.popBalloon && popBalloon(target);
      projectile.hit = true;
      const shatterDamage =
        projectile.kind === "pastizz" && targetWasFrozen ? 24 : 0;
      const counterReveal = projectile.kind === "bell" || projectile.freezeDuration > 0;
      const revealReason =
        projectile.kind === "bell" ? "bell" : projectile.freezeDuration > 0 ? "frost" : "hit";
      damageEnemy(target, projectile.damage + shatterDamage + (poppedBalloon ? projectile.popDamage : 0), {
        revealCounter: counterReveal,
        revealReason,
      });
      const revealedByProjectile = targetWasVeiled && !isShadowVeiled(target);

      if (projectile.slowDuration) {
        target.slowTimer = Math.max(target.slowTimer, projectile.slowDuration);
        target.slowFactor = Math.min(target.slowFactor, projectile.slow);
      }

      if (projectile.freezeDuration) {
        applyFrost(target, projectile.freezeDuration);
      }

      if (projectile.kind === "spike") {
        burst(target.x, target.y, "#8edff0", 9, 38);
        sparkleBurst(target.x, target.y - 18, "#bdf4ff", 7);
        popRing(target.x, target.y, "#8edff0", 46, 0.34);
      } else if (projectile.kind === "petal") {
        burst(target.x, target.y - 22, "#e45a78", 12, 46);
        sparkleBurst(target.x, target.y - 35, "#fff8e8", 5);
        popRing(target.x, target.y - 18, "#e45a78", 46, 0.34);
      } else if (projectile.kind === "bell") {
        playSound("bell");
        if (targetData.elusive) {
          const alreadySilenced = target.silencedTimer > 0;
          revealEnemy(target, "bell");
          target.silencedTimer = Math.max(target.silencedTimer, 2.4);
          target.slowTimer = Math.max(target.slowTimer, 1.7);
          target.slowFactor = Math.min(target.slowFactor, 0.48);
          if (!alreadySilenced && !revealedByProjectile) {
            floatText(target.x, target.y - 48, "HUSH", colors.bronze);
          }
        }
        if (targetData.danceAura) {
          const alreadySilenced = target.silencedTimer > 0;
          target.silencedTimer = Math.max(target.silencedTimer, 2.4);
          target.dancePower = 0;
          if (!alreadySilenced) {
            floatText(target.x, target.y - 48, "HUSH", colors.bronze);
            popRing(target.x, target.y, colors.bronze, 62, 0.42);
          }
        }
        if (targetWasFrozen) {
          applyFrost(target, 1.35);
          target.slowTimer = Math.max(target.slowTimer, 2.8);
          target.slowFactor = Math.min(target.slowFactor, 0.38);
          floatText(target.x, target.y - 48, "CHILL", "#8edff0");
          sparkleBurst(target.x, target.y - 20, "#bdf4ff", 8);
        }
        burst(target.x, target.y, colors.bronze, 14, 54);
        popRing(target.x, target.y, colors.bronze, 54, 0.38);
      } else if (projectile.kind === "pastizz" && targetWasFrozen) {
        shatterEnemy(target);
        burst(target.x, target.y, colors.ricotta, 12, 48);
        impactSplash(target.x, target.y - 16, colors.ricotta);
      } else if (projectile.kind === "bone") {
        burst(target.x, target.y, "#f8e7bd", 9, 34);
        sparkleBurst(target.x, target.y - 18, "#fff8e8", 4);
        popRing(target.x, target.y, "#f8e7bd", 38, 0.3);
        playSound("hit");
      } else {
        burst(target.x, target.y, colors.ricotta, 10, 38);
        impactSplash(target.x, target.y - 16, colors.ricotta);
        playSound("hit");
      }
    }
  });

  state.projectiles = state.projectiles.filter(
    (projectile) =>
      !projectile.hit && projectile.life > 0 && projectile.x < board.x + board.w + 130,
  );
}

function updateEnemies(dt) {
  state.enemies.forEach((enemy) => {
    const data = ENEMIES[enemy.type];
    enemy.age += dt;
    enemy.attackFlash = Math.max(0, enemy.attackFlash - dt);
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
    enemy.roleFlash = Math.max(0, enemy.roleFlash - dt);
    enemy.blockedTimer = Math.max(0, enemy.blockedTimer - dt);
    enemy.silencedTimer = Math.max(0, enemy.silencedTimer - dt);
    enemy.revealFlash = Math.max(0, enemy.revealFlash - dt);
    enemy.floatBypassTimer = Math.max(0, enemy.floatBypassTimer - dt);
    enemy.poppedTimer = Math.max(0, enemy.poppedTimer - dt);
    enemy.danceBeatTimer = Math.max(0, enemy.danceBeatTimer - dt);
    enemy.bossEntrance = Math.max(0, (enemy.bossEntrance || 0) - dt);
    enemy.freezeTimer = Math.max(0, enemy.freezeTimer - dt);
    if (enemy.freezeTimer <= 0) enemy.freezeMax = 0;

    if (enemy.burnTimer > 0) {
      enemy.burnTimer = Math.max(0, enemy.burnTimer - dt);
      if (enemy.burnDps > 0) {
        const killedByBurn = damageEnemy(enemy, enemy.burnDps * dt, {
          deathStyle: "crumble",
          ignoreRevealShield: true,
          quiet: true,
        });
        if (killedByBurn) return;
      }
      enemy.burnPuffTimer -= dt;
      if (enemy.burnPuffTimer <= 0) {
        enemy.burnPuffTimer = 0.16 + Math.random() * 0.08;
        emberBurst(enemy.x, enemy.y - enemy.radius * 0.55, 3);
      }
    } else {
      enemy.burnMax = 0;
      enemy.burnDps = 0;
    }

    if (enemy.slowTimer > 0) {
      enemy.slowTimer -= dt;
      if (enemy.slowTimer <= 0) {
        enemy.slowFactor = 1;
      }
    }

    const previousDancePower = enemy.dancePower || 0;
    enemy.dancePower = getDancePower(enemy);
    enemy.danceBoost = getEnemyDanceBoost(enemy);

    if (data.danceAura && enemy.dancePower > 0) {
      if (previousDancePower <= 0.05) {
        floatText(enemy.x, enemy.y - data.radius - 40, "FESTA!", data.roleColor);
      }
      if (enemy.danceBeatTimer <= 0) {
        enemy.danceBeatTimer = 0.42;
        popRing(enemy.x, enemy.y, data.roleColor, 52 + enemy.dancePower * 28, 0.36);
        confettiBurst(enemy.x, enemy.y - 30, 6);
      }
    }

    if (data.tide && enemy.age % 2.7 < dt) {
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + 10);
      floatText(enemy.x, enemy.y - 30, "+10", "#69c7bf");
      popRing(enemy.x, enemy.y + enemy.radius + 8, "#69c7bf", 42, 0.36);
    }

    const blocker = findBlocker(enemy);
    if (blocker && canFloatOverBlocker(enemy)) {
      startFloatBypass(enemy, blocker);
    }

    if (blocker && enemy.floatBypassTimer <= 0) {
      blocker.hp -= enemy.damage * enemy.biteScale * (1 + enemy.danceBoost * 0.5) * dt;
      markDefenderHit(blocker, enemy);
      enemy.blockedTimer = Math.max(enemy.blockedTimer, 0.32);
      enemy.attackFlash = 0.08;
      if (enemy.age % 0.32 < dt) {
        burst(blocker.x + 12, blocker.y - 10, "#fff8e8", 4, 24);
        burst(enemy.x - enemy.radius - 4, enemy.y - 6, colors.ricotta, 3, 20);
      }
      if (blocker.hp <= 0) {
        removeDefender(blocker);
        burst(blocker.x, blocker.y, "#c46a40", 18, 78);
        popRing(blocker.x, blocker.y, "#c46a40", 70, 0.5);
      }
      return;
    }

    let speed = enemy.speed * enemy.slowFactor;
    if (data.elusive) {
      if (isShadowVeiled(enemy) && enemy.silencedTimer <= 0) {
        speed *= data.veiledSpeedBoost || 1.4;
        if (Math.sin(enemy.age * 5.4 + enemy.seed) > 0.34) {
          speed *= 1.12;
        }
      } else if (enemy.silencedTimer <= 0 && Math.sin(enemy.age * 5.4 + enemy.seed) > 0.74) {
        speed *= 1.45;
      }
    }
    if (data.wander) {
      const wobble = Math.sin(enemy.age * 3.0 + enemy.seed);
      speed *= wobble > 0.68 ? 0.12 : 0.88 + Math.sin(enemy.age * 6.6 + enemy.seed) * 0.18;
    }
    if (data.danceAura && enemy.dancePower > 0) {
      const danceSlow = isBalloonAirborne(enemy) ? 0.46 : 0.78;
      speed *= 1 - enemy.dancePower * danceSlow;
    }
    if (enemy.danceBoost > 0) {
      speed *= 1 + enemy.danceBoost;
    }
    if (enemy.floatBypassTimer > 0) {
      speed = Math.max(speed, data.floatBypassSpeed || data.speed * 3.4);
    }

    enemy.x -= speed * dt;
    enemy.dustTimer -= dt;
    if (speed > 8 && enemy.dustTimer <= 0 && !isBalloonAirborne(enemy)) {
      enemy.dustTimer = data.speed > 45 ? 0.11 : data.speed > 35 ? 0.16 : 0.28;
      dustPuff(enemy.x + enemy.radius * 0.42, enemy.y + enemy.radius + 8);
    }
    if (data.wander) {
      enemy.y = enemy.baseY + Math.sin(enemy.age * 4.8 + enemy.seed) * 9;
    }

    if (enemy.x < board.x - 58 && !enemy.reachedGate) {
      enemy.reachedGate = true;
      state.lives -= 1;
      state.shake = 11;
      burst(board.x - 32, enemy.baseY, colors.festa, 22, 90);
      popRing(board.x - 32, enemy.baseY, colors.festa, 82, 0.55);
      playSound("gate", { force: true });
      if (state.lives <= 0) {
        showResult(false);
      }
    }
  });
}

function updateDeathEffects(dt) {
  state.deathEffects.forEach((effect) => {
    effect.life -= dt;
    effect.age += dt;
  });
}

function updateParticles(dt) {
  state.particles.forEach((particle) => {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += particle.gravity * dt;
  });
}

function cleanup() {
  state.defenders = state.defenders.filter((defender) => defender.hp > 0 && !defender.remove);
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0 && !enemy.reachedGate);
  state.deathEffects = state.deathEffects.filter((effect) => effect.life > 0);
  state.particles = state.particles.filter((particle) => particle.life > 0);
}

function removeDefender(defender, options = {}) {
  defender.remove = true;
  state.occupied.delete(tileKey(defender.row, defender.col));
  if (!options.quiet) {
    playSound("break", { minGap: 0.16 });
  }
}

function markDefenderHit(defender, enemy) {
  defender.damageFlash = Math.max(defender.damageFlash || 0, 0.2);
  playSound("chew");
  if (defender.type !== "knight") return;

  const ratio = defender.hp / defender.maxHp;
  const nextStage = ratio <= 0.25 ? 3 : ratio <= 0.5 ? 2 : ratio <= 0.72 ? 1 : 0;
  if (nextStage <= (defender.crackStage || 0)) return;

  defender.crackStage = nextStage;
  playSound("crack");
  const label = nextStage >= 2 ? "CRACK!" : "CHIP";
  floatText(defender.x + 6, defender.y - 54, label, nextStage >= 2 ? colors.damage : colors.bronze);
  burst(defender.x + 15, defender.y - 18, "#d9c07b", 10 + nextStage * 3, 56);
  sparkleBurst(defender.x + 18, defender.y - 30, "#fff8e8", 4 + nextStage);
  popRing(defender.x + 8, defender.y - 8, nextStage >= 2 ? colors.damage : colors.bronze, 48 + nextStage * 8, 0.38);

  if (enemy) {
    burst(enemy.x - enemy.radius - 4, enemy.y - 8, colors.ricotta, 4 + nextStage, 28);
  }
}

function findTargetInLane(row, minX, options = {}) {
  const targets = state.enemies
    .filter((enemy) => {
      if (enemy.row !== row || enemy.x <= minX || enemy.hp <= 0) return false;
      if (options.airborneOnly && !isBalloonAirborne(enemy)) return false;
      return true;
    })
    .sort((a, b) => a.x - b.x);

  if (options.preferAirborne) {
    return targets.find((enemy) => isBalloonAirborne(enemy)) || targets[0];
  }

  return targets[0];
}

function findMeleeTarget(defender, range) {
  return state.enemies.find(
    (enemy) =>
      enemy.row === defender.row &&
      enemy.hp > 0 &&
      enemy.x > defender.x - 24 &&
      enemy.x < defender.x + range,
  );
}

function findBlocker(enemy) {
  if (enemy.floatBypassTimer > 0) return null;

  const candidates = state.defenders.filter((defender) => {
    if (defender.row !== enemy.row || defender.hp <= 0) return false;
    return enemy.x - enemy.radius < defender.x + cellW * 0.35 && enemy.x > defender.x - cellW * 0.42;
  });

  if (!candidates.length) return null;
  return candidates.sort((a, b) => b.x - a.x)[0];
}

function fireProjectile(defender, data) {
  const shots = Math.max(1, data.shots || 1);
  const spread = data.shotSpread || 13;
  const muzzleX = data.muzzleX === undefined ? 24 : data.muzzleX;
  const muzzleY = data.muzzleY === undefined ? -8 : data.muzzleY;
  const projectileOffsetX = data.projectileOffsetX ?? data.spriteOffsetX ?? 0;
  const projectileScale = data.projectileScale || 1;
  const baseRadius =
    data.projectile === "bell"
      ? 18
      : data.projectile === "petal"
        ? 14
        : data.projectile === "bone"
          ? 11
          : 12;

  for (let index = 0; index < shots; index += 1) {
    const centeredIndex = index - (shots - 1) / 2;
    state.projectiles.push({
      x: defender.x + muzzleX + projectileOffsetX,
      y: defender.y + muzzleY + centeredIndex * spread,
      row: defender.row,
      vx: data.projectileSpeed,
      damage: data.damage,
      kind: data.projectile,
      radius: baseRadius * projectileScale,
      life: 3.2,
      scale: projectileScale,
      spin: centeredIndex * 0.45,
      slow: data.slow || 1,
      slowDuration: data.slowDuration || 0,
      freezeDuration: data.freezeDuration || 0,
      airborneOnly: data.airborneOnly === true,
      popBalloon: data.popBalloon === true,
      popDamage: data.popDamage || 0,
    });
  }
  if (data.projectile === "bone") {
    const roarPower = Math.max(0.75, Math.min(1.45, projectileScale));
    popRing(defender.x + muzzleX + projectileOffsetX - 16, defender.y + muzzleY, "#8edff0", 22 + projectileScale * 12, 0.24);
    sparkleBurst(defender.x + muzzleX + projectileOffsetX - 10, defender.y + muzzleY - 4, "#fff8e8", shots + 1);
    playSound("dogRoar", { power: roarPower });
  }
  playSound("shoot", { kind: data.projectile });
}

function damageEnemy(enemy, amount, options = {}) {
  if (enemy.hp <= 0 || enemy.rewarded) return false;
  const data = ENEMIES[enemy.type];
  let actualDamage = amount;
  const wasVeiled = isShadowVeiled(enemy);
  if (wasVeiled && amount > 0 && !options.ignoreRevealShield) {
    revealEnemy(enemy, options.revealReason || "hit");
    if (!options.revealCounter) {
      actualDamage *= data.revealDamageScale || 0.2;
    }
  }

  enemy.hp -= actualDamage;
  if (!options.quiet) {
    enemy.hitFlash = 0.14;
  }
  if (enemy.hp <= 0) {
    const deathStyle = options.deathStyle || (enemy.freezeTimer > 0 ? "crumble" : "fall");
    const reward = enemy.reward ?? data.reward;
    enemy.rewarded = true;
    state.resources += reward;
    createDeathEffect(enemy, deathStyle);
    floatText(enemy.x, enemy.y - 34, `+${reward}`, colors.gold);
    burst(enemy.x, enemy.y, data.color, 16, 64);
    charmBurst(enemy.x, enemy.y - 22, data.color, 5);
    popRing(enemy.x, enemy.y, data.color, 62, 0.42);
    playSound("defeat");
    return true;
  }
  return false;
}

function createDeathEffect(enemy, style) {
  const data = ENEMIES[enemy.type];
  const maxLife = style === "crumble" ? 1.08 : 1.18;
  const pieces = Array.from({ length: style === "crumble" ? 12 : 5 }, (_, index) => ({
    angle: -Math.PI * 0.95 + Math.random() * Math.PI * 0.9,
    speed: 14 + Math.random() * 56,
    lift: 14 + Math.random() * 42,
    gravity: 16 + Math.random() * 36,
    delay: index * 0.025 + Math.random() * 0.12,
    size: 3 + Math.random() * 5,
    spin: -2 + Math.random() * 4,
    color: Math.random() > 0.55 ? data.color : "#fff8e8",
  }));

  state.deathEffects.push({
    id: makeId("death"),
    type: enemy.type,
    row: enemy.row,
    x: enemy.x,
    y: enemy.baseY || enemy.y,
    radius: data.radius,
    sprite: data.sprite,
    spriteWidth: data.spriteWidth || 74,
    spriteHeight: data.spriteHeight || 84,
    flip: data.flipSprite === true,
    color: data.color,
    style,
    age: 0,
    life: maxLife,
    maxLife,
    seed: enemy.seed,
    pieces,
  });
}

function isShadowVeiled(enemy) {
  const data = ENEMIES[enemy?.type];
  return Boolean(data?.revealShield && enemy.hp > 0 && enemy.revealed !== true);
}

function revealEnemy(enemy, reason = "hit") {
  if (!isShadowVeiled(enemy)) return false;
  const data = ENEMIES[enemy.type];
  enemy.revealed = true;
  enemy.revealFlash = 0.68;
  enemy.roleFlash = Math.max(enemy.roleFlash || 0, 0.9);

  const labels = {
    bell: "RUNG!",
    frost: "FROST!",
    spike: "FROST!",
    bomb: "SPOTTED!",
    melee: "SPOTTED!",
    hit: "SPOTTED!",
  };
  const label = labels[reason] || labels.hit;

  floatText(enemy.x, enemy.y - data.radius - 42, label, reason === "frost" ? "#8edff0" : data.roleColor);
  burst(enemy.x, enemy.y - 8, data.roleColor, 12, 58);
  sparkleBurst(enemy.x, enemy.y - 28, reason === "frost" ? "#bdf4ff" : "#fff8e8", 6);
  popRing(enemy.x, enemy.y, data.roleColor, 64, 0.42);
  playSound("reveal");
  return true;
}

function isFrozen(enemy) {
  return enemy && enemy.hp > 0 && enemy.freezeTimer > 0;
}

function isBalloonAirborne(enemy) {
  const data = ENEMIES[enemy?.type];
  return Boolean(data?.balloon && enemy.hp > 0 && enemy.balloonIntact);
}

function canFloatOverBlocker(enemy) {
  return isBalloonAirborne(enemy) && enemy.floatSkipsLeft > 0 && enemy.floatBypassTimer <= 0;
}

function startFloatBypass(enemy, blocker) {
  const data = ENEMIES[enemy.type];
  enemy.floatSkipsLeft -= 1;
  enemy.floatBypassTimer = 0.95;
  enemy.blockedTimer = 0;
  enemy.attackFlash = 0;
  floatText(enemy.x, enemy.y - data.radius - data.floatHeight - 30, "FLOAT", data.roleColor || data.color);
  popRing(enemy.x, enemy.y - data.floatHeight, data.roleColor || data.color, 58, 0.4);
  confettiBurst(enemy.x - 10, enemy.y - data.floatHeight - 26, 5);
  sparkleBurst(blocker.x + 10, blocker.y - 26, colors.gold, 4);
  playSound("float");
}

function popBalloon(enemy) {
  if (!isBalloonAirborne(enemy)) return false;
  const data = ENEMIES[enemy.type];
  enemy.balloonIntact = false;
  enemy.floatSkipsLeft = 0;
  enemy.floatBypassTimer = 0;
  enemy.poppedTimer = 0.62;
  enemy.slowTimer = Math.max(enemy.slowTimer, 0.85);
  enemy.slowFactor = Math.min(enemy.slowFactor, 0.58);
  floatText(enemy.x, enemy.y - data.radius - data.floatHeight - 30, "POP!", "#e45a78");
  burst(enemy.x, enemy.y - data.floatHeight - 22, "#e45a78", 18, 68);
  sparkleBurst(enemy.x, enemy.y - data.floatHeight - 36, "#fff8e8", 7);
  popRing(enemy.x, enemy.y - data.floatHeight, "#e45a78", 66, 0.42);
  playSound("pop");
  return true;
}

function getEnemyHoverLift(enemy) {
  const data = ENEMIES[enemy?.type];
  if (!data?.balloon) return 0;
  const baseLift = data.floatHeight || 22;

  if (isBalloonAirborne(enemy)) {
    const bypassLift = enemy.floatBypassTimer > 0 ? 8 : 0;
    return baseLift + bypassLift + Math.sin(enemy.age * 3.8 + enemy.seed) * 3;
  }

  if (enemy.poppedTimer > 0) {
    const fall = Math.max(0, Math.min(1, enemy.poppedTimer / 0.62));
    return baseLift * fall * fall;
  }

  return 0;
}

function applyFrost(enemy, duration) {
  revealEnemy(enemy, "frost");
  enemy.freezeTimer = Math.max(enemy.freezeTimer, duration);
  enemy.freezeMax = Math.max(enemy.freezeMax, duration);
  playSound("freeze");
}

function applyBurn(enemy, duration, damagePerSecond) {
  if (!enemy || enemy.hp <= 0 || enemy.rewarded) return false;
  enemy.burnTimer = Math.max(enemy.burnTimer || 0, duration);
  enemy.burnMax = Math.max(enemy.burnMax || 0, duration);
  enemy.burnDps = Math.max(enemy.burnDps || 0, damagePerSecond);
  enemy.burnPuffTimer = Math.min(enemy.burnPuffTimer || 0.1, 0.1);
  floatText(enemy.x, enemy.y - enemy.radius - 46, "BURN", "#f07f4f");
  popRing(enemy.x, enemy.y, "#f07f4f", 52, 0.36);
  playSound("burn");
  return true;
}

function getDancePower(enemy) {
  const data = ENEMIES[enemy.type];
  if (!data || !data.danceAura || enemy.hp <= 0) return 0;
  if (enemy.freezeTimer > 0 || enemy.silencedTimer > 0 || enemy.blockedTimer > 0) return 0;
  if (enemy.slowTimer > 0 && enemy.slowFactor <= 0.55) return 0;

  const phase = (enemy.age + enemy.seed * 0.13) % data.danceCycle;
  if (phase > data.danceDuration) return 0;
  return Math.sin((phase / data.danceDuration) * Math.PI);
}

function getEnemyDanceBoost(enemy) {
  const enemyData = ENEMIES[enemy.type];
  if (!enemyData || enemyData.danceAura || enemy.hp <= 0) return 0;

  return state.enemies.reduce((bestBoost, dancer) => {
    if (dancer === enemy || dancer.hp <= 0) return bestBoost;
    const dancerData = ENEMIES[dancer.type];
    if (!dancerData || !dancerData.danceAura) return bestBoost;

    const power = dancer.dancePower || getDancePower(dancer);
    if (power <= 0) return bestBoost;
    if (Math.abs(dancer.row - enemy.row) > 1) return bestBoost;

    const distance = Math.hypot(enemy.x - dancer.x, enemy.y - dancer.y);
    if (distance > dancerData.danceRadius) return bestBoost;

    const proximity = 1 - distance / dancerData.danceRadius;
    const boost = dancerData.danceBoost * power * (0.45 + proximity * 0.55);
    return Math.max(bestBoost, boost);
  }, 0);
}

function shatterEnemy(enemy) {
  enemy.freezeTimer = 0;
  enemy.freezeMax = 0;
  enemy.slowTimer = Math.max(enemy.slowTimer, 0.35);
  enemy.slowFactor = Math.min(enemy.slowFactor, 0.72);
  floatText(enemy.x, enemy.y - 48, "SHATTER", "#bdf4ff");
  burst(enemy.x, enemy.y - 4, "#bdf4ff", 18, 72);
  sparkleBurst(enemy.x, enemy.y - 24, "#fff8e8", 8);
  popRing(enemy.x, enemy.y, "#bdf4ff", 58, 0.4);
  playSound("shatter");
}

function explodeBomb(defender) {
  const data = DEFENDERS[defender.type];
  playSound("bomb", { force: true });
  state.enemies.forEach((enemy) => {
    const dx = enemy.x - defender.x;
    const dy = enemy.y - defender.y;
    if (Math.hypot(dx, dy) <= data.radius) {
      const frozen = isFrozen(enemy);
      const killed = damageEnemy(enemy, data.damage + (frozen ? 70 : 0), {
        deathStyle: "crumble",
        revealReason: "bomb",
      });
      enemy.slowTimer = Math.max(enemy.slowTimer, 0.6);
      enemy.slowFactor = Math.min(enemy.slowFactor, 0.45);
      if (!killed) {
        applyBurn(enemy, data.burnDuration, data.burnDps);
      }
      if (frozen) {
        shatterEnemy(enemy);
        sparkleBurst(enemy.x, enemy.y - 20, "#bdf4ff", 12);
        popRing(enemy.x, enemy.y, "#8edff0", 66, 0.36);
      }
    }
  });
  burst(defender.x, defender.y, colors.festa, 44, 180);
  burst(defender.x, defender.y - 8, "#f07f4f", 28, 145);
  emberBurst(defender.x, defender.y - 12, 18);
  sparkleBurst(defender.x, defender.y - 12, colors.gold, 18);
  popRing(defender.x, defender.y, colors.festa, data.radius, 0.62);
  popRing(defender.x, defender.y, "#f07f4f", data.radius * 0.72, 0.54);
  state.shake = 8;
  removeDefender(defender, { quiet: true });
}

function burst(x, y, color, count, speed) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = speed * (0.3 + Math.random() * 0.7);
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      gravity: 70,
      kind: "dot",
      size: 2 + Math.random() * 4,
      color,
      text: null,
      life: 0.4 + Math.random() * 0.45,
      maxLife: 0.85,
    });
  }
}

function emberBurst(x, y, count) {
  const emberColors = ["#f07f4f", colors.gold, colors.festa, "#fff0bd"];
  for (let i = 0; i < count; i += 1) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.8;
    const speed = 18 + Math.random() * 46;
    state.particles.push({
      x: x + (Math.random() - 0.5) * 18,
      y: y + (Math.random() - 0.5) * 14,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 28,
      kind: "dot",
      size: 2 + Math.random() * 3.5,
      color: emberColors[Math.floor(Math.random() * emberColors.length)],
      text: null,
      life: 0.36 + Math.random() * 0.24,
      maxLife: 0.6,
    });
  }
}

function dustPuff(x, y) {
  for (let i = 0; i < 3; i += 1) {
    state.particles.push({
      x: x + (Math.random() - 0.5) * 12,
      y: y + (Math.random() - 0.5) * 6,
      vx: 16 + Math.random() * 30,
      vy: -12 - Math.random() * 18,
      gravity: 38,
      kind: "dot",
      size: 4 + Math.random() * 5,
      color: "rgba(244, 216, 148, 0.75)",
      text: null,
      life: 0.34 + Math.random() * 0.18,
      maxLife: 0.52,
    });
  }
}

function popRing(x, y, color, radius, life) {
  state.particles.push({
    x,
    y,
    vx: 0,
    vy: 0,
    gravity: 0,
    kind: "ring",
    size: radius,
    color,
    text: null,
    life,
    maxLife: life,
  });
}

function sparkleBurst(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
    const speed = 34 + Math.random() * 72;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 82,
      kind: "star",
      size: 5 + Math.random() * 5,
      color,
      text: null,
      life: 0.42 + Math.random() * 0.26,
      maxLife: 0.68,
    });
  }
}

function confettiBurst(x, y, count) {
  const confettiColors = [colors.festa, colors.gold, colors.sea, "#fff8e8", "#49a86b"];
  for (let i = 0; i < count; i += 1) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6;
    const speed = 30 + Math.random() * 74;
    state.particles.push({
      x: x + (Math.random() - 0.5) * 18,
      y: y + (Math.random() - 0.5) * 12,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 96,
      kind: "dot",
      size: 2 + Math.random() * 3.5,
      color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
      text: null,
      life: 0.48 + Math.random() * 0.22,
      maxLife: 0.7,
    });
  }
}

function charmBurst(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 28 + Math.random() * 56;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 20,
      gravity: 64,
      kind: Math.random() > 0.45 ? "heart" : "star",
      size: 6 + Math.random() * 5,
      color,
      text: null,
      life: 0.48 + Math.random() * 0.24,
      maxLife: 0.72,
    });
  }
}

function impactSplash(x, y, color) {
  for (let i = 0; i < 5; i += 1) {
    state.particles.push({
      x,
      y,
      vx: 30 + Math.random() * 46,
      vy: -28 + Math.random() * 34,
      gravity: 90,
      kind: "dot",
      size: 4 + Math.random() * 5,
      color,
      text: null,
      life: 0.34 + Math.random() * 0.16,
      maxLife: 0.5,
    });
  }
}

function floatText(x, y, text, color) {
  state.particles.push({
    x,
    y,
    vx: 0,
    vy: -28,
    gravity: 0,
    kind: "text",
    size: 18,
    color,
    text,
    life: 0.85,
    maxLife: 0.85,
  });
}

function draw() {
  ctx.save();
  ctx.clearRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  if (state.shake > 0) {
    ctx.translate(
      (Math.random() - 0.5) * state.shake,
      (Math.random() - 0.5) * state.shake,
    );
  }

  drawBackdrop();
  drawBoard();
  drawHover();
  drawProjectiles();
  drawEntities();
  drawParticles();
  ctx.restore();
}

function drawBackdrop() {
  const sky = ctx.createLinearGradient(0, 0, 0, BASE_HEIGHT);
  sky.addColorStop(0, "#8bd7e5");
  sky.addColorStop(0.34, "#f8d590");
  sky.addColorStop(1, "#f4c975");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  ctx.fillStyle = "rgba(255, 248, 232, 0.72)";
  drawBlob(92, 72, 54, 34);
  drawBlob(220, 60, 78, 28);
  drawBlob(900, 66, 92, 32);

  ctx.fillStyle = "#1f8eb8";
  ctx.fillRect(0, 84, BASE_WIDTH, 62);
  ctx.fillStyle = "#66c3d6";
  for (let i = 0; i < 16; i += 1) {
    ctx.beginPath();
    ctx.ellipse(60 + i * 78, 113 + Math.sin(i) * 5, 26, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  drawSeaTexture();

  drawSun(1008, 54);
  drawVillageWall();
  drawFestaGarland();
}

function drawBlob(x, y, w, h) {
  ctx.beginPath();
  ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawSun(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#f4b942";
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(244, 185, 66, 0.45)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(0, 0, 38, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawVillageWall() {
  ctx.fillStyle = "#d9c07b";
  ctx.fillRect(0, 124, BASE_WIDTH, 70);
  decoration.wallPocks.forEach((pock) => {
    ctx.save();
    ctx.globalAlpha = pock.a;
    ctx.fillStyle = "#7c6a3d";
    ctx.beginPath();
    ctx.arc(pock.x, pock.y, pock.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  ctx.fillStyle = "rgba(105, 89, 52, 0.16)";
  for (let y = 132; y < 188; y += 18) {
    for (let x = (y / 18) % 2 ? -30 : 0; x < BASE_WIDTH; x += 82) {
      ctx.fillRect(x, y, 74, 2);
      ctx.fillRect(x, y, 2, 18);
    }
  }

  ctx.fillStyle = "#c73c45";
  for (let i = 0; i < 12; i += 1) {
    const x = 48 + i * 90;
    ctx.beginPath();
    ctx.moveTo(x, 124);
    ctx.lineTo(x + 22, 148);
    ctx.lineTo(x + 44, 124);
    ctx.closePath();
    ctx.fill();
  }

  for (let i = 0; i < 7; i += 1) {
    const x = 92 + i * 146;
    drawWallPot(x, 178, i);
  }
}

function drawBoard() {
  ctx.save();
  ctx.fillStyle = "rgba(36, 50, 52, 0.18)";
  roundRect(board.x - 20, board.y + 22, board.w + 44, board.h + 24, 14);
  ctx.fill();

  ctx.fillStyle = "#cfb06d";
  roundRect(board.x - 14, board.y - 14, board.w + 28, board.h + 28, 14);
  ctx.fill();
  drawLimestoneTexture();

  ctx.save();
  roundRect(board.x, board.y, board.w, board.h, 8);
  ctx.clip();
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const x = board.x + col * cellW;
      const y = board.y + row * cellH;
      drawLawnTile(x, y, row, col);
    }
  }

  drawGardenTexture();
  ctx.restore();

  ctx.strokeStyle = "rgba(38, 50, 56, 0.18)";
  ctx.lineWidth = 2;
  for (let col = 0; col <= COLS; col += 1) {
    const x = board.x + col * cellW;
    ctx.beginPath();
    ctx.moveTo(x, board.y);
    ctx.lineTo(x, board.y + board.h);
    ctx.stroke();
  }
  for (let row = 0; row <= ROWS; row += 1) {
    const y = board.y + row * cellH;
    ctx.beginPath();
    ctx.moveTo(board.x, y);
    ctx.lineTo(board.x + board.w, y);
    ctx.stroke();
  }

  drawGate();
  drawHarborEntry();
  ctx.restore();
}

function drawSeaTexture() {
  const shimmerTime = state ? state.time : 0;
  decoration.seaGlints.forEach((glint, index) => {
    ctx.save();
    ctx.globalAlpha = glint.a * (0.72 + Math.sin(shimmerTime * 0.8 + index) * 0.18);
    ctx.strokeStyle = index % 2 ? "#fff8e8" : "#bdeaf0";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(glint.x, glint.y);
    ctx.quadraticCurveTo(glint.x + glint.w * 0.5, glint.y - 5, glint.x + glint.w, glint.y);
    ctx.stroke();
    ctx.restore();
  });
}

function drawFestaGarland() {
  ctx.save();
  ctx.strokeStyle = "rgba(38, 50, 56, 0.34)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(34, 100);
  ctx.quadraticCurveTo(330, 142, 610, 102);
  ctx.quadraticCurveTo(850, 72, 1088, 104);
  ctx.stroke();

  const colorsList = ["#d4433a", "#f4b942", "#1f8eb8", "#fff8e8"];
  for (let i = 0; i < 22; i += 1) {
    const x = 50 + i * 49;
    const y = 101 + Math.sin(i * 0.72) * 16;
    ctx.fillStyle = colorsList[i % colorsList.length];
    ctx.beginPath();
    ctx.moveTo(x - 9, y);
    ctx.lineTo(x + 9, y);
    ctx.lineTo(x, y + 22);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(38, 50, 56, 0.16)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

function drawWallPot(x, y, index) {
  ctx.save();
  ctx.fillStyle = "#b9782f";
  roundRect(x - 15, y - 6, 30, 16, 5);
  ctx.fill();
  ctx.fillStyle = index % 2 ? "#2d8b57" : "#537f46";
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.ellipse(x - 10 + i * 10, y - 12 - Math.sin(index + i) * 2, 5, 15, -0.25 + i * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawLimestoneTexture() {
  ctx.save();
  ctx.strokeStyle = "rgba(105, 89, 52, 0.16)";
  ctx.lineWidth = 2;
  for (let x = board.x - 6; x < board.x + board.w + 14; x += 72) {
    ctx.beginPath();
    ctx.moveTo(x, board.y - 14);
    ctx.lineTo(x - 18, board.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 14, board.y + board.h);
    ctx.lineTo(x - 4, board.y + board.h + 14);
    ctx.stroke();
  }
  for (let y = board.y + 18; y < board.y + board.h; y += 68) {
    ctx.beginPath();
    ctx.moveTo(board.x - 14, y);
    ctx.lineTo(board.x, y + 18);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(board.x + board.w, y - 12);
    ctx.lineTo(board.x + board.w + 14, y + 7);
    ctx.stroke();
  }

  decoration.stonePocks.forEach((pock) => {
    ctx.globalAlpha = pock.a;
    ctx.fillStyle = "#6d5b35";
    ctx.beginPath();
    ctx.arc(pock.x, pock.y, pock.r, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.globalAlpha = 1;
  decoration.stoneCracks.forEach((crack) => {
    ctx.save();
    ctx.globalAlpha = crack.a;
    ctx.strokeStyle = "#6d5b35";
    ctx.lineWidth = 1.6;
    ctx.translate(crack.x, crack.y);
    ctx.rotate(crack.angle);
    ctx.beginPath();
    ctx.moveTo(-crack.len * 0.5, 0);
    ctx.lineTo(crack.len * 0.15, 2);
    ctx.lineTo(crack.len * 0.5, -1);
    ctx.stroke();
    ctx.restore();
  });
  ctx.restore();
}

function drawLawnTile(x, y, row, col) {
  const isGarden = (row + col) % 2 === 0;
  const tileGradient = ctx.createLinearGradient(x, y, x, y + cellH);
  tileGradient.addColorStop(0, isGarden ? "#82bf69" : "#91cc75");
  tileGradient.addColorStop(0.55, isGarden ? "#6fa95c" : "#7dbb67");
  tileGradient.addColorStop(1, isGarden ? "#5f964f" : "#70a95b");
  ctx.fillStyle = tileGradient;
  ctx.fillRect(x, y, cellW, cellH);

  ctx.fillStyle = isGarden ? "rgba(37, 96, 43, 0.12)" : "rgba(255, 248, 232, 0.13)";
  roundRect(x + 5, y + 5, cellW - 10, cellH - 10, 9);
  ctx.fill();

  ctx.fillStyle = "rgba(38, 50, 56, 0.06)";
  ctx.fillRect(x, y + cellH - 8, cellW, 8);
  ctx.fillStyle = "rgba(255, 248, 232, 0.1)";
  ctx.fillRect(x, y + 1, cellW, 4);

  if (col % 3 === 1) {
    ctx.fillStyle = "rgba(244, 216, 148, 0.11)";
    ctx.beginPath();
    ctx.ellipse(x + cellW * 0.52, y + cellH * 0.52, cellW * 0.36, cellH * 0.22, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGardenTexture() {
  decoration.grassSpeckles.forEach((item) => {
    ctx.save();
    ctx.globalAlpha = item.a;
    ctx.fillStyle = item.light ? "#fff6cf" : "#263238";
    ctx.beginPath();
    ctx.arc(item.x, item.y, item.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  decoration.grassTufts.forEach((tuft) => {
    drawGrassTuft(tuft.x, tuft.y, tuft.scale, tuft.lean, tuft.color, tuft.a);
  });

  decoration.flowers.forEach((flower) => {
    drawTinyFlower(flower.x, flower.y, flower.scale, flower.color);
  });
}

function drawGrassTuft(x, y, scale, lean, color, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  for (let i = -1; i <= 1; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * 4, 4);
    ctx.quadraticCurveTo(i * 3 + lean * 8, -4, i * 7 + lean * 10, -15 - Math.abs(i) * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTinyFlower(x, y, scale, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  for (let i = 0; i < 5; i += 1) {
    const angle = (i * Math.PI * 2) / 5;
    ctx.beginPath();
    ctx.ellipse(Math.cos(angle) * 4, Math.sin(angle) * 4, 3, 5, angle, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#f4b942";
  ctx.beginPath();
  ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGate() {
  const x = board.x - 88;
  const y = board.y + 22;
  ctx.fillStyle = "#d7bd78";
  roundRect(x, y, 68, board.h - 44, 22);
  ctx.fill();
  ctx.fillStyle = "#16687f";
  roundRect(x + 12, y + 36, 44, board.h - 98, 18);
  ctx.fill();
  ctx.fillStyle = "#f4b942";
  ctx.beginPath();
  ctx.arc(x + 48, y + board.h / 2, 4, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < state.lives; i += 1) {
    ctx.fillStyle = "#d4433a";
    ctx.beginPath();
    ctx.arc(x + 18 + i * 17, y + 18, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHarborEntry() {
  const x = board.x + board.w + 24;
  const roadGradient = ctx.createLinearGradient(x, board.y, x + 88, board.y);
  roadGradient.addColorStop(0, "#8d8f83");
  roadGradient.addColorStop(0.5, "#707a7b");
  roadGradient.addColorStop(1, "#5f686d");
  ctx.fillStyle = roadGradient;
  roundRect(x, board.y - 14, 88, board.h + 28, 14);
  ctx.fill();

  ctx.save();
  roundRect(x, board.y - 14, 88, board.h + 28, 14);
  ctx.clip();
  decoration.roadSpeckles.forEach((stone) => {
    ctx.globalAlpha = stone.a;
    ctx.fillStyle = stone.r > 2 ? "#fff8e8" : "#263238";
    ctx.beginPath();
    ctx.arc(stone.x, stone.y, stone.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "rgba(38, 50, 56, 0.16)";
  ctx.lineWidth = 2;
  for (let y = board.y + 22; y < board.y + board.h; y += 58) {
    ctx.beginPath();
    ctx.moveTo(x + 5, y);
    ctx.quadraticCurveTo(x + 38, y + 11, x + 83, y - 2);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = "rgba(255, 248, 232, 0.78)";
  ctx.lineWidth = 5;
  ctx.setLineDash([24, 22]);
  ctx.beginPath();
  ctx.moveTo(x + 44, board.y + 6);
  ctx.lineTo(x + 44, board.y + board.h - 6);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#d9c07b";
  roundRect(x - 18, board.y - 14, 22, board.h + 28, 8);
  ctx.fill();

  ctx.fillStyle = "rgba(244, 185, 66, 0.22)";
  for (let row = 0; row < ROWS; row += 1) {
    const y = board.y + row * cellH + cellH / 2;
    ctx.beginPath();
    ctx.moveTo(x - 18, y - 22);
    ctx.lineTo(x - 2, y);
    ctx.lineTo(x - 18, y + 22);
    ctx.closePath();
    ctx.fill();
  }
}

function drawHover() {
  if (!state.hoverTile || state.status !== "playing") return;
  const { row, col } = state.hoverTile;
  const key = tileKey(row, col);
  const x = board.x + col * cellW;
  const y = board.y + row * cellH;

  if (state.toolMode === "shovel") {
    const defender = getDefenderAtTile(state.hoverTile);
    ctx.save();
    ctx.fillStyle = defender ? "rgba(212, 67, 58, 0.22)" : "rgba(185, 120, 47, 0.1)";
    ctx.strokeStyle = defender ? colors.festa : "rgba(185, 120, 47, 0.5)";
    ctx.lineWidth = defender ? 3 : 2;
    roundRect(x + 5, y + 5, cellW - 10, cellH - 10, 10);
    ctx.fill();
    ctx.stroke();
    if (defender) {
      drawShovelGlyph(x + cellW - 20, y + 22, colors.festa);
    }
    ctx.restore();
    return;
  }

  if (!state.selected) {
    const defender = getDefenderAtTile(state.hoverTile);
    const nextUpgrade = defender ? getNextUpgrade(defender) : null;
    if (!nextUpgrade) return;
    const canUpgrade = state.resources >= nextUpgrade.cost;
    ctx.save();
    ctx.fillStyle = canUpgrade ? "rgba(49, 166, 217, 0.2)" : "rgba(206, 62, 54, 0.18)";
    ctx.strokeStyle = canUpgrade ? "#31a6d9" : "#ce3e36";
    ctx.lineWidth = 3;
    roundRect(x + 5, y + 5, cellW - 10, cellH - 10, 10);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = canUpgrade ? 0.9 : 0.58;
    popUpgradeGlyph(x + cellW - 18, y + 20, canUpgrade ? "#31a6d9" : "#ce3e36");
    ctx.restore();
    return;
  }

  const data = DEFENDERS[state.selected];
  const canPlace =
    !state.occupied.has(key) && state.resources >= data.cost && state.cooldowns[state.selected] <= 0;

  ctx.save();
  ctx.fillStyle = canPlace ? "rgba(31, 142, 184, 0.22)" : "rgba(206, 62, 54, 0.24)";
  ctx.strokeStyle = canPlace ? "#1f8eb8" : "#ce3e36";
  ctx.lineWidth = 3;
  roundRect(x + 5, y + 5, cellW - 10, cellH - 10, 10);
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = 0.62;
  drawDefender({
    type: state.selected,
    x: x + cellW / 2,
    y: y + cellH / 2,
    row,
    col,
    hp: data.health,
    maxHp: data.health,
    arm: data.armTime || 0,
    flash: 0,
  });
  ctx.restore();
}

function popUpgradeGlyph(x, y, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(255, 248, 232, 0.88)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -11);
  ctx.lineTo(12, 4);
  ctx.lineTo(4, 4);
  ctx.lineTo(4, 13);
  ctx.lineTo(-4, 13);
  ctx.lineTo(-4, 4);
  ctx.lineTo(-12, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawShovelGlyph(x, y, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.72);
  ctx.strokeStyle = "#fff8e8";
  ctx.fillStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -17);
  ctx.lineTo(0, 9);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, -17);
  ctx.lineTo(0, 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-8, 8);
  ctx.quadraticCurveTo(0, 18, 8, 8);
  ctx.lineTo(5, 2);
  ctx.lineTo(-5, 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#fff8e8";
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.restore();
}

function drawEntities() {
  const drawables = [
    ...state.defenders.map((item) => ({ layer: item.row * 10 + 3, item, kind: "defender" })),
    ...state.enemies.map((item) => ({ layer: item.row * 10 + 6, item, kind: "enemy" })),
    ...state.deathEffects.map((item) => ({ layer: item.row * 10 + 7, item, kind: "death" })),
  ].sort((a, b) => a.layer - b.layer || a.item.y - b.item.y || a.item.x - b.item.x);

  drawables.forEach((drawable) => {
    if (drawable.kind === "defender") {
      drawDefender(drawable.item);
    } else if (drawable.kind === "enemy") {
      drawEnemy(drawable.item);
    } else {
      drawDeathEffect(drawable.item);
    }
  });
}

function drawProjectiles() {
  state.projectiles.forEach((projectile) => {
    ctx.save();
    ctx.translate(projectile.x, projectile.y);
    ctx.rotate(projectile.spin);
    if (projectile.kind === "spike") {
      ctx.fillStyle = projectile.freezeDuration ? "#8edff0" : colors.cactus;
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-11, -5);
      ctx.lineTo(-7, 0);
      ctx.lineTo(-11, 5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#fff8e8";
      ctx.lineWidth = 2;
      ctx.stroke();
      if (projectile.freezeDuration) {
        ctx.strokeStyle = "#bdf4ff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-1, -10);
        ctx.lineTo(-1, 10);
        ctx.moveTo(-8, 0);
        ctx.lineTo(7, 0);
        ctx.stroke();
      }
    } else if (projectile.kind === "petal") {
      ctx.fillStyle = "#e45a78";
      ctx.strokeStyle = "#fff8e8";
      ctx.lineWidth = 2.5;
      for (let i = 0; i < 4; i += 1) {
        ctx.save();
        ctx.rotate(i * Math.PI * 0.5);
        ctx.beginPath();
        ctx.ellipse(7, 0, 9, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = colors.gold;
      ctx.beginPath();
      ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (projectile.kind === "bell") {
      ctx.strokeStyle = "rgba(185, 120, 47, 0.68)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, 18, -0.9, 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-8, 0, 10, -0.9, 0.9);
      ctx.stroke();
    } else if (projectile.kind === "bone") {
      const scale = projectile.scale || 1;
      ctx.scale(scale, scale);
      ctx.fillStyle = "#fff0bd";
      ctx.strokeStyle = "#7c5133";
      ctx.lineWidth = 2.5;
      roundRect(-10, -4, 20, 8, 4);
      ctx.fill();
      ctx.stroke();
      [
        [-12, -5],
        [-12, 5],
        [12, -5],
        [12, 5],
      ].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    } else {
      ctx.fillStyle = "#fff0bd";
      ctx.strokeStyle = "#c8892f";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, 15, 9, 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  });
}

function drawParticles() {
  state.particles.forEach((particle) => {
    const alpha = Math.max(0, particle.life / particle.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    if (particle.text) {
      ctx.font = "900 18px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.strokeStyle = "rgba(255, 248, 232, 0.86)";
      ctx.lineWidth = 4;
      ctx.strokeText(particle.text, particle.x, particle.y);
      ctx.fillText(particle.text, particle.x, particle.y);
    } else if (particle.kind === "ring") {
      const progress = 1 - particle.life / particle.maxLife;
      ctx.globalAlpha = alpha * 0.72;
      ctx.strokeStyle = particle.color;
      ctx.lineWidth = 5 * (1 - progress) + 1;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * progress, 0, Math.PI * 2);
      ctx.stroke();
    } else if (particle.kind === "heart") {
      ctx.translate(particle.x, particle.y);
      ctx.rotate(Math.sin(particle.life * 14) * 0.18);
      drawHeart(0, 0, particle.size);
    } else if (particle.kind === "star") {
      ctx.translate(particle.x, particle.y);
      ctx.rotate(state.time * 5 + particle.x);
      drawStar(0, 0, particle.size);
    } else {
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

function drawHeart(x, y, size) {
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.35);
  ctx.bezierCurveTo(
    x - size,
    y - size * 0.25,
    x - size * 0.45,
    y - size,
    x,
    y - size * 0.42,
  );
  ctx.bezierCurveTo(
    x + size * 0.45,
    y - size,
    x + size,
    y - size * 0.25,
    x,
    y + size * 0.35,
  );
  ctx.fill();
}

function drawStar(x, y, size) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? size : size * 0.42;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function easeOutBack(t) {
  const clamped = Math.max(0, Math.min(1, t));
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(clamped - 1, 3) + c1 * Math.pow(clamped - 1, 2);
}

function smoothStep(t) {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

function getSpriteMask(spriteKey) {
  const image = sprites[spriteKey];
  if (!image || !image.complete || !image.naturalWidth) return null;

  const cached = spriteMaskCache.get(spriteKey);
  if (
    cached &&
    cached.width === image.naturalWidth &&
    cached.height === image.naturalHeight
  ) {
    return cached;
  }

  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const sourceCtx = source.getContext("2d", { willReadFrequently: true });
  sourceCtx.drawImage(image, 0, 0);

  let pixels;
  try {
    pixels = sourceCtx.getImageData(0, 0, width, height);
  } catch (error) {
    return null;
  }

  const raw = pixels.data;
  let edgePixels = 0;
  let transparentEdgePixels = 0;
  const countEdgePixel = (x, y) => {
    const offset = (y * width + x) * 4;
    edgePixels += 1;
    if (raw[offset + 3] <= 12) transparentEdgePixels += 1;
  };
  for (let x = 0; x < width; x += 1) {
    countEdgePixel(x, 0);
    countEdgePixel(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    countEdgePixel(0, y);
    countEdgePixel(width - 1, y);
  }
  const hasTransparentCutout = transparentEdgePixels / Math.max(1, edgePixels) > 0.08;
  const background = new Uint8Array(width * height);
  const seen = new Uint8Array(width * height);
  const stack = [];
  const pixelIndex = (x, y) => y * width + x;
  const isFloodableBackground = (index) => {
    const offset = index * 4;
    const alpha = raw[offset + 3];
    return (
      alpha <= 12 ||
      (!hasTransparentCutout &&
        alpha > 12 &&
        raw[offset] > 238 &&
        raw[offset + 1] > 238 &&
        raw[offset + 2] > 230)
    );
  };
  const seedBackground = (x, y) => {
    const index = pixelIndex(x, y);
    if (!seen[index] && isFloodableBackground(index)) stack.push(index);
  };

  for (let x = 0; x < width; x += 1) {
    seedBackground(x, 0);
    seedBackground(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    seedBackground(0, y);
    seedBackground(width - 1, y);
  }

  while (stack.length) {
    const index = stack.pop();
    if (seen[index] || !isFloodableBackground(index)) continue;
    seen[index] = 1;
    background[index] = 1;
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) stack.push(index - 1);
    if (x < width - 1) stack.push(index + 1);
    if (y > 0) stack.push(index - width);
    if (y < height - 1) stack.push(index + width);
  }

  const mask = document.createElement("canvas");
  mask.width = width;
  mask.height = height;
  const maskCtx = mask.getContext("2d");
  const maskPixels = maskCtx.createImageData(width, height);
  const maskRaw = maskPixels.data;
  const clean = document.createElement("canvas");
  clean.width = width;
  clean.height = height;
  const cleanCtx = clean.getContext("2d");
  const cleanPixels = cleanCtx.createImageData(width, height);
  const cleanRaw = cleanPixels.data;

  for (let index = 0; index < width * height; index += 1) {
    const sourceOffset = index * 4;
    const alpha = raw[sourceOffset + 3];
    if (!background[index] && alpha > 12) {
      maskRaw[sourceOffset] = 255;
      maskRaw[sourceOffset + 1] = 255;
      maskRaw[sourceOffset + 2] = 255;
      maskRaw[sourceOffset + 3] = alpha;
      cleanRaw[sourceOffset] = raw[sourceOffset];
      cleanRaw[sourceOffset + 1] = raw[sourceOffset + 1];
      cleanRaw[sourceOffset + 2] = raw[sourceOffset + 2];
      cleanRaw[sourceOffset + 3] = alpha;
    }
  }

  maskCtx.putImageData(maskPixels, 0, 0);
  cleanCtx.putImageData(cleanPixels, 0, 0);

  const result = {
    width,
    height,
    clean,
    mask,
    rim: null,
    tints: new Map(),
  };
  spriteMaskCache.set(spriteKey, result);
  return result;
}

function getTintedSpriteMask(spriteKey, color) {
  const maskData = getSpriteMask(spriteKey);
  if (!maskData) return null;
  const cached = maskData.tints.get(color);
  if (cached) return cached;

  const tinted = document.createElement("canvas");
  tinted.width = maskData.width;
  tinted.height = maskData.height;
  const tintedCtx = tinted.getContext("2d");
  tintedCtx.drawImage(maskData.mask, 0, 0);
  tintedCtx.globalCompositeOperation = "source-in";
  tintedCtx.fillStyle = color;
  tintedCtx.fillRect(0, 0, tinted.width, tinted.height);
  tintedCtx.globalCompositeOperation = "source-over";

  maskData.tints.set(color, tinted);
  return tinted;
}

function getFrostRim(spriteKey) {
  const maskData = getSpriteMask(spriteKey);
  if (!maskData) return null;
  if (maskData.rim) return maskData.rim;

  const rim = document.createElement("canvas");
  rim.width = maskData.width;
  rim.height = maskData.height;
  const rimCtx = rim.getContext("2d");
  const offsets = [
    [-4, 0],
    [4, 0],
    [0, -4],
    [0, 4],
    [-3, -3],
    [3, -3],
    [-3, 3],
    [3, 3],
  ];

  offsets.forEach(([x, y]) => {
    rimCtx.drawImage(maskData.mask, x, y);
  });
  rimCtx.globalCompositeOperation = "destination-out";
  rimCtx.drawImage(maskData.mask, 0, 0);
  rimCtx.globalCompositeOperation = "source-in";
  rimCtx.fillStyle = "#bdf4ff";
  rimCtx.fillRect(0, 0, rim.width, rim.height);
  rimCtx.globalCompositeOperation = "source-over";

  maskData.rim = rim;
  return rim;
}

function drawSprite(spriteKey, centerX, bottomY, maxW, maxH, options = {}) {
  const image = sprites[spriteKey];
  if (!image || !image.complete || !image.naturalWidth) return false;
  const settings = typeof options === "boolean" ? { flip: options } : options;
  const spriteMask = getSpriteMask(spriteKey);
  const renderImage = spriteMask ? spriteMask.clean : image;

  const scale = Math.min(maxW / image.naturalWidth, maxH / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;

  ctx.save();
  ctx.translate(centerX, bottomY);
  ctx.rotate(settings.rotation || 0);
  if (settings.alpha !== undefined) ctx.globalAlpha *= settings.alpha;
  ctx.scale(settings.flip ? -1 : 1, 1);
  ctx.scale(settings.scaleX || 1, settings.scaleY || 1);
  ctx.drawImage(renderImage, -width / 2, -height, width, height);

  if (settings.tint) {
    const tinted = getTintedSpriteMask(spriteKey, settings.tint);
    ctx.globalAlpha *= settings.tintAlpha === undefined ? 0.4 : settings.tintAlpha;
    if (tinted) {
      ctx.drawImage(tinted, -width / 2, -height, width, height);
    }
  }

  ctx.restore();

  return true;
}

function drawSpriteFrostRim(spriteKey, centerX, bottomY, maxW, maxH, options = {}) {
  const image = sprites[spriteKey];
  if (!image || !image.complete || !image.naturalWidth) return false;
  const rim = getFrostRim(spriteKey);
  if (!rim) return false;

  const settings = typeof options === "boolean" ? { flip: options } : options;
  const scale = Math.min(maxW / image.naturalWidth, maxH / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;

  ctx.save();
  ctx.translate(centerX, bottomY);
  ctx.rotate(settings.rotation || 0);
  if (settings.alpha !== undefined) ctx.globalAlpha *= settings.alpha;
  ctx.scale(settings.flip ? -1 : 1, 1);
  ctx.scale(settings.scaleX || 1, settings.scaleY || 1);
  ctx.shadowColor = "rgba(189, 244, 255, 0.8)";
  ctx.shadowBlur = 8;
  ctx.drawImage(rim, -width / 2, -height, width, height);
  ctx.restore();

  return true;
}

function drawBombTimer(defender) {
  const ratio = Math.max(0, defender.arm / DEFENDERS.bomb.armTime);
  const charge = getBombCharge(defender);
  ctx.strokeStyle = "rgba(255, 248, 232, 0.88)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, -10, 36 + charge.warning * 8, -Math.PI / 2, -Math.PI / 2 + (1 - ratio) * Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = colors.gold;
  ctx.beginPath();
  ctx.arc(21, -41, 4 + (1 - ratio) * 4, 0, Math.PI * 2);
  ctx.fill();

  if (charge.warning > 0) {
    ctx.save();
    ctx.globalAlpha = 0.22 + charge.warning * 0.28;
    ctx.strokeStyle = colors.festa;
    ctx.lineWidth = 4;
    for (let i = 0; i < 2; i += 1) {
      const radius = 34 + charge.warning * 22 + i * 13;
      ctx.beginPath();
      ctx.arc(0, 1, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawSoundPulse(startRadius, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  for (let i = 0; i < 3; i += 1) {
    ctx.globalAlpha = 0.55 - i * 0.13;
    ctx.beginPath();
    ctx.arc(18, -12, startRadius + i * 12, -0.75, 0.75);
    ctx.stroke();
  }
  ctx.restore();
}

function drawUpgradeMeter(defender) {
  const base = DEFENDERS[defender.type];
  if (!base?.upgrades) return;

  const stage = defender.upgradeStage || 0;
  const totalStages = base.upgrades.length + 1;
  const nextUpgrade = getNextUpgrade(defender);
  if (!nextUpgrade) return;

  const ready = Boolean(nextUpgrade && state.resources >= nextUpgrade.cost);
  const pulse = 0.5 + Math.sin(state.time * 5.4 + defender.x * 0.03) * 0.5;
  const y = -68;
  const width = totalStages * 13 + 12;

  if (ready) {
    ctx.save();
    ctx.globalAlpha = 0.16 + pulse * 0.14;
    ctx.fillStyle = "#8edff0";
    ctx.beginPath();
    ctx.ellipse(8, -8, 46 + pulse * 8, 38 + pulse * 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(-width / 2 + 4, y);
  ctx.fillStyle = ready ? "rgba(142, 223, 240, 0.9)" : "rgba(255, 253, 245, 0.84)";
  roundRect(0, 0, width, 17, 8);
  ctx.fill();
  ctx.strokeStyle = ready ? "#31a6d9" : "rgba(38, 50, 56, 0.28)";
  ctx.lineWidth = 2;
  roundRect(0, 0, width, 17, 8);
  ctx.stroke();

  for (let i = 0; i < totalStages; i += 1) {
    const filled = i <= stage;
    const x = 9 + i * 13;
    ctx.fillStyle = filled ? "#31a6d9" : "rgba(38, 50, 56, 0.18)";
    ctx.beginPath();
    ctx.arc(x, 8.5, filled && i === stage ? 4.2 : 3.6, 0, Math.PI * 2);
    ctx.fill();
    if (ready && i === stage + 1) {
      ctx.strokeStyle = "#fff8e8";
      ctx.lineWidth = 1.8 + pulse * 0.8;
      ctx.beginPath();
      ctx.arc(x, 8.5, 5.5 + pulse * 1.4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();

  if (ready) {
    ctx.save();
    ctx.globalAlpha = 0.75 + pulse * 0.25;
    popUpgradeGlyph(33, -50 - pulse * 2, "#31a6d9");
    ctx.restore();
  }
}

function drawDefender(defender) {
  const data = getDefenderStats(defender);
  ctx.save();
  ctx.translate(defender.x, defender.y);
  const damagePower = Math.min(1, (defender.damageFlash || 0) / 0.2);
  if (damagePower > 0) {
    ctx.translate(
      Math.sin(state.time * 72 + defender.x) * 3.2 * damagePower,
      Math.cos(state.time * 58 + defender.y) * 1.4 * damagePower,
    );
  }
  const bombCharge = data.bomb ? getBombCharge(defender) : null;

  drawGroundShadow(
    0,
    25,
    data.bomb ? 34 * bombCharge.scale : 34,
    data.bomb ? 9 * (1 + bombCharge.warning * 0.35) : 9,
  );

  if (data.generator) {
    const pulse = 1 + Math.sin(state.time * 3.2 + defender.x) * 0.08;
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = colors.gold;
    ctx.beginPath();
    ctx.arc(0, -12, 34 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (defender.ultraFlash > 0) {
    const power = Math.min(1, defender.ultraFlash / 1.15);
    const pulse = 0.5 + Math.sin(state.time * 13 + defender.x) * 0.5;
    ctx.save();
    ctx.globalAlpha = 0.18 + power * 0.26;
    ctx.fillStyle = "#8edff0";
    ctx.beginPath();
    ctx.ellipse(6, -8, 42 + pulse * 9, 34 + pulse * 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.35 + power * 0.28;
    ctx.strokeStyle = colors.gold;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(4, -8, 52 + (1 - power) * 34, 39 + (1 - power) * 18, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const bornAt = defender.bornAt === undefined ? state.time - 1 : defender.bornAt;
  const age = Math.max(0, state.time - bornAt);
  const entrance = age < 0.36 ? easeOutBack(age / 0.36) : 1;
  const breath = Math.sin(state.time * 3.1 + defender.x * 0.04) * 0.035;
  const bob = Math.sin(state.time * 2.4 + defender.x * 0.03) * 2;
  const flashPower = Math.min(1, defender.flash / 0.22);
  const damageRatio = defender.hp < defender.maxHp ? 1 - defender.hp / defender.maxHp : 0;
  const bombPulse = data.bomb ? bombCharge.scale : 1;
  const recoilX = data.projectile ? -flashPower * 5 : 0;
  const spriteScaleX = entrance * bombPulse * (1 + breath + flashPower * 0.1 + damagePower * 0.04);
  const spriteScaleY = entrance * bombPulse * (1 - breath * 0.5 - flashPower * 0.08 - damagePower * 0.03);
  const spriteRotation =
    (data.melee ? -flashPower * 0.16 : data.projectile ? -flashPower * 0.08 : 0) +
    Math.sin(state.time * 1.8 + defender.col) * 0.018 +
    Math.sin(state.time * 41 + defender.x) * damagePower * 0.045;
  const drewSprite = drawSprite(
    data.sprite,
    recoilX + (data.spriteOffsetX || 0),
    38 + bob,
    data.spriteWidth || 82,
    data.spriteHeight || 84,
    {
      scaleX: spriteScaleX,
      scaleY: spriteScaleY,
      rotation: spriteRotation,
      tint:
        defender.flash > 0.08 && data.generator
          ? "#fff8e8"
          : data.bomb && bombCharge.warning > 0.55
            ? "#fff8e8"
            : damagePower > 0
              ? "#f07f4f"
              : null,
      tintAlpha:
        data.bomb && bombCharge.warning > 0.55
          ? 0.18 + bombCharge.warning * 0.2
          : damagePower > 0
            ? 0.26 + damagePower * 0.18
            : 0.28,
    },
  );

  if (!drewSprite) {
    if (defender.type === "lantern") drawLantern(defender);
    if (defender.type === "pastizz") drawPastizzCannon(defender);
    if (defender.type === "bajtra") drawBajtra(defender);
    if (defender.type === "pinkbud") drawPinkBud(defender);
    if (defender.type === "knight") drawKnight(defender);
    if (defender.type === "bomb") drawBomb(defender);
    if (defender.type === "bell") drawBell(defender);
  }

  if (defender.type === "knight" && drewSprite) {
    drawMdinaShieldOverlay(defender, flashPower);
  }

  if (defender.type === "knight" && (damageRatio > 0.2 || damagePower > 0)) {
    drawKnightDamageOverlay(defender, damageRatio, damagePower);
  }

  if (data.bomb) {
    drawBombTimer(defender);
  }

  if (defender.flash > 0 && data.projectile === "bell") {
    drawSoundPulse(28, colors.bronze);
  }

  if (defender.flash > 0 && data.melee) {
    ctx.strokeStyle = "rgba(255, 248, 232, 0.9)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(24, -12, 28, -0.9, 0.7);
    ctx.stroke();
  }

  drawUpgradeMeter(defender);

  if (defender.hp < defender.maxHp) {
    drawBar(-27, -46, 54, 7, defender.hp / defender.maxHp, colors.health, colors.damage);
  }

  ctx.restore();
}

function drawLantern(defender) {
  const pulse = 1 + Math.sin(state.time * 3.2 + defender.x) * 0.07;
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = colors.gold;
  ctx.beginPath();
  ctx.arc(0, -6, 34 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = colors.sea;
  ctx.beginPath();
  ctx.moveTo(-29, 14);
  ctx.quadraticCurveTo(0, 28, 29, 14);
  ctx.lineTo(22, 31);
  ctx.quadraticCurveTo(0, 39, -22, 31);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#fff8e8";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = colors.gold;
  roundRect(-13, -26, 26, 38, 8);
  ctx.fill();
  ctx.fillStyle = "#fff6cf";
  ctx.beginPath();
  ctx.arc(0, -7, 10, 0, Math.PI * 2);
  ctx.fill();
}

function drawPastizzCannon() {
  ctx.fillStyle = "#c7782c";
  roundRect(-15, -26, 43, 20, 9);
  ctx.fill();
  ctx.fillStyle = "#7c5133";
  roundRect(4, -22, 36, 12, 5);
  ctx.fill();

  ctx.fillStyle = "#f3c76a";
  ctx.beginPath();
  ctx.ellipse(-7, 8, 33, 25, -0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#c8892f";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.strokeStyle = "#fff0bd";
  ctx.lineWidth = 3;
  for (let i = -18; i <= 12; i += 10) {
    ctx.beginPath();
    ctx.moveTo(i, -8);
    ctx.quadraticCurveTo(i + 10, 6, i, 20);
    ctx.stroke();
  }
}

function drawBajtra() {
  ctx.fillStyle = colors.cactus;
  roundRect(-14, -38, 28, 68, 14);
  ctx.fill();
  roundRect(-33, -16, 20, 43, 11);
  ctx.fill();
  roundRect(13, -27, 19, 45, 10);
  ctx.fill();

  ctx.fillStyle = "#e1558e";
  [[-4, -26], [9, -12], [-21, 4], [22, 2]].forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.strokeStyle = "#b8efb0";
  ctx.lineWidth = 2;
  for (let y = -25; y < 25; y += 14) {
    ctx.beginPath();
    ctx.moveTo(-6, y);
    ctx.lineTo(6, y - 5);
    ctx.stroke();
  }
}

function drawPinkBud() {
  ctx.fillStyle = "#537f46";
  ctx.beginPath();
  ctx.ellipse(-10, 22, 17, 8, -0.3, 0, Math.PI * 2);
  ctx.ellipse(13, 22, 18, 8, 0.25, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#2d8b57";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, 28);
  ctx.quadraticCurveTo(-2, 2, 2, -16);
  ctx.stroke();

  ctx.fillStyle = "#e45a78";
  ctx.strokeStyle = "#fff8e8";
  ctx.lineWidth = 3;
  for (let i = 0; i < 6; i += 1) {
    const angle = i * Math.PI / 3;
    ctx.save();
    ctx.translate(Math.cos(angle) * 10, -20 + Math.sin(angle) * 8);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = colors.gold;
  ctx.beginPath();
  ctx.arc(0, -20, 8, 0, Math.PI * 2);
  ctx.fill();
}

function drawKnight() {
  ctx.fillStyle = "#6d7f86";
  roundRect(-19, -20, 38, 48, 11);
  ctx.fill();
  ctx.fillStyle = "#a8b6bc";
  roundRect(-15, -45, 30, 28, 10);
  ctx.fill();
  ctx.fillStyle = colors.ink;
  ctx.fillRect(-10, -33, 20, 4);

  ctx.fillStyle = "#d4433a";
  ctx.beginPath();
  ctx.moveTo(-34, -16);
  ctx.quadraticCurveTo(-52, 2, -34, 25);
  ctx.quadraticCurveTo(-15, 4, -34, -16);
  ctx.fill();
  ctx.strokeStyle = "#fff8e8";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.strokeStyle = "#d9dce0";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(20, -15);
  ctx.lineTo(39, -35);
  ctx.stroke();
}

function getBombCharge(defender) {
  const data = DEFENDERS[defender.type];
  if (!data || !data.bomb) {
    return { progress: 0, scale: 1, warning: 0 };
  }

  const progress = 1 - Math.max(0, Math.min(1, defender.arm / data.armTime));
  const swellRaw = Math.max(0, Math.min(1, (progress - 0.34) / 0.66));
  const swell = swellRaw * swellRaw * (3 - 2 * swellRaw);
  const warning = Math.max(0, Math.min(1, (progress - 0.72) / 0.28));
  const pulse = Math.sin(state.time * (11 + warning * 12)) * (0.025 + warning * 0.055);

  return {
    progress,
    warning,
    scale: 1 + swell * 0.24 + warning * 0.13 + pulse,
  };
}

function drawMdinaShieldOverlay(defender, flashPower) {
  const pulse = 1 + flashPower * 0.08;
  const bob = Math.sin(state.time * 2.4 + defender.x * 0.03) * 1.2;

  ctx.save();
  ctx.translate(40 + flashPower * 4, 18 + bob);
  ctx.scale(pulse * 0.82, pulse * 0.82);
  ctx.rotate(-0.08 + flashPower * 0.12);

  ctx.fillStyle = "rgba(38, 50, 56, 0.16)";
  ctx.beginPath();
  ctx.ellipse(2, 23, 17, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f2d894";
  ctx.strokeStyle = "#7c6a3d";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -25);
  ctx.quadraticCurveTo(18, -19, 18, -3);
  ctx.quadraticCurveTo(16, 15, 0, 25);
  ctx.quadraticCurveTo(-16, 15, -18, -3);
  ctx.quadraticCurveTo(-18, -19, 0, -25);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = colors.festa;
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(5, -4);
  ctx.lineTo(15, -4);
  ctx.lineTo(7, 3);
  ctx.lineTo(11, 14);
  ctx.lineTo(0, 8);
  ctx.lineTo(-11, 14);
  ctx.lineTo(-7, 3);
  ctx.lineTo(-15, -4);
  ctx.lineTo(-5, -4);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 248, 232, 0.76)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8, -19);
  ctx.quadraticCurveTo(0, -23, 9, -18);
  ctx.stroke();
  ctx.restore();
}

function drawKnightDamageOverlay(defender, damageRatio, damagePower) {
  const stage = Math.max(
    defender.crackStage || 0,
    damageRatio > 0.72 ? 3 : damageRatio > 0.5 ? 2 : damageRatio > 0.28 ? 1 : 0,
  );
  if (stage <= 0 && damagePower <= 0) return;

  ctx.save();
  ctx.globalAlpha = 0.48 + Math.min(0.42, damageRatio * 0.62 + damagePower * 0.24);
  ctx.translate(Math.sin(state.time * 36 + defender.x) * damagePower * 1.4, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeStyle = "rgba(38, 50, 56, 0.72)";
  ctx.lineWidth = 4;
  drawKnightCrackPaths(stage);

  ctx.strokeStyle = "rgba(255, 248, 232, 0.84)";
  ctx.lineWidth = 2;
  drawKnightCrackPaths(stage);

  ctx.fillStyle = "rgba(217, 192, 123, 0.9)";
  for (let i = 0; i < stage + 2; i += 1) {
    const x = -22 + i * 14 + Math.sin(defender.x + i) * 3;
    const y = 22 + Math.cos(defender.y + i) * 4;
    ctx.beginPath();
    ctx.ellipse(x, y, 2.5 + (i % 2), 1.6, 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  if (damagePower > 0) {
    ctx.strokeStyle = "rgba(206, 62, 54, 0.58)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(12, -4, 34 + damagePower * 10, -0.7, 0.72);
    ctx.stroke();
  }

  ctx.restore();
}

function drawKnightCrackPaths(stage) {
  ctx.beginPath();
  ctx.moveTo(23, -30);
  ctx.lineTo(14, -21);
  ctx.lineTo(20, -12);

  if (stage >= 2) {
    ctx.moveTo(-24, -18);
    ctx.lineTo(-12, -7);
    ctx.lineTo(-18, 7);
    ctx.moveTo(34, 9);
    ctx.lineTo(22, 18);
    ctx.lineTo(29, 29);
  }

  if (stage >= 3) {
    ctx.moveTo(-5, -42);
    ctx.lineTo(3, -30);
    ctx.lineTo(-4, -18);
    ctx.moveTo(-35, 16);
    ctx.lineTo(-25, 26);
  }

  ctx.stroke();
}

function drawBomb(defender) {
  const ratio = Math.max(0, defender.arm / DEFENDERS.bomb.armTime);
  const charge = getBombCharge(defender);
  ctx.save();
  ctx.scale(charge.scale, charge.scale);
  ctx.fillStyle = colors.festa;
  ctx.beginPath();
  ctx.arc(0, 2, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f07f4f";
  ctx.beginPath();
  ctx.arc(-8, -8, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#3f3228";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(13, -21);
  ctx.quadraticCurveTo(26, -39, 7, -46);
  ctx.stroke();

  ctx.fillStyle = colors.gold;
  ctx.beginPath();
  ctx.arc(7, -46, 5 + (1 - ratio) * 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 248, 232, 0.7)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 2, 35, -Math.PI / 2, -Math.PI / 2 + (1 - ratio) * Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawBell() {
  ctx.strokeStyle = "#6b4a2c";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-28, 28);
  ctx.lineTo(0, -36);
  ctx.lineTo(28, 28);
  ctx.stroke();

  ctx.fillStyle = colors.bronze;
  ctx.beginPath();
  ctx.moveTo(-24, 6);
  ctx.quadraticCurveTo(-19, -31, 0, -33);
  ctx.quadraticCurveTo(19, -31, 24, 6);
  ctx.lineTo(30, 19);
  ctx.lineTo(-30, 19);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#7a4d1d";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "#f4b942";
  ctx.beginPath();
  ctx.arc(0, 19, 7, 0, Math.PI * 2);
  ctx.fill();
}

function drawEnemy(enemy) {
  const data = ENEMIES[enemy.type];
  const blockedPower = Math.max(0, Math.min(1, enemy.blockedTimer / 0.32));
  const chew = Math.sin(enemy.age * 22 + enemy.seed);
  const hoverLift = getEnemyHoverLift(enemy);
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  if (enemy.attackFlash > 0) {
    ctx.translate(-2, 0);
  }
  if (blockedPower > 0) {
    ctx.translate(-Math.abs(chew) * 2.6 * blockedPower, Math.sin(enemy.age * 30) * blockedPower);
  }

  drawGroundShadow(0, data.radius + 12, data.radius + 11, 9);
  if (hoverLift > 0) {
    drawFloatingTells(enemy, data, hoverLift);
    ctx.translate(0, -hoverLift);
  }
  drawEnemyTraitEffects(enemy, data);

  const walkRate = data.speed > 35 ? 12 : data.speed < 18 ? 5.2 : 7.2;
  const walk = Math.sin(enemy.age * walkRate + enemy.seed);
  const step = Math.abs(walk);
  const hitPower = Math.min(1, enemy.hitFlash / 0.14);
  const freezePower = enemy.freezeMax
    ? Math.max(0, Math.min(1, enemy.freezeTimer / enemy.freezeMax))
    : 0;
  const burnPower = enemy.burnMax
    ? Math.max(0, Math.min(1, enemy.burnTimer / enemy.burnMax))
    : 0;
  const revealPower = Math.max(0, Math.min(1, enemy.revealFlash / 0.68));
  const shadowVeiled = isShadowVeiled(enemy);
  const crackPower =
    data.trait === "sneak" && !shadowVeiled
      ? Math.max(0, Math.min(1, (0.48 - enemy.hp / enemy.maxHp) / 0.26))
      : 0;
  const bob = -step * 3 + Math.sin(enemy.age * 2.2 + enemy.seed) * 1.2;
  const attackSquash = enemy.attackFlash > 0 ? 0.08 + blockedPower * 0.04 : 0;
  const spriteWidth = data.spriteWidth || 74;
  const spriteHeight = data.spriteHeight || 84;
  const spriteBottomY = data.radius + 18 + bob;
  const spriteOptions = {
    flip: data.flipSprite === true,
    scaleX: 1 + step * 0.035 + hitPower * 0.09 + blockedPower * 0.04,
    scaleY: 1 - step * 0.045 - attackSquash + hitPower * 0.04,
    rotation:
      walk * 0.045 -
      hitPower * 0.1 -
      Math.abs(chew) * blockedPower * 0.045 +
      Math.sin(enemy.age * 34 + enemy.seed) * crackPower * 0.035,
    tint:
      hitPower > 0 || revealPower > 0
        ? "#fff8e8"
        : shadowVeiled
          ? data.roleColor
          : null,
    tintAlpha: hitPower > 0 ? 0.52 : revealPower > 0 ? 0.42 : 0.28,
    alpha: shadowVeiled ? 0.5 + Math.sin(enemy.age * 5.1 + enemy.seed) * 0.09 : 1,
  };
  const drewSprite = drawSprite(
    data.sprite,
    Math.sin(enemy.age * 44 + enemy.seed) * (revealPower * 2.8 + crackPower * 1.4),
    spriteBottomY,
    spriteWidth,
    spriteHeight,
    spriteOptions,
  );

  if (freezePower > 0 && drewSprite) {
    drawSpriteFrostRim(data.sprite, 0, spriteBottomY, spriteWidth, spriteHeight, {
      ...spriteOptions,
      alpha: 0.58 + freezePower * 0.32,
    });
  }

  if (!drewSprite) {
    if (enemy.type === "tourist") drawTourist(enemy);
    if (enemy.type === "runner") drawRunner(enemy);
    if (enemy.type === "dancer") drawRunner(enemy);
    if (enemy.type === "shadow") drawShadow(enemy);
    if (enemy.type === "brute") drawBrute(enemy);
    if (enemy.type === "stonehound") drawBrute(enemy);
    if (enemy.type === "cruise") drawCruise(enemy);
    if (enemy.type === "ghoul") drawGhoul(enemy);
  }

  if (data.trait === "dance") {
    drawFestaDancerOverlay(enemy, data, enemy.dancePower || 0);
  }

  if (data.trait === "sneak") {
    drawShadowStateOverlay(enemy, data, { veiled: shadowVeiled, revealPower, crackPower });
  }

  if (enemy.danceBoost > 0) {
    drawDanceBoostEffect(enemy, data, enemy.danceBoost);
  }

  if (blockedPower > 0) {
    drawBlockedChew(enemy, data, blockedPower);
  }

  if (data.trait === "tank") {
    drawArmorChips(enemy);
  }

  if (freezePower > 0) {
    drawFrozenOverlay(enemy, data, freezePower);
  }

  if (burnPower > 0) {
    drawBurnOverlay(enemy, data, burnPower);
  }

  if (enemy.hitFlash > 0) {
    ctx.save();
    ctx.globalAlpha = enemy.hitFlash / 0.14;
    ctx.fillStyle = "rgba(255, 248, 232, 0.65)";
    ctx.beginPath();
    ctx.ellipse(0, -8, data.radius + 20, data.radius + 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const barWidth = data.barWidth || 56;
  const barHeight = data.hp >= 220 ? 9 : 7;
  const barY = -enemy.radius - 32;
  drawEnemyTraitBadge(-barWidth / 2 - 15, barY + barHeight / 2, data);
  drawBar(-barWidth / 2, barY, barWidth, barHeight, enemy.hp / enemy.maxHp, colors.health, colors.damage);

  if (enemy.slowTimer > 0) {
    ctx.strokeStyle = "rgba(31, 142, 184, 0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius + 10, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawDeathEffect(effect) {
  const progress = 1 - effect.life / effect.maxLife;
  ctx.save();
  ctx.translate(effect.x, effect.y);
  if (effect.style === "crumble") {
    drawCrumbleDeath(effect, progress);
  } else {
    drawFallDeath(effect, progress);
  }
  ctx.restore();
}

function drawFallDeath(effect, progress) {
  const tip = smoothStep((progress - 0.12) / 0.55);
  const settle = smoothStep((progress - 0.56) / 0.28);
  const fade = 1 - smoothStep((progress - 0.82) / 0.18);
  const landingBounce = Math.sin(Math.min(1, settle) * Math.PI) * 4;
  const squash = settle * 0.34;

  drawGroundShadow(4, effect.radius + 15, effect.radius + 15 + settle * 12, 8 - settle * 2);

  ctx.save();
  ctx.globalAlpha = Math.max(0, fade);
  drawSprite(effect.sprite, -tip * 10, effect.radius + 18 + tip * 18 - landingBounce, effect.spriteWidth, effect.spriteHeight, {
    flip: effect.flip,
    rotation: -tip * 1.48 + Math.sin(progress * 22 + effect.seed) * 0.02 * (1 - settle),
    scaleX: 1 + squash * 0.65,
    scaleY: 1 - squash,
    tint: progress < 0.22 ? "#fff8e8" : null,
    tintAlpha: 0.28,
  });
  ctx.restore();

  if (progress > 0.48) {
    drawLandingPuffs(effect, progress, fade);
  }
}

function drawCrumbleDeath(effect, progress) {
  const sink = smoothStep((progress - 0.05) / 0.56);
  const vanish = smoothStep((progress - 0.28) / 0.4);
  const fade = 1 - smoothStep((progress - 0.6) / 0.24);

  drawGroundShadow(0, effect.radius + 15, effect.radius + 12 + sink * 14, 8 + sink * 3);
  drawCrumblePile(effect, progress, sink);

  if (fade > 0.02) {
    ctx.save();
    ctx.globalAlpha = fade;
    drawSprite(effect.sprite, 0, effect.radius + 18 + sink * 24, effect.spriteWidth, effect.spriteHeight, {
      flip: effect.flip,
      rotation: Math.sin(progress * 18 + effect.seed) * 0.08,
      scaleX: 1 + vanish * 0.2,
      scaleY: Math.max(0.24, 1 - vanish * 0.78),
      tint: "#bdf4ff",
      tintAlpha: 0.16 + vanish * 0.24,
    });
    ctx.restore();
  }

  drawCrumblePieces(effect, progress);
}

function drawLandingPuffs(effect, progress, fade) {
  const puffProgress = smoothStep((progress - 0.48) / 0.28);
  ctx.save();
  ctx.globalAlpha = Math.max(0, fade) * (1 - puffProgress) * 0.68;
  ctx.fillStyle = "rgba(244, 216, 148, 0.82)";
  for (let i = 0; i < 4; i += 1) {
    const x = -22 + i * 14 + Math.sin(effect.seed + i) * 5;
    const y = effect.radius + 12 + Math.cos(effect.seed + i) * 2;
    ctx.beginPath();
    ctx.ellipse(x, y, 7 + puffProgress * 7, 3 + puffProgress * 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawCrumblePile(effect, progress, sink) {
  ctx.save();
  ctx.globalAlpha = 0.18 + smoothStep(progress / 0.44) * 0.55;
  ctx.fillStyle = effect.color;
  ctx.beginPath();
  ctx.ellipse(0, effect.radius + 15, effect.radius * (0.54 + sink * 0.35), 7 + sink * 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 248, 232, 0.72)";
  for (let i = 0; i < 5; i += 1) {
    const x = -18 + i * 9 + Math.sin(effect.seed + i) * 3;
    const y = effect.radius + 10 - sink * 4 + Math.cos(effect.seed * 2 + i) * 2;
    ctx.beginPath();
    ctx.arc(x, y, 2.2 + (i % 2), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawCrumblePieces(effect, progress) {
  effect.pieces.forEach((piece) => {
    const local = smoothStep((progress - piece.delay) / Math.max(0.08, 1 - piece.delay));
    if (local <= 0 || local >= 1) return;
    const x = Math.cos(piece.angle) * piece.speed * local;
    const y =
      effect.radius +
      6 -
      piece.lift * Math.sin(local * Math.PI) +
      piece.gravity * local * local;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(piece.angle + local * piece.spin);
    ctx.globalAlpha = (1 - local) * 0.85;
    ctx.fillStyle = piece.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, piece.size, piece.size * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawBlockedChew(enemy, data, power) {
  const chew = Math.abs(Math.sin(enemy.age * 18 + enemy.seed));
  const mouthX = -data.radius - 8;
  const mouthY = -7 + chew * 6;

  ctx.save();
  ctx.globalAlpha = 0.36 + power * 0.42;
  ctx.strokeStyle = "#fff8e8";
  ctx.fillStyle = colors.ricotta;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";

  for (let i = 0; i < 2; i += 1) {
    ctx.beginPath();
    ctx.arc(mouthX + i * 7, mouthY + i * 4, 7 + chew * 3, -0.55, 0.85);
    ctx.stroke();
  }

  for (let i = 0; i < 4; i += 1) {
    const x = mouthX - 6 - i * 5 + Math.sin(enemy.age * 12 + i) * 2;
    const y = mouthY + 12 + Math.cos(enemy.age * 14 + i) * 3;
    ctx.beginPath();
    ctx.arc(x, y, 1.8 + (i % 2), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFloatingTells(enemy, data, lift) {
  const airborne = isBalloonAirborne(enemy);

  ctx.save();
  ctx.globalAlpha = airborne ? 0.42 : 0.22;
  ctx.strokeStyle = airborne ? "#e45a78" : "rgba(228, 90, 120, 0.6)";
  ctx.fillStyle = airborne ? colors.gold : "#e45a78";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";

  for (let i = 0; i < 2; i += 1) {
    const x = -10 + i * 20 + Math.sin(enemy.age * 4 + i) * 3;
    ctx.beginPath();
    ctx.moveTo(x, data.radius + 7);
    ctx.quadraticCurveTo(x + 5, data.radius - lift * 0.42, x - 2, data.radius - lift + 7);
    ctx.stroke();
  }

  if (airborne) {
    for (let i = 0; i < 3; i += 1) {
      const y = data.radius + 10 - i * 7;
      ctx.beginPath();
      ctx.arc(-20 + i * 18, y, 5 + Math.sin(enemy.age * 5 + i) * 1.2, 0.15, Math.PI * 0.9);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(0, data.radius - lift - 4, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawFestaDancerOverlay(enemy, data, power) {
  const beat = Math.sin(enemy.age * 12 + enemy.seed);
  const hatBob = Math.abs(beat) * power * 3;

  ctx.save();
  ctx.translate(-4, -50 - hatBob);
  ctx.rotate(-0.2 + beat * 0.08 * (0.35 + power));
  ctx.fillStyle = colors.festa;
  ctx.strokeStyle = "#fff8e8";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-10, 10);
  ctx.lineTo(4, -18);
  ctx.lineTo(16, 9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = colors.gold;
  ctx.beginPath();
  ctx.arc(4, -20, 4.5 + power * 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.48 + power * 0.35;
  ctx.strokeStyle = power > 0 ? colors.gold : "rgba(255, 248, 232, 0.72)";
  ctx.fillStyle = power > 0 ? colors.gold : "rgba(255, 248, 232, 0.72)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";

  for (let i = 0; i < 2; i += 1) {
    const x = -32 + i * 58 + Math.sin(enemy.age * 4 + i) * 4;
    const y = -36 - i * 7 + Math.cos(enemy.age * 5 + i) * 3;
    drawMusicNote(x, y, 0.74 + power * 0.18);
  }
  ctx.restore();

  if (enemy.silencedTimer > 0) {
    drawSilencedMarker(data);
  }
}

function drawDanceBoostEffect(enemy, data, boost) {
  const pulse = Math.sin(enemy.age * 13 + enemy.seed) * 0.5 + 0.5;
  ctx.save();
  ctx.globalAlpha = 0.22 + Math.min(0.26, boost);
  ctx.strokeStyle = colors.gold;
  ctx.fillStyle = colors.festa;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";

  for (let i = 0; i < 3; i += 1) {
    const y = -data.radius - 4 + i * 16 + Math.sin(enemy.age * 10 + i) * 2;
    ctx.beginPath();
    ctx.moveTo(18 + i * 4, y);
    ctx.lineTo(38 + boost * 34 + i * 3, y - 2);
    ctx.stroke();
  }

  for (let i = 0; i < 4; i += 1) {
    const angle = enemy.seed + enemy.age * 2.8 + i * 1.57;
    const r = data.radius + 13 + pulse * 5;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * r, -7 + Math.sin(angle) * r, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawShadowStateOverlay(enemy, data, stateInfo) {
  const { veiled, revealPower, crackPower } = stateInfo;

  if (veiled) {
    ctx.save();
    ctx.globalAlpha = 0.18 + Math.sin(enemy.age * 5.5 + enemy.seed) * 0.04;
    ctx.strokeStyle = data.roleColor;
    ctx.fillStyle = data.roleColor;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";

    for (let i = 0; i < 3; i += 1) {
      const phase = enemy.age * 2.2 + enemy.seed + i * 1.7;
      const x = -24 + i * 24 + Math.sin(phase) * 6;
      const y = -18 + Math.cos(phase * 1.2) * 12;
      ctx.beginPath();
      ctx.moveTo(x - 11, y + 12);
      ctx.quadraticCurveTo(x + 2, y - 5, x + 13, y + 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 5, y - 2, 2.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (revealPower > 0) {
    ctx.save();
    ctx.globalAlpha = revealPower * 0.78;
    ctx.strokeStyle = "#fff8e8";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, -8, data.radius + 18 + (1 - revealPower) * 20, 0.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.strokeStyle = data.roleColor;
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i += 1) {
      const angle = enemy.seed + i * 1.26;
      const inner = data.radius + 11;
      const outer = inner + 10 + revealPower * 8;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, -8 + Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * outer, -8 + Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (crackPower <= 0) return;

  ctx.save();
  ctx.globalAlpha = 0.42 + crackPower * 0.5;
  ctx.translate(Math.sin(enemy.age * 31 + enemy.seed) * crackPower * 1.4, 0);
  ctx.strokeStyle = "rgba(38, 50, 56, 0.8)";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  drawShadowHelmetCracks(crackPower);
  ctx.strokeStyle = "rgba(255, 248, 232, 0.88)";
  ctx.lineWidth = 2;
  drawShadowHelmetCracks(crackPower);
  ctx.restore();
}

function drawShadowHelmetCracks(power) {
  ctx.beginPath();
  ctx.moveTo(-19, -50);
  ctx.lineTo(-11, -42);
  ctx.lineTo(-16, -33);
  if (power > 0.42) {
    ctx.moveTo(8, -49);
    ctx.lineTo(2, -40);
    ctx.lineTo(10, -32);
  }
  if (power > 0.72) {
    ctx.moveTo(-2, -54);
    ctx.lineTo(3, -45);
    ctx.lineTo(-3, -38);
    ctx.moveTo(18, -40);
    ctx.lineTo(24, -34);
  }
  ctx.stroke();
}

function drawSilencedMarker(data) {
  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.strokeStyle = colors.bronze;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, -6, data.radius + 13, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-data.radius - 8, data.radius + 4);
  ctx.lineTo(data.radius + 8, -data.radius - 18);
  ctx.stroke();
  ctx.restore();
}

function drawMusicNote(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.lineTo(0, 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.quadraticCurveTo(9, -10, 12, -5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-4, 8, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFrozenOverlay(enemy, data, freezePower) {
  ctx.save();
  ctx.globalAlpha = 0.28 + freezePower * 0.42;
  ctx.strokeStyle = "#bdf4ff";
  ctx.fillStyle = "rgba(189, 244, 255, 0.26)";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.ellipse(0, -4, data.radius + 17, data.radius + 24, 0, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 5; i += 1) {
    const angle = enemy.seed + state.time * 0.9 + i * 1.26;
    const x = Math.cos(angle) * (data.radius + 12);
    const y = -8 + Math.sin(angle) * (data.radius + 16);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(5, 0);
    ctx.moveTo(0, -5);
    ctx.lineTo(0, 5);
    ctx.stroke();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(-data.radius * 0.25, -data.radius * 0.5, 4, 0, Math.PI * 2);
  ctx.arc(data.radius * 0.4, -data.radius * 0.05, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBurnOverlay(enemy, data, burnPower) {
  const flicker = Math.sin(enemy.age * 18 + enemy.seed) * 0.5 + 0.5;

  ctx.save();
  ctx.globalAlpha = 0.24 + burnPower * 0.34;
  ctx.strokeStyle = "#f07f4f";
  ctx.fillStyle = "rgba(240, 127, 79, 0.2)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.ellipse(0, -4, data.radius + 15 + flicker * 4, data.radius + 20 + flicker * 5, 0, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 5; i += 1) {
    const angle = enemy.seed + enemy.age * 2.7 + i * 1.26;
    const x = Math.cos(angle) * (data.radius + 8 + flicker * 4);
    const y = -4 + Math.sin(angle) * (data.radius + 12);
    const height = 10 + burnPower * 8 + Math.sin(enemy.age * 11 + i) * 3;
    ctx.beginPath();
    ctx.moveTo(x, y + 5);
    ctx.quadraticCurveTo(x - 5, y - height * 0.35, x, y - height);
    ctx.quadraticCurveTo(x + 6, y - height * 0.35, x, y + 5);
    ctx.fill();
  }

  ctx.fillStyle = colors.gold;
  for (let i = 0; i < 3; i += 1) {
    const angle = enemy.seed + enemy.age * 4.2 + i * 2.1;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * (data.radius + 10), -8 + Math.sin(angle) * (data.radius + 13), 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawEnemyTraitEffects(enemy, data) {
  if (enemy.eliteLabel) {
    const pulse = 0.5 + Math.sin(enemy.age * 6.2 + enemy.seed) * 0.5;
    const auraColor = enemy.eliteColor || data.roleColor || data.color;
    ctx.save();
    ctx.globalAlpha = 0.12 + pulse * 0.1;
    ctx.strokeStyle = auraColor;
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    ctx.ellipse(0, data.radius + 8, data.radius + 17 + pulse * 5, 8 + pulse * 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.34 + pulse * 0.18;
    ctx.fillStyle = auraColor;
    for (let i = 0; i < 3; i += 1) {
      const angle = enemy.seed + enemy.age * 2.1 + i * 2.2;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * (data.radius + 14), -10 + Math.sin(angle) * (data.radius + 14), 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (enemy.danceBoost > 0) {
    ctx.save();
    ctx.globalAlpha = 0.12 + Math.min(0.16, enemy.danceBoost);
    ctx.fillStyle = colors.gold;
    ctx.beginPath();
    ctx.ellipse(0, 2, data.radius + 24, data.radius + 28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (data.trait === "fast") {
    ctx.save();
    ctx.globalAlpha = 0.3 + Math.abs(Math.sin(enemy.age * 10)) * 0.18;
    ctx.strokeStyle = data.roleColor;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i += 1) {
      const y = -22 + i * 15 + Math.sin(enemy.age * 14 + i) * 2;
      ctx.beginPath();
      ctx.moveTo(20 + i * 4, y);
      ctx.lineTo(50 + i * 7, y - 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (data.trait === "sneak") {
    const veiled = isShadowVeiled(enemy);
    const revealPower = Math.max(0, Math.min(1, enemy.revealFlash / 0.68));
    ctx.save();
    ctx.globalAlpha = veiled
      ? 0.2 + Math.sin(enemy.age * 5.2 + enemy.seed) * 0.06
      : 0.06 + revealPower * 0.12;
    ctx.fillStyle = data.roleColor;
    ctx.beginPath();
    ctx.ellipse(0, -6, data.radius + (veiled ? 22 : 14), data.radius + (veiled ? 31 : 22), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (veiled) {
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = "rgba(255, 248, 232, 0.7)";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.ellipse(0, -7, data.radius + 26, data.radius + 34, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  if (data.trait === "wander") {
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = data.roleColor;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-20, -data.radius - 19);
    ctx.lineTo(-10, -data.radius - 27);
    ctx.lineTo(2, -data.radius - 19);
    ctx.lineTo(14, -data.radius - 27);
    ctx.lineTo(25, -data.radius - 20);
    ctx.stroke();
    ctx.restore();
  }

  if (data.trait === "tide") {
    ctx.save();
    ctx.globalAlpha = 0.28 + Math.sin(enemy.age * 3.8) * 0.08;
    ctx.strokeStyle = "#69c7bf";
    ctx.lineWidth = 3;
    for (let i = 0; i < 2; i += 1) {
      ctx.beginPath();
      ctx.ellipse(0, data.radius + 12, data.radius + 12 + i * 10, 8 + i * 4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (data.trait === "boss") {
    const pulse = 0.5 + Math.sin(enemy.age * 4.2 + enemy.seed) * 0.5;
    const entrancePower = Math.max(0, Math.min(1, (enemy.bossEntrance || 0) / 1.4));
    ctx.save();
    ctx.globalAlpha = 0.18 + pulse * 0.08 + entrancePower * 0.2;
    ctx.strokeStyle = "#7c6a3d";
    ctx.lineWidth = 4 + entrancePower * 2;
    ctx.setLineDash([9, 7]);
    ctx.beginPath();
    ctx.ellipse(
      0,
      data.radius + 8,
      data.radius + 20 + pulse * 6 + entrancePower * 18,
      10 + pulse * 3 + entrancePower * 7,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.restore();

    if (entrancePower > 0) {
      ctx.save();
      ctx.globalAlpha = entrancePower * 0.26;
      ctx.strokeStyle = colors.gold;
      ctx.lineWidth = 5;
      for (let i = 0; i < 2; i += 1) {
        ctx.beginPath();
        ctx.ellipse(0, data.radius + 8, data.radius + 35 + i * 18, 15 + i * 6, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.fillStyle = "rgba(217, 192, 123, 0.82)";
    for (let i = 0; i < 5; i += 1) {
      const angle = enemy.seed + i * 1.4;
      const x = Math.cos(angle) * (data.radius + 10 + (i % 2) * 7);
      const y = data.radius + 9 + Math.sin(enemy.age * 2.2 + i) * 2;
      ctx.beginPath();
      ctx.ellipse(x, y, 3.8, 2.1, angle, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (data.trait === "dance") {
    const power = enemy.dancePower || 0;
    const pulse = 0.5 + Math.sin(enemy.age * 8 + enemy.seed) * 0.5;
    if (power > 0) {
      ctx.save();
      ctx.globalAlpha = 0.14 + power * 0.16;
      ctx.fillStyle = colors.gold;
      ctx.beginPath();
      ctx.ellipse(0, 4, data.radius + 34 + pulse * 8, data.radius + 28 + pulse * 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = enemy.silencedTimer > 0 ? 0.16 : 0.18 + power * 0.26;
    ctx.strokeStyle = enemy.silencedTimer > 0 ? colors.bronze : colors.gold;
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(0, -5, data.radius + 18 + i * 12 + pulse * 5, 0.15, Math.PI * 1.85);
      ctx.stroke();
    }
    ctx.restore();

    if (power > 0) {
      ctx.save();
      ctx.globalAlpha = 0.36;
      const confettiColors = [colors.festa, colors.gold, colors.sea, "#fff8e8"];
      for (let i = 0; i < 7; i += 1) {
        const angle = enemy.seed + enemy.age * 2.4 + i * 0.9;
        const r = data.radius + 24 + Math.sin(enemy.age * 3 + i) * 7;
        ctx.fillStyle = confettiColors[i % confettiColors.length];
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * r, -10 + Math.sin(angle) * r, 2.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

function drawArmorChips(enemy) {
  ctx.save();
  ctx.fillStyle = "#d9c07b";
  ctx.strokeStyle = "rgba(105, 89, 52, 0.42)";
  ctx.lineWidth = 2;
  [
    [-26, -30, 13, 10, -0.25],
    [23, -17, 16, 11, 0.18],
    [-18, 10, 15, 9, 0.1],
  ].forEach(([x, y, w, h, rotation]) => {
    ctx.save();
    ctx.translate(x, y + Math.sin(enemy.age * 3 + x) * 1.2);
    ctx.rotate(rotation);
    roundRect(-w / 2, -h / 2, w, h, 4);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  });
  ctx.restore();
}

function drawEnemyTraitBadge(x, y, data) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = data.roleColor || data.color;
  roundRect(-10, -10, 20, 20, 6);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 248, 232, 0.84)";
  ctx.lineWidth = 2;
  roundRect(-10, -10, 20, 20, 6);
  ctx.stroke();

  ctx.strokeStyle = "#fff8e8";
  ctx.fillStyle = "#fff8e8";
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (data.trait === "fast") {
    ctx.beginPath();
    ctx.moveTo(-5, -5);
    ctx.lineTo(1, 0);
    ctx.lineTo(-5, 5);
    ctx.moveTo(1, -5);
    ctx.lineTo(7, 0);
    ctx.lineTo(1, 5);
    ctx.stroke();
  } else if (data.trait === "sneak") {
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 4.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (data.trait === "tank") {
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(7, -3);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 8);
    ctx.lineTo(-5, 6);
    ctx.lineTo(-7, -3);
    ctx.closePath();
    ctx.stroke();
  } else if (data.trait === "wander") {
    ctx.beginPath();
    ctx.moveTo(-7, -4);
    ctx.lineTo(-2, 3);
    ctx.lineTo(3, -4);
    ctx.lineTo(7, 3);
    ctx.stroke();
  } else if (data.trait === "tide") {
    ctx.beginPath();
    ctx.arc(-4, 0, 5, Math.PI * 0.1, Math.PI * 1.15);
    ctx.arc(5, 0, 5, Math.PI * 1.1, Math.PI * 0.05, true);
    ctx.stroke();
  } else if (data.trait === "boss") {
    ctx.beginPath();
    ctx.moveTo(-7, 5);
    ctx.lineTo(-4, -6);
    ctx.lineTo(0, -2);
    ctx.lineTo(4, -6);
    ctx.lineTo(7, 5);
    ctx.closePath();
    ctx.stroke();
  } else if (data.trait === "dance") {
    ctx.beginPath();
    ctx.moveTo(-2, -7);
    ctx.lineTo(-2, 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-2, -7);
    ctx.quadraticCurveTo(5, -5, 6, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-5, 6, 3.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(-3, -1, 2, 0, Math.PI * 2);
    ctx.arc(4, -1, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawTourist() {
  ctx.fillStyle = "#efc46d";
  roundRect(-18, -12, 36, 42, 13);
  ctx.fill();
  ctx.fillStyle = "#f4b48c";
  ctx.beginPath();
  ctx.arc(0, -28, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#263238";
  ctx.fillRect(-12, -31, 24, 5);
  ctx.fillStyle = "#2d3e45";
  roundRect(-19, -7, 18, 14, 3);
  ctx.fill();
  ctx.fillStyle = "#66c3d6";
  ctx.beginPath();
  ctx.arc(-10, 0, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawRunner(enemy) {
  const flame = 5 + Math.sin(enemy.age * 18) * 4;
  ctx.fillStyle = "#d4433a";
  roundRect(-13, -14, 30, 42, 10);
  ctx.fill();
  ctx.fillStyle = "#f4b48c";
  ctx.beginPath();
  ctx.arc(1, -29, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#7a2d2c";
  roundRect(-28, -4, 17, 28, 5);
  ctx.fill();
  ctx.fillStyle = colors.gold;
  ctx.beginPath();
  ctx.moveTo(-29, 24);
  ctx.lineTo(-42 - flame, 15);
  ctx.lineTo(-30, 6);
  ctx.closePath();
  ctx.fill();
}

function drawShadow(enemy) {
  ctx.save();
  ctx.globalAlpha = 0.72 + Math.sin(enemy.age * 5) * 0.12;
  ctx.fillStyle = colors.violet;
  ctx.beginPath();
  ctx.moveTo(-24, 24);
  ctx.quadraticCurveTo(-22, -32, 1, -38);
  ctx.quadraticCurveTo(27, -28, 22, 24);
  ctx.quadraticCurveTo(11, 16, 0, 26);
  ctx.quadraticCurveTo(-10, 16, -24, 24);
  ctx.fill();
  ctx.fillStyle = "#fff8e8";
  ctx.beginPath();
  ctx.arc(-8, -13, 4, 0, Math.PI * 2);
  ctx.arc(8, -13, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBrute() {
  ctx.fillStyle = "#b9a372";
  roundRect(-27, -31, 54, 63, 8);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 248, 232, 0.25)";
  ctx.fillRect(-20, -22, 22, 10);
  ctx.fillRect(4, -4, 18, 11);
  ctx.fillStyle = "#263238";
  ctx.fillRect(-13, -12, 8, 6);
  ctx.fillRect(7, -12, 8, 6);
  ctx.fillStyle = "#8d7b56";
  roundRect(-39, -7, 15, 36, 6);
  roundRect(24, -7, 15, 36, 6);
  ctx.fill();
}

function drawCruise(enemy) {
  ctx.fillStyle = "#4a8bb4";
  roundRect(-15, -13, 32, 43, 9);
  ctx.fill();
  ctx.fillStyle = "#f4b48c";
  ctx.beginPath();
  ctx.arc(1, -30, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff8e8";
  ctx.fillRect(-14, -15, 30, 8);
  ctx.strokeStyle = "#263238";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-17, -32);
  ctx.lineTo(17, -32);
  ctx.stroke();
  ctx.fillStyle = "#334a54";
  roundRect(17, 7, 16, 21, 4);
  ctx.fill();
}

function drawGhoul(enemy) {
  const sway = Math.sin(enemy.age * 4) * 4;
  ctx.fillStyle = "#1f736f";
  ctx.beginPath();
  ctx.ellipse(0, -4, 25, 36, sway * 0.01, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#69c7bf";
  for (let i = -18; i <= 18; i += 12) {
    ctx.beginPath();
    ctx.ellipse(i + sway * 0.3, -35, 5, 17, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#fff8e8";
  ctx.beginPath();
  ctx.arc(-8, -12, 4, 0, Math.PI * 2);
  ctx.arc(8, -12, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawGroundShadow(x, y, w, h) {
  ctx.save();
  ctx.globalAlpha = 0.24;
  ctx.fillStyle = "#263238";
  ctx.beginPath();
  ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBar(x, y, w, h, ratio, fill, empty) {
  const safeRatio = Math.max(0, Math.min(1, ratio));
  ctx.fillStyle = empty;
  roundRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = fill;
  roundRect(x, y, w * safeRatio, h, h / 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(38, 50, 56, 0.25)";
  ctx.lineWidth = 1;
  roundRect(x, y, w, h, h / 2);
  ctx.stroke();
}

function roundRect(x, y, w, h, r) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function tick(now) {
  const dt = Math.min(0.033, (now - lastFrame) / 1000);
  lastFrame = now;

  if (state.status === "playing") {
    update(dt);
  } else {
    updateDeathEffects(dt);
    updateParticles(dt);
    cleanup();
  }

  draw();
  updateHud();
  updateCards();
  requestAnimationFrame(tick);
}

canvas.addEventListener("pointermove", (event) => {
  state.pointer = getPointer(event);
  state.hoverTile = tileFromPoint(state.pointer);
});

canvas.addEventListener("pointerleave", () => {
  state.pointer = null;
  state.hoverTile = null;
});

canvas.addEventListener("click", (event) => {
  state.pointer = getPointer(event);
  state.hoverTile = tileFromPoint(state.pointer);
  if (!shovelHoveredDefender() && !placeSelected()) {
    upgradeHoveredDefender();
  }
});

startButton.addEventListener("click", () => {
  if (state.status === "paused") {
    pauseGame();
  } else {
    startGame();
  }
});

pauseButton.addEventListener("click", pauseGame);
shovelButton.addEventListener("click", toggleShovel);
soundButton.addEventListener("click", () => {
  setSoundMuted(!sound.muted);
  if (!sound.muted) {
    playSound("select", { force: true });
  }
});
difficultyButtons.forEach((button) => {
  button.addEventListener("click", () => selectDifficulty(button.dataset.difficulty));
});
restartButton.addEventListener("click", () => {
  playSound("select", { force: true });
  resetGame();
});

buildCards();
resetGame();
requestAnimationFrame(tick);
