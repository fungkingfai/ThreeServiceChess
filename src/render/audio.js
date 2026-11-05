/**
 * 三軍棋 3D — WebAudio 程序合成音效
 * ------------------------------------------------------------------
 * 不載入任何音檔；以 Oscillator / Noise + Filter 合成：
 * 落子、移動、戰鬥、爆炸、飛彈、偵察、勝利／失敗、升旗。
 */
export function createAudio() {
  let ctx = null;
  let master = null;
  let enabled = true;
  let noiseBuffer = null;

  function ensure() {
    if (!enabled) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
      // 預生成 1 秒白噪聲
      const len = Math.floor(ctx.sampleRate);
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone({ freq = 440, freqEnd = null, type = 'sine', dur = 0.2, vol = 0.2, delay = 0, attack = 0.005 }) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  function noise({ dur = 0.3, vol = 0.25, type = 'lowpass', freq = 1200, freqEnd = null, q = 1, delay = 0 }) {
    const c = ensure();
    if (!c || !noiseBuffer) return;
    const t0 = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, t0);
    if (freqEnd != null) filter.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t0 + dur);
    const gain = c.createGain();
    gain.gain.setValueAtTime(Math.max(0.0002, vol), t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.03);
  }

  const SOUNDS = {
    /** 選取棋子（清脆金屬聲） */
    select() {
      tone({ freq: 1180, freqEnd: 1560, type: 'triangle', dur: 0.09, vol: 0.12 });
      tone({ freq: 2360, type: 'sine', dur: 0.05, vol: 0.05, delay: 0.01 });
    },
    /** 落子／移動（木頭喀噠聲） */
    move() {
      tone({ freq: 190, freqEnd: 95, type: 'sine', dur: 0.12, vol: 0.22 });
      noise({ dur: 0.06, vol: 0.08, type: 'lowpass', freq: 900 });
    },
    /** 鐵路移動（金屬滾動） */
    rail() {
      for (let i = 0; i < 3; i++) {
        noise({ dur: 0.06, vol: 0.06, type: 'bandpass', freq: 2200, q: 6, delay: i * 0.09 });
        tone({ freq: 320 - i * 30, type: 'square', dur: 0.05, vol: 0.035, delay: i * 0.09 });
      }
    },
    /** 海軍航行（水聲） */
    sea() {
      noise({ dur: 0.35, vol: 0.1, type: 'lowpass', freq: 900, freqEnd: 300, q: 0.7 });
    },
    /** 飛機呼嘯 */
    air() {
      noise({ dur: 0.4, vol: 0.12, type: 'bandpass', freq: 700, freqEnd: 2200, q: 1.2 });
    },
    /** 部署／落地 */
    deploy() {
      tone({ freq: 150, freqEnd: 60, type: 'sine', dur: 0.18, vol: 0.28 });
      noise({ dur: 0.08, vol: 0.08, type: 'lowpass', freq: 700 });
    },
    /** 戰鬥金屬碰撞 */
    battle() {
      for (let i = 0; i < 3; i++) {
        noisEclash(i);
      }
      function noisEclash(i) {
        noise({ dur: 0.12, vol: 0.15, type: 'bandpass', freq: 1800 + i * 700, q: 4, delay: i * 0.05 });
        tone({ freq: 520 + i * 130, freqEnd: 260, type: 'square', dur: 0.09, vol: 0.06, delay: i * 0.05 });
      }
    },
    /** 爆炸 */
    explosion() {
      noise({ dur: 0.55, vol: 0.42, type: 'lowpass', freq: 1800, freqEnd: 90, q: 0.8 });
      tone({ freq: 110, freqEnd: 32, type: 'sine', dur: 0.5, vol: 0.3 });
      tone({ freq: 65, freqEnd: 30, type: 'triangle', dur: 0.6, vol: 0.2, delay: 0.03 });
    },
    /** 飛彈發射 */
    missile() {
      noise({ dur: 0.7, vol: 0.16, type: 'bandpass', freq: 400, freqEnd: 2600, q: 2 });
      tone({ freq: 220, freqEnd: 900, type: 'sawtooth', dur: 0.6, vol: 0.05 });
    },
    /** 偵察掃描 */
    scan() {
      tone({ freq: 1400, type: 'sine', dur: 0.4, vol: 0.07 });
      tone({ freq: 2100, type: 'sine', dur: 0.35, vol: 0.05, delay: 0.12 });
      tone({ freq: 2800, type: 'sine', dur: 0.3, vol: 0.03, delay: 0.24 });
    },
    /** 升旗／奪旗 */
    flag() {
      for (let i = 0; i < 4; i++) {
        tone({ freq: 392 * Math.pow(1.26, i), type: 'triangle', dur: 0.3, vol: 0.1, delay: i * 0.12 });
      }
      tone({ freq: 98, type: 'sine', dur: 0.8, vol: 0.15 });
    },
    /** 勝利號角 */
    win() {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => {
        tone({ freq: f, type: 'triangle', dur: 0.5, vol: 0.14, delay: i * 0.16 });
        tone({ freq: f / 2, type: 'sine', dur: 0.5, vol: 0.08, delay: i * 0.16 });
      });
      tone({ freq: 1046.5, type: 'triangle', dur: 1.2, vol: 0.1, delay: 0.7 });
    },
    /** 失敗低音 */
    lose() {
      const notes = [392, 349.23, 293.66, 220];
      notes.forEach((f, i) => {
        tone({ freq: f, type: 'sine', dur: 0.6, vol: 0.14, delay: i * 0.2 });
      });
      noise({ dur: 1.0, vol: 0.08, type: 'lowpass', freq: 500, freqEnd: 120, delay: 0.2 });
    },
    /** 回合提示 */
    turn() {
      tone({ freq: 720, type: 'sine', dur: 0.12, vol: 0.06 });
      tone({ freq: 960, type: 'sine', dur: 0.16, vol: 0.06, delay: 0.1 });
    },
    /** 錯誤／不可行 */
    error() {
      tone({ freq: 180, freqEnd: 120, type: 'square', dur: 0.12, vol: 0.08 });
    },
  };

  return {
    play(name) {
      if (!enabled) return;
      const fn = SOUNDS[name];
      if (fn) {
        try {
          fn();
        } catch (e) {
          // 音效失敗不影響遊戲
        }
      }
    },
    unlock() {
      ensure();
    },
    setEnabled(on) {
      enabled = !!on;
      if (enabled) ensure();
      else if (master) master.gain.value = 0;
      if (enabled && master) master.gain.value = 0.55;
    },
    get enabled() {
      return enabled;
    },
    dispose() {
      try {
        ctx?.close();
      } catch (e) { /* noop */ }
      ctx = null;
      master = null;
    },
  };
}

export default createAudio;
