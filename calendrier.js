/* =========================================================
   Calendrier ICS 
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
(function(){
  'use strict';

  /* =======================================================
     Références DOM (obligatoires)
     ======================================================= */
  const grid   = document.getElementById('calGrid');
  const titleN = document.getElementById('calTitle');
  const alertN = document.getElementById('calAlert');
  const prev   = document.getElementById('calPrev');
  const next   = document.getElementById('calNext');

  if (!grid || !titleN) {
    console.error('[Calendrier] #calGrid ou #calTitle introuvable(s).');
    return;
  }
  if (typeof window.ICAL === 'undefined') {
    console.error('[Calendrier] ical.js non chargé (window.ICAL undefined).');
    if (alertN) { alertN.textContent = 'Erreur : ical.js non chargé.'; alertN.classList.add('show'); }
    return;
  }

  /* =======================================================
     État & formatters
     ======================================================= */
  const locale = 'fr-FR';
  const monthFormatter = new Intl.DateTimeFormat(locale,{month:'long',year:'numeric'});
  const timeFormatter  = new Intl.DateTimeFormat(locale,{hour:'2-digit',minute:'2-digit'});

  const state = {
    currentMonth: startOfMonth(new Date()),
    eventsCache: null,   // { groups: Map, singles: Array }
    eventsByDay: new Map()
  };

  /* =======================================================
     Helpers dates
     ======================================================= */
  function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
  function addMonths(d,n){ return new Date(d.getFullYear(), d.getMonth()+n, 1); }
  function isSameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
  function dateKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function windowRange(base){
    const viewStart = new Date(base.getFullYear(), base.getMonth()-1, 1);
    const viewEnd   = new Date(base.getFullYear(), base.getMonth()+2, 0, 23,59,59,999);
    return {viewStart, viewEnd};
  }

  /* =======================================================
     Timezones (alias Windows → IANA)
     ======================================================= */
  function registerTzAliases(){
    if (!ICAL.TimezoneService) return;
    const TZ_ALIASES = {
      'Romance Standard Time': 'Europe/Paris',
      'W. Europe Standard Time': 'Europe/Berlin',
      'Central European Standard Time': 'Europe/Warsaw',
    };
    for (const [win, iana] of Object.entries(TZ_ALIASES)) {
      try {
        const zone = ICAL.TimezoneService.get(iana);
        if (zone) ICAL.TimezoneService.register(win, zone);
      } catch(e){ /* noop */ }
    }
  }

  /* =======================================================
     Parsing / Indexation ICS
     ======================================================= */
  function occKeyFromICALTime(t){
    if(!t) return '';
    const pad = n => String(n).padStart(2,'0');
    if (t.isDate) return `D${t.year}${pad(t.month)}${pad(t.day)}`;
    return `T${t.toUnixTime()}`;
  }
  function ensureBucket(map, d){ const k=dateKey(d); if(!map.has(k)) map.set(k, []); return k; }
  function durMsFrom(ev){
    if(ev.duration) return ev.duration.toSeconds()*1000;
    if(ev.startDate && ev.endDate) return (ev.endDate.toUnixTime()-ev.startDate.toUnixTime())*1000;
    return 0;
  }
  function pushSpan(targetMap, s, e, payload, viewStart, viewEnd){
    const d0 = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    const d1 = new Date(e.getFullYear(), e.getMonth(), e.getDate());
    for(let d=new Date(d0); d<=d1; d.setDate(d.getDate()+1)){
      if(d<viewStart || d>viewEnd) continue;
      const k = ensureBucket(targetMap, d);
      targetMap.get(k).push({...payload, _isContinuation: !isSameDay(d, d0)});
    }
  }
  function buildIndexFromGroups(groups, singles){
    const map = new Map();
    const {viewStart, viewEnd} = windowRange(state.currentMonth);

    for(const g of groups.values()){
      const master = g.master; const exceptions = g.exceptions||[];
      if(!master) continue;

      // Exceptions indexées par occurrence
      const exMap = new Map();
      for (const ex of exceptions) {
        let ridTime = null;
        const ridProp = ex.component && ex.component.getFirstProperty('recurrence-id');
        if (ridProp) ridTime = ridProp.getFirstValue();
        else if (ex.recurrenceId) ridTime = ex.recurrenceId;
        if (ridTime) exMap.set(occKeyFromICALTime(ridTime), ex);
      }

      const exp = master.iterator();
      const masterDur = durMsFrom(master);
      const seen = new Set();
      let next;

      while((next = exp.next())){
        const js = next.toJSDate();
        if(js > viewEnd) break;
        if(js < viewStart) continue;
        const key = occKeyFromICALTime(next);
        seen.add(key);

        const use = exMap.get(key) || null;
        if(use){
          const s = use.startDate.toJSDate();
          const e = use.endDate ? use.endDate.toJSDate() : new Date(s.getTime()+masterDur);
          pushSpan(map, s, e, {summary: use.summary, dtstart: s, dtend: e, location: use.location, description: use.description}, viewStart, viewEnd);
        }else{
          const e = new Date(js.getTime()+masterDur);
          pushSpan(map, js, e, {summary: master.summary, dtstart: js, dtend: e, location: master.location, description: master.description}, viewStart, viewEnd);
        }
      }

      // Gestion explicite de UNTIL si non vu par l'itérateur
      const rrule = master.component.getFirstPropertyValue('rrule');
      if(rrule && rrule.until){
        const uKey = occKeyFromICALTime(rrule.until);
        if(!seen.has(uKey)){
          const use = exMap.get(uKey) || null;
          const uj = rrule.until.toJSDate();
          if(uj >= viewStart && uj <= viewEnd){
            if(use){
              const s = use.startDate.toJSDate();
              const e = use.endDate ? use.endDate.toJSDate() : new Date(s.getTime()+masterDur);
              pushSpan(map, s, e, {summary:use.summary, dtstart:s, dtend:e, location:use.location, description:use.description}, viewStart, viewEnd);
            }else{
              const e = new Date(uj.getTime()+masterDur);
              pushSpan(map, uj, e, {summary:master.summary, dtstart:uj, dtend:e, location:master.location, description:master.description}, viewStart, viewEnd);
            }
          }
        }
      }
    }

    for(const s of singles){
      const js = s.startDate.toJSDate();
      const je = s.endDate ? s.endDate.toJSDate() : js;
      const {viewStart, viewEnd} = windowRange(state.currentMonth);
      if(je < viewStart || js > viewEnd) continue;
      pushSpan(map, js, je, {summary:s.summary, dtstart:js, dtend:je, location:s.location, description:s.description}, viewStart, viewEnd);
    }

    for (const arr of map.values()) arr.sort((a,b)=>a.dtstart-b.dtstart);
    state.eventsByDay = map;
  }

  /* =======================================================
     Chargement ICS (avec fallback de chemins) + cache
     ======================================================= */
  async function fetchIcsWithFallback() {
    const candidates = ['/calendrier_promo.ics','calendrier_promo.ics'];
    for (const url of candidates) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        console.log('[Calendrier] ICS status', url, res.status);
        if (res.ok) return res.text();
      } catch (e) { console.warn('[Calendrier] fetch fail', url, e); }
    }
    throw new Error("Aucun des chemins ICS n'a répondu (404/erreur réseau).");
  }

  async function ensureEventsLoaded(force=false){
    if (!force && state.eventsCache) return state.eventsCache;
    alertN?.classList.remove('show');
    registerTzAliases();
    const text = await fetchIcsWithFallback();
    const jcal = ICAL.parse(text);
    const comp = new ICAL.Component(jcal);
    const vevents = comp.getAllSubcomponents('vevent').map(v=> new ICAL.Event(v));

    const groups = new Map();
    const singles = [];
    for(const ev of vevents){
      const uid = ev.uid || (ev.component && ev.component.getFirstPropertyValue('uid')) || Math.random().toString(36).slice(2);
      const isExc = ev.isRecurrenceException && ev.isRecurrenceException();
      const isRec = ev.isRecurring && ev.isRecurring();
      if(isExc){
        if(!groups.has(uid)) groups.set(uid, {master:null, exceptions:[]});
        groups.get(uid).exceptions.push(ev);
      }else if(isRec){
        if(!groups.has(uid)) groups.set(uid, {master:null, exceptions:[]});
        if(!groups.get(uid).master) groups.get(uid).master = ev;
      }else{
        singles.push(ev);
      }
    }
    state.eventsCache = {groups, singles};
    return state.eventsCache;
  }

  /* =======================================================
     Accès & rendu
     ======================================================= */
  function eventsForDay(day){ return state.eventsByDay.get(dateKey(day)) || []; }

  function renderCalendar(){
    titleN.textContent = monthFormatter.format(state.currentMonth).toUpperCase();
    grid.innerHTML = '';

    const start = startOfMonth(state.currentMonth);
    const startDay = (start.getDay()+6)%7; // Lundi=0
    const today = new Date();

    const firstDisplayed = new Date(start);
    firstDisplayed.setDate(start.getDate() - startDay);

    const lastDisplayed = new Date(firstDisplayed);
    lastDisplayed.setDate(firstDisplayed.getDate() + 34); // 35 cases

    const frag = document.createDocumentFragment();

    for (let d = new Date(firstDisplayed); d <= lastDisplayed; d.setDate(d.getDate()+1)) {
      const inMonth = d.getMonth() === state.currentMonth.getMonth();
      const cell = document.createElement('div');
      cell.className = 'cal__day' + (inMonth ? '' : ' out');
      if (isSameDay(d, today)) cell.classList.add('today');
      cell.dataset.date = d.toISOString();

      const badge = document.createElement('div');
      badge.className = 'cal__badge';
      badge.textContent = d.getDate();
      cell.appendChild(badge);

      const evs = eventsForDay(d);
      const list = document.createElement('div');
      list.className = 'cal__events';
      if (evs.length) {
        cell.classList.add('has-events');
        for (const ev of evs) {
          const row = document.createElement('div');
          row.className = 'cal__chip' + (ev._isContinuation ? ' multi' : '');
          const t0 = ev.dtstart ? timeFormatter.format(ev.dtstart) : '';
          row.innerHTML = (t0 ? `<span class="t">${t0}</span>` : '') + `<span class="s">${ev.summary || ''}</span>`;
          row.dataset.time = t0 || '';
          row.dataset.title = ev.summary || '';
          row.title = (t0 ? `${t0} — ` : '') + (ev.summary || '');
          list.appendChild(row);
        }
      }
      cell.appendChild(list);
      frag.appendChild(cell);
    }

    grid.appendChild(frag);
    adaptDayLayouts();
  }

  /* =======================================================
     Responsive chips
     ======================================================= */
  function emojiFor(title){
    const t = (title || '').toLowerCase();
    if (t.includes('bnssa')) return '🏊';
    if (t.includes('océan') || t.includes('ocean')) return '🌊';
    if (t.includes('secours')) return '🚑';
    if (t.includes('réunion')) return '📣';
    if (t.includes('ppg')) return '🏋️';
    if (t.includes('pilotage') || t.includes('embarcation')) return '🛶';
    return '📌';
  }
  function adaptOneDayCell(day){
    const evs = day.querySelectorAll('.cal__chip');
    if (!evs.length) { day.classList.remove('compact','icon'); return; }

    const rect = day.getBoundingClientRect();
    const badge = day.querySelector('.cal__badge');
    const badgeH = badge ? badge.getBoundingClientRect().height : 18;
    const available = rect.height - badgeH - 10;
    const manyEvents = evs.length >= 4;

    day.classList.remove('compact','icon');

    if (available < 70 || manyEvents) {
      day.classList.add('icon');
      evs.forEach((chip, i) => {
        const emoji = emojiFor(chip.dataset.title);
        chip.textContent = emoji;
        chip.title = chip.dataset.time ? `${chip.dataset.time} — ${chip.dataset.title}` : chip.dataset.title;
        chip.style.display = (i > 2 ? 'none' : '');
      });
      return;
    }

    if (available < 92) {
      day.classList.add('compact');
      evs.forEach(chip => {
        chip.innerHTML = chip.dataset.time ? `<span class="t">${chip.dataset.time}</span>` : '•';
        chip.title = chip.dataset.title ? `${chip.dataset.time || ''} ${chip.dataset.title}`.trim() : chip.title;
        chip.style.display = '';
      });
      return;
    }

    evs.forEach(chip => {
      chip.innerHTML = (chip.dataset.time ? `<span class="t">${chip.dataset.time}</span>` : '') + `<span class="s">${chip.dataset.title}</span>`;
      chip.style.display = '';
    });
  }
  function adaptDayLayouts(){
    // Mieux scoper : on parcourt les cases du grid courant
    grid.querySelectorAll('.cal__day').forEach(adaptOneDayCell);
  }

  /* =======================================================
     Modal & scroll lock
     ======================================================= */
  function lock(){ document.documentElement.classList.add('alb-noscroll'); document.body.classList.add('alb-noscroll'); }
  function unlock(){ document.documentElement.classList.remove('alb-noscroll'); document.body.classList.remove('alb-noscroll'); }

  function openModalForDate(dateISO){
    const modal=document.getElementById('eventModal');
    const body=document.getElementById('modalBody');
    const title=document.getElementById('modalTitle');
    if(!dateISO || !modal || !body || !title) return;

    const d=new Date(dateISO);
    const evs=eventsForDay(d);
    title.textContent = d.toLocaleDateString(locale, {weekday:'long', day:'2-digit', month:'long', year:'numeric'}).toUpperCase();
    body.innerHTML='';
    if(!evs.length){
      body.innerHTML='<div class="cal__meta">Aucun évènement</div>';
    }else{
      for(const ev of evs){
        const card=document.createElement('div'); card.className='cal__card';
        const h=document.createElement('h4'); h.textContent=ev.summary||'(Sans titre)';
        const meta=document.createElement('div'); meta.className='cal__meta';
        const t0 = ev.dtstart ? timeFormatter.format(ev.dtstart) : '';
        const t1 = ev.dtend? ' – '+timeFormatter.format(ev.dtend):'';
        meta.textContent = (t0?t0:'')+(t1?t1:'')+(ev.location?`\n${ev.location}`:'');
        const extra=document.createElement('div'); extra.className='cal__meta'; extra.textContent = ev.description||'';
        card.append(h, meta, extra); body.appendChild(card);
      }
    }
    modal.classList.add('show');
    modal.setAttribute('aria-hidden','false');
    lock();
  }
  function closeModal(){
    const modal=document.getElementById('eventModal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden','true');
    unlock();
  }

  /* =======================================================
     UI bindings
     ======================================================= */
  prev?.addEventListener('click', async ()=>{ state.currentMonth=addMonths(state.currentMonth,-1); await rebuildAndRender(false); });
  next?.addEventListener('click', async ()=>{ state.currentMonth=addMonths(state.currentMonth, 1); await rebuildAndRender(false); });

  grid.addEventListener('click', (e)=>{
    const day = e.target.closest('.cal__day');
    if(!day) return;
    openModalForDate(day.dataset.date);
  });

  const modalClose = document.getElementById('modalClose');
  modalClose?.addEventListener('click', closeModal);
  document.getElementById('eventModal')?.addEventListener('click', (e)=>{ if(e.target.id==='eventModal') closeModal(); });
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeModal(); });

  window.addEventListener('resize', adaptDayLayouts);
  new ResizeObserver(adaptDayLayouts).observe(grid);

  /* =======================================================
     Orchestration
     ======================================================= */
  async function rebuildAndRender(forceFetch){
    try{
      const {groups, singles} = await ensureEventsLoaded(Boolean(forceFetch));
      buildIndexFromGroups(groups, singles);
      renderCalendar();
    }catch(e){
      console.error(e);
      if (alertN) {
        alertN.textContent = 'Impossible de charger le calendrier : ' + e.message;
        alertN.classList.add('show');
      }
    }
  }

  // Initialisation
  rebuildAndRender(true);

})();
});
