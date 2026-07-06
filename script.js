document.documentElement.classList.add("js-enabled");

/* ================================
DOM SELECTIONS
================================ */
const observedSections = [...document.querySelectorAll(".section-observe, .about-text-observe")];
const observedStaggerCards = [...document.querySelectorAll(".design-card-observe, .sound-card-observe")];
const modelStage = document.querySelector("#model-stage");
const fallbackImage = document.querySelector(".model-fallback-image");
const fallbackImages = [...document.querySelectorAll(".model-fallback-image")];
const aboutProductTarget = document.querySelector("#about-product-target");
const heroSection = document.querySelector(".hero");
const loadingScreen = document.querySelector("#loading-screen");
const soundCanvas = document.querySelector("#sound-wave");
const waitlistForm = document.querySelector("#waitlist-form");
const formMessage = document.querySelector("#form-message");
const siteNav = document.querySelector(".site-nav");

/* ================================
CONSTANTS / CONFIG
================================ */
const loadingStartedAt = performance.now();
const MIN_LOADING_SCREEN_TIME = 450;
const SOUND_WAVE_FPS = 24;
const SOUND_WAVE_FRAME_INTERVAL = 1000 / SOUND_WAVE_FPS;
const IDLE_FRAME_DELAY = 300;
const WAITLIST_STORAGE_KEY = "auroraWaitlistEmails";

// Hero 3D performance controls. The float is delayed until after the loader so refreshes stay smooth.
const HERO_RENDER_PIXEL_RATIO_MAX = 1;
const HERO_CANVAS_OVERSCAN_MIN = 36;
const HERO_CANVAS_OVERSCAN_RATIO = 0.08;
const HERO_CANVAS_OVERSCAN_MAX = 96;
const ENABLE_HERO_INTRO = false;
const HERO_FLOAT_START_DELAY = 1200;
const HERO_FLOAT_VISIBLE_DELAY = 900;
const HERO_INTRO_DURATION = 1.55;
const HERO_INTRO_SCROLL_CANCEL_PROGRESS = 0.015;
const HERO_INTRO_START = {
  position: { x: 0, y: -0.72, z: -0.48 },
  rotation: { x: 0.34, y: -1.22, z: -0.16 },
  scale: 0.78
};

let audioTick = 0;
let lastSoundWaveFrame = 0;
let soundBoomEnergy = 0;
let waitlistSuccessTimeout = null;
let hasDismissedScrollCue = false;
let fallbackScrollHandler = null;
let reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let mobileFallback = window.matchMedia("(max-width: 760px)").matches;
let hasHiddenLoadingScreen = false;
let pageIsVisible = !document.hidden;

const MODEL_URL = "/public/models/headphones.glb?v=7";
const THREE_MODULE_URL = "./vendor/three.module.js";
const GLTF_LOADER_MODULE_URL = "./vendor/GLTFLoader.js";
const GSAP_MODULE_URL = "./vendor/gsap.js";
const SCROLL_TRIGGER_MODULE_URL = "./vendor/ScrollTrigger.js";

// Scroll-driven positions for moving the hero headphones into the About circle.
const MODEL_SCROLL = {
  // Adjust scroll distance. Larger numbers make the hero-to-About movement take longer.
  distance: 980,

  start: {
    // Starting position. x/y are viewport percentages; z offsets depth in the Three.js scene.
    viewport: { x: 0.475, y: 0.485 },
    positionOffset: { x: 0, y: -0.02, z: 0 },

    // Headphone scale - slightly smaller so AURORA can overlap the model cleanly.
    scale: 1.46,

    // Starting rotation. Values are radians, not degrees.
    // More front-facing so the headband creates a centered arc around the text.
    rotation: { x: -0.1, y: 0, z: 0 }
  },

  end: {
    // Adjust ending position here. The model targets the About circle, then this offset nudges x/y/z.
    positionOffset: { x: -0.1, y: 0.07, z: 0 },
    fallbackViewport: { x: 0.72, y: 0.48 },

    // Adjust ending scale here.
    scale: 0.9,

    // Adjust ending rotation here. Values are radians, not degrees.
    rotation: { x: 0.02, y: 0.3, z: -0.04 }
  },

  reentry: {
    // Adjust the left-side re-entry here. This is where the headphones come from before landing in the About circle.
    positionOffset: { x: -1.55, y: 0.04, z: 0 },

    // Adjust the re-entry scale here. It eases from this size into the ending scale above.
    scale: 0.78,

    // Adjust the re-entry rotation here. Values are radians, not degrees.
    rotation: { x: 0.02, y: 0.12, z: -0.05 }
  }
};

const MODEL_PHASES = {
  // Adjust when the hero headphones start moving down toward the About grid.
  heroExitStart: 0.18,

  // Adjust when that downward move finishes. The About section covers the model from here; opacity does not change.
  heroExitEnd: 0.55,

  // Adjust when the headphones begin reappearing from the left inside the About circle. This is clipped, not faded.
  reentryStart: 0.6,

  // Adjust when the headphones begin their constant circle rotation.
  circleRotationStart: 0.72
};

/* ================================
UTILITY / HELPER FUNCTIONS
================================ */
function clamp(value, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

function lerp(start, end, progress) {
  return start + (end - start) * progress;
}

function smoothstep(progress) {
  const value = clamp(progress);
  return value * value * (3 - 2 * value);
}

function queueNextFrame(callback, active = true) {
  if (active && pageIsVisible) {
    requestAnimationFrame(callback);
    return;
  }

  window.setTimeout(() => callback(performance.now()), IDLE_FRAME_DELAY);
}

/* ================================
LOADING BEHAVIOR
================================ */
function hideLoadingScreen() {
  if (!loadingScreen || hasHiddenLoadingScreen) return;

  hasHiddenLoadingScreen = true;
  const elapsedLoadingTime = performance.now() - loadingStartedAt;
  const remainingLoadingTime = Math.max(0, MIN_LOADING_SCREEN_TIME - elapsedLoadingTime);

  window.setTimeout(() => {
    loadingScreen.classList.add("is-hidden");

    // The hero canvas float is compositor-only, but delaying it avoids competing with first paint.
    window.setTimeout(() => {
      document.documentElement.classList.add("hero-motion-ready");
    }, HERO_FLOAT_VISIBLE_DELAY);

    window.setTimeout(() => loadingScreen.remove(), 700);
  }, remainingLoadingTime);
}

function progressBetween(value, start, end) {
  return clamp((value - start) / (end - start));
}

function getTargetViewportPoint() {
  if (!aboutProductTarget) {
    return {
      x: window.innerWidth * MODEL_SCROLL.end.fallbackViewport.x,
      y: window.innerHeight * MODEL_SCROLL.end.fallbackViewport.y
    };
  }

  const rect = aboutProductTarget.getBoundingClientRect();

  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
}

function getTargetCircleClip() {
  if (!aboutProductTarget) {
    return {
      ...getTargetViewportPoint(),
      radius: Math.min(window.innerWidth, window.innerHeight) * 0.32
    };
  }

  const rect = aboutProductTarget.getBoundingClientRect();

  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    radius: Math.max(rect.width, rect.height) * 0.4
  };
}

function createVisibilityTracker(target, rootMargin = "220px 0px") {
  if (!target || !("IntersectionObserver" in window)) {
    // If observers are unavailable, keep decorative canvases working instead of hiding them forever.
    return { isVisible: () => true };
  }

  let visible = false;

  const visibilityObserver = new IntersectionObserver(
    (entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
    },
    { rootMargin, threshold: 0 }
  );

  visibilityObserver.observe(target);

  return { isVisible: () => visible };
}

