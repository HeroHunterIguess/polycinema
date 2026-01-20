import { PolyMod } from "https://pml.orangy.cfd/PolyTrackMods/PolyModLoader/0.5.2/PolyModLoader.js";

globalThis.cinemaEnabled = false;

const DEFAULT_RATIO = 2.39; // cinemascope
const CINEMA_STATE_KEY = "__polyCinemaState";

function getGL() {
  return globalThis.__ppGL || null;
}

function computeContentHeight(ratio) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const wanted = Math.round(w / ratio);
  return Math.min(h, wanted);
}

function applyCanvasLetterbox(gl, ratio) {
  if (!gl || !gl.canvas) return false;

  const canvas = gl.canvas;
  const contentH = computeContentHeight(ratio);

  Object.assign(canvas.style, {
    position: "fixed",
    left: "0",
    top: "50%",
    transform: "translateY(-50%)",
    width: "100%",
    height: `${contentH}px`,
    display: "block",
    zIndex: "1",
  });

  const dpr = window.devicePixelRatio || 1;
  const bufferW = Math.max(1, Math.floor(window.innerWidth * dpr));
  const bufferH = Math.max(1, Math.floor(contentH * dpr));

  if (canvas.width !== bufferW || canvas.height !== bufferH) {
    canvas.width = bufferW;
    canvas.height = bufferH;
  }

  // Enforce viewport
  try {
    gl.viewport(0, 0, bufferW, bufferH);
  } catch {}

  return true;
}

function resetCanvas(gl) {
  if (!gl || !gl.canvas) return false;

  const canvas = gl.canvas;

  Object.assign(canvas.style, {
    position: "",
    left: "",
    top: "",
    transform: "",
    width: "",
    height: "",
    display: "",
    zIndex: "",
  });

  const dpr = window.devicePixelRatio || 1;
  const bufferW = Math.max(1, Math.floor(window.innerWidth * dpr));
  const bufferH = Math.max(1, Math.floor(window.innerHeight * dpr));

  if (canvas.width !== bufferW || canvas.height !== bufferH) {
    canvas.width = bufferW;
    canvas.height = bufferH;
  }

  try {
    gl.viewport(0, 0, bufferW, bufferH);
  } catch {}

  return true;
}

function tickEnforce() {
  const gl = getGL();
  if (!gl) return;

  if (globalThis.cinemaEnabled) {
    applyCanvasLetterbox(gl, DEFAULT_RATIO);
  } else {
    const st = globalThis[CINEMA_STATE_KEY];
    if (st && st.wasEnabled) {
      resetCanvas(gl);
    }
  }

  const st = (globalThis[CINEMA_STATE_KEY] ||= {});
  st.wasEnabled = !!globalThis.cinemaEnabled;
}

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

class cinema extends PolyMod {
  init = (pml) => {
    pml.registerBindCategory("Cinema bars");

    pml.registerKeybind(
      "Toggle Cinematic bars",
      "toggle_cinema",
      "keydown",
      "KeyC",
      null,
      () => {
        globalThis.cinemaEnabled = !globalThis.cinemaEnabled;
        console.log("[PolyCinema] cinemaEnabled =", globalThis.cinemaEnabled);
        tickEnforce();
      },
    );
  };
}

export let polyMod = new cinema();
