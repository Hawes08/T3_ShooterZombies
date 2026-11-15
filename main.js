import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let camera, scene, renderer, controls, ammoBox = null, extractionZone = null, cityModel = null;
let currentWeapon = 1, isGameOver = false, isVictory = false, streetEndZ = -42.0;
let prevTime = performance.now();

const keys = { KeyW: false, KeyS: false, KeyA: false, KeyD: false };
const velocity = new THREE.Vector3(), direction = new THREE.Vector3();
const weapons = {}, ammo = { 1: 8, 2: 20 };
const zombies = [], dyingZombies = [], crateGroups = [], obstacles = [], wallMeshes = [], groundMeshes = [];
let playBounds = { minX: -25, maxX: 26, minZ: -64.2, maxZ: 14.5 };

const GOAL_COORDS = { x: 19.45, z: -0.59 };
const AMMO_COORDS = { x: 9.53, z: -31.33 };

const OBSTACLE_COORDS = [
    { x: 21.96, z: -33.52, flipY: false },
    { x: -4.20, z: -26.51, flipY: true },
    { x: 1.80, z: 8.06, flipY: false },
    { x: -3.26, z: -8.35, flipY: true },
    { x: 5.79, z: -8.75, flipY: false },
    { x: 13.97, z: -13.68, flipY: true }
];

const ZOMBIE_COORDS = [
    { x: 6.24, z: -29.99 },
    { x: -1.35, z: -21.70 },
    { x: 20.30, z: -6.28 },
    { x: 16.97, z: -17.85 }
];

const raycaster = new THREE.Raycaster();
const normalMatrix = new THREE.Matrix3();
const worldNormal = new THREE.Vector3();
const tempVec = new THREE.Vector3();

function makeCanvasTex(w, h, drawFn, rx = 1, ry = 1) {
    const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
    drawFn(canvas.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(canvas);
    if (rx > 1 || ry > 1) {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(rx, ry);
    }
    return tex;
}

function addMesh(parent, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0]) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...pos);
    mesh.rotation.set(...rot);
    parent.add(mesh);
    return mesh;
}

function createTextures() {
    const road = makeCanvasTex(256, 256, (ctx) => {
        ctx.fillStyle = '#2b2925';
        ctx.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 900; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#23211e' : '#35322d';
            ctx.fillRect(Math.random() * 256, Math.random() * 256, 4, 4);
        }
    }, 24, 40);

    const wall = makeCanvasTex(256, 256, (ctx) => {
        ctx.fillStyle = '#4a4a4a';
        ctx.fillRect(0, 0, 256, 256);
        ctx.strokeStyle = '#2b2b2b';
        ctx.lineWidth = 6;
        ctx.strokeRect(0, 0, 256, 256);
        for (let i = 0; i < 500; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#3a3a3a' : '#5a5a5a';
            ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
        }
    }, 4, 2);

    const door = makeCanvasTex(512, 512, (ctx) => {
        ctx.fillStyle = '#3a4248';
        ctx.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 600; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.06)';
            ctx.fillRect(Math.random() * 512, Math.random() * 512, 40, 2);
        }
        ctx.strokeStyle = '#23282c';
        ctx.lineWidth = 8;
        ctx.strokeRect(24, 24, 216, 410);
        ctx.strokeRect(272, 24, 216, 410);

        ctx.fillStyle = '#d4a017';
        ctx.fillRect(0, 456, 512, 56);
        ctx.fillStyle = '#181a1b';
        for (let x = -56; x < 560; x += 48) {
            ctx.beginPath();
            ctx.moveTo(x, 512);
            ctx.lineTo(x + 24, 512);
            ctx.lineTo(x + 56, 456);
            ctx.lineTo(x + 32, 456);
            ctx.fill();
        }
        ctx.fillStyle = '#14171a';
        ctx.fillRect(252, 0, 8, 512);
        ctx.fillStyle = '#68737d';
        for (let y = 36; y <= 430; y += 65) {
            [14, 240, 267, 493].forEach(x => ctx.fillRect(x, y, 5, 5));
        }
    });

    const sign = makeCanvasTex(256, 64, (ctx) => {
        ctx.fillStyle = '#240909';
        ctx.fillRect(0, 0, 256, 64);
        ctx.strokeStyle = '#ff3b3b';
        ctx.lineWidth = 6;
        ctx.strokeRect(4, 4, 248, 56);
        ctx.fillStyle = '#ff3b3b';
        ctx.font = 'bold 30px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SECTOR 01', 128, 34);
    });

    return { road, wall, door, sign };
}

