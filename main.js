import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let camera, scene, renderer, controls;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

// Variables de juego
let currentWeapon = 1;
let isGameOver = false;
let isVictory = false;
const weapons = {};
const ammo = {
    1: 8,
    2: 20
};
const zombies = [];
const dyingZombies = [];
const obstacles = []; // Lista de cajas de colisión (THREE.Box3)
let ammoBox = null;
let extractionZone = null;

const raycaster = new THREE.Raycaster();

init();
animate();

// ==========================================
// GENERADOR DE TEXTURAS PROCEDIMENTALES
// ==========================================
function createGridTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, 256, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(12, 36);
    return texture;
}

function createWallTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#2b2b2b';
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, 256, 256);
    // Efecto de concreto rugoso
    for (let i = 0; i < 500; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#3a3a3a' : '#5a5a5a';
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 10);
    return texture;
}

function createMetalDoorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Base de acero industrial
    ctx.fillStyle = '#3a4248';
    ctx.fillRect(0, 0, 512, 512);

    // Vetas metálicas horizontales sutiles
    for (let i = 0; i < 600; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.06)';
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 40, 2);
    }

    // Paneles embutidos en ambas hojas
    ctx.strokeStyle = '#23282c';
    ctx.lineWidth = 8;
    ctx.strokeRect(24, 24, 216, 410);
    ctx.strokeRect(272, 24, 216, 410);

    // Franja inferior de precaución (amarillo y negro)
    ctx.fillStyle = '#d4a017';
    ctx.fillRect(0, 456, 512, 56);
    ctx.fillStyle = '#181a1b';
    for (let x = -56; x < 560; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 512);
        ctx.lineTo(x + 24, 512);
        ctx.lineTo(x + 56, 456);
        ctx.lineTo(x + 32, 456);
        ctx.closePath();
        ctx.fill();
    }

    // Línea divisoria central de doble hoja
    ctx.fillStyle = '#14171a';
    ctx.fillRect(252, 0, 8, 512);

    // Remaches metálicos
    ctx.fillStyle = '#68737d';
    for (let y = 36; y <= 430; y += 65) {
        ctx.fillRect(14, y, 5, 5);
        ctx.fillRect(240, y, 5, 5);
        ctx.fillRect(267, y, 5, 5);
        ctx.fillRect(493, y, 5, 5);
    }

    return new THREE.CanvasTexture(canvas);
}

function createSignTexture(text, bgColor, accentColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 256, 64);

    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 248, 56);

    ctx.fillStyle = accentColor;
    ctx.font = 'bold 30px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 34);

    return new THREE.CanvasTexture(canvas);
}

