'use strict';

// ===================================================
// FACTORYFLOW SECTOR SOUNDS – Web Audio API
// Sem arquivos externos. Funciona offline.
// ===================================================

(function () {
  let _ctx = null;

  function getCtx() {
    if (!_ctx || _ctx.state === 'closed') {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
  }

  function tone(ctx, freq, type, t, dur, peak) {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // ── 1. CHEGADA NORMAL – sino suave único ──
  window.ffSoundNormalArrival = function () {
    try {
      const ctx = getCtx();
      const t   = ctx.currentTime;
      tone(ctx, 880,  'sine', t,        0.7,  0.22);
      tone(ctx, 1320, 'sine', t + 0.08, 0.4,  0.08);
    } catch (e) { console.warn('[ffSound] normal:', e.message); }
  };

  // ── 2. CHEGADA URGENTE – duplo bip agudo ──
  window.ffSoundUrgentArrival = function () {
    try {
      const ctx = getCtx();
      const t   = ctx.currentTime;
      tone(ctx, 1200, 'square', t,        0.18, 0.18);
      tone(ctx, 1400, 'square', t + 0.22, 0.18, 0.22);
    } catch (e) { console.warn('[ffSound] urgent:', e.message); }
  };

  // ── 3. CHEGADA MESMO DIA – alarme triplo escalando ──
  window.ffSoundSameDayArrival = function () {
    try {
      const ctx = getCtx();
      const t   = ctx.currentTime;
      tone(ctx, 900,  'sawtooth', t,        0.14, 0.20);
      tone(ctx, 1100, 'sawtooth', t + 0.18, 0.14, 0.22);
      tone(ctx, 1350, 'sawtooth', t + 0.36, 0.14, 0.26);
      // eco final
      tone(ctx, 1350, 'sine',     t + 0.55, 0.25, 0.15);
    } catch (e) { console.warn('[ffSound] sameday:', e.message); }
  };

  // ── 4. CONCLUSÃO – fanfarra de conquista ──
  window.ffSoundCompletion = function () {
    try {
      const ctx   = getCtx();
      const t     = ctx.currentTime;
      // C4-E4-G4-C5 arpejo com harmônico
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((f, i) => {
        tone(ctx, f,       'sine',     t + i * 0.13, 0.55, 0.30);
        tone(ctx, f * 2,   'sine',     t + i * 0.13, 0.30, 0.08);
      });
      // acorde final sustentado
      [523.25, 659.25, 783.99].forEach(f => {
        tone(ctx, f, 'sine', t + 0.65, 0.60, 0.18);
      });
    } catch (e) { console.warn('[ffSound] completion:', e.message); }
  };

  // Helper: toca pelo priority string
  window.ffSoundForPriority = function (priority) {
    const p = String(priority || '').toLowerCase();
    if (p === 'sameday' || p === 'mesmo_dia' || p === 'mesmodia') {
      ffSoundSameDayArrival();
    } else if (p === 'urgent' || p === 'urgente') {
      ffSoundUrgentArrival();
    } else {
      ffSoundNormalArrival();
    }
  };
})();