function createZombieHealthBar(zombie, headY) {
    const group = new THREE.Group();
    group.position.set(0, headY, 0);

    const bgMat = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide });
    addMesh(group, new THREE.PlaneGeometry(0.84, 0.16), bgMat, [0, 0, -0.005]);

    const bar1 = addMesh(
        group,
        new THREE.PlaneGeometry(0.36, 0.10),
        new THREE.MeshBasicMaterial({ color: 0xff2a2a, side: THREE.DoubleSide }),
        [-0.20, 0, 0]
    );
    const bar2 = addMesh(
        group,
        new THREE.PlaneGeometry(0.36, 0.10),
        new THREE.MeshBasicMaterial({ color: 0xff2a2a, side: THREE.DoubleSide }),
        [0.20, 0, 0]
    );

    zombie.add(group);
    zombie.userData.healthBar = { group, bars: [bar1, bar2] };
}

function updateZombieHealthBar(zombie) {
    const hb = zombie.userData.healthBar;
    if (!hb) return;
    const hp = zombie.userData.health;
    hb.bars[0].visible = hp >= 1;
    hb.bars[1].visible = hp >= 2;
    hb.group.visible = hp > 0;
}

const getWallTargets = () => wallMeshes.length ? wallMeshes : (cityModel ? [cityModel] : []);

function getWorldNormal(hit) {
    if (!hit.face) return worldNormal.set(0, 1, 0);
    normalMatrix.getNormalMatrix(hit.object.matrixWorld);
    return worldNormal.copy(hit.face.normal).applyMatrix3(normalMatrix).normalize();
}

function getGroundHeight(x, z) {
    const targets = groundMeshes.length ? groundMeshes : (cityModel ? [cityModel] : []);
    if (!targets.length) return 0;

    raycaster.set(tempVec.set(x, 2.0, z), new THREE.Vector3(0, -1, 0));
    raycaster.far = 5;
    for (const h of raycaster.intersectObjects(targets, true)) {
        if (h.point.y <= 0.65 && h.point.y >= -0.75 && getWorldNormal(h).y > 0.55) return h.point.y;
    }
    return -0.55;
}

function checkWall(x, z, dir, maxDist, baseY, heights = [1.15, 1.65], maxNy = 0.45) {
    const targets = getWallTargets();
    if (!targets.length) return false;

    for (const h of heights) {
        raycaster.set(tempVec.set(x, baseY + h, z), dir);
        raycaster.far = maxDist;
        const hits = raycaster.intersectObjects(targets, true);
        if (hits.some(hit => hit.distance < maxDist && Math.abs(getWorldNormal(hit).y) < maxNy)) return true;
    }
    return false;
}

function getForwardWallZ(x, startZ, dirZ) {
    const targets = getWallTargets();
    let closest = null;
    for (const h of [0.85, 1.45, 2.35]) {
        raycaster.set(tempVec.set(x, h, startZ), new THREE.Vector3(0, 0, dirZ));
        raycaster.far = 110;
        for (const hit of raycaster.intersectObjects(targets, true)) {
            if (Math.abs(getWorldNormal(hit).z) > 0.45) {
                closest = closest === null ? hit.point.z : (dirZ > 0 ? Math.min(closest, hit.point.z) : Math.max(closest, hit.point.z));
                break;
            }
        }
    }
    return closest;
}

