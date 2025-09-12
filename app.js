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
                           Animations GSA
   ========================================================= */
  if (window.gsap)
  {
    const tl = gsap.timeline();
    tl.from('.accueil', {duration: 0.1,filter: 'blur(10px)',});
    tl.from('.overlay', {duration: 1,x: '-100%',});
    tl.from('.logo, .menu, .toggle', {duration: 0.7,opacity: 0,});
    tl.from('.accueil__text__top, .accueil__text__mid, .accueil__text__bot', {duration: 0.5,opacity: 0,});
    tl.from('.accueil__text__top .sep', {duration: 0.7,width: '0px',});
  } else
  {
    // GSAP absent : on ignore silencieusement
  }
});


// --- Mettre à jour l'année dans le footer ---
const yearEl = document.getElementById('year');
if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}
