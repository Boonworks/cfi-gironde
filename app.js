document.addEventListener('DOMContentLoaded', () => {
  const body   = document.body;
  const toggle = document.querySelector('.toggle');
  const links  = Array.from(document.getElementsByClassName('menu__link'));

  /* =========================================================
                          Menu burger
   ========================================================= */
  if (toggle) {
    toggle.addEventListener('click', () => {
      body.classList.toggle('open');
    });
  }
  /* =========================================================
            Fermer le menu quand on clique sur un lien
   ========================================================= */
  if (links.length) {
    links.forEach(a => {
      a.addEventListener('click', () => {
        body.classList.remove('open');
      });
    });
  }
  /* =========================================================
       Animation d'intro : désormais gérée en CSS (voir style.css,
       section "Animation d'intro"). Plus de dépendance à GSAP.
   ========================================================= */
});


// --- Mettre à jour l'année dans le footer ---
const yearEl = document.getElementById('year');
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}
