(function (global) {
  'use strict';

  const Shinobi = (global.Shinobi = global.Shinobi || {});

  const RIGHT_EYE_POLY = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
  const LEFT_EYE_POLY  = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];

  const EYE_DEFS = [
    { poly: RIGHT_EYE_POLY, inner: 133, outer: 33, browInner: 107, browMid: 105, browOuter: 70, temple: 54 },
    { poly: LEFT_EYE_POLY,  inner: 362, outer: 263, browInner: 336, browMid: 334, browOuter: 300, temple: 284 }
  ];

  const IRIS_A = { center: 468, rim: [469, 470, 471, 472] };
  const IRIS_B = { center: 473, rim: [474, 475, 476, 477] };

  const smoothEyeCache = [null, null];

  function extractFaceInfo(landmarks, rect) {
    if (!landmarks || landmarks.length < 468) return null;
    const { normToScreen, dist2D, lerp, clamp } = Shinobi.coords;

    const p = (idx) => normToScreen(landmarks[idx].x, landmarks[idx].y, rect);

    const forehead = p(10);
    const chin = p(152);
    const cheekL = p(234);
    const cheekR = p(454);
    const faceHeight = Math.max(40, dist2D(forehead, chin));
    const faceWidth = Math.max(40, dist2D(cheekL, cheekR));

    const lipTop = p(13);
    const lipBottom = p(14);
    const mouthCornerL = p(78);
    const mouthCornerR = p(308);
    const mouthCenter = {
      x: (lipTop.x + lipBottom.x) * 0.5,
      y: (lipTop.y + lipBottom.y) * 0.5
    };
    const mouthOpenRatio = dist2D(lipTop, lipBottom) / Math.max(10, dist2D(mouthCornerL, mouthCornerR));

    const eyes = [];
    if (landmarks.length >= 478) {
      EYE_DEFS.forEach((def, idx) => {
        const poly = def.poly.map(p);
        const innerCorner = p(def.inner);
        const outerCorner = p(def.outer);
        const midX = (innerCorner.x + outerCorner.x) * 0.5;
        const midY = (innerCorner.y + outerCorner.y) * 0.5;

        const cA = p(IRIS_A.center);
        const cB = p(IRIS_B.center);
        const useA = Math.hypot(cA.x - midX, cA.y - midY) < Math.hypot(cB.x - midX, cB.y - midY);
        const irisDef = useA ? IRIS_A : IRIS_B;
        const rawCenter = useA ? cA : cB;
        const rimPts = irisDef.rim.map(p);
        const rawRadius =
          rimPts.reduce((acc, pt) => acc + Math.hypot(pt.x - rawCenter.x, pt.y - rawCenter.y), 0) /
          rimPts.length;

        const eyeWidth = dist2D(innerCorner, outerCorner);
        // Slightly larger than MediaPipe's inner limbus landmarks so it covers all of the natural center iris
        const clampedR = clamp(rawRadius * 1.15, Math.max(5.5, eyeWidth * 0.17), Math.max(7, eyeWidth * 0.27));
        const prev = smoothEyeCache[idx];

        let center = rawCenter;
        let radius = clampedR;
        if (prev && prev.landmarks === landmarks && Math.hypot(rawCenter.x - prev.rawX, rawCenter.y - prev.rawY) < 1) {
          center = { x: prev.x, y: prev.y };
          radius = prev.r;
        } else if (prev && Math.hypot(rawCenter.x - prev.x, rawCenter.y - prev.y) < faceWidth * 0.25) {
          // Adaptive stabilization: smooth micro-jitter when still, 0-lag instant snap when head moves
          const move = Math.hypot(rawCenter.x - prev.rawX, rawCenter.y - prev.rawY);
          const posAlpha = move < eyeWidth * 0.04
            ? 0.48
            : clamp((move - eyeWidth * 0.04) / (eyeWidth * 0.06), 0.5, 1.0);
          const effectiveAlpha = move >= eyeWidth * 0.09 ? 1.0 : posAlpha;
          center = {
            x: lerp(prev.x, rawCenter.x, effectiveAlpha),
            y: lerp(prev.y, rawCenter.y, effectiveAlpha)
          };
          radius = lerp(prev.r, clampedR, effectiveAlpha >= 0.99 ? 1.0 : 0.65);
        }
        smoothEyeCache[idx] = {
          x: center.x,
          y: center.y,
          r: radius,
          rawX: rawCenter.x,
          rawY: rawCenter.y,
          landmarks
        };
        const eyeOpenRatio =
          (dist2D(poly[11], poly[5]) +
            dist2D(poly[12], poly[4]) +
            dist2D(poly[13], poly[3])) /
          (3 * Math.max(4, eyeWidth));
        const dx = outerCorner.x - innerCorner.x;
        const dy = outerCorner.y - innerCorner.y;
        const eyeLen = Math.hypot(dx, dy) || 1;
        const eyeAngle = Math.atan2(dy, dx);

        const browMid = p(def.browMid);
        const u = { x: dx / eyeLen, y: dy / eyeLen };
        let up = { x: -u.y, y: u.x };
        if (up.x * (browMid.x - center.x) + up.y * (browMid.y - center.y) < 0) {
          up = { x: -up.x, y: -up.y };
        }

        eyes.push({
          side: idx === 0 ? 'right' : 'left',
          poly,
          center,
          radius,
          eyeWidth,
          eyeOpenRatio,
          eyeAngle,
          u,
          up,
          innerCorner,
          outerCorner,
          browInner: p(def.browInner),
          browMid,
          browOuter: p(def.browOuter),
          temple: p(def.temple)
        });
      });
    }

    return {
      forehead,
      chin,
      cheekL,
      cheekR,
      mouthCornerL,
      mouthCornerR,
      faceHeight,
      faceWidth,
      mouthCenter,
      mouthOpenRatio,
      eyes
    };
  }

  function tracePoly(ctx, pts) {
    pts.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.closePath();
  }

  function eyePt(eye, alongU, alongUp) {
    return {
      x: eye.outerCorner.x + eye.u.x * alongU + eye.up.x * alongUp,
      y: eye.outerCorner.y + eye.u.y * alongU + eye.up.y * alongUp
    };
  }

  function drawTomoe(ctx, cx, cy, r, angle) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = '#090204';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.95);
    ctx.quadraticCurveTo(r * 1.72, -r * 0.22, r * 0.45, r * 1.48);
    ctx.quadraticCurveTo(r * 0.72, r * 0.14, -r * 0.28, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Crisp Naruto Toad Sage / Six Paths cel-shaded orange-red eyelid wing marking (Row 4 Col 1 & 2)
  function drawSageEyePigment(ctx, eye, alpha, isSixPaths) {
    const { eyeWidth, poly, innerCorner, u, up } = eye;
    const w = eyeWidth;
    const wingLen = isSixPaths ? w * 0.28 : w * 0.36;
    const wingLift = isSixPaths ? w * 0.14 : w * 0.19;
    const bandUp = isSixPaths ? w * 0.065 : w * 0.092;
    const underBand = isSixPaths ? w * 0.05 : w * 0.08;

    const pInner = {
      x: innerCorner.x + u.x * (w * 0.04) + up.x * (w * 0.025),
      y: innerCorner.y + u.y * (w * 0.04) + up.y * (w * 0.025)
    };
    // Both eyes share index 12 = top center and index 4 = bottom center
    const pTopCtrl = {
      x: poly[12].x + u.x * (w * 0.06) + up.x * bandUp * 1.45,
      y: poly[12].y + u.y * (w * 0.06) + up.y * bandUp * 1.45
    };
    const wingTip = eyePt(eye, wingLen, wingLift);
    const pOuterBack = eyePt(eye, w * 0.12, -underBand * 0.85);
    const pUnderOuter = eyePt(eye, -w * 0.12, -underBand * 1.25);
    const pBotMid = {
      x: poly[4].x - up.x * (underBand * 0.65),
      y: poly[4].y - up.y * (underBand * 0.65)
    };
    const pInnerBot = {
      x: innerCorner.x + u.x * (w * 0.18) - up.x * (w * 0.015),
      y: innerCorner.y + u.y * (w * 0.18) - up.y * (w * 0.015)
    };

    ctx.save();
    ctx.globalAlpha = (isSixPaths ? 0.82 : 0.90) * alpha;
    const grad = ctx.createLinearGradient(pInner.x, pTopCtrl.y, wingTip.x, pOuterBack.y);
    grad.addColorStop(0, isSixPaths ? '#eb5312' : '#d93109');
    grad.addColorStop(0.55, isSixPaths ? '#ff741f' : '#f24c13');
    grad.addColorStop(1, isSixPaths ? '#ffa033' : '#ff7221');
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.moveTo(pInner.x, pInner.y);
    ctx.quadraticCurveTo(pTopCtrl.x, pTopCtrl.y, wingTip.x, wingTip.y);
    ctx.quadraticCurveTo(pOuterBack.x, pOuterBack.y, pUnderOuter.x, pUnderOuter.y);
    ctx.quadraticCurveTo(pBotMid.x, pBotMid.y, pInnerBot.x, pInnerBot.y);
    ctx.quadraticCurveTo(innerCorner.x - u.x * (w * 0.02), innerCorner.y - u.y * (w * 0.02), pInner.x, pInner.y);
    ctx.closePath();

    // Even-odd punch keeps the inner eyeball sclera clean
    tracePoly(ctx, poly);
    ctx.fill('evenodd');
    ctx.restore();
  }

  // Compact forked Byakugan veins hugging close under/beside the outer eye corner (Row 4 Col 4)
  function drawByakuganVeins(ctx, eye, alpha) {
    const { eyeWidth } = eye;
    const w = eyeWidth;

    const specs = [
      { sx: -w * 0.06, sy: -w * 0.13, mx: -w * 0.04, my: -w * 0.24, ex: -w * 0.06, ey: -w * 0.32, fx: 0.02, fy: -0.07 },
      { sx: w * 0.02,  sy: -w * 0.10, mx: w * 0.07,  my: -w * 0.21, ex: w * 0.06,  ey: -w * 0.29, fx: 0.07, fy: -0.06 },
      { sx: w * 0.08,  sy: -w * 0.04, mx: w * 0.17,  my: -w * 0.13, ex: w * 0.21,  ey: -w * 0.22, fx: 0.07, fy: -0.04 },
      { sx: w * 0.10,  sy: w * 0.01,  mx: w * 0.22,  my: w * 0.02,  ex: w * 0.31,  ey: -w * 0.04, fx: 0.06, fy: -0.08 }
    ];

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const s of specs) {
      const p0 = eyePt(eye, s.sx, s.sy);
      const pm = eyePt(eye, s.mx, s.my);
      const p1 = eyePt(eye, s.ex, s.ey);
      const pf = eyePt(eye, s.ex + s.fx * w, s.ey + s.fy * w);

      ctx.globalAlpha = 0.56 * alpha;
      ctx.strokeStyle = 'rgba(116, 94, 146, 0.9)';
      ctx.lineWidth = Math.max(1.1, w * 0.026);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.quadraticCurveTo(pm.x, pm.y, p1.x, p1.y);
      ctx.stroke();

      ctx.globalAlpha = 0.45 * alpha;
      ctx.lineWidth = Math.max(0.9, w * 0.02);
      ctx.beginPath();
      ctx.moveTo(pm.x, pm.y);
      ctx.lineTo(pf.x, pf.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawKuramaWhiskers(ctx, faceInfo) {
    const pairs = [
      [faceInfo.cheekL, faceInfo.mouthCornerL],
      [faceInfo.cheekR, faceInfo.mouthCornerR]
    ];
    ctx.save();
    ctx.globalAlpha = 0.52;
    ctx.strokeStyle = '#6b2304';
    ctx.shadowBlur = 3;
    ctx.shadowColor = '#ff7b1a';
    ctx.lineWidth = Math.max(1.5, faceInfo.faceWidth * 0.011);
    ctx.lineCap = 'round';

    for (const [cheek, mouth] of pairs) {
      const mx = (cheek.x + mouth.x) * 0.5;
      const my = (cheek.y + mouth.y) * 0.5;
      const dx = (cheek.x - mouth.x) * 0.42;
      for (let i = -1; i <= 1; i++) {
        const y = my + i * faceInfo.faceHeight * 0.036;
        ctx.beginPath();
        ctx.moveTo(mx - dx * 0.42, y - i * 3);
        ctx.lineTo(mx + dx * 0.52, y + i * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawDojutsuEyes(ctx, faceInfo, eyeMode, timeSec) {
    if (!faceInfo || !eyeMode || eyeMode === 'none') return;

    if (eyeMode === 'kurama') {
      drawKuramaWhiskers(ctx, faceInfo);
    }

    for (const eye of faceInfo.eyes) {
      if (eye.eyeOpenRatio < 0.09) continue;
      const alpha = Math.min(1, (eye.eyeOpenRatio - 0.09) / 0.11);
      const { center, radius, poly, eyeWidth, eyeAngle } = eye;

      // Skin-level outer eye markings (outside eyelid clip)
      if (eyeMode === 'sage') {
        drawSageEyePigment(ctx, eye, alpha, false);
      } else if (eyeMode === 'six_paths') {
        drawSageEyePigment(ctx, eye, alpha, true);
      } else if (eyeMode === 'byakugan') {
        drawByakuganVeins(ctx, eye, alpha);
      }

      // Clip tightly to open eye contour (sclera + iris)
      ctx.save();
      ctx.beginPath();
      tracePoly(ctx, poly);
      ctx.clip();

      if (eyeMode === 'rinnegan') {
        // Rinnegan covers the entire clipped eyeball space (iris + sclera) with concentric ripple rings
        ctx.globalAlpha = 0.90 * alpha;
        const fullR = eyeWidth * 0.64;
        const grad = ctx.createRadialGradient(center.x, center.y, 1, center.x, center.y, fullR);
        grad.addColorStop(0, '#e3d4ff');
        grad.addColorStop(0.45, '#b697eb');
        grad.addColorStop(1, '#7151b3');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(center.x, center.y, fullR, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(34, 16, 62, 0.72)';
        ctx.lineWidth = Math.max(0.9, radius * 0.078);
        for (const frac of [0.36, 0.68, 1.0, 1.38, 1.80, 2.24]) {
          ctx.beginPath();
          ctx.arc(center.x, center.y, radius * frac, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(26, 10, 48, 0.85)';
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius * 0.14, 0, Math.PI * 2);
        ctx.fill();
      } else if (eyeMode === 'byakugan') {
        // Byakugan covers the entire clipped eyeball space with pearl ice-lavender + soft iris detail
        ctx.globalAlpha = 0.88 * alpha;
        const fullR = eyeWidth * 0.64;
        const scleraGrad = ctx.createRadialGradient(center.x, center.y, 1, center.x, center.y, fullR);
        scleraGrad.addColorStop(0, '#f7f9fe');
        scleraGrad.addColorStop(0.55, '#dfe6f5');
        scleraGrad.addColorStop(1, '#b8c4de');
        ctx.fillStyle = scleraGrad;
        ctx.beginPath();
        ctx.arc(center.x, center.y, fullR, 0, Math.PI * 2);
        ctx.fill();

        const irisGrad = ctx.createRadialGradient(center.x, center.y, 1, center.x, center.y, radius);
        irisGrad.addColorStop(0, '#ffffff');
        irisGrad.addColorStop(0.65, '#e7ecf8');
        irisGrad.addColorStop(1, '#c5cfe6');
        ctx.fillStyle = irisGrad;
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Fine radial Byakugan iris spokes
        ctx.strokeStyle = 'rgba(118, 130, 162, 0.36)';
        ctx.lineWidth = Math.max(0.7, radius * 0.042);
        for (let i = 0; i < 16; i++) {
          const a = (i * Math.PI * 2) / 16;
          ctx.beginPath();
          ctx.moveTo(center.x + Math.cos(a) * radius * 0.34, center.y + Math.sin(a) * radius * 0.34);
          ctx.lineTo(center.x + Math.cos(a) * radius * 0.86, center.y + Math.sin(a) * radius * 0.86);
          ctx.stroke();
        }

        // Subtle lavender iris & center pupil ring
        ctx.strokeStyle = 'rgba(116, 128, 162, 0.58)';
        ctx.lineWidth = Math.max(0.9, radius * 0.068);
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius * 0.92, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(130, 142, 174, 0.50)';
        ctx.lineWidth = Math.max(0.8, radius * 0.055);
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius * 0.30, 0, Math.PI * 2);
        ctx.stroke();
      } else if (eyeMode === 'sharingan' || eyeMode === 'mangekyo') {
        // Interior Sharingan / Mangekyo iris covering the full center iris cleanly without black border
        ctx.globalAlpha = 0.94 * alpha;
        const grad = ctx.createRadialGradient(center.x, center.y, radius * 0.1, center.x, center.y, radius);
        grad.addColorStop(0, '#ff4554');
        grad.addColorStop(0.72, '#e60b1d');
        grad.addColorStop(0.93, 'rgba(182, 8, 22, 0.88)');
        grad.addColorStop(1, 'rgba(140, 4, 16, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.fill();

        if (eyeMode === 'sharingan') {
          // Delicate inner tomoe track ring inside the red iris
          ctx.strokeStyle = 'rgba(18, 3, 6, 0.58)';
          ctx.lineWidth = Math.max(0.8, radius * 0.055);
          ctx.beginPath();
          ctx.arc(center.x, center.y, radius * 0.54, 0, Math.PI * 2);
          ctx.stroke();

          const spin = timeSec * 1.1;
          for (let i = 0; i < 3; i++) {
            const a = spin + (i * Math.PI * 2) / 3;
            const tx = center.x + Math.cos(a) * radius * 0.54;
            const ty = center.y + Math.sin(a) * radius * 0.54;
            drawTomoe(ctx, tx, ty, radius * 0.155, a + Math.PI * 0.5);
          }

          ctx.fillStyle = '#090204';
          ctx.beginPath();
          ctx.arc(center.x, center.y, radius * 0.20, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Itachi's curved 3-blade pinwheel strictly inside the iris
          const spin = timeSec * 1.6;
          ctx.save();
          ctx.translate(center.x, center.y);
          ctx.rotate(spin);
          ctx.fillStyle = '#090204';
          for (let i = 0; i < 3; i++) {
            ctx.rotate((Math.PI * 2) / 3);
            ctx.beginPath();
            ctx.moveTo(0, -radius * 0.22);
            ctx.quadraticCurveTo(radius * 0.62, -radius * 0.66, radius * 0.86, 0.04);
            ctx.quadraticCurveTo(radius * 0.44, -radius * 0.08, radius * 0.20, radius * 0.16);
            ctx.closePath();
            ctx.fill();
          }
          ctx.beginPath();
          ctx.arc(0, 0, radius * 0.24, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      } else if (eyeMode === 'sage' || eyeMode === 'kurama' || eyeMode === 'six_paths') {
        // Interior iris covering the full center iris (Sage / Six Paths / Kurama) with zero black rim
        const isKurama = eyeMode === 'kurama';
        const isSix = eyeMode === 'six_paths';
        ctx.globalAlpha = 0.94 * alpha;

        const grad = ctx.createRadialGradient(center.x, center.y, 1, center.x, center.y, radius);
        if (isKurama) {
          grad.addColorStop(0, '#ff3d5c');
          grad.addColorStop(0.74, '#d60e2e');
          grad.addColorStop(0.93, 'rgba(155, 6, 30, 0.88)');
          grad.addColorStop(1, 'rgba(110, 4, 20, 0)');
        } else if (isSix) {
          grad.addColorStop(0, '#ffe45e');
          grad.addColorStop(0.74, '#f29a1d');
          grad.addColorStop(0.93, 'rgba(195, 110, 12, 0.88)');
          grad.addColorStop(1, 'rgba(150, 75, 0, 0)');
        } else {
          grad.addColorStop(0, '#fff280');
          grad.addColorStop(0.74, '#f0be26');
          grad.addColorStop(0.93, 'rgba(198, 145, 14, 0.88)');
          grad.addColorStop(1, 'rgba(150, 105, 0, 0)');
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Pupil tilted cleanly to match head angle
        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.rotate(eyeAngle);
        ctx.fillStyle = '#090403';

        if (eyeMode === 'sage' || isSix) {
          const bw = radius * (isSix ? 1.16 : 1.20);
          const bh = radius * (isSix ? 0.30 : 0.34);
          ctx.beginPath();
          ctx.roundRect(-bw * 0.5, -bh * 0.5, bw, bh, bh * 0.45);
          ctx.fill();
        }
        if (isKurama || isSix) {
          const sw = radius * (isSix ? 0.15 : 0.17);
          const sh = radius * (isSix ? 0.72 : 0.82);
          ctx.beginPath();
          ctx.moveTo(0, -sh);
          ctx.quadraticCurveTo(sw * 1.4, 0, 0, sh);
          ctx.quadraticCurveTo(-sw * 1.4, 0, 0, -sh);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      // Crisp anime white specular sparkle inside the iris
      ctx.globalAlpha = 0.72 * alpha;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(center.x - radius * 0.32, center.y - radius * 0.32, Math.max(1.2, radius * 0.15), 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  Shinobi.vfx = Shinobi.vfx || {};
  Shinobi.vfx.extractFaceInfo = extractFaceInfo;
  Shinobi.vfx.drawDojutsuEyes = drawDojutsuEyes;
})(window);
