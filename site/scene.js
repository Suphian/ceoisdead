import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Original, procedural tabletop art: no downloaded textures or branded assets.
const FACTIONS = [0x7cbbd0, 0xe1b871, 0xd88278];
const INK = '#25363b';
const GOLD = 0xe8c47f;
const LAYOUT = [
  { x: -1.25, z: -4.10, r: 1.15, angle: 0.14 },
  { x:  0.75, z: -2.90, r: 1.25, angle: -0.13 },
  { x: -1.18, z: -1.78, r: 1.28, angle: 0.13 },
  { x:  0.93, z: -0.46, r: 1.33, angle: -0.06 },
  { x: -1.21, z:  0.70, r: 1.30, angle: -0.04 },
  { x:  1.05, z:  2.00, r: 1.30, angle: 0.08 },
  { x: -1.02, z:  3.18, r: 1.25, angle: -0.05 },
  { x: -3.03, z:  4.28, r: 1.05, angle: 0.14 },
];

function polygon(radius, angle = 0) {
  const shape = new THREE.Shape();
  // Slightly irregular coast edges give each tile its own carved silhouette.
  const offsets = [1, 0.96, 1.03, 0.94, 1.02, 0.98];
  for (let i = 0; i < 6; i++) {
    const a = angle + Math.PI / 3 * i + Math.PI / 6;
    const x = Math.cos(a) * radius * offsets[i];
    const y = Math.sin(a) * radius * offsets[i];
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function roundedRectangle(width, height, radius) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

function extruded(shape, depth, bevel = 0.04) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, steps: 1, bevelEnabled: bevel > 0,
    bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2,
    curveSegments: 12,
  });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function makeLabel(text, subtitle = '', light = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 144;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('A canvas context is required for the 3D board.');
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = light ? '#e8deca' : INK;
  context.font = '600 33px Georgia, serif';
  context.fillText(String(text).slice(0, 27), 256, 52, 474);
  context.fillStyle = light ? '#a7bbb8' : '#718078';
  context.font = '500 18px Arial, sans-serif';
  context.fillText(String(subtitle).toUpperCase().slice(0, 36), 256, 99, 470);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture, transparent: true, depthTest: false, depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.45, 0.69, 1);
  sprite.renderOrder = 8;
  return sprite;
}

function destroyLabel(sprite) {
  sprite.material.map?.dispose();
  sprite.material.dispose();
}

