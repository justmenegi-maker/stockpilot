/*
 * StockPilot adapter for liquid-glass-js
 * (https://github.com/dashersw/liquid-glass-js, MIT © 2025 Armagan Amcalar — see LICENSE)
 *
 * The upstream library renders an Apple-style "liquid glass" refraction effect
 * into a WebGL canvas it creates itself. This adapter reparents that canvas
 * into existing app surfaces (header, auth card, chat FAB, toast stack)
 * instead of letting the library create its own DOM, so layout, buttons and
 * event listeners stay untouched. One snapshot + tuned uniforms are shared by
 * every instance.
 *
 * Optimizations vs. the stock demo:
 *   • No html2canvas: the page changes constantly (live inventory data), so a
 *     one-shot DOM snapshot would go stale instantly; a tiny procedural canvas
 *     is fed through the documented Container.pageSnapshot hook instead.
 *   • Device pixel ratio capped at 1.5 and re-applied after every resize —
 *     the shader runs a 13×13 Gaussian kernel per fragment.
 *   • Debounced ResizeObserver + orientationchange handling (upstream gap).
 *   • Hard caps: ≤4 glass surfaces, disabled ≤520px-wide viewports,
 *     prefers-reduced-motion honored, WebGL failure → CSS-only fallback.
 *   • CSP-safe: no eval, no workers, no blob URLs, no external requests.
 */
"use strict";

