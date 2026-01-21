import { PolyMod } from "https://pml.orangy.cfd/PolyTrackMods/PolyModLoader/0.5.2/PolyModLoader.js";

globalThis.cinemaEnabled = false;

const DEFAULT_RATIO = 2.39;
let currentPreset = 1;

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
      left: "0",
      top: "50%",
      transform: "translateY(-50%)",
      width: "100%",
      overflow: "hidden",
      zIndex: "999999",
    });

    document.body.appendChild(wrap);
  }

  return { bg, wrap };
}

function applyLetterbox(gl, ratio) {
  if (!gl || !gl.canvas) return false;

  const canvas = gl.canvas;
  const ui = getUI();
  if (!ui) return false;

  const { bg, wrap } = ensureCinemaDOM();


  //rescaling based on preset
  if (currentPreset == 0) {
    const contentH = computeContentHeight(ratio);
    const contentW = window.innerWidth;
  } else if (currentPreset == 1) {
    const contentH = window.innerHeight;
    const contentW = window.innerWidth;
  }



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


  wrap.style.height = `${contentH}px`;
  wrap.style.width = `${contentW}px`;
  

  // Move elements inside wrapper
  if (canvas.parentElement !== wrap) wrap.appendChild(canvas);
  if (ui.parentElement !== wrap) wrap.appendChild(ui);

  // Make canvas fill wrapper
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
  const bufferW = Math.max(1, Math.floor(contentW * dpr));
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
