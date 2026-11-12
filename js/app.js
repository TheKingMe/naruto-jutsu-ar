(function (global) {
  'use strict';

  const Shinobi = (global.Shinobi = global.Shinobi || {});

  function initApp() {
    const { CONFIG, JUTSU, coords, Audio, GestureEngine, vfx } = Shinobi;

    // DOM elements
    const camVideo       = document.getElementById('cam');
    const camSyncCanvas  = document.getElementById('cam-sync-canvas');
    const auraCanvas     = document.getElementById('aura-canvas');
    const backCanvas     = document.getElementById('fx-back-canvas');
    const skeletonCanvas = document.getElementById('skeleton-canvas');
    const frontCanvas    = document.getElementById('fx-front-canvas');
    const videoLayer     = document.getElementById('video-fx-layer');

    const statusDot      = document.getElementById('status-dot');
    const statusText     = document.getElementById('status-text');
    const activeBadges   = document.getElementById('active-badges');
    const fpsPill        = document.getElementById('fps-pill');
    const bannerEl       = document.getElementById('jutsu-banner');
    const signChargeWrap = document.getElementById('sign-charge-wrap');
    const signChargeLbl  = document.getElementById('sign-charge-label');
    const signChargeFill = document.getElementById('sign-charge-fill');
    const dockWrap       = document.getElementById('dock-wrap');

    const btnGuide       = document.getElementById('btn-guide');
    const btnVideos      = document.getElementById('btn-videos');
    const btnSkeleton    = document.getElementById('btn-skeleton');
    const btnAi          = document.getElementById('btn-ai');
    const btnSound       = document.getElementById('btn-sound');
    const btnReset       = document.getElementById('btn-reset');
    const camSelect      = document.getElementById('cam-select');
    const camOverlaySel  = document.getElementById('cam-overlay-select');
    const btnFpsCap      = document.getElementById('btn-fps-cap');

    const guideDrawer    = document.getElementById('guide-drawer');
    const guideContent   = document.getElementById('guide-content');
    const btnCloseGuide  = document.getElementById('btn-close-guide');

    const videoDrawer    = document.getElementById('video-drawer');
    const dropZone       = document.getElementById('drop-zone');
    const videoSlotList  = document.getElementById('video-slot-list');
    const btnCloseVideos = document.getElementById('btn-close-videos');

    const camOverlay     = document.getElementById('camera-overlay');
    const camErrorMsg    = document.getElementById('camera-error-msg');
    const btnRetryCam    = document.getElementById('btn-retry-cam');

    // Core subsystems
    const audio          = new Audio();
    const gestures       = new GestureEngine();
    const particles      = new vfx.ParticleSystem(300);
    const auraRenderer   = new vfx.AuraRenderer();
    const handVfx        = new vfx.HandVfxRenderer(videoLayer);
    const projectiles    = new vfx.ProjectileSystem(videoLayer, handVfx);
    const lastThrowAt    = new Map();

    let savedCameraId = '';
    try {
      savedCameraId = global.localStorage ? (global.localStorage.getItem('naruto_camera_id') || '') : '';
    } catch (_) {}

    const state = {
      bodyMode: 'none',
      eyeMode: 'auto',
      showSkeleton: true,
      aiEnhanced: true,
      muted: false,
      ready: false,
      targetFps: CONFIG.TARGET_FPS || 60,
      selectedCameraId: savedCameraId
    };

    let latestGesture = { hands: [], combo: null, pendingSign: null, mouthFireball: false, steerCommand: null };
    let latestGestureAt = -Infinity;
    let latestFaceLandmarks = null;
    let bannerTimer = null;

    // Offscreen input buffers: smaller AI textures keep MediaPipe fast for 50/60 FPS rendering
    const aiHandBuf = document.createElement('canvas');
    // Double-buffered capture canvases so FaceMesh & displayed camera frame match pixel-for-pixel
    const faceCapBufs = [document.createElement('canvas'), document.createElement('canvas')];
    let faceInFlightIdx = -1;
    let faceSyncedIdx = -1;
    let faceSyncedAt = -Infinity;
    let faceMissCount = 0;

    // Unlock audio on first user interaction
    const unlockAudio = () => audio.unlock();
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    function showBanner(text, color) {
      bannerEl.textContent = text;
      bannerEl.style.borderColor = color || 'rgba(255, 212, 90, 0.45)';
      bannerEl.style.color = color || '#ffd45a';
      bannerEl.classList.add('visible');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => bannerEl.classList.remove('visible'), 1900);
    }

    function resolveEyeMode() {
      if (state.eyeMode !== 'auto') return state.eyeMode;
      if (state.bodyMode === 'sage_mode') return 'sage';
      if (state.bodyMode === 'kurama_mode') return 'kurama';
      if (state.bodyMode === 'six_paths') return 'six_paths';
      return 'none';
    }

    function setBodyMode(mode) {
      const next = state.bodyMode === mode ? 'none' : mode;
      state.bodyMode = next;
      if (next === 'shadow_clones') {
        const w = window.innerWidth;
        const h = window.innerHeight;
        particles.spawnSmokeBurst(w * 0.28, h * 0.58, 95, 14);
        particles.spawnSmokeBurst(w * 0.72, h * 0.58, 95, 14);
        audio.playBurst('clone_poof');
      } else if (next !== 'none') {
        audio.playBurst('mode_powerup');
      }
      if (next !== 'none' && JUTSU[next]) {
        showBanner(`${JUTSU[next].name} • ${JUTSU[next].jp}`, JUTSU[next].color);
      } else if (JUTSU[mode]) {
        showBanner(`${JUTSU[mode].name} Deactivated`, '#9eb0cc');
      }
      syncUi();
    }

    function toggleEyeModeBySign(mode) {
      const next = state.eyeMode === mode ? 'auto' : mode;
      state.eyeMode = next;
      if (next !== 'auto' && JUTSU[next]) {
        audio.playBurst('sharingan_ding');
        showBanner(`${JUTSU[next].name} • ${JUTSU[next].jp}`, JUTSU[next].color);
      } else if (JUTSU[mode]) {
        showBanner(`${JUTSU[mode].name} Deactivated`, '#9eb0cc');
      }
      syncUi();
    }

    function clearAllModes() {
      state.bodyMode = 'none';
      state.eyeMode = 'auto';
      syncUi();
      showBanner('All Active Modes Cleared', '#9eb0cc');
    }

    function getLiveHandJutsuIds() {
      const ids = new Set();
      const combo = latestGesture.combo;
      if (combo?.type === 'ODAMA_MERGE') ids.add('odama_rasengan');
      else if (combo?.type === 'BIJUDAMA_CUP') ids.add('bijudama');
      else {
        for (const h of latestGesture.hands) {
          if (!h.suppressOrb && h.jutsuId) ids.add(h.jutsuId);
        }
      }
      if (latestGesture.mouthFireball) ids.add('fireball');
      return ids;
    }

    let lastBadgeHtml = '';

    function syncUi() {
      btnSkeleton.classList.toggle('active', state.showSkeleton);
      btnAi.classList.toggle('active', state.aiEnhanced);
      btnSound.classList.toggle('active', !state.muted);
      btnSound.textContent = state.muted ? 'Sound: Off' : 'Sound: On';
      if (btnFpsCap) {
        btnFpsCap.classList.add('active');
        btnFpsCap.textContent = `FPS: ${state.targetFps}`;
      }

      const badges = [];
      if (state.bodyMode !== 'none' && JUTSU[state.bodyMode]) {
        badges.push(`<span class="badge body">${JUTSU[state.bodyMode].signIcon} ${JUTSU[state.bodyMode].name}</span>`);
      }
      const effEye = resolveEyeMode();
      if (effEye !== 'none') {
        const label = JUTSU[effEye]?.name || effEye.replace('_', ' ').toUpperCase();
        badges.push(`<span class="badge eye">${JUTSU[effEye]?.signIcon || '👁️'} ${label}</span>`);
      }

      const liveHands = Array.from(getLiveHandJutsuIds());
      for (const id of liveHands) {
        if (JUTSU[id]) {
          badges.push(`<span class="badge hand">${JUTSU[id].signIcon} ${JUTSU[id].name}</span>`);
        }
      }
      if (!badges.length) {
        badges.push('<span class="badge hand">Show Hand Sign on Camera</span>');
      }
      const badgeHtml = badges.join('');
      if (badgeHtml !== lastBadgeHtml) {
        lastBadgeHtml = badgeHtml;
        activeBadges.innerHTML = badgeHtml;
      }

      const liveSet = new Set(liveHands);
      dockWrap.querySelectorAll('.skill-chip').forEach((chip) => {
        const layer = chip.dataset.layer;
        const id = chip.dataset.id;
        let active = false;
        if (layer === 'hand') active = liveSet.has(id);
        else if (layer === 'body') active = state.bodyMode === id;
        else if (layer === 'eye') active = effEye === id;
        chip.classList.toggle('selected', active);
      });
    }

    // Build Sign-Reference Bottom Bar (display + sign hints only, never selects skills by number)
    function buildDock() {
      const order = [
        'rasengan', 'odama_rasengan', 'rasenshuriken', 'chidori',
        'fireball', 'amaterasu', 'bijudama',
        'shadow_clones', 'sage_mode', 'kurama_mode', 'six_paths',
        'sharingan', 'mangekyo', 'rinnegan', 'byakugan',
        'summoning'
      ];

      const mkChip = (j) =>
        `<button class="skill-chip ${j.layer}" data-layer="${j.layer}" data-id="${j.id}" title="${j.gesture}">
          <span class="sign-icon">${j.signIcon}</span><span>${j.name}</span>
        </button>`;

      const handItems = order.slice(0, 7).map((id) => mkChip(JUTSU[id])).join('');
      const bodyItems = order.slice(7, 11).map((id) => mkChip(JUTSU[id])).join('');
      const eyeItems  = order.slice(11, 15).map((id) => mkChip(JUTSU[id])).join('');
      const burstItem = mkChip(JUTSU[order[15]]);

      dockWrap.innerHTML = `
        <div class="dock-group">${handItems}</div>
        <div class="dock-divider"></div>
        <div class="dock-group">${bodyItems}</div>
        <div class="dock-divider"></div>
        <div class="dock-group">${eyeItems}</div>
        <div class="dock-divider"></div>
        <div class="dock-group">${burstItem}</div>
      `;

      dockWrap.addEventListener('click', (e) => {
        const chip = e.target.closest('.skill-chip');
        if (!chip) return;
        const j = JUTSU[chip.dataset.id];
        if (!j) return;
        showBanner(`${j.signIcon} ${j.name}: ${j.gesture}`, j.color);
      });
    }

    function launchHeldJutsu(targetX, targetY) {
      const candidate = handVfx.getLaunchCandidate();
      if (!candidate) {
        if (projectiles.hasGuided() && typeof targetX === 'number' && typeof targetY === 'number') {
          projectiles.redirectAll(targetX, targetY);
          audio.playBurst('jutsu_throw');
        }
        return;
      }

      const viewW = window.innerWidth;
      const viewH = window.innerHeight;
      const hasExplicitTarget = typeof targetX === 'number' && typeof targetY === 'number';
      const tx = hasExplicitTarget
        ? targetX
        : (candidate.x < viewW * 0.5 ? viewW * 0.85 : viewW * 0.15);
      const ty = hasExplicitTarget ? targetY : viewH * 0.42;

      projectiles.launch({
        jutsuId: candidate.jutsuId,
        x: candidate.x,
        y: candidate.y,
        size: candidate.size,
        targetX: hasExplicitTarget ? tx : undefined,
        targetY: hasExplicitTarget ? ty : undefined,
        vx: hasExplicitTarget ? 0 : (tx - candidate.x),
        vy: hasExplicitTarget ? 0 : (ty - candidate.y),
        guided: !hasExplicitTarget
      });
      handVfx.dischargeSlot(candidate.slotKey, CONFIG.TIMING.THROW_COOLDOWN_MS);
      audio.playBurst('jutsu_throw');
    }

    // Build Sign Guide Drawer
    function buildGuide() {
      const groups = [
        { title: 'Hand Signs (Hold Pose to Cast)', layer: 'hand' },
        { title: 'Transformations & Clones (Hold Sign ~0.4s)', layer: 'body' },
        { title: 'Dōjutsu Eye Signs (Hold Sign ~0.4s)', layer: 'eye' },
        { title: 'Burst Sign', layer: 'burst' }
      ];

      guideContent.innerHTML = groups
        .map((g) => {
          const items = Object.values(JUTSU).filter((j) => j.layer === g.layer);
          return `
            <div class="guide-section">
              <h3>${g.title}</h3>
              ${items
                .map(
                  (j) => `
                  <div class="guide-row">
                    <div>
                      <div class="guide-name">${j.signIcon} ${j.name} <span style="opacity:.6">${j.jp}</span></div>
                    </div>
                    <div class="guide-gesture">${j.gesture}</div>
                  </div>`
                )
                .join('')}
            </div>`;
        })
        .join('');
    }

    // Build Custom Video Override Drawer
    function buildVideoSlotsUi() {
      const slots = Object.values(JUTSU).filter((j) => j.supportsVideo);
      videoSlotList.innerHTML = slots
        .map((j) => {
          const cur = handVfx.getVideoUrl(j.id);
          const status = cur ? (cur.startsWith('blob:') ? 'Custom video loaded' : cur) : 'Procedural VFX (built-in)';
          return `
            <div class="video-slot-row" data-jutsu="${j.id}">
              <div>
                <strong>${j.name}</strong>
                <small id="vstatus-${j.id}">${status}</small>
              </div>
              <label class="file-label">
                Choose MP4
                <input type="file" accept="video/mp4,video/webm" data-jutsu="${j.id}">
              </label>
            </div>`;
        })
        .join('');

      videoSlotList.addEventListener('change', (e) => {
        const input = e.target;
        if (!input.files || !input.files[0]) return;
        assignVideoFile(input.dataset.jutsu, input.files[0]);
      });

      ['dragenter', 'dragover'].forEach((evt) => {
        dropZone.addEventListener(evt, (e) => {
          e.preventDefault();
          dropZone.classList.add('dragover');
        });
      });

      ['dragleave', 'drop'].forEach((evt) => {
        dropZone.addEventListener(evt, (e) => {
          e.preventDefault();
          dropZone.classList.remove('dragover');
        });
      });

      dropZone.addEventListener('drop', (e) => {
        const files = Array.from(e.dataTransfer?.files || []);
        for (const file of files) {
          const lower = file.name.toLowerCase();
          const match = slots.find((s) => lower.includes(s.id.split('_')[0]));
          assignVideoFile(match ? match.id : 'rasenshuriken', file);
        }
      });
    }

    function assignVideoFile(jutsuId, file) {
      const url = URL.createObjectURL(file);
      handVfx.setCustomVideo(jutsuId, url);
      const label = document.getElementById(`vstatus-${jutsuId}`);
      if (label) label.textContent = `Loaded: ${file.name}`;
      showBanner(`Video assigned to ${JUTSU[jutsuId]?.name || jutsuId}`, '#4ae8ff');
    }

    // Toolbar events
    btnGuide.addEventListener('click', () => {
      videoDrawer.classList.remove('open');
      guideDrawer.classList.toggle('open');
    });
    btnCloseGuide.addEventListener('click', () => guideDrawer.classList.remove('open'));

    btnVideos.addEventListener('click', () => {
      guideDrawer.classList.remove('open');
      videoDrawer.classList.toggle('open');
    });
    btnCloseVideos.addEventListener('click', () => videoDrawer.classList.remove('open'));

    btnSkeleton.addEventListener('click', () => {
      state.showSkeleton = !state.showSkeleton;
      syncUi();
    });

    btnAi.addEventListener('click', () => {
      state.aiEnhanced = !state.aiEnhanced;
      syncUi();
    });

    btnSound.addEventListener('click', () => {
      state.muted = !state.muted;
      audio.setMuted(state.muted);
      if (!state.muted) audio.unlock();
      syncUi();
    });

    btnReset.addEventListener('click', clearAllModes);

    const cameraSelects = [camSelect, camOverlaySel].filter(Boolean);
    for (let i = 0; i < cameraSelects.length; i++) {
      const sel = cameraSelects[i];
      sel.addEventListener('change', () => {
        const nextId = sel.value || '';
        const opt = sel.options[sel.selectedIndex];
        startCamera(nextId, true).then((started) => {
          if (started && opt) {
            showBanner(`Camera: ${opt.textContent}`, '#4ae8ff');
          }
        });
      });
    }

    if (btnFpsCap) {
      btnFpsCap.addEventListener('click', () => {
        const presets = CONFIG.FPS_PRESETS || [60, 50];
        const idx = presets.indexOf(state.targetFps);
        state.targetFps = presets[(idx + 1) % presets.length];
        nextRenderAt = 0;
        fpsFrames = 0;
        fpsLast = performance.now();
        fpsPill.textContent = `${state.targetFps} / ${state.targetFps} FPS`;
        syncUi();
        showBanner(`Frame Rate Fixed: ${state.targetFps} FPS`, '#4ae8ff');
      });
    }

    // Click anywhere on the AR stage to launch a currently held jutsu toward that spot
    window.addEventListener('pointerdown', (e) => {
      if (
        e.target.closest('.brand-card') ||
        e.target.closest('.toolbar') ||
        e.target.closest('.dock-wrap') ||
        e.target.closest('.drawer') ||
        e.target.closest('.overlay-msg')
      ) {
        return;
      }
      launchHeldJutsu(e.clientX, e.clientY);
    });

    // Utility-only keyboard shortcuts (no skill number selection)
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        launchHeldJutsu();
      } else if (e.key === 'Escape') {
        guideDrawer.classList.remove('open');
        videoDrawer.classList.remove('open');
      }
    });

    // MediaPipe Setup
    const hands = new global.Hands({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
    });
    hands.setOptions(CONFIG.HANDS_OPTIONS);
    hands.onResults((res) => {
      if (!state.ready) {
        state.ready = true;
        statusDot.classList.add('ready');
        statusText.textContent = 'Tracking Ready • Perform a ninja hand sign';
      }
      const now = performance.now();
      const rect = coords.getCoverRect(camVideo.videoWidth, camVideo.videoHeight, window.innerWidth, window.innerHeight);
      const faceInfo = state.aiEnhanced && latestFaceLandmarks
        ? vfx.extractFaceInfo(latestFaceLandmarks, rect)
        : null;
      const processed = gestures.process(
        res.multiHandLandmarks,
        res.multiHandedness,
        faceInfo,
        now,
        rect,
        projectiles.hasGuided()
      );

      if (processed.summonBurst) {
        handVfx.triggerSummon(processed.summonBurst.pos);
        audio.playBurst('summoning_boom');
        showBanner(`${JUTSU.summoning.name} • ${JUTSU.summoning.jp}`, JUTSU.summoning.color);
      }

      if (processed.toggleBodyMode) {
        setBodyMode(processed.toggleBodyMode);
        handVfx.dischargeSlot(0, 750);
        handVfx.dischargeSlot(1, 750);
        handVfx.dischargeSlot('combo', 750);
      }

      if (processed.toggleEyeMode) {
        toggleEyeModeBySign(processed.toggleEyeMode);
        if (processed.toggleEyeMode !== 'sharingan' && processed.toggleEyeMode !== 'mangekyo') {
          handVfx.dischargeSlot(0, 750);
          handVfx.dischargeSlot(1, 750);
          handVfx.dischargeSlot('combo', 750);
        }
      }

      if (processed.detonateGuided) {
        projectiles.detonateGuided(particles, audio);
      }

      // Live sign-hold progress UI
      if (processed.pendingSign && processed.pendingSign.progress < 1) {
        signChargeWrap.classList.add('visible');
        signChargeLbl.textContent = `Forming Sign: ${processed.pendingSign.name}`;
        signChargeLbl.style.color = processed.pendingSign.color;
        signChargeFill.style.width = `${Math.round(processed.pendingSign.progress * 100)}%`;
        signChargeFill.style.background = processed.pendingSign.color;
      } else {
        signChargeWrap.classList.remove('visible');
      }

      // Point-to-Launch: aim finger in desired direction right after charging a hand jutsu
      if (processed.pointLaunch) {
        const pl = processed.pointLaunch;
        const prevThrow = lastThrowAt.has(pl.slot) ? lastThrowAt.get(pl.slot) : -Infinity;
        if (now - prevThrow > CONFIG.TIMING.THROW_COOLDOWN_MS) {
          lastThrowAt.set(pl.slot, now);
          const st = handVfx.slotState[pl.slot];
          const origin = coords.normToScreen(pl.originNorm.x, pl.originNorm.y, rect);
          const speed = 920;
          projectiles.launch({
            jutsuId: (st && st.activeId) || pl.jutsuId,
            x: st && st.charge > 0.1 ? st.x : origin.x,
            y: st && st.charge > 0.1 ? st.y : origin.y,
            size: (st && st.size) || 74,
            vx: pl.dirX * speed,
            vy: pl.dirY * speed,
            guided: true
          });
          handVfx.dischargeSlot(pl.slot, CONFIG.TIMING.THROW_COOLDOWN_MS);
          audio.playBurst('jutsu_throw');
        }
      }

      // Swipe/throw a charged hand jutsu across the screen (steerable in mid-air!)
      const isHandSignPending =
        processed.pendingSign &&
        processed.pendingSign.id !== 'sharingan' &&
        processed.pendingSign.id !== 'mangekyo';
      if (!processed.combo && !isHandSignPending) {
        for (const h of processed.hands) {
          const st = handVfx.slotState[h.slot];
          const prevThrow = lastThrowAt.has(h.slot) ? lastThrowAt.get(h.slot) : -Infinity;
          if (
            !h.suppressOrb &&
            h.throwSpeed > CONFIG.TIMING.THROW_SPEED &&
            st.activeId &&
            st.charge > 0.45 &&
            now - prevThrow > CONFIG.TIMING.THROW_COOLDOWN_MS
          ) {
            lastThrowAt.set(h.slot, now);
            projectiles.launch({
              jutsuId: st.activeId,
              x: st.x,
              y: st.y,
              size: st.size,
              vx: h.screenVx * 980,
              vy: h.screenVy * 980,
              guided: true
            });
            handVfx.dischargeSlot(h.slot, CONFIG.TIMING.THROW_COOLDOWN_MS);
            audio.playBurst('jutsu_throw');
          }
        }
      }

      latestGesture = processed;
      latestGestureAt = now;
      syncUi();
    });

    let faceMesh = null;
    if (typeof global.FaceMesh !== 'undefined') {
      faceMesh = new global.FaceMesh({
        locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`
      });
      faceMesh.setOptions(CONFIG.FACE_OPTIONS);
      faceMesh.onResults((res) => {
        const lm = res.multiFaceLandmarks && res.multiFaceLandmarks[0] ? res.multiFaceLandmarks[0] : null;
        if (lm) {
          faceMissCount = 0;
          latestFaceLandmarks = lm;
          if (faceInFlightIdx !== -1) {
            faceSyncedIdx = faceInFlightIdx;
            faceSyncedAt = performance.now();
          }
        } else {
          faceMissCount++;
          // Briefly retain matched face+frame across 1-2 dropped tracking frames to prevent blink/slip
          if (faceMissCount > 2) {
            latestFaceLandmarks = null;
            if (faceInFlightIdx !== -1) {
              faceSyncedIdx = faceInFlightIdx;
              faceSyncedAt = performance.now();
            }
          }
        }
        faceInFlightIdx = -1;
      });
    }

    let selfieSeg = null;
    if (typeof global.SelfieSegmentation !== 'undefined') {
      selfieSeg = new global.SelfieSegmentation({
        locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
      });
      selfieSeg.setOptions(CONFIG.SEGMENTATION_OPTIONS);
      selfieSeg.onResults((res) => {
        if (res.segmentationMask) {
          const rect = coords.getCoverRect(camVideo.videoWidth, camVideo.videoHeight, window.innerWidth, window.innerHeight);
          auraRenderer.updateMask(res.segmentationMask, camVideo, rect);
        }
      });
    }

    // Fixed 50/60 FPS VFX Render Loop
    let lastRender = performance.now();
    let nextRenderAt = lastRender;
    let fpsFrames = 0;
    let fpsLast = performance.now();
    let camSyncDirty = true;
    let skeletonDirty = true;

    function renderLoop(now) {
      const ts = typeof now === 'number' ? now : performance.now();
      const targetFps = state.targetFps || 60;
      const frameInterval = 1000 / targetFps;

      // Accumulator pacing with -2.2ms VSync jitter allowance prevents dropping 60Hz -> 30fps
      if (ts < nextRenderAt - 2.2) {
        global.requestAnimationFrame(renderLoop);
        return;
      }
      nextRenderAt = ts - nextRenderAt > frameInterval * 2.5
        ? ts + frameInterval
        : nextRenderAt + frameInterval;

      const dt = Math.min(0.05, Math.max(0.001, (ts - lastRender) / 1000));
      lastRender = ts;
      const timeSec = ts / 1000;

      fpsFrames++;
      if (ts - fpsLast >= 500) {
        const fps = Math.round((fpsFrames * 1000) / (ts - fpsLast));
        fpsPill.textContent = `${fps} / ${targetFps} FPS`;
        fpsFrames = 0;
        fpsLast = ts;
      }

      const viewW = window.innerWidth;
      const viewH = window.innerHeight;
      const rect = coords.getCoverRect(camVideo.videoWidth, camVideo.videoHeight, viewW, viewH);

      const camSyncCtx  = coords.syncCanvasSize(camSyncCanvas, viewW, viewH);
      const auraCtx     = coords.syncCanvasSize(auraCanvas, viewW, viewH);
      const backCtx     = coords.syncCanvasSize(backCanvas, viewW, viewH);
      const skeletonCtx = coords.syncCanvasSize(skeletonCanvas, viewW, viewH);
      const frontCtx    = coords.syncCanvasSize(frontCanvas, viewW, viewH);

      // Lock displayed camera frame to FaceMesh landmarks whenever eye effects are active
      const effEye = resolveEyeMode();
      const showSyncedCam =
        state.aiEnhanced &&
        effEye !== 'none' &&
        faceSyncedIdx !== -1 &&
        ts - faceSyncedAt < 400 &&
        camVideo.videoWidth > 0 &&
        faceCapBufs[faceSyncedIdx].width > 0;

      if (showSyncedCam) {
        const src = faceCapBufs[faceSyncedIdx];
        camSyncCtx.save();
        camSyncCtx.clearRect(0, 0, viewW, viewH);
        camSyncCtx.translate(viewW, 0);
        camSyncCtx.scale(-1, 1);
        camSyncCtx.drawImage(src, viewW - rect.ox - rect.rw, rect.oy, rect.rw, rect.rh);
        camSyncCtx.restore();
        camSyncDirty = true;
      } else if (camSyncDirty) {
        camSyncCtx.clearRect(0, 0, viewW, viewH);
        camSyncDirty = false;
      }

      frontCtx.clearRect(0, 0, viewW, viewH);

      const faceInfo = state.aiEnhanced && latestFaceLandmarks
        ? vfx.extractFaceInfo(latestFaceLandmarks, rect)
        : null;

      if (faceInfo) {
        latestGesture.mouthFireball = faceInfo.mouthOpenRatio > 0.4;
      } else {
        latestGesture.mouthFireball = false;
      }

      // Layer 1: Body modes (Clones / Sage / Kurama / Six Paths)
      auraRenderer.draw(auraCtx, camVideo, rect, state.bodyMode, faceInfo, particles, dt, timeSec);

      // Layer 2: Hand Skeleton
      if (state.showSkeleton && latestGesture.hands.length > 0) {
        handVfx.drawSkeleton(skeletonCtx, latestGesture.hands, rect);
        skeletonDirty = true;
      } else if (skeletonDirty) {
        skeletonCtx.clearRect(0, 0, viewW, viewH);
        skeletonDirty = false;
      }

      // Layer 3: Eyes
      if (state.aiEnhanced && faceInfo && effEye !== 'none') {
        vfx.drawDojutsuEyes(frontCtx, faceInfo, effEye, timeSec);
      }

      // Layer 4: Hand Jutsu, Flying Projectiles, Video Orbs, Summon Seals & Particles
      handVfx.render(frontCtx, backCtx, latestGesture, faceInfo, rect, particles, audio, dt, timeSec);
      if (latestGesture.steerCommand && projectiles.hasGuided() && ts - latestGestureAt < 240) {
        const sc = latestGesture.steerCommand;
        const handPt = sc.handNorm ? coords.normToScreen(sc.handNorm.x, sc.handNorm.y, rect) : null;
        projectiles.steerGuided(sc.dirX, sc.dirY, handPt, dt);
      }
      projectiles.updateAndDraw(frontCtx, rect, particles, audio, dt, timeSec);
      particles.updateAndDraw(frontCtx, dt);

      global.requestAnimationFrame(renderLoop);
    }

    function drawAiInput(buf, videoEl, maxW) {
      const vw = videoEl.videoWidth;
      const vh = videoEl.videoHeight;
      if (!vw || !vh) return null;
      const scale = vw > maxW ? maxW / vw : 1;
      const w = Math.max(2, Math.round(vw * scale));
      const h = Math.max(2, Math.round(vh * scale));
      if (buf.width !== w || buf.height !== h) {
        buf.width = w;
        buf.height = h;
      }
      const ctx = buf.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(videoEl, 0, 0, w, h);
      return buf;
    }

    // Sequential AI frame scheduler (MediaPipe Solutions cannot run .send() concurrently)
    let frameIndex = 0;
    let aiFrameBusy = false;
    let activeStream = null;
    let pumpSessionId = 0;
    let lastTrackedVideoTime = -1;

    function persistCameraId(deviceId) {
      state.selectedCameraId = deviceId || '';
      try {
        if (global.localStorage) {
          if (state.selectedCameraId) {
            global.localStorage.setItem('naruto_camera_id', state.selectedCameraId);
          } else {
            global.localStorage.removeItem('naruto_camera_id');
          }
        }
      } catch (_) {}
    }

    function stopActiveCamera() {
      pumpSessionId++;
      lastTrackedVideoTime = -1;
      if (activeStream) {
        const tracks = activeStream.getTracks ? activeStream.getTracks() : [];
        for (let i = 0; i < tracks.length; i++) {
          tracks[i].stop();
        }
        activeStream = null;
      }
      if (camVideo.srcObject) {
        camVideo.srcObject = null;
      }
    }

    async function refreshCameraList(preferredId) {
      const selects = [camSelect, camOverlaySel].filter(Boolean);
      if (!selects.length || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return;
      }
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d && d.kind === 'videoinput');
        const targetId = preferredId !== undefined ? preferredId : state.selectedCameraId;

        for (let s = 0; s < selects.length; s++) {
          const sel = selects[s];
          sel.innerHTML = '';

          const defaultOpt = document.createElement('option');
          defaultOpt.value = '';
          defaultOpt.textContent = videoInputs.length ? 'Camera: Auto' : 'Camera: Default';
          sel.appendChild(defaultOpt);

          let matched = false;
          for (let i = 0; i < videoInputs.length; i++) {
            const dev = videoInputs[i];
            const opt = document.createElement('option');
            opt.value = dev.deviceId || '';
            opt.textContent = dev.label || `Camera ${i + 1}`;
            if (targetId && dev.deviceId === targetId) {
              matched = true;
            }
            sel.appendChild(opt);
          }

          sel.value = matched ? targetId : '';
        }
      } catch (err) {
        console.warn('Could not enumerate cameras:', err);
      }
    }

    async function processTrackingFrame() {
      if (!camVideo.videoWidth || aiFrameBusy) return;
      aiFrameBusy = true;
      frameIndex++;
      try {
        const handInput = drawAiInput(aiHandBuf, camVideo, CONFIG.AI_HAND_INPUT_WIDTH || 640) || camVideo;
        await hands.send({ image: handInput });

        if (state.aiEnhanced) {
          const effEye = resolveEyeMode();
          const needFace = Boolean(faceMesh) && (effEye !== 'none' || frameIndex % 2 === 0);
          const needSeg = Boolean(selfieSeg) && state.bodyMode !== 'none';

          if (needSeg && frameIndex % 3 === 0) {
            // Yield a paint turn between heavy WASM calls so renderLoop stays locked at 50/60 FPS
            await new Promise((r) => setTimeout(r, 0));
            await selfieSeg.send({ image: handInput });
          } else if (needFace && faceInFlightIdx === -1) {
            const capIdx = faceSyncedIdx === 0 ? 1 : 0;
            const cap = drawAiInput(faceCapBufs[capIdx], camVideo, CONFIG.AI_FACE_INPUT_WIDTH || 960);
            if (cap) {
              await new Promise((r) => setTimeout(r, 0));
              faceInFlightIdx = capIdx;
              try {
                await faceMesh.send({ image: cap });
              } finally {
                if (faceInFlightIdx !== -1) faceInFlightIdx = -1;
              }
            } else {
              await faceMesh.send({ image: camVideo });
            }
          }
        }
      } catch (err) {
        console.warn('Tracking frame skipped:', err);
      } finally {
        aiFrameBusy = false;
      }
    }

    function startTrackingPump(sessionId) {
      if (typeof camVideo.requestVideoFrameCallback === 'function') {
        const onVideoFrame = () => {
          if (sessionId !== pumpSessionId) return;
          if (!aiFrameBusy && camVideo.videoWidth > 0) {
            processTrackingFrame();
          }
          camVideo.requestVideoFrameCallback(onVideoFrame);
        };
        camVideo.requestVideoFrameCallback(onVideoFrame);
        return;
      }

      const onRafFrame = () => {
        if (sessionId !== pumpSessionId) return;
        const vt = camVideo.currentTime;
        if (!aiFrameBusy && camVideo.videoWidth > 0 && vt !== lastTrackedVideoTime) {
          lastTrackedVideoTime = vt;
          processTrackingFrame();
        }
        global.requestAnimationFrame(onRafFrame);
      };
      global.requestAnimationFrame(onRafFrame);
    }

    async function openCameraStream(deviceId) {
      const videoConstraints = deviceId
        ? {
            deviceId: { exact: deviceId },
            width: { ideal: CONFIG.CAMERA_WIDTH },
            height: { ideal: CONFIG.CAMERA_HEIGHT }
          }
        : {
            width: { ideal: CONFIG.CAMERA_WIDTH },
            height: { ideal: CONFIG.CAMERA_HEIGHT },
            facingMode: 'user'
          };

      return navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });
    }

    async function startCamera(requestedDeviceId, explicitSelect) {
      camOverlay.classList.remove('visible');
      statusText.textContent = 'Starting webcam & AI models...';

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        camErrorMsg.textContent =
          'Webcam access requires HTTPS or localhost. On Windows, run start.bat (or "python -m http.server 8080") and open http://localhost:8080.';
        camOverlay.classList.add('visible');
        return false;
      }

      const targetId = requestedDeviceId !== undefined ? requestedDeviceId : state.selectedCameraId;
      if (explicitSelect) {
        persistCameraId(targetId);
      }

      stopActiveCamera();
      const sessionId = pumpSessionId;

      try {
        let stream;
        try {
          stream = await openCameraStream(targetId);
        } catch (err) {
          const isMissingDevice =
            targetId && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError');
          if (!isMissingDevice) {
            throw err;
          }
          persistCameraId('');
          stream = await openCameraStream('');
        }

        if (sessionId !== pumpSessionId) {
          const staleTracks = stream.getTracks ? stream.getTracks() : [];
          for (let i = 0; i < staleTracks.length; i++) {
            staleTracks[i].stop();
          }
          return false;
        }

        activeStream = stream;
        camVideo.srcObject = stream;
        if (typeof camVideo.play === 'function') {
          await camVideo.play();
        }

        const videoTracks = stream.getVideoTracks ? stream.getVideoTracks() : [];
        const activeSettings =
          videoTracks[0] && typeof videoTracks[0].getSettings === 'function'
            ? videoTracks[0].getSettings()
            : null;
        const resolvedId = state.selectedCameraId || (activeSettings && activeSettings.deviceId) || '';

        await refreshCameraList(resolvedId);
        startTrackingPump(sessionId);
        return true;
      } catch (err) {
        camErrorMsg.textContent = `Could not start camera: ${err.message || err}. Make sure camera permissions are allowed and no other app is locking it.`;
        camOverlay.classList.add('visible');
        await refreshCameraList('');
        return false;
      }
    }

    if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
      navigator.mediaDevices.addEventListener('devicechange', () => {
        refreshCameraList();
      });
    }

    btnRetryCam.addEventListener('click', () => {
      startCamera(state.selectedCameraId);
    });

    buildDock();
    buildGuide();
    buildVideoSlotsUi();
    syncUi();
    startCamera(state.selectedCameraId);
    global.requestAnimationFrame(renderLoop);
  }

  global.addEventListener('DOMContentLoaded', initApp);
})(window);
