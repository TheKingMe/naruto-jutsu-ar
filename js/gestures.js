(function (global) {
  'use strict';

  const Shinobi = (global.Shinobi = global.Shinobi || {});

  const FINGER_JOINTS = {
    index:  [5, 6, 8],
    middle: [9, 10, 12],
    ring:   [13, 14, 16],
    pinky:  [17, 18, 20]
  };

  function vec2(a, b) {
    return { x: b.x - a.x, y: b.y - a.y };
  }

  function normVec(v) {
    const len = Math.hypot(v.x, v.y) || 1;
    return { x: v.x / len, y: v.y / len };
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y;
  }

  // Distance between two 2D segments (p1-p2 and q1-q2) in normalized space
  function segmentDistance(p1, p2, q1, q2) {
    const samples = [0, 0.25, 0.5, 0.75, 1];
    let minD = Infinity;
    for (const s of samples) {
      const px = p1.x + (p2.x - p1.x) * s;
      const py = p1.y + (p2.y - p1.y) * s;
      for (const t of samples) {
        const qx = q1.x + (q2.x - q1.x) * t;
        const qy = q1.y + (q2.y - q1.y) * t;
        const d = Math.hypot(px - qx, py - qy);
        if (d < minD) minD = d;
      }
    }
    return minD;
  }

  function smoothHandLandmarks(rawLm, prevLm) {
    if (!prevLm || prevLm.length !== rawLm.length) {
      return rawLm.map((p) => ({ x: p.x, y: p.y, z: p.z || 0 }));
    }
    const { lerp } = Shinobi.coords;
    const wristMove = Math.hypot(rawLm[0].x - prevLm[0].x, rawLm[0].y - prevLm[0].y);
    // Keep hand landmarks responsive during fast throws, smooth jitter when steady
    const alpha = Math.min(0.82, Math.max(0.42, 0.42 + wristMove * 8.5));
    return rawLm.map((p, i) => ({
      x: lerp(prevLm[i].x, p.x, alpha),
      y: lerp(prevLm[i].y, p.y, alpha),
      z: lerp(prevLm[i].z || 0, p.z || 0, alpha)
    }));
  }

  function classifyPoseFromLandmarks(lm, palmSize, prevFingers, prevPinch) {
    const { dist2D } = Shinobi.coords;
    const wrist = lm[0];
    const fingers = {};

    for (const [name, [mcpIdx, pipIdx, tipIdx]] of Object.entries(FINGER_JOINTS)) {
      const dWristTip = dist2D(wrist, lm[tipIdx]);
      const dWristPip = dist2D(wrist, lm[pipIdx]);
      const dMcpTip = dist2D(lm[mcpIdx], lm[tipIdx]);
      const dMcpPip = dist2D(lm[mcpIdx], lm[pipIdx]);
      const wasExt = Boolean(prevFingers && prevFingers[name]);
      // Schmitt-trigger hysteresis prevents 1px boundary flicker on held signs
      const wristMul = wasExt ? 1.00 : 1.08;
      const mcpMul = wasExt ? 1.02 : 1.11;
      fingers[name] = dWristTip > dWristPip * wristMul && dMcpTip > dMcpPip * mcpMul;
    }

    const wasThumb = Boolean(prevFingers && prevFingers.thumb);
    fingers.thumb =
      dist2D(lm[4], lm[17]) > palmSize * (wasThumb ? 0.96 : 1.05) &&
      dist2D(lm[4], lm[2]) > palmSize * (wasThumb ? 0.36 : 0.42);

    const pinchRatio = dist2D(lm[4], lm[8]) / palmSize;
    const pinchThresh = prevPinch ? 0.44 : 0.36;
    const isPinching = pinchRatio < pinchThresh;

    const shakaThumbOk =
      fingers.thumb ||
      (dist2D(lm[4], lm[17]) > palmSize * 0.85 && dist2D(lm[4], lm[2]) > palmSize * 0.34);

    let pose = 'NEUTRAL';
    // Allow pinky slightly angled/hidden behind ring in PINCH so side-angle Mangekyo/Amaterasu never drops
    if (isPinching && fingers.middle && fingers.ring && (!fingers.index || pinchRatio < 0.28)) {
      pose = 'PINCH';
    } else if (fingers.index && fingers.middle && fingers.ring && fingers.pinky) {
      pose = 'OPEN_PALM';
    } else if (fingers.index && fingers.middle && fingers.ring && !fingers.pinky && !isPinching) {
      pose = 'THREE_FINGERS';
    } else if (shakaThumbOk && fingers.pinky && !fingers.index && !fingers.middle && !fingers.ring) {
      pose = 'SHAKA';
    } else if (fingers.index && fingers.middle && !fingers.ring && !fingers.pinky) {
      pose = 'HALF_SEAL';
    } else if (fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky && !isPinching) {
      pose = 'POINT';
    } else if (!fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky) {
      pose = 'FIST';
    }

    return { fingers, pinchRatio, isPinching, pose };
  }

  function analyzeHand(lm, label, now, prevWrist, prevFingers, prevPinch) {
    const { dist2D } = Shinobi.coords;
    const wrist = lm[0];
    const midMcp = lm[9];
    const palmSize = Math.max(0.04, dist2D(wrist, midMcp));

    const { fingers, pinchRatio, isPinching, pose } = classifyPoseFromLandmarks(
      lm,
      palmSize,
      prevFingers,
      prevPinch
    );

    const palmCenter = {
      x: (wrist.x + midMcp.x) * 0.5,
      y: (wrist.y + midMcp.y) * 0.5
    };

    let vy = 0;
    let screenVx = 0;
    let screenVy = 0;
    if (prevWrist && now > prevWrist.t) {
      const dt = Math.max(0.016, (now - prevWrist.t) / 1000);
      vy = (wrist.y - prevWrist.y) / dt;
      const rawVx = -(palmCenter.x - prevWrist.palmX) / dt;
      const rawVy = (palmCenter.y - prevWrist.palmY) / dt;
      screenVx = prevWrist.vx * 0.45 + rawVx * 0.55;
      screenVy = prevWrist.vy * 0.45 + rawVy * 0.55;
    }

    const indexDir = normVec(vec2(lm[5], lm[8]));
    const palmUp = normVec(vec2(wrist, midMcp));

    return {
      lm,
      label,
      wrist,
      palmCenter,
      palmSize,
      fingers,
      pinchRatio,
      isPinching,
      pose,
      rawPose: pose,
      vy,
      screenVx,
      screenVy,
      throwSpeed: Math.hypot(screenVx, screenVy),
      indexDir,
      palmUp,
      suppressOrb: false
    };
  }

  function countExtendedFingers(fingers) {
    return (
      (fingers.index ? 1 : 0) +
      (fingers.middle ? 1 : 0) +
      (fingers.ring ? 1 : 0) +
      (fingers.pinky ? 1 : 0)
    );
  }

  function detectTwoHandCombo(a, b, activeSignId, activeOrbType) {
    if (!a || !b) return null;
    const { dist2D } = Shinobi.coords;
    const palmDist = dist2D(a.palmCenter, b.palmCenter);
    const wristDist = dist2D(a.wrist, b.wrist);
    const midTipDist = dist2D(a.lm[12], b.lm[12]);
    const indexTipDist = dist2D(a.lm[8], b.lm[8]);
    const tipDist = Math.min(midTipDist, indexTipDist);
    const avgPalm = (a.palmSize + b.palmSize) * 0.5;
    const bothUp = a.palmUp.y < -0.22 && b.palmUp.y < -0.22;

    // 1. Shadow Clone Cross-Finger Seal: crossed index/half-seal fingers (~53-127 deg cross)
    const aSeal = a.fingers.index && !a.fingers.pinky && (!a.fingers.ring || !a.fingers.middle);
    const bSeal = b.fingers.index && !b.fingers.pinky && (!b.fingers.ring || !b.fingers.middle);
    if (aSeal && bSeal) {
      const aSegs = [[a.lm[5], a.lm[8]]];
      if (a.fingers.middle) aSegs.push([a.lm[9], a.lm[12]]);
      const bSegs = [[b.lm[5], b.lm[8]]];
      if (b.fingers.middle) bSegs.push([b.lm[9], b.lm[12]]);

      let segD = Infinity;
      for (const [p1, p2] of aSegs) {
        for (const [q1, q2] of bSegs) {
          segD = Math.min(segD, segmentDistance(p1, p2, q1, q2));
        }
      }
      const crossed = Math.abs(dot(a.indexDir, b.indexDir)) < 0.60;
      if (segD < Math.max(0.085, avgPalm * 0.62) && crossed) {
        return { type: 'SHADOW_CLONE_CROSS' };
      }
    }

    // 2. Rinnegan Dual Seal: both Half-Seals upright and side-by-side (non-crossed; #1 already handles crossed)
    if (
      a.pose === 'HALF_SEAL' &&
      b.pose === 'HALF_SEAL' &&
      bothUp &&
      dot(a.indexDir, b.indexDir) > 0.35 &&
      palmDist < 0.72 &&
      wristDist > 0.04
    ) {
      return { type: 'RINNEGAN_DUAL_SEAL' };
    }

    // 3. Sage Mode: hands pressed flat together upright (prayer; palms & fingertips touch)
    const aExtCount = countExtendedFingers(a.fingers);
    const bExtCount = countExtendedFingers(b.fingers);
    const holdingSage = activeSignId === 'sage_mode';
    const maxPrayerTipDist = holdingSage ? 0.125 : 0.095;
    const maxPrayerPalmDist = holdingSage ? 0.125 : 0.105;
    const maxPrayerWristDist = holdingSage ? 0.14 : 0.125;

    if (
      wristDist < maxPrayerWristDist &&
      palmDist < maxPrayerPalmDist &&
      tipDist < maxPrayerTipDist &&
      a.palmUp.y < -0.38 &&
      b.palmUp.y < -0.38 &&
      dot(a.palmUp, b.palmUp) > 0.60 &&
      aExtCount >= 2 &&
      bExtCount >= 2 &&
      aExtCount + bExtCount >= 5
    ) {
      return { type: 'SAGE_PRAYER' };
    }

    // 4. Odama Rasengan: both open/cupped palms cradling an orb with clear space between palms & tips
    const holdingOdama = activeOrbType === 'ODAMA_MERGE';
    const minOdamaTipDist = holdingOdama ? 0.085 : 0.098;
    const minOdamaPalmDist = holdingOdama ? 0.105 : 0.118;

    if (
      !holdingSage &&
      aExtCount >= 3 &&
      bExtCount >= 3 &&
      !a.isPinching &&
      !b.isPinching &&
      tipDist >= minOdamaTipDist &&
      palmDist >= minOdamaPalmDist &&
      palmDist < 0.35 &&
      wristDist >= 0.10
    ) {
      return {
        type: 'ODAMA_MERGE',
        center: {
          x: (a.palmCenter.x + b.palmCenter.x) * 0.5,
          y: (a.palmCenter.y + b.palmCenter.y) * 0.5
        },
        size: avgPalm
      };
    }

    // 5. Kurama Chakra Mode: crossed wrists / fists (disjoint from Half-Seals & Bijudama wrists-apart)
    const bothClosedOrCurledFists =
      !a.fingers.middle && !b.fingers.middle &&
      !a.fingers.ring && !b.fingers.ring &&
      !a.fingers.pinky && !b.fingers.pinky &&
      (!a.fingers.index || !b.fingers.index);

    if (
      bothClosedOrCurledFists &&
      wristDist < 0.16 &&
      dot(a.palmUp, b.palmUp) < 0.55
    ) {
      return { type: 'KURAMA_CROSS' };
    }

    // 6. Bijudama: two fists / cupped hands facing each other (wrists separated >= 0.16)
    const bothStrictFists =
      (a.pose === 'FIST' || a.pose === 'NEUTRAL') &&
      (b.pose === 'FIST' || b.pose === 'NEUTRAL') &&
      !a.fingers.index && !b.fingers.index &&
      !a.fingers.middle && !b.fingers.middle;

    if (
      bothStrictFists &&
      palmDist > 0.08 &&
      palmDist < 0.32 &&
      wristDist >= 0.16
    ) {
      return {
        type: 'BIJUDAMA_CUP',
        center: {
          x: (a.palmCenter.x + b.palmCenter.x) * 0.5,
          y: (a.palmCenter.y + b.palmCenter.y) * 0.5
        },
        size: avgPalm
      };
    }

    // 7. Six Paths Mode: both open palms raised above chest/shoulder height
    if (
      aExtCount >= 3 &&
      bExtCount >= 3 &&
      a.palmUp.y < -0.45 &&
      b.palmUp.y < -0.45 &&
      palmDist >= 0.34 &&
      a.palmCenter.y < 0.34 &&
      b.palmCenter.y < 0.34
    ) {
      return { type: 'SIX_PATHS_RAISE' };
    }

    return null;
  }

  function detectEyeWinkSign(faceInfo, activeWinkId) {
    if (!faceInfo || !faceInfo.eyes || faceInfo.eyes.length < 2) return null;
    const rightEye = faceInfo.eyes.find((e) => e.side === 'right') || faceInfo.eyes[0];
    const leftEye = faceInfo.eyes.find((e) => e.side === 'left') || faceInfo.eyes[1];
    if (!rightEye || !leftEye) return null;

    const rRight = rightEye.eyeOpenRatio;
    const rLeft = leftEye.eyeOpenRatio;
    const closedThresh = activeWinkId === 'sharingan' || activeWinkId === 'mangekyo' ? 0.195 : 0.17;
    const openThresh = 0.20;
    const minDiff = 0.065;

    // Close one eye -> Sharingan; close other eye -> Mangekyō (normal both-eye blinks ignored)
    if (rRight < closedThresh && rLeft >= openThresh && rLeft - rRight >= minDiff) {
      return 'sharingan';
    }
    if (rLeft < closedThresh && rRight >= openThresh && rRight - rLeft >= minDiff) {
      return 'mangekyo';
    }
    return null;
  }

  const DUAL_COMBO_SIGNS = new Set([
    'shadow_clones',
    'sage_mode',
    'kurama_mode',
    'six_paths',
    'rinnegan'
  ]);

  const PROTECTED_SIGNS = new Set([
    ...DUAL_COMBO_SIGNS,
    'byakugan'
  ]);

  const POSE_TO_JUTSU = {
    OPEN_PALM:     'rasengan',
    THREE_FINGERS: 'rasenshuriken',
    HALF_SEAL:     'chidori',
    POINT:         'fireball',
    PINCH:         'amaterasu'
  };

  const COMBO_TO_TOGGLE = {
    SHADOW_CLONE_CROSS: { layer: 'body', id: 'shadow_clones' },
    SAGE_PRAYER:        { layer: 'body', id: 'sage_mode' },
    KURAMA_CROSS:       { layer: 'body', id: 'kurama_mode' },
    SIX_PATHS_RAISE:    { layer: 'body', id: 'six_paths' },
    RINNEGAN_DUAL_SEAL: { layer: 'eye',  id: 'rinnegan' }
  };

  class GestureEngine {
    constructor() {
      this.prevWrists = new Map();
      this.slotStability = new Map();
      this.signHold = { id: null, since: 0, lastSeen: 0, missed: false };
      this.lastSignTrigger = new Map();
      this.lastSlamAt = -Infinity;
      this.chargeHistory = new Map();
      this.pointHold = new Map();
      this.fistHoldSince = -Infinity;
      this.lastTwoHandOrb = { combo: null, at: -Infinity };
      this.postSignCooldownUntil = -Infinity;
    }

    _stabilizeSlot(slot, rawPose, smoothedLm, fingers, isPinching, rawLabel, analyzed, now, TIMING) {
      let st = this.slotStability.get(slot);
      if (!st) {
        st = {
          stablePose: rawPose,
          lastMatchAt: now,
          candidatePose: null,
          candidateSince: 0,
          smoothedLm,
          fingers,
          isPinching,
          lastHand: analyzed,
          lastSeenAt: now,
          missFrames: 0
        };
        this.slotStability.set(slot, st);
        return st.stablePose;
      }

      st.smoothedLm = smoothedLm;
      st.fingers = fingers;
      st.isPinching = isPinching;
      st.lastSeenAt = now;
      st.missFrames = 0;

      if (rawPose === st.stablePose) {
        st.lastMatchAt = now;
        st.candidatePose = null;
        st.candidateSince = 0;
      } else if (rawPose === 'NEUTRAL') {
        if (now - st.lastMatchAt >= TIMING.POSE_DROP_GRACE_MS) {
          st.stablePose = 'NEUTRAL';
          st.lastMatchAt = now;
          st.candidatePose = null;
        }
      } else {
        if (st.candidatePose !== rawPose) {
          st.candidatePose = rawPose;
          st.candidateSince = now;
        }
        if (now - st.candidateSince >= TIMING.POSE_CONFIRM_MS) {
          st.stablePose = rawPose;
          st.lastMatchAt = now;
          st.candidatePose = null;
          st.candidateSince = 0;
        }
      }

      analyzed.pose = st.stablePose;
      st.lastHand = analyzed;
      return st.stablePose;
    }

    process(multiLandmarks, multiHandedness, faceInfo, now, rect, hasGuided) {
      const { TIMING } = Shinobi.CONFIG;
      const hands = [];
      const usedSlots = new Set();

      if (multiLandmarks && multiHandedness) {
        multiLandmarks.forEach((rawLm, idx) => {
          const rawLabel = multiHandedness[idx]?.label || 'Left';
          let slot = rawLabel === 'Right' ? 1 : 0;
          if (usedSlots.has(slot)) slot = slot === 0 ? 1 : 0;
          usedSlots.add(slot);

          const prev = this.prevWrists.get(slot);
          const prevSt = this.slotStability.get(slot);
          const smoothedLm = smoothHandLandmarks(rawLm, prevSt ? prevSt.smoothedLm : null);
          const analyzed = analyzeHand(
            smoothedLm,
            rawLabel,
            now,
            prev,
            prevSt ? prevSt.fingers : null,
            prevSt ? prevSt.isPinching : false
          );
          analyzed.slot = slot;
          this._stabilizeSlot(
            slot,
            analyzed.rawPose,
            smoothedLm,
            analyzed.fingers,
            analyzed.isPinching,
            rawLabel,
            analyzed,
            now,
            TIMING
          );
          analyzed.jutsuId = POSE_TO_JUTSU[analyzed.pose] || null;
          this.prevWrists.set(slot, {
            x: smoothedLm[0].x,
            y: smoothedLm[0].y,
            palmX: analyzed.palmCenter.x,
            palmY: analyzed.palmCenter.y,
            vx: analyzed.screenVx,
            vy: analyzed.screenVy,
            t: now
          });
          hands.push(analyzed);
        });
      }

      // Hold a briefly occluded hand during crossed/dual signs where one hand may hide or flicker
      const activeHoldInGrace =
        this.signHold.id &&
        PROTECTED_SIGNS.has(this.signHold.id) &&
        now - this.signHold.lastSeen <= TIMING.SIGN_GRACE_MS;
      const orbComboInGrace =
        this.lastTwoHandOrb.combo && now - this.lastTwoHandOrb.at <= 160;
      const holdingDualOccluded =
        (activeHoldInGrace && DUAL_COMBO_SIGNS.has(this.signHold.id)) || orbComboInGrace;
      const maxOccludeFrames = holdingDualOccluded ? 5 : 2;
      const maxOccludeMs = holdingDualOccluded ? 190 : TIMING.POSE_DROP_GRACE_MS;

      for (const slot of [0, 1]) {
        if (usedSlots.has(slot)) continue;
        const st = this.slotStability.get(slot);
        if (
          st &&
          st.lastHand &&
          st.missFrames < maxOccludeFrames &&
          now - st.lastSeenAt <= maxOccludeMs &&
          (hands.length > 0 || this.signHold.id)
        ) {
          st.missFrames++;
          hands.push({
            ...st.lastHand,
            vy: 0,
            screenVx: 0,
            screenVy: 0,
            throwSpeed: 0
          });
        } else {
          this.prevWrists.delete(slot);
          this.slotStability.delete(slot);
          this.pointHold.delete(slot);
        }
      }

      // Two-hand combinations (evaluated before slam so releasing a two-hand seal doesn't trigger Summoning)
      const inPostSignCooldown = now < this.postSignCooldownUntil;
      const activeComboSignId =
        this.signHold.id && now - this.signHold.lastSeen <= TIMING.SIGN_GRACE_MS
          ? this.signHold.id
          : null;
      let rawCombo = hands.length === 2
        ? detectTwoHandCombo(hands[0], hands[1], activeComboSignId, this.lastTwoHandOrb.combo?.type)
        : null;
      if (inPostSignCooldown && rawCombo && (rawCombo.type === 'ODAMA_MERGE' || rawCombo.type === 'BIJUDAMA_CUP')) {
        // Prevent parting prayer/seal hands from briefly igniting Odama/Bijudama right after a sign triggers
        rawCombo = null;
      }
      if (!rawCombo && !inPostSignCooldown && hands.length === 2 && orbComboInGrace) {
        // Hold two-hand orb across brief 1-2 frame finger flicker so Odama/Bijudama never flashes Chidori/Rasenshuriken
        const cached = this.lastTwoHandOrb.combo;
        const avgPalm = (hands[0].palmSize + hands[1].palmSize) * 0.5;
        rawCombo = {
          type: cached.type,
          center: {
            x: (hands[0].palmCenter.x + hands[1].palmCenter.x) * 0.5,
            y: (hands[0].palmCenter.y + hands[1].palmCenter.y) * 0.5
          },
          size: avgPalm
        };
      } else if (rawCombo && (rawCombo.type === 'ODAMA_MERGE' || rawCombo.type === 'BIJUDAMA_CUP')) {
        this.lastTwoHandOrb = { combo: rawCombo, at: now };
      } else {
        this.lastTwoHandOrb = { combo: null, at: -Infinity };
      }
      const comboToggle = rawCombo ? COMBO_TO_TOGGLE[rawCombo.type] : null;

      // Check Summoning downward palm/fist slam (single-hand only)
      let summonBurst = null;
      if (!rawCombo && !holdingDualOccluded && now - this.lastSlamAt > TIMING.SLAM_COOLDOWN_MS) {
        for (const h of hands) {
          if (
            (h.pose === 'OPEN_PALM' || h.pose === 'FIST') &&
            h.vy > TIMING.SLAM_VELOCITY &&
            h.wrist.y > 0.5
          ) {
            this.lastSlamAt = now;
            summonBurst = { pos: { x: h.palmCenter.x, y: Math.min(0.84, h.palmCenter.y + 0.08) } };
            break;
          }
        }
      }

      // Hand-sign / Eye-wink Dōjutsu triggers (wink never conflicts with hand jutsus!)
      let candidateToggle = comboToggle;
      let suppressHandBySign = Boolean(rawCombo);
      if (!rawCombo) {
        if (activeHoldInGrace && DUAL_COMBO_SIGNS.has(this.signHold.id)) {
          // Keep active two-hand seal locked cleanly across brief flicker instead of hijacking to Chidori/Rasengan
          suppressHandBySign = true;
          for (const h of hands) {
            h.suppressOrb = true;
          }
        } else {
          const shakaHand = hands.find((h) => h.pose === 'SHAKA');
          if (shakaHand) {
            shakaHand.suppressOrb = true;
            suppressHandBySign = true;
            candidateToggle = { layer: 'eye', id: 'byakugan' };
          } else {
            const winkSign = detectEyeWinkSign(faceInfo, this.signHold.id);
            if (winkSign) {
              candidateToggle = { layer: 'eye', id: winkSign };
            }
          }
        }
      } else {
        // Suppress individual hand orbs for ALL two-hand skills (including Odama Rasengan & Bijudama)
        for (const h of hands) h.suppressOrb = true;
      }

      if (inPostSignCooldown) {
        suppressHandBySign = true;
        for (const h of hands) h.suppressOrb = true;
      }

      if (suppressHandBySign) {
        for (const h of hands) {
          this.chargeHistory.delete(h.slot);
        }
      }

      // Track hand jutsu charge history & steady POINT holds for guided steering / point-launch
      for (const h of hands) {
        if (!h.suppressOrb && h.jutsuId && h.jutsuId !== 'fireball') {
          const hist = this.chargeHistory.get(h.slot);
          if (hist && hist.jutsuId === h.jutsuId && now - hist.lastAt <= 600) {
            hist.lastAt = now;
          } else {
            this.chargeHistory.set(h.slot, { jutsuId: h.jutsuId, firstAt: now, lastAt: now });
          }
        }
        if (h.pose === 'POINT' && !candidateToggle) {
          if (!this.pointHold.has(h.slot)) {
            this.pointHold.set(h.slot, now);
          }
        } else {
          this.pointHold.delete(h.slot);
        }
      }

      let steerCommand = null;
      let pointLaunch = null;
      let detonateGuided = false;

      if (hasGuided && !candidateToggle) {
        // Priority 1: Index finger POINT aims guided projectile directly in finger direction
        const pointHand = hands.find((h) => h.pose === 'POINT' && !h.suppressOrb);
        if (pointHand) {
          pointHand.suppressOrb = true;
          steerCommand = {
            dirX: -pointHand.indexDir.x,
            dirY: pointHand.indexDir.y,
            handNorm: { x: pointHand.lm[8].x, y: pointHand.lm[8].y },
            mode: 'point'
          };
        } else {
          // Priority 2: Sweep/move hand in desired direction to steer mid-air
          let bestMove = null;
          let bestSpeed = 0;
          for (const h of hands) {
            if (h.suppressOrb || h.pose === 'SHAKA' || h.pose === 'FIST') continue;
            const minSpeed = h.pose === 'NEUTRAL' ? 0.26 : 0.40;
            if (h.throwSpeed >= minSpeed && h.throwSpeed > bestSpeed) {
              bestMove = h;
              bestSpeed = h.throwSpeed;
            }
          }
          if (bestMove) {
            steerCommand = {
              dirX: bestMove.screenVx / bestMove.throwSpeed,
              dirY: bestMove.screenVy / bestMove.throwSpeed,
              handNorm: { x: bestMove.palmCenter.x, y: bestMove.palmCenter.y },
              mode: 'move'
            };
          } else {
            // Priority 3: Hold Fist briefly to detonate guided projectiles mid-air
            const allowFist = !rawCombo || rawCombo.type !== 'BIJUDAMA_CUP';
            const fistHand = allowFist && hands.find((h) => h.pose === 'FIST' && !h.suppressOrb);
            if (fistHand) {
              if (this.fistHoldSince === -Infinity) {
                this.fistHoldSince = now;
              } else if (now - this.fistHoldSince >= 140) {
                detonateGuided = true;
                this.fistHoldSince = -Infinity;
              }
            } else {
              this.fistHoldSince = -Infinity;
            }
          }
        }
        if (steerCommand) {
          this.fistHoldSince = -Infinity;
        }
      } else {
        this.fistHoldSince = -Infinity;
        if (!hasGuided && !candidateToggle) {
          // Point-to-Launch: charge a hand jutsu briefly then point where you want it to fly
          for (const h of hands) {
            if (h.pose !== 'POINT' || h.suppressOrb) continue;
            const heldSince = this.pointHold.get(h.slot);
            const hist = this.chargeHistory.get(h.slot);
            const validRecentCharge = hist && now - hist.lastAt <= 750 && hist.lastAt - hist.firstAt >= 160;
            if (!validRecentCharge) continue;

            // Suppress Fireball flicker while aiming the just-charged jutsu
            h.suppressOrb = true;
            if (typeof heldSince === 'number' && now - heldSince >= 150) {
              pointLaunch = {
                slot: h.slot,
                jutsuId: hist.jutsuId,
                dirX: -h.indexDir.x,
                dirY: h.indexDir.y,
                originNorm: { x: h.palmCenter.x, y: h.palmCenter.y }
              };
              this.chargeHistory.delete(h.slot);
              this.pointHold.delete(h.slot);
              break;
            }
          }
        }
      }

      // Hold-to-toggle stabilization + miss grace + live HUD progress
      let toggleBodyMode = null;
      let toggleEyeMode = null;
      let pendingSign = null;

      if (candidateToggle) {
        if (this.signHold.id !== candidateToggle.id) {
          this.signHold = { id: candidateToggle.id, since: now, lastSeen: now, missed: false };
        } else {
          // Freeze timer only across actual missed/occluded frames so any frame rate accumulates cleanly
          if (this.signHold.missed) {
            this.signHold.since += now - this.signHold.lastSeen;
            this.signHold.missed = false;
          }
          this.signHold.lastSeen = now;
        }
        const elapsed = now - this.signHold.since;
        const progress = Math.min(1, elapsed / TIMING.COMBO_HOLD_MS);
        const def = Shinobi.JUTSU[candidateToggle.id];
        pendingSign = {
          id: candidateToggle.id,
          name: def?.name || candidateToggle.id,
          color: def?.color || '#ffd45a',
          progress
        };

        if (elapsed >= TIMING.COMBO_HOLD_MS) {
          const lastAt = this.lastSignTrigger.has(candidateToggle.id)
            ? this.lastSignTrigger.get(candidateToggle.id)
            : -Infinity;
          if (now - lastAt >= TIMING.COMBO_COOLDOWN_MS) {
            this.lastSignTrigger.set(candidateToggle.id, now);
            if (candidateToggle.layer === 'body') {
              toggleBodyMode = candidateToggle.id;
              this.postSignCooldownUntil = now + 750;
            } else if (candidateToggle.layer === 'eye') {
              toggleEyeMode = candidateToggle.id;
              if (candidateToggle.id !== 'sharingan' && candidateToggle.id !== 'mangekyo') {
                this.postSignCooldownUntil = now + 750;
              }
            }
          }
        }
      } else if (this.signHold.id && now - this.signHold.lastSeen <= TIMING.SIGN_GRACE_MS) {
        this.signHold.missed = true;
        const heldElapsed = this.signHold.lastSeen - this.signHold.since;
        const def = Shinobi.JUTSU[this.signHold.id];
        pendingSign = {
          id: this.signHold.id,
          name: def?.name || this.signHold.id,
          color: def?.color || '#ffd45a',
          progress: Math.min(1, heldElapsed / TIMING.COMBO_HOLD_MS)
        };
      } else {
        this.signHold = { id: null, since: 0, lastSeen: 0, missed: false };
      }

      const mouthFireball = Boolean(faceInfo && faceInfo.mouthOpenRatio > 0.4);

      return {
        hands,
        combo: rawCombo,
        toggleBodyMode,
        toggleEyeMode,
        pendingSign,
        summonBurst,
        mouthFireball,
        steerCommand,
        pointLaunch,
        detonateGuided
      };
    }
  }

  Shinobi.GestureEngine = GestureEngine;
})(window);