function resolveCornerOverlap(baseY) {
    const targets = getWallTargets();
    if (!targets.length) return;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        raycaster.set(tempVec.set(camera.position.x, baseY + 1.35, camera.position.z), new THREE.Vector3(dx, 0, dz));
        raycaster.far = 0.42;
        const hits = raycaster.intersectObjects(targets, true);
        if (hits.length && Math.abs(getWorldNormal(hits[0]).y) < 0.45) {
            const push = 0.44 - hits[0].distance;
            camera.position.x -= dx * push;
            camera.position.z -= dz * push;
        }
    }
}

function checkCrateCollision(x, z, r) {
    const box = new THREE.Box3(tempVec.set(x - r, -2, z - r), new THREE.Vector3(x + r, 4, z + r));
    return obstacles.some(obs => box.intersectsBox(obs));
}

function hasLineOfSight(zombie) {
    const targets = getWallTargets();
    if (!targets.length) return true;
    const origin = new THREE.Vector3(zombie.position.x, zombie.position.y + 1.3, zombie.position.z);
    const dir = tempVec.set(camera.position.x, camera.position.y - 0.2, camera.position.z).sub(origin);
    const dist = dir.length();
    if (!dist) return true;
    raycaster.set(origin, dir.normalize());
    raycaster.far = dist;
    return raycaster.intersectObjects(targets, true).length === 0;
}

