/**
 * 三軍棋 3D — 場景層
 * ------------------------------------------------------------------
 * 負責 renderer / scene / camera / OrbitControls / 燈光 / 天空 / 桌面 /
 * PBR 環境貼圖 / EffectComposer + UnrealBloom / 相機飛行與震動。
 * 棋盤與棋子由各自模組加入這個場景。
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeWoodTexture, setMaxAnisotropy, Ease, clamp, TAU } from './utils.js';

const SKY_VERT = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SKY_FRAG = /* glsl */ `
varying vec3 vWorldPos;
uniform float uTime;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec3 dir = normalize(vWorldPos);
  float h = clamp(dir.y, -0.5, 1.0);

  vec3 zenith = vec3(0.012, 0.018, 0.05);
  vec3 mid = vec3(0.034, 0.048, 0.105);
  vec3 horizon = vec3(0.135, 0.10, 0.085);

  vec3 col = mix(mid, zenith, smoothstep(0.12, 0.85, h));
  col = mix(horizon, col, smoothstep(-0.03, 0.30, h));

  // 暖色地平線光暈
  vec3 glowDir = normalize(vec3(0.12, 0.07, 1.0));
  float glow = pow(max(0.0, dot(dir, glowDir)), 7.0);
  col += vec3(0.34, 0.17, 0.055) * glow * 0.85;

  // 另一側冷色微光
  float cool = pow(max(0.0, dot(dir, normalize(vec3(-0.5, 0.2, -0.8)))), 5.0);
  col += vec3(0.04, 0.08, 0.17) * cool * 0.5;

  // 星點
  vec2 sp = dir.xz / max(0.18, dir.y + 0.25) * 9.0;
  float st = hash(floor(sp * 96.0));
  float star = smoothstep(0.9972, 1.0, st) * smoothstep(0.0, 0.32, h);
  float tw = 0.55 + 0.45 * sin(uTime * 2.2 + st * 60.0);
  col += vec3(0.85, 0.92, 1.0) * star * 1.35 * tw;

  // 低空薄雲
  float cl = noise(dir.xz * 5.0 + vec2(uTime * 0.006, 0.0)) * noise(dir.xz * 11.0 - vec2(uTime * 0.004, 0.0));
  col += vec3(0.07, 0.07, 0.095) * smoothstep(0.32, 0.85, cl) * smoothstep(0.03, 0.42, h) * 0.9;

  gl_FragColor = vec4(col, 1.0);
}
`;

