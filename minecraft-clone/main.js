const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');
const overlayTip = document.getElementById('overlay-tip');

function showFatal(message) {
  if (overlay) overlay.style.display = 'grid';
  if (overlayTip) {
    overlayTip.textContent = message;
    overlayTip.style.color = '#ffd5d5';
  }
  if (startBtn) {
    startBtn.textContent = 'Не удалось запустить';
    startBtn.disabled = true;
    startBtn.style.opacity = '0.7';
    startBtn.style.cursor = 'not-allowed';
  }
}

async function loadThree() {
  const urls = [
    'https://unpkg.com/three@0.161.0/build/three.module.js',
    'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js',
  ];

  for (const url of urls) {
    try {
      return await import(url);
    } catch {
      // try next CDN
    }
  }

  throw new Error('THREE_LOAD_FAILED');
}

async function boot() {
  let THREE;
  try {
    THREE = await loadThree();
  } catch {
    showFatal('Не удалось загрузить 3D движок (CDN недоступен). Откройте страницу через интернет или другой CDN/VPN.');
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 20, 120);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.position.set(0, 10, 0);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    showFatal('WebGL недоступен в браузере/видеодрайвере. Включите аппаратное ускорение.');
    return;
  }

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.style.position = 'fixed';
  renderer.domElement.style.inset = '0';
  document.body.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x6699aa, 0.9);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(30, 80, 20);
  scene.add(dir);

  const blockSize = 1;
  const worldRadius = 20;
  const boxGeo = new THREE.BoxGeometry(blockSize, blockSize, blockSize);
  const blockMats = {
    grass: new THREE.MeshLambertMaterial({ color: 0x6fbf45 }),
    dirt: new THREE.MeshLambertMaterial({ color: 0x8b5a2b }),
    stone: new THREE.MeshLambertMaterial({ color: 0x8a8a8a }),
  };

  const blocks = new Map();
  const worldGroup = new THREE.Group();
  scene.add(worldGroup);

  function key(x, y, z) {
    return `${x},${y},${z}`;
  }

  function heightAt(x, z) {
    return Math.floor(5 + Math.sin(x * 0.25) * 2 + Math.cos(z * 0.22) * 2 + Math.sin((x + z) * 0.15));
  }

  function createBlock(x, y, z, type = 'dirt') {
    const k = key(x, y, z);
    if (blocks.has(k)) return;

    const mesh = new THREE.Mesh(boxGeo, blockMats[type] ?? blockMats.dirt);
    mesh.position.set(x, y, z);
    mesh.userData.blockPos = new THREE.Vector3(x, y, z);
    worldGroup.add(mesh);
    blocks.set(k, mesh);
  }

  function removeBlock(x, y, z) {
    const k = key(x, y, z);
    const mesh = blocks.get(k);
    if (!mesh) return;
    worldGroup.remove(mesh);
    blocks.delete(k);
  }

  for (let x = -worldRadius; x <= worldRadius; x += 1) {
    for (let z = -worldRadius; z <= worldRadius; z += 1) {
      const h = heightAt(x, z);
      for (let y = -2; y <= h; y += 1) {
        const top = y === h;
        const deep = y < h - 3;
        const type = top ? 'grass' : deep ? 'stone' : 'dirt';
        createBlock(x, y, z, type);
      }
    }
  }

  const keys = new Set();
  const velocity = new THREE.Vector3();
  const moveDir = new THREE.Vector3();
  const onGround = { value: false };

  const player = {
    pos: new THREE.Vector3(0, 12, 0),
    yaw: 0,
    pitch: 0,
    eyeHeight: 1.7,
    radius: 0.35,
  };

  let started = false;
  let pointerLocked = false;
  let dragging = false;

  function hideOverlay() {
    if (overlay) overlay.style.display = 'none';
  }

  async function startGame() {
    if (started) return;
    started = true;
    hideOverlay();

    if (typeof document.body.requestPointerLock === 'function') {
      try {
        await document.body.requestPointerLock();
      } catch {
        // no-op, fallback controls still work
      }
    }
  }

  startBtn?.addEventListener('click', startGame);
  overlay?.addEventListener('pointerdown', startGame);

  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === document.body;
  });

  document.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (!started && (e.code === 'Space' || e.code === 'Enter')) {
      startGame();
    }
  });

  document.addEventListener('keyup', (e) => keys.delete(e.code));

  renderer.domElement.addEventListener('mousedown', (e) => {
    if (!started) return;
    if (e.button === 0) dragging = true;
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
  });

  window.addEventListener('mousemove', (e) => {
    if (!started) return;
    if (!pointerLocked && !dragging) return;

    player.yaw -= e.movementX * 0.002;
    player.pitch -= e.movementY * 0.002;
    player.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, player.pitch));
  });

  const raycaster = new THREE.Raycaster();
  const rayOrigin = new THREE.Vector3();
  const rayDir = new THREE.Vector3();

  function lookVector() {
    rayDir
      .set(
        Math.cos(player.pitch) * Math.sin(player.yaw),
        Math.sin(player.pitch),
        Math.cos(player.pitch) * Math.cos(player.yaw)
      )
      .normalize();
    return rayDir;
  }

  window.addEventListener('mousedown', (e) => {
    if (!started) return;

    rayOrigin.copy(player.pos).add(new THREE.Vector3(0, player.eyeHeight, 0));
    raycaster.set(rayOrigin, lookVector());
    raycaster.far = 7;

    const intersects = raycaster.intersectObjects(worldGroup.children, false);
    if (!intersects.length) return;

    const hit = intersects[0];
    const bp = hit.object.userData.blockPos;

    if (e.button === 0) {
      removeBlock(bp.x, bp.y, bp.z);
    } else if (e.button === 2) {
      const placePos = bp.clone().add(hit.face.normal);
      createBlock(placePos.x, placePos.y, placePos.z, 'dirt');
    }
  });

  window.addEventListener('contextmenu', (e) => e.preventDefault());

  function collidesAt(pos) {
    const halfHeight = 0.9;
    const points = [
      [pos.x - player.radius, pos.y - halfHeight, pos.z - player.radius],
      [pos.x + player.radius, pos.y - halfHeight, pos.z - player.radius],
      [pos.x - player.radius, pos.y - halfHeight, pos.z + player.radius],
      [pos.x + player.radius, pos.y - halfHeight, pos.z + player.radius],
      [pos.x - player.radius, pos.y + halfHeight, pos.z - player.radius],
      [pos.x + player.radius, pos.y + halfHeight, pos.z - player.radius],
      [pos.x - player.radius, pos.y + halfHeight, pos.z + player.radius],
      [pos.x + player.radius, pos.y + halfHeight, pos.z + player.radius],
    ];

    return points.some(([x, y, z]) => blocks.has(key(Math.round(x), Math.round(y), Math.round(z))));
  }

  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.033);

    if (started) {
      const speed = keys.has('ShiftLeft') ? 8 : 5;
      moveDir.set(0, 0, 0);
      if (keys.has('KeyW')) moveDir.z += 1;
      if (keys.has('KeyS')) moveDir.z -= 1;
      if (keys.has('KeyA')) moveDir.x -= 1;
      if (keys.has('KeyD')) moveDir.x += 1;
      moveDir.normalize();

      const forward = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
      const right = new THREE.Vector3(forward.z, 0, -forward.x);
      const wishMove = new THREE.Vector3();
      wishMove.addScaledVector(forward, moveDir.z);
      wishMove.addScaledVector(right, moveDir.x);
      if (wishMove.lengthSq() > 0) wishMove.normalize().multiplyScalar(speed);

      velocity.x = wishMove.x;
      velocity.z = wishMove.z;
      velocity.y -= 20 * dt;

      if (keys.has('Space') && onGround.value) {
        velocity.y = 8;
        onGround.value = false;
      }

      const nextPos = player.pos.clone();
      nextPos.x += velocity.x * dt;
      if (!collidesAt(nextPos)) player.pos.x = nextPos.x;

      nextPos.copy(player.pos);
      nextPos.z += velocity.z * dt;
      if (!collidesAt(nextPos)) player.pos.z = nextPos.z;

      nextPos.copy(player.pos);
      nextPos.y += velocity.y * dt;
      if (!collidesAt(nextPos)) {
        player.pos.y = nextPos.y;
        onGround.value = false;
      } else {
        if (velocity.y < 0) onGround.value = true;
        velocity.y = 0;
      }

      if (player.pos.y < -30) {
        player.pos.set(0, 14, 0);
        velocity.set(0, 0, 0);
      }
    }

    const eye = player.pos.clone().add(new THREE.Vector3(0, player.eyeHeight, 0));
    camera.position.copy(eye);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;

    renderer.render(scene, camera);
  }

  animate();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

boot();
