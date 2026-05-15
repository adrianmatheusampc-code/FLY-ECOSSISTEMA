import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { gsap } from 'gsap';

const DEG = Math.PI / 180;
const BRAZIL = { label: 'BRASIL', lat: -23.5505, lon: -46.6333 };
const DUBAI = { label: 'DUBAI', lat: 25.2048, lon: 55.2708 };
const DETAIL_TOPICS = [
  { id: 'estrutura', label: 'ESTRUTURA CORPORATIVA', className: 'topic--structure' },
  { id: 'produtos', label: 'PRODUTOS', className: 'topic--products' },
  { id: 'sustentabilidade', label: 'SUSTENTABILIDADE', className: 'topic--sustainability' },
  { id: 'marketing', label: 'MARKETING', className: 'topic--marketing' },
  { id: 'projetos', label: 'PROJETOS', className: 'topic--projects' },
  { id: 'parceiros', label: 'PARCEIROS ESTRATEGICOS', className: 'topic--partners' },
  { id: 'rede', label: 'REDE COMERCIAL', className: 'topic--network' }
];

// Troque ou adicione assets aqui. Em Vite, tudo dentro de public/ fica servido pela raiz.
// Exemplo: public/textures/earth-albedo-8k.jpg vira /textures/earth-albedo-8k.jpg.
const EARTH_TEXTURE_CANDIDATES = {
  flyGold: [
    '/textures/fly-gold-earth-map.png',
    '/textures/b83a5612-fb3e-4055-b512-f087c2c138c6.png',
    '/assets/textures/fly-gold-earth-map.png',
    '/public/textures/fly-gold-earth-map.png'
  ],
  albedo: [
    '/textures/earth-albedo-8k.jpg',
    '/textures/earth albedo.jpg',
    '/textures/earth_daymap.jpg',
    '/textures/earth-day.jpg',
    '/textures/earth.jpg',
    '/textures/earth-generated-reference.png',
    '/assets/textures/earth-albedo-8k.jpg',
    '/assets/textures/earth.jpg',
    '/public/textures/earth-albedo-8k.jpg',
    '/models/earth-albedo.jpg',
    '/public/models/earth-albedo.jpg'
  ],
  bump: [
    '/textures/earth-bump-8k.jpg',
    '/textures/earth bump.jpg',
    '/textures/earth-bump.jpg',
    '/textures/earth_normal.jpg',
    '/textures/earth-normal.jpg',
    '/assets/textures/earth-bump-8k.jpg',
    '/assets/textures/earth-bump.jpg',
    '/public/textures/earth-bump-8k.jpg',
    '/models/earth-bump.jpg',
    '/public/models/earth-bump.jpg'
  ],
  clouds: [
    '/textures/earth-clouds.png',
    '/textures/clouds earth.png',
    '/textures/earth_clouds.png',
    '/textures/earth-cloud-map.png',
    '/assets/textures/earth-clouds.png',
    '/public/textures/earth-clouds.png',
    '/models/earth-clouds.png',
    '/public/models/earth-clouds.png'
  ],
  night: [
    '/textures/earth-night-lights-8k.png',
    '/textures/earth night_lights_modified.png',
    '/textures/earth-night-lights.png',
    '/textures/earth_lights.png',
    '/assets/textures/earth-night-lights.png',
    '/public/textures/earth-night-lights-8k.png',
    '/models/earth-night-lights.png',
    '/public/models/earth-night-lights.png'
  ],
  landOceanMask: [
    '/textures/earth-land-ocean-mask-4k.png',
    '/textures/earth land ocean mask.png',
    '/textures/earth-land-ocean-mask.png',
    '/textures/earth-specular.jpg',
    '/textures/earth-specular.png',
    '/assets/textures/earth-land-ocean-mask.png',
    '/public/textures/earth-land-ocean-mask-4k.png',
    '/models/earth-land-ocean-mask.png',
    '/public/models/earth-land-ocean-mask.png'
  ]
};

const EARTH_MODEL_CANDIDATES = [
  '/models/earth.glb',
  '/models/earth.gltf',
  '/assets/models/earth.glb',
  '/assets/models/earth.gltf',
  '/public/models/earth.glb',
  '/public/models/earth.gltf'
];

export class FlyWarSpaceTimeline {
  constructor(mount, options = {}) {
    this.mount = typeof mount === 'string' ? document.querySelector(mount) : mount;

    if (!this.mount) {
      throw new Error('FlyWarSpaceTimeline precisa de um elemento container valido.');
    }

    this.options = {
      autoTour: true,
      mode: 'fullscreen',
      selectionMode: 'detail',
      onSelectEarth: null,
      onFocusEarth: null,
      onSelectTopic: null,
      onOverview: null,
      showUpperPlanet: false,
      overviewZoom: 1,
      labelScale: 1.22,
      ...options
    };

    this.clock = new THREE.Clock();
    this.earths = [];
    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.parallax = new THREE.Vector2();
    this.targetParallax = new THREE.Vector2();
    this.mixers = [];
    this.rafId = 0;
    this.disposed = false;
    this.viewMode = 'overview';
    this.selectedEarth = null;
    this.selectedTopic = null;
    this.pointerDown = null;
    this.dragState = null;
    this.isMobile = window.matchMedia('(max-width: 720px)').matches;
    this.overviewZoom = THREE.MathUtils.clamp(Number(this.options.overviewZoom) || 1, 0.58, 1.18);
    this.labelScale = THREE.MathUtils.clamp(Number(this.options.labelScale) || 1.22, 0.86, 1.85);

    this.onResize = this.onResize.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onUserControlStart = this.onUserControlStart.bind(this);
    this.animate = this.animate.bind(this);

    this.container = document.createElement('section');
    this.container.className = 'fly-war-space-timeline';
    this.container.dataset.mode = this.options.mode === 'cinema' ? 'cinema' : 'fullscreen';
    this.container.dataset.view = 'overview';
    this.mount.appendChild(this.container);

    this.createDomOverlay();
    this.ready = this.init();
  }

  async init() {
    this.createRenderer();
    this.createCameraAndControls();
    this.createSceneShell();
    this.bindEvents();

    this.assets = await loadEarthAssets(this.renderer);

    this.createLighting();
    this.createDeepSpace();
    if (this.options.showUpperPlanet) {
      this.createUpperPlanet();
    }
    this.createTimeline();

    this.hideLoading();
    this.startTour();
    this.animate();
  }

  createDomOverlay() {
    this.hud = document.createElement('div');
    this.hud.className = 'fly-hud';
    this.hud.innerHTML = `
      <div class="fly-hud__eyebrow">FLY WAR ROOM</div>
      <div class="fly-hud__title">GLOBAL EXPANSION</div>
      <div class="fly-hud__meta">
        <span>BRASIL / DUBAI</span>
        <span>FLY / 2026 - 2031</span>
      </div>
    `;

    this.loading = document.createElement('div');
    this.loading.className = 'fly-loading';
    this.loading.textContent = 'CARREGANDO MAPA GLOBAL';

    this.detailOverlay = document.createElement('div');
    this.detailOverlay.className = 'fly-detail';
    this.detailOverlay.innerHTML = `
      <button class="fly-detail__back" type="button" aria-label="Voltar para visao geral">← VOLTAR</button>
      <div class="fly-detail__center">
        <div class="fly-detail__kicker">A FLY COMPANY +</div>
        <h2 class="fly-detail__title">ECOSSISTEMA FLY</h2>
        <div class="fly-detail__period">SET 2025 — ABR 2026</div>
      </div>
      <div class="fly-detail__orbit" aria-label="Topicos do plano selecionado">
        ${DETAIL_TOPICS.map((topic) => {
          return `<button class="fly-topic ${topic.className}" type="button" data-topic="${topic.id}">${topic.label}</button>`;
        }).join('')}
      </div>
    `;

    this.detailTitle = this.detailOverlay.querySelector('.fly-detail__title');
    this.detailPeriod = this.detailOverlay.querySelector('.fly-detail__period');
    this.detailBack = this.detailOverlay.querySelector('.fly-detail__back');
    this.topicButtons = [...this.detailOverlay.querySelectorAll('.fly-topic')];
    this.detailBack.addEventListener('click', () => this.exitFocus());
    this.topicButtons.forEach((button) => {
      button.addEventListener('click', () => this.selectTopic(button.dataset.topic));
    });

    this.container.append(this.hud, this.detailOverlay, this.loading);
  }

  createRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.isMobile ? 1.02 : 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x020306, 1);

    this.container.appendChild(this.renderer.domElement);
    this.onResize();
  }

  createCameraAndControls() {
    const aspect = this.width / this.height;
    this.camera = new THREE.PerspectiveCamera(this.isMobile ? 52 : 43, aspect, 0.1, 180);
    this.camera.position.copy(this.getOverviewCameraPosition());
    this.cameraTarget = this.getOverviewCameraTarget();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enabled = false;
    this.controls.enableDamping = false;
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.controls.enableRotate = false;
    this.controls.rotateSpeed = 0;
    this.controls.zoomSpeed = 0;
    this.controls.panSpeed = 0;
    this.controls.minDistance = 2.6;
    this.controls.maxDistance = 34;
    this.controls.maxPolarAngle = Math.PI * 0.78;
    this.controls.target.copy(this.cameraTarget);
    this.controls.update();
  }

  getOverviewCameraPosition() {
    const baseZ = this.isMobile ? 18.2 : 25.4;
    const zoom = this.overviewZoom || 1;
    return new THREE.Vector3(0, this.isMobile ? 2.75 : 3.15, baseZ / zoom);
  }

  getOverviewCameraTarget() {
    return new THREE.Vector3(0, this.isMobile ? -1.1 : -1.18, 0);
  }

  getFocusCameraPosition(earth) {
    const base = earth.group.userData.basePosition;
    return new THREE.Vector3(base.x, this.isMobile ? 0.1 : -0.12, this.isMobile ? 3.9 : 4.2);
  }

  getFocusCameraTarget(earth) {
    const base = earth.group.userData.basePosition;
    return new THREE.Vector3(base.x, base.y - earth.radius * 0.02, base.z);
  }

  setOverviewZoom(value) {
    this.overviewZoom = THREE.MathUtils.clamp(Number(value) || 1, 0.58, 1.18);
    if (!this.camera || this.viewMode !== 'overview') return;

    gsap.killTweensOf(this.camera.position);
    gsap.to(this.camera.position, {
      ...this.getOverviewCameraPosition(),
      duration: 0.35,
      ease: 'power2.out'
    });
  }

  setLabelScale(value) {
    this.labelScale = THREE.MathUtils.clamp(Number(value) || 1.22, 0.86, 1.85);
    this.earths.forEach((earth) => this.applyLabelScaleToEarth(earth));
  }

  applyLabelScaleToEarth(earth) {
    if (!earth) return;
    const scale = this.labelScale || 1;
    const sprites = [earth.labelSprite, ...(earth.routeLabels || [])].filter(Boolean);

    sprites.forEach((sprite) => {
      const baseScale = sprite.userData.baseScale;
      const basePosition = sprite.userData.basePosition;
      if (!baseScale || !basePosition) return;

      const isTimelineLabel = sprite === earth.labelSprite;
      const effectiveScale = isTimelineLabel ? scale : Math.max(1, scale * 0.9);
      sprite.scale.set(baseScale.x * effectiveScale, baseScale.y * effectiveScale, baseScale.z);
      sprite.position.copy(basePosition);
      if (isTimelineLabel) {
        sprite.position.y -= earth.radius * Math.max(0, effectiveScale - 1) * 0.22;
      }
    });
  }

  createSceneShell() {
    THREE.ColorManagement.enabled = true;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x020306, 0.014);
  }

  bindEvents() {
    window.addEventListener('resize', this.onResize, { passive: true });
    this.container.addEventListener('pointerdown', this.onPointerDown);
    this.container.addEventListener('pointermove', this.onPointerMove);
    this.container.addEventListener('pointerup', this.onPointerUp);
    this.container.addEventListener('pointercancel', this.onPointerUp);
    this.controls.addEventListener('start', this.onUserControlStart);
  }

  createLighting() {
    const ambient = new THREE.AmbientLight(0x385277, 0.46);
    const hemisphere = new THREE.HemisphereLight(0x4c88ff, 0x100706, 0.42);

    this.sunLight = new THREE.DirectionalLight(0xffb36e, 4.8);
    this.sunLight.position.set(-5.5, 8.5, -7.2);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 42;
    this.sunLight.shadow.camera.left = -16;
    this.sunLight.shadow.camera.right = 16;
    this.sunLight.shadow.camera.top = 14;
    this.sunLight.shadow.camera.bottom = -14;

    const coolEdge = new THREE.DirectionalLight(0x5f8fff, 1.1);
    coolEdge.position.set(4.8, 0.8, 4.5);

    this.scene.add(ambient, hemisphere, this.sunLight, coolEdge);
  }

  createDeepSpace() {
    this.starfield = createStarfield(this.isMobile ? 4200 : 7200);
    this.dustfield = createCosmicDust(this.isMobile ? 1000 : 1800);
    this.scene.add(this.starfield.points, this.dustfield.points);
  }

  createUpperPlanet() {
    this.upperPlanet = createUpperOrangePlanet();
    const basePosition = new THREE.Vector3(0, this.isMobile ? 4.1 : 4.35, this.isMobile ? -10.2 : -11.4);
    this.upperPlanet.group.position.copy(basePosition);
    this.upperPlanet.group.userData.basePosition = basePosition;
    this.upperPlanet.group.scale.setScalar(this.isMobile ? 0.84 : 0.96);
    this.scene.add(this.upperPlanet.group);
  }

  createTimeline() {
    this.timelineGroup = new THREE.Group();
    this.timelineGroup.name = 'Fly horizontal 3D expansion timeline';

    const radius = this.isMobile ? 0.56 : 0.68;
    const spacing = this.isMobile ? 2.06 : 2.48;
    const timelineItems = [
      { id: 'fly', label: 'FLY', variant: 'gold', radius },
      { id: '2026', label: '2026', variant: 'standard', radius },
      { id: '2027', label: '2027', variant: 'standard', radius },
      { id: '2028', label: '2028', variant: 'standard', radius },
      { id: '2029', label: '2029', variant: 'standard', radius },
      { id: '2030', label: '2030', variant: 'standard', radius },
      { id: '2031', label: '2031', variant: 'standard', radius }
    ];
    const startX = -spacing * ((timelineItems.length - 1) / 2);
    const baseY = this.isMobile ? -2.18 : -2.32;
    const positions = timelineItems.map((_, index) => {
      const depth = index % 2 === 0 ? 0.14 : -0.28;
      return new THREE.Vector3(startX + index * spacing, baseY + (index % 2) * 0.08, depth);
    });

    this.timelineRail = createTimelineRail(positions, radius);
    this.timelineGroup.add(this.timelineRail);

    positions.forEach((position, index) => {
      const item = timelineItems[index];
      const earth = createEarth({
        radius: item.radius,
        label: item.label,
        variant: item.variant,
        textures: this.assets.textures,
        model: this.assets.earthModel,
        quality: this.isMobile ? 'mobile' : 'desktop'
      });

      earth.group.position.copy(position);
      earth.group.userData.basePosition = position.clone();
      earth.group.userData.floatOffset = index * 1.47;
      earth.group.userData.timelineIndex = index;
      earth.group.userData.timelineLabel = item.label;
      earth.group.userData.baseScale = 1;
      earth.spinGroup.rotation.y = item.variant === 'gold' ? 0 : -0.85 + index * 0.18;
      earth.spinGroup.rotation.x = THREE.MathUtils.degToRad(-3);
      earth.group.rotation.z = index % 2 === 0 ? 0.018 : -0.014;
      earth.label = item.label;
      earth.id = item.id;
      earth.variant = item.variant;
      earth.radius = item.radius;
      earth.index = index;

      this.timelineGroup.add(earth.group);
      this.earths.push(earth);
      this.applyLabelScaleToEarth(earth);
    });

    this.scene.add(this.timelineGroup);
  }

  hideLoading() {
    window.setTimeout(() => {
      this.loading.classList.add('is-hidden');
    }, 280);
  }

  enterFocus(earth) {
    if (!earth || this.viewMode === 'detail') return;

    this.viewMode = 'detail';
    this.selectedEarth = earth;
    this.selectedTopic = null;
    this.container.dataset.view = 'detail';
    this.mount.classList.add('is-3d-detail');
    this.updateDetailCopy(earth);
    this.selectTopic(null, false);
    if (typeof this.options.onFocusEarth === 'function') {
      this.options.onFocusEarth({
        id: earth.id,
        label: earth.label,
        variant: earth.variant,
        index: earth.index
      });
    }
    this.tourTimeline?.kill();

    this.earths.forEach((item) => {
      item.group.visible = item === earth;
      item.group.userData.baseScale = item.group.scale.x || 1;
    });

    if (this.timelineRail) {
      this.timelineRail.visible = false;
    }

    if (this.upperPlanet?.group) {
      this.upperPlanet.group.visible = false;
    }

    gsap.killTweensOf([this.camera.position, this.cameraTarget, earth.group.scale]);
    gsap.to(earth.group.scale, {
      x: 1.08,
      y: 1.08,
      z: 1.08,
      duration: 1,
      ease: 'power3.out'
    });
    gsap.to(this.camera.position, {
      ...this.getFocusCameraPosition(earth),
      duration: 1.15,
      ease: 'power3.inOut'
    });
    gsap.to(this.cameraTarget, {
      ...this.getFocusCameraTarget(earth),
      duration: 1.15,
      ease: 'power3.inOut'
    });
  }

  exitFocus() {
    if (this.viewMode !== 'detail') return;

    const selected = this.selectedEarth;
    this.viewMode = 'overview';
    this.container.dataset.view = 'overview';
    this.mount.classList.remove('is-3d-detail');
    this.selectedEarth = null;
    this.selectedTopic = null;
    this.dragState = null;
    this.targetParallax.set(0, 0);

    if (this.upperPlanet?.group) {
      this.upperPlanet.group.visible = true;
    }

    if (this.timelineRail) {
      this.timelineRail.visible = true;
    }

    this.earths.forEach((earth) => {
      earth.group.visible = true;
      gsap.to(earth.group.scale, {
        x: 1,
        y: 1,
        z: 1,
        duration: 0.9,
        ease: 'power3.out'
      });
    });

    gsap.killTweensOf([this.camera.position, this.cameraTarget]);
    gsap.to(this.camera.position, {
      ...this.getOverviewCameraPosition(),
      duration: 1.05,
      ease: 'power3.inOut'
    });
    gsap.to(this.cameraTarget, {
      ...this.getOverviewCameraTarget(),
      duration: 1.05,
      ease: 'power3.inOut',
      onComplete: () => {
        if (selected) selected.group.scale.setScalar(1);
      }
    });
    if (typeof this.options.onOverview === 'function') {
      this.options.onOverview();
    }
  }

  updateDetailCopy(earth) {
    const isFly = earth.label === 'FLY';
    this.detailTitle.textContent = isFly ? 'ECOSSISTEMA FLY' : `ANO ${earth.label}`;
    this.detailPeriod.textContent = isFly ? 'SET 2025 — ABR 2026' : `${earth.label} — EXPANSAO GLOBAL`;
  }

  selectTopic(topicId, shouldNotify = true) {
    this.selectedTopic = topicId;
    this.topicButtons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.topic === topicId);
    });
    if (shouldNotify && typeof this.options.onSelectTopic === 'function' && this.selectedEarth) {
      this.options.onSelectTopic({
        topicId,
        earth: {
          id: this.selectedEarth.id,
          label: this.selectedEarth.label,
          variant: this.selectedEarth.variant,
          index: this.selectedEarth.index
        }
      });
    }
  }

  startTour() {
    if (!this.options.autoTour) return;

    const target = this.cameraTarget;
    const camera = this.camera.position;
    const xs = this.earths.map((earth) => earth.group.position.x);
    const closeZ = this.isMobile ? 5.8 : 5.2;
    const closeY = this.isMobile ? 1.55 : 1.35;

    this.tourTimeline = gsap.timeline({
      defaults: { ease: 'power3.inOut' },
      delay: 0.55
    });

    this.tourTimeline
      .fromTo(
        camera,
        { x: 0, y: this.isMobile ? 4.1 : 4.6, z: this.isMobile ? 18.5 : 21 },
        { x: xs[0], y: closeY + 0.6, z: closeZ + 2.4, duration: 2.4 },
        0
      )
      .fromTo(
        target,
        { x: 0, y: -0.8, z: 0 },
        { x: xs[0], y: -1.16, z: 0, duration: 2.4 },
        0
      );

    xs.forEach((x, index) => {
      const duration = index === 0 ? 1.45 : 2.05;
      this.tourTimeline.to(
        camera,
        {
          x,
          y: closeY + Math.sin(index * 0.8) * 0.18,
          z: closeZ + Math.cos(index * 0.65) * 0.24,
          duration,
          ease: 'sine.inOut'
        },
        index === 0 ? '+=0.15' : '+=0.05'
      );
      this.tourTimeline.to(
        target,
        {
          x,
          y: -1.12,
          z: index % 2 === 0 ? 0.12 : -0.12,
          duration,
          ease: 'sine.inOut'
        },
        '<'
      );
    });

    this.tourTimeline.to(camera, {
      x: 0,
      y: this.isMobile ? 3.5 : 4.2,
      z: this.isMobile ? 14 : 17.5,
      duration: 2.5
    });
    this.tourTimeline.to(
      target,
      {
        x: 0,
        y: -0.95,
        z: 0,
        duration: 2.5
      },
      '<'
    );
  }

  onUserControlStart() {
    if (this.tourTimeline?.isActive()) {
      this.tourTimeline.pause();
    }
  }

  onPointerMove(event) {
    if (this.dragState && this.viewMode === 'detail' && this.selectedEarth) {
      const dx = event.clientX - this.dragState.x;
      const dy = event.clientY - this.dragState.y;
      this.selectedEarth.spinGroup.rotation.y += dx * 0.008;
      this.selectedEarth.spinGroup.rotation.x = THREE.MathUtils.clamp(
        this.selectedEarth.spinGroup.rotation.x + dy * 0.005,
        -0.72,
        0.72
      );
      this.dragState.x = event.clientX;
      this.dragState.y = event.clientY;
      this.dragState.moved = true;
      return;
    }

    const rect = this.container.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    this.pointer.set(x, y);
    this.targetParallax.set(x * 0.08, y * 0.05);
  }

  onPointerDown(event) {
    if (event.target !== this.renderer.domElement) return;

    this.pointerDown = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now()
    };

    if (this.viewMode === 'detail' && this.selectedEarth) {
      this.dragState = {
        x: event.clientX,
        y: event.clientY,
        moved: false
      };
      this.renderer.domElement.setPointerCapture?.(event.pointerId);
    }
  }

  onPointerUp(event) {
    if (event.target === this.renderer.domElement) {
      try {
        this.renderer.domElement.releasePointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture only exists while dragging the focused earth.
      }
    }

    if (this.viewMode === 'detail') {
      this.dragState = null;
      return;
    }

    if (!this.pointerDown || event.target !== this.renderer.domElement) return;

    const dx = event.clientX - this.pointerDown.x;
    const dy = event.clientY - this.pointerDown.y;
    const distance = Math.hypot(dx, dy);
    const elapsed = performance.now() - this.pointerDown.time;
    this.pointerDown = null;

    if (distance > 8 || elapsed > 700) return;

    const earth = this.pickEarth(event);
    if (earth) {
      if (this.options.selectionMode === 'callback' && typeof this.options.onSelectEarth === 'function') {
        this.options.onSelectEarth({
          id: earth.id,
          label: earth.label,
          variant: earth.variant,
          index: earth.index
        });
        return;
      }

      this.enterFocus(earth);
    }
  }

  pickEarth(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -(((event.clientY - rect.top) / rect.height) * 2 - 1));
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const intersects = this.raycaster.intersectObjects(
      this.earths.map((earth) => earth.group),
      true
    );

    for (const intersection of intersects) {
      let object = intersection.object;
      while (object) {
        const index = object.userData?.timelineIndex;
        if (Number.isInteger(index)) {
          return this.earths[index];
        }
        object = object.parent;
      }
    }

    return this.pickNearestEarthByScreen(event, rect);
  }

  pickNearestEarthByScreen(event, rect = this.renderer.domElement.getBoundingClientRect()) {
    let closest = null;
    let closestDistance = Infinity;
    const projected = new THREE.Vector3();
    const worldPosition = new THREE.Vector3();

    this.camera.updateMatrixWorld();
    this.camera.updateProjectionMatrix();

    this.earths.forEach((earth) => {
      earth.group.getWorldPosition(worldPosition);
      projected.copy(worldPosition).project(this.camera);
      if (projected.z < -1 || projected.z > 1) return;

      const x = rect.left + (projected.x * 0.5 + 0.5) * rect.width;
      const y = rect.top + (-projected.y * 0.5 + 0.5) * rect.height;
      const distance = Math.hypot(event.clientX - x, event.clientY - y);
      const threshold = earth.variant === 'gold' ? 92 : 68;

      if (distance <= threshold && distance < closestDistance) {
        closest = earth;
        closestDistance = distance;
      }
    });

    return closest;
  }

  onResize() {
    const rect = this.container.getBoundingClientRect();
    this.width = Math.max(1, rect.width || window.innerWidth);
    this.height = Math.max(1, rect.height || window.innerHeight);

    if (this.renderer) {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.35 : 1.85);
      this.renderer.setPixelRatio(pixelRatio);
      this.renderer.setSize(this.width, this.height, false);
    }

    if (this.camera) {
      this.camera.aspect = this.width / this.height;
      // FOV adaptativo: portrait mobile precisa de mais ângulo pra Terra não ficar comprida
      const isPortrait = this.height > this.width;
      if (isPortrait && this.width < 720) {
        this.camera.fov = 78; // portrait mobile: FOV bem aberto
      } else if (this.width < 720) {
        this.camera.fov = 56; // landscape mobile
      } else if (this.width < 1024) {
        this.camera.fov = 48; // tablet
      } else {
        this.camera.fov = 43; // desktop
      }
      this.camera.updateProjectionMatrix();
    }

    if (this.starfield?.material) {
      this.starfield.material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);
    }

    if (this.dustfield?.material) {
      this.dustfield.material.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);
    }
  }

  animate() {
    if (this.disposed) return;

    this.rafId = window.requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.033);
    const elapsed = this.clock.elapsedTime;

    this.parallax.x = THREE.MathUtils.damp(this.parallax.x, this.targetParallax.x, 2.6, delta);
    this.parallax.y = THREE.MathUtils.damp(this.parallax.y, this.targetParallax.y, 2.6, delta);

    this.updateBackground(delta, elapsed);
    this.updateUpperPlanet(delta, elapsed);
    this.updateEarths(delta, elapsed);

    if (this.controls?.enabled) {
      this.controls.target.copy(this.cameraTarget);
      this.controls.update();
    } else {
      this.camera.lookAt(this.cameraTarget);
    }
    this.renderer.render(this.scene, this.camera);
  }

  updateBackground(delta, elapsed) {
    if (this.starfield) {
      this.starfield.points.rotation.y += delta * 0.006;
      this.starfield.points.rotation.x = Math.sin(elapsed * 0.08) * 0.015;
      this.starfield.material.uniforms.uTime.value = elapsed;
      this.starfield.material.uniforms.uParallax.value.copy(this.parallax);
    }

    if (this.dustfield) {
      this.dustfield.points.rotation.y -= delta * 0.012;
      this.dustfield.points.position.x = this.parallax.x * -0.18;
      this.dustfield.points.position.y = this.parallax.y * -0.12;
      this.dustfield.material.uniforms.uTime.value = elapsed;
      this.dustfield.material.uniforms.uParallax.value.copy(this.parallax);
    }
  }

  updateUpperPlanet(delta, elapsed) {
    if (!this.upperPlanet) return;

    const basePosition = this.upperPlanet.group.userData.basePosition;
    this.upperPlanet.surface.rotation.y += delta * 0.035;
    this.upperPlanet.glow.rotation.z -= delta * 0.012;
    this.upperPlanet.group.position.x = this.camera.position.x * 0.68 + this.parallax.x * -0.12;
    this.upperPlanet.group.position.y = basePosition.y + Math.sin(elapsed * 0.22) * 0.035;
    this.upperPlanet.group.position.z = basePosition.z;
  }

  updateEarths(delta, elapsed) {
    this.earths.forEach((earth, index) => {
      if (this.viewMode === 'detail' && earth !== this.selectedEarth) return;

      earth.spinGroup.rotation.y += delta * (this.viewMode === 'detail' ? 0.03 : 0.09 + index * 0.006);

      if (earth.clouds) {
        earth.clouds.rotation.y += delta * 0.045;
      }

      const base = earth.group.userData.basePosition;
      if (this.viewMode === 'detail') {
        earth.group.position.copy(base);
      } else {
        earth.group.position.y = base.y + Math.sin(elapsed * 0.42 + earth.group.userData.floatOffset) * 0.06;
        earth.group.position.z = base.z + Math.cos(elapsed * 0.31 + index) * 0.045;
      }

      earth.routeFlights.forEach((flight) => {
        const t = (elapsed * flight.speed + flight.offset) % 1;
        flight.object.position.copy(flight.curve.getPointAt(t));
        const pulse = 1 + Math.sin(elapsed * 8 + flight.offset * 10) * 0.18;
        flight.object.scale.setScalar(flight.baseScale * pulse);
      });
    });
  }

  dispose() {
    this.disposed = true;
    window.cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
    this.container.removeEventListener('pointerdown', this.onPointerDown);
    this.container.removeEventListener('pointermove', this.onPointerMove);
    this.container.removeEventListener('pointerup', this.onPointerUp);
    this.container.removeEventListener('pointercancel', this.onPointerUp);
    this.controls?.removeEventListener('start', this.onUserControlStart);
    this.controls?.dispose();
    this.tourTimeline?.kill();

    if (this.scene) {
      disposeObject3D(this.scene);
    }

    Object.values(this.assets?.textures || {}).forEach((texture) => texture?.dispose?.());
    this.renderer?.dispose();
    this.container.remove();
  }
}

async function loadEarthAssets(renderer) {
  const textureLoader = new THREE.TextureLoader();
  const gltfLoader = new GLTFLoader();
  const anisotropy = renderer.capabilities.getMaxAnisotropy();

  const [flyGold, albedo, bump, clouds, night, landOceanMask, earthModel] = await Promise.all([
    loadTextureFromCandidates(textureLoader, EARTH_TEXTURE_CANDIDATES.flyGold, {
      colorSpace: THREE.SRGBColorSpace,
      anisotropy,
      fallback: createFallbackFlyGold
    }),
    loadTextureFromCandidates(textureLoader, EARTH_TEXTURE_CANDIDATES.albedo, {
      colorSpace: THREE.SRGBColorSpace,
      anisotropy,
      fallback: createFallbackAlbedo
    }),
    loadTextureFromCandidates(textureLoader, EARTH_TEXTURE_CANDIDATES.bump, {
      colorSpace: THREE.NoColorSpace,
      anisotropy,
      fallback: createFallbackBump
    }),
    loadTextureFromCandidates(textureLoader, EARTH_TEXTURE_CANDIDATES.clouds, {
      colorSpace: THREE.NoColorSpace,
      anisotropy,
      fallback: createFallbackClouds
    }),
    loadTextureFromCandidates(textureLoader, EARTH_TEXTURE_CANDIDATES.night, {
      colorSpace: THREE.SRGBColorSpace,
      anisotropy,
      fallback: createFallbackNightLights
    }),
    loadTextureFromCandidates(textureLoader, EARTH_TEXTURE_CANDIDATES.landOceanMask, {
      colorSpace: THREE.NoColorSpace,
      anisotropy,
      fallback: createFallbackLandOceanMask
    }),
    loadModelFromCandidates(gltfLoader, EARTH_MODEL_CANDIDATES)
  ]);

  return {
    earthModel,
    textures: {
      flyGold,
      albedo,
      bump,
      clouds,
      night,
      landOceanMask
    }
  };
}

async function loadTextureFromCandidates(loader, candidates, config) {
  for (const url of expandAssetCandidates(candidates)) {
    try {
      if (!(await assetExists(url))) continue;
      const texture = await loader.loadAsync(url);
      configureTexture(texture, config);
      texture.userData.sourceUrl = url;
      return texture;
    } catch {
      // Keep searching. The component is designed to run even when a project has no assets yet.
    }
  }

  const fallback = config.fallback();
  configureTexture(fallback, config);
  fallback.userData.sourceUrl = 'procedural-fallback';
  return fallback;
}

async function loadModelFromCandidates(loader, candidates) {
  for (const url of expandAssetCandidates(candidates)) {
    try {
      if (!(await assetExists(url))) continue;
      const gltf = await loader.loadAsync(url);
      gltf.scene.userData.sourceUrl = url;
      return gltf.scene;
    } catch {
      // No local GLB/GLTF found. SphereGeometry fallback remains the most reliable path.
    }
  }
  return null;
}

function expandAssetCandidates(candidates) {
  const expanded = [];
  candidates.forEach((url) => {
    if (typeof url !== 'string') return;
    if (url.startsWith('/')) {
      expanded.push(url.slice(1));
      expanded.push(`.${url}`);
    }
    expanded.push(url);
  });
  return [...new Set(expanded)];
}

async function assetExists(url) {
  if (typeof fetch !== 'function') return true;
  if (typeof window !== 'undefined' && window.location?.protocol === 'file:') return true;

  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return response.ok;
  } catch {
    return false;
  }
}

function configureTexture(texture, config) {
  texture.colorSpace = config.colorSpace;
  texture.anisotropy = Math.min(config.anisotropy || 1, 16);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
}

function createEarth({ radius, label, variant = 'standard', textures, model, quality }) {
  const group = new THREE.Group();
  group.name = `Earth ${label}`;

  const spinGroup = new THREE.Group();
  spinGroup.name = 'Rotating earth assembly';
  group.add(spinGroup);

  const segments = quality === 'mobile' ? 96 : 144;
  const earthGeometry = new THREE.SphereGeometry(radius, segments, segments);

  const surface = createEarthSurface(radius, earthGeometry, textures, model, variant);
  spinGroup.add(surface);

  const nightLights = createNightLightsLayer(radius, segments, textures.night, variant);
  spinGroup.add(nightLights);

  const clouds = createCloudLayer(radius, segments, textures.clouds, variant);
  spinGroup.add(clouds);

  const route = createBrazilDubaiRoute(radius);
  spinGroup.add(route.group);

  const atmosphere = createAtmosphere(radius, variant);
  group.add(atmosphere);

  const labelSprite = createTextSprite(label, {
    width: 420,
    height: 160,
    fontSize: variant === 'gold' ? 72 : 62,
    color: variant === 'gold' ? 'rgba(255, 224, 139, 0.98)' : 'rgba(233, 244, 255, 0.92)',
    glow: variant === 'gold' ? 'rgba(255, 175, 42, 0.68)' : 'rgba(80, 156, 255, 0.42)',
    underline: variant === 'gold' ? 'rgba(255, 193, 77, 0.9)' : 'rgba(255, 176, 94, 0.72)'
  });
  labelSprite.position.set(0, -radius * 1.62, 0.04);
  labelSprite.scale.set(radius * 1.28, radius * 0.48, 1);
  labelSprite.userData.basePosition = labelSprite.position.clone();
  labelSprite.userData.baseScale = labelSprite.scale.clone();
  group.add(labelSprite);

  return {
    group,
    spinGroup,
    surface,
    clouds,
    labelSprite,
    routeLabels: route.labels,
    routeFlights: route.flights
  };
}

function createEarthSurface(radius, sphereGeometry, textures, model, variant) {
  if (model && variant !== 'gold') {
    const modelRoot = model.clone(true);
    normalizeObjectToRadius(modelRoot, radius);
    modelRoot.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material) {
        child.material.envMapIntensity = 0.38;
        child.material.roughness = Math.max(child.material.roughness ?? 0.7, 0.55);
      }
    });
    return modelRoot;
  }

  const material =
    variant === 'gold'
      ? new THREE.MeshPhysicalMaterial({
          map: textures.flyGold,
          bumpMap: textures.bump,
          bumpScale: radius * 0.052,
          color: 0xfff0a8,
          roughness: 0.28,
          metalness: 0.62,
          clearcoat: 0.96,
          clearcoatRoughness: 0.16,
          emissive: new THREE.Color(0xffc928),
          emissiveMap: textures.flyGold,
          emissiveIntensity: 0.08,
          sheen: 0.72,
          sheenColor: new THREE.Color(0xffef9a)
        })
      : new THREE.MeshPhysicalMaterial({
          map: textures.albedo,
          bumpMap: textures.bump,
          bumpScale: radius * 0.032,
          roughnessMap: textures.landOceanMask,
          roughness: 0.74,
          metalness: 0,
          clearcoat: 0.12,
          clearcoatRoughness: 0.62,
          sheen: 0.18,
          sheenColor: new THREE.Color(0x3d7dff)
        });

  const mesh = new THREE.Mesh(sphereGeometry, material);
  mesh.name = variant === 'gold' ? 'FLY gold earth surface' : '8K earth surface';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createNightLightsLayer(radius, segments, nightTexture, variant) {
  const geometry = new THREE.SphereGeometry(radius * 1.004, segments, segments);
  const material = new THREE.MeshBasicMaterial({
    map: nightTexture,
    color: variant === 'gold' ? 0xffdf5a : 0xdcecff,
    transparent: true,
    opacity: variant === 'gold' ? 0.36 : 0.34,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'night lights overlay';
  return mesh;
}

function createCloudLayer(radius, segments, cloudTexture, variant) {
  const geometry = new THREE.SphereGeometry(radius * 1.018, segments, segments);
  const material = new THREE.MeshBasicMaterial({
    color: variant === 'gold' ? 0xfff2b2 : 0xf2fbff,
    alphaMap: cloudTexture,
    transparent: true,
    opacity: variant === 'gold' ? 0.1 : 0.48,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'cloud layer';
  return mesh;
}

function createAtmosphere(radius, variant = 'standard') {
  const geometry = new THREE.SphereGeometry(radius * (variant === 'gold' ? 1.075 : 1.06), 96, 96);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(variant === 'gold' ? 0xffd447 : 0x4db4ff) },
      intensity: { value: variant === 'gold' ? 0.96 : 0.52 }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform float intensity;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float rim = 1.0 - max(dot(viewDirection, normalize(vNormal)), 0.0);
        float halo = pow(rim, 2.35) * intensity;
        gl_FragColor = vec4(glowColor, halo);
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const atmosphere = new THREE.Mesh(geometry, material);
  atmosphere.name = variant === 'gold' ? 'gold atmospheric glow' : 'blue atmospheric glow';
  return atmosphere;
}

function createBrazilDubaiRoute(radius) {
  const group = new THREE.Group();
  group.name = 'Brazil to Dubai route';

  const start = latLonToVector3(BRAZIL.lat, BRAZIL.lon, radius * 1.045);
  const end = latLonToVector3(DUBAI.lat, DUBAI.lon, radius * 1.045);
  const curve = createGreatCircleCurve(start, end, radius, 0.24);

  const glowTube = new THREE.TubeGeometry(curve, 128, radius * 0.015, 10, false);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x54c9ff,
    transparent: true,
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const glow = new THREE.Mesh(glowTube, glowMaterial);

  const coreTube = new THREE.TubeGeometry(curve, 128, radius * 0.0048, 8, false);
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: 0xffc57d,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const core = new THREE.Mesh(coreTube, coreMaterial);

  group.add(glow, core);

  const markerMaterialBrazil = new THREE.MeshBasicMaterial({
    color: 0xffd38b,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 1
  });
  const markerMaterialDubai = new THREE.MeshBasicMaterial({
    color: 0x63d8ff,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 1
  });

  group.add(createRouteMarker(start, radius, markerMaterialBrazil));
  group.add(createRouteMarker(end, radius, markerMaterialDubai));

  const brazilLabel = createTextSprite(BRAZIL.label, {
    width: 420,
    height: 140,
    fontSize: 52,
    color: 'rgba(255, 220, 160, 0.95)',
    glow: 'rgba(255, 178, 74, 0.5)',
    underline: 'rgba(255, 200, 130, 0.82)'
  });
  brazilLabel.position.copy(start.clone().normalize().multiplyScalar(radius * 1.38));
  brazilLabel.position.y += radius * 0.12;
  brazilLabel.scale.set(radius * 0.72, radius * 0.24, 1);
  brazilLabel.userData.basePosition = brazilLabel.position.clone();
  brazilLabel.userData.baseScale = brazilLabel.scale.clone();

  const dubaiLabel = createTextSprite(DUBAI.label, {
    width: 420,
    height: 140,
    fontSize: 52,
    color: 'rgba(210, 242, 255, 0.95)',
    glow: 'rgba(83, 202, 255, 0.55)',
    underline: 'rgba(103, 220, 255, 0.82)'
  });
  dubaiLabel.position.copy(end.clone().normalize().multiplyScalar(radius * 1.38));
  dubaiLabel.position.y += radius * 0.12;
  dubaiLabel.scale.set(radius * 0.72, radius * 0.24, 1);
  dubaiLabel.userData.basePosition = dubaiLabel.position.clone();
  dubaiLabel.userData.baseScale = dubaiLabel.scale.clone();

  group.add(brazilLabel, dubaiLabel);

  const flights = [];
  for (let index = 0; index < 3; index += 1) {
    const packet = createFlightPacket(radius);
    packet.position.copy(curve.getPointAt(index / 3));
    group.add(packet);
    flights.push({
      object: packet,
      curve,
      speed: 0.12 + index * 0.012,
      offset: index * 0.32,
      baseScale: 1
    });
  }

  return { group, flights, labels: [brazilLabel, dubaiLabel] };
}

function createRouteMarker(position, radius, material) {
  const marker = new THREE.Group();
  marker.position.copy(position);

  const core = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.022, 18, 18), material);
  const glow = createGlowSprite(material.color, radius * 0.2, 0.72);

  marker.add(core, glow);
  return marker;
}

function createFlightPacket(radius) {
  const packet = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const dot = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.012, 12, 12), material);
  const glow = createGlowSprite(new THREE.Color(0xffd59a), radius * 0.14, 0.75);
  packet.add(dot, glow);
  return packet;
}

function createTimelineRail(positions, radius) {
  const group = new THREE.Group();
  group.name = 'timeline rail';

  const railPoints = positions.map((position) => {
    return new THREE.Vector3(position.x, position.y - radius * 1.32, position.z - 0.08);
  });

  const railCurve = new THREE.CatmullRomCurve3(railPoints, false, 'catmullrom', 0.18);
  const railGlow = new THREE.Mesh(
    new THREE.TubeGeometry(railCurve, 180, radius * 0.022, 8, false),
    new THREE.MeshBasicMaterial({
      color: 0x3f95ff,
      transparent: true,
      opacity: 0.13,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );

  const railCore = new THREE.Mesh(
    new THREE.TubeGeometry(railCurve, 180, radius * 0.004, 8, false),
    new THREE.MeshBasicMaterial({
      color: 0xbddfff,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );

  group.add(railGlow, railCore);

  railPoints.forEach((point, index) => {
    const tick = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.035, 18, 18),
      new THREE.MeshBasicMaterial({
        color: index === 0 ? 0xffbd76 : 0x78caff,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    tick.position.copy(point);
    group.add(tick);
  });

  return group;
}

function createDeepSpaceMaterial(baseOpacity) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uParallax: { value: new THREE.Vector2() },
      uOpacity: { value: baseOpacity }
    },
    vertexShader: `
      attribute float aSize;
      attribute float aTwinkle;
      varying vec3 vColor;
      varying float vAlpha;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform vec2 uParallax;

      void main() {
        vColor = color;
        vAlpha = 0.62 + 0.38 * sin(uTime * (0.75 + aTwinkle) + aTwinkle * 21.0);
        vec3 transformed = position;
        transformed.xy += uParallax * (0.25 + abs(position.z) * 0.008);
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = aSize * uPixelRatio * (230.0 / max(12.0, -mvPosition.z));
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      uniform float uOpacity;

      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        float alpha = smoothstep(0.5, 0.0, d) * vAlpha * uOpacity;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
}

function createStarfield(count) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const twinkles = new Float32Array(count);
  const color = new THREE.Color();

  for (let index = 0; index < count; index += 1) {
    const i3 = index * 3;
    positions[i3] = THREE.MathUtils.randFloatSpread(95);
    positions[i3 + 1] = THREE.MathUtils.randFloatSpread(46);
    positions[i3 + 2] = THREE.MathUtils.randFloat(-88, -13);

    const warmth = Math.random();
    color.setHSL(warmth > 0.84 ? 0.09 : 0.58, warmth > 0.84 ? 0.6 : 0.38, THREE.MathUtils.randFloat(0.66, 1));
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;

    sizes[index] = THREE.MathUtils.randFloat(0.42, Math.random() > 0.982 ? 2.1 : 1.35);
    twinkles[index] = Math.random();
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aTwinkle', new THREE.BufferAttribute(twinkles, 1));

  const material = createDeepSpaceMaterial(0.64);
  const points = new THREE.Points(geometry, material);
  points.name = 'deep starfield';
  return { points, material };
}

function createCosmicDust(count) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const twinkles = new Float32Array(count);
  const color = new THREE.Color();

  for (let index = 0; index < count; index += 1) {
    const i3 = index * 3;
    positions[i3] = THREE.MathUtils.randFloatSpread(48);
    positions[i3 + 1] = THREE.MathUtils.randFloat(-12, 10);
    positions[i3 + 2] = THREE.MathUtils.randFloat(-36, -8);

    const hue = Math.random() > 0.55 ? 0.08 : 0.56;
    color.setHSL(hue, THREE.MathUtils.randFloat(0.45, 0.85), THREE.MathUtils.randFloat(0.35, 0.72));
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;

    sizes[index] = THREE.MathUtils.randFloat(0.9, 3.8);
    twinkles[index] = Math.random();
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aTwinkle', new THREE.BufferAttribute(twinkles, 1));

  const material = createDeepSpaceMaterial(0.04);
  const points = new THREE.Points(geometry, material);
  points.name = 'subtle cosmic dust';
  return { points, material };
}

function createUpperOrangePlanet() {
  const group = new THREE.Group();
  group.name = 'giant upper orange planet';

  const radius = 5.35;
  const surfaceTexture = createSunSurfaceTexture();
  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 128, 128),
    new THREE.MeshBasicMaterial({
      map: surfaceTexture,
      color: 0xff8c2e
    })
  );
  surface.name = 'orange planet surface';

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.045, 96, 96),
    new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: new THREE.Color(0xff8a35) },
        power: { value: 1.8 }
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vWorldPosition;

        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        uniform float power;
        varying vec3 vNormal;
        varying vec3 vWorldPosition;

        void main() {
          vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
          float rim = pow(1.0 - max(dot(viewDirection, normalize(vNormal)), 0.0), power);
          gl_FragColor = vec4(glowColor, rim * 0.78);
        }
      `,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  glow.name = 'orange atmospheric glow';

  const corona = createCoronaSprite();
  corona.scale.set(radius * 3.7, radius * 3.7, 1);

  const pointLight = new THREE.PointLight(0xff8f43, 48, 64, 1.5);
  pointLight.position.set(-1.8, -0.8, 2.5);

  group.add(corona, surface, glow, pointLight);
  return { group, surface, glow, corona };
}

function createTextSprite(text, options) {
  const width = options.width || 512;
  const height = options.height || 160;
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = width * dpr;
  canvas.height = height * dpr;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${options.fontSize || 54}px Inter, Arial, sans-serif`;
  ctx.shadowColor = options.glow || 'rgba(100, 180, 255, 0.45)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = options.color || 'rgba(238, 246, 255, 0.92)';
  ctx.fillText(text, width / 2, height / 2 - 4);

  const gradient = ctx.createLinearGradient(width * 0.2, height * 0.78, width * 0.8, height * 0.78);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.5, options.underline || 'rgba(255, 185, 97, 0.8)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.shadowBlur = 10;
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width * 0.24, height * 0.76);
  ctx.lineTo(width * 0.76, height * 0.76);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.name = `label ${text}`;
  return sprite;
}

function createGlowSprite(color, scale, opacity = 0.6) {
  const texture = createRadialTexture(color);
  const material = new THREE.SpriteMaterial({
    map: texture,
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale, scale, 1);
  return sprite;
}

function createCoronaSprite() {
  const size = 768;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255, 201, 124, 0.62)');
  gradient.addColorStop(0.22, 'rgba(255, 134, 55, 0.34)');
  gradient.addColorStop(0.52, 'rgba(255, 92, 24, 0.12)');
  gradient.addColorStop(1, 'rgba(255, 80, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.86,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.name = 'orange corona glow';
  return sprite;
}

function createRadialTexture(color) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cssColor = `#${color.getHexString()}`;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.2, cssColor);
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSunSurfaceTexture() {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const base = ctx.createLinearGradient(0, 0, 0, height);
  base.addColorStop(0, '#ffbc68');
  base.addColorStop(0.42, '#ff7f2e');
  base.addColorStop(1, '#7a2309');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 9000; i += 1) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const alpha = Math.random() * 0.08;
    ctx.fillStyle = Math.random() > 0.5 ? `rgba(255, 226, 160, ${alpha})` : `rgba(92, 18, 0, ${alpha})`;
    ctx.fillRect(x, y, Math.random() * 2.8 + 0.4, Math.random() * 2.8 + 0.4);
  }

  for (let band = 0; band < 18; band += 1) {
    const y = (band / 18) * height + Math.sin(band) * 18;
    ctx.strokeStyle = `rgba(255, ${120 + band * 4}, 52, 0.12)`;
    ctx.lineWidth = 2 + Math.random() * 7;
    ctx.beginPath();
    for (let x = 0; x <= width; x += 28) {
      const wave = Math.sin(x * 0.013 + band * 1.7) * 14;
      if (x === 0) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function createGreatCircleCurve(start, end, radius, altitude) {
  const startNormal = start.clone().normalize();
  const endNormal = end.clone().normalize();
  const points = [];

  for (let index = 0; index <= 96; index += 1) {
    const t = index / 96;
    const normal = slerpVector3(startNormal, endNormal, t).normalize();
    const lift = 1 + Math.sin(Math.PI * t) * altitude;
    points.push(normal.multiplyScalar(radius * 1.045 * lift));
  }

  return new THREE.CatmullRomCurve3(points);
}

function slerpVector3(start, end, t) {
  const dot = THREE.MathUtils.clamp(start.dot(end), -1, 1);

  if (dot > 0.9995) {
    return start.clone().lerp(end, t);
  }

  const theta = Math.acos(dot) * t;
  const relative = end.clone().sub(start.clone().multiplyScalar(dot)).normalize();
  return start.clone().multiplyScalar(Math.cos(theta)).add(relative.multiplyScalar(Math.sin(theta)));
}

function normalizeObjectToRadius(object, radius) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z) || 1;

  object.position.sub(center);
  object.scale.setScalar((radius * 2) / maxDimension);
}

function createFallbackAlbedo() {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const ocean = ctx.createLinearGradient(0, 0, width, height);
  ocean.addColorStop(0, '#03183f');
  ocean.addColorStop(0.5, '#06356e');
  ocean.addColorStop(1, '#010a24');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#4f7d35';
  drawContinentBlob(ctx, 620, 360, 220, 250, 23);
  drawContinentBlob(ctx, 760, 610, 170, 260, 19);
  drawContinentBlob(ctx, 1120, 360, 340, 220, 32);
  drawContinentBlob(ctx, 1380, 470, 250, 260, 25);
  drawContinentBlob(ctx, 1660, 650, 160, 120, 16);

  ctx.fillStyle = 'rgba(238, 238, 224, 0.9)';
  ctx.fillRect(0, 0, width, 88);
  ctx.fillRect(0, height - 90, width, 90);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createFallbackFlyGold() {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const ocean = ctx.createLinearGradient(0, 0, width, height);
  ocean.addColorStop(0, '#020912');
  ocean.addColorStop(0.5, '#071828');
  ocean.addColorStop(1, '#020408');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#d49320';
  drawContinentBlob(ctx, 620, 360, 220, 250, 23);
  drawContinentBlob(ctx, 760, 610, 170, 260, 19);
  drawContinentBlob(ctx, 1120, 360, 340, 220, 32);
  drawContinentBlob(ctx, 1380, 470, 250, 260, 25);
  drawContinentBlob(ctx, 1660, 650, 160, 120, 16);

  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255, 204, 94, 0.72)';
  ctx.lineWidth = 5;
  for (let i = 0; i < 90; i += 1) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    ctx.beginPath();
    ctx.arc(x, y, Math.random() * 8 + 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createFallbackBump() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#777';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 5000; i += 1) {
    const shade = Math.floor(90 + Math.random() * 80);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 1, 1);
  }
  return new THREE.CanvasTexture(canvas);
}

function createFallbackClouds() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 180; i += 1) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const radius = 20 + Math.random() * 70;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(255,255,255,0.75)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  return new THREE.CanvasTexture(canvas);
}

function createFallbackNightLights() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 900; i += 1) {
    ctx.globalAlpha = Math.random() * 0.75;
    ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 1.2, 1.2);
  }
  ctx.globalAlpha = 1;
  return new THREE.CanvasTexture(canvas);
}

function createFallbackLandOceanMask() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#eee';
  drawContinentBlob(ctx, 310, 180, 100, 120, 12);
  drawContinentBlob(ctx, 380, 310, 85, 130, 12);
  drawContinentBlob(ctx, 560, 180, 170, 110, 14);
  drawContinentBlob(ctx, 690, 235, 130, 130, 13);
  return new THREE.CanvasTexture(canvas);
}

function drawContinentBlob(ctx, centerX, centerY, radiusX, radiusY, points) {
  ctx.beginPath();
  for (let index = 0; index <= points; index += 1) {
    const angle = (index / points) * Math.PI * 2;
    const noise = 0.72 + Math.random() * 0.42;
    const x = centerX + Math.cos(angle) * radiusX * noise;
    const y = centerY + Math.sin(angle) * radiusY * noise;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function disposeObject3D(root) {
  root.traverse((object) => {
    if (object.geometry) {
      object.geometry.dispose();
    }

    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(disposeMaterial);
    }
  });
}

function disposeMaterial(material) {
  Object.values(material).forEach((value) => {
    if (value?.isTexture) {
      value.dispose();
    }
  });
  material.dispose();
}
