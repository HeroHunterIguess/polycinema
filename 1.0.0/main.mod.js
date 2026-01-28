import { PolyMod } from "https://pml.orangy.cfd/PolyTrackMods/PolyModLoader/0.5.2/PolyModLoader.js";
import { SettingType } from "https://pml.orangy.cfd/PolyTrackMods/PolyModLoader/0.5.2/PolyModLoader.js";


globalThis.cinemaEnabled = true;

const CINEMA_STATE_KEY = "__polyCinemaState";

// Presets are width/height aspect ratios
const PRESETS = [
  { name: "Off", aspect: null }, // means: use full screen
  { name: "9:16", aspect: 9 / 16 },
  { name: "1:1", aspect: 1 / 1 },
  { name: "4:3", aspect: 4 / 3},
  { name: "3:2", aspect: 3 / 2 },
  { name: "18:9", aspect: 18 / 9 },
  { name: "2.39:1", aspect: 2.39 },
  { name: "16:9", aspect: 16 / 9 }
];

// Start preset (index into PRESETS)
let currentPreset = 0;

let toggledPreset = 3;

function realScreenW() {
  return document.documentElement.clientWidth;
}
function realScreenH() {
  return document.documentElement.clientHeight;
}

(function installViewportLies() {
  if (globalThis.__polyCinemaViewportLiesInstalled) return;
  globalThis.__polyCinemaViewportLiesInstalled = true;

  const proto = HTMLCanvasElement.prototype;

  // Keep original getters
  const origClientWidth = Object.getOwnPropertyDescriptor(
    proto,
    "clientWidth",
  )?.get;
  const origClientHeight = Object.getOwnPropertyDescriptor(
    proto,
    "clientHeight",
  )?.get;

  const origGetBoundingClientRect = proto.getBoundingClientRect;

  function getCinemaSize() {
    const wrap = document.getElementById("poly-cinema-wrap");
    if (!globalThis.cinemaEnabled || !wrap) return null;

    const r = wrap.getBoundingClientRect();
    const w = Math.max(1, r.width | 0);
    const h = Math.max(1, r.height | 0);
    return { w, h };
  }

  // Lie about clientWidth/clientHeight
  Object.defineProperty(proto, "clientWidth", {
    configurable: true,
    get() {
      const s = getCinemaSize();
      if (s && this.id === "screen") return s.w;
      return origClientWidth ? origClientWidth.call(this) : 0;
    },
  });

  Object.defineProperty(proto, "clientHeight", {
    configurable: true,
    get() {
      const s = getCinemaSize();
      if (s && this.id === "screen") return s.h;
      return origClientHeight ? origClientHeight.call(this) : 0;
    },
  });

  // Lie about bounding rect too
  proto.getBoundingClientRect = function () {
    const s = getCinemaSize();
    if (s && this.id === "screen") {
      const r = wrap.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
        toJSON() {},
      };
    }
    return origGetBoundingClientRect.call(this);
  };

  console.log(
    "[PolyCinema] Installed viewport lies (clientWidth/Height + BCR)",
  );
})();

(function installVirtualWindowSize() {
  if (globalThis.__polyCinemaVirtualWindowInstalled) return;
  globalThis.__polyCinemaVirtualWindowInstalled = true;

  const win = window;

  const origInnerW = Object.getOwnPropertyDescriptor(
    Window.prototype,
    "innerWidth",
  )?.get;
  const origInnerH = Object.getOwnPropertyDescriptor(
    Window.prototype,
    "innerHeight",
  )?.get;

  // Fallback in case descriptors are missing
  const realInnerWidth = () => document.documentElement.clientWidth;
  const realInnerHeight = () => document.documentElement.clientHeight;

  globalThis.__polyCinemaVirtualSize =
    globalThis.__polyCinemaVirtualSize || null;

  function getVirtualW() {
    const v = globalThis.__polyCinemaVirtualSize;
    return globalThis.cinemaEnabled && v && v.w ? v.w : realInnerWidth();
  }

  function getVirtualH() {
    const v = globalThis.__polyCinemaVirtualSize;
    return globalThis.cinemaEnabled && v && v.h ? v.h : realInnerHeight();
  }

  // Patch window.innerWidth / innerHeight reads
  Object.defineProperty(win, "innerWidth", {
    configurable: true,
    get() {
      return getVirtualW();
    },
  });

  Object.defineProperty(win, "innerHeight", {
    configurable: true,
    get() {
      return getVirtualH();
    },
  });

  console.log("[PolyCinema] Virtual window size hook installed");
})();

