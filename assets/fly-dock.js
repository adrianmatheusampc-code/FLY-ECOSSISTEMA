/* fly-dock.js — Posiciona Expansões trigger ao lado do Cofre */
(function () {
  // Remove dock antigo se existir
  const oldDock = document.getElementById('fly-bottom-dock-left');
  if (oldDock) oldDock.remove();

  // Restaura elementos que estavam docked (caso tenham sido movidos antes)
  function restoreDocked() {
    document.querySelectorAll('.fly-docked').forEach(el => {
      el.classList.remove('fly-docked');
      delete el.dataset.flyDocked;
      // Move pra direto no body se ainda estiver dentro do dock
      if (el.parentElement && el.parentElement.classList.contains('fly-dock__slot')) {
        document.body.appendChild(el);
      }
    });
  }

  function positionExpTrigger() {
    const exp = document.getElementById('flyExpTrigger');
    if (!exp) return;
    // Posiciona ao lado do botão do cofre (que está em top:18, left:24, 46x46)
    exp.style.position = 'fixed';
    exp.style.top = '18px';
    exp.style.left = '80px';
    exp.style.right = 'auto';
    exp.style.bottom = 'auto';
    exp.style.zIndex = '100';
  }

  function run() {
    restoreDocked();
    positionExpTrigger();
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

  const obs = new MutationObserver(() => positionExpTrigger());
  obs.observe(document.body, { childList: true, subtree: false });
})();