// Lazily initializes expensive below-the-fold canvases only when their section is near view.
function runWhenVisible(target, callback, rootMargin = "160px 0px") {
  if (!target || !("IntersectionObserver" in window)) {
    // Fallback path: delay the setup slightly so initial paint still gets a head start.
    window.setTimeout(callback, IDLE_FRAME_DELAY);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;

      observer.disconnect();
      callback();
    },
    { rootMargin, threshold: 0 }
  );

  observer.observe(target);
}

const soundWaveVisibility = createVisibilityTracker(soundCanvas);

/* ================================
SOUND WAVE CANVAS
================================ */
function setCanvasSize(canvas) {
  if (!canvas) return null;

  const rect = canvas.getBoundingClientRect();
  // Cap DPR so animated canvases stay crisp without becoming too expensive on dense displays.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { context, width: rect.width, height: rect.height };
}

function drawSoundWave() {
  if (!soundWaveVisibility.isVisible()) return;

  const setup = setCanvasSize(soundCanvas);
  if (!setup) return;

  const { context, width, height } = setup;
  const center = height / 2;
  // Synthetic bass pulses drive the taller bars and glow intensity.
  const bassHit =
    Math.pow(Math.max(0, Math.sin(audioTick * 1.72)), 10) +
    Math.pow(Math.max(0, Math.sin(audioTick * 0.86 + 1.45)), 16) * 0.9;
  const surpriseHit = Math.pow(Math.max(0, Math.sin(audioTick * 2.95 + 0.4)), 22) * 0.55;
  const boomHit = clamp(bassHit + surpriseHit, 0, 1);
  const quietDip = Math.pow(1 - boomHit, 1.8);

  soundBoomEnergy = Math.max(soundBoomEnergy * 0.72, boomHit);

  context.clearRect(0, 0, width, height);
  context.globalCompositeOperation = "source-over";

  const backgroundGlow = context.createRadialGradient(
    width * 0.5,
    center,
    height * 0.08,
    width * 0.5,
    center,
    width * 0.56
  );

  backgroundGlow.addColorStop(0, "rgba(154,98,255,0.13)");
  backgroundGlow.addColorStop(0.38, "rgba(233,92,255,0.1)");
  backgroundGlow.addColorStop(0.7, "rgba(87,255,216,0.06)");
  backgroundGlow.addColorStop(1, "rgba(5,5,7,0)");
  context.fillStyle = backgroundGlow;
  context.fillRect(0, 0, width, height);

  const gradient = context.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, "rgba(154,98,255,0.34)");
  gradient.addColorStop(0.18, "rgba(87,255,216,0.9)");
  gradient.addColorStop(0.38, "rgba(154,98,255,0.98)");
  gradient.addColorStop(0.62, "rgba(233,92,255,0.98)");
  gradient.addColorStop(0.82, "rgba(154,98,255,0.94)");
  gradient.addColorStop(1, "rgba(87,255,216,0.3)");

  context.lineCap = "round";
  context.lineJoin = "round";
  context.globalCompositeOperation = "lighter";

  context.strokeStyle = "rgba(247,255,249,0.24)";
  context.lineWidth = 1;
  context.shadowColor = "rgba(154,98,255,0.2)";
  context.shadowBlur = 10;
  context.beginPath();
  context.moveTo(0, center);
  context.lineTo(width, center);
  context.stroke();

  function peakAt(position, target, widthFactor) {
    // Gaussian peak helper; creates moving hotspots across the sound bars.
    return Math.exp(-Math.pow((position - target) / widthFactor, 2));
  }

  const barCount = Math.max(80, Math.floor(width / 9));
  const step = width / barCount;
  const barWidth = clamp(step * 0.52, 2, 5);
  const barRadius = Math.min(barWidth * 0.8, 4);

  context.fillStyle = gradient;
  context.shadowColor = "rgba(154,98,255,0.28)";
  context.shadowBlur = 8 + soundBoomEnergy * 28;

  function drawRoundedBar(x, y, barHeight) {
    const adjustedHeight = Math.max(1, barHeight);

    context.beginPath();

    if (typeof context.roundRect === "function") {
      context.roundRect(x, y, barWidth, adjustedHeight, barRadius);
    } else {
      context.rect(x, y, barWidth, adjustedHeight);
    }

    context.fill();
  }

  for (let index = 0; index < barCount; index += 1) {
    const x = index * step + (step - barWidth) / 2;
    const normalized = index / (barCount - 1);
    const edgeFade = 0.22 + Math.sin(normalized * Math.PI) * 0.78;
    const peakOne = peakAt(normalized, 0.12 + Math.sin(audioTick * 0.17) * 0.025, 0.035);
    const peakTwo = peakAt(normalized, 0.28 + Math.cos(audioTick * 0.21) * 0.03, 0.044);
    const peakThree = peakAt(normalized, 0.51 + Math.sin(audioTick * 0.14 + 2.1) * 0.024, 0.04);
    const peakFour = peakAt(normalized, 0.73 + Math.cos(audioTick * 0.18 + 0.7) * 0.028, 0.047);
    const peakFive = peakAt(normalized, 0.9 + Math.sin(audioTick * 0.16 + 1.1) * 0.018, 0.034);
    const lowWave = 0.5 + 0.5 * Math.sin(normalized * Math.PI * 11.2 - audioTick * 1.08);
    const fastTexture = 0.5 + 0.5 * Math.sin(normalized * Math.PI * 72 + audioTick * 4.8);
    const stagger = 0.5 + 0.5 * Math.cos(index * 1.73 + audioTick * 3.4);
    const chatter = Math.pow(0.5 + 0.5 * Math.sin(index * 2.7 + audioTick * 11.5), 3);
    const boomSpread = peakAt(normalized, 0.22 + Math.sin(audioTick * 0.31) * 0.08, 0.18) +
      peakAt(normalized, 0.58 + Math.cos(audioTick * 0.27) * 0.12, 0.22) +
      peakAt(normalized, 0.82 + Math.sin(audioTick * 0.41) * 0.06, 0.14);
    const peakEnergy =
      peakOne * 0.86 +
      peakTwo * 1.12 +
      peakThree * 1.18 +
      peakFour * 0.96 +
      peakFive * 0.62;
    const heightRatio = clamp(
      (
        0.035 +
        peakEnergy * (0.22 + soundBoomEnergy * 0.82) +
        lowWave * (0.05 + quietDip * 0.08) +
        fastTexture * 0.08 +
        stagger * 0.05 +
        chatter * soundBoomEnergy * 0.42 +
        boomSpread * soundBoomEnergy * 0.4
      ) * edgeFade,
      0.025,
      0.96
    );
    const topHeight = height * 0.43 * heightRatio * (0.82 + soundBoomEnergy * 0.22 + Math.sin(index * 0.47 + audioTick * 1.7) * 0.14);
    const bottomHeight = height * 0.43 * heightRatio * (0.76 + soundBoomEnergy * 0.25 + Math.cos(index * 0.39 - audioTick * 1.6) * 0.2);
    const alpha = clamp(0.16 + heightRatio * 0.72 + soundBoomEnergy * 0.22, 0.18, 1);

    context.globalAlpha = alpha;
    drawRoundedBar(x, center - topHeight - 1, topHeight);
    drawRoundedBar(x, center + 1, bottomHeight);
  }

  context.globalAlpha = 1;
  context.shadowBlur = 0;
  context.globalCompositeOperation = "source-over";

  if (!reducedMotion) {
    audioTick += 0.078;
  }
}