function alignEntitiesToGround() {
    if (extractionZone) {
        extractionZone.position.set(GOAL_COORDS.x, getGroundHeight(GOAL_COORDS.x, GOAL_COORDS.z), GOAL_COORDS.z);
    }

    obstacles.length = 0;
    crateGroups.forEach(group => {
        const { x, z } = group.userData;
        group.position.set(x, getGroundHeight(x, z), z);
        group.updateMatrixWorld(true);
        group.traverse(c => { if (c.isMesh) obstacles.push(new THREE.Box3().setFromObject(c)); });
    });

    if (ammoBox) {
        const baseY = getGroundHeight(AMMO_COORDS.x, AMMO_COORDS.z) + 0.45;
        ammoBox.userData.baseY = baseY;
        ammoBox.position.set(AMMO_COORDS.x, baseY, AMMO_COORDS.z);
    }

    zombies.forEach(z => {
        const { x, z: posZ } = z.userData;
        z.position.set(x, getGroundHeight(x, posZ), posZ);
    });

    if (camera) camera.position.y = getGroundHeight(camera.position.x, camera.position.z) + 1.7;
}

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0d0d);
    scene.fog = new THREE.FogExp2(0x0d0d0d, 0.032);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.7, 5);

    controls = new PointerLockControls(camera, document.body);
    const blocker = document.getElementById('blocker');
    blocker.addEventListener('click', () => { if (!isGameOver && !isVictory) controls.lock(); });
    controls.addEventListener('lock', () => blocker.style.display = 'none');
    controls.addEventListener('unlock', () => { if (!isGameOver && !isVictory) blocker.style.display = 'flex'; });
    scene.add(controls.getObject());

    const handleKey = (e, down) => {
        if (isGameOver || isVictory) return;
        if (e.code in keys) keys[e.code] = down;
        if (down && (e.code === 'Digit1' || e.code === 'Digit2')) switchWeapon(Number(e.code.slice(-1)));
    };
    document.addEventListener('keydown', e => handleKey(e, true));
    document.addEventListener('keyup', e => handleKey(e, false));
    window.addEventListener('mousedown', e => {
        if (controls.isLocked && e.button === 0 && !isGameOver && !isVictory) shoot();
    });

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffee, 0.85);
    dirLight.position.set(10, 30, 10);
    scene.add(dirLight);

    const tex = createTextures();
    const floorMat = new THREE.MeshStandardMaterial({ map: tex.road, roughness: 0.95 });
    const wallMat = new THREE.MeshStandardMaterial({ map: tex.wall, roughness: 0.8 });
    addMesh(scene, new THREE.PlaneGeometry(80, 110), floorMat, [0, -0.68, -26], [-Math.PI / 2, 0, 0]);
    addMesh(scene, new THREE.BoxGeometry(3.9, 8, 2), wallMat, [-4.05, 4, 14]);
    addMesh(scene, new THREE.BoxGeometry(3.9, 8, 2), wallMat, [4.05, 4, 14]);
    addMesh(scene, new THREE.BoxGeometry(4.2, 4.2, 2), wallMat, [0, 5.9, 14]);

    const doorGroup = new THREE.Group();
    doorGroup.position.set(0, 0, 13.5);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e2226, metalness: 0.85, roughness: 0.3 });
    const doorMat = new THREE.MeshStandardMaterial({ map: tex.door, metalness: 0.8, roughness: 0.35 });
    const threshMat = new THREE.MeshStandardMaterial({ color: 0x2b3238, metalness: 0.75, roughness: 0.4 });

    addMesh(doorGroup, new THREE.BoxGeometry(0.25, 3.8, 0.6), frameMat, [-2.0, 1.9, -0.15]);
    addMesh(doorGroup, new THREE.BoxGeometry(0.25, 3.8, 0.6), frameMat, [2.0, 1.9, -0.15]);
    addMesh(doorGroup, new THREE.BoxGeometry(4.25, 0.25, 0.6), frameMat, [0, 3.7, -0.15]);
    addMesh(doorGroup, new THREE.BoxGeometry(3.85, 3.6, 0.25), doorMat, [0, 1.8, 0]);
    addMesh(doorGroup, new THREE.BoxGeometry(0.08, 0.55, 0.12), frameMat, [-0.22, 1.5, -0.16]);
    addMesh(doorGroup, new THREE.BoxGeometry(0.08, 0.55, 0.12), frameMat, [0.22, 1.5, -0.16]);
    addMesh(doorGroup, new THREE.BoxGeometry(4.1, 0.04, 1.4), threshMat, [0, 0.02, -0.9]);
    addMesh(doorGroup, new THREE.BoxGeometry(2.0, 0.45, 0.15), new THREE.MeshBasicMaterial({ map: tex.sign }), [0, 4.15, -0.55]);

    const startLight = new THREE.PointLight(0xff3b3b, 1.8, 14);
    startLight.position.set(0, 3.5, -1.4);
    doorGroup.add(startLight);
    scene.add(doorGroup);

    extractionZone = new THREE.Group();
    extractionZone.position.set(GOAL_COORDS.x, -0.39, GOAL_COORDS.z);
    addMesh(extractionZone, new THREE.CylinderGeometry(2.35, 2.5, 0.08, 40),
        new THREE.MeshStandardMaterial({ color: 0x16221a, metalness: 0.85, roughness: 0.3 }), [0, 0.04, 0]);
    addMesh(extractionZone, new THREE.CylinderGeometry(1.9, 1.9, 0.11, 40),
        new THREE.MeshStandardMaterial({ color: 0x00ff66, emissive: 0x00cc44, emissiveIntensity: 0.85, roughness: 0.25 }), [0, 0.055, 0]);
    const pulseRing = addMesh(extractionZone, new THREE.RingGeometry(2.0, 2.28, 40),
        new THREE.MeshBasicMaterial({ color: 0x55ff99, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
        [0, 0.12, 0], [-Math.PI / 2, 0, 0]);
    const exitLight = new THREE.PointLight(0x00ff66, 3.6, 20);
    exitLight.position.set(0, 1.6, 0);
    extractionZone.add(exitLight);
    extractionZone.userData = { exitLight, pulseRing };
    scene.add(extractionZone);

    const loader = new GLTFLoader();

    loader.load('city_environment.glb', ({ scene: city }) => {
        let box = new THREE.Box3().setFromObject(city);
        let size = box.getSize(new THREE.Vector3());
        if (size.x > size.z) {
            city.rotation.y = Math.PI / 2;
            city.updateMatrixWorld(true);
            box = new THREE.Box3().setFromObject(city);
            size = box.getSize(new THREE.Vector3());
        }

        city.scale.setScalar(84 / (size.z || 1));
        city.updateMatrixWorld(true);
        box = new THREE.Box3().setFromObject(city);
        const center = box.getCenter(new THREE.Vector3());
        city.position.set(city.position.x - center.x, city.position.y, city.position.z - 26 - center.z);
        city.updateMatrixWorld(true);

        raycaster.set(new THREE.Vector3(0, 50, 5), new THREE.Vector3(0, -1, 0));
        raycaster.far = 100;
        const spawnHits = raycaster.intersectObject(city, true);
        city.position.y -= spawnHits.length ? spawnHits[spawnHits.length - 1].point.y : new THREE.Box3().setFromObject(city).min.y;
        city.updateMatrixWorld(true);

        wallMeshes.length = groundMeshes.length = 0;
        city.traverse(c => {
            if (!c.isMesh || !c.visible) return;
            const mats = Array.isArray(c.material) ? c.material : [c.material];
            mats.forEach(m => { if (m) m.side = THREE.DoubleSide; });
            if (mats.length === 1 && mats[0]?.transparent && mats[0].opacity < 0.2) return;

            const mBox = new THREE.Box3().setFromObject(c);
            if (mBox.min.y > 2.2) return;
            if (mBox.max.y <= 0.75) groundMeshes.push(c);
            else {
                wallMeshes.push(c);
                if (mBox.min.y <= 0.3) groundMeshes.push(c);
            }
        });

        const finalBox = new THREE.Box3().setFromObject(city);
        const endWallZ1 = getForwardWallZ(0, 2, -1);
        streetEndZ = endWallZ1 !== null ? endWallZ1 + 0.4 : finalBox.min.z + 2.0;
        playBounds = {
            minX: Math.min(finalBox.min.x + 1.0, -25),
            maxX: Math.max(finalBox.max.x - 1.0, 26),
            minZ: streetEndZ + 0.7,
            maxZ: Math.max(14.5, finalBox.max.z - 1.0)
        };

        cityModel = city;
        scene.add(city);
        alignEntitiesToGround();
    });

    const loadWeapon = (file, id, scale, pos, visible) => loader.load(file, ({ scene: w }) => {
        w.scale.setScalar(scale);
        w.position.set(...pos);
        w.rotation.set(0, Math.PI / 2, 0);
        w.visible = visible;
        camera.add(w);
        weapons[id] = w;
        if (visible) updateHUD();
    });
    loadWeapon('arx-160_weapon.glb', 1, 0.012, [0.25, -0.3, -0.5], true);
    loadWeapon('ak47_weapon.glb', 2, 0.6141, [0.300, -0.350, 2.330], false);

    loader.load('caja_de_municion.glb', ({ scene: raw }) => {
        const box = new THREE.Box3().setFromObject(raw);
        const size = box.getSize(new THREE.Vector3());
        raw.position.sub(box.getCenter(new THREE.Vector3()));

        ammoBox = new THREE.Group();
        ammoBox.add(raw);
        ammoBox.scale.setScalar(0.85 / (Math.max(size.x, size.y, size.z) || 1));
        const light = new THREE.PointLight(0xffaa00, 1.5, 6);
        light.position.set(0, 0.6, 0);
        ammoBox.add(light);
        scene.add(ammoBox);
        alignEntitiesToGround();
    }, undefined, () => {
        ammoBox = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 0.8, 0.8),
            new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0x554400, metalness: 0.8, roughness: 0.2 })
        );
        scene.add(ammoBox);
        alignEntitiesToGround();
    });

    loader.load('crates_barrels.glb', ({ scene: src }) => {
        const sample = src.clone();
        sample.scale.setScalar(1.2);
        sample.updateMatrixWorld(true);
        const sSize = new THREE.Box3().setFromObject(sample).getSize(new THREE.Vector3());
        const rotateNarrow = sSize.x > sSize.z;

        OBSTACLE_COORDS.forEach(p => {
            const inner = src.clone();
            inner.scale.setScalar(1.2);
            inner.rotation.y = (rotateNarrow ? Math.PI / 2 : 0) + (p.flipY ? Math.PI : 0);
            inner.updateMatrixWorld(true);
            const iBox = new THREE.Box3().setFromObject(inner);
            const iCenter = iBox.getCenter(new THREE.Vector3());
            inner.position.set(inner.position.x - iCenter.x, inner.position.y - iBox.min.y, inner.position.z - iCenter.z);

            const group = new THREE.Group();
            group.add(inner);
            group.userData = { x: p.x, z: p.z };
            scene.add(group);
            crateGroups.push(group);
        });
        alignEntitiesToGround();
    });

    loader.load('zombie.glb', ({ scene: src }) => {
        const zBox = new THREE.Box3().setFromObject(src);
        const headY = (zBox.max.y - zBox.min.y) + 0.35;

        ZOMBIE_COORDS.forEach(coord => {
            const z = src.clone();
            z.userData = { health: 2, isAlive: true, x: coord.x, z: coord.z };
            createZombieHealthBar(z, headY);
            scene.add(z);
            zombies.push(z);
        });
        alignEntitiesToGround();
    });

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function shoot() {
    if (ammo[currentWeapon] <= 0) return;
    ammo[currentWeapon]--;
    updateHUD();

    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    raycaster.far = Infinity;
    const hits = raycaster.intersectObjects(zombies, true);
    if (!hits.length) return;

    const dist = hits[0].distance;
    const blockers = [...getWallTargets(), ...crateGroups];
    if (blockers.length && raycaster.intersectObjects(blockers, true).some(b => b.distance < dist)) return;

    let target = hits[0].object;
    while (target.parent && !zombies.includes(target)) target = target.parent;

    if (zombies.includes(target) && target.userData.isAlive) {
        target.userData.health--;
        updateZombieHealthBar(target);

        if (target.userData.health <= 0) {
            target.userData.isAlive = false;
            zombies.splice(zombies.indexOf(target), 1);
            dyingZombies.push({ mesh: target, progress: 0 });
        }
    }
}

