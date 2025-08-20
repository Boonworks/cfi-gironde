(()=> {
  const qs=(s,e=document)=>e.querySelector(s);
  const qsa=(s,e=document)=>Array.from(e.querySelectorAll(s));
  const st={open:false,index:0,items:[],lightbox:null,lastActive:null};

  function mount(){
    const t=qs('#alb-tpl');
    const n=t.content.firstElementChild.cloneNode(true);
    document.body.appendChild(n);
    return n;
  }
  function getItems(g){
    return qsa('img.alb-item, img.album__item', g).map(img=>({
      href: img.currentSrc || img.src,
      caption: img.alt || '',
      el: img
    }));
  }
  function setImg(src){
    const img=qs('[data-alb-img]', st.lightbox);
    img.src=src; img.alt=st.items[st.index]?.caption||'';
  }
  function preload(src){ const i=new Image(); i.src=src; }

  function lock(){ document.documentElement.classList.add('alb-noscroll'); document.body.classList.add('alb-noscroll'); }
  function unlock(){ document.documentElement.classList.remove('alb-noscroll'); document.body.classList.remove('alb-noscroll'); }

  function openAt(g, i){
    if(!st.lightbox) st.lightbox = mount();
    st.items = getItems(g);
    if(!st.items.length) return;
    st.index = Math.max(0, Math.min(i, st.items.length-1));
    st.lastActive = document.activeElement;
    setImg(st.items[st.index].href);
    st.lightbox.hidden = false;
    lock();
    st.open = true;
    if(st.items[st.index+1]) preload(st.items[st.index+1].href);
  }
  function close(){
    if(!st.open) return;
    st.lightbox.hidden = true;
    unlock();
    st.open = false;
    if(st.lastActive?.focus) st.lastActive.focus({preventScroll:true});
  }
  function next(d=1){
    if(!st.open) return;
    st.index = (st.index + d + st.items.length) % st.items.length;
    setImg(st.items[st.index].href);
    if(st.items[st.index+1]) preload(st.items[st.index+1].href);
  }
  
//======================= Ouvrir depuis la vignette =======================
  document.addEventListener('click', e=>{
    const img=e.target.closest('img.alb-item, img.album__item');
    if(!img) return;
    const g=img.closest('.alb-gallery'); if(!g) return;
    e.preventDefault();
    const its=getItems(g);
    const i=its.findIndex(x=>x.el===img);
    openAt(g, i);
  }, {passive:false});

//======================= Clic image => suivante =======================
  document.addEventListener('click', e=>{
    if(!st.open) return;
    if(e.target === qs('[data-alb-img]', st.lightbox)) next(1);
  });

//======================= Clic fond => fermer =======================
  document.addEventListener('click', e=>{
    if(!st.open) return;
    if(e.target.classList.contains('alb-backdrop') || e.target.dataset.albClose!==undefined) close();
  });

//======================= Clavier =======================
  document.addEventListener('keydown', e=>{
    if(!st.open) return;
    if(e.key==='Escape'){ e.preventDefault(); close(); }
    else if(e.key==='ArrowRight'){ e.preventDefault(); next(1); }
    else if(e.key==='ArrowLeft'){ e.preventDefault(); next(-1); }
    else if(e.code==='Space'){ e.preventDefault(); next(1); }
  });
})();