export function createStage(container) {
  /* ---------------- renderer ---------------- */
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(container.clientWidth || 1280, container.clientHeight || 800);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);

  setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());

  /* ---------------- scene / camera ---------------- */
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0b0e16, 0.0125);

  const camera = new THREE.PerspectiveCamera(
    45,
    (container.clientWidth || 1280) / (container.clientHeight || 800),
    0.1,
    160
  );
  camera.position.set(0, 12.5, 14);
  camera.lookAt(0, 0, 0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.1, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 7.5;
  controls.maxDistance = 34;
  controls.minPolarAngle = 0.16;
  controls.maxPolarAngle = 1.34;
  controls.enablePan = true;
  controls.panSpeed = 0.55;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.75;
  controls.screenSpacePanning = false;
  controls.update();

  /* ---------------- 天空穹頂 ---------------- */
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(62, 40, 24), skyMat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  /* ---------------- 燈光 ---------------- */
  const hemi = new THREE.HemisphereLight(0xa9c6ff, 0x3a2a1a, 0.62);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xffe1b2, 2.7);
  keyLight.position.set(7.5, 16, 9.5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.left = -10.5;
  keyLight.shadow.camera.right = 10.5;
  keyLight.shadow.camera.top = 10.5;
  keyLight.shadow.camera.bottom = -10.5;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 46;
  keyLight.shadow.bias = -0.00035;
  keyLight.shadow.normalBias = 0.022;
  keyLight.shadow.radius = 2.5;
  keyLight.target.position.set(0, 0, 0);
  scene.add(keyLight, keyLight.target);

  const fillLight = new THREE.DirectionalLight(0x6fa8ff, 0.85);
  fillLight.position.set(-9, 8.5, -7);
  scene.add(fillLight);

  const warmFill = new THREE.PointLight(0xffb570, 26, 30, 2);
  warmFill.position.set(-1.5, 5.5, 12.5);
  scene.add(warmFill);

  const northRim = new THREE.PointLight(0x79c9ff, 18, 26, 2);
  northRim.position.set(2.5, 5, -12);
  scene.add(northRim);

  const centerGlow = new THREE.PointLight(0xffd9a0, 10, 16, 2);
  centerGlow.position.set(0, 6.5, 0);
  scene.add(centerGlow);

  /* ---------------- 桌面 ---------------- */
  const woodTex = makeWoodTexture();
  woodTex.repeat.set(2.2, 2.2);
  const tableMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    color: 0x9a7b5c,
    metalness: 0.12,
    roughness: 0.62,
    envMapIntensity: 0.5,
  });
  const table = new THREE.Mesh(new THREE.CircleGeometry(19, 80), tableMat);
  table.rotation.x = -Math.PI / 2;
  table.position.y = -0.62;
  table.receiveShadow = true;
  scene.add(table);

  // 桌緣（厚木 + 黃銅環）
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x2a1a0e,
    metalness: 0.35,
    roughness: 0.45,
    envMapIntensity: 0.7,
  });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(19, 0.16, 10, 128), rimMat);
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = -0.7;
  scene.add(rim);

  const brassRing = new THREE.Mesh(
    new THREE.TorusGeometry(10.2, 0.022, 6, 160),
    new THREE.MeshStandardMaterial({ color: 0xbf9750, metalness: 0.95, roughness: 0.28 })
  );
  brassRing.rotation.x = -Math.PI / 2;
  brassRing.position.y = -0.615;
  scene.add(brassRing);

  /* ---------------- PBR 環境貼圖（程序生成） ---------------- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileCubemapShader();
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x070a11);
  const panel = (color, w, h, pos, look) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, toneMapped: false })
    );
    m.position.set(...pos);
    m.lookAt(new THREE.Vector3(...look));
    envScene.add(m);
  };
  panel(new THREE.Color(5.2, 3.1, 1.55), 26, 8, [2, 13, 9], [0, 0, 0]); // 暖色主光
  panel(new THREE.Color(0.45, 1.0, 2.2), 20, 9, [-11, 6, -8], [0, 0, 0]); // 冷色補光
  panel(new THREE.Color(0.9, 0.55, 0.28), 8, 16, [12, 5, 5], [0, 0, 0]); // 側面暖光
  panel(new THREE.Color(0.05, 0.06, 0.1), 60, 60, [0, -12, 0], [0, 0, 0]); // 暗地面
  const envRT = pmrem.fromScene(envScene, 0.55);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.8;
  pmrem.dispose();
  envScene.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });

  /* ---------------- 後處理 ---------------- */
  const size = new THREE.Vector2(
    Math.max(2, container.clientWidth || 1280),
    Math.max(2, container.clientHeight || 800)
  );
  const renderTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, renderTarget);
  composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  composer.setSize(size.x, size.y);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.62, 0.72, 0.82);
  composer.addPass(bloomPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  /* ---------------- 相機飛行 / 震動 ---------------- */
  const flyTweens = [];
  let shakeAmp = 0;
  let shakeTime = 0;
  let shakeDur = 0;

  /** 相機平滑飛到指定位置與注視點 */
  function flyTo(pos, target, duration = 1.0) {
    return new Promise((resolve) => {
      flyTweens.push({
        fromPos: camera.position.clone(),
        toPos: new THREE.Vector3(...pos),
        fromTarget: controls.target.clone(),
        toTarget: new THREE.Vector3(...target),
        t: 0,
        duration: Math.max(0.01, duration),
        resolve,
      });
    });
  }

  function shake(intensity = 0.2, duration = 0.5) {
    shakeAmp = Math.max(shakeAmp, intensity);
    shakeDur = Math.max(shakeDur, duration);
    shakeTime = 0;
  }

  function updateCameraTweens(dt) {
    for (let i = flyTweens.length - 1; i >= 0; i--) {
      const tw = flyTweens[i];
      tw.t += dt;
      const k = Ease.inOutCubic(clamp(tw.t / tw.duration, 0, 1));
      camera.position.lerpVectors(tw.fromPos, tw.toPos, k);
      controls.target.lerpVectors(tw.fromTarget, tw.toTarget, k);
      if (tw.t >= tw.duration) {
        flyTweens.splice(i, 1);
        tw.resolve?.();
      }
    }
  }

  let elapsed = 0;
  const shakeOffset = new THREE.Vector3();

  function render(dt) {
    elapsed += dt;
    updateCameraTweens(dt);
    controls.update();
    // 注視點限制在棋盤附近
    controls.target.x = clamp(controls.target.x, -7.5, 7.5);
    controls.target.y = clamp(controls.target.y, -0.6, 3.5);
    controls.target.z = clamp(controls.target.z, -7.5, 7.5);

    // 鏡頭震動（在 controls 更新後疊加，不影響下一幀）
    if (shakeDur > 0) {
      shakeTime += dt;
      const decay = Math.max(0, 1 - shakeTime / shakeDur);
      const a = shakeAmp * decay * decay;
      if (a > 0.0005) {
        shakeOffset.set(
          (Math.sin(shakeTime * 61.3) + Math.sin(shakeTime * 37.1)) * 0.5 * a,
          (Math.sin(shakeTime * 53.7) + Math.cos(shakeTime * 29.3)) * 0.5 * a,
          (Math.cos(shakeTime * 47.9) + Math.sin(shakeTime * 33.7)) * 0.5 * a
        );
        camera.position.add(shakeOffset);
        camera.rotateZ(Math.sin(shakeTime * 43.1) * a * 0.05);
      }
      if (decay <= 0) {
        shakeDur = 0;
        shakeAmp = 0;
      }
    }

    skyMat.uniforms.uTime.value = elapsed;
    composer.render(dt);
  }

  function setSize(w, h) {
    if (w <= 0 || h <= 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloomPass.resolution.set(w, h);
  }

  function dispose() {
    controls.dispose();
    composer.dispose();
    renderer.dispose();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose?.();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) {
          for (const k of Object.keys(m)) {
            const v = m[k];
            if (v && v.isTexture) v.dispose?.();
          }
          m.dispose?.();
        }
      }
    });
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  }

  return {
    renderer,
    scene,
    camera,
    controls,
    composer,
    bloomPass,
    keyLight,
    sky,
    flyTo,
    shake,
    updateCameraTweens,
    render,
    setSize,
    dispose,
    get elapsed() {
      return elapsed;
    },
    setBloom(strength, radius, threshold) {
      bloomPass.strength = strength;
      bloomPass.radius = radius;
      bloomPass.threshold = threshold;
    },
    setExposure(v) {
      renderer.toneMappingExposure = v;
    },
  };
}

/* 小工具：讓外部能取得相機目前方位（南/北視角判斷） */
export function cameraSide(camera) {
  return camera.position.z >= 0 ? 'south' : 'north';
}

/* 供除錯與測試頁使用 */
export { SKY_FRAG, SKY_VERT, TAU };
