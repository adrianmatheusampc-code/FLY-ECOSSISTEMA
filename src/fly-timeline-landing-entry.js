import { FlyWarSpaceTimeline } from './FlyWarSpaceTimeline.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const ZOOM_STORAGE_KEY = 'fly_timeline_zoom_v2';
const LABEL_STORAGE_KEY = 'fly_timeline_label_scale_v2';

function createButton(label, action, title) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.action = action;
  button.textContent = label;
  button.title = title;
  return button;
}

function createFlyTimelineLanding(mount, optionsOrSelectPeriod) {
  const options =
    typeof optionsOrSelectPeriod === 'function'
      ? { onSelectPeriod: optionsOrSelectPeriod }
      : optionsOrSelectPeriod || {};

  const defaultOverviewZoom = clamp(Number(options.overviewZoom) || 0.72, 0.58, 1.18);
  const defaultLabelScale = clamp(Number(options.labelScale) || 1.32, 0.86, 1.85);
  let overviewZoom = clamp(Number(localStorage.getItem(ZOOM_STORAGE_KEY)) || defaultOverviewZoom, 0.58, 1.18);
  let labelScale = clamp(Number(localStorage.getItem(LABEL_STORAGE_KEY)) || defaultLabelScale, 0.86, 1.85);

  const timeline = new FlyWarSpaceTimeline(mount, {
    autoTour: false,
    mode: 'fullscreen',
    selectionMode: options.selectionMode || 'detail',
    showUpperPlanet: false,
    overviewZoom,
    labelScale,
    onSelectEarth: (payload) => {
      options.onSelectPeriod?.(payload);
    },
    onFocusEarth: (payload) => {
      options.onFocusPeriod?.(payload);
    },
    onSelectTopic: (payload) => {
      options.onSelectTopic?.(payload);
    },
    onOverview: () => {
      options.onOverview?.();
    }
  });

  const zoomControls = document.createElement('div');
  zoomControls.className = 'fly-timeline-zoom-controls';
  const zoomOut = createButton('−', 'zoom-out', 'Afastar Terras');
  const zoomValue = document.createElement('span');
  zoomValue.className = 'fly-timeline-control-value';
  const zoomIn = createButton('+', 'zoom-in', 'Aproximar Terras');
  const zoomReset = createButton('100', 'zoom-reset', 'Resetar zoom');
  zoomControls.append(zoomOut, zoomValue, zoomIn, zoomReset);
  mount.appendChild(zoomControls);

  const adminControls = document.createElement('div');
  adminControls.className = 'fly-timeline-admin-controls';
  const adminLabel = document.createElement('span');
  adminLabel.textContent = 'TEXTOS';
  const labelDown = createButton('A−', 'label-down', 'Diminuir textos dos anos e nomes');
  const labelValue = document.createElement('span');
  labelValue.className = 'fly-timeline-control-value';
  const labelUp = createButton('A+', 'label-up', 'Aumentar textos dos anos e nomes');
  adminControls.append(adminLabel, labelDown, labelValue, labelUp);
  mount.appendChild(adminControls);

  const applyZoom = () => {
    timeline.setOverviewZoom?.(overviewZoom);
    localStorage.setItem(ZOOM_STORAGE_KEY, String(overviewZoom));
    zoomValue.textContent = `${Math.round((overviewZoom / defaultOverviewZoom) * 100)}%`;
  };

  const applyLabelScale = () => {
    timeline.setLabelScale?.(labelScale);
    localStorage.setItem(LABEL_STORAGE_KEY, String(labelScale));
    labelValue.textContent = `${Math.round((labelScale / defaultLabelScale) * 100)}%`;
  };

  zoomControls.addEventListener('click', (event) => {
    const action = event.target?.dataset?.action;
    if (!action) return;
    if (action === 'zoom-out') overviewZoom = clamp(overviewZoom - 0.08, 0.58, 1.18);
    if (action === 'zoom-in') overviewZoom = clamp(overviewZoom + 0.08, 0.58, 1.18);
    if (action === 'zoom-reset') overviewZoom = defaultOverviewZoom;
    applyZoom();
  });

  adminControls.addEventListener('click', (event) => {
    const action = event.target?.dataset?.action;
    if (!action) return;
    if (action === 'label-down') labelScale = clamp(labelScale - 0.08, 0.86, 1.85);
    if (action === 'label-up') labelScale = clamp(labelScale + 0.08, 0.86, 1.85);
    applyLabelScale();
  });

  timeline.ready?.then(() => {
    applyZoom();
    applyLabelScale();
    window.setTimeout(() => {
      try {
        const gl = timeline.renderer?.getContext?.();
        if (!gl) return;

        const width = gl.drawingBufferWidth || 1;
        const height = gl.drawingBufferHeight || 1;
        const samplePoints = [
          [0.18, 0.34],
          [0.34, 0.5],
          [0.5, 0.5],
          [0.66, 0.5],
          [0.82, 0.34],
          [0.5, 0.82]
        ];
        const pixel = new Uint8Array(4);
        let nonBlankSamples = 0;

        samplePoints.forEach(([x, y]) => {
          gl.readPixels(
            Math.max(0, Math.min(width - 1, Math.round(width * x))),
            Math.max(0, Math.min(height - 1, Math.round(height * y))),
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixel
          );
          if (pixel[0] + pixel[1] + pixel[2] > 8) nonBlankSamples += 1;
        });

        mount.dataset.renderState = nonBlankSamples > 0 ? 'nonblank' : 'blank';
        mount.dataset.renderSamples = String(nonBlankSamples);
        mount.dataset.hitboxes = JSON.stringify(
          timeline.earths.map((earth) => {
            const projected = earth.group.getWorldPosition(earth.group.position.clone()).project(timeline.camera);
            return {
              id: earth.id,
              x: Math.round((projected.x * 0.5 + 0.5) * mount.clientWidth),
              y: Math.round((-projected.y * 0.5 + 0.5) * mount.clientHeight)
            };
          })
        );
      } catch {
        mount.dataset.renderState = 'unreadable';
      }
    }, 450);
  }).catch(() => {
    mount.dataset.renderState = 'error';
  });

  return {
    timeline,
    setActive(isActive) {
      if (timeline.disposed) return;

      if (isActive) {
        if (!timeline.rafId) {
          timeline.clock.getDelta();
          timeline.animate();
        }
        return;
      }

      if (timeline.rafId) {
        window.cancelAnimationFrame(timeline.rafId);
        timeline.rafId = 0;
      }
    },
    setOverviewZoom(value) {
      overviewZoom = clamp(Number(value) || 1, 0.58, 1.18);
      applyZoom();
    },
    setLabelScale(value) {
      labelScale = clamp(Number(value) || 1.22, 0.86, 1.85);
      applyLabelScale();
    },
    exitFocus() {
      timeline.exitFocus?.();
    },
    dispose() {
      timeline.dispose();
      zoomControls.remove();
      adminControls.remove();
    }
  };
}

window.FlyTimelineLanding = {
  create: createFlyTimelineLanding
};