export function createBoardScene(container, { onRegionClick = () => {} } = {}) {
  if (!container) throw new Error('A board container is required.');
  const renderer = new THREE.WebGLRenderer({
    alpha: true, antialias: true, powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = 'board-webgl';
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'none';
  canvas.setAttribute('aria-label', 'Three-dimensional game board. Drag to rotate, scroll to zoom. Use the territory buttons to choose a region with a keyboard.');
  canvas.setAttribute('role', 'img');
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.1, 100);
  camera.position.set(10, 15.8, 15.5);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(-0.6, 0, 0.1);
  controls.enableDamping = true;
  controls.dampingFactor = 0.085;
  controls.enablePan = false;
  controls.minZoom = 0.7;
  controls.maxZoom = 1.8;
  controls.minPolarAngle = 0.08;
  controls.maxPolarAngle = Math.PI / 2.8;
  controls.rotateSpeed = 0.45;
  controls.zoomSpeed = 0.55;
  controls.update();

  scene.add(new THREE.HemisphereLight(0xfff0d4, 0x284554, 3.0));
  const key = new THREE.DirectionalLight(0xffeed4, 4.0);
  key.position.set(-5, 11, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -10;
  key.shadow.camera.right = 10;
  key.shadow.camera.top = 10;
  key.shadow.camera.bottom = -10;
  key.shadow.normalBias = 0.035;
  key.shadow.bias = -0.00015;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9ec6dc, 1.6);
  rim.position.set(5, 4, -8);
  scene.add(rim);

  const materials = {
    base: new THREE.MeshStandardMaterial({ color: 0x122831, roughness: 0.74, metalness: 0.16 }),
    sea: new THREE.MeshStandardMaterial({ color: 0x244d58, roughness: 0.75, metalness: 0.1 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb69a62, roughness: 0.38, metalness: 0.64 }),
    coast: new THREE.MeshStandardMaterial({ color: 0x9a9b7d, roughness: 0.92 }),
    tower: new THREE.MeshStandardMaterial({ color: 0xf5e5bd, roughness: 0.77 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x52646a, roughness: 0.87 }),
    factions: FACTIONS.map(color => new THREE.MeshStandardMaterial({
      color, roughness: 0.42, metalness: 0.07,
    })),
  };
  const plinth = new THREE.Mesh(extruded(roundedRectangle(12.2, 14.4, 0.6), 0.44, 0.10), materials.base);
  plinth.position.set(-0.6, -0.73, 0.15);
  plinth.receiveShadow = true;
  scene.add(plinth);
  const trim = new THREE.Mesh(extruded(roundedRectangle(12.08, 14.28, 0.56), 0.055, 0.025), materials.brass);
  trim.position.copy(plinth.position).y = -0.27;
  scene.add(trim);
  const sea = new THREE.Mesh(extruded(roundedRectangle(11.96, 14.16, 0.50), 0.11, 0.025), materials.sea);
  sea.position.copy(plinth.position).y = -0.205;
  sea.receiveShadow = true;
  scene.add(sea);

  // Fine cartographic rules sit in the sea and never intercept pointer picking.
  const gridPoints = [];
  for (let x = -5; x <= 5; x += 1) {
    gridPoints.push(x - 0.6, -0.063, -6.4, x - 0.6, -0.063, 6.7);
  }
  for (let z = -6; z <= 6; z += 1) {
    gridPoints.push(-6.1, -0.063, z + 0.15, 4.9, -0.063, z + 0.15);
  }
  const grid = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3)),
    new THREE.LineBasicMaterial({ color: 0x92b8b6, transparent: true, opacity: 0.085 }),
  );
  scene.add(grid);

  const title = makeLabel('THE BOARD', 'A contest of influence', true);
  title.position.set(2.6, 0.1, -4.85);
  title.scale.set(3.1, 0.87, 1);
  scene.add(title);

  // A small engraved compass and outlying rocks give the sea a crafted feel.
  const compass = new THREE.Group();
  compass.position.set(3.65, -0.04, 4.65);
  const compassRing = new THREE.Mesh(
    new THREE.RingGeometry(0.64, 0.655, 48),
    new THREE.MeshBasicMaterial({ color: 0xc9bb94, transparent: true, opacity: 0.48, side: THREE.DoubleSide }),
  );
  compassRing.rotation.x = -Math.PI / 2;
  compass.add(compassRing);
  const needle = new THREE.Mesh(
    new THREE.ConeGeometry(0.17, 1.05, 4),
    new THREE.MeshStandardMaterial({ color: 0xd9c698, roughness: 0.45, metalness: 0.4 }),
  );
  needle.rotation.x = Math.PI / 2;
  needle.position.set(0, 0.028, -0.1);
  compass.add(needle);
  scene.add(compass);
  const north = makeLabel('N', '', true);
  north.scale.set(0.55, 0.2, 1);
  north.position.set(3.65, 0.05, 3.7);
  scene.add(north);

  const rocks = [
    [-3.85, -4.5, 0.2], [-3.5, -4.1, 0.11], [-4.5, -0.7, 0.42],
    [-4.85, -0.1, 0.33], [-4.4, 0.4, 0.27], [3.3, 2.1, 0.15],
    [-3.9, 5.8, 0.13], [-4.25, 5.9, 0.085],
  ];
  const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
  rocks.forEach(([x, z, scale], index) => {
    const rock = new THREE.Mesh(rockGeometry, materials.coast);
    rock.position.set(x, -0.1, z);
    rock.scale.set(scale, scale * 0.4, scale * 1.45);
    rock.rotation.y = index * 0.7;
    rock.receiveShadow = true;
    scene.add(rock);
  });

  const cubeGeometry = new THREE.BoxGeometry(0.235, 0.25, 0.235);
  const castleBaseGeometry = new THREE.BoxGeometry(0.40, 0.26, 0.31);
  const castleTowerGeometry = new THREE.BoxGeometry(0.14, 0.40, 0.15);
  const castleRoofGeometry = new THREE.BoxGeometry(0.19, 0.05, 0.20);
  const regionNodes = new Map();
  const pickables = [];
  let selected = null;
  let hovered = null;
  let disposed = false;
  let currentView = '3d';
  let pointerStart = null;
  let resizeObserver;
  let frame = 0;
  let dirty = true;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const clock = new THREE.Clock();

  function buildRegion(region, index) {
    const layout = LAYOUT[index % LAYOUT.length];
    const group = new THREE.Group();
    group.position.set(
      Number.isFinite(region.x) && Math.abs(region.x) <= 7 ? region.x : layout.x,
      0,
      Number.isFinite(region.z) && Math.abs(region.z) <= 8 ? region.z : layout.z,
    );
    const geometry = extruded(polygon(layout.r, layout.angle), 0.17, 0.055);
    const top = new THREE.MeshStandardMaterial({
      color: index % 2 ? 0xd7d7b9 : 0xe1dfc6, roughness: 0.92,
      emissive: 0x000000, emissiveIntensity: 0.16,
    });
    const tile = new THREE.Mesh(geometry, [top, materials.coast]);
    tile.castShadow = true;
    tile.receiveShadow = true;
    tile.userData.regionId = region.id;
    group.add(tile);
    pickables.push(tile);

    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 28),
      new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0 }),
    );
    outline.position.y = 0.014;
    group.add(outline);

    const castle = new THREE.Group();
    castle.position.set(-0.50, 0.235, -0.43);
    const base = new THREE.Mesh(castleBaseGeometry, materials.tower);
    base.position.y = 0.13;
    base.castShadow = true;
    castle.add(base);
    [-0.2, 0.2].forEach(x => {
      const tower = new THREE.Mesh(castleTowerGeometry, materials.tower);
      tower.position.set(x, 0.20, 0.01);
      tower.castShadow = true;
      castle.add(tower);
      const roof = new THREE.Mesh(castleRoofGeometry, materials.roof);
      roof.position.set(x, 0.43, 0.01);
      roof.rotation.y = 0;
      roof.castShadow = true;
      castle.add(roof);
    });
    group.add(castle);
    const cubes = new THREE.Group();
    group.add(cubes);
    scene.add(group);
    const node = { group, tile, top, outline, cubes, label: null, signature: '', region, index };
    regionNodes.set(region.id, node);
    return node;
  }

  function refreshRegion(node, region, index) {
    const signature = JSON.stringify([region.name, region.cubes, region.controller, region.unstable, region.resolved, region.current]);
    node.region = region;
    if (node.signature === signature) return;
    node.signature = signature;
    while (node.cubes.children.length) node.cubes.remove(node.cubes.children[0]);
    let slot = 0;
    for (let faction = 0; faction < 3; faction++) {
      const count = Math.min(12, Math.max(0, Math.floor(Number(region.cubes?.[faction]) || 0)));
      for (let c = 0; c < count; c++) {
        const cube = new THREE.Mesh(cubeGeometry, materials.factions[faction]);
        const level = Math.floor(slot / 9);
        const cell = slot % 9;
        cube.position.set(0.10 + (cell % 3) * 0.285, 0.37 + level * 0.25, -0.43 + Math.floor(cell / 3) * 0.30);
        cube.rotation.y = ((index * 5 + slot * 3) % 7 - 3) * 0.035;
        cube.castShadow = true;
        cube.receiveShadow = true;
        node.cubes.add(cube);
        slot++;
      }
    }
    const color = region.unstable ? 0x9c9f91
      : Number.isInteger(region.controller) && region.controller >= 0 && region.controller < 3
        ? FACTIONS[region.controller]
        : index % 2 ? 0xd7d7b9 : 0xe1dfc6;
    node.top.color.setHex(color);
    if (region.resolved && !region.unstable) node.top.color.lerp(new THREE.Color(0xe5dcc4), 0.56);
    if (node.label) {
      node.group.remove(node.label);
      destroyLabel(node.label);
    }
    const labelDetail = region.unstable ? 'Unrest' : region.resolved ? 'Settled' : region.current ? 'Contested now' : String(index + 1).padStart(2, '0');
    node.label = makeLabel(region.name || 'Region ' + (index + 1), labelDetail);
    node.label.position.set(0, 0.33, 0.61);
    node.group.add(node.label);
    dirty = true;
  }

  function update(state, selectedRegion = null) {
    if (disposed) return;
    selected = typeof selectedRegion === 'object' && selectedRegion !== null ? selectedRegion.id : selectedRegion;
    const regions = Array.isArray(state?.regions) ? state.regions : [];
    const activeIds = new Set(regions.map(region => region.id));
    for (const [id, node] of regionNodes) {
      if (!activeIds.has(id)) {
        scene.remove(node.group);
        regionNodes.delete(id);
        const pickIndex = pickables.indexOf(node.tile);
        if (pickIndex !== -1) pickables.splice(pickIndex, 1);
        node.tile.geometry.dispose();
        node.top.dispose();
        node.outline.geometry.dispose();
        node.outline.material.dispose();
        if (node.label) destroyLabel(node.label);
      }
    }
    regions.forEach((region, index) => refreshRegion(regionNodes.get(region.id) || buildRegion(region, index), region, index));
    dirty = true;
  }

  function pick(event) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(pickables, false)[0]?.object.userData.regionId ?? null;
  }
  const onPointerDown = event => {
    if (event.isPrimary === false) { pointerStart = null; return; }
    if (event.button > 0) return;
    pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId, moved: false };
  };
  const onPointerUp = event => {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    const travel = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    const moved = pointerStart.moved;
    pointerStart = null;
    if (moved || travel > 7) return;
    const id = pick(event);
    if (id !== null) onRegionClick(id);
  };
  const onPointerMove = event => {
    if (pointerStart && pointerStart.id === event.pointerId && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 7) pointerStart.moved = true;
    hovered = pick(event);
    canvas.style.cursor = hovered !== null ? 'pointer' : 'grab';
    dirty = true;
  };
  const onPointerLeave = () => { hovered = null; pointerStart = null; dirty = true; };
  const onContextLost = event => {
    event.preventDefault();
    container.dispatchEvent(new CustomEvent('board-context-lost', { bubbles: true }));
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('pointercancel', onPointerLeave);
  canvas.addEventListener('webglcontextlost', onContextLost);
  controls.addEventListener('change', () => { dirty = true; });

  function resize() {
    if (disposed) return;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const aspect = width / height;
    const halfHeight = aspect < 1 ? 9.2 / aspect : 9.2;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    dirty = true;
  }
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
  } else {
    window.addEventListener('resize', resize);
  }
  resize();

  function setView(view) {
    currentView = view === 'top' ? 'top' : '3d';
    camera.position.copy(currentView === 'top'
      ? new THREE.Vector3(-0.6, 24, 0.13)
      : new THREE.Vector3(10, 15.8, 15.5));
    controls.target.set(-0.6, 0, 0.1);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    controls.minPolarAngle = currentView === 'top' ? 0 : 0.08;
    controls.enableRotate = currentView !== 'top';
    controls.update();
    dirty = true;
  }

  function animate() {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    if (document.hidden) return;
    const elapsed = clock.getElapsedTime();
    let moving = false;
    for (const [id, node] of regionNodes) {
      const isSelected = id === selected;
      const isHovered = id === hovered;
      const target = isSelected ? 0.14 : isHovered ? 0.075 : 0;
      const delta = target - node.group.position.y;
      if (Math.abs(delta) > 0.001) {
        node.group.position.y += reduceMotion ? delta : delta * 0.13;
        moving = true;
      }
      const isCurrent = Boolean(node.region.current && !node.region.resolved);
      const opacity = isSelected ? 1 : isHovered ? 0.8 : isCurrent ? 0.55 : 0;
      node.outline.material.opacity = opacity;
      node.top.emissive.setHex(isSelected ? 0x86734a : isHovered ? 0x50533f : 0x000000);
      if (isCurrent && !reduceMotion) {
        node.outline.material.opacity = isSelected ? 1 : 0.47 + Math.sin(elapsed * 1.7) * 0.12;
        moving = true;
      }
    }
    const changed = controls.update();
    if (dirty || moving || changed) {
      renderer.render(scene, camera);
      dirty = false;
    }
  }
  animate();

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    window.removeEventListener('resize', resize);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    canvas.removeEventListener('pointercancel', onPointerLeave);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    controls.dispose();
    const geometries = new Set();
    const disposedMaterials = new Set();
    const textures = new Set();
    scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      const entries = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      entries.forEach(material => {
        if (material.map) textures.add(material.map);
        disposedMaterials.add(material);
      });
    });
    Object.values(materials).flat().forEach(material => disposedMaterials.add(material));
    geometries.add(cubeGeometry);
    geometries.add(castleBaseGeometry);
    geometries.add(castleTowerGeometry);
    geometries.add(castleRoofGeometry);
    geometries.add(rockGeometry);
    geometries.forEach(geometry => geometry.dispose());
    textures.forEach(texture => texture.dispose());
    disposedMaterials.forEach(material => material.dispose());
    key.shadow.dispose();
    renderer.dispose();
    canvas.remove();
  }
  return { update, setView, dispose };
}