function init() {
    // 1. Escena y Cámara
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0d0d);
    scene.fog = new THREE.FogExp2(0x0d0d0d, 0.04);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 5);

    // 2. Controles de Primera Persona
    controls = new PointerLockControls(camera, document.body);

    const blocker = document.getElementById('blocker');
    blocker.addEventListener('click', () => {
        if (!isGameOver && !isVictory) controls.lock();
    });

    controls.addEventListener('lock', () => {
        blocker.style.display = 'none';
    });

    controls.addEventListener('unlock', () => {
        if (!isGameOver && !isVictory) blocker.style.display = 'flex';
    });

    scene.add(controls.getObject());

    // 3. Listeners de Teclado y Mouse
    const onKeyDown = (event) => {
        if (isGameOver || isVictory) return;
        switch (event.code) {
            case 'KeyW': moveForward = true; break;
            case 'KeyS': moveBackward = true; break;
            case 'KeyA': moveLeft = true; break;
            case 'KeyD': moveRight = true; break;
            case 'Digit1': switchWeapon(1); break;
            case 'Digit2': switchWeapon(2); break;
        }
    };

    const onKeyUp = (event) => {
        if (isGameOver || isVictory) return;
        switch (event.code) {
            case 'KeyW': moveForward = false; break;
            case 'KeyS': moveBackward = false; break;
            case 'KeyA': moveLeft = false; break;
            case 'KeyD': moveRight = false; break;
        }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    window.addEventListener('mousedown', (event) => {
        if (controls.isLocked && event.button === 0 && !isGameOver && !isVictory) {
            shoot();
        }
    });

    // 4. Iluminación profesional
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffee, 0.8);
    directionalLight.position.set(10, 30, 10);
    scene.add(directionalLight);

    // 5. Escenario Base Cerrado (RF03)
    const floorMaterial = new THREE.MeshStandardMaterial({
        map: createGridTexture(),
        roughness: 0.6
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 84), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -26); // Cubre desde z = +16 hasta z = -68
    scene.add(floor);

    const wallMaterial = new THREE.MeshStandardMaterial({
        map: createWallTexture(),
        roughness: 0.8
    });

    // Muros laterales del corredor (de z = +15 a z = -67)
    const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(2, 6, 82), wallMaterial);
    wallLeft.position.set(-10, 3, -26);
    scene.add(wallLeft);

    const wallRight = new THREE.Mesh(new THREE.BoxGeometry(2, 6, 82), wallMaterial);
    wallRight.position.set(10, 3, -26);
    scene.add(wallRight);

    // Muro frontal (cierre inicial detrás del jugador en z = +14 con vano central)
    const wallFrontLeft = new THREE.Mesh(new THREE.BoxGeometry(7.9, 6, 2), wallMaterial);
    wallFrontLeft.position.set(-6.05, 3, 14);
    scene.add(wallFrontLeft);

    const wallFrontRight = new THREE.Mesh(new THREE.BoxGeometry(7.9, 6, 2), wallMaterial);
    wallFrontRight.position.set(6.05, 3, 14);
    scene.add(wallFrontRight);

    const wallFrontTop = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 2), wallMaterial);
    wallFrontTop.position.set(0, 4.9, 14);
    scene.add(wallFrontTop);

    // Muro trasero (cierre final en z = -66 con vano central para la salida)
    const wallBackLeft = new THREE.Mesh(new THREE.BoxGeometry(7.9, 6, 2), wallMaterial);
    wallBackLeft.position.set(-6.05, 3, -66);
    scene.add(wallBackLeft);

    const wallBackRight = new THREE.Mesh(new THREE.BoxGeometry(7.9, 6, 2), wallMaterial);
    wallBackRight.position.set(6.05, 3, -66);
    scene.add(wallBackRight);

    const wallBackTop = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 2), wallMaterial);
    wallBackTop.position.set(0, 4.9, -66);
    scene.add(wallBackTop);

    // Materiales compartidos para ambas puertas industriales
    const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0x1e2226,
        metalness: 0.85,
        roughness: 0.3
    });
    const doorMaterial = new THREE.MeshStandardMaterial({
        map: createMetalDoorTexture(),
        metalness: 0.8,
        roughness: 0.35
    });
    const thresholdMaterial = new THREE.MeshStandardMaterial({
        color: 0x2b3238,
        metalness: 0.75,
        roughness: 0.4
    });

    // ==========================================
    // PUERTA METÁLICA INICIAL (Cierre de Inicio)
    // ==========================================
    const startDoorGroup = new THREE.Group();
    startDoorGroup.position.set(0, 0, 13.5);

    const startLeftJamb = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.8, 0.6), frameMaterial);
    startLeftJamb.position.set(-2.0, 1.9, -0.15);
    startDoorGroup.add(startLeftJamb);

    const startRightJamb = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.8, 0.6), frameMaterial);
    startRightJamb.position.set(2.0, 1.9, -0.15);
    startDoorGroup.add(startRightJamb);

    const startTopLintel = new THREE.Mesh(new THREE.BoxGeometry(4.25, 0.25, 0.6), frameMaterial);
    startTopLintel.position.set(0, 3.7, -0.15);
    startDoorGroup.add(startTopLintel);

    const startMetalDoor = new THREE.Mesh(new THREE.BoxGeometry(3.85, 3.6, 0.25), doorMaterial);
    startMetalDoor.position.set(0, 1.8, 0);
    startDoorGroup.add(startMetalDoor);

    const startHandleLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.12), frameMaterial);
    startHandleLeft.position.set(-0.22, 1.5, -0.16);
    startDoorGroup.add(startHandleLeft);

    const startHandleRight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.12), frameMaterial);
    startHandleRight.position.set(0.22, 1.5, -0.16);
    startDoorGroup.add(startHandleRight);

    const startThreshold = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.04, 1.4), thresholdMaterial);
    startThreshold.position.set(0, 0.02, -0.9);
    startDoorGroup.add(startThreshold);

    const lockedSign = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 0.45, 0.15),
        new THREE.MeshBasicMaterial({ map: createSignTexture('SECTOR 01', '#240909', '#ff3b3b') })
    );
    lockedSign.position.set(0, 4.15, -0.55);
    startDoorGroup.add(lockedSign);

    const startLight = new THREE.PointLight(0xff3b3b, 1.8, 14);
    startLight.position.set(0, 3.5, -1.4);
    startDoorGroup.add(startLight);

    scene.add(startDoorGroup);

    // ==========================================
    // PUERTA METÁLICA DE EXTRACCIÓN (RF08)
    // ==========================================
    extractionZone = new THREE.Group();
    extractionZone.position.set(0, 0, -65.5);

    const leftJamb = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.8, 0.6), frameMaterial);
    leftJamb.position.set(-2.0, 1.9, 0.15);
    extractionZone.add(leftJamb);

    const rightJamb = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.8, 0.6), frameMaterial);
    rightJamb.position.set(2.0, 1.9, 0.15);
    extractionZone.add(rightJamb);

    const topLintel = new THREE.Mesh(new THREE.BoxGeometry(4.25, 0.25, 0.6), frameMaterial);
    topLintel.position.set(0, 3.7, 0.15);
    extractionZone.add(topLintel);

    const metalDoor = new THREE.Mesh(new THREE.BoxGeometry(3.85, 3.6, 0.25), doorMaterial);
    metalDoor.position.set(0, 1.8, 0);
    extractionZone.add(metalDoor);

    const handleLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.12), frameMaterial);
    handleLeft.position.set(-0.22, 1.5, 0.16);
    extractionZone.add(handleLeft);

    const handleRight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.12), frameMaterial);
    handleRight.position.set(0.22, 1.5, 0.16);
    extractionZone.add(handleRight);

    const thresholdPlate = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.04, 1.4), thresholdMaterial);
    thresholdPlate.position.set(0, 0.02, 0.9);
    extractionZone.add(thresholdPlate);

    const exitSign = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.45, 0.15),
        new THREE.MeshBasicMaterial({ map: createSignTexture('SALIDA', '#071f10', '#00ff66') })
    );
    exitSign.position.set(0, 4.15, 0.55);
    extractionZone.add(exitSign);

    const exitLight = new THREE.PointLight(0x00ff66, 2.8, 18);
    exitLight.position.set(0, 3.5, 1.4);
    extractionZone.add(exitLight);

    extractionZone.userData = { exitLight };
    scene.add(extractionZone);

    // ==========================================
    // 6. CARGA DE MODELOS GLB (Armas, Munición, Obstáculos y Zombis)
    // ==========================================
    const gltfLoader = new GLTFLoader();

    // Arma 1: ARX-160
    gltfLoader.load('arx-160_weapon.glb', (gltf) => {
        const weapon1 = gltf.scene;
        weapon1.scale.set(0.012, 0.012, 0.012);
        weapon1.position.set(0.25, -0.3, -0.5);
        weapon1.rotation.set(0, Math.PI / 2, 0);

        camera.add(weapon1);
        weapons[1] = weapon1;
        updateHUD();
    });

    // Arma 2: AK-47 (Conserva tus valores calibrados de scale y position si ya los ajustaste)
    gltfLoader.load('ak47_weapon.glb', (gltf) => {
        const weapon2 = gltf.scene;
        weapon2.scale.set(0.6141, 0.6141, 0.6141);
        weapon2.position.set(0.300, -0.350, 2.330);
        weapon2.rotation.set(0, Math.PI / 2, 0);

        camera.add(weapon2);
        weapon2.visible = false;
        weapons[2] = weapon2;
    });

    // Objeto Coleccionable: Caja de Munición (`caja_de_municion.glb`) (RF02, RF10)
    gltfLoader.load('caja_de_municion.glb', (gltf) => {
        const rawAmmo = gltf.scene;

        // Medir solo las mallas visibles para normalizar su tamaño a ~0.85 m
        const box = new THREE.Box3();
        rawAmmo.traverse((child) => {
            if (child.isMesh) {
                box.expandByObject(child);
            }
        });

        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const targetScale = 0.85 / maxDim;

        // Centrar el modelo en su propio origen para que rote limpio sobre su eje
        rawAmmo.position.sub(center);

        ammoBox = new THREE.Group();
        ammoBox.add(rawAmmo);
        ammoBox.scale.setScalar(targetScale);
        ammoBox.position.set(-4, 0.45, -30);

        // Destello ámbar sutil para que destaque entre la niebla
        const ammoLight = new THREE.PointLight(0xffaa00, 1.5, 6);
        ammoLight.position.set(0, 0.6, 0);
        ammoBox.add(ammoLight);

        scene.add(ammoBox);
    }, undefined, (error) => {
        console.warn("No se pudo cargar caja_de_municion.glb, usando cubo de respaldo:", error);
        const fallbackGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
        const fallbackMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0x554400, metalness: 0.8, roughness: 0.2 });
        ammoBox = new THREE.Mesh(fallbackGeo, fallbackMat);
        ammoBox.position.set(-4, 0.4, -30);
        scene.add(ammoBox);
    });

    // Obstáculos 3D: Cajas y Barriles (`crates_barrels.glb`) con colisión por malla (RF03, RF11)
    gltfLoader.load('crates_barrels.glb', (gltf) => {
        const obstaclePositions = [
            { x: -4, z: -15, rotY: 0 },
            { x: 4, z: -25, rotY: Math.PI / 2 },
            { x: -3, z: -38, rotY: Math.PI },
            { x: 3, z: -48, rotY: -Math.PI / 2 }
        ];

        const crateScale = 1.2;

        obstaclePositions.forEach(pos => {
            const obstacleInstance = gltf.scene.clone();
            obstacleInstance.scale.set(crateScale, crateScale, crateScale);
            obstacleInstance.rotation.y = pos.rotY;
            obstacleInstance.position.set(pos.x, 0, pos.z);
            obstacleInstance.updateMatrixWorld(true);

            // Nivelar exactamente sobre el suelo (y = 0)
            const groupBox = new THREE.Box3().setFromObject(obstacleInstance);
            obstacleInstance.position.y = -groupBox.min.y;
            obstacleInstance.updateMatrixWorld(true);

            scene.add(obstacleInstance);

            // Generar una caja de colisión ajustada por cada barril o caja del modelo
            obstacleInstance.traverse((child) => {
                if (child.isMesh) {
                    obstacles.push(new THREE.Box3().setFromObject(child));
                }
            });
        });
    }, undefined, (error) => {
        console.warn("No se pudo cargar crates_barrels.glb:", error);
    });

    // Zombis distribuidos (RF04, RF05)
    gltfLoader.load('zombie.glb', (gltf) => {
        const zombieCoords = [
            { x: 0, z: -12 },
            { x: -5, z: -22 },
            { x: 5, z: -35 },
            { x: -2, z: -50 }
        ];

        zombieCoords.forEach(coord => {
            const zombieInstance = gltf.scene.clone();
            zombieInstance.scale.set(1, 1, 1);
            zombieInstance.position.set(coord.x, 0, coord.z);
            zombieInstance.userData = { health: 2, isAlive: true };

            scene.add(zombieInstance);
            zombies.push(zombieInstance);
        });
    });

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    window.addEventListener('resize', onWindowResize);
}

