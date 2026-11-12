(function (global) {
  'use strict';

  const Shinobi = (global.Shinobi = global.Shinobi || {});

  class ProjectileSystem {
    constructor(videoLayerEl, handVfx) {
      this.handVfx = handVfx;
      this.projectiles = [];
      this.impacts = [];
      this.videoPool = [];

      for (let i = 0; i < 4; i++) {
        const v = document.createElement('video');
        v.className = 'video-orb';
        v.dataset.slot = `proj-${i}`;
        v.muted = true;
        v.autoplay = true;
        v.loop = true;
        v.playsInline = true;
        v.preload = 'auto';
        videoLayerEl.appendChild(v);
        this.videoPool.push({ el: v, url: '', busy: false });
      }
    }

    _acquireVideoSlot() {
      return this.videoPool.find((v) => !v.busy) || null;
    }

    _releaseVideoSlot(slot) {
      if (!slot) return;
      slot.busy = false;
      slot.el.style.opacity = '0';
    }

    launch(opts) {
      // Cap active projectiles so the stage stays fast and clean
      if (this.projectiles.length >= 6) {
        const oldest = this.projectiles.shift();
        this._releaseVideoSlot(oldest.videoSlot);
      }

      const jutsuId = opts.jutsuId || 'rasengan';
      const def = Shinobi.JUTSU[jutsuId] || Shinobi.JUTSU.rasengan;
      const startX = opts.x;
      const startY = opts.y;
      const hasTarget = typeof opts.targetX === 'number' && typeof opts.targetY === 'number';
      const guided = Boolean(opts.guided) && !hasTarget;

      let vx = opts.vx || 0;
      let vy = opts.vy || 0;
      let distToTarget = Infinity;

      if (hasTarget) {
        const dx = opts.targetX - startX;
        const dy = opts.targetY - startY;
        distToTarget = Math.max(20, Math.hypot(dx, dy));
        const speed = Math.max(980, distToTarget * 2.1);
        vx = (dx / distToTarget) * speed;
        vy = (dy / distToTarget) * speed;
      } else {
        const mag = Math.hypot(vx, vy);
        const dirX = mag > 1e-4 ? vx / mag : 0.85;
        const dirY = mag > 1e-4 ? vy / mag : -0.35;
        const dirMag = Math.hypot(dirX, dirY) || 1;
        const speed = guided
          ? Math.max(780, Math.min(1320, mag || 860))
          : Math.max(920, Math.min(1650, mag || 980));
        vx = (dirX / dirMag) * speed;
        vy = (dirY / dirMag) * speed;
      }

      const url = this.handVfx ? this.handVfx.getVideoUrl(jutsuId) : '';
      let videoSlot = null;
      if (url) {
        videoSlot = this._acquireVideoSlot();
        if (videoSlot) {
          videoSlot.busy = true;
          if (videoSlot.url !== url) {
            videoSlot.url = url;
            videoSlot.el.src = url;
            videoSlot.el.load();
          }
          if (url === 'assets/rasengan.mp4') {
            videoSlot.el.currentTime = jutsuId === 'rasenshuriken' ? 4.2 : 0.4;
          } else {
            videoSlot.el.currentTime = 0;
          }
          videoSlot.el.play().catch(() => {});
        }
      }

      this.projectiles.push({
        jutsuId,
        color: def.color || '#4ae8ff',
        scaleFactor: def.scaleFactor || 6.5,
        x: startX,
        y: startY,
        vx,
        vy,
        size: opts.size || 80,
        targetX: opts.targetX,
        targetY: opts.targetY,
        hasTarget,
        guided,
        traveled: 0,
        distToTarget,
        life: 0,
        age: 0,
        maxLife: guided ? 5.5 : 1.4,
        guiderPt: null,
        guiderTimer: 0,
        videoSlot,
        videoUrl: url
      });
    }

    hasGuided() {
      return this.projectiles.some((p) => p.guided && !p.hasTarget);
    }

    steerGuided(dirX, dirY, handPt, dt) {
      const len = Math.hypot(dirX, dirY);
      if (len < 1e-4) return 0;
      const nx = dirX / len;
      const ny = dirY / len;
      const stepDt = dt && dt > 0 ? Math.min(0.08, dt) : 0.016;
      const turn = Math.min(1, Math.max(0.06, stepDt * 8.5));

      let steered = 0;
      for (const p of this.projectiles) {
        if (!p.guided || p.hasTarget) continue;
        const curMag = Math.hypot(p.vx, p.vy) || 840;
        const curNx = p.vx / curMag;
        const curNy = p.vy / curMag;

        let bx = curNx + (nx - curNx) * turn;
        let by = curNy + (ny - curNy) * turn;
        let bMag = Math.hypot(bx, by);
        if (bMag < 1e-3) {
          // Break 180-degree reversal symmetry smoothly
          bx = -curNy;
          by = curNx;
          bMag = 1;
        }
        const targetSpeed = Math.max(760, Math.min(1080, curMag * 0.65 + 860 * 0.35));
        p.vx = (bx / bMag) * targetSpeed;
        p.vy = (by / bMag) * targetSpeed;

        // Extend flight grace gently while user is actively steering
        if (p.life > p.maxLife - 1.5 && p.age < 9.5) {
          p.life = Math.max(0, p.life - stepDt * 0.8);
        }
        if (handPt) {
          p.guiderPt = { x: handPt.x, y: handPt.y };
          p.guiderTimer = 0.18;
        }
        steered++;
      }
      return steered;
    }

    redirectAll(targetX, targetY) {
      let count = 0;
      for (const p of this.projectiles) {
        const dx = targetX - p.x;
        const dy = targetY - p.y;
        const dist = Math.max(20, Math.hypot(dx, dy));
        const speed = Math.max(980, dist * 2.1);
        p.vx = (dx / dist) * speed;
        p.vy = (dy / dist) * speed;
        p.targetX = targetX;
        p.targetY = targetY;
        p.hasTarget = true;
        p.guided = false;
        p.traveled = 0;
        p.distToTarget = dist;
        p.life = 0;
        p.maxLife = 1.6;
        p.guiderPt = null;
        p.guiderTimer = 0;
        count++;
      }
      return count;
    }

    detonateGuided(particles, audio) {
      let count = 0;
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];
        if (!p.guided) continue;
        this._detonate(p, particles, audio);
        this.projectiles.splice(i, 1);
        count++;
      }
      return count;
    }

    _detonate(p, particles, audio) {
      this._releaseVideoSlot(p.videoSlot);
      this.impacts.push({
        x: p.x,
        y: p.y,
        color: p.color,
        radius: Math.max(80, p.size * 1.9),
        life: 0,
        maxLife: 0.45
      });

      const burstKind = p.jutsuId === 'amaterasu' ? 'blackflame' : 'glow';
      const count = p.jutsuId === 'odama_rasengan' || p.jutsuId === 'bijudama' ? 36 : 24;
      for (let i = 0; i < count; i++) {
        const a = (Math.PI * 2 * i) / count + Math.random() * 0.3;
        const sp = 140 + Math.random() * 420;
        particles.spawn({
          x: p.x,
          y: p.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          size: 5 + Math.random() * 7,
          grow: -3,
          maxLife: 0.35 + Math.random() * 0.3,
          color: p.color,
          coreColor: '#ffffff',
          kind: burstKind
        });
      }

      if (p.jutsuId === 'rasenshuriken' || p.jutsuId === 'odama_rasengan') {
        particles.spawnSmokeBurst(p.x, p.y, p.size * 1.15, 12);
      }

      if (audio) audio.playBurst('jutsu_impact');
    }

    updateAndDraw(ctx, rect, particles, audio, dt, timeSec) {
      const W = rect.viewW;
      const H = rect.viewH;

      // Update flying projectiles
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];
        p.life += dt;
        p.age = (p.age || 0) + dt;
        const stepX = p.vx * dt;
        const stepY = p.vy * dt;
        p.x += stepX;
        p.y += stepY;
        p.traveled += Math.hypot(stepX, stepY);

        let hitEdge = false;
        if (!p.hasTarget) {
          if (p.guided) {
            const margin = Math.min(Math.max(46, p.size * 0.65), Math.min(W, H) * 0.25);
            if (p.x < margin) {
              p.x = margin;
              if (p.vx < 0) p.vx = -p.vx * 0.72;
            } else if (p.x > W - margin) {
              p.x = W - margin;
              if (p.vx > 0) p.vx = -p.vx * 0.72;
            }
            if (p.y < margin) {
              p.y = margin;
              if (p.vy < 0) p.vy = -p.vy * 0.72;
            } else if (p.y > H - margin) {
              p.y = H - margin;
              if (p.vy > 0) p.vy = -p.vy * 0.72;
            }
          } else {
            hitEdge = p.x < 24 || p.x > W - 24 || p.y < 24 || p.y > H - 24;
          }
        }

        const hitTarget = p.hasTarget && p.traveled >= p.distToTarget;
        const expired = p.life >= p.maxLife || p.age >= 10.0;

        if (hitTarget || hitEdge || expired) {
          if (hitTarget) {
            p.x = p.targetX;
            p.y = p.targetY;
          }
          this._detonate(p, particles, audio);
          this.projectiles.splice(i, 1);
          continue;
        }

        // Keep video sub-loop tidy
        if (p.videoSlot) {
          const v = p.videoSlot.el;
          if (p.videoUrl === 'assets/rasengan.mp4') {
            if (p.jutsuId === 'rasenshuriken' && (v.currentTime < 3.8 || v.currentTime > 6.05)) {
              v.currentTime = 3.9;
            } else if (p.jutsuId !== 'rasenshuriken' && (v.currentTime < 0.15 || v.currentTime > 2.75)) {
              v.currentTime = 0.2;
            }
          }
          const width = Math.max(110, p.size * p.scaleFactor);
          v.style.left = `${p.x.toFixed(1)}px`;
          v.style.top = `${p.y.toFixed(1)}px`;
          v.style.width = `${width.toFixed(1)}px`;
          v.style.opacity = '1';
        }

        // Draw motion streak + outer energy core
        const ang = Math.atan2(p.vy, p.vx);
        const r = Math.max(28, p.size * (p.jutsuId === 'odama_rasengan' ? 1.35 : 0.92));

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // Chakra control tether from guiding hand/finger to flying jutsu
        if (p.guiderPt && p.guiderTimer > 0) {
          const gx = p.guiderPt.x;
          const gy = p.guiderPt.y;
          const tetherFade = Math.min(1, p.guiderTimer / 0.14);
          const tetherGrad = ctx.createLinearGradient(gx, gy, p.x, p.y);
          tetherGrad.addColorStop(0, '#ffffff');
          tetherGrad.addColorStop(0.35, p.color);
          tetherGrad.addColorStop(1, p.color);

          ctx.save();
          ctx.globalAlpha = 0.42 * tetherFade;
          ctx.strokeStyle = tetherGrad;
          ctx.lineWidth = 2.4;
          ctx.setLineDash([8, 6]);
          ctx.lineDashOffset = -timeSec * 120;
          ctx.shadowBlur = 14;
          ctx.shadowColor = p.color;
          ctx.beginPath();
          ctx.moveTo(gx, gy);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();

          ctx.setLineDash([]);
          ctx.globalAlpha = 0.65 * tetherFade;
          ctx.beginPath();
          ctx.arc(gx, gy, 10 + Math.sin(timeSec * 18) * 2.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();

          p.guiderTimer -= dt;
          if (p.guiderTimer <= 0) {
            p.guiderPt = null;
          }
        }

        // Speed comet tail
        const tailLen = r * 2.8;
        const tx = p.x - Math.cos(ang) * tailLen;
        const ty = p.y - Math.sin(ang) * tailLen;
        const grad = ctx.createLinearGradient(p.x, p.y, tx, ty);
        grad.addColorStop(0, p.color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = r * 0.72;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.52;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();

        // Outer halo / fallback core if no video slot
        if (!p.videoSlot) {
          ctx.globalAlpha = 0.95;
          const orbGrad = ctx.createRadialGradient(p.x, p.y, r * 0.08, p.x, p.y, r);
          orbGrad.addColorStop(0, '#ffffff');
          orbGrad.addColorStop(0.4, p.color);
          orbGrad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = p.jutsuId === 'bijudama' || p.jutsuId === 'amaterasu' ? '#0a0412' : orbGrad;
          ctx.shadowBlur = 24;
          ctx.shadowColor = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        }

        // Spinning shock rings around projectile
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.translate(p.x, p.y);
        ctx.rotate(timeSec * 14);
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.05, r * 0.42, 0, 0.2, Math.PI * 1.5);
        ctx.stroke();
        ctx.restore();

        // Trailing particles
        if (Math.random() < 0.9) {
          particles.spawn({
            x: p.x + (Math.random() - 0.5) * r * 0.6,
            y: p.y + (Math.random() - 0.5) * r * 0.6,
            vx: -p.vx * 0.14 + (Math.random() - 0.5) * 90,
            vy: -p.vy * 0.14 + (Math.random() - 0.5) * 90,
            size: 4 + Math.random() * 5,
            maxLife: 0.3,
            color: p.color,
            coreColor: '#ffffff',
            kind: p.jutsuId === 'amaterasu' ? 'blackflame' : 'glow'
          });
        }
      }

      // Update impact shockwaves
      for (let i = this.impacts.length - 1; i >= 0; i--) {
        const imp = this.impacts[i];
        imp.life += dt;
        if (imp.life >= imp.maxLife) {
          this.impacts.splice(i, 1);
          continue;
        }
        const t = imp.life / imp.maxLife;
        const fade = 1 - t;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = fade;
        ctx.shadowBlur = 24;
        ctx.shadowColor = imp.color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4 * fade;
        ctx.beginPath();
        ctx.arc(imp.x, imp.y, imp.radius * (0.25 + t * 0.95), 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = imp.color;
        ctx.lineWidth = 6 * fade;
        ctx.beginPath();
        ctx.arc(imp.x, imp.y, imp.radius * (0.15 + t * 1.25), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  Shinobi.vfx = Shinobi.vfx || {};
  Shinobi.vfx.ProjectileSystem = ProjectileSystem;
})(window);