/* ================================
FALLBACK / MOBILE / REDUCED MOTION
================================ */
function updateFallbackPosition() {
  if (!modelStage || !fallbackImage) return;

  // Mirrors the hero-to-About movement with a static PNG when WebGL is disabled or skipped.
  const progress = clamp(window.scrollY / MODEL_SCROLL.distance);
  const eased = progress * progress * (3 - 2 * progress);
  const target = getTargetViewportPoint();
  const startLeft = MODEL_SCROLL.start.viewport.x * 100;
  const startTop = MODEL_SCROLL.start.viewport.y * 100;
  const endLeft = (target.x / window.innerWidth) * 100;
  const endTop = (target.y / window.innerHeight) * 100;

  modelStage.style.setProperty("--fallback-left", `${lerp(startLeft, endLeft, eased)}vw`);
  modelStage.style.setProperty("--fallback-top", `${lerp(startTop, endTop, eased)}vh`);
  modelStage.style.setProperty("--fallback-scale", String(lerp(MODEL_SCROLL.start.scale, MODEL_SCROLL.end.scale, eased)));
  modelStage.style.setProperty("--fallback-rotate", `${lerp(-7, 5, eased)}deg`);
}

function loadFallbackImage() {
  fallbackImages.forEach((image) => {
    const fallbackSrc = image.dataset.src;
    if (!fallbackSrc || image.getAttribute("src")) return;
    image.src = fallbackSrc;
  });
}

function activateFallback() {
  if (!modelStage) return;

  loadFallbackImage();
  modelStage.classList.add("is-fallback");
  updateFallbackPosition();

  if (!fallbackScrollHandler && !reducedMotion) {
    // Keep fallback scroll listeners lightweight and only attach them once.
    fallbackScrollHandler = updateFallbackPosition;
    window.addEventListener("scroll", fallbackScrollHandler, { passive: true });
    window.addEventListener("resize", fallbackScrollHandler);
  }
}

/* ================================
NAVIGATION / SCROLL STATE
================================ */
function handlePageScroll() {
  if (!hasDismissedScrollCue && window.scrollY > 60) {
    hasDismissedScrollCue = true;
    document.body.classList.add("has-scrolled");
  }

  const heroHeight = heroSection ? heroSection.offsetHeight : window.innerHeight;
  const navScrolled = window.scrollY > heroHeight * 0.75;

  document.body.classList.toggle("nav-scrolled", navScrolled);
  document.body.classList.toggle("hero-passed", window.scrollY > window.innerHeight * 0.72);
}

function initNavPaint() {
  if (!siteNav) return;

  // Two frames gives the browser time to settle nav layout before hover transitions are enabled.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      siteNav.getBoundingClientRect();
      document.documentElement.classList.add("nav-ready");
    });
  });
}

function initFontReadyState() {
  if (!document.fonts?.ready) return;

  document.fonts.ready.then(() => {
    document.documentElement.classList.add("fonts-ready");
    initNavPaint();
  });
}

function shouldUseFallback() {
  return mobileFallback || reducedMotion;
}

function saveWaitlistEmail(email) {
  try {
    const storedEmails = JSON.parse(window.localStorage.getItem(WAITLIST_STORAGE_KEY) || "[]");
    const normalizedEmail = email.toLowerCase();
    const nextEmails = Array.isArray(storedEmails)
      ? [...new Set([...storedEmails, normalizedEmail])]
      : [normalizedEmail];

    window.localStorage.setItem(WAITLIST_STORAGE_KEY, JSON.stringify(nextEmails));
    return true;
  } catch (error) {
    return false;
  }
}