(function () {
  // Exit cleanly in the test sandbox / very old browsers.
  if (typeof window === "undefined" || typeof document === "undefined") return;

  var supportsWebGL = (function () {
    try {
      var c = document.createElement("canvas");
      return !!(c.getContext && c.getContext("webgl"));
    } catch (e) {
      return false;
    }
  })();

  var reduced =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  window.__stockpilotGlassReady = false;
  window.refreshGlassTheme = function () {}; // filled in once the glass boots
  if (!supportsWebGL || reduced) return; // CSS fallback surfaces stay active

  function boot() {
    if (typeof Container !== "function") return; // container.js not loaded
    // Tuned parameters (documented glassControls ranges):
    //   blurRadius 4 of 15   → visible frost without hiding the surface
    //   edge/rim intensities → crisp refraction rim, no banding
    //   rippleEffect 0       → calm glass, no surface noise
    window.glassControls = {
      blurRadius: 4,
      edgeIntensity: 0.012,
      rimIntensity: 0.06,
      baseIntensity: 0.01,
      edgeDistance: 0.15,
      rimDistance: 0.8,
      baseDistance: 0.1,
      cornerBoost: 0.02,
      rippleEffect: 0,
      tintOpacity: 0.2,
    };

    // Procedural ambient texture: a soft warm gradient with light/dark blobs,
    // tinted from the app's own CSS custom properties (--lg-a/b/c, --brand).
    // Replaces html2canvas: no DOM cloning, no stale pixels, works offline.
    var TEX = 512;
    var snap = document.createElement("canvas");
    snap.width = TEX;
    snap.height = TEX;

    function paintSnapshot() {
      var ctx = snap.getContext("2d");
      if (!ctx) return false;
      var css = getComputedStyle(document.documentElement);
      function token(name, fallback) {
        var v = (css.getPropertyValue(name) || "").trim();
        return v || fallback;
      }
      var g = ctx.createLinearGradient(0, 0, TEX, TEX);
      g.addColorStop(0, token("--lg-a", "#f2ede3"));
      g.addColorStop(0.55, token("--lg-b", "#e7e0d2"));
      g.addColorStop(1, token("--lg-c", "#d9d2c2"));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, TEX, TEX);
      function blob(x, y, r, color) {
        var rg = ctx.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, color);
        rg.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      var brand = token("--brand", "#4f46e5");
      blob(TEX * 0.22, TEX * 0.28, TEX * 0.38, "rgba(255,255,255,0.55)");
      blob(TEX * 0.78, TEX * 0.22, TEX * 0.3, brand + "33");
      blob(TEX * 0.5, TEX * 0.82, TEX * 0.34, "rgba(0,0,0,0.10)");
      return true;
    }

    try {
      if (!paintSnapshot()) return; // no 2d context → no usable texture
    } catch (e) {
      return;
    }
    Container.pageSnapshot = snap;

    // Theme toggle hook: repaint the texture from the new --lg-* tokens and
    // re-render every instance (the app calls refreshGlassTheme() from
    // applyTheme() once the glass is ready).
    window.refreshGlassTheme = function () {
      if (!Container.pageSnapshot) return;
      try {
        paintSnapshot();
      } catch (e) {
        return;
      }
      for (var i = 0; i < instances.length; i++) {
        try {
          if (instances[i].render) instances[i].render();
        } catch (e) {}
      }
    };

    var MAX = 4;
    var created = 0;
    var instances = [];
    var pendingResize = false;

    // Keep the WebGL backing store at the capped density. The library sizes
    // its canvas to CSS pixels from its own rAF callback, so we re-apply the
    // cap after every layout change (the CSS pins the on-screen size).
    function applyDensity(inst) {
      try {
        var host = inst.element && inst.element.parentNode;
        if (!host) return;
        var r = host.getBoundingClientRect();
        var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        var W = Math.max(1, Math.round((r.width || inst.width) * dpr));
        var H = Math.max(1, Math.round((r.height || inst.height) * dpr));
        if (inst.canvas.width !== W) inst.canvas.width = W;
        if (inst.canvas.height !== H) inst.canvas.height = H;
        inst.canvas.style.width = "100%";
        inst.canvas.style.height = "100%";
        if (inst.gl_refs && inst.gl_refs.gl) inst.gl_refs.gl.viewport(0, 0, W, H);
      } catch (e) {}
    }

    function refresh() {
      for (var i = 0; i < instances.length; i++) {
        try {
          instances[i].updateSizeFromDOM();
        } catch (e) {}
      }
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(function () {
          for (var j = 0; j < instances.length; j++) {
            applyDensity(instances[j]);
            try {
              if (instances[j].render) instances[j].render();
            } catch (e) {}
          }
        });
      }
    }

    function createGlass(el, opts) {
      if (!el || created >= MAX || el.__lgInstance) return null;
      var inst;
      try {
        inst = new Container(opts);
      } catch (e) {
        return null;
      }
      if (!inst || !inst.canvas) return null;
      // Adopt, don't replace: the library's div becomes a pure backdrop layer
      // inside the real surface; the app keeps its own box and listeners.
      el.__lgInstance = inst;
      inst.canvas.style.boxShadow = "none"; // upstream demo shadow — too heavy here
      el.classList.add("lg-host");
      inst.element.className = "lg-layer";
      inst.element.removeAttribute("style");
      try {
        el.insertBefore(inst.element, el.firstChild);
      } catch (e) {
        return null;
      }
      created++;
      instances.push(inst);
      try {
        inst.updateSizeFromDOM();
      } catch (e) {}
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(function () {
          applyDensity(inst);
        });
      }
      return inst;
    }

    function activate() {
      var w = window.innerWidth || 0;
      if (w > 0 && w <= 520) return; // small phones: CSS-only glass
      createGlass(document.querySelector(".auth-card"), { borderRadius: 20, type: "rounded", tintOpacity: 0.2 });
      createGlass(document.querySelector("header"), { borderRadius: 0, type: "rounded", tintOpacity: 0.16 });
      createGlass(document.getElementById("chatFab"), { borderRadius: 999, type: "circle", tintOpacity: 0.2 });
      createGlass(document.getElementById("toastWrap"), { borderRadius: 12, type: "rounded", tintOpacity: 0.14 });
      if (created > 0) {
        window.__stockpilotGlassReady = true;
        document.documentElement.classList.add("lg-ready");
        if (typeof ResizeObserver === "function") {
          var ro = new ResizeObserver(function () {
            if (pendingResize) return;
            pendingResize = true;
            setTimeout(function () {
              pendingResize = false;
              refresh();
            }, 120);
          });
          for (var i = 0; i < instances.length; i++) {
            try {
              ro.observe(instances[i].element);
            } catch (e) {}
          }
        } else if (typeof window.addEventListener === "function") {
          window.addEventListener("orientationchange", function () {
            setTimeout(refresh, 220);
          });
        }
      }
    }

    if (document.readyState === "complete") setTimeout(activate, 0);
    else window.addEventListener("load", function () { setTimeout(activate, 0); });
  }

  if (document.readyState === "complete") boot();
  else window.addEventListener("load", boot);
})();
