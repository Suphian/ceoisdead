import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as CANNON from 'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js';

// A local tabletop toy. Deliberately independent of the game and peer protocol.
export function createDiceTray(container, { onResult = () => {}, onRolling = () => {} } = {}) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.append(renderer.domElement);
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', 'Two ivory dice in a velvet and brass tray');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 40);
  camera.position.set(0, 6.9, 5.8);
  camera.lookAt(0, .2, 0);
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture;
  scene.environmentIntensity = .45;
  room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xc0e0df, 0x253230, 1.6));
  const sun = new THREE.DirectionalLight(0xffe2b3, 3);
  sun.position.set(-3, 7, 4); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: .1, far: 15 });
  sun.shadow.normalBias = .018; sun.shadow.bias = -.0001;
  scene.add(sun);
  const materials = {
    wood: new THREE.MeshStandardMaterial({ color: 0x3a302b, roughness: .6 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb8914f, metalness: .8, roughness: .3 }),
    felt: new THREE.MeshStandardMaterial({ color: 0x164b43, roughness: 1 }),
    ivory: new THREE.MeshPhysicalMaterial({ color: 0xffedce, roughness: .28, clearcoat: .6 }),
    pip: new THREE.MeshStandardMaterial({ color: 0x273433, roughness: .5 }),
  };
  const geometries = new Set();
  materials.felt.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nfloat grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233))) * 43758.5453);\ndiffuseColor.rgb *= .94 + grain * .12;');
  };
  function box(w, h, d, x, y, z, material, radius = .05) {
    const geometry = new RoundedBoxGeometry(w, h, d, 3, radius);
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh); return mesh;
  }
  box(5.1, .24, 3.9, 0, -.2, 0, materials.wood, .12);
  box(4.85, .07, 3.65, 0, -.065, 0, materials.brass);
  box(4.55, .05, 3.35, 0, -.025, 0, materials.felt);
  for (const sign of [-1, 1]) {
    box(.21, .52, 3.7, sign * 2.37, .15, 0, materials.wood);
    box(.05, .035, 3.73, sign * 2.37, .422, 0, materials.brass, .014);
    box(4.9, .52, .21, 0, .15, sign * 1.78, materials.wood);
    box(4.9, .035, .05, 0, .422, sign * 1.78, materials.brass, .014);
    box(.03, .37, 3.33, sign * 2.25, .16, 0, materials.felt, .01);
    box(4.48, .37, .03, 0, .16, sign * 1.66, materials.felt, .01);
  }
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -18, 0), allowSleep: true });
  world.solver.iterations = 16;
  const physicsMaterial = new CANNON.Material('tray');
  world.defaultContactMaterial.friction = .42;
  world.defaultContactMaterial.restitution = .32;
  function boundary(x, y, z, hx, hy, hz) {
    const body = new CANNON.Body({ mass: 0, material: physicsMaterial, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)) });
    body.position.set(x, y, z); world.addBody(body);
  }
  boundary(0, -.15, 0, 2.4, .15, 1.8);
  // High invisible collision rails keep even an energetic roll in the tray.
  boundary(-2.35, 1.9, 0, .1, 2, 1.8); boundary(2.35, 1.9, 0, .1, 2, 1.8);
  boundary(0, 1.9, -1.76, 2.5, 2, .1); boundary(0, 1.9, 1.76, 2.5, 2, .1);
  boundary(0, 4, 0, 2.5, .1, 1.8);
  const faces = [
    { value: 1, normal: [0, 1, 0] }, { value: 6, normal: [0, -1, 0] },
    { value: 2, normal: [1, 0, 0] }, { value: 5, normal: [-1, 0, 0] },
    { value: 3, normal: [0, 0, 1] }, { value: 4, normal: [0, 0, -1] },
  ];
  const patterns = {
    1: [[0, 0]], 2: [[-1, 1], [1, -1]], 3: [[-1, 1], [0, 0], [1, -1]],
    4: [[-1, 1], [1, 1], [-1, -1], [1, -1]],
    5: [[-1, 1], [1, 1], [0, 0], [-1, -1], [1, -1]],
    6: [[-1, 1], [1, 1], [-1, 0], [1, 0], [-1, -1], [1, -1]],
  };
  const cubeGeometry = new RoundedBoxGeometry(.66, .66, .66, 4, .07);
  const pipGeometry = new THREE.CircleGeometry(.043, 16);
  geometries.add(cubeGeometry); geometries.add(pipGeometry);
  const dice = [0, 1].map(index => {
    const mesh = new THREE.Group();
    const cube = new THREE.Mesh(cubeGeometry, materials.ivory);
    cube.castShadow = true; cube.receiveShadow = true; mesh.add(cube);
    for (const face of faces) {
      const group = new THREE.Group();
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...face.normal));
      group.position.set(...face.normal).multiplyScalar(.331);
      for (const [x, y] of patterns[face.value]) {
        const pip = new THREE.Mesh(pipGeometry, materials.pip);
        pip.position.set(x * .145, y * .145, 0); group.add(pip);
      }
      mesh.add(group);
    }
    scene.add(mesh);
    const body = new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(.33, .33, .33)), linearDamping: .22, angularDamping: .2, sleepSpeedLimit: .12, sleepTimeLimit: .45 });
    body.position.set(index ? .6 : -.6, .33, 0);
    body.quaternion.setFromEuler(0, index ? -.4 : .3, 0);
    body.sleep(); world.addBody(body);
    return { mesh, body };
  });
  let disposed = false, rolling = false, started = 0, frame = 0, last = 0, nudgeAt = 0;
  function values() {
    return dice.map(({ body }) => {
      const ranked = faces.map(face => ({ value: face.value, up: body.quaternion.vmult(new CANNON.Vec3(...face.normal)).y })).sort((a, b) => b.up - a.up);
      return ranked[0].up > .985 ? ranked[0].value : null;
    });
  }
  function sync() { for (const { mesh, body } of dice) { mesh.position.copy(body.position); mesh.quaternion.copy(body.quaternion); } }
  function finish(result) {
    rolling = false; container.dataset.rolling = 'false';
    container.dataset.values = result.every(Boolean) ? result.join(',') : '';
    onRolling(false); onResult(result.every(Boolean) ? result : null);
  }
  function roll() {
    if (disposed || rolling) return;
    rolling = true; started = performance.now(); nudgeAt = started; container.dataset.rolling = 'true'; delete container.dataset.values;
    onRolling(true);
    dice.forEach(({ body }, index) => {
      body.wakeUp(); body.position.set(index ? .75 : -.75, 1.7 + index * .3, -.45);
      body.quaternion.setFromEuler(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      body.velocity.set((index ? -1 : 1) * (1 + Math.random()), .7, 1.7 + Math.random());
      body.angularVelocity.set(5 + Math.random() * 9, Math.random() * 13 - 6, Math.random() * 13 - 6);
    });
    if (reduced) {
      for (let i = 0; i < 900; i++) world.step(1 / 120);
      sync(); finish(values()); renderer.render(scene, camera);
    }
  }
  function resize() {
    const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight);
    camera.aspect = width / height; camera.position.set(0, width < 440 ? 9.5 : 6.9, width < 440 ? 7.5 : 5.8); camera.lookAt(0, .2, 0); camera.updateProjectionMatrix();
    renderer.setSize(width, height); renderer.render(scene, camera);
  }
  function animate(now) {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    const dt = Math.min((now - last) / 1000 || 1 / 60, .05); last = now;
    if (document.hidden) return;
    if (rolling) {
      world.step(1 / 120, dt, 8); sync();
      const settled = dice.every(({ body }) => body.sleepState === CANNON.Body.SLEEPING);
      if (now - started > 450 && settled && values().every(Boolean)) finish(values());
      else if (now - started > 12000) finish(values().map(() => null));
      else if (now - nudgeAt > 3500) {
        for (const { body } of dice) { body.wakeUp(); body.velocity.y += 1.8; body.angularVelocity.x += 2.5; }
        nudgeAt = now;
      }
      renderer.render(scene, camera);
    }
  }
  const observer = new ResizeObserver(resize); observer.observe(container);
  sync(); resize(); frame = requestAnimationFrame(animate);
  container.dataset.ready = 'true';
  function dispose() {
    if (disposed) return; disposed = true; cancelAnimationFrame(frame); observer.disconnect();
    geometries.forEach(g => g.dispose()); Object.values(materials).forEach(m => m.dispose());
    sun.shadow.dispose(); environment.dispose(); renderer.dispose(); renderer.domElement.remove();
    delete container.dataset.ready;
  }
  return { roll, dispose };
}
