import './style.css';
import * as THREE from "three";
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

//iMPORTACIÓN CORRECTA

// Variables globales para el control de audio y botones AR
let isMuted = false;
const arVideos = []; // Aquí se guardarán los elementos de video de cada ARVideoEffect
const moreInfoURL = "https://example.com"; // Reemplaza con la URL deseada

/* ===================================================== */
/*         CLASE PARA FILTRAR Y SUAVIZAR LA POSE         */
/* ===================================================== */

class PoseFilter {
  constructor() {
    this.filteredMatrix = new THREE.Matrix4();
    this.initialized = false;

    // Parámetros de control
    this.baseAlpha = 0.25;      // Factor base de interpolación
    this.minAlpha = 0.05;       // Mínimo factor de interpolación (cuando el cambio es muy grande)
    this.maxAlpha = 0.35;       // Máximo factor de interpolación (cuando el cambio es pequeño)
    this.factor = 0.25;         // Escala para el error combinado
  }

  update(newMatrix) {
    if (!this.initialized) {
      // La primera vez, copiamos la matriz sin filtrar
      this.filteredMatrix.copy(newMatrix);
      this.initialized = true;
    } else {
      // Descomponemos la pose filtrada y la nueva
      const currentPos = new THREE.Vector3(),
        currentQuat = new THREE.Quaternion(),
        currentScale = new THREE.Vector3();
      this.filteredMatrix.decompose(currentPos, currentQuat, currentScale);

      const newPos = new THREE.Vector3(),
        newQuat = new THREE.Quaternion(),
        newScale = new THREE.Vector3();
      newMatrix.decompose(newPos, newQuat, newScale);

      // Calculamos un error combinado de traslación y rotación
      const distance = currentPos.distanceTo(newPos);      // Diferencia de posición
      const angle = currentQuat.angleTo(newQuat);         // Diferencia de rotación
      const combinedError = distance + angle;

      // Ajustamos alpha dinámicamente en función del error
      let adaptiveAlpha = this.baseAlpha + this.factor * combinedError;
      adaptiveAlpha = THREE.MathUtils.clamp(adaptiveAlpha, this.minAlpha, this.maxAlpha);

      // Interpolamos posición y rotación
      currentPos.lerp(newPos, adaptiveAlpha);
      currentQuat.slerp(newQuat, adaptiveAlpha);
      currentScale.lerp(newScale, adaptiveAlpha);

      this.filteredMatrix.compose(currentPos, currentQuat, currentScale);
    }
    return this.filteredMatrix;
  }
}

/* ===================================================== */
/*          CLASES BASE Y EFECTOS PARA TARGETS           */
/* ===================================================== */

class ARImageEffect {
  constructor() {
    this.container = new THREE.Object3D();
    this.container.matrixAutoUpdate = false;
    this.container.visible = false;
    this.poseFilter = new PoseFilter();
  }

  update(targetMatrixArray, trackingState) {
    // Método abstracto, sobrescribir en subclases si se necesita.
  }

  setVisibility(visible) {
    this.container.visible = visible;
  }
}

/**
 * Efecto con malla 3D genérica (Mesh).
 */
class ARMeshEffect extends ARImageEffect {
  constructor(mesh, offsetPosition = new THREE.Vector3(0, 0, 0),
    offsetRotation = new THREE.Euler(0, 0, 0),
    offsetScale = new THREE.Vector3(1, 1, 1)) {
    super();
    this.mesh = mesh;
    this.mesh.position.copy(offsetPosition);
    this.mesh.rotation.copy(offsetRotation);
    this.mesh.scale.copy(offsetScale);

    this.container.add(this.mesh);
  }

  update(targetMatrixArray, trackingState) {
    if (trackingState === "tracked") {
      const newMatrix = new THREE.Matrix4().fromArray(targetMatrixArray);
      this.container.matrix.copy(this.poseFilter.update(newMatrix));
    }
    this.setVisibility(true);
  }
}

/**
 * Efecto con reproducción de video (sobre un PlaneGeometry).
 */
