/* =====================================================================
   FLY DOCK — agrupa controles flutuantes do canto inferior esquerdo
   numa caixa unificada premium (estilo command bar)
   ===================================================================== */
(function flyDockBoot() {
  'use strict';

  function buildDock() {
    if (document.getElementById('fly-bottom-dock-left')) return;
    const dock = document.createElement('div');
    dock.id = 'fly-bottom-dock-left';
    dock.className = 'fly-dock';
    dock.innerHTML = `
      <div class="fly-dock__slot" data-slot="zoom"></div>
      <div class="fly-dock__divider"></div>
      <div class="fly-dock__slot" data-slot="cockpit"></div>
      <div class="fly-dock__divider"></div>
      <div class="fly-dock__slot" data-slot="memory"></div>
      <div class="fly-dock__divider"></div>
      <div class="fly-dock__slot" data-slot="sync"></div>
    `;
    document.body.appendChild(dock);
    return dock;
  }

  function moveInto(dock, selector, slotName) {
    const slot = dock.querySelector(`[data-slot="${slotName}"]`);
    if (!slot) return false;
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) return false;
    if (el.dataset.flyDocked === '1') return true; // já docked
    el.dataset.flyDocked = '1';
    el.classList.add('fly-docked');
    slot.appendChild(el);
    return true;
  }

  function hideEmptyDividers(dock) {
    // Se um slot está vazio, esconde o divider adjacente
    const slots = dock.querySelectorAll('.fly-dock__slot');
    slots.forEach(s => {
      const empty = !s.querySelector(':scope > *');
      s.classList.toggle('is-empty', empty);
    });
  }

  function organize() {
    const dock = buildDock();

    // Tenta mover cada elemento conhecido pro seu slot
    moveInto(dock, '#flySyncIndicator', 'sync');
    moveInto(dock, '#flyMemBar', 'memory');
    moveInto(dock, '#dashboardSupremoTrigger', 'cockpit');

    // Zoom controls (existe em 2 lugares possíveis)
    const zoomEl = document.querySelector('.fly-timeline-zoom-controls');
    if (zoomEl) moveInto(dock, zoomEl, 'zoom');

    hideEmptyDividers(dock);
  }

  // Roda múltiplas vezes pra pegar elementos que ainda não foram criados
  function startOrganizer() {
    organize();
    // Re-tenta nos próximos frames porque alguns elementos são criados dinamicamente
    setTimeout(organize, 100);
    setTimeout(organize, 500);
    setTimeout(organize, 1500);
    setTimeout(organize, 3000);

    // Observa mudanças no body pra capturar novos elementos
    const obs = new MutationObserver(() => organize());
    obs.observe(document.body, { childList: true, subtree: false });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startOrganizer);
  } else {
    startOrganizer();
  }
})();