// ==========================================
// SISTEMA DE DISPARO Y COLISIONES DE RAYCAST (RF07)
// ==========================================
function shoot() {
    if (ammo[currentWeapon] <= 0) return;

    ammo[currentWeapon]--;
    updateHUD();

    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(zombies, true);

    if (intersects.length > 0) {
        let hitObject = intersects[0].object;
        while (hitObject.parent && !zombies.includes(hitObject)) {
            hitObject = hitObject.parent;
        }

        if (zombies.includes(hitObject) && hitObject.userData.isAlive) {
            hitObject.userData.health--;

            if (hitObject.userData.health <= 0) {
                hitObject.userData.isAlive = false;
                const index = zombies.indexOf(hitObject);
                if (index > -1) zombies.splice(index, 1);

                dyingZombies.push({
                    mesh: hitObject,
                    progress: 0
                });
            }
        }
    }
}

function switchWeapon(id) {
    if (weapons[id] && currentWeapon !== id) {
        Object.keys(weapons).forEach(key => {
            weapons[key].visible = (Number(key) === id);
        });
        currentWeapon = id;
        updateHUD();
    }
}

function updateHUD() {
    const weaponEl = document.getElementById('weapon-id');
    const ammoEl = document.getElementById('ammo-count');
    if (weaponEl && ammoEl) {
        weaponEl.textContent = currentWeapon === 1 ? '1 (ARX-160)' : '2 (AK-47)';
        ammoEl.textContent = ammo[currentWeapon];
    }
}