class ARVideoEffect extends ARImageEffect {
  constructor(videoSrc, width, height,
    offsetPosition = new THREE.Vector3(0, 0, 0),
    offsetRotation = new THREE.Euler(0, 0, 0),
    offsetScale = new THREE.Vector3(1, 1, 1)) {
    super();

    // Dentro de la clase ARVideoEffect, en el constructor
    this.video = document.createElement('video');
    this.video.crossOrigin = 'anonymous'; // Permite la carga cross-origin
    this.video.src = videoSrc;
    this.video.loop = true;
    this.video.muted = false; // Inicialmente con audio
    this.video.playsInline = true;

    // Agregamos el video al arreglo global para control de mute
    arVideos.push(this.video);

    // Texture y malla
    this.texture = new THREE.VideoTexture(this.video);
    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      side: THREE.DoubleSide,
      transparent: true
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(offsetPosition);
    this.mesh.rotation.copy(offsetRotation);
    this.mesh.scale.copy(offsetScale);

    this.container.add(this.mesh);
  }

  update(targetMatrixArray, trackingState) {
    if (trackingState === "tracked") {
      const newMatrix = new THREE.Matrix4().fromArray(targetMatrixArray);
      this.container.matrix.copy(this.poseFilter.update(newMatrix));

      // Inicia la reproducción si está pausado.
      if (this.video.paused) {
        this.video.play().catch((error) => {
          console.error('Error al reproducir el video:', error);
        });
      }
    }
    this.setVisibility(true);
  }
}

/**
 * Efecto de partículas.
 */
class ARParticleEffect extends ARImageEffect {
  constructor(textureURL, count = 50,
    areaWidth = 0.5, areaHeight = 0.5, areaDepth = 0.5,
    offsetPosition = new THREE.Vector3(0, 0, 0),
    offsetRotation = new THREE.Euler(0, 0, 0),
    offsetScale = new THREE.Vector3(1, 1, 1),
    particleSize = 0.05) {
    super();

    const loader = new THREE.TextureLoader();
    const texture = loader.load(textureURL);

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);

    // Distribuimos las partículas de forma aleatoria en un área
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = (areaWidth / 2) * (0.9 + Math.random() * 0.2);
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const y = (Math.random() - 0.5) * areaHeight;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      size: particleSize,
      map: texture,
      transparent: true,
      depthTest: false
    });

    this.mesh = new THREE.Points(geometry, material);
    this.mesh.position.copy(offsetPosition);
    this.mesh.rotation.copy(offsetRotation);
    this.mesh.scale.copy(offsetScale);

    this.container.add(this.mesh);
  }

  update(targetMatrixArray, trackingState) {
    if (trackingState === "tracked") {
      const newMatrix = new THREE.Matrix4().fromArray(targetMatrixArray);
      this.container.matrix.copy(this.poseFilter.update(newMatrix));
    }
    this.setVisibility(true);
  }
}

/**
 * Efecto para cargar modelos glTF.
 */
// Declarar un reloj global para obtener el delta de tiempo
const clock = new THREE.Clock();

class ARGLTFEffect extends ARImageEffect {
  constructor(modelUrl,
    offsetPosition = new THREE.Vector3(0, 0, 0),
    offsetRotation = new THREE.Euler(0, 0, 0),
    offsetScale = new THREE.Vector3(1, 1, 1)) {
    super();

    this.loader = new GLTFLoader();
    this.loaded = false;
    this.modelUrl = modelUrl;

    // Contenedor temporal
    this.modelContainer = new THREE.Object3D();
    this.modelContainer.position.copy(offsetPosition);
    this.modelContainer.rotation.copy(offsetRotation);
    this.modelContainer.scale.copy(offsetScale);
    this.container.add(this.modelContainer);

    // Carga asíncrona del modelo glb
    this.loader.load(
      this.modelUrl,
      (gltf) => {
        this.modelContainer.add(gltf.scene);
        this.loaded = true;

        // Si el modelo glb tiene animaciones, crea el mixer y reproduce cada clip
        if (gltf.animations && gltf.animations.length > 0) {
          this.mixer = new THREE.AnimationMixer(gltf.scene);
          gltf.animations.forEach((clip) => {
            const action = this.mixer.clipAction(clip);
            action.play();
          });
        }
      },
      undefined,
      (error) => console.error('Error cargando modelo GLB:', error)
    );
  }

  update(targetMatrixArray, trackingState) {
    if (!this.loaded) return;

    if (trackingState === "tracked") {
      const newMatrix = new THREE.Matrix4().fromArray(targetMatrixArray);
      this.container.matrix.copy(this.poseFilter.update(newMatrix));
    }
    this.setVisibility(true);

    // Actualizar el mixer (si existe) con el delta de tiempo
    if (this.mixer) {
      this.mixer.update(clock.getDelta());
    }
  }
}

/* ===================================================== */
/*               CLASE BASE PARA LOS IMAGE TARGETS       */
/* ===================================================== */

class ARImageTarget {
  constructor(index, effects = []) {
    this.index = index;
    this.effects = effects;
  }

  update(targetMatrixArray, trackingState) {
    for (const effect of this.effects) {
      effect.update(targetMatrixArray, trackingState);
    }
  }

  hide() {
    for (const effect of this.effects) {
      effect.setVisibility(false);
    }
  }
}

/* ===================================================== */
/*   CLASE PARA LA CARGA PEREZOSA DE EFECTOS (LazyLoad)  */
/* ===================================================== */

class LazyARImageTarget extends ARImageTarget {
  constructor(index, config) {
    super(index, []);
    this.config = config;
    this.loaded = false;
  }

  async loadEffects() {
    const effects = [];

    // Efecto de video
    if (this.config.video) {
      const v = this.config.video;
      const videoEffect = new ARVideoEffect(
        v.src, v.width, v.height,
        v.offset, v.rotation, v.scale
      );
      scene.add(videoEffect.container);
      effects.push(videoEffect);
    }

    // Efecto de partículas
    if (this.config.particles) {
      const p = this.config.particles;
      const particleEffect = new ARParticleEffect(
        p.texture, p.count,
        p.areaWidth, p.areaHeight, p.areaDepth,
        p.offset, p.rotation, p.scale,
        p.particleSize
      );
      scene.add(particleEffect.container);
      effects.push(particleEffect);
    }

    // Efecto de modelo GLTF
    if (this.config.gltf) {
      const g = this.config.gltf;
      const gltfEffect = new ARGLTFEffect(
        g.url, g.offset, g.rotation, g.scale
      );
      scene.add(gltfEffect.container);
      effects.push(gltfEffect);
    }

    // Efecto de malla (mesh) - ejemplo: esfera, caja, etc.
    if (this.config.mesh) {
      const m = this.config.mesh;
      let mesh;
      if (m.type === 'sphere') {
        const geometry = new THREE.SphereGeometry(...m.parameters);
        const material = new THREE.MeshNormalMaterial({
          transparent: true,
          opacity: 1.0,
          side: THREE.DoubleSide
        });
        mesh = new THREE.Mesh(geometry, material);
      }
      // Se podrían añadir más tipos de geometría aquí...
      if (mesh) {
        const meshEffect = new ARMeshEffect(
          mesh, m.offset, m.rotation, m.scale
        );
        scene.add(meshEffect.container);
        effects.push(meshEffect);
      }
    }

    this.effects = effects;
    this.loaded = true;
  }

  async update(targetMatrixArray, trackingState) {
    if (!this.loaded && trackingState === "tracked") {
      // Carga de efectos perezosa: solo la primera vez que se detecta
      await this.loadEffects();
    }
    super.update(targetMatrixArray, trackingState);
  }
}

/* ===================================================== */
/*                 FUNCIONES AUXILIARES                */
/* ===================================================== */

function waitForImageLoad(img) {
  return new Promise((resolve, reject) => {
    if (img.complete && img.naturalWidth > 0) {
      resolve();
    } else {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Error al cargar la imagen: ' + img.src));
    }
  });
}

/* ===================================================== */
/*             VARIABLES Y CONFIGURACIÓN               */
/* ===================================================== */

let camera, scene, renderer;
let trackedTargets = [];

// Config de ejemplo: se pueden añadir más targets para escalar la solución
const targetsConfig = {
  0: {
    video: {
      src: 'https://res.cloudinary.com/dtsznnsde/video/upload/v1739136258/Snaptik.app_7461430571718184197_i4h56y.mp4',
      width: 0.2,
      height: 0.3,
      offset: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(-Math.PI / 2, 0, 0),
      scale: new THREE.Vector3(1, 1, 1)
    },
    particles: {
      texture: 'https://res.cloudinary.com/dtsznnsde/image/upload/v1739140342/heart_oahkuv.png',
      count: 100,
      areaWidth: 0.65,
      areaHeight: 0.65,
      areaDepth: 0.65,
      offset: new THREE.Vector3(0, 0.1, 0),
      rotation: new THREE.Euler(0, 0, 0),
      scale: new THREE.Vector3(1, 1, 1),
      particleSize: 0.06
    },
    gltf: {
      url: 'https://res.cloudinary.com/dtsznnsde/image/upload/v1739135786/faro_zhfex1.glb',
      offset: new THREE.Vector3(0, -0.05, 1.3),
      rotation: new THREE.Euler(THREE.MathUtils.degToRad(-90), 0, 0),
      scale: new THREE.Vector3(0.02, 0.02, 0.02)
    }
  },
  1: {
    video: {
      src: 'https://res.cloudinary.com/dtsznnsde/video/upload/v1739139635/Snaptik.app_7462065195779771654_uuh4zt.mp4',
      width: 0.2,
      height: 0.3,
      offset: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(-Math.PI / 2, 0, 0),
      scale: new THREE.Vector3(1, 1, 1)
    },
    particles: {
      texture: 'https://res.cloudinary.com/dtsznnsde/image/upload/v1739140342/heart_oahkuv.png',
      count: 100,
      areaWidth: 0.65,
      areaHeight: 0.65,
      areaDepth: 0.65,
      offset: new THREE.Vector3(0, 0.1, 0),
      rotation: new THREE.Euler(0, 0, 0),
      scale: new THREE.Vector3(1, 1, 1),
      particleSize: 0.06
    }
  }
};

/* ===================================================== */
/*                     INIT()                          */
/* ===================================================== */

init();

async function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.01,
    20
  );

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.xr.enabled = true;
  renderer.setAnimationLoop(render);

  const container = document.querySelector("#scene-container");
  container.appendChild(renderer.domElement);

  // Luz ambiental simple
  const ambient = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  ambient.position.set(0.5, 1, 0.25);
  scene.add(ambient);