function switchWeapon(id) {
    if (!weapons[id] || currentWeapon === id) return;
    Object.entries(weapons).forEach(([k, w]) => w.visible = Number(k) === id);
    currentWeapon = id;
    updateHUD();
}

function updateHUD() {
    const wEl = document.getElementById('weapon-id');
    const aEl = document.getElementById('ammo-count');
    if (wEl && aEl) {
        wEl.textContent = currentWeapon === 1 ? '1 (ARX-160)' : '2 (AK-47)';
        aEl.textContent = ammo[currentWeapon];
    }
}

function endGame(screenId) {
    if (isGameOver || isVictory) return;
    if (screenId === 'game-over') isGameOver = true;
    else isVictory = true;
    controls.unlock();
    document.getElementById('blocker').style.display = 'none';
    document.getElementById(screenId).style.display = 'flex';
}

function animate() {
    requestAnimationFrame(animate);
    if (isGameOver || isVictory) return;

    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    if (controls.isLocked) {
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        direction.set(Number(keys.KeyD) - Number(keys.KeyA), 0, Number(keys.KeyW) - Number(keys.KeyS)).normalize();
        if (direction.z) velocity.z -= direction.z * 400.0 * delta;
        if (direction.x) velocity.x -= direction.x * 400.0 * delta;

        const prevX = camera.position.x, prevZ = camera.position.z;
        const groundY = getGroundHeight(prevX, prevZ);
        resolveCornerOverlap(groundY);

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);

        const r = 0.55, dx = camera.position.x - prevX, dz = camera.position.z - prevZ;
        if (Math.abs(dx) > 0.0001 && (
            checkWall(prevX, prevZ, new THREE.Vector3(Math.sign(dx), 0, 0), r + Math.abs(dx), groundY) ||
            checkCrateCollision(camera.position.x, prevZ, r) ||
            camera.position.x < playBounds.minX || camera.position.x > playBounds.maxX
        )) camera.position.x = prevX;

        if (Math.abs(dz) > 0.0001 && (
            checkWall(camera.position.x, prevZ, new THREE.Vector3(0, 0, Math.sign(dz)), r + Math.abs(dz), groundY) ||
            checkCrateCollision(camera.position.x, camera.position.z, r) ||
            camera.position.z < playBounds.minZ || camera.position.z > playBounds.maxZ
        )) camera.position.z = prevZ;

        const targetEyeY = getGroundHeight(camera.position.x, camera.position.z) + 1.7;
        camera.position.y += (targetEyeY - camera.position.y) * Math.min(1, delta * 12);
    }

    if (extractionZone) {
        const { exitLight, pulseRing } = extractionZone.userData;
        if (exitLight) exitLight.intensity = 3.2 + Math.sin(time * 0.005) * 0.8;
        if (pulseRing) pulseRing.scale.setScalar(1.0 + Math.sin(time * 0.005) * 0.06);
        if (Math.hypot(camera.position.x - extractionZone.position.x, camera.position.z - extractionZone.position.z) <= 2.25) {
            endGame('victory-screen');
        }
    }

    if (ammoBox) {
        ammoBox.rotation.y += delta * 1.5;
        ammoBox.position.y = (ammoBox.userData.baseY || 0.45) + Math.sin(time * 0.003) * 0.08;
        if (Math.hypot(camera.position.x - ammoBox.position.x, camera.position.z - ammoBox.position.z) < 1.6) {
            ammo[1] += 12;
            ammo[2] += 25;
            updateHUD();
            scene.remove(ammoBox);
            ammoBox = null;
        }
    }

    for (const z of zombies) {
        if (!z.userData.isAlive) continue;
        if (z.userData.healthBar) z.userData.healthBar.group.lookAt(camera.position);

        const dx = z.position.x - camera.position.x, dz = z.position.z - camera.position.z;
        const dist = Math.hypot(dx, dz);

        if (dist <= 14 && hasLineOfSight(z)) {
            if (dist <= 1.3) { endGame('game-over'); break; }

            z.lookAt(camera.position.x, z.position.y, camera.position.z);
            const stepX = -(dx / dist) * 2.0 * delta;
            const stepZ = -(dz / dist) * 2.0 * delta;
            const zGround = getGroundHeight(z.position.x, z.position.z);
            const zHeights = [0.65, 1.35, 2.35];

            if (!checkWall(z.position.x, z.position.z, new THREE.Vector3(Math.sign(stepX), 0, 0), 0.55 + Math.abs(stepX), zGround, zHeights, 0.55) &&
                !checkCrateCollision(z.position.x + stepX, z.position.z, 0.55)) {
                z.position.x += stepX;
            }
            if (!checkWall(z.position.x, z.position.z, new THREE.Vector3(0, 0, Math.sign(stepZ)), 0.55 + Math.abs(stepZ), zGround, zHeights, 0.55) &&
                !checkCrateCollision(z.position.x, z.position.z + stepZ, 0.55)) {
                z.position.z += stepZ;
            }
            z.position.y = getGroundHeight(z.position.x, z.position.z);
        }
    }

    for (let i = dyingZombies.length - 1; i >= 0; i--) {
        const item = dyingZombies[i];
        item.progress += delta * 3;
        if (item.mesh.rotation.x < Math.PI / 2) item.mesh.rotation.x += delta * 4;
        item.mesh.position.y -= delta * 0.8;
        if (item.progress >= 1) dyingZombies.splice(i, 1);
    }

    prevTime = time;
    renderer.render(scene, camera);
}

init();
animate();