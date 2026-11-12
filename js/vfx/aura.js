(function (global) {
  'use strict';

  const Shinobi = (global.Shinobi = global.Shinobi || {});

  class AuraRenderer {
    constructor() {
      this.maskCanvas = document.createElement('canvas');
      this.personCanvas = document.createElement('canvas');
      this.glowCanvas = document.createElement('canvas');
      this.hasMask = false;
      this.cloneProgress = 0;
      this.modeAlpha = 0;
      this.orbsAngle = 0;
    }

    updateMask(maskImage, camVideo, rect) {
      if (!maskImage || !camVideo || !camVideo.videoWidth) return;
      const scale = 0.5;
      const w = Math.max(160, Math.round(rect.viewW * scale));
      const h = Math.max(90, Math.round(rect.viewH * scale));

      for (const c of [this.maskCanvas, this.personCanvas, this.glowCanvas]) {
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
        }
      }

      const ox = rect.ox * scale;
      const oy = rect.oy * scale;
      const rw = rect.rw * scale;
      const rh = rect.rh * scale;

      const mctx = this.maskCanvas.getContext('2d');
      mctx.save();
      mctx.clearRect(0, 0, w, h);
      mctx.filter = 'blur(3px)';
      mctx.translate(w, 0);
      mctx.scale(-1, 1);
      mctx.drawImage(maskImage, ox, oy, rw, rh);
      mctx.restore();

      const pctx = this.personCanvas.getContext('2d');
      pctx.save();
      pctx.clearRect(0, 0, w, h);
      pctx.drawImage(this.maskCanvas, 0, 0);
      pctx.globalCompositeOperation = 'source-in';
      pctx.translate(w, 0);
      pctx.scale(-1, 1);
      pctx.drawImage(camVideo, ox, oy, rw, rh);
      pctx.restore();

      this.hasMask = true;
    }

    _buildColoredSilhouette(colorA, colorB) {
      const w = this.glowCanvas.width;
      const h = this.glowCanvas.height;
      const gctx = this.glowCanvas.getContext('2d');
      gctx.save();
      gctx.clearRect(0, 0, w, h);
      gctx.drawImage(this.maskCanvas, 0, 0);
      gctx.globalCompositeOperation = 'source-in';
      const grad = gctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, colorA);
      grad.addColorStop(1, colorB);
      gctx.fillStyle = grad;
      gctx.fillRect(0, 0, w, h);
      gctx.restore();
    }

    drawTruthSeekingOrbs(ctx, faceInfo, rect, timeSec, alpha) {
      const anchorX = faceInfo
        ? (faceInfo.cheekL.x + faceInfo.cheekR.x) * 0.5
        : rect.viewW * 0.5;
      const anchorY = faceInfo
        ? faceInfo.chin.y + faceInfo.faceHeight * 0.25
        : rect.viewH * 0.52;
      const span = faceInfo ? faceInfo.faceWidth * 1.95 : Math.min(rect.viewW, rect.viewH) * 0.28;
      const orbR = faceInfo ? Math.max(12, faceInfo.faceWidth * 0.14) : 18;

      const count = 6;
      for (let i = 0; i < count; i++) {
        const frac = i / (count - 1);
        const angle = -Math.PI * 0.85 + frac * Math.PI * 0.7 + Math.sin(timeSec * 1.6 + i) * 0.06;
        const bob = Math.sin(timeSec * 2.4 + i * 1.1) * 8;
        const ox = anchorX + Math.cos(angle) * span;
        const oy = anchorY + Math.sin(angle) * span * 0.72 + bob;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 24;
        ctx.shadowColor = 'rgba(255, 224, 110, 0.85)';

        const grad = ctx.createRadialGradient(ox - orbR * 0.25, oy - orbR * 0.25, 1, ox, oy, orbR);
        grad.addColorStop(0, '#2a2238');
        grad.addColorStop(0.65, '#07050c');
        grad.addColorStop(1, '#020205');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ox, oy, orbR, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 232, 138, 0.72)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.restore();
      }
    }

    draw(ctx, camVideo, rect, bodyMode, faceInfo, particles, dt, timeSec) {
      const W = rect.viewW;
      const H = rect.viewH;
      ctx.clearRect(0, 0, W, H);

      const isClones = bodyMode === 'shadow_clones';
      this.cloneProgress += ((isClones ? 1 : 0) - this.cloneProgress) * Math.min(1, dt * 8);

      const hasAuraMode =
        bodyMode === 'kurama_mode' ||
        bodyMode === 'sage_mode' ||
        bodyMode === 'six_paths';
      this.modeAlpha += ((hasAuraMode ? 1 : 0) - this.modeAlpha) * Math.min(1, dt * 6);

      // 1. Chakra Cloak / Aura behind user
      if (this.modeAlpha > 0.02 && this.hasMask) {
        const isSage = bodyMode === 'sage_mode';
        const isSix = bodyMode === 'six_paths';
        const c1 = isSage ? '#4be89a' : isSix ? '#ffd95e' : '#ff5a00';
        const c2 = isSage ? '#ffe169' : isSix ? '#fff7b0' : '#ffcf40';

        this._buildColoredSilhouette(c1, c2);

        const pulse = isSage
          ? 1.022 + Math.sin(timeSec * 3.2) * 0.008
          : 1.035 + Math.sin(timeSec * 8) * 0.014;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (isSage ? 0.36 : 0.58) * this.modeAlpha;
        ctx.shadowBlur = isSage ? 22 : 36;
        ctx.shadowColor = c2;
        const sw = W * pulse;
        const sh = H * pulse;
        ctx.drawImage(this.glowCanvas, (W - sw) * 0.5, (H - sh) * 0.5 - 6, sw, sh);

        // Subtle inner tint over person (minimal for Sage Mode so face pigment stays crisp)
        ctx.globalAlpha = (isSage ? 0.05 : 0.14) * this.modeAlpha;
        ctx.shadowBlur = 0;
        ctx.drawImage(this.glowCanvas, 0, 0, W, H);
        ctx.restore();

        // Sage Mode gathers calm nature-energy motes inward; Kurama/Six Paths emit upward flames
        if (isSage && Math.random() < 0.55) {
          const side = Math.random() < 0.5 ? -1 : 1;
          const sx = W * (0.5 + side * (0.22 + Math.random() * 0.22));
          const sy = H * (0.25 + Math.random() * 0.65);
          particles.spawn({
            x: sx,
            y: sy,
            vx: (W * 0.5 - sx) * 0.75,
            vy: -25 - Math.random() * 35,
            size: 4 + Math.random() * 4,
            grow: -1.5,
            maxLife: 0.85 + Math.random() * 0.4,
            color: Math.random() < 0.5 ? '#ffe36e' : '#6bffb8',
            coreColor: '#ffffff',
            alpha: 0.62 * this.modeAlpha,
            kind: 'glow'
          });
        } else if (!isSage && Math.random() < 0.7) {
          particles.spawn({
            x: W * (0.28 + Math.random() * 0.44),
            y: H * (0.45 + Math.random() * 0.45),
            vx: (Math.random() - 0.5) * 35,
            vy: -70 - Math.random() * 90,
            size: 6 + Math.random() * 7,
            grow: -3,
            maxLife: 0.7 + Math.random() * 0.5,
            color: c2,
            coreColor: '#ffffff',
            alpha: 0.65 * this.modeAlpha,
            kind: 'glow'
          });
        }
      }

      // 2. Six Paths Truth-Seeking Orbs
      if (bodyMode === 'six_paths' && this.modeAlpha > 0.05) {
        this.drawTruthSeekingOrbs(ctx, faceInfo, rect, timeSec, this.modeAlpha);
      }

      // 3. Shadow Clone Jutsu (flanking clones + front person cutout)
      if (this.cloneProgress > 0.02) {
        const slots = [
          { dx: -0.34, dy: 0.04, scale: 0.84, alpha: 0.78 },
          { dx:  0.34, dy: 0.04, scale: 0.84, alpha: 0.78 },
          { dx: -0.18, dy: 0.02, scale: 0.92, alpha: 0.92 },
          { dx:  0.18, dy: 0.02, scale: 0.92, alpha: 0.92 }
        ];

        const srcCanvas = this.hasMask ? this.personCanvas : null;
        for (const s of slots) {
          const cw = W * s.scale;
          const ch = H * s.scale;
          const cx = W * 0.5 + s.dx * W * this.cloneProgress - cw * 0.5;
          const cy = H - ch + H * s.dy;

          ctx.save();
          ctx.globalAlpha = s.alpha * this.cloneProgress;
          if (srcCanvas) {
            ctx.drawImage(srcCanvas, cx, cy, cw, ch);
          } else if (camVideo && camVideo.videoWidth) {
            // Clean fallback when segmentation is disabled
            ctx.globalAlpha = 0.42 * s.alpha * this.cloneProgress;
            ctx.translate(cx + cw, cy);
            ctx.scale(-1, 1);
            ctx.drawImage(camVideo, 0, 0, cw, ch);
          }
          ctx.restore();
        }

        // Re-draw primary user cleanly in front of clones when segmented
        if (srcCanvas) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, this.cloneProgress * 1.2);
          ctx.drawImage(srcCanvas, 0, 0, W, H);
          ctx.restore();
        }
      }
    }
  }

  Shinobi.vfx = Shinobi.vfx || {};
  Shinobi.vfx.AuraRenderer = AuraRenderer;
})(window);
