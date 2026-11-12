(function (global) {
  'use strict';

  const Shinobi = (global.Shinobi = global.Shinobi || {});

  class HandVfxRenderer {
    constructor(videoLayerEl) {
      this.videoLayerEl = videoLayerEl;
      this.videoSources = { ...Shinobi.CONFIG.DEFAULT_VIDEOS };
      this.brokenSources = new Set();

      this.videoSlots = {
        0: this._makeVideoEl('0'),
        1: this._makeVideoEl('1'),
        combo: this._makeVideoEl('combo')
      };

      this.slotState = {
        0: { charge: 0, activeId: null, x: 0, y: 0, size: 120, initialized: false, throwCooldownUntil: 0 },
        1: { charge: 0, activeId: null, x: 0, y: 0, size: 120, initialized: false, throwCooldownUntil: 0 },
        combo: { charge: 0, activeId: null, x: 0, y: 0, size: 180, initialized: false, throwCooldownUntil: 0 }
      };

      this.summonBursts = [];
    }

    dischargeSlot(slotKey, durationMs = 520) {
      const st = this.slotState[slotKey];
      if (!st) return;
      st.charge = 0;
      st.activeId = null;
      st.initialized = false;
      st.throwCooldownUntil = performance.now() + durationMs;
      const vid = this.videoSlots[slotKey];
      if (vid) vid.el.style.opacity = '0';
    }

    getLaunchCandidate() {
      for (const key of ['combo', 0, 1]) {
        const st = this.slotState[key];
        if (st.activeId && st.charge > 0.25) {
          return { slotKey: key, jutsuId: st.activeId, x: st.x, y: st.y, size: st.size };
        }
      }
      return null;
    }

    _makeVideoEl(tag) {
      const v = document.createElement('video');
      v.className = 'video-orb';
      v.dataset.slot = tag;
      v.muted = true;
      v.autoplay = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.addEventListener('error', () => {
        if (v.dataset.sourceUrl) {
          this.brokenSources.add(v.dataset.sourceUrl);
        }
      });
      this.videoLayerEl.appendChild(v);
      return { el: v, url: '' };
    }

    setCustomVideo(jutsuId, url) {
      this.brokenSources.delete(url);
      this.videoSources[jutsuId] = url;
    }

    getVideoUrl(jutsuId) {
      const url = this.videoSources[jutsuId];
      if (!url || this.brokenSources.has(url)) return '';
      return url;
    }

    triggerSummon(normPos) {
      this.summonBursts.push({
        normPos,
        life: 0,
        maxLife: 2.6,
        smokeDone: false
      });
    }

    _syncVideoSlot(slotKey, jutsuId, x, y, sizePx, charge) {
      const slot = this.videoSlots[slotKey];
      const url = jutsuId ? this.getVideoUrl(jutsuId) : '';
      const st = this.slotState[slotKey];

      if (!url || charge <= 0.01) {
        slot.el.style.opacity = '0';
        return false;
      }

      if (slot.url !== url) {
        slot.url = url;
        slot.el.dataset.sourceUrl = url;
        slot.el.src = url;
        slot.el.load();
      }

      if (st.activeId !== jutsuId || slot.el.paused) {
        if (st.activeId !== jutsuId) {
          if (url === 'assets/rasengan.mp4') {
            slot.el.currentTime = jutsuId === 'rasenshuriken' ? 4.0 : 0.25;
          } else {
            slot.el.currentTime = 0;
          }
        }
        slot.el.play().catch(() => {});
      }

      // Loop only the matching phase of built-in rasengan.mp4
      if (url === 'assets/rasengan.mp4') {
        if (jutsuId === 'rasenshuriken') {
          if (slot.el.currentTime < 3.8 || slot.el.currentTime > 6.05) {
            slot.el.currentTime = 3.9;
          }
        } else if (slot.el.currentTime < 0.15 || slot.el.currentTime > 2.75) {
          slot.el.currentTime = 0.25;
        }
      }

      const def = Shinobi.JUTSU[jutsuId] || {};
      const width = Math.max(90, sizePx * (def.scaleFactor || 2.8));
      slot.el.style.left = `${x.toFixed(1)}px`;
      slot.el.style.top = `${y.toFixed(1)}px`;
      slot.el.style.width = `${width.toFixed(1)}px`;
      slot.el.style.opacity = charge.toFixed(3);
      return true;
    }

    _drawProceduralRasengan(ctx, x, y, r, charge, timeSec, isOdama, hasVideo) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = charge * (hasVideo ? 0.45 : 0.95);

      if (!hasVideo) {
        const grad = ctx.createRadialGradient(x, y, r * 0.05, x, y, r);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.35, '#8af4ff');
        grad.addColorStop(0.75, 'rgba(30, 155, 255, 0.55)');
        grad.addColorStop(1, 'rgba(0, 80, 255, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Swirling chakra rings
      ctx.strokeStyle = isOdama ? '#aaf7ff' : '#66ecff';
      ctx.shadowBlur = isOdama ? 28 : 16;
      ctx.shadowColor = '#1ca8ff';
      for (let i = 0; i < (isOdama ? 4 : 3); i++) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(timeSec * (5.2 + i * 1.3) * (i % 2 === 0 ? 1 : -1));
        ctx.lineWidth = (isOdama ? 3 : 2) * charge;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * (0.55 + i * 0.14), r * (0.28 + i * 0.09), i * 0.9, 0.2, Math.PI * 1.45);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    _drawRasenshuriken(ctx, x, y, r, charge, timeSec, particles, hasVideo) {
      // Inner core
      this._drawProceduralRasengan(ctx, x, y, r * 0.58, charge, timeSec, false, hasVideo);

      // 4 razor-sharp curved shuriken blades
      const bladeR = r * 1.55;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(timeSec * 15);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.9 * charge;
      ctx.shadowBlur = 24;
      ctx.shadowColor = '#5ce6ff';

      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI * 0.5);
        const grad = ctx.createLinearGradient(0, 0, bladeR, 0);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        grad.addColorStop(0.45, 'rgba(130, 244, 255, 0.85)');
        grad.addColorStop(1, 'rgba(60, 190, 255, 0)');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(r * 0.22, -r * 0.08);
        ctx.quadraticCurveTo(bladeR * 0.58, -r * 0.52, bladeR, r * 0.12);
        ctx.quadraticCurveTo(bladeR * 0.55, r * 0.16, r * 0.22, r * 0.12);
        ctx.closePath();
        ctx.fill();
      }

      // Outer wind shock ring
      ctx.strokeStyle = 'rgba(215, 252, 255, 0.65)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, bladeR * 0.92, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      if (Math.random() < 0.75 * charge) {
        const a = Math.random() * Math.PI * 2;
        particles.spawn({
          x: x + Math.cos(a) * bladeR * 0.6,
          y: y + Math.sin(a) * bladeR * 0.6,
          vx: Math.cos(a + 1.2) * 180,
          vy: Math.sin(a + 1.2) * 180,
          size: 4 + Math.random() * 4,
          maxLife: 0.32,
          color: '#9cf5ff',
          coreColor: '#ffffff'
        });
      }
    }

    _drawChidori(ctx, x, y, r, charge, hand, rect, particles, hasVideo) {
      const { drawLightningBolt } = Shinobi.vfx;
      const { normToScreen } = Shinobi.coords;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = charge;

      if (!hasVideo) {
        const grad = ctx.createRadialGradient(x, y, 2, x, y, r * 0.9);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.35, '#8fe2ff');
        grad.addColorStop(0.75, 'rgba(38, 148, 255, 0.45)');
        grad.addColorStop(1, 'rgba(0, 60, 255, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }

      // Crackling arcs toward fingertips and random air targets
      const tips = hand ? [4, 8, 12, 16, 20].map((idx) => normToScreen(hand.lm[idx].x, hand.lm[idx].y, rect)) : [];
      const arcCount = 7;
      for (let i = 0; i < arcCount; i++) {
        let tx;
        let ty;
        if (i < tips.length && Math.random() < 0.75) {
          tx = tips[i].x + (Math.random() - 0.5) * 26;
          ty = tips[i].y + (Math.random() - 0.5) * 26;
        } else {
          const ang = Math.random() * Math.PI * 2;
          const dist = r * (0.85 + Math.random() * 0.95);
          tx = x + Math.cos(ang) * dist;
          ty = y + Math.sin(ang) * dist;
        }
        drawLightningBolt(ctx, x, y, tx, ty, '#7ae4ff', '#1a8cff', 2.2 * charge, 3);
      }
      ctx.restore();

      if (Math.random() < 0.65 * charge) {
        const a = Math.random() * Math.PI * 2;
        particles.spawn({
          x,
          y,
          vx: Math.cos(a) * (150 + Math.random() * 140),
          vy: Math.sin(a) * (150 + Math.random() * 140),
          size: 3.5,
          maxLife: 0.22,
          color: '#78e3ff',
          coreColor: '#ffffff'
        });
      }
    }

    _drawFireball(ctx, x, y, r, charge, timeSec, particles, hasVideo) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = charge * (hasVideo ? 0.45 : 0.95);

      if (!hasVideo) {
        const pulse = 1 + Math.sin(timeSec * 16) * 0.08;
        const grad = ctx.createRadialGradient(x, y, r * 0.08, x, y, r * 1.1 * pulse);
        grad.addColorStop(0, '#fff7c2');
        grad.addColorStop(0.35, '#ff9d2b');
        grad.addColorStop(0.7, 'rgba(255, 52, 12, 0.7)');
        grad.addColorStop(1, 'rgba(180, 10, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.1 * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Continuous rising flame plume & embers
      for (let i = 0; i < 2; i++) {
        if (Math.random() < 0.85 * charge) {
          particles.spawn({
            x: x + (Math.random() - 0.5) * r * 0.55,
            y: y + (Math.random() - 0.5) * r * 0.35,
            vx: (Math.random() - 0.5) * 90,
            vy: -130 - Math.random() * 160,
            size: r * (0.24 + Math.random() * 0.2),
            grow: -r * 0.25,
            maxLife: 0.42 + Math.random() * 0.28,
            color: Math.random() < 0.4 ? '#ffd24d' : '#ff5514',
            coreColor: '#ffae42',
            alpha: 0.85 * charge
          });
        }
      }
    }

    _drawAmaterasu(ctx, x, y, r, charge, timeSec, particles, hasVideo) {
      if (!hasVideo) {
        ctx.save();
        ctx.globalAlpha = charge * 0.9;
        ctx.shadowBlur = 26;
        ctx.shadowColor = '#a81fff';
        const grad = ctx.createRadialGradient(x, y, r * 0.1, x, y, r * 0.85);
        grad.addColorStop(0, '#040206');
        grad.addColorStop(0.65, '#12031c');
        grad.addColorStop(1, 'rgba(140, 20, 220, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      for (let i = 0; i < 2; i++) {
        if (Math.random() < 0.9 * charge) {
          particles.spawn({
            x: x + (Math.random() - 0.5) * r * 0.8,
            y: y + (Math.random() - 0.5) * r * 0.3,
            vx: (Math.random() - 0.5) * 45,
            vy: -110 - Math.random() * 130,
            size: r * (0.18 + Math.random() * 0.18),
            grow: -r * 0.14,
            maxLife: 0.55 + Math.random() * 0.35,
            color: Math.random() < 0.5 ? '#b324ff' : '#ff2957',
            alpha: 0.92 * charge,
            kind: 'blackflame'
          });
        }
      }
    }

    _drawBijudama(ctx, x, y, r, charge, timeSec, particles, hasVideo) {
      ctx.save();
      ctx.globalAlpha = charge;
      if (!hasVideo) {
        ctx.shadowBlur = 32;
        ctx.shadowColor = '#a12bff';
        const grad = ctx.createRadialGradient(x - r * 0.15, y - r * 0.15, r * 0.08, x, y, r);
        grad.addColorStop(0, '#1e0b36');
        grad.addColorStop(0.58, '#05020a');
        grad.addColorStop(0.86, '#6e11c9');
        grad.addColorStop(1, 'rgba(255, 40, 120, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Orbiting dark chakra rings
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = '#d15cff';
      ctx.lineWidth = 2.4;
      for (let i = 0; i < 2; i++) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(timeSec * (i === 0 ? 4.5 : -6.2));
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.12, r * 0.42, i * 1.1, 0, Math.PI * 1.6);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();

      // Inward condensing chakra beads
      if (Math.random() < 0.85 * charge) {
        const a = Math.random() * Math.PI * 2;
        const spawnR = r * 2.1;
        particles.spawn({
          x: x + Math.cos(a) * spawnR,
          y: y + Math.sin(a) * spawnR,
          vx: -Math.cos(a) * 230,
          vy: -Math.sin(a) * 230,
          size: 5,
          maxLife: 0.34,
          color: Math.random() < 0.5 ? '#c44dff' : '#ff3c78',
          coreColor: '#ffffff'
        });
      }
    }

    drawSummonSeals(ctx, rect, dt, particles) {
      for (let i = this.summonBursts.length - 1; i >= 0; i--) {
        const b = this.summonBursts[i];
        b.life += dt;
        if (b.life >= b.maxLife) {
          this.summonBursts.splice(i, 1);
          continue;
        }

        const p = Shinobi.coords.normToScreen(b.normPos.x, b.normPos.y, rect);
        if (!b.smokeDone) {
          b.smokeDone = true;
          particles.spawnSmokeBurst(p.x, p.y, Math.min(rect.viewW, rect.viewH) * 0.16, 22);
        }

        const t = b.life / b.maxLife;
        const expand = Math.min(1, t * 5.2);
        const fade = t > 0.72 ? (1 - t) / 0.28 : 1;
        const radius = Math.min(rect.viewW, rect.viewH) * 0.28 * expand;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(1, 0.46); // Perspective ground plane tilt
        ctx.globalAlpha = 0.9 * fade;
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ff4b4b';
        ctx.strokeStyle = '#ffd5d5';
        ctx.lineWidth = 3;

        // Outer seal rings
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.84, 0, Math.PI * 2);
        ctx.stroke();

        // Rotating hexagram / seal spokes
        ctx.save();
        ctx.rotate(b.life * 1.4);
        for (let s = 0; s < 2; s++) {
          ctx.rotate(Math.PI / 6);
          ctx.beginPath();
          for (let k = 0; k <= 3; k++) {
            const ang = (k * Math.PI * 2) / 3;
            const px = Math.cos(ang) * radius * 0.82;
            const py = Math.sin(ang) * radius * 0.82;
            k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
        ctx.restore();

        // Seal rune ticks
        ctx.save();
        ctx.rotate(-b.life * 0.9);
        for (let m = 0; m < 12; m++) {
          const ang = (m * Math.PI * 2) / 12;
          ctx.beginPath();
          ctx.moveTo(Math.cos(ang) * radius * 0.87, Math.sin(ang) * radius * 0.87);
          ctx.lineTo(Math.cos(ang) * radius * 0.97, Math.sin(ang) * radius * 0.97);
          ctx.stroke();
        }
        ctx.restore();

        ctx.restore();
      }
    }

    drawSkeleton(ctx, hands, rect) {
      ctx.clearRect(0, 0, rect.viewW, rect.viewH);
      if (!hands || !hands.length) return;

      const { PALETTES } = Shinobi.CONFIG;
      const { normToScreen } = Shinobi.coords;
      const connections = global.HAND_CONNECTIONS || [];

      for (const h of hands) {
        const colors = PALETTES[h.label] || PALETTES.Left;
        const pts = h.lm.map((pt) => normToScreen(pt.x, pt.y, rect));

        ctx.save();
        ctx.shadowBlur = 16;
        ctx.shadowColor = colors.glow;
        ctx.strokeStyle = colors.bone;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        for (const [a, b] of connections) {
          ctx.beginPath();
          ctx.moveTo(pts[a].x, pts[a].y);
          ctx.lineTo(pts[b].x, pts[b].y);
          ctx.stroke();
        }

        ctx.shadowBlur = 10;
        ctx.fillStyle = colors.joint;
        for (const pt of pts) {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    render(frontCtx, backCtx, gestureData, faceInfo, rect, particles, audio, dt, timeSec) {
      const { normToScreen, normDistToPixels, lerp } = Shinobi.coords;
      const { TIMING } = Shinobi.CONFIG;

      // Summoning seal renders on back canvas
      backCtx.clearRect(0, 0, rect.viewW, rect.viewH);
      this.drawSummonSeals(backCtx, rect, dt, particles);

      const seenSlots = new Set();
      const combo = gestureData.combo;
      const isTwoHandOrb = combo && (combo.type === 'ODAMA_MERGE' || combo.type === 'BIJUDAMA_CUP');

      const nowMs = performance.now();
      const smoothT = 1 - Math.pow(1 - TIMING.SMOOTHING, Math.min(2.5, dt * 60));

      if (isTwoHandOrb && nowMs >= this.slotState.combo.throwCooldownUntil) {
        const jutsuId = combo.type === 'ODAMA_MERGE' ? 'odama_rasengan' : 'bijudama';
        const st = this.slotState.combo;
        const def = Shinobi.JUTSU[jutsuId];
        const target = normToScreen(combo.center.x, combo.center.y, rect);
        const targetSize = Math.max(85, normDistToPixels(combo.size, rect));
        const liftPx = targetSize * (def.liftFactor || 0);

        if (!st.initialized) {
          st.x = target.x;
          st.y = target.y - liftPx;
          st.size = targetSize;
          st.initialized = true;
        } else {
          st.x = lerp(st.x, target.x, smoothT);
          st.y = lerp(st.y, target.y - liftPx, smoothT);
          st.size = lerp(st.size, targetSize, smoothT);
        }

        st.activeId = jutsuId;
        st.charge = Math.min(1, st.charge + TIMING.CHARGE_RATE * Math.min(2.5, dt * 60));
        seenSlots.add('combo');

        const hasVid = this._syncVideoSlot('combo', jutsuId, st.x, st.y, st.size, st.charge);
        if (jutsuId === 'odama_rasengan') {
          this._drawProceduralRasengan(frontCtx, st.x, st.y, st.size * 1.45, st.charge, timeSec, true, hasVid);
        } else {
          this._drawBijudama(frontCtx, st.x, st.y, st.size * 1.05, st.charge, timeSec, particles, hasVid);
        }
        audio.setContinuous('combo', jutsuId, st.charge);
      } else if (!isTwoHandOrb) {
        // Individual hand effects triggered strictly by the detected hand sign
        for (const h of gestureData.hands) {
          const jutsuId = h.suppressOrb ? null : h.jutsuId;
          const st = this.slotState[h.slot];
          if (jutsuId && nowMs >= st.throwCooldownUntil) {
            const def = Shinobi.JUTSU[jutsuId] || Shinobi.JUTSU.rasengan;
            const rawSize = Math.max(55, normDistToPixels(h.palmSize, rect));
            const anchorNorm = jutsuId === 'fireball' ? h.lm[8] : h.palmCenter;
            const rawPt = normToScreen(anchorNorm.x, anchorNorm.y, rect);
            const liftPx = rawSize * (def.liftFactor || 1.2);

            if (!st.initialized || st.charge < 0.02) {
              st.x = rawPt.x;
              st.y = rawPt.y - liftPx;
              st.size = rawSize;
              st.initialized = true;
            } else {
              st.x = lerp(st.x, rawPt.x, smoothT);
              st.y = lerp(st.y, rawPt.y - liftPx, smoothT);
              st.size = lerp(st.size, rawSize, smoothT);
            }

            st.activeId = jutsuId;
            st.charge = Math.min(1, st.charge + TIMING.CHARGE_RATE * Math.min(2.5, dt * 60));
            seenSlots.add(h.slot);

            const hasVid = this._syncVideoSlot(h.slot, jutsuId, st.x, st.y, st.size, st.charge);
            this._drawSkillCanvas(frontCtx, jutsuId, st.x, st.y, st.size, st.charge, h, rect, particles, timeSec, hasVid);
            audio.setContinuous(String(h.slot), jutsuId, st.charge);
          }
        }
      }

      // Mouth-triggered Fireball Jutsu
      if (gestureData.mouthFireball && faceInfo) {
        const mc = faceInfo.mouthCenter;
        const r = Math.max(60, faceInfo.faceWidth * 0.55);
        this._drawFireball(frontCtx, mc.x, mc.y + 18, r, 0.95, timeSec, particles, false);
        audio.setContinuous('mouth', 'fireball', 0.85);
      } else {
        audio.setContinuous('mouth', null, 0);
      }

      // Decay unseen slots cleanly (quench residual hand orbs rapidly while forming a hand-based 2-hand/Byakugan sign)
      const isHandTogglePending =
        gestureData.pendingSign &&
        gestureData.pendingSign.id !== 'sharingan' &&
        gestureData.pendingSign.id !== 'mangekyo';
      const quenchMul = isTwoHandOrb || isHandTogglePending ? 3 : 1;
      for (const key of [0, 1, 'combo']) {
        if (seenSlots.has(key)) continue;
        const st = this.slotState[key];
        st.charge = Math.max(0, st.charge - TIMING.DECAY_RATE * quenchMul * Math.min(2.5, dt * 60));
        if (st.charge <= 0.01) {
          st.activeId = null;
          st.initialized = false;
        }
        const hasVid = this._syncVideoSlot(key, st.activeId, st.x, st.y, st.size, st.charge);
        if (st.charge > 0.01 && st.activeId) {
          this._drawSkillCanvas(frontCtx, st.activeId, st.x, st.y, st.size, st.charge, null, rect, particles, timeSec, hasVid);
        }
        audio.setContinuous(String(key), st.activeId, st.charge);
      }
    }

    _drawSkillCanvas(ctx, jutsuId, x, y, size, charge, hand, rect, particles, timeSec, hasVid) {
      switch (jutsuId) {
        case 'rasengan':
          this._drawProceduralRasengan(ctx, x, y, size * 0.95, charge, timeSec, false, hasVid);
          break;
        case 'odama_rasengan':
          this._drawProceduralRasengan(ctx, x, y, size * 1.45, charge, timeSec, true, hasVid);
          break;
        case 'rasenshuriken':
          this._drawRasenshuriken(ctx, x, y, size * 0.95, charge, timeSec, particles, hasVid);
          break;
        case 'chidori':
          this._drawChidori(ctx, x, y, size * 0.95, charge, hand, rect, particles, hasVid);
          break;
        case 'fireball':
          this._drawFireball(ctx, x, y, size * 0.85, charge, timeSec, particles, hasVid);
          break;
        case 'amaterasu':
          this._drawAmaterasu(ctx, x, y, size * 0.88, charge, timeSec, particles, hasVid);
          break;
        case 'bijudama':
          this._drawBijudama(ctx, x, y, size * 0.98, charge, timeSec, particles, hasVid);
          break;
      }
    }
  }

  Shinobi.vfx = Shinobi.vfx || {};
  Shinobi.vfx.HandVfxRenderer = HandVfxRenderer;
})(window);
