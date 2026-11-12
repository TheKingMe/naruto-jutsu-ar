(function (global) {
  'use strict';

  const Shinobi = (global.Shinobi = global.Shinobi || {});

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  function dist2D(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function getCoverRect(videoW, videoH, viewW, viewH) {
    const vw = videoW || 1280;
    const vh = videoH || 720;
    const scale = Math.max(viewW / vw, viewH / vh);
    const rw = vw * scale;
    const rh = vh * scale;
    return {
      vw,
      vh,
      viewW,
      viewH,
      rw,
      rh,
      ox: (viewW - rw) * 0.5,
      oy: (viewH - rh) * 0.5
    };
  }

  // Maps normalized MediaPipe coordinates (0..1 unmirrored) into mirrored screen pixels.
  function normToScreen(nx, ny, rect) {
    return {
      x: rect.ox + (1 - nx) * rect.rw,
      y: rect.oy + ny * rect.rh
    };
  }

  function normDistToPixels(normDist, rect) {
    return normDist * Math.hypot(rect.rw, rect.rh) * 0.7071;
  }

  function syncCanvasSize(canvas, viewW, viewH) {
    const maxDpr = Shinobi.CONFIG?.RENDER_MAX_DPR || 1;
    const dpr = Math.min(global.devicePixelRatio || 1, maxDpr);
    const targetW = Math.round(viewW * dpr);
    const targetH = Math.round(viewH * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  Shinobi.coords = {
    lerp,
    clamp,
    dist2D,
    getCoverRect,
    normToScreen,
    normDistToPixels,
    syncCanvasSize
  };
})(window);
