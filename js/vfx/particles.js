(function (global) {
  'use strict';

  const Shinobi = (global.Shinobi = global.Shinobi || {});

  function drawLightningBolt(ctx, x1, y1, x2, y2, color, glowColor, width, depth = 4) {
    const points = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
    const baseDist = Math.hypot(x2 - x1, y2 - y1);
    let offset = Math.max(6, baseDist * 0.24);

    for (let iter = 0; iter < depth; iter++) {
      const next = [points[0]];
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const mx = (a.x + b.x) * 0.5 + (Math.random() - 0.5) * offset;
        const my = (a.y + b.y) * 0.5 + (Math.random() - 0.5) * offset;
        next.push({ x: mx, y: my }, b);
      }
      points.length = 0;
      points.push(...next);
      offset *= 0.55;
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 18;
    ctx.shadowColor = glowColor;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, width * 0.35);
    ctx.stroke();
    ctx.restore();
  }

  class ParticleSystem {
    constructor(maxParticles = 280) {
      this.maxParticles = maxParticles;
      this.items = [];
    }

    spawn(opts) {
      if (this.items.length >= this.maxParticles) {
        this.items.shift();
      }
      this.items.push({
        x: opts.x,
        y: opts.y,
        vx: opts.vx || 0,
        vy: opts.vy || 0,
        size: opts.size || 6,
        grow: opts.grow || 0,
        life: 0,
        maxLife: opts.maxLife || 0.7,
        color: opts.color || '#62f0ff',
        coreColor: opts.coreColor || null,
        alpha: opts.alpha ?? 0.9,
        kind: opts.kind || 'glow', // 'glow' | 'smoke' | 'spark' | 'blackflame'
        drag: opts.drag ?? 0.96,
        gravity: opts.gravity || 0
      });
    }

    spawnSmokeBurst(cx, cy, radius = 80, count = 16) {
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const speed = (0.35 + Math.random() * 0.85) * radius * 2.2;
        this.spawn({
          x: cx + Math.cos(angle) * radius * 0.2,
          y: cy + Math.sin(angle) * radius * 0.2,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 25,
          size: radius * (0.28 + Math.random() * 0.24),
          grow: radius * 0.75,
          maxLife: 0.45 + Math.random() * 0.35,
          color: '#eef6ff',
          alpha: 0.82,
          kind: 'smoke',
          drag: 0.91
        });
      }
    }

    updateAndDraw(ctx, dt) {
      for (let i = this.items.length - 1; i >= 0; i--) {
        const p = this.items[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
          this.items.splice(i, 1);
          continue;
        }

        const t = p.life / p.maxLife;
        p.vx *= Math.pow(p.drag, dt * 60);
        p.vy = p.vy * Math.pow(p.drag, dt * 60) + p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const size = Math.max(0.5, p.size + p.grow * t);
        const fade = (1 - t) * p.alpha;

        ctx.save();
        if (p.kind === 'smoke') {
          ctx.globalAlpha = fade * (t < 0.18 ? t / 0.18 : 1);
          const grad = ctx.createRadialGradient(p.x, p.y, size * 0.15, p.x, p.y, size);
          grad.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
          grad.addColorStop(0.55, 'rgba(218, 232, 250, 0.55)');
          grad.addColorStop(1, 'rgba(180, 200, 230, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.kind === 'blackflame') {
          ctx.globalAlpha = fade;
          ctx.fillStyle = '#07040b';
          ctx.shadowBlur = 14;
          ctx.shadowColor = p.color;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, size * 0.65, size * 1.35, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = fade;
          ctx.shadowBlur = size * 1.8;
          ctx.shadowColor = p.color;
          ctx.fillStyle = p.coreColor || p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  Shinobi.vfx = Shinobi.vfx || {};
  Shinobi.vfx.ParticleSystem = ParticleSystem;
  Shinobi.vfx.drawLightningBolt = drawLightningBolt;
})(window);
