/**
 * 三軍棋 3D — 特效層
 * ------------------------------------------------------------------
 * 自製 tween 系統、粒子池、衝擊波、爆炸閃光、飛彈軌跡、偵察掃描、
 * 選取／懸停光環、可走點光環、3D 浮動橫幅、鏡頭震動。
 * 全部以 requestAnimationFrame 迴圈驅動，不依賴任何動畫套件。
 */
import * as THREE from 'three';
import * as U from './utils.js';

const HIGHLIGHT_COLORS = {
  move: 0x5df0a0,
  attack: 0xff6060,
  deploy: 0x64b4ff,
  danger: 0xffa53d,
  intel: 0x8fe8ff,
};

/* ================================================================== */
/* 粒子系統（單一 draw call）                                          */
/* ================================================================== */

const PARTICLE_VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (260.0 / max(0.6, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;
const PARTICLE_FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.05, d) * vAlpha;
  gl_FragColor = vec4(vColor, a);
}
`;

export function createEffects({ scene, camera, stage }) {
  const MAX_PARTICLES = 900;
  const pPos = new Float32Array(MAX_PARTICLES * 3);
  const pCol = new Float32Array(MAX_PARTICLES * 3);
  const pSize = new Float32Array(MAX_PARTICLES);
  const pAlpha = new Float32Array(MAX_PARTICLES);
  const alive = new Uint8Array(MAX_PARTICLES);
  const vel = new Float32Array(MAX_PARTICLES * 3);
  const life = new Float32Array(MAX_PARTICLES);
  const maxLife = new Float32Array(MAX_PARTICLES);
  const gravity = new Float32Array(MAX_PARTICLES);
  const drag = new Float32Array(MAX_PARTICLES);
  let cursor = 0;

  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('aColor', new THREE.BufferAttribute(pCol, 3));
  pGeo.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1));
  pGeo.setAttribute('aAlpha', new THREE.BufferAttribute(pAlpha, 1));
  pGeo.setDrawRange(0, MAX_PARTICLES);
  const pMat = new THREE.ShaderMaterial({
    vertexShader: PARTICLE_VERT,
    fragmentShader: PARTICLE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  points.renderOrder = 10;
  scene.add(points);

  const _color = new THREE.Color();

  function spawnParticle(x, y, z, vx, vy, vz, color, size, lifeSec, grav = 0, dr = 0.05) {
    const i = cursor;
    cursor = (cursor + 1) % MAX_PARTICLES;
    alive[i] = 1;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    _color.set(color);
    pCol[i * 3] = _color.r; pCol[i * 3 + 1] = _color.g; pCol[i * 3 + 2] = _color.b;
    pSize[i] = size;
    pAlpha[i] = 1;
    life[i] = lifeSec;
    maxLife[i] = lifeSec;
    gravity[i] = grav;
    drag[i] = dr;
  }

  function updateParticles(dt) {
    let any = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (!alive[i]) continue;
      any = true;
      life[i] -= dt;
      if (life[i] <= 0) {
        alive[i] = 0;
        pAlpha[i] = 0;
        continue;
      }
      const k = life[i] / maxLife[i];
      vel[i * 3 + 1] -= gravity[i] * dt;
      const dr = 1 - drag[i] * dt;
      vel[i * 3] *= dr; vel[i * 3 + 1] *= dr; vel[i * 3 + 2] *= dr;
      pPos[i * 3] += vel[i * 3] * dt;
      pPos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pPos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      pAlpha[i] = k * k;
      pSize[i] *= 1 + dt * 0.6;
    }
    if (any) {
      pGeo.attributes.position.needsUpdate = true;
      pGeo.attributes.aAlpha.needsUpdate = true;
      pGeo.attributes.aSize.needsUpdate = true;
      pGeo.attributes.aColor.needsUpdate = true;
    }
  }

  /* ================================================================ */
  /* Tween 系統                                                        */
  /* ================================================================ */
  const tweens = [];
  let timeScale = 1;
  let lowQuality = false;
  const qScale = () => (lowQuality ? 0.4 : 1);

  function tween(duration, onUpdate, opts = {}) {
    const ease = opts.ease || U.Ease.inOutCubic;
    return new Promise((resolve) => {
      tweens.push({
        t: 0,
        duration: Math.max(0.001, duration),
        onUpdate,
        ease,
        resolve,
        onComplete: opts.onComplete,
        label: opts.label,
      });
    });
  }

  function delay(sec) {
    return tween(sec, () => {});
  }

  function updateTweens(dt) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.duration);
      tw.onUpdate(tw.ease(k), k);
      if (k >= 1) {
        tweens.splice(i, 1);
        tw.onComplete?.();
        tw.resolve?.();
      }
    }
  }

  function clearTweens() {
    for (const tw of tweens) tw.resolve?.();
    tweens.length = 0;
  }

  /* ================================================================ */
  /* 衝擊波環                                                          */
  /* ================================================================ */
  const shockPool = [];
  for (let i = 0; i < 10; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd28a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.86, 1.0, 48), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    mesh.renderOrder = 8;
    scene.add(mesh);
    shockPool.push({ mesh, mat, active: false });
  }

  function shockwave(pos, { color = 0xffcf85, size = 2.2, duration = 0.55, y = 0.06 } = {}) {
    const slot = shockPool.find((s) => !s.active);
    if (!slot) return;
    slot.active = true;
    slot.mesh.visible = true;
    slot.mesh.position.set(pos.x, y, pos.z);
    slot.mat.color.set(color);
    slot.mat.opacity = 0.9;
    slot.mesh.scale.setScalar(0.15);
    tween(
      duration,
      (k) => {
        slot.mesh.scale.setScalar(0.15 + k * size);
        slot.mat.opacity = (1 - k) * 0.9;
      },
      {
        ease: U.Ease.outCubic,
        onComplete: () => {
          slot.active = false;
          slot.mesh.visible = false;
        },
      }
    );
  }

  /* ================================================================ */
  /* 爆炸閃光（預配置點光源）                                            */
  /* ================================================================ */
  const flashLights = [];
  for (let i = 0; i < 3; i++) {
    const l = new THREE.PointLight(0xffb066, 0, 14, 2);
    l.position.set(0, 1, 0);
    scene.add(l);
    flashLights.push({ light: l, intensity: 0 });
  }
  let flashCursor = 0;

  function flash(pos, { color = 0xffb066, intensity = 40, duration = 0.5 } = {}) {
    const slot = flashLights[flashCursor % flashLights.length];
    flashCursor += 1;
    slot.light.color.set(color);
    slot.light.position.set(pos.x, (pos.y ?? 0) + 0.7, pos.z);
    slot.light.intensity = intensity;
    const start = intensity;
    tween(duration, (k) => {
      slot.light.intensity = start * (1 - k) * (1 - k);
    });
  }

  /* ================================================================ */
  /* 選取／懸停光環                                                     */
  /* ================================================================ */
  const selectionGroup = new THREE.Group();
  selectionGroup.visible = false;
  scene.add(selectionGroup);

  const selOuter = new THREE.Mesh(
    new THREE.RingGeometry(0.6, 0.68, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffd77a, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    })
  );
  selOuter.rotation.x = -Math.PI / 2;
  const selInner = new THREE.Mesh(
    new THREE.RingGeometry(0.53, 0.57, 40),
    new THREE.MeshBasicMaterial({
      color: 0xffedb0, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    })
  );
  selInner.rotation.x = -Math.PI / 2;
  const selDashes = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const d = new THREE.Mesh(
      new THREE.BoxGeometry(0.085, 0.007, 0.024),
      new THREE.MeshBasicMaterial({
        color: 0xffe08a, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      })
    );
    const a = (i / 6) * Math.PI * 2;
    d.position.set(Math.sin(a) * 0.76, 0, Math.cos(a) * 0.76);
    d.rotation.y = a;
    selDashes.add(d);
  }
  selectionGroup.add(selOuter, selInner, selDashes);
  let selLift = 0;

  const hoverRing = new THREE.Mesh(
    new THREE.RingGeometry(0.57, 0.61, 40),
    new THREE.MeshBasicMaterial({
      color: 0xbfe8ff, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    })
  );
  hoverRing.rotation.x = -Math.PI / 2;
  hoverRing.visible = false;
  scene.add(hoverRing);

  function setSelection(pos, lift = 0) {
    if (!pos) {
      selectionGroup.visible = false;
      selLift = 0;
      return;
    }
    selectionGroup.visible = true;
    selectionGroup.position.set(pos.x, pos.y + 0.02, pos.z);
    selLift = lift;
  }

  function setHover(pos) {
    if (!pos) {
      hoverRing.visible = false;
      return;
    }
    hoverRing.visible = true;
    hoverRing.position.set(pos.x, pos.y + 0.015, pos.z);
  }

  /* ================================================================ */
  /* 可走點光環池                                                       */
  /* ================================================================ */
  const highlightPool = [];
  const highlightActive = [];
  const MAX_HL = 170;
  const hlRingGeo = new THREE.RingGeometry(0.36, 0.46, 30);
  const hlDotGeo = new THREE.CircleGeometry(0.09, 12);

  function getHighlightMesh(kind) {
    let slot = highlightPool.find((s) => !s.active);
    if (!slot) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      });
      const group = new THREE.Group();
      const ring = new THREE.Mesh(hlRingGeo, mat);
      ring.rotation.x = -Math.PI / 2;
      const dot = new THREE.Mesh(hlDotGeo, mat);
      dot.rotation.x = -Math.PI / 2;
      dot.position.y = 0.002;
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.26, 0.5, 16, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xffffff, transparent: true, opacity: 0.08,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
        })
      );
      beam.position.y = 0.25;
      group.add(ring, dot, beam);
      group.visible = false;
      group.renderOrder = 6;
      scene.add(group);
      slot = { group, ring, dot, beam, mat, beamMat: beam.material, active: false, kind, phase: 0 };
      highlightPool.push(slot);
    }
    return slot;
  }

  function highlightNodes(positions, kind = 'move') {
    clearHighlights();
    const color = HIGHLIGHT_COLORS[kind] ?? HIGHLIGHT_COLORS.move;
    positions.forEach((pos, i) => {
      if (highlightActive.length >= MAX_HL) return;
      const slot = getHighlightMesh(kind);
      slot.active = true;
      slot.kind = kind;
      slot.phase = i * 0.45;
      slot.group.visible = true;
      slot.group.position.set(pos.x, pos.y + 0.02, pos.z);
      slot.mat.color.set(color);
      slot.beamMat.color.set(color);
      slot.mat.opacity = 0.9;
      slot.beamMat.opacity = kind === 'deploy' ? 0.12 : 0.05;
      // 攻擊點用菱形標記感：環稍微放大
      slot.ring.scale.setScalar(kind === 'attack' ? 1.15 : 1);
      highlightActive.push(slot);
    });
  }

  function clearHighlights() {
    for (const slot of highlightActive) {
      slot.active = false;
      slot.group.visible = false;
    }
    highlightActive.length = 0;
  }

  /* ================================================================ */
  /* 3D 浮動橫幅                                                       */
  /* ================================================================ */
  const bannerCache = new Map();
  let bannerSprite = null;

  function banner(text, ms = 1800, opts = {}) {
    if (bannerSprite) {
      scene.remove(bannerSprite);
      bannerSprite.material.map?.dispose?.();
      bannerSprite.material.dispose();
      bannerSprite = null;
    }
    const key = `${text}|${opts.sub || ''}|${opts.color || ''}`;
    let tex = bannerCache.get(key);
    if (!tex) {
      tex = U.makeBannerTexture(text, {
        sub: opts.sub || '',
        color: opts.color || '#ffe9b0',
        size: opts.size || 150,
      });
      bannerCache.set(key, tex);
    }
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, depthTest: false,
      opacity: 0, blending: THREE.NormalBlending, toneMapped: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(6.0, 1.76, 1);
    sp.position.set(0, 4.6, 0.4);
    sp.renderOrder = 20;
    scene.add(sp);
    bannerSprite = sp;
    const hold = ms / 1000;
    tween(0.28, (k) => {
      mat.opacity = k;
      sp.position.y = 3.6 + k * 0.5;
    }, { ease: U.Ease.outCubic });
    // 停留後淡出
    delay(hold).then(() => {
      if (bannerSprite !== sp) return;
      const startY = sp.position.y;
      tween(0.55, (k) => {
        mat.opacity = (1 - k) * 0.95;
        sp.position.y = startY + k * 0.5;
      }, { ease: U.Ease.inQuad, onComplete: () => {
        if (bannerSprite === sp) {
          scene.remove(sp);
          mat.dispose();
          bannerSprite = null;
        }
      } });
    });
    return sp;
  }

  /* ================================================================ */
  /* 爆炸 / 碎片 / 飛彈 / 掃描                                          */
  /* ================================================================ */

  function explode(pos, opts = {}) {
    const color = opts.color ?? 0xffb066;
    const power = opts.power ?? 1;
    const count = Math.max(8, Math.round((opts.count ?? 46) * qScale()));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 0.3 + Math.random() * 0.9;
      const sp = (0.8 + Math.random() * 2.2) * power;
      spawnParticle(
        pos.x + (Math.random() - 0.5) * 0.2,
        pos.y + 0.3 + Math.random() * 0.4,
        pos.z + (Math.random() - 0.5) * 0.2,
        Math.cos(a) * sp * 0.6, up * sp, Math.sin(a) * sp * 0.6,
        i % 3 === 0 ? 0xfff0c0 : color,
        0.16 + Math.random() * 0.26,
        0.55 + Math.random() * 0.6,
        2.6, 0.6
      );
    }
    // 煙霧
    for (let i = 0; i < Math.round(14 * qScale()); i++) {
      const a = Math.random() * Math.PI * 2;
      spawnParticle(
        pos.x + (Math.random() - 0.5) * 0.4,
        pos.y + 0.5 + Math.random() * 0.5,
        pos.z + (Math.random() - 0.5) * 0.4,
        Math.cos(a) * 0.5, 0.5 + Math.random() * 0.7, Math.sin(a) * 0.5,
        0x5a4a40,
        0.4 + Math.random() * 0.4,
        0.9 + Math.random() * 0.6,
        -0.6, 1.2
      );
    }
    shockwave(pos, { color, size: 2.6 * power, duration: 0.6 });
    shockwave(pos, { color: 0x7fd0ff, size: 1.4 * power, duration: 0.45, y: 0.1 });
    flash(pos, { color, intensity: 42 * power, duration: 0.5 });
    stage.shake(0.16 * power, 0.45);
  }

  /** 碎片（棋子被消滅時） */
  function shatter(pos, color = 0xc8a060) {
    const n = Math.max(6, Math.round(30 * qScale()));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.6 + Math.random() * 1.6;
      spawnParticle(pos.x, pos.y + 0.35, pos.z,
        Math.cos(a) * sp, 0.8 + Math.random() * 1.8, Math.sin(a) * sp,
        i % 4 === 0 ? 0xffe6a8 : color, 0.09 + Math.random() * 0.12,
        0.8 + Math.random() * 0.7, 5.0, 0.2);
    }
    shockwave(pos, { color: 0xffd9a0, size: 1.3, duration: 0.4 });
  }

  /** 飛彈軌跡：從 from 沿拋物線至 to，命中後爆炸 */
  function missile(from, to, duration = 0.9, opts = {}) {
    const color = opts.color ?? 0xffb060;
    const projectile = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff2c8, toneMapped: false })
    );
    projectile.renderOrder = 12;
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 10, 8),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      })
    );
    projectile.add(glow);
    scene.add(projectile);
    const start = new THREE.Vector3(from.x, from.y + 0.5, from.z);
    const end = new THREE.Vector3(to.x, to.y + 0.45, to.z);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    mid.y = Math.max(start.y, end.y) + 1.6;
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    let last = start.clone();
    return new Promise((resolve) => {
      tween(duration, (k) => {
        const p = curve.getPoint(k);
        projectile.position.copy(p);
        // 拖尾粒子
        const dir = p.clone().sub(last);
        if (dir.lengthSq() > 0.0004) {
          for (let i = 0; i < (lowQuality ? 1 : 2); i++) {
            spawnParticle(
              p.x - dir.x * Math.random() * 0.6,
              p.y - dir.y * Math.random() * 0.6,
              p.z - dir.z * Math.random() * 0.6,
              (Math.random() - 0.5) * 0.25,
              (Math.random() - 0.5) * 0.25 + 0.1,
              (Math.random() - 0.5) * 0.25,
              color, 0.1 + Math.random() * 0.1, 0.3, 0.3, 1.5
            );
          }
          last.copy(p);
        }
      }, {
        ease: U.Ease.inOutQuad,
        onComplete: () => {
          scene.remove(projectile);
          projectile.geometry.dispose();
          projectile.material.dispose();
          glow.geometry.dispose();
          glow.material.dispose();
          explode(end, { color, power: 1.15, count: 54 });
          resolve();
        },
      });
    });
  }

  /** 偵察掃描：目標點擴散青色光環 */
  function scan(pos, color = 0x7fe3ff) {
    for (let i = 0; i < 3; i++) {
      delay(i * 0.16).then(() => {
        shockwave(pos, { color, size: 1.9, duration: 0.7, y: 0.05 });
      });
    }
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      spawnParticle(pos.x, pos.y + 0.1, pos.z,
        Math.cos(a) * 1.3, 0.4 + Math.random() * 0.6, Math.sin(a) * 1.3,
        color, 0.08, 0.55, 0.5, 0.6);
    }
    flash(pos, { color, intensity: 16, duration: 0.5 });
  }

  /** 小範圍戰鬥火花 */
  function clash(pos, colorA = 0xffcf8a, colorB = 0x9fd8ff) {
    const n = Math.max(6, Math.round(28 * qScale()));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.8 + Math.random() * 2.0;
      spawnParticle(pos.x, pos.y + 0.55, pos.z,
        Math.cos(a) * sp * 0.7, (Math.random() - 0.2) * 1.8, Math.sin(a) * sp * 0.7,
        i % 2 ? colorA : colorB, 0.08 + Math.random() * 0.14,
        0.35 + Math.random() * 0.35, 3.2, 0.4);
    }
    shockwave(pos, { color: 0xfff0c8, size: 0.9, duration: 0.3, y: 0.35 });
    flash(pos, { color: 0xffe0b0, intensity: 24, duration: 0.3 });
    stage.shake(0.07, 0.25);
  }

  /** 旗幟／聚光：從地面升起的金色光柱 */
  function beam(pos, color = 0xffd77a, duration = 1.2) {
    const geo = new THREE.CylinderGeometry(0.22, 0.36, 3.4, 20, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, pos.y + 1.7, pos.z);
    scene.add(mesh);
    tween(duration, (k) => {
      mat.opacity = Math.sin(k * Math.PI) * 0.28;
      mesh.scale.set(1 + k * 0.4, 1, 1 + k * 0.4);
    }, {
      onComplete: () => {
        scene.remove(mesh);
        geo.dispose();
        mat.dispose();
      },
    });
  }

  /* ================================================================ */
  /* 主更新                                                             */
  /* ================================================================ */
  let elapsed = 0;

  function update(dt) {
    const scaled = dt * timeScale;
    elapsed += scaled;
    updateTweens(scaled);
    updateParticles(scaled);

    // 選取光環脈動
    if (selectionGroup.visible) {
      const pulse = 0.85 + Math.sin(elapsed * 4.2) * 0.12;
      selOuter.scale.setScalar(pulse);
      selOuter.material.opacity = 0.55 + Math.sin(elapsed * 4.2) * 0.22;
      selDashes.rotation.y = elapsed * 1.3;
      selectionGroup.position.y += 0;
      selInner.rotation.z = -elapsed * 0.7;
    }
    if (hoverRing.visible) {
      hoverRing.material.opacity = 0.3 + Math.sin(elapsed * 5.5) * 0.15;
    }
    // 可走點光環脈動
    for (const slot of highlightActive) {
      const k = 0.5 + 0.5 * Math.sin(elapsed * 3.4 + slot.phase);
      slot.mat.opacity = 0.35 + k * 0.5;
      slot.group.scale.setScalar(0.92 + k * 0.14);
      slot.group.position.y = slot.group.position.y; // 固定
      slot.beamMat.opacity = (slot.kind === 'deploy' ? 0.1 : 0.035) * (0.6 + k * 0.8);
    }
    void selLift;
  }

  function dispose() {
    clearTweens();
    clearHighlights();
    scene.remove(points);
    pGeo.dispose();
    pMat.dispose();
    for (const s of shockPool) {
      scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.mat.dispose();
    }
    for (const f of flashLights) {
      scene.remove(f.light);
      f.light.dispose?.();
    }
    for (const s of highlightPool) {
      scene.remove(s.group);
      s.mat.dispose();
      s.beamMat.dispose();
    }
    hlRingGeo.dispose();
    hlDotGeo.dispose();
    scene.remove(selectionGroup);
    selectionGroup.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    scene.remove(hoverRing);
    hoverRing.geometry.dispose();
    hoverRing.material.dispose();
    if (bannerSprite) {
      scene.remove(bannerSprite);
      bannerSprite.material.map?.dispose?.();
      bannerSprite.material.dispose();
    }
    for (const tex of bannerCache.values()) tex.dispose();
    bannerCache.clear();
  }

  return {
    tween,
    delay,
    update,
    explode,
    shatter,
    missile,
    scan,
    clash,
    beam,
    banner,
    setSelection,
    setHover,
    highlightNodes,
    clearHighlights,
    shockwave,
    flash,
    spawnParticle,
    clearTweens,
    dispose,
    get elapsed() {
      return elapsed;
    },
    get timeScale() {
      return timeScale;
    },
    set timeScale(v) {
      timeScale = Math.max(0.05, Math.min(4, v));
    },
    /** 低畫質模式：減少粒子數量（粒子池本身固定大小） */
    setLowQuality(on) {
      lowQuality = !!on;
    },
    get lowQuality() {
      return lowQuality;
    },
    camera,
    scene,
  };
}

export default createEffects;
