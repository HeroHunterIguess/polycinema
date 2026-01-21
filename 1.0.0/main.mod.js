import { PolyMod } from "https://pml.orangy.cfd/PolyTrackMods/PolyModLoader/0.5.2/PolyModLoader.js";

globalThis.cinemaEnabled = false;

const DEFAULT_RATIO = 1; 
const CINEMA_STATE_KEY = "__polyCinemaState";

function getGL() {
  return globalThis.__ppGL || null;
}

function getUI() {
  return document.querySelector("#ui");
}

function computeContentHeight(ratio) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const targetH = Math.round(w / ratio);
  return Math.min(h, targetH);
}

//lowk dont know what im doing with this lmao

function computeContentWidth(ratio) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const wanted = Math.round(h + ratio);
  return Math.min(w, wanted);
}

function applyLetterbox(gl, ratio) {
  if (!gl || !gl.canvas) return false;

  const canvas = gl.canvas;
  const contentH = computeContentHeight(ratio);
  const contentW = computeContentWidth(ratio);

  Object.assign(canvas.style, {
    position: "absolute",
    left: "0",
    top: "0",
    width: "100%",
    height: "100%",
    display: "block",
    zIndex: "0",
  });

  // Make UI fill wrapper too
  Object.assign(ui.style, {
    position: "absolute",
    left: "0",
    top: "0",
    width: "100%",
    height: "100%",
    zIndex: "1",
  });

  // Resize WebGL drawing buffer to match wrapper
  const dpr = window.devicePixelRatio || 1;
  const bufferW = Math.max(1, Math.floor(window.innerWidth * dpr));
  const bufferH = Math.max(1, Math.floor(contentH * dpr));

  if (canvas.width !== bufferW || canvas.height !== bufferH) {
    canvas.width = bufferW;
    canvas.height = bufferH;
  }

  try {
    gl.viewport(0, 0, bufferW, bufferH);
  } catch {}

  // Keep bg behind and wrap on top
  bg.style.display = "block";
  wrap.style.display = "block";

  return true;
}

function disableLetterbox(gl) {
  const st = globalThis[CINEMA_STATE_KEY];
  if (!st || !st.saved) return false;

  const canvas = gl?.canvas;
  const ui = getUI();

  // Restore canvas DOM placement
  if (canvas && st.canvasParent) {
    if (st.canvasNext) st.canvasParent.insertBefore(canvas, st.canvasNext);
    else st.canvasParent.appendChild(canvas);
  }

  // Restore UI DOM placement
  if (ui && st.uiParent) {
    if (st.uiNext) st.uiParent.insertBefore(ui, st.uiNext);
    else st.uiParent.appendChild(ui);
  }

  // Restore original inline styles
  if (canvas) {
    if (st.canvasStyle) canvas.setAttribute("style", st.canvasStyle);
    else canvas.removeAttribute("style");
  }
  if (ui) {
    if (st.uiStyle) ui.setAttribute("style", st.uiStyle);
    else ui.removeAttribute("style");
  }

  // Remove cinema DOM
  document.getElementById("poly-cinema-wrap")?.remove();
  document.getElementById("poly-cinema-bg")?.remove();

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
    applyLetterbox(gl, DEFAULT_RATIO);
  } else {
    const st = globalThis[CINEMA_STATE_KEY];
    if (st && st.wasEnabled) {
      disableLetterbox(gl);
    }
  }

  const st = (globalThis[CINEMA_STATE_KEY] ||= {});
  st.wasEnabled = !!globalThis.cinemaEnabled;
}

// Enforce at end-of-frame so the game can't undo it
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