function triggerGameOver() {
    if (isGameOver || isVictory) return;
    isGameOver = true;
    controls.unlock();
    document.getElementById('blocker').style.display = 'none';
    document.getElementById('game-over').style.display = 'flex';
}

function triggerVictory() {
    if (isGameOver || isVictory) return;
    isVictory = true;
    controls.unlock();
    document.getElementById('blocker').style.display = 'none';
    document.getElementById('victory-screen').style.display = 'flex';
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Bucle principal con Gestión de Colisiones del Entorno
function animate() {
    requestAnimationFrame(animate);

    if (isGameOver || isVictory) return;

    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    if (controls.isLocked === true) {
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        if (moveForward || moveBackward) velocity.z -= direction.z * 400.0 * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * 400.0 * delta;

        // Guardar posición anterior para colisiones
        const prevPosX = camera.position.x;
        const prevPosZ = camera.position.z;

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);

        // ==========================================
        // SISTEMA DE COLISIONES JUGADOR VS ENTORNO
        // ==========================================
        const playerRadius = 0.5;

        // 1. Colisión con Muros Laterales, Puerta Inicial y Puerta de Salida
        if (camera.position.x < -8.5 || camera.position.x > 8.5) {
            camera.position.x = prevPosX;
        }
        if (camera.position.z < -64.2 || camera.position.z > 12.0) {
            camera.position.z = prevPosZ;
        }

        // 2. Colisión con Obstáculos 3D (Cajas y Barriles)
        const playerBox = new THREE.Box3(
            new THREE.Vector3(camera.position.x - playerRadius, 0, camera.position.z - playerRadius),
            new THREE.Vector3(camera.position.x + playerRadius, 3, camera.position.z + playerRadius)
        );

        for (let i = 0; i < obstacles.length; i++) {
            if (playerBox.intersectsBox(obstacles[i])) {
                camera.position.x = prevPosX;
                camera.position.z = prevPosZ;
                break;
            }
        }
    }

    // Comprobar llegada a la Puerta Metálica de Extracción (RF08)
    if (extractionZone) {
        const { exitLight } = extractionZone.userData;
        if (exitLight) {
            exitLight.intensity = 2.4 + Math.sin(time * 0.005) * 0.6;
        }

        // Activar victoria al pisar el umbral frente a la puerta de salida
        if (camera.position.z <= -63.2 && Math.abs(camera.position.x) <= 2.3) {
            triggerVictory();
        }
    }

    // Recolección de Munición (RF02, RF10)
    if (ammoBox) {
        ammoBox.rotation.y += delta * 1.5;
        ammoBox.position.y = 0.45 + Math.sin(time * 0.003) * 0.08;

        if (camera.position.distanceTo(ammoBox.position) < 1.6) {
            ammo[1] += 12;
            ammo[2] += 25;
            updateHUD();
            scene.remove(ammoBox);
            ammoBox = null;
        }
    }

    // IA, Persecución y Colisión con Zombis (RF05, RF09)
    const detectionRange = 14;
    const zombieSpeed = 2.0;
    const attackRange = 1.3;

    for (let i = 0; i < zombies.length; i++) {
        const zombie = zombies[i];
        if (zombie.userData.isAlive) {
            const dx = zombie.position.x - camera.position.x;
            const dz = zombie.position.z - camera.position.z;
            const distanceToPlayer = Math.sqrt(dx * dx + dz * dz);

            if (distanceToPlayer <= attackRange) {
                triggerGameOver();
                break;
            }

            if (distanceToPlayer <= detectionRange) {
                zombie.lookAt(camera.position.x, zombie.position.y, camera.position.z);
                const dir = new THREE.Vector3(dx, 0, dz).normalize();
                zombie.position.x -= dir.x * zombieSpeed * delta;
                zombie.position.z -= dir.z * zombieSpeed * delta;
            }
        }
    }

    // Animación de caída de zombis abatidos
    for (let i = dyingZombies.length - 1; i >= 0; i--) {
        const item = dyingZombies[i];
        item.progress += delta * 3;

        if (item.mesh.rotation.x < Math.PI / 2) {
            item.mesh.rotation.x += delta * 4;
        }
        if (item.mesh.position.y > -0.5) {
            item.mesh.position.y -= delta * 2;
        }

        if (item.progress >= 1) {
            dyingZombies.splice(i, 1);
        }
    }

    prevTime = time;
    renderer.render(scene, camera);
}