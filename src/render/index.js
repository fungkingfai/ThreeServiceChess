/**
 * 三軍棋 3D — View 主控
 * ------------------------------------------------------------------
 * createView(container, { board, pieces }) -> View
 * 介面依 DESIGN.md §3.2 實作。
 *
 * 主要流程（main.js 建議用法）：
 *   const view = createView(el, { board, pieces });
 *   await view.ready();
 *   view.sync(game.getView('south'));          // 依狀態更新棋子
 *   view.animateEvents(result.events);          // 播放動畫（可不等）
 *   ... 動畫結束後再次 sync(view) 即可。
 */
import * as THREE from 'three';
import { createStage } from './scene.js';
import { createBoard3D } from './board3d.js';
import { createPieceFactory, DEFAULT_SIDE_COLORS, normalizeSideColors } from './pieces.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import * as U from './utils.js';
import { NODE, NODE as NODE_MAP, DEPLOY_ZONES, AIRPORT_NODES } from '../core/board.js';
import { BRANCH } from '../core/pieces.js';

const AIRPORT_SET = new Set([...AIRPORT_NODES.north, ...AIRPORT_NODES.south]);

/** 棋子視覺放大倍率（讓 30 種造型在預設鏡頭下可辨識） */
const PIECE_SCALE = 1.26;

const REASON_TEXT = {
  flag: '奪得敵方軍旗',
  nomoves: '敵軍已無子可動',
  noMoves: '敵軍已無子可動',
  surrender: '敵方投降',
  stalemate: '雙方均無法行動',
  draw: '雙方均無法行動',
};

export function createView(container, options = {}) {
  const stage = createStage(container);
  const root = new THREE.Group();
  root.name = 'view-root';
  stage.scene.add(root);

  const board = createBoard3D({ sideColors: normalizeSideColors(options.sideColors || DEFAULT_SIDE_COLORS) });
  root.add(board.group);

  const sideColors = normalizeSideColors(options.sideColors || DEFAULT_SIDE_COLORS);
  const factory = createPieceFactory({ sideColors });
  const fx = createEffects({ scene: stage.scene, camera: stage.camera, stage });
  const audio = createAudio();

  /* ---------------- 觸控 / 手機偵測 ---------------- */
  const canvasEl = stage.renderer.domElement;
  canvasEl.style.touchAction = 'none';
  canvasEl.style.userSelect = 'none';
  canvasEl.style.webkitUserSelect = 'none';
  canvasEl.style.webkitTapHighlightColor = 'transparent';

  const coarseMedia = typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)')
    : null;
  let coarsePointer = !!(coarseMedia?.matches || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0));

  /** 手機/平板（coarse pointer 或窄畫面） */
  function isMobileLayout() {
    return coarsePointer || (container.clientWidth > 0 && container.clientWidth < 700);
  }

  /** 觸控時放大棋子點擊判定筒（不影響視覺） */
  function hitRadiusScale() {
    return isMobileLayout() ? 1.55 : 1;
  }

  const pieces = new Map();
  const hitTargets = [];
  const sharedHitGeo = new THREE.CylinderGeometry(0.46, 0.46, 1.6, 8);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });

  let state = null;
  let interactive = true;
  let autoFrame = true;
  /** 目前「可點擊目標」的高亮節點集合（move/attack/deploy）。
   *  手機上棋子 hit 筒放大後，目標格可能落在 hit 筒內，
   *  此時應優先判定為節點點擊（移動/攻擊），而不是重新選取棋子。 */
  let highlightPriorityIds = new Set();
  let selectedUid = null;
  let animating = 0;
  let deployMode = false;
  let highlightKind = null;
  let perspective = 'south';
  let soundOn = true;
  let nodePickCb = null;
  let piecePickCb = null;
  let frames = 0;
  let disposed = false;
  let lastFlagRevealed = null;

  /* ================================================================ */
  /* 建立 / 銷毀棋子視覺                                                */
  /* ================================================================ */
  function createVisual(p) {
    const obj = factory.createPiece({
      uid: p.uid,
      side: p.side,
      key: p.key ?? null,
      branch: p.branch,
    });
    obj.uid = p.uid;
    obj.side = p.side;
    obj.key = p.key ?? null;
    obj.branch = p.branch;
    obj.isAir = p.branch === BRANCH.AIR;
    obj.isNavy = p.branch === BRANCH.NAVY;
    obj.locked = false;
    obj.dead = false;
    obj.deadSince = 0;
    obj.baseAltitude = 0;
    obj.nodeId = null;
    obj.phase = (Number(p.uid) || 0) % 7;
    // 不可見的點擊判定筒
    const hit = new THREE.Mesh(sharedHitGeo, hitMat);
    hit.position.y = 0.75;
    const hs = hitRadiusScale();
    hit.scale.set(hs, 1, hs);
    hit.userData.uid = p.uid;
    obj.hitMesh = hit;
    obj.group.add(hit);
    root.add(obj.group);
    hitTargets.push(hit);
    pieces.set(p.uid, obj);
    // 進場：由小放大
    obj.group.scale.setScalar(0.02);
    fx.tween(
      0.5,
      (k) => {
        if (!pieces.has(obj.uid)) return;
        obj.group.scale.setScalar((0.02 + k * 0.98) * PIECE_SCALE);
      },
      {
        ease: U.Ease.outBack,
        onComplete: () => {
          if (pieces.has(obj.uid)) obj.group.scale.setScalar(PIECE_SCALE);
        },
      }
    );
    return obj;
  }

  function destroyVisual(obj) {
    if (!obj) return;
    const idx = hitTargets.indexOf(obj.hitMesh);
    if (idx >= 0) hitTargets.splice(idx, 1);
    root.remove(obj.group);
    pieces.delete(obj.uid);
  }

  function placeVisual(obj, nodeId) {
    const n = NODE_MAP[nodeId];
    if (!n) return;
    const y = board.groundY(nodeId);
    obj.nodeId = nodeId;
    obj.group.position.set(n.x, y, n.z);
    if (obj.isAir) {
      obj.baseAltitude = AIRPORT_SET.has(nodeId) ? 0.36 : 1.12;
      obj.setAltitude(obj.baseAltitude);
    } else if (obj.isNavy) {
      obj.setAltitude(0);
    }
  }

  /* ================================================================ */
  /* 狀態同步                                                          */
  /* ================================================================ */
  function sync(nextState) {
    if (!nextState) return;
    state = nextState;
    const list = Array.isArray(nextState.pieces) ? nextState.pieces : [];
    const seen = new Set();
    for (const p of list) {
      seen.add(p.uid);
      if (p.alive === false && !pieces.has(p.uid)) continue; // 已消滅且無視覺，不需建立
      let obj = pieces.get(p.uid);
      const key = p.key ?? null;
      // 新棋子或棋種揭露 → 重建模型（保留位置）
      if (!obj || (key != null && obj.key !== key)) {
        const oldNode = obj?.nodeId;
        if (obj) destroyVisual(obj);
        obj = createVisual({ ...p, key });
        if (oldNode != null) placeVisual(obj, oldNode);
      }
      obj.key = key;
      obj.branch = p.branch;
      obj.side = p.side;
      obj.dead = p.alive === false;
      if (obj.dead && !obj.deadSince) obj.deadSince = performance.now();
      if (!obj.dead) obj.deadSince = 0;
      obj.setHidden(key == null);
      if (!obj.locked && p.nodeId != null) placeVisual(obj, p.nodeId);
      // 同步死亡棋子的隱藏（動畫期間保留，讓動畫可播放）
      if (obj.dead && animating === 0) {
        // 讓 animateEvents 有機會接手，稍後再清理
      }
    }
    // 移除已不在視圖中的棋子
    for (const [uid, obj] of Array.from(pieces.entries())) {
      if (!seen.has(uid)) destroyVisual(obj);
    }
    lastFlagRevealed = nextState.flagRevealed || null;
  }

  /** 重建某枚棋子為「已揭露」狀態 */
  function revealVisual(uid, key) {
    const obj = pieces.get(uid);
    if (!obj || !key || obj.key === key) return;
    const nodeId = obj.nodeId;
    const wasLocked = obj.locked;
    const pos = obj.group.position.clone();
    destroyVisual(obj);
    const nObj = createVisual({ uid, side: obj.side, key, branch: obj.branch });
    nObj.group.position.copy(pos);
    nObj.nodeId = nodeId;
    nObj.locked = wasLocked;
    nObj.key = key;
    nObj.setHidden(false);
  }

  function applyRevealList(reveal) {
    if (!Array.isArray(reveal)) return;
    for (const r of reveal) {
      if (r && r.uid != null && r.key) revealVisual(r.uid, r.key);
    }
  }

  /* ================================================================ */
  /* 事件動畫                                                          */
  /* ================================================================ */
  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();

  function nodePos(id) {
    return board.nodeWorld(id);
  }

  function pieceColor(obj) {
    const set = factory.materials[obj?.side] || factory.materials.south;
    return set.main.color.getHex();
  }

  async function slidePieceTo(obj, target, duration, mode = 'walk') {
    const from = obj.group.position.clone();
    await fx.tween(
      duration,
      (k) => {
        obj.group.position.x = from.x + (target.x - from.x) * k;
        obj.group.position.z = from.z + (target.z - from.z) * k;
        let y = from.y + (target.y - from.y) * k;
        if (mode === 'air') y += Math.sin(k * Math.PI) * 0.6;
        else if (mode === 'walk' || mode === 'rail') y += Math.sin(k * Math.PI) * 0.05;
        obj.group.position.y = y;
        const dx = target.x - from.x, dz = target.z - from.z;
        if (dx * dx + dz * dz > 0.0002) obj.frontHolder.rotation.y = Math.atan2(dx, dz);
      },
      { ease: U.Ease.inOutQuad }
    );
    obj.frontHolder.rotation.y = obj.yaw;
    obj.group.position.copy(target);
    obj.nodeId = null;
  }

  async function animateMove(ev) {
    const obj = pieces.get(ev.uid);
    if (!obj) return;
    const path = Array.isArray(ev.path) && ev.path.length >= 2 ? ev.path : [ev.from, ev.to];
    const nodes = path.filter((id) => id != null).map(nodePos);
    if (!nodes.length) return;
    obj.locked = true;
    const mode = ev.mode || 'walk';
    const per = mode === 'rail' ? 0.24 : mode === 'air' ? 0.3 : mode === 'sea' ? 0.26 : 0.22;
    const duration = Math.min(1.2, per * (nodes.length - 1) + 0.16);
    const start = nodes[0].clone();
    // 起始位置對齊路徑起點
    if (ev.from != null) obj.group.position.copy(start);
    const trailColor = mode === 'air' ? 0xa8dcff : mode === 'rail' ? 0xffd28a : 0xfff0c8;

    await fx.tween(
      duration,
      (k) => {
        const seg = k * (nodes.length - 1);
        const i = Math.min(nodes.length - 2, Math.floor(seg));
        const f = seg - i;
        const a = nodes[i], b = nodes[i + 1];
        const x = a.x + (b.x - a.x) * f;
        const z = a.z + (b.z - a.z) * f;
        let y = a.y + (b.y - a.y) * f;
        if (mode === 'air') y += Math.sin(f * Math.PI) * 0.55;
        else if (mode === 'walk' || mode === 'rail') y += Math.sin(f * Math.PI) * 0.05;
        obj.group.position.set(x, y, z);
        const dx = b.x - a.x, dz = b.z - a.z;
        if (dx * dx + dz * dz > 0.0002) obj.frontHolder.rotation.y = Math.atan2(dx, dz);
        if (Math.random() < 0.5) {
          fx.spawnParticle(x, y + 0.12, z,
            (Math.random() - 0.5) * 0.2, 0.1 + Math.random() * 0.25, (Math.random() - 0.5) * 0.2,
            trailColor, 0.07 + Math.random() * 0.06, 0.35, 0.2, 1.2);
        }
      },
      { ease: U.Ease.inOutQuad }
    );
    obj.frontHolder.rotation.y = obj.yaw;
    obj.group.position.copy(nodes[nodes.length - 1]);
    obj.nodeId = ev.to;
    obj.locked = false;
    audio.play(mode === 'rail' ? 'rail' : mode === 'sea' ? 'sea' : mode === 'air' ? 'air' : 'move');
  }

  async function raisePiece(obj, amount, duration) {
    const baseY = obj.group.position.y;
    await fx.tween(
      duration,
      (k) => {
        obj.group.position.y = baseY + amount * k;
      },
      { ease: U.Ease.outCubic }
    );
    return baseY;
  }

  function lowerPiece(obj, baseY, duration) {
    return fx.tween(
      duration,
      (k) => {
        obj.group.position.y = baseY + (obj.group.position.y - baseY) * (1 - k);
      },
      { ease: U.Ease.inOutQuad }
    );
  }

  /** 一般戰鬥動畫 */
  async function animateBattle(ev) {
    const atk = pieces.get(ev.attackerUid);
    const def = pieces.get(ev.defenderUid);
    const atkPos = ev.from != null ? nodePos(ev.from) : atk?.group.position.clone();
    const defPos = ev.to != null ? nodePos(ev.to) : def?.group.position.clone();
    if (!defPos) return;
    if (atk) atk.locked = true;
    if (def) def.locked = true;

    const special = ev.special;
    // 遠程攻擊特效
    if (special === 'missile') {
      if (atkPos) await fx.missile(atkPos, defPos, 0.8, { color: 0xffb060 });
      audio.play('missile');
    } else if (special === 'bombard' || special === 'fort') {
      if (atkPos) {
        audio.play('missile');
        await fx.missile(atkPos, defPos, 0.6, { color: 0xff9a4a });
      }
    } else if (special === 'antiair') {
      if (atkPos) {
        for (let i = 0; i < 3; i++) {
          const p = atkPos.clone().lerp(defPos, 0.2 + i * 0.3);
          p.y += 0.6 + i * 0.15;
          fx.clash(p, 0xffe28a, 0xff8a4a);
        }
        audio.play('battle');
        await fx.delay(0.25);
      }
    } else if (special === 'recon') {
      fx.scan(defPos, 0x8fe8ff);
      audio.play('scan');
      await fx.delay(0.4);
    } else if (atk && ev.from != null && ev.from !== ev.to) {
      // 近戰：逼近目標
      await slidePieceTo(atk, defPos, 0.28, 'walk');
      audio.play('move');
    }

    // 雙方浮起
    const midPos = defPos.clone();
    midPos.y += 0.5;
    const atkBaseY = atk ? atk.group.position.y : 0;
    const defBaseY = def ? def.group.position.y : 0;
    if (atk) atk.group.position.y = atkBaseY;
    if (def) def.group.position.y = defBaseY;
    await Promise.all([
      atk ? raisePiece(atk, 0.16, 0.22) : fx.delay(0.22),
      def ? raisePiece(def, 0.16, 0.22) : fx.delay(0.22),
    ]);

    // 碰撞閃光
    fx.clash(midPos, atk ? pieceColor(atk) : 0xffcf8a, def ? pieceColor(def) : 0x9fd8ff);
    audio.play('battle');
    await fx.delay(0.35);

    const outcome = ev.outcome || 'N';
    const eliminated = new Set(ev.eliminated || []);
    const attackerDies = eliminated.has(ev.attackerUid);
    const defenderDies = eliminated.has(ev.defenderUid);

    if (outcome === 'FLAG') {
      // 奪旗：大爆炸 + 光柱
      audio.play('explosion');
      fx.explode(defPos, { color: 0xffd77a, power: 1.6, count: 90 });
      fx.beam(defPos, 0xffd77a, 1.8);
      await fx.delay(0.5);
    } else if (outcome === 'A' || outcome === 'B' || outcome === 'D') {
      audio.play('explosion');
      if (defenderDies) fx.shatter(defPos, def ? pieceColor(def) : 0xffcf8a);
      if (attackerDies) fx.shatter(atkPos || defPos, atk ? pieceColor(atk) : 0x9fd8ff);
      fx.explode(defPos, { color: 0xffb066, power: outcome === 'B' ? 1.2 : 1.0, count: 60 });
      if (attackerDies && !atkPos) {
        // 無位置時略過
      }
      await fx.delay(0.45);
    } else if (outcome === 'N') {
      fx.shockwave(defPos, { color: 0x9fd8ff, size: 1.2, duration: 0.35 });
      await fx.delay(0.25);
    } else if (outcome === 'R') {
      fx.scan(defPos, 0x8fe8ff);
      await fx.delay(0.3);
    }

    // 結果處理
    if (attackerDies && atk) {
      if (!defenderDies) await lowerPiece(def, defBaseY, 0.18);
      destroyVisual(atk);
    }
    if (defenderDies && def) {
      destroyVisual(def);
    }
    if (atk && !attackerDies) {
      const occupied = ev.occupied !== false && (outcome === 'A' || outcome === 'FLAG');
      const target = occupied ? defPos : atkPos;
      if (target) {
        objPlace(atk, target);
      }
      await lowerPiece(atk, target ? target.y : atkBaseY, 0.22);
      atk.locked = false;
    }
    if (def && !defenderDies) {
      await lowerPiece(def, defBaseY, 0.2);
      def.locked = false;
    }
    // 佔領更新
    if (atk && ev.occupied && (outcome === 'A' || outcome === 'FLAG')) {
      atk.nodeId = ev.to;
    }
    if (defenderDies && def) def.locked = false;

    function objPlace(obj, pos) {
      obj.group.position.x = pos.x;
      obj.group.position.z = pos.z;
      obj.group.position.y = pos.y + 0.16;
      obj.frontHolder.rotation.y = obj.yaw;
    }

    // 揭示棋種（等動畫結算後再重建模型，避免參考失效）
    applyRevealList(ev.reveal);

    // 行營被保護等特殊情況的提示
    if (special === 'campProtect') {
      fx.banner('行營保護', 900, { sub: '敵方陸軍無法攻擊營內棋子', color: '#a8dcff' });
    }
  }

  /** 勝負動畫 */
  async function animateWin(ev) {
    const winner = ev.winner;
    const isDraw = !winner || winner === 'draw' || winner === 'stalemate';
    const text = isDraw ? '和局' : winner === 'south' ? '南軍勝利' : '北軍勝利';
    const reason = REASON_TEXT[ev.reason] || ev.reason || '';
    audio.play(isDraw ? 'turn' : 'win');
    fx.timeScale = 0.65;
    fx.banner(text, 3400, { sub: reason, color: isDraw ? '#cfe0ff' : '#ffe9b0' });
    await fx.delay(0.9);
    fx.timeScale = 1;
  }

  async function animateEvents(events) {
    if (!Array.isArray(events) || events.length === 0) return;
    animating += 1;
    try {
      for (const ev of events) {
        if (!ev || !ev.type) continue;
        switch (ev.type) {
          case 'move':
            await animateMove(ev);
            break;
          case 'battle':
            await animateBattle(ev);
            break;
          case 'reveal':
            if (ev.uid != null && ev.key) revealVisual(ev.uid, ev.key);
            break;
          case 'flagExposed':
            audio.play('scan');
            fx.banner('軍旗位置曝光', 1600, { sub: '總司令陣亡', color: '#ffb9a4' });
            break;
          case 'win':
            await animateWin(ev);
            break;
          case 'pass':
            break;
          case 'deploy':
            break;
          default:
            break;
        }
      }
    } catch (err) {
      // 動畫失敗不應阻塞遊戲
      console.warn('[render] 動畫錯誤', err);
    } finally {
      animating = Math.max(0, animating - 1);
      if (animating === 0) {
        for (const obj of Array.from(pieces.values())) {
          obj.locked = false;
          if (obj.dead) destroyVisual(obj);
        }
      }
    }
  }

  /** 電影式戰鬥（鏡頭運鏡 + 慢動作），供 main.js 於關鍵戰鬥使用 */
  async function cinematicBattle(ev) {
    if (!ev || ev.type !== 'battle') return;
    const def = pieces.get(ev.defenderUid);
    const defPos = ev.to != null ? nodePos(ev.to) : def?.group.position.clone();
    if (!defPos) return;
    const camSave = {
      pos: stage.camera.position.clone(),
      target: stage.controls.target.clone(),
    };
    animating += 1;
    fx.timeScale = 0.6;
    try {
      await stage.flyTo(
        [defPos.x + 2.6, 6.0, defPos.z + 6.4],
        [defPos.x, 0.6, defPos.z],
        0.7
      );
      audio.play('battle');
      await animateBattle(ev);
      // 慢動作收尾：讓粒子散開
      await fx.delay(0.5);
      fx.banner(
        ev.outcome === 'FLAG' ? '奪旗！' : ev.outcome === 'A' ? '突破防線' :
          ev.outcome === 'D' ? '攻擊受挫' : ev.outcome === 'B' ? '同歸於盡' : '勝負未分',
        1800,
        { sub: def?.def?.name ? `目標：${def.def.name}` : '', color: '#ffe9b0' }
      );
    } catch (err) {
      console.warn('[render] cinematicBattle 錯誤', err);
    } finally {
      fx.timeScale = 1;
      animating = Math.max(0, animating - 1);
      await stage.flyTo(camSave.pos.toArray(), camSave.target.toArray(), 0.8);
      for (const obj of Array.from(pieces.values())) {
        obj.locked = false;
        if (obj.dead) destroyVisual(obj);
      }
    }
  }

  /* ================================================================ */
  /* 相機取景（避開左右 HUD 面板，讓棋盤完整可見）                        */
  /* ================================================================ */
  const FIT_CAM = new THREE.PerspectiveCamera(45, 1.6, 0.1, 200);
  const BOARD_CORNERS = [
    new THREE.Vector3(-7.65, 0, -7.65), new THREE.Vector3(7.65, 0, -7.65),
    new THREE.Vector3(-7.65, 0, 7.65), new THREE.Vector3(7.65, 0, 7.65),
  ];
  const _probe = new THREE.Vector3();

  /* ---------------- 動態安全區（setSafeInsets） ---------------- */
  let safeInsets = null;      // main 指定的 CSS px
  let insetsExplicit = false;

  /** 未指定時的預設邊距：桌面沿用 HUD 邊距；手機只留少量呼吸空間 */
  function defaultInsets(w, h) {
    if (isMobileLayout()) {
      const padX = Math.max(6, Math.round(Math.min(24, w * 0.035)));
      const padY = Math.max(6, Math.round(Math.min(28, h * 0.03)));
      return { top: padY, bottom: padY, left: padX, right: padX };
    }
    return {
      top: Math.min(120, Math.round(h * 0.13)),
      bottom: Math.min(105, Math.round(h * 0.12)),
      left: Math.min(340, Math.round(w * 0.26)),
      right: Math.min(340, Math.round(w * 0.26)),
    };
  }

  /** 目前生效的安全區（CSS px），clamp 到視窗內 */
  function effectiveInsets(w, h) {
    const base = insetsExplicit && safeInsets ? { ...safeInsets } : defaultInsets(w, h);
    let { top, right, bottom, left } = base;
    top = Math.max(0, Math.min(h * 0.46, Number(top) || 0));
    bottom = Math.max(0, Math.min(h * 0.46, Number(bottom) || 0));
    left = Math.max(0, Math.min(w * 0.46, Number(left) || 0));
    right = Math.max(0, Math.min(w * 0.46, Number(right) || 0));
    // 左右（或上下）合計不可吃滿畫面
    if (left + right > w * 0.9) {
      const k = (w * 0.9) / (left + right);
      left *= k; right *= k;
    }
    if (top + bottom > h * 0.9) {
      const k = (h * 0.9) / (top + bottom);
      top *= k; bottom *= k;
    }
    return { top: Math.round(top), right: Math.round(right), bottom: Math.round(bottom), left: Math.round(left) };
  }

  /** 換算為 NDC 安全框 */
  function safeMargins(w, h) {
    const ins = effectiveInsets(w, h);
    return {
      insets: ins,
      left: -1 + (2 * ins.left) / w,
      right: 1 - (2 * ins.right) / w,
      top: 1 - (2 * ins.top) / h,
      bottom: -1 + (2 * ins.bottom) / h,
    };
  }

  function viewDir(side) {
    const z = side === 'north' ? -14 : 14;
    return new THREE.Vector3(0, 12.5, z).normalize();
  }

  function extraProbePoints(side) {
    const farZ = side === 'north' ? 7.2 : -7.2;
    const nearZ = side === 'north' ? -7.2 : 7.2;
    return [
      new THREE.Vector3(0, 2.25, farZ),
      new THREE.Vector3(-6.95, 2.25, farZ),
      new THREE.Vector3(6.95, 2.25, farZ),
      new THREE.Vector3(0, 1.15, nearZ),
    ];
  }

  /** 以數值搜尋找出「棋盤與城牆完整落在安全區」的相機距離 */
  let lastFitDistance = 20;

  function computeFitDistance(side = 'south') {
    const w = Math.max(1, container.clientWidth || 1280);
    const h = Math.max(1, container.clientHeight || 800);
    const safe = safeMargins(w, h);
    const dir = viewDir(side);
    const points = [...BOARD_CORNERS, ...extraProbePoints(side)];
    const cam = FIT_CAM;
    cam.fov = stage.camera.fov;
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    let best = 120;
    for (let d = 12; d <= 120; d += 0.25) {
      cam.position.copy(dir).multiplyScalar(d);
      cam.lookAt(0, 0.15, 0);
      cam.updateMatrixWorld();
      let ok = true;
      for (const p of points) {
        _probe.copy(p).project(cam);
        if (_probe.x < safe.left || _probe.x > safe.right || _probe.y < safe.bottom || _probe.y > safe.top) {
          ok = false;
          break;
        }
      }
      if (ok) {
        best = d;
        break;
      }
    }
    lastFitDistance = best;
    return best;
  }

  function applyPerspective(side, { animate = true } = {}) {
    perspective = side === 'north' ? 'north' : 'south';
    autoFrame = true;
    // 先取消進行中的相機飛行，避免舊的 flyTo 在下一幀覆蓋新的取景
    stage.cancelFly();
    const dist = computeFitDistance(perspective);
    stage.controls.minDistance = Math.max(4.5, dist * 0.38);
    stage.controls.maxDistance = Math.max(dist * 2.6, 48);
    const pos = viewDir(perspective).multiplyScalar(dist).toArray();
    const target = [0, 0.15, 0];
    if (!animate) {
      stage.camera.position.set(pos[0], pos[1], pos[2]);
      stage.controls.target.set(target[0], target[1], target[2]);
      stage.controls.update();
      return Promise.resolve();
    }
    return stage.flyTo(pos, target, 0.95);
  }

  stage.controls.addEventListener('start', () => {
    autoFrame = false;
  });

  /* ---------------- 方向改變 / 觸控型態改變 ---------------- */
  function onCoarseChange() {
    coarsePointer = !!(coarseMedia?.matches || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0));
    const hs = hitRadiusScale();
    for (const obj of pieces.values()) {
      if (obj.hitMesh) obj.hitMesh.scale.set(hs, 1, hs);
    }
    if (autoFrame) applyPerspective(perspective, { animate: false });
  }
  if (coarseMedia?.addEventListener) coarseMedia.addEventListener('change', onCoarseChange);
  const onOrientationChange = () => {
    // 等瀏覽器完成尺寸更新後再重新取景
    setTimeout(() => {
      if (autoFrame) applyPerspective(perspective, { animate: false });
    }, 180);
  };
  window.addEventListener('orientationchange', onOrientationChange);

  /* ================================================================ */
  /* 互動                                                              */
  /* ================================================================ */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let pointerDown = null;

  function pickAt(clientX, clientY) {
    const rect = stage.renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return {};
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, stage.camera);
    let pieceUid = null;
    const hits = raycaster.intersectObjects(hitTargets, false);
    if (hits.length) {
      const uid = hits[0].object.userData.uid;
      if (uid != null && pieces.has(uid)) pieceUid = uid;
    }
    // 節點判定：射線平面命中以外，手機再加「最近節點」螢幕距離容錯
    const nodeId = board.pickNode(raycaster, {
      camera: stage.camera,
      width: rect.width,
      height: rect.height,
      pointerX: clientX - rect.left,
      pointerY: clientY - rect.top,
      tolerancePx: isMobileLayout() ? 24 : 0,
    });
    return { pieceUid, nodeId };
  }

  function onPointerDown(e) {
    if (!interactive) return;
    if (e.button !== undefined && e.button !== 0) return;
    audio.unlock();
    pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() };
  }

  function onPointerUp(e) {
    if (!interactive || !pointerDown) return;
    const dx = e.clientX - pointerDown.x;
    const dy = e.clientY - pointerDown.y;
    const dt = performance.now() - pointerDown.t;
    pointerDown = null;
    const coarse = coarsePointer || isMobileLayout();
    const maxMove = coarse ? 34 : 10;   // px：coarse pointer 放寬 tap 容錯
    const maxTime = coarse ? 1100 : 800; // ms
    if (dx * dx + dy * dy > maxMove * maxMove || dt > maxTime) return; // 拖曳相機不算點擊
    const hit = pickAt(e.clientX, e.clientY);
    // 已選取棋子時，若點在「可走／可攻擊」的高亮節點上 → 優先視為節點操作。
    // （手機放大 hit 筒後，相鄰目標格常落在選中棋子的 hit 筒內）
    const targetNode = hit.nodeId != null && highlightPriorityIds.has(hit.nodeId);
    if (selectedUid != null && targetNode) {
      nodePickCb?.(hit.nodeId);
      return;
    }
    if (hit.pieceUid != null) {
      audio.play('select');
      piecePickCb?.(hit.pieceUid);
    } else if (hit.nodeId != null) {
      nodePickCb?.(hit.nodeId);
    } else {
      piecePickCb?.(null);
    }
  }

  function onPointerMove(e) {
    if (!interactive) {
      fx.setHover(null);
      return;
    }
    const hit = pickAt(e.clientX, e.clientY);
    let cursor = 'default';
    if (hit.pieceUid != null) {
      const obj = pieces.get(hit.pieceUid);
      if (obj) fx.setHover(obj.group.position);
      cursor = 'pointer';
    } else if (hit.nodeId != null) {
      fx.setHover(board.nodeWorld(hit.nodeId));
      cursor = 'pointer';
    } else {
      fx.setHover(null);
    }
    stage.renderer.domElement.style.cursor = cursor;
  }

  function onPointerLeave() {
    fx.setHover(null);
  }

  stage.renderer.domElement.addEventListener('pointerdown', onPointerDown);
  stage.renderer.domElement.addEventListener('pointerup', onPointerUp);
  stage.renderer.domElement.addEventListener('pointermove', onPointerMove);
  stage.renderer.domElement.addEventListener('pointerleave', onPointerLeave);

  /* ================================================================ */
  /* 主迴圈                                                            */
  /* ================================================================ */
  const clock = new THREE.Clock();
  let time = 0;
  let rafId = 0;
  let readyResolve = null;
  let autoRender = true;
  const readyPromise = new Promise((resolve) => {
    readyResolve = resolve;
  });

  function updatePieces(t, dt) {
    for (const obj of pieces.values()) {
      obj.update(t, dt, stage.camera);
      if (obj.isAir) {
        const bob = Math.sin(t * 1.55 + obj.phase) * 0.028;
        obj.frontHolder.position.y = obj.baseAltitude + bob;
        obj.frontHolder.rotation.z = Math.sin(t * 1.1 + obj.phase) * 0.05;
        obj.frontHolder.rotation.x = Math.sin(t * 0.8 + obj.phase * 1.7) * 0.025;
      }
      // 死亡棋子延遲清理（若沒有動畫播放）
      if (obj.dead && obj.deadSince && animating === 0 && performance.now() - obj.deadSince > 700) {
        destroyVisual(obj);
      }
    }
    // 選取光環跟隨
    if (selectedUid != null) {
      const obj = pieces.get(selectedUid);
      if (obj) fx.setSelection(obj.group.position);
      else {
        selectedUid = null;
        fx.setSelection(null);
      }
    } else {
      fx.setSelection(null);
    }
  }

  const resizeObserver = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w > 0 && h > 0) {
      stage.setSize(w, h);
      if (autoFrame) applyPerspective(perspective, { animate: false });
    }
  });
  resizeObserver.observe(container);

  function step(dt) {
    time += dt;
    board.update(time);
    updatePieces(time, dt);
    fx.update(dt);
    stage.render(dt);
    frames += 1;
    if (typeof window !== 'undefined') window.__sanjunqiFrames = frames;
    if (frames === 2 && readyResolve) {
      readyResolve();
      readyResolve = null;
    }
  }

  function loop() {
    if (disposed) return;
    rafId = autoRender ? requestAnimationFrame(loop) : 0;
    let dt = clock.getDelta();
    if (!Number.isFinite(dt) || dt > 0.1) dt = 0.016;
    step(dt);
  }
  rafId = requestAnimationFrame(loop);

  /* ================================================================ */
  /* View API                                                          */
  /* ================================================================ */
  const view = {
    ready() {
      return readyPromise;
    },

    /** 設定玩家視角：'south'（預設，玩家在下）或 'north' */
    setPerspective(side) {
      return applyPerspective(side, { animate: true });
    },

    get perspective() {
      return perspective;
    },

    /** 依 engine.getView(side) 更新畫面 */
    sync,

    setInteractive(on) {
      interactive = !!on;
      if (!interactive) fx.setHover(null);
      stage.renderer.domElement.style.cursor = 'default';
    },

    onNodePick(cb) {
      nodePickCb = cb;
    },

    onPiecePick(cb) {
      piecePickCb = cb;
    },

    /** nodeIds: number[]，kind: 'move'|'attack'|'deploy'|'danger'|'intel' */
    highlightNodes(nodeIds, kind = 'move') {
      const ids = Array.isArray(nodeIds) ? nodeIds : [];
      highlightKind = kind;
      const valid = ids.filter((id) => NODE_MAP[id] != null);
      // 只有「操作目標」類的高亮才優先於棋子 hit 判定；
      // intel/danger 只是情報提示，點棋子仍應選棋子。
      // 累積 union：main 會分兩次呼叫 move / attack 高亮，兩者都要可點。
      if (kind !== 'danger' && kind !== 'intel') {
        for (const id of valid) highlightPriorityIds.add(id);
      }
      const positions = valid.map((id) => board.nodeWorld(id));
      fx.addHighlights(positions, kind);
    },

    clearHighlights() {
      highlightKind = null;
      highlightPriorityIds = new Set();
      fx.clearHighlights();
    },

    setSelected(uid) {
      selectedUid = uid ?? null;
      if (selectedUid == null) fx.setSelection(null);
    },

    /** 佈陣模式：顯示該方所有可佈陣節點（可傳入已放置節點陣列排除） */
    setDeployMode(on, opts = {}) {
      deployMode = !!on;
      if (!deployMode) {
        if (highlightKind === 'deploy') {
          fx.clearHighlights();
          highlightKind = null;
        }
        return;
      }
      const side = opts.side === 'north' ? 'north' : 'south';
      const zones = DEPLOY_ZONES[side];
      const placed = new Set(opts.placed || []);
      const ids = Array.from(new Set([
        ...(zones.allLand || []),
        ...(zones.coastal || []),
        ...(zones.gates || []),
        ...(zones.anchors || []),
        ...(zones.airports || []),
      ])).filter((id) => !placed.has(id));
      highlightKind = 'deploy';
      highlightPriorityIds = new Set();
      fx.highlightNodes(ids.map((id) => board.nodeWorld(id)), 'deploy');
    },

    /** 依序播放事件動畫（回傳 Promise；不阻塞遊戲狀態） */
    animateEvents,

    /** 電影式戰鬥（鏡頭運鏡版本；可與 animateEvents 擇一使用） */
    cinematicBattle,

    /** 取消進行中的相機飛行（給測試頁直接設定相機時使用） */
    cancelCameraFly() {
      stage.cancelFly();
    },

    /** 3D 浮動橫幅（text, ms, { sub, color, size }) */
    showBanner(text, ms, opts) {
      return fx.banner(text, ms ?? 1600, opts || {});
    },

    /**
     * 設定 UI 佔用的安全區（CSS px），並在 autoFrame 時立即重新取景。
     * 例：view.setSafeInsets({ top: 56, bottom: 88, left: 8, right: 8 })
     * 傳入 null 可恢復預設（桌面=HUD 邊距；手機=少量呼吸空間）。
     */
    setSafeInsets(insets) {
      if (!insets) {
        safeInsets = null;
        insetsExplicit = false;
      } else {
        safeInsets = {
          top: Math.max(0, Number(insets.top) || 0),
          right: Math.max(0, Number(insets.right) || 0),
          bottom: Math.max(0, Number(insets.bottom) || 0),
          left: Math.max(0, Number(insets.left) || 0),
        };
        insetsExplicit = true;
      }
      if (autoFrame) applyPerspective(perspective, { animate: false });
      return effectiveInsets(
        Math.max(1, container.clientWidth || 1),
        Math.max(1, container.clientHeight || 1)
      );
    },

    get safeInsets() {
      return effectiveInsets(
        Math.max(1, container.clientWidth || 1),
        Math.max(1, container.clientHeight || 1)
      );
    },

    /** 依目前 safeInsets 重新取景（保留方向） */
    reframe(opts = {}) {
      autoFrame = true;
      return applyPerspective(perspective, { animate: !!opts.animate });
    },

    /**
     * 縮放：factor > 1 拉遠、< 1 拉近（夾在最佳取景距離的合理範圍內）。
     * 回傳新的相機距離。
     */
    zoomBy(factor) {
      const f = Number(factor) || 1;
      const target = stage.controls.target.clone();
      const dir = stage.camera.position.clone().sub(target);
      const dist = dir.length();
      const fit = computeFitDistance(perspective);
      const minD = Math.max(4.5, fit * 0.38);
      const maxD = Math.max(fit * 2.6, 48);
      const next = Math.min(maxD, Math.max(minD, dist * f));
      dir.normalize().multiplyScalar(next);
      stage.camera.position.copy(target).add(dir);
      stage.controls.minDistance = minD;
      stage.controls.maxDistance = maxD;
      stage.controls.update();
      autoFrame = false;
      return next;
    },

    /** 回到目前方向 + safeInsets 的最佳取景 */
    resetView() {
      autoFrame = true;
      return applyPerspective(perspective, { animate: true });
    },

    /** 是否為觸控裝置（coarse pointer；窄版面另以 isMobileLayout 內部判斷） */
    get isCoarsePointer() {
      return coarsePointer;
    },

    /** 相機聚焦某節點 */
    focus(nodeId) {
      const n = NODE_MAP[nodeId];
      if (!n) return Promise.resolve();
      const pos = board.nodeWorld(nodeId);
      const dir = stage.camera.position.clone().sub(stage.controls.target);
      dir.y = 0;
      if (dir.lengthSq() < 0.001) dir.set(0, 0, 1);
      dir.normalize().multiplyScalar(7.2);
      const camPos = [pos.x + dir.x, Math.max(5.2, pos.y + 6.4), pos.z + dir.z];
      return stage.flyTo(camPos, [pos.x, pos.y + 0.35, pos.z], 0.85);
    },

    /** 變更陣營配色（主色/深色/亮色/點綴色） */
    setSideColors(colors) {
      const normalized = normalizeSideColors(colors);
      factory.setSideColors(normalized);
      board.setSideColors(normalized);
      // 名牌、旗布與陣營色已烙印在貼圖上 → 重建所有棋子視覺
      for (const obj of Array.from(pieces.values())) destroyVisual(obj);
      if (state) sync(state);
    },

    /** 情報同步：曝光提示 */
    syncIntel(nextState) {
      if (!nextState) return;
      const prev = lastFlagRevealed;
      lastFlagRevealed = nextState.flagRevealed || null;
      if (nextState.flagRevealed) {
        for (const side of ['north', 'south']) {
          if (nextState.flagRevealed[side] && !(prev && prev[side])) {
            audio.play('scan');
            fx.banner('敵方軍旗位置曝光', 1800, { sub: side === 'north' ? '北軍城門' : '南軍城門', color: '#ffb9a4' });
          }
        }
      }
      // 只對「本次新揭露的敵方棋子」播放掃描光環：
      // 己方棋子（revealed 恆為 true）不掃、空軍永遠公開不掃、同一枚只掃一次。
      const mySide = nextState.playerSide || (perspective === 'north' ? 'north' : 'south');
      if (!view._revealedState) view._revealedState = new Map();
      for (const p of nextState.pieces || []) {
        const wasRevealed = view._revealedState.get(p.uid) || false;
        const nowRevealed = !!p.revealed;
        view._revealedState.set(p.uid, nowRevealed);
        if (nowRevealed && !wasRevealed && p.key && p.side !== mySide && p.branch !== BRANCH.AIR && p.nodeId != null) {
          fx.scan(board.nodeWorld(p.nodeId), 0x8fe8ff);
        }
      }
    },

    /** 音效開關（預設開） */
    setSound(on) {
      soundOn = !!on;
      audio.setEnabled(soundOn);
    },

    get sound() {
      return soundOn;
    },

    /**
     * 畫質切換：'low' 供無頭／低階 GPU 使用
     * 關閉 Bloom 與陰影、降低像素比、簡化海面與粒子
     */
    setQuality(level) {
      if (level === 'low') {
        stage.setBloomEnabled(false);
        stage.setShadowsEnabled(false);
        stage.setPixelRatio(0.6);
        stage.setExposure(1.0);
        fx.setLowQuality(true);
        board.setQuality(0);
      } else if (level === 'medium') {
        // 手機建議畫質：關 Bloom 與陰影、像素比上限 1.25（≤1.5），保留 PBR 光照
        stage.setBloomEnabled(false);
        stage.setShadowsEnabled(false);
        stage.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
        stage.setExposure(1.02);
        fx.setLowQuality(false);
        board.setQuality(1);
      } else {
        stage.setBloomEnabled(true);
        stage.setBloom(0.52, 0.68, 0.84);
        stage.setShadowsEnabled(true);
        stage.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        stage.setExposure(0.92);
        fx.setLowQuality(false);
        board.setQuality(1);
      }
      applyPerspective(perspective, { animate: false });
    },

    /**
     * 截圖測試用：暫停／恢復自動渲染。
     * 暫停後可呼叫 renderOnce() 畫出穩定的單幀，Playwright 截圖就不會卡在長幀。
     */
    setAutoRender(on) {
      autoRender = !!on;
      if (autoRender && !rafId && !disposed) {
        clock.getDelta();
        rafId = requestAnimationFrame(loop);
      }
    },

    /** 手動繪製單幀（自動渲染暫停時使用） */
    renderOnce(dt = 0.016) {
      if (disposed) return;
      step(dt);
    },

    /* 公開給測試頁 / main.js 使用的內部參考 */
    three: THREE,
    scene: stage.scene,
    camera: stage.camera,
    renderer: stage.renderer,
    controls: stage.controls,
    stage,
    fx,
    board,
    pieces,
    audio,

    dispose() {
      disposed = true;
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      stage.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      stage.renderer.domElement.removeEventListener('pointerup', onPointerUp);
      stage.renderer.domElement.removeEventListener('pointermove', onPointerMove);
      stage.renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      if (coarseMedia?.removeEventListener) coarseMedia.removeEventListener('change', onCoarseChange);
      window.removeEventListener('orientationchange', onOrientationChange);
      fx.dispose();
      factory.dispose();
      board.dispose();
      audio.dispose();
      stage.dispose();
      pieces.clear();
      hitTargets.length = 0;
    },
  };

  // 供除錯：把 view 掛在容器上
  container.__sanjunqiView = view;
  void _v1;
  void _v2;
  void deployMode;
  return view;
}

export { DEFAULT_SIDE_COLORS };
export default createView;