/* ===================================================== */
/*         CLASE PARA AÑADIR NUEVAS IMG LA POSE          */
/* ===================================================== */
  // Cargamos las imágenes de los marcadores como ImageBitmap
  const imgMarkerHiro = document.getElementById("imgMarkerHiro");
  await waitForImageLoad(imgMarkerHiro);
  const imgMarkerHiroBitmap = await createImageBitmap(imgMarkerHiro);

  const imgNFTEarth = document.getElementById("imgNFTEarth");
  await waitForImageLoad(imgNFTEarth);
  const imgNFTEarthBitmap = await createImageBitmap(imgNFTEarth);

  // Creamos el botón de AR con la configuración de tracking de imágenes
  const button = ARButton.createButton(renderer, {
    requiredFeatures: ["image-tracking"],
    trackedImages: [
      { image: imgMarkerHiroBitmap, widthInMeters: 0.2 },
      { image: imgNFTEarthBitmap, widthInMeters: 0.2 }
    ],
    optionalFeatures: ["dom-overlay", "light-estimation", "hit-test"],
    domOverlay: { root: document.body }
  });
  document.body.appendChild(button);

  // =====================================================
  // AGREGAMOS BOTONES PARA MODO AR (solo se muestran en sesión AR)
  // =====================================================

  // Contenedor para los controles AR (posición absoluta en la pantalla)
  const arControlsContainer = document.createElement('div');
  arControlsContainer.id = 'ar-controls-container';
  arControlsContainer.style.position = 'absolute';
  arControlsContainer.style.bottom = '20px'; // Puedes cambiar a 'top: 20px' si quieres que estén arriba
  arControlsContainer.style.left = '20px'; // Mueve los botones al lado izquierdo
  arControlsContainer.style.transform = 'none';
  arControlsContainer.style.display = 'none'; // Se mostrará solo en modo AR
  document.body.appendChild(arControlsContainer);

  // Botón para silenciar/reproducir audio con ícono
  const muteButton = document.createElement('button');
  muteButton.id = 'muteButton';
  muteButton.innerHTML = `<i class="fas fa-volume-up"></i>`; // Ícono de mute
  arControlsContainer.appendChild(muteButton);

  // Botón para redirigir a "más información" con ícono
  const moreInfoButton = document.createElement('button');
  moreInfoButton.id = 'moreInfoButton';
  moreInfoButton.innerHTML = `<i class="fas fa-info-circle"></i>`; // Ícono de info
  arControlsContainer.appendChild(moreInfoButton);

  // Evento para el botón de mute (cambia el ícono y silencia el audio)
  muteButton.addEventListener('click', () => {
    isMuted = !isMuted;
    arVideos.forEach(video => {
      video.muted = isMuted;
    });
    muteButton.innerHTML = isMuted ? `<i class="fas fa-volume-mute"></i>` : `<i class="fas fa-volume-up"></i>`;
  });

  // Evento para el botón de más información (redirige a la URL)
  moreInfoButton.addEventListener('click', () => {
    window.location.href = moreInfoURL;
  });

  // Mostrar u ocultar los botones según el estado de la sesión AR
  renderer.xr.addEventListener('sessionstart', () => {
    arControlsContainer.style.display = 'flex';
    arControlsContainer.style.flexDirection = 'column'; // Apila los botones en vertical
    arControlsContainer.style.gap = '10px';
  });

  renderer.xr.addEventListener('sessionend', () => {
    // Ocultar los controles AR
    arControlsContainer.style.display = 'none';
  
    // Pausar todos los videos en ejecución y reiniciarlos (si lo deseas)
    arVideos.forEach(video => {
      if (!video.paused) {
        video.pause();
        video.currentTime = 0; // Reinicia el video, si es lo que deseas
      }
    });
  
    // (Opcional) Detener el loop de renderizado si no se necesita seguir renderizando
    renderer.setAnimationLoop(null);
  
    // (Opcional) Redirigir a la página deseada
    // Por ejemplo, para redirigir a la página principal:
    window.location.href = "https://tupaginaprincipal.com";
  });
  

  // =====================================================

  // Inicializamos cada target en modo "Lazy"
  for (const index in targetsConfig) {
    const lazyTarget = new LazyARImageTarget(parseInt(index), targetsConfig[index]);
    trackedTargets[parseInt(index)] = lazyTarget;
  }

  window.addEventListener("resize", onWindowResize);
}

/* ===================================================== */
/*                   RENDER LOOP                       */
/* ===================================================== */

function render(_, frame) {
  if (frame) {
    const referenceSpace = renderer.xr.getReferenceSpace();
    // Se marcan todos como no actualizados (por si queremos ocultarlos si no se trackean)
    const updated = {};

    for (let i = 0; i < trackedTargets.length; i++) {
      updated[i] = false;
    }

    // Revisamos qué imágenes se han reconocido en el frame
    const results = frame.getImageTrackingResults();
    for (const result of results) {
      const index = result.index;
      const pose = frame.getPose(result.imageSpace, referenceSpace);
      if (!pose) continue;
      if (trackedTargets[index]) {
        trackedTargets[index].update(pose.transform.matrix, result.trackingState);
        updated[index] = true;
      }
    }

    // Ocultar aquellos targets que no se trackearon en este frame
    for (let i = 0; i < trackedTargets.length; i++) {
      if (!updated[i] && trackedTargets[i]) {
        trackedTargets[i].hide();
      }
    }
  }

  renderer.render(scene, camera);
}

/* ===================================================== */
/*                 VISTA RESPONSIVA                    */
/* ===================================================== */

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