/* ================================
THREE.JS MODEL SETUP
================================ */
async function initializeHeadphoneModel() {
  if (!modelStage || shouldUseFallback()) {
    activateFallback();
    return;
  }

  try {
    const [gsapModule, scrollModule, threeModule, loaderModule] = await Promise.all([
      import(GSAP_MODULE_URL),
      import(SCROLL_TRIGGER_MODULE_URL),
      import(THREE_MODULE_URL),
      import(GLTF_LOADER_MODULE_URL)
    ]);

    const THREE = threeModule;
    const gsap = gsapModule.gsap || gsapModule.default || gsapModule;
    const ScrollTrigger = scrollModule.ScrollTrigger || scrollModule.default;
    const { GLTFLoader } = loaderModule;

    gsap.registerPlugin(ScrollTrigger);

    /* ================================
    HERO THREE.JS SCENE
    ================================ */
    const canvas = document.querySelector("#headphones-canvas");
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, HERO_RENDER_PIXEL_RATIO_MAX));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.8;
    camera.position.set(0, 0, 6);

    window.addEventListener(
      "pagehide",
      () => {
        // Release GPU resources when navigating away so browser refresh/back-forward cache stays healthier.
        renderer.dispose();
        renderer.forceContextLoss?.();
      },
      { once: true }
    );

    function getHeroCanvasOverscan() {
      // Extra canvas height prevents clipping while the hero float nudges the model vertically.
      return Math.round(clamp(
        window.innerHeight * HERO_CANVAS_OVERSCAN_RATIO,
        HERO_CANVAS_OVERSCAN_MIN,
        HERO_CANVAS_OVERSCAN_MAX
      ));
    }

    function resizeHeroRenderer() {
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      const overscan = getHeroCanvasOverscan();

      modelStage.style.setProperty("--hero-canvas-overscan", `${overscan}px`);
      // View offset keeps the visible model aligned while the actual render target is taller.
      camera.setViewOffset(width, height, 0, -overscan, width, height + overscan * 2);
      renderer.setSize(width, height + overscan * 2, false);
    }

    resizeHeroRenderer();

    scene.add(new THREE.AmbientLight(0xffffff, 0.62));

    const skyLight = new THREE.HemisphereLight(0xffffff, 0x050507, 0.58);
    scene.add(skyLight);

    const keyLight = new THREE.DirectionalLight(0xf8fbff, 1.72);
    keyLight.position.set(2.4, 4.2, 5.2);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xff6ab8, 0.18);
    rimLight.position.set(-4.4, 2.4, 3.4);
    scene.add(rimLight);

    const cyanAccentLight = new THREE.PointLight(0x68ffe6, 0.2, 8);
    cyanAccentLight.position.set(-1.8, -1.1, 3.6);
    scene.add(cyanAccentLight);

    const auroraGreenLight = new THREE.PointLight(0x8dff8a, 0.28, 9);
    auroraGreenLight.position.set(-3.2, 1.0, 3.8);
    scene.add(auroraGreenLight);

    const auroraVioletLight = new THREE.PointLight(0x8d68ff, 0.24, 9);
    auroraVioletLight.position.set(3.3, 1.35, 4.1);
    scene.add(auroraVioletLight);

    const auroraLowLight = new THREE.DirectionalLight(0xc7ff55, 0.12);
    auroraLowLight.position.set(0, -2.8, 3.2);
    scene.add(auroraLowLight);

    const softFillLight = new THREE.DirectionalLight(0xe8ecff, 0.92);
    softFillLight.position.set(-2.8, 1.6, 4.6);
    scene.add(softFillLight);

    const frontFillLight = new THREE.DirectionalLight(0xffffff, 0.36);
    frontFillLight.position.set(0, 0.5, 5.4);
    scene.add(frontFillLight);

    const heroVioletRim = new THREE.DirectionalLight(0x9a62ff, 0.42); // adds subtle purple rim light to hero headphones
    heroVioletRim.position.set(-4.2, 2.0, -3.0); // places purple light behind/left of the model
    scene.add(heroVioletRim); // adds purple rim light to hero scene

    const heroCyanRim = new THREE.DirectionalLight(0x57ffd8, 0.32); // adds subtle cyan rim light to hero headphones
    heroCyanRim.position.set(3.8, -0.8, -2.6); // places cyan light behind/right of the model
    scene.add(heroCyanRim); // adds cyan rim light to hero scene

    const heroPinkRim = new THREE.DirectionalLight(0xff4fb8, 0.38); // adds pink rim light to hero headphones
    heroPinkRim.position.set(2.4, 2.2, -3.8); // places pink light behind/upper-right of the model
    scene.add(heroPinkRim); // adds pink rim light to hero scene

    const introGroup = new THREE.Group();
    const modelGroup = new THREE.Group();
    scene.add(introGroup);
    introGroup.add(modelGroup);

    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(MODEL_URL);
    const model = gltf.scene;
    const studioNodes = [];

    // The exported GLB includes studio/backdrop meshes that should not appear on the live page.
    model.traverse((node) => {
      const nodeName = node.name.toLowerCase();
      const materialNames = Array.isArray(node.material)
        ? node.material.map((material) => material?.name || "")
        : [node.material?.name || ""];
      const materialLabel = materialNames.join(" ").toLowerCase();

      if (
        nodeName.includes("cyclorama") ||
        nodeName.startsWith("studio_") ||
        materialLabel.includes("backdrop")
      ) {
        studioNodes.push(node);
      }
    });

    studioNodes.forEach((node) => node.parent?.remove(node));

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    const maxDimension = Math.max(size.x, size.y, size.z) || 1;
    const normalizedScale = 2.65 / maxDimension;

    // Normalize the model once so all later scene placements use predictable dimensions.
    model.scale.setScalar(normalizedScale);
    model.position.set(
      -center.x * normalizedScale,
      -center.y * normalizedScale,
      -center.z * normalizedScale
    );

    // Material cleanup: preserve cushion softness while darkening shell/arm parts from the GLB.
    model.traverse((node) => {
      if (!node.isMesh || !node.material) return;

      node.castShadow = true;
      node.receiveShadow = true;

      const nodeName = node.name.toLowerCase();
      const materials = Array.isArray(node.material)
        ? node.material
        : [node.material];

      materials.forEach((material) => {
        if (!material) return;

        const materialName = (material.name || "").toLowerCase();
        const label = `${nodeName} ${materialName}`;

        const isLeatherOrCushion =
          materialName.includes("leather") ||
          materialName.includes("charcoal") ||
          materialName.includes("edge") ||
          materialName.includes("inner");

        const isButton =
          label.includes("button") ||
          materialName.includes("matte");

        const isShellOrArm =
          label.includes("titanium") ||
          label.includes("metal") ||
          label.includes("satin") ||
          label.includes("shell") ||
          label.includes("synthetic") ||
          label.includes("composite") ||
          label.includes("plastic") ||
          label.includes("plustic") ||
          label.includes("air cover") ||
          label.includes("air back") ||
          label.includes("ear stand") ||
          label.includes("rear");

        const isAccidentallyWhite =
          material.color &&
          material.color.r > 0.65 &&
          material.color.g > 0.65 &&
          material.color.b > 0.65;

        if (isLeatherOrCushion) {
          // Cushion/leather treatment: warmer roughness and restrained shine.
          material.color.setRGB(0.16, 0.17, 0.18);
          material.roughness = 0.62;
          material.envMapIntensity = 0.55;

          if ("specularIntensity" in material) material.specularIntensity = 0.16;
          if ("clearcoat" in material) material.clearcoat = 0.025;
          if ("sheen" in material) material.sheen = 0.14;
          if ("sheenColor" in material) {
            material.sheenColor.setRGB(0.036, 0.041, 0.052);
          }
          if ("sheenRoughness" in material) material.sheenRoughness = 0.94;
        } else if (isButton) {
          // Buttons stay nearly black so small control details do not flash white.
          material.color.setRGB(0.012, 0.012, 0.014);
          material.roughness = 0.62;
          material.metalness = 0.0;
          material.envMapIntensity = 0.12;

          if ("specularIntensity" in material) material.specularIntensity = 0.18;
        } else if (isShellOrArm || isAccidentallyWhite) {
          // Shell/arm treatment fixes the accidental white material issue from the source file.
          material.color.setRGB(0.01, 0.01, 0.012);
          material.roughness = 0.46;
          material.metalness = 0.01;
          material.envMapIntensity = 0.2;

          if ("specularIntensity" in material) material.specularIntensity = 0.28;
          if ("clearcoat" in material) material.clearcoat = 0.12;
        } else {
          material.envMapIntensity = 0.16;
        }

        if (material.emissive) {
          material.emissive.multiplyScalar(0.2);
        }

        material.needsUpdate = true;
      });
    });

    modelGroup.add(model);
    const shouldPlayHeroIntro = ENABLE_HERO_INTRO && !reducedMotion && !mobileFallback && window.scrollY < 4;
    let heroIntroIsActive = shouldPlayHeroIntro;
    let heroIntroHasCompleted = !shouldPlayHeroIntro;
    let heroFloatReady = false;

    /* ================================
    HERO INTRO / FLOAT STATE
    ================================ */
    function resetHeroIntroGroup() {
      introGroup.position.set(0, 0, 0);
      introGroup.rotation.set(0, 0, 0);
      introGroup.scale.set(1, 1, 1);
    }

    if (shouldPlayHeroIntro) {
      introGroup.position.set(
        HERO_INTRO_START.position.x,
        HERO_INTRO_START.position.y,
        HERO_INTRO_START.position.z
      );
      introGroup.rotation.set(
        HERO_INTRO_START.rotation.x,
        HERO_INTRO_START.rotation.y,
        HERO_INTRO_START.rotation.z
      );
      introGroup.scale.setScalar(HERO_INTRO_START.scale);
    } else {
      resetHeroIntroGroup();
    }

    /* ================================
    ABOUT SECTION THREE.JS / CANVAS
    ================================ */
    function setupAboutWaveRing() {
      const waveCanvas = document.querySelector("#about-wave-ring");
      if (!waveCanvas) return;

      const waveContext = waveCanvas.getContext("2d");
      if (!waveContext) return;

      const aboutWaveVisibility = createVisibilityTracker(aboutProductTarget, "0px 0px");
      let waveWidth = 1;
      let waveHeight = 1;
      let wavePixelRatio = 1;
      let waveNeedsResize = true;

      function resizeAboutWaveRing() {
        const rect = waveCanvas.getBoundingClientRect();
        wavePixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
        waveWidth = Math.max(1, Math.floor(rect.width));
        waveHeight = Math.max(1, Math.floor(rect.height));
        waveCanvas.width = Math.floor(waveWidth * wavePixelRatio);
        waveCanvas.height = Math.floor(waveHeight * wavePixelRatio);
        waveContext.setTransform(wavePixelRatio, 0, 0, wavePixelRatio, 0, 0);
        waveNeedsResize = false;
      }

      // Draws the About sound circle as radial audio bars instead of smooth wave loops.
      function drawRadialAudioBars({ color, phase, innerRadius, baseLength, layerOffset, alpha, width, visualSize }) {
        const centerX = waveWidth / 2;
        const centerY = waveHeight / 2;
        const size = visualSize;
        const ringSize = size * 1.15;
        const barCount = 128;
        const startRadius = ringSize * innerRadius;

        waveContext.strokeStyle = color;
        waveContext.globalAlpha = alpha;
        waveContext.lineWidth = width;

        for (let index = 0; index < barCount; index += 1) {
          const normalized = index / barCount;
          const angle = normalized * Math.PI * 2 + layerOffset;
          const lowPulse = 0.5 + 0.5 * Math.sin(angle * 5 + phase * 0.72);
          const midPulse = 0.5 + 0.5 * Math.sin(angle * 13 - phase * 1.1);
          const sharpPulse = Math.pow(0.5 + 0.5 * Math.sin(index * 2.37 + phase * 3.4), 4);
          const bassHit =
            Math.pow(Math.max(0, Math.sin(phase * 1.18)), 14) +
            Math.pow(Math.max(0, Math.sin(phase * 0.62 + 1.35)), 18) * 0.72;
          const bassCluster = Math.pow(0.5 + 0.5 * Math.sin(angle * 4 - phase * 0.82), 2);
          const length = baseLength * (
            0.26 +
            lowPulse * 0.3 +
            midPulse * 0.18 +
            sharpPulse * 0.36 +
            bassHit * (0.72 + bassCluster * 0.68)
          );
          const jitter = Math.sin(index * 1.91 + phase * 1.8) * ringSize * (0.006 + bassHit * 0.012);
          const inner = startRadius + jitter;
          const outer = inner + length;
          const x1 = centerX + Math.cos(angle) * inner;
          const y1 = centerY + Math.sin(angle) * inner;
          const x2 = centerX + Math.cos(angle) * outer;
          const y2 = centerY + Math.sin(angle) * outer;

          waveContext.beginPath();
          waveContext.moveTo(x1, y1);
          waveContext.lineTo(x2, y2);
          waveContext.stroke();
        }
      }

      function renderAboutWaveRing(time = 0) {
        if (!aboutWaveVisibility.isVisible() || !pageIsVisible) {
          // Idle the loop offscreen, but keep checking occasionally so it can resume when visible.
          queueNextFrame(renderAboutWaveRing, false);
          return;
        }

        if (waveNeedsResize) {
          resizeAboutWaveRing();
        }

        const elapsed = time * 0.001;
        const visualWaveSize = (Math.min(waveWidth, waveHeight) / 3.2) * 1.05;

        waveContext.setTransform(wavePixelRatio, 0, 0, wavePixelRatio, 0, 0);
        waveContext.clearRect(0, 0, waveWidth, waveHeight);
        waveContext.globalCompositeOperation = "lighter";
        waveContext.lineCap = "round";
        waveContext.lineJoin = "round";

        drawRadialAudioBars({
          color: "rgba(87, 255, 216, 1)",
          phase: elapsed * 2.35,
          innerRadius: 0.33,
          baseLength: visualWaveSize * 0.078,
          layerOffset: 0,
          alpha: 0.56,
          width: 2.2,
          visualSize: visualWaveSize
        });

        drawRadialAudioBars({
          color: "rgba(154, 98, 255, 1)",
          phase: elapsed * 2.75 + 1.8,
          innerRadius: 0.325,
          baseLength: visualWaveSize * 0.082,
          layerOffset: Math.PI / 176,
          alpha: 0.76,
          width: 2.35,
          visualSize: visualWaveSize
        });

        drawRadialAudioBars({
          color: "rgba(233, 92, 255, 1)",
          phase: elapsed * 2.05 + 3.1,
          innerRadius: 0.335,
          baseLength: visualWaveSize * 0.07,
          layerOffset: -Math.PI / 240,
          alpha: 0.58,
          width: 2,
          visualSize: visualWaveSize
        });

        waveContext.globalCompositeOperation = "source-over";
        waveContext.globalAlpha = 1;

        if (!reducedMotion) {
          queueNextFrame(renderAboutWaveRing);
        }
      }

      window.addEventListener("resize", () => {
        waveNeedsResize = true;
      });
      renderAboutWaveRing();
    }

    // Separate 3D model that animates into the About circle.
    function setupAboutCircleModel() {
      const aboutCanvas = document.querySelector("#about-headphones-canvas");
      if (!aboutCanvas) return;

      const aboutScene = new THREE.Scene();
      const aboutCamera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
      const aboutRenderer = new THREE.WebGLRenderer({
        canvas: aboutCanvas,
        alpha: true,
        antialias: true
      });

      const aboutModelVisibility = createVisibilityTracker(aboutProductTarget, "0px 0px");

      aboutRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      aboutRenderer.outputColorSpace = THREE.SRGBColorSpace;
      aboutRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      aboutRenderer.toneMappingExposure = 2.28;

      window.addEventListener(
        "pagehide",
        () => {
          aboutRenderer.dispose();
          aboutRenderer.forceContextLoss?.();
        },
        { once: true }
      );

      aboutScene.add(new THREE.AmbientLight(0xffffff, 1.02));

      const aboutKey = new THREE.DirectionalLight(0xf8fbff, 1.7);
      aboutKey.position.set(2.4, 3.8, 4.8);
      aboutScene.add(aboutKey);

      const aboutFront = new THREE.DirectionalLight(0xffffff, 1.02);
      aboutFront.position.set(0, 0.8, 5);
      aboutScene.add(aboutFront);

      const aboutHeadbandTopLight = new THREE.PointLight(0xf8fbff, 0.42, 5.8);
      aboutHeadbandTopLight.position.set(-0.25, 2.25, 2.4);
      aboutScene.add(aboutHeadbandTopLight);

      const aboutSoftFill = new THREE.DirectionalLight(0xeef7ff, 0.48);
      aboutSoftFill.position.set(-1.2, 0.35, 4.7);
      aboutScene.add(aboutSoftFill);

      const aboutPink = new THREE.PointLight(0xff4fb8, 0.55, 8);
      aboutPink.position.set(2.8, 0.8, 3.2);
      aboutScene.add(aboutPink);

      const aboutCyan = new THREE.PointLight(0x57ffd8, 0.5, 8);
      aboutCyan.position.set(-2.4, -0.4, 3.4);
      aboutScene.add(aboutCyan);

      const aboutRimLight = new THREE.DirectionalLight(0x9a62ff, 0.75); // adds subtle violet rim light
      aboutRimLight.position.set(-3.2, 1.4, -2.6); // places light behind/left of headphones
      aboutScene.add(aboutRimLight); // adds rim light to About scene

      const aboutCyanRim = new THREE.DirectionalLight(0x57ffd8, 0.45); // adds soft cyan edge highlight
      aboutCyanRim.position.set(3.0, -0.6, -2.2); // places light behind/right for a second edge
      aboutScene.add(aboutCyanRim); // adds cyan rim light to About scene

      const aboutPinkRim = new THREE.DirectionalLight(0xff4fb8, 0.38); // adds pink rim light only to About headphones
      aboutPinkRim.position.set(2.2, 1.1, -3.0); // places pink light behind the About model edge
      aboutScene.add(aboutPinkRim); // adds pink rim light to About scene only

      // Same loaded GLB, cloned for the About circle.
      // This does not download a second model file.
      const aboutModel = model.clone(true);

      // Put the clone inside its own group so the group can slide into the circle.
      const aboutModelGroup = new THREE.Group();
      aboutScene.add(aboutModelGroup);
      aboutModelGroup.add(aboutModel);

      const aboutBox = new THREE.Box3().setFromObject(aboutModel);
      const aboutCenter = new THREE.Vector3();
      aboutBox.getCenter(aboutCenter);

      // Center the cloned model inside its own group.
      aboutModel.position.x -= aboutCenter.x;
      aboutModel.position.y -= aboutCenter.y;
      aboutModel.position.z -= aboutCenter.z;

      // Starting placement before it slides into the About circle.
      aboutModelGroup.scale.setScalar(0.7);
      aboutModelGroup.position.set(-1.7, -0.05, 0);
      aboutModelGroup.rotation.set(0.02, 0.32, -0.04);

      aboutCamera.position.set(0, 0, 4.2);

      function resizeAboutCanvas() {
        const rect = aboutCanvas.getBoundingClientRect();
        const width = Math.max(1, Math.floor(rect.width));
        const height = Math.max(1, Math.floor(rect.height));

        aboutCamera.aspect = width / height;
        aboutCamera.updateProjectionMatrix();
        aboutRenderer.setSize(width, height, false);
      }

      resizeAboutCanvas();
      window.addEventListener("resize", resizeAboutCanvas);

      let aboutEntranceComplete = false;

      function updateAboutModelPosition() {
        const circle = document.querySelector("#about-product-target");
        if (!circle) return 0;

        const rect = circle.getBoundingClientRect();
        const windowHeight = window.innerHeight;

        // Progress starts when the circle enters the viewport and finishes near center.
        const progress = clamp(
          1 - rect.top / (windowHeight * 0.78),
          0,
          1
        );

        const eased = aboutEntranceComplete ? 1 : smoothstep(progress);
        const settled = eased > 0.82 ? 1 : eased;

        if (settled >= 1) {
          aboutEntranceComplete = true;
        }

        // Final resting spot inside the About circle.
        // x: negative = left, positive = right
        // y: negative = down, positive = up
        const aboutFinalX = -0.06;
        const aboutFinalY = 0.02;

        aboutModelGroup.position.x = lerp(-1.7, aboutFinalX, settled);
        aboutModelGroup.position.y = lerp(-0.05, aboutFinalY, settled);

        // Rotate into the final resting angle while entering.
        aboutModelGroup.rotation.x = lerp(0.02, -0.03, settled);
        aboutModelGroup.rotation.y = lerp(0.32, 0.12, settled);
        aboutModelGroup.rotation.z = lerp(-0.04, 0, settled);

        // Smaller final size keeps it centered in the circle.
        aboutModelGroup.scale.setScalar(lerp(0.7, 0.55, settled));

        return settled;
      }

      const aboutClock = new THREE.Clock();

      function renderAboutModel() {
        if (!aboutModelVisibility.isVisible() || !pageIsVisible) {
          queueNextFrame(renderAboutModel, false);
          return;
        }

        const elapsed = aboutClock.getElapsedTime();
        const eased = updateAboutModelPosition();

        if (eased > 0.96) {
          // Once centered, keep rotating like the original About-circle model.
          aboutModel.rotation.y += 0.006;
          aboutModel.rotation.x = Math.sin(elapsed * 0.52) * 0.018;
        } else {
          // Subtle movement while entering from the left.
          aboutModel.rotation.y = Math.sin(elapsed * 0.45) * 0.035;
          aboutModel.rotation.x = Math.sin(elapsed * 0.5) * 0.015;
        }

        aboutRenderer.render(aboutScene, aboutCamera);
        queueNextFrame(renderAboutModel);
      }

      renderAboutModel();
    }

    // The About canvases are large and decorative, so keep them uninitialized until needed.
    runWhenVisible(aboutProductTarget, () => {
      setupAboutCircleModel();
      setupAboutWaveRing();
    }, "120px 0px");

    /* ================================
    DESIGN SECTION THREE.JS CANVASES
    ================================ */
    function setupDesignModelCanvases() {
      const designCanvases = [...document.querySelectorAll(".design-model-canvas")];
      if (!designCanvases.length) return;

      const designViews = [];
      const designClock = new THREE.Clock();

      designCanvases.forEach((designCanvas) => {
        const designScene = new THREE.Scene();
        const designCamera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
        const designRenderer = new THREE.WebGLRenderer({
          canvas: designCanvas,
          alpha: true,
          antialias: true
        });

        designRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        designRenderer.outputColorSpace = THREE.SRGBColorSpace;
        designRenderer.toneMapping = THREE.ACESFilmicToneMapping;
        designRenderer.toneMappingExposure = 2.55;

        window.addEventListener(
          "pagehide",
          () => {
            designRenderer.dispose();
            designRenderer.forceContextLoss?.();
          },
          { once: true }
        );

        designScene.add(new THREE.AmbientLight(0xffffff, 1.32));

        const designKey = new THREE.DirectionalLight(0xf8fbff, 2.22);
        designKey.position.set(2.2, 3.4, 4.8);
        designScene.add(designKey);

        const designFill = new THREE.DirectionalLight(0xffffff, 1.54);
        designFill.position.set(-2.8, 1.4, 3.8);
        designScene.add(designFill);

        const designFrontSoft = new THREE.DirectionalLight(0xffffff, 0.98);
        designFrontSoft.position.set(0.2, 0.4, 5.2);
        designScene.add(designFrontSoft);

        const designEdgeLight = new THREE.DirectionalLight(0xd8fff6, 0.92);
        designEdgeLight.position.set(-3.4, -0.5, -2.4);
        designScene.add(designEdgeLight);

        const designGreen = new THREE.PointLight(0x57ffd8, 0.62, 8);
        designGreen.position.set(-2.4, 0.3, 3.4);
        designScene.add(designGreen);

        const designViolet = new THREE.PointLight(0x9a62ff, 0.68, 8);
        designViolet.position.set(2.8, 1.1, 3.8);
        designScene.add(designViolet);

        const designModel = model.clone(true);
        const detailBox = new THREE.Box3().setFromObject(designModel);
        const detailCenter = new THREE.Vector3();
        detailBox.getCenter(detailCenter);
        designModel.position.sub(detailCenter);

        const view = designCanvas.dataset.designView;

        // Each design canvas shows a different detail crop from the same loaded model.
        if (view === "ear") {
          designModel.scale.multiplyScalar(2.55);
          designModel.position.x -= 0.34;
          designModel.position.y += 0.55;
          designModel.rotation.set(0.2, 1.17, 0.5);
          designCamera.position.set(0, 0, 4.45);
        } else {
          designModel.scale.multiplyScalar(1.18);
          designModel.position.x += 0;
          designModel.position.y += 0.12;
          designModel.rotation.set(-0.05, -0.58, 0.02);
          designCamera.position.set(0, 0, 5.05);
        }

        designScene.add(designModel);

        function resizeDesignCanvas() {
          const rect = designCanvas.getBoundingClientRect();
          const width = Math.max(1, Math.floor(rect.width));
          const height = Math.max(1, Math.floor(rect.height));

          designCamera.aspect = width / height;
          designCamera.updateProjectionMatrix();
          designRenderer.setSize(width, height, false);
        }

        resizeDesignCanvas();
        designViews.push({
          renderer: designRenderer,
          scene: designScene,
          camera: designCamera,
          model: designModel,
          canvas: designCanvas,
          visibility: createVisibilityTracker(designCanvas, "280px 0px"),
          baseRotationX: designModel.rotation.x,
          baseRotationY: designModel.rotation.y
        });
        window.addEventListener("resize", resizeDesignCanvas);
      });

      function renderDesignViews() {
        if (!pageIsVisible) {
          // Do not continuously render decorative detail canvases in hidden tabs.
          queueNextFrame(renderDesignViews, false);
          return;
        }

        const elapsed = designClock.getElapsedTime();
        let renderedVisibleView = false;

        designViews.forEach((view, index) => {
          if (!view.visibility.isVisible()) return;

          view.model.rotation.y = view.baseRotationY + Math.sin(elapsed * 0.55 + index) * 0.035;
          view.model.rotation.x = view.baseRotationX + Math.sin(elapsed * 0.42 + index) * 0.012;
          view.renderer.render(view.scene, view.camera);
          renderedVisibleView = true;
        });

        queueNextFrame(renderDesignViews, renderedVisibleView);
      }

      renderDesignViews();
    }

    // Design detail WebGL is also deferred to avoid refresh-time GPU pressure on the hero.
    runWhenVisible(document.querySelector("#design"), setupDesignModelCanvases, "180px 0px");

    /* ================================
    SCROLL / ANIMATION LOGIC
    ================================ */
    function viewportToWorld(viewportX, viewportY, z = 0) {
      const cameraDistance = camera.position.z - z;
      const visibleHeight =
        2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * cameraDistance;
      const visibleWidth = visibleHeight * camera.aspect;

      return {
        x: (viewportX / window.innerWidth - 0.5) * visibleWidth,
        y: (0.5 - viewportY / window.innerHeight) * visibleHeight,
        z
      };
    }

    function getModelPosition(state) {
      if (state.viewport) {
        const point = viewportToWorld(
          window.innerWidth * state.viewport.x,
          window.innerHeight * state.viewport.y,
          state.positionOffset.z
        );

        return {
          x: point.x + state.positionOffset.x,
          y: point.y + state.positionOffset.y,
          z: point.z
        };
      }

      const target = getTargetViewportPoint();
      const point = viewportToWorld(target.x, target.y, state.positionOffset.z);

      return {
        x: point.x + state.positionOffset.x,
        y: point.y + state.positionOffset.y,
        z: point.z
      };
    }

    let modelScrollProgress = 0;

    function applyModelState(progress) {
      const rawProgress = clamp(progress);
      modelScrollProgress = rawProgress;
      const { start, end, reentry } = MODEL_SCROLL;
      const liveClip = getTargetCircleClip();
      const liveTarget = { x: liveClip.x, y: liveClip.y };

      const startPosition = getModelPosition(start);
      const targetPoint = liveTarget;
      const endPoint = viewportToWorld(targetPoint.x, targetPoint.y, end.positionOffset.z);
      const endPosition = {
        x: endPoint.x + end.positionOffset.x,
        y: endPoint.y + end.positionOffset.y,
        z: endPoint.z
      };
      const reentryPosition = {
        x: endPosition.x + reentry.positionOffset.x,
        y: endPosition.y + reentry.positionOffset.y,
        z: endPosition.z + reentry.positionOffset.z
      };
      const heroExitProgress = smoothstep(progressBetween(rawProgress, MODEL_PHASES.heroExitStart, MODEL_PHASES.heroExitEnd));
      const heroSpinProgress = smoothstep(progressBetween(rawProgress, 0.02, MODEL_PHASES.reentryStart));
      const reentryProgress = smoothstep(
        progressBetween(
          rawProgress,
          MODEL_PHASES.reentryStart,
          MODEL_PHASES.circleRotationStart
        )
      );
      let currentPosition;
      let currentScale;
      let currentRotation;

      if (rawProgress < MODEL_PHASES.reentryStart) {
        currentPosition = {
          x: startPosition.x,
          y: lerp(startPosition.y, startPosition.y - 1.4, heroExitProgress),
          z: startPosition.z
        };
        currentScale = start.scale;

        currentRotation = {
          x: lerp(start.rotation.x, 2.0, heroSpinProgress),
          y: lerp(start.rotation.y, 0.3, heroSpinProgress),
          z: lerp(start.rotation.z, 0.02, heroSpinProgress)
        };
      } else {
        currentPosition = {
          x: lerp(reentryPosition.x, endPosition.x, reentryProgress),
          y: lerp(reentryPosition.y, endPosition.y, reentryProgress),
          z: lerp(reentryPosition.z, endPosition.z, reentryProgress)
        };
        currentScale = lerp(reentry.scale, end.scale, reentryProgress);
        currentRotation = {
          x: lerp(reentry.rotation.x, end.rotation.x, reentryProgress),
          y: lerp(reentry.rotation.y, end.rotation.y, reentryProgress),
          z: lerp(reentry.rotation.z, end.rotation.z, reentryProgress)
        };
      }

      modelGroup.position.set(
        currentPosition.x,
        currentPosition.y,
        currentPosition.z
      );

      modelGroup.scale.setScalar(currentScale);

      modelGroup.rotation.set(
        currentRotation.x,
        currentRotation.y,
        currentRotation.z
      );

      const isCircleClipped = rawProgress >= MODEL_PHASES.reentryStart;

      // CSS variables drive the circular clip that hides/reveals the fixed hero canvas.
      modelStage.style.setProperty("--model-stage-visibility", "visible");
      modelStage.style.setProperty("--model-stage-z", "5");
      modelStage.style.setProperty("--model-clip-x", `${liveClip.x}px`);
      modelStage.style.setProperty("--model-clip-y", `${liveClip.y}px`);
      modelStage.style.setProperty("--model-clip-radius", isCircleClipped ? `${liveClip.radius}px` : "150vmax");
      modelStage.classList.toggle("is-circle-clipped", isCircleClipped);
      modelStage.classList.toggle(
        "is-hero-floating",
        rawProgress < MODEL_PHASES.heroExitStart &&
        !reducedMotion &&
        !heroIntroIsActive &&
        heroFloatReady
      );

      renderer.render(scene, camera);
    }

    applyModelState(0);

    const modelScrollTrigger = ScrollTrigger.create({
      trigger: ".hero",
      start: "top top",
      end: () => `+=${MODEL_SCROLL.distance}`,
      scrub: true,
      onUpdate: (self) => applyModelState(self.progress)
    });

    let scrollUpdateQueued = false;
    let heroModelShouldRender = true;

    function renderHeroModel() {
      if (!heroModelShouldRender || !pageIsVisible) return;
      renderer.render(scene, camera);
    }

    function playHeroIntro() {
      if (!shouldPlayHeroIntro || modelScrollTrigger.progress > HERO_INTRO_SCROLL_CANCEL_PROGRESS) {
        // If the user has already scrolled, skip the intro so scroll position wins.
        heroIntroIsActive = false;
        heroIntroHasCompleted = true;
        resetHeroIntroGroup();
        renderHeroModel();
        return;
      }

      let introTimeline = null;
      const cancelIntro = () => {
        // A scroll during the intro cancels the timeline and syncs immediately to ScrollTrigger.
        introTimeline?.kill();
        heroIntroIsActive = false;
        heroIntroHasCompleted = true;
        resetHeroIntroGroup();
        applyModelState(modelScrollTrigger.progress);
        updateHeroRenderActivity();
        renderHeroModel();
      };

      introTimeline = gsap.timeline({
        defaults: {
          duration: HERO_INTRO_DURATION,
          ease: "power3.out"
        },
        onUpdate: () => {
          if (modelScrollTrigger.progress > HERO_INTRO_SCROLL_CANCEL_PROGRESS) {
            cancelIntro();
            return;
          }

          renderHeroModel();
        },
        onComplete: () => {
          heroIntroIsActive = false;
          heroIntroHasCompleted = true;
          resetHeroIntroGroup();
          applyModelState(modelScrollTrigger.progress);
          renderHeroModel();
        }
      });

      introTimeline
        .to(introGroup.position, { x: 0, y: 0, z: 0 }, 0)
        .to(introGroup.rotation, { x: 0, y: 0, z: 0 }, 0)
        .to(introGroup.scale, { x: 1, y: 1, z: 1 }, 0);
    }

    function updateHeroRenderActivity() {
      // Hide the fixed WebGL canvas after its scroll range so it does not keep repainting offscreen.
      heroModelShouldRender = window.scrollY <= MODEL_SCROLL.distance + window.innerHeight * 0.45;
      modelStage.style.setProperty("--model-stage-visibility", heroModelShouldRender ? "visible" : "hidden");
    }

    function syncModelToCurrentScroll() {
      if (scrollUpdateQueued) return;

      // Coalesce native scroll events into one render per animation frame.
      scrollUpdateQueued = true;
      requestAnimationFrame(() => {
        scrollUpdateQueued = false;
        applyModelState(modelScrollTrigger.progress);
        updateHeroRenderActivity();
        renderHeroModel();
      });
    }

    function resizeRenderer() {
      resizeHeroRenderer();
      ScrollTrigger.refresh();
      applyModelState(modelScrollTrigger.progress);
      updateHeroRenderActivity();
      renderHeroModel();
    }

    window.addEventListener("resize", resizeRenderer);
    window.addEventListener("scroll", syncModelToCurrentScroll, { passive: true });
    updateHeroRenderActivity();
    requestAnimationFrame(() => {
      applyModelState(modelScrollTrigger.progress);
      updateHeroRenderActivity();
      renderHeroModel();
    });
    window.setTimeout(() => {
      applyModelState(modelScrollTrigger.progress);
      updateHeroRenderActivity();
      renderHeroModel();
    }, IDLE_FRAME_DELAY);
    window.setTimeout(() => {
      // Re-enable the hero float only after startup work has settled.
      heroFloatReady = true;
      applyModelState(modelScrollTrigger.progress);
      updateHeroRenderActivity();
    }, HERO_FLOAT_START_DELAY);
    playHeroIntro();
  } catch (error) {
    console.warn("AURORA 3D model fallback activated:", error);
    activateFallback();
  }
}

/* ================================
SOUND WAVE ANIMATION LOOP
================================ */
// Top-level sound wave loop. The loop idles when the wave panel is offscreen.
function animate(timestamp = 0) {
  if (reducedMotion || !pageIsVisible) {
    queueNextFrame(animate, false);
    return;
  }

  if (
    soundWaveVisibility.isVisible() &&
    (!lastSoundWaveFrame || timestamp - lastSoundWaveFrame >= SOUND_WAVE_FRAME_INTERVAL)
  ) {
    lastSoundWaveFrame = timestamp;
    drawSoundWave();
  }

  queueNextFrame(animate, soundWaveVisibility.isVisible());
}

/* ================================
SECTION REVEAL OBSERVERS
================================ */
// Section reveal observers.
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
      }
    });
  },
  { threshold: 0.18 }
);

observedSections.forEach((section) => observer.observe(section));

if ("IntersectionObserver" in window) {
  const staggerCardObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");

          // Wait until the scroll-in stagger finishes, then remove the lingering delay from hover animations.
          const staggerDelay =
            Number.parseFloat(
              getComputedStyle(entry.target).getPropertyValue("--stagger-card-delay")
            ) || 0;

          window.setTimeout(() => {
            entry.target.classList.add("is-hover-ready");
          }, staggerDelay + 920);

          staggerCardObserver.unobserve(entry.target);
        }
      });
    },
    {
      rootMargin: "0px 0px -12% 0px",
      threshold: 0.28
    }
  );

  observedStaggerCards.forEach((card) => staggerCardObserver.observe(card));
} else {
  observedStaggerCards.forEach((card) => card.classList.add("is-visible"));
}

