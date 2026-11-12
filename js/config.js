(function (global) {
  'use strict';

  const Shinobi = (global.Shinobi = global.Shinobi || {});

  Shinobi.CONFIG = {
    CAMERA_WIDTH: 1280,
    CAMERA_HEIGHT: 720,
    TARGET_FPS: 60,
    FPS_PRESETS: [60, 50],
    RENDER_MAX_DPR: 1,
    AI_HAND_INPUT_WIDTH: 640,
    AI_FACE_INPUT_WIDTH: 960,

    HANDS_OPTIONS: {
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.55,
      minTrackingConfidence: 0.50
    },

    FACE_OPTIONS: {
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.55,
      minTrackingConfidence: 0.45
    },

    SEGMENTATION_OPTIONS: {
      modelSelection: 1
    },

    // Skeleton overlay palettes per MediaPipe handedness label
    PALETTES: {
      Left:  { bone: '#ff8a3d', joint: '#fff36a', glow: '#ff5e1a' },
      Right: { bone: '#62f0ff', joint: '#ff66e0', glow: '#1aa6ff' }
    },

    // Optional black-background MP4 overlays.
    // Built-in procedural VFX run automatically when a slot has no video file.
    DEFAULT_VIDEOS: {
      rasengan: 'assets/rasengan.mp4',
      odama_rasengan: 'assets/rasengan.mp4',
      rasenshuriken: 'assets/rasengan.mp4',
      chidori: '',
      bijudama: '',
      fireball: '',
      amaterasu: ''
    },

    TIMING: {
      CHARGE_RATE: 0.12,
      DECAY_RATE: 0.2,
      POSE_HOLD_MS: 220,
      POSE_CONFIRM_MS: 42,
      POSE_DROP_GRACE_MS: 95,
      COMBO_HOLD_MS: 420,
      SIGN_GRACE_MS: 220,
      COMBO_COOLDOWN_MS: 1600,
      SLAM_VELOCITY: 1.55,
      SLAM_COOLDOWN_MS: 2200,
      THROW_SPEED: 1.05,
      THROW_COOLDOWN_MS: 620,
      SMOOTHING: 0.36
    }
  };
})(window);
