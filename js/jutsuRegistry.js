(function (global) {
  'use strict';

  const Shinobi = (global.Shinobi = global.Shinobi || {});

  Shinobi.JUTSU = {
    // Hand Jutsu (triggered directly by hand signs)
    rasengan: {
      id: 'rasengan',
      name: 'Rasengan',
      jp: '螺旋丸',
      layer: 'hand',
      signIcon: '🖐️',
      gesture: 'Open Palm • Swipe, Point (☝️) or Click to Fly & Steer',
      color: '#4ae8ff',
      supportsVideo: true,
      scaleFactor: 6.8,
      liftFactor: 1.45
    },
    odama_rasengan: {
      id: 'odama_rasengan',
      name: 'Odama Rasengan',
      jp: '大玉螺旋丸',
      layer: 'hand',
      signIcon: '🖐️🖐️',
      gesture: 'Both Open Palms Cradling Together',
      color: '#7ef3ff',
      supportsVideo: true,
      scaleFactor: 10.5,
      liftFactor: 1.35
    },
    rasenshuriken: {
      id: 'rasenshuriken',
      name: 'Rasenshuriken',
      jp: '風遁・螺旋手裏剣',
      layer: 'hand',
      signIcon: '🔱',
      gesture: 'Three Fingers (Index + Middle + Ring) • Swipe or Point (☝️) to Fly & Steer',
      color: '#88f7ff',
      supportsVideo: true,
      scaleFactor: 3.1,
      liftFactor: 1.55
    },
    chidori: {
      id: 'chidori',
      name: 'Chidori',
      jp: '千鳥',
      layer: 'hand',
      signIcon: '✌️',
      gesture: 'Half-Seal (Index + Middle) • Swipe or Point (☝️) to Fly & Steer',
      color: '#5ecbff',
      supportsVideo: true,
      scaleFactor: 2.3,
      liftFactor: 0.9
    },
    fireball: {
      id: 'fireball',
      name: 'Fireball Jutsu',
      jp: '火遁・豪火球',
      layer: 'hand',
      signIcon: '☝️',
      gesture: 'Point Sign (Index) or Wide Mouth • Point/Move Hand to Steer Flying Orb',
      color: '#ff7b29',
      supportsVideo: true,
      scaleFactor: 2.4,
      liftFactor: 1.15
    },
    amaterasu: {
      id: 'amaterasu',
      name: 'Amaterasu',
      jp: '天照',
      layer: 'hand',
      signIcon: '👌',
      gesture: 'OK / Pinch Sign • Swipe or Point (☝️) to Fly & Steer',
      color: '#c94bff',
      supportsVideo: true,
      scaleFactor: 2.2,
      liftFactor: 1.3
    },
    bijudama: {
      id: 'bijudama',
      name: 'Bijudama',
      jp: '尾獣玉',
      layer: 'hand',
      signIcon: '✊✊',
      gesture: 'Both Fists Cupped Facing Each Other',
      color: '#b83bff',
      supportsVideo: true,
      scaleFactor: 2.8,
      liftFactor: 0.0
    },

    // Body / Transformation Modes (hold sign ~0.4s to toggle)
    shadow_clones: {
      id: 'shadow_clones',
      name: 'Shadow Clones',
      jp: '影分身の術',
      layer: 'body',
      signIcon: '✚',
      gesture: 'Crossed Index Fingers (+ Seal)',
      color: '#cfe9ff'
    },
    sage_mode: {
      id: 'sage_mode',
      name: 'Sage Mode',
      jp: '仙人モード',
      layer: 'body',
      signIcon: '🙏',
      gesture: 'Clasped Open Palms Upright (Prayer)',
      color: '#ffd45a'
    },
    kurama_mode: {
      id: 'kurama_mode',
      name: 'Kurama Mode',
      jp: '九喇嘛モード',
      layer: 'body',
      signIcon: '⚔️',
      gesture: 'Crossed Wrists / Fists (X)',
      color: '#ff9d2e'
    },
    six_paths: {
      id: 'six_paths',
      name: 'Six Paths Mode',
      jp: '六道仙人モード',
      layer: 'body',
      signIcon: '🙌',
      gesture: 'Both Open Palms Raised High',
      color: '#ffe885'
    },

    // Dōjutsu Eye Modes (hold sign ~0.4s to toggle)
    sharingan: {
      id: 'sharingan',
      name: 'Sharingan',
      jp: '写輪眼',
      layer: 'eye',
      signIcon: '😉',
      gesture: 'Close One Eye (Right Eye ~0.4s) to Toggle',
      color: '#ff2b3d'
    },
    mangekyo: {
      id: 'mangekyo',
      name: 'Mangekyō',
      jp: '万華鏡写輪眼',
      layer: 'eye',
      signIcon: '😜',
      gesture: 'Close Other Eye (Left Eye ~0.4s) to Toggle',
      color: '#ff2b3d'
    },
    rinnegan: {
      id: 'rinnegan',
      name: 'Rinnegan',
      jp: '輪廻眼',
      layer: 'eye',
      signIcon: '✌️✌️',
      gesture: 'Both Hands Half-Seal Upright Side-by-Side',
      color: '#b993ff'
    },
    byakugan: {
      id: 'byakugan',
      name: 'Byakugan',
      jp: '白眼',
      layer: 'eye',
      signIcon: '🤙',
      gesture: 'Hold Shaka Sign (Thumb + Pinky)',
      color: '#e6e8ff'
    },

    // Burst Events
    summoning: {
      id: 'summoning',
      name: 'Summoning Jutsu',
      jp: '口寄せの術',
      layer: 'burst',
      signIcon: '👇',
      gesture: 'Fast Downward Palm / Fist Slam',
      color: '#ff4b4b'
    }
  };
})(window);