/* ================================
FALLBACK / MEDIA QUERY LISTENERS
================================ */
// These listeners switch to the static image fallback if motion/device conditions change after load.
window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (event) => {
  reducedMotion = event.matches;

  if (event.matches) {
    activateFallback();
  }
});

window.matchMedia("(max-width: 760px)").addEventListener("change", (event) => {
  mobileFallback = event.matches;

  if (event.matches) {
    activateFallback();
  }
});

if (waitlistForm && formMessage) {
  /* ================================
  WAITLIST FORM INTERACTIONS
  ================================ */
  const waitlistEmailInput = waitlistForm.querySelector('input[type="email"]');
  const waitlistSubmitButton = waitlistForm.querySelector('button[type="submit"]');
  const waitlistSuccessText = waitlistForm.querySelector(".waitlist-success-text");
  const notifyButton = document.querySelector('.button-primary[href="#waitlist"]');

  function focusWaitlistEmailAfterScroll() {
    const focusEmail = () => {
      if (window.location.hash !== "#waitlist") return;
      waitlistEmailInput?.focus({ preventScroll: true });
    };

    // Native scrollend preserves the waitlist hover/focus glow after the CTA jump finishes.
    if ("onscrollend" in window) {
      window.addEventListener("scrollend", focusEmail, { once: true });
      window.setTimeout(focusEmail, reducedMotion ? 120 : 1200);
    } else {
      window.setTimeout(focusEmail, reducedMotion ? 120 : 900);
    }
  }

  notifyButton?.addEventListener("click", focusWaitlistEmailAfterScroll);

  // Clear the animated success state if the user edits the email again.
  waitlistEmailInput?.addEventListener("input", () => {
    window.clearTimeout(waitlistSuccessTimeout);
    waitlistForm.classList.remove("is-sending", "is-success");
    formMessage.textContent = "";
    if (waitlistSuccessText) waitlistSuccessText.textContent = "";

    if (waitlistSubmitButton) {
      waitlistSubmitButton.setAttribute("aria-label", "Join the waitlist");
      waitlistSubmitButton.title = "Join the waitlist";
    }
  });

  waitlistForm.addEventListener("submit", (event) => {
    event.preventDefault();

    // Keep native validation, then animate the form into a send-pulse success state.
    if (!waitlistForm.checkValidity()) {
      waitlistForm.reportValidity();
      return;
    }

    const email = String(new FormData(waitlistForm).get("email") || "").trim();
    if (!email) return;

    window.clearTimeout(waitlistSuccessTimeout);
    waitlistForm.classList.remove("is-success");
    waitlistForm.classList.add("is-sending");
    formMessage.textContent = "";
    if (waitlistSuccessText) waitlistSuccessText.textContent = "";

    if (waitlistSubmitButton) {
      waitlistSubmitButton.setAttribute("aria-label", "Sending waitlist request");
      waitlistSubmitButton.title = "Sending";
    }

    waitlistSuccessTimeout = window.setTimeout(() => {
      const savedLocally = saveWaitlistEmail(email);

      waitlistForm.classList.remove("is-sending");
      waitlistForm.classList.add("is-success");
      formMessage.textContent = savedLocally
        ? "Concept signup saved in this browser."
        : "Concept signup confirmed for this session.";

      if (waitlistSuccessText) waitlistSuccessText.textContent = "You’re on the list.";

      if (waitlistSubmitButton) {
        waitlistSubmitButton.setAttribute("aria-label", "Concept signup saved");
        waitlistSubmitButton.title = "Concept signup saved";
      }
    }, reducedMotion ? 0 : 520);
  });
}

/* ================================
STARTUP / EVENT LISTENERS
================================ */
// Startup order is intentional: paint/navigation state first, then WebGL, then fallback timers.
document.addEventListener("visibilitychange", () => {
  pageIsVisible = !document.hidden;
});

handlePageScroll();
requestAnimationFrame(handlePageScroll);
initNavPaint();
initFontReadyState();

window.addEventListener("load", () => {
  requestAnimationFrame(handlePageScroll);
  initNavPaint();
});

window.addEventListener("scroll", handlePageScroll, { passive: true });
window.addEventListener("resize", handlePageScroll);

initializeHeadphoneModel().finally(() => hideLoadingScreen());
window.setTimeout(hideLoadingScreen, 8000);
updateFallbackPosition();
animate();
