/* fly-dock.js — Posiciona/move botões flutuantes:
   - Expansões trigger → topo esquerdo (ao lado do cofre)
   - COCKPIT → dentro do utility-dock central (entre NORMAL e TURMAS)
   - (Memória fica via CSS no topo direito, ao lado do ADMIN)
   - Cleanup do dock antigo se existir
*/
(function () {
  function removeOldDock() {
    const oldDock = document.getElementById('fly-bottom-dock-left');
    if (oldDock) oldDock.remove();
    document.querySelectorAll('.fly-docked').forEach(el => {
      el.classList.remove('fly-docked');
      delete el.dataset.flyDocked;
    });
  }

  function positionExpTrigger() {
    const exp = document.getElementById('flyExpTrigger');
    if (!exp) return;
    exp.style.position = 'fixed';
    exp.style.top = '18px';
    exp.style.left = '80px';
    exp.style.right = 'auto';
    exp.style.bottom = 'auto';
    exp.style.zIndex = '100';
  }

  function moveCockpitIntoDock() {
    const cockpit = document.getElementById('dashboardSupremoTrigger');
    const dock = document.querySelector('.utility-dock');
    const turmas = document.getElementById('turmasBtn');
    if (!cockpit || !dock) return;
    if (cockpit.dataset.flyMoved === '1') return;

    // Insere ANTES do botão TURMAS (após NORMAL/DEMO)
    if (turmas && turmas.parentElement === dock) {
      dock.insertBefore(cockpit, turmas);
    } else {
      dock.appendChild(cockpit);
    }
    // Limpa estilos inline antigos do COCKPIT pra ele se comportar como item do dock
    cockpit.style.position = 'static';
    cockpit.style.inset = 'auto';
    cockpit.style.right = 'auto';
    cockpit.style.bottom = 'auto';
    cockpit.style.left = 'auto';
    cockpit.style.top = 'auto';
    cockpit.classList.add('in-utility-dock');
    cockpit.dataset.flyMoved = '1';
  }

  function run() {
    removeOldDock();
    positionExpTrigger();
    moveCockpitIntoDock();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  // Re-tenta caso elementos sejam criados depois
  setTimeout(run, 100);
  setTimeout(run, 500);
  setTimeout(run, 1500);

  // Observa pra capturar criação dinâmica
  const obs = new MutationObserver(() => {
    positionExpTrigger();
    moveCockpitIntoDock();
  });
  obs.observe(document.body, { childList: true, subtree: false });
})();
