/* =====================================================================
   FLY FLIP ANIMATE · animação de mudança de posição (técnica FLIP)
   First, Last, Invert, Play

   Uso:
     // Antes do refresh:
     const snap = window.__flyFlip.snapshot(containerEl, '[data-id]');

     // Faz o refresh (re-render do conteúdo)
     refreshList();

     // Anima a transição de cada item para sua nova posição
     window.__flyFlip.animate(snap, containerEl, '[data-id]', {
       duration: 450,
       easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
       highlight: true,  // adiciona destaque dourado em quem moveu
     });

   Quando o ranking muda, vendedor que sobe de 3º pra 1º desliza
   suavemente para cima, com leve scale-up dourado quando subiu.
   ===================================================================== */
(function flyFlipAnimateBoot() {
  'use strict';

  if (window.__flyFlip) return;

  function snapshot(container, itemSelector) {
    if (!container) return new Map();
    const map = new Map();
    container.querySelectorAll(itemSelector).forEach(el => {
      const id = el.dataset.id || el.id || el.dataset.rank || el.textContent.trim().slice(0, 30);
      const rect = el.getBoundingClientRect();
      const rankAttr = el.dataset.rank ? Number(el.dataset.rank) : null;
      map.set(id, { top: rect.top, left: rect.left, height: rect.height, rank: rankAttr });
    });
    return map;
  }

  function animate(snap, container, itemSelector, opts = {}) {
    if (!snap || !container) return;
    const duration = opts.duration || 450;
    const easing   = opts.easing   || 'cubic-bezier(0.34, 1.56, 0.64, 1)';
    const highlight = opts.highlight !== false;

    requestAnimationFrame(() => {
      container.querySelectorAll(itemSelector).forEach(el => {
        const id = el.dataset.id || el.id || el.dataset.rank || el.textContent.trim().slice(0, 30);
        const before = snap.get(id);
        if (!before) {
          // novo item — entra com fade-in
          el.style.transition = 'none';
          el.style.opacity = '0';
          el.style.transform = 'translateY(-12px) scale(0.96)';
          requestAnimationFrame(() => {
            el.style.transition = `transform ${duration}ms ${easing}, opacity ${duration}ms ease`;
            el.style.opacity = '1';
            el.style.transform = '';
          });
          return;
        }

        const after = el.getBoundingClientRect();
        const dy = before.top - after.top;
        const dx = before.left - after.left;
        if (Math.abs(dy) < 1 && Math.abs(dx) < 1) return; // não moveu

        // Aplica delta inverso instantaneamente
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        el.style.willChange = 'transform';

        // Highlight dourado se subiu de posição
        const newRank = el.dataset.rank ? Number(el.dataset.rank) : null;
        const subiuRanking = newRank !== null && before.rank !== null && newRank < before.rank;

        // Próximo frame: anima de volta para zero
        requestAnimationFrame(() => {
          el.style.transition = `transform ${duration}ms ${easing}`;
          el.style.transform = '';
          if (highlight && subiuRanking) {
            el.classList.add('fly-flip-rose');
            setTimeout(() => el.classList.remove('fly-flip-rose'), duration + 600);
          }
        });

        // Limpa willChange depois
        setTimeout(() => {
          el.style.willChange = '';
          el.style.transition = '';
        }, duration + 50);
      });
    });
  }

  /* Helper completo: snapshot → run callback → animate (atalho) */
  function withFlip(container, itemSelector, refreshCallback, opts) {
    const snap = snapshot(container, itemSelector);
    refreshCallback();
    animate(snap, container, itemSelector, opts);
  }

  /* CSS de highlight (uma vez) */
  function injectCSS() {
    if (document.getElementById('fly-flip-styles')) return;
    const s = document.createElement('style');
    s.id = 'fly-flip-styles';
    s.textContent = `
      @keyframes flyFlipRose {
        0%   { box-shadow: 0 0 0 0 rgba(245,184,66,0); transform: scale(1); }
        25%  { box-shadow: 0 0 0 6px rgba(245,184,66,0.35), 0 0 32px 8px rgba(245,184,66,0.55); transform: scale(1.018); }
        100% { box-shadow: 0 0 0 0 rgba(245,184,66,0); transform: scale(1); }
      }
      .fly-flip-rose {
        animation: flyFlipRose 1s ease-out;
      }
    `;
    document.head.appendChild(s);
  }
  if (document.head) injectCSS();
  else document.addEventListener('DOMContentLoaded', injectCSS);

  window.__flyFlip = { snapshot, animate, withFlip };
  console.log('[FLY FLIP] Animation helper online.');
})();