function getGL() {
  return globalThis.__ppGL || null;
}

function getUI() {
  return document.querySelector("#ui");
}

function fitAspect(targetAspect) {
  const screenW = realScreenW();
  const screenH = realScreenH();

  // If preset is "Off" or invalid, return full screen
  if (!targetAspect || !Number.isFinite(targetAspect) || targetAspect <= 0) {
    return { contentW: screenW, contentH: screenH };
  }

  const screenAspect = screenW / screenH;

  let contentW, contentH;

  if (screenAspect > targetAspect) {
    contentH = screenH;
    contentW = Math.round(contentH * targetAspect);
  } else {
    contentW = screenW;
    contentH = Math.round(contentW / targetAspect);
  }

  // Safety clamp
  contentW = Math.max(1, Math.min(screenW, contentW));
  contentH = Math.max(1, Math.min(screenH, contentH));

  return { contentW, contentH };
}

function ensureCinemaDOM() {
  let bg = document.getElementById("poly-cinema-bg");
  if (!bg) {
    bg = document.createElement("div");
    bg.id = "poly-cinema-bg";
    Object.assign(bg.style, {
      position: "fixed",
      inset: "0",
      background: "#000",
      zIndex: "999990",
      pointerEvents: "none",
    });
    document.body.appendChild(bg);
  }

  let wrap = document.getElementById("poly-cinema-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "poly-cinema-wrap";
    Object.assign(wrap.style, {
      position: "fixed",
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      overflow: "hidden",
      zIndex: "999999",
    });
    document.body.appendChild(wrap);
  }

  return { bg, wrap };
}

function applyLetterbox(gl) {
  if (!gl || !gl.canvas) return false;

  const canvas = gl.canvas;
  const ui = getUI();
  if (!ui) return false;

  const { bg, wrap } = ensureCinemaDOM();

  const preset = PRESETS[currentPreset] || PRESETS[0];
  const { contentW, contentH } = fitAspect(preset.aspect);

  globalThis.__polyCinemaVirtualSize = preset.aspect
    ? { w: contentW, h: contentH }
    : null;

  // Save original placement once
  const st = (globalThis[CINEMA_STATE_KEY] ||= {});
  if (!st.saved) {
    st.saved = true;

    st.canvasParent = canvas.parentElement;
    st.canvasNext = canvas.nextSibling;

    st.uiParent = ui.parentElement;
    st.uiNext = ui.nextSibling;

    st.canvasStyle = canvas.getAttribute("style") || "";
    st.uiStyle = ui.getAttribute("style") || "";
  }

  // Size wrapper
  wrap.style.width = `${contentW}px`;
  wrap.style.height = `${contentH}px`;

  // Move into wrapper
  if (canvas.parentElement !== wrap) wrap.appendChild(canvas);
  if (ui.parentElement !== wrap) wrap.appendChild(ui);

  // Canvas fills wrapper
  Object.assign(canvas.style, {
    position: "absolute",
    left: "0",
    top: "0",
    width: "100%",
    height: "100%",
    display: "block",
    zIndex: "0",
  });

  // UI fills wrapper
  Object.assign(ui.style, {
    position: "absolute",
    left: "0",
    top: "0",
    width: "100%",
    height: "100%",
    zIndex: "1",
  });

  // Resize drawing buffer to wrapper size
  const dpr = window.devicePixelRatio || 1;
  const bufferW = Math.max(1, Math.floor(contentW * dpr));
  const bufferH = Math.max(1, Math.floor(contentH * dpr));

  if (canvas.width !== bufferW || canvas.height !== bufferH) {
    canvas.width = bufferW;
    canvas.height = bufferH;
  }

  try {
    gl.viewport(0, 0, bufferW, bufferH);
    canvas.style.width = `${contentW}px`;
    canvas.style.height = `${contentH}px`;
  } catch {}

  bg.style.display = "block";
  wrap.style.display = "block";

  const sizeKey = `${contentW}x${contentH}`;
  if (st.lastSizeKey !== sizeKey) {
    st.lastSizeKey = sizeKey;
    window.dispatchEvent(new Event("resize"));
  }

  return true;
}

function disableLetterbox(gl) {
  const st = globalThis[CINEMA_STATE_KEY];
  if (!st || !st.saved) return false;

  const canvas = gl?.canvas;
  const ui = getUI();

  globalThis.__polyCinemaVirtualSize = null;

  // Restore DOM
  if (canvas && st.canvasParent) {
    if (st.canvasNext) st.canvasParent.insertBefore(canvas, st.canvasNext);
    else st.canvasParent.appendChild(canvas);
  }

  if (ui && st.uiParent) {
    if (st.uiNext) st.uiParent.insertBefore(ui, st.uiNext);
    else st.uiParent.appendChild(ui);
  }

  // Restore inline styles
  if (canvas) {
    if (st.canvasStyle) canvas.setAttribute("style", st.canvasStyle);
    else canvas.removeAttribute("style");
  }
  if (ui) {
    if (st.uiStyle) ui.setAttribute("style", st.uiStyle);
    else ui.removeAttribute("style");
  }

  document.getElementById("poly-cinema-wrap")?.remove();
  document.getElementById("poly-cinema-bg")?.remove();

  // Restore buffer to full screen
  try {
    const dpr = window.devicePixelRatio || 1;
    const bufferW = Math.max(1, Math.floor(window.innerWidth * dpr));
    const bufferH = Math.max(1, Math.floor(window.innerHeight * dpr));
    if (canvas) {
      canvas.width = bufferW;
      canvas.height = bufferH;
    }
    if (gl) gl.viewport(0, 0, bufferW, bufferH);
  } catch {}

  st.saved = false;
  return true;
}

function tickEnforce() {
  const gl = getGL();
  if (!gl) return;

  if (globalThis.cinemaEnabled) {
    applyLetterbox(gl);
  } else {
    const st = globalThis[CINEMA_STATE_KEY];
    if (st && st.wasEnabled) {
      disableLetterbox(gl);
    }
  }

  // Getting settings value and updating preset
  let rawSettings = JSON.parse(window.localStorage.getItem("polytrack_v4_prod_settings"));

  toggledPreset = parseInt(rawSettings[3][1],10);
  console.log(toggledPreset);


  const st = (globalThis[CINEMA_STATE_KEY] ||= {});
  st.wasEnabled = !!globalThis.cinemaEnabled;
}

// Hook RAF once
(function ensureRafHooked() {
  const st = (globalThis[CINEMA_STATE_KEY] ||= {});
  if (st.rafHooked) return;
  st.rafHooked = true;

  const origRAF = globalThis.requestAnimationFrame.bind(globalThis);

  globalThis.requestAnimationFrame = function (cb) {
    return origRAF(function (t) {
      cb(t);
      tickEnforce();
    });
  };

  console.log("[PolyCinema] Hooked requestAnimationFrame");
})();

// Public console helpers
globalThis.__polyCinemaSetPreset = function (idx) {
  currentPreset = ((idx % PRESETS.length) + PRESETS.length) % PRESETS.length;
  console.log(
    "[PolyCinema] Preset =",
    currentPreset,
    PRESETS[currentPreset].name,
  );
};
globalThis.__polyCinemaNextPreset = function () {
  globalThis.__polyCinemaSetPreset(currentPreset + 1);
};
globalThis.__polyCinemaPrevPreset = function () {
  globalThis.__polyCinemaSetPreset(currentPreset - 1);
};

class cinema extends PolyMod {
  init = (pml) => {
    pml.registerBindCategory("Cinema bars");

    pml.registerKeybind(
      "Toggle Cinema",
      "toggle_cinema",
      "keydown", 
      "KeyE",
      null,
      () => {
        if (currentPreset !== 0) {
          toggledPreset = currentPreset;
          currentPreset = 0; // Off
        } else {
          currentPreset = toggledPreset || 5;
        }
        tickEnforce();
      },
    );

    /* haha no cool in game switcher you MUST use the fancy settings i created !!
    pml.registerKeybind(
      "Next Cinema Preset",
      "next_cinema_preset",
      "keydown",
      "KeyV",
      null,
      () => {
        globalThis.__polyCinemaNextPreset();
        if (globalThis.cinemaEnabled) tickEnforce();
      },
    );
    */

    this.pml = pml

    // Add settings options
    pml.registerSettingCategory("PolyCinema settings");
    pml.registerSetting("Aspect ratio", "ratio", SettingType.CUSTOM, "1", [
      { title: "9:16", value: "1" },
      { title: "1:1", value: "2" },
      { title: "4:3", value: "3" },
      { title: "3:2", value: "4" },
      { title: "18:9", value: "5" },
      { title: "2.39:1", value: "6" },
      { title: "16:9", value: "7" }
    ]);
  };
}

export let polyMod = new cinema();
