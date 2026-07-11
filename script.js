(function(){
  "use strict";

  const RING_CIRCUMFERENCE = 2 * Math.PI * 96;
  const COLORS = ['#8B7FFF','#FFB454','#FF6B9D','#4FD9C7','#6FCF97','#FF8A5C','#5CA8FF','#D68CFF'];
  const EMOJIS = ['🎯','🎂','🎉','🚀','💍','🎓','📅','⏰','❤️','🏆','✈️','🎮','💼','🏡','🎵','🌱'];
  const CATEGORIES = {
    Personal:'#8B7FFF', Work:'#5CA8FF', Celebration:'#FFB454',
    Travel:'#4FD9C7', Deadline:'#FF6B9D', Health:'#6FCF97', Other:'#9C93B5'
  };
  const MILESTONE_DAYS = [30, 7, 1]; // days-remaining thresholds that trigger a toast

  const $ = (id) => document.getElementById(id);

  const state = {
    events: [],
    featuredId: null,
    search: '',
    sort: 'soonest',
    category: 'All',
    view: localStorage.getItem('tminus_view') || 'grid'
  };

  // ---------------- Persistence ----------------
  function load(){
    try{ state.events = JSON.parse(localStorage.getItem('tminus_events') || '[]'); }
    catch(e){ state.events = []; }
    state.featuredId = localStorage.getItem('tminus_featured') || null;
    // Backfill emoji for events saved before this feature existed
    state.events.forEach(ev => {
      if(!ev.emoji) ev.emoji = '🎯';
      if(!ev.category) ev.category = 'Other';
      if(ev.notes === undefined) ev.notes = '';
      if(!ev._milestonesFired) ev._milestonesFired = [];
    });
    primeCelebrationFlags();
  }
  function save(){
    localStorage.setItem('tminus_events', JSON.stringify(state.events));
    if(state.featuredId) localStorage.setItem('tminus_featured', state.featuredId);
    else localStorage.removeItem('tminus_featured');
  }

  function primeCelebrationFlags(){
    // Prevents confetti/notifications firing for events that were already
    // in the past the first time this page ever loads them.
    state.events.forEach(ev=>{
      if(ev._celebrated === undefined){
        ev._celebrated = eventMode(ev) === 'elapsed';
      }
    });
  }

  // ---------------- Toast ----------------
  const toastEl = $('toast');
  function toast(msg){
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(()=>toastEl.classList.remove('show'), 2800);
  }

  // ---------------- Theme ----------------
  function applyTheme(t){
    document.body.classList.toggle('light', t === 'light');
    localStorage.setItem('tminus_theme', t);
    $('theme-icon').innerHTML = t === 'light'
      ? '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2 12h2.4M19.6 12H22M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7"/>'
      : '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>';
  }
  $('theme-toggle').addEventListener('click', ()=>{
    const isLight = document.body.classList.contains('light');
    applyTheme(isLight ? 'dark' : 'light');
  });

  // ---------------- Starfield background ----------------
  (function starfield(){
    const canvas = $('starfield');
    const ctx = canvas.getContext('2d');
    let stars = [];
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function resize(){
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const count = Math.round((canvas.width * canvas.height) / 9000);
      stars = Array.from({length: count}, () => ({
        x: Math.random()*canvas.width,
        y: Math.random()*canvas.height,
        r: Math.random()*1.3 + 0.3,
        phase: Math.random()*Math.PI*2,
        speed: Math.random()*0.02 + 0.005
      }));
    }
    window.addEventListener('resize', resize);
    resize();

    function draw(t){
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = '#EDEFF7';
      stars.forEach(s=>{
        const twinkle = reduceMotion ? 0.6 : (Math.sin(t*s.speed + s.phase)*0.35 + 0.5);
        ctx.globalAlpha = Math.max(0.1, twinkle);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  })();

  // ---------------- Sound chime ----------------
  function playChime(){
    try{
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
      notes.forEach((freq, i)=>{
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const start = ctx.currentTime + i*0.12;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.4);
      });
    }catch(e){ /* audio not available */ }
  }

  // ---------------- Celebration overlay ----------------
  const celebrateBackdrop = $('celebrate-backdrop');
  function showCelebration(ev){
    $('celebrate-emoji').textContent = ev.emoji || '🎉';
    $('celebrate-name').textContent = ev.name;
    celebrateBackdrop.classList.add('show');
  }
  $('celebrate-close').addEventListener('click', ()=> celebrateBackdrop.classList.remove('show'));
  celebrateBackdrop.addEventListener('click', (e)=>{ if(e.target===celebrateBackdrop) celebrateBackdrop.classList.remove('show'); });

  // ---------------- Confetti ----------------
  function fireConfetti(){
    const canvas = $('confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.display = 'block';

    const particles = Array.from({length: 140}, () => ({
      x: Math.random()*canvas.width,
      y: -20 - Math.random()*canvas.height*0.3,
      vx: (Math.random()-0.5)*3,
      vy: Math.random()*2 + 2,
      size: Math.random()*7 + 4,
      color: COLORS[Math.floor(Math.random()*COLORS.length)],
      rot: Math.random()*360,
      vr: (Math.random()-0.5)*10,
      life: 1
    }));

    let frame = 0;
    function step(){
      frame++;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      let alive = false;
      particles.forEach(p=>{
        p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.rot += p.vr;
        if(frame > 130) p.life -= 0.03;
        if(p.life > 0 && p.y < canvas.height + 30){
          alive = true;
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot * Math.PI/180);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size*0.6);
          ctx.restore();
        }
      });
      if(alive && frame < 260){
        requestAnimationFrame(step);
      } else {
        canvas.style.display = 'none';
      }
    }
    requestAnimationFrame(step);
  }

  // ---------------- Add to calendar (.ics) ----------------
  function toICSDate(d){
    return d.toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';
  }
  function downloadICS(ev){
    const start = new Date(ev.target);
    const end = new Date(start.getTime() + 60*60*1000); // 1hr block
    const lines = [
      'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//T-Minus//Countdown//EN',
      'BEGIN:VEVENT',
      'UID:' + ev.id + '@tminus',
      'DTSTAMP:' + toICSDate(new Date()),
      'DTSTART:' + toICSDate(start),
      'DTEND:' + toICSDate(end),
      'SUMMARY:' + ev.name.replace(/\r?\n/g,' '),
    ];
    if(ev.notes) lines.push('DESCRIPTION:' + ev.notes.replace(/\r?\n/g,'\\n'));
    if(ev.repeat) lines.push('RRULE:FREQ=YEARLY');
    lines.push('END:VEVENT','END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n')], {type:'text/calendar'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = ev.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase() + '.ics';
    a.click();
    URL.revokeObjectURL(url);
    toast('Calendar file downloaded');
  }

  // ---------------- Shareable link ----------------
  function b64EncodeUnicode(str){
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (m,p1)=>String.fromCharCode('0x'+p1)));
  }
  function b64DecodeUnicode(str){
    return decodeURIComponent(atob(str).split('').map(c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join(''));
  }
  async function shareEvent(ev){
    const payload = {name:ev.name, target:ev.target, color:ev.color, emoji:ev.emoji, category:ev.category, repeat:ev.repeat, notes:ev.notes};
    const encoded = b64EncodeUnicode(JSON.stringify(payload));
    const url = location.origin + location.pathname + '?shared=' + encoded;
    try{
      await navigator.clipboard.writeText(url);
      toast('Shareable link copied to clipboard');
    }catch(e){
      prompt('Copy this link:', url);
    }
  }
  function checkIncomingShare(){
    const params = new URLSearchParams(location.search);
    const shared = params.get('shared');
    if(!shared) return;
    try{
      const payload = JSON.parse(b64DecodeUnicode(shared));
      if(payload && payload.name && payload.target){
        const when = fmtFullDate(payload.target);
        if(confirm(`Add shared countdown "${payload.name}" (${when}) to your list?`)){
          const ev = {
            id: 'ev_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
            name: payload.name, target: payload.target, color: payload.color || COLORS[0],
            emoji: payload.emoji || '🎯', category: payload.category || 'Other',
            repeat: !!payload.repeat, notify: false, notes: payload.notes || '',
            createdAt: new Date().toISOString(), _milestonesFired: []
          };
          ev._celebrated = eventMode(ev) === 'elapsed';
          state.events.push(ev);
          state.featuredId = ev.id;
          save();
          toast('Shared countdown added');
        }
      }
    }catch(e){ /* malformed link, ignore */ }
    history.replaceState(null, '', location.pathname);
  }

  // ---------------- Time math ----------------
  function targetDate(ev){
    let d = new Date(ev.target);
    if(ev.repeat){
      const now = new Date();
      while(d.getTime() < now.getTime()){
        d = new Date(d.getFullYear()+1, d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
      }
    }
    return d;
  }

  function eventMode(ev){
    if(ev.repeat) return 'countdown';
    return targetDate(ev).getTime() <= Date.now() ? 'elapsed' : 'countdown';
  }

  function diffParts(target, mode){
    const now = Date.now();
    let ms = mode === 'elapsed' ? (now - target.getTime()) : (target.getTime() - now);
    const expired = mode === 'countdown' && ms <= 0;
    ms = Math.max(0, ms);
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return {days, hours, mins, secs, expired};
  }

  function pad(n){ return String(n).padStart(2,'0'); }
  function fmtFullDate(iso){
    const d = new Date(iso);
    return d.toLocaleDateString('en-US',{weekday:'long', year:'numeric', month:'long', day:'numeric'}) + ' · ' +
           d.toLocaleTimeString('en-US',{hour:'numeric', minute:'2-digit'});
  }
  function fmtShortDate(iso){
    const d = new Date(iso);
    return d.toLocaleDateString('en-US',{month:'short', day:'numeric', year:'numeric'}) + ', ' +
           d.toLocaleTimeString('en-US',{hour:'numeric', minute:'2-digit'});
  }
  function escapeHtml(s){
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // ---------------- Rendering: grid ----------------
  function getFilteredSorted(){
    let list = [...state.events];
    if(state.category !== 'All'){
      list = list.filter(ev => ev.category === state.category);
    }
    if(state.search.trim()){
      const q = state.search.trim().toLowerCase();
      list = list.filter(ev => ev.name.toLowerCase().includes(q));
    }
    if(state.sort === 'soonest'){
      list.sort((a,b)=> targetDate(a) - targetDate(b));
    } else if(state.sort === 'name'){
      list.sort((a,b)=> a.name.localeCompare(b.name));
    } else if(state.sort === 'recent'){
      list.sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt));
    }
    return list;
  }

  function renderGrid(){
    const grid = $('grid');
    const countSub = $('count-sub');
    grid.className = 'grid' + (state.view === 'list' ? ' list-view' : '');
    grid.innerHTML = '';
    renderCategoryChips();

    if(state.events.length === 0){
      grid.innerHTML = `<div class="empty-grid-note">No countdowns yet. Use "New countdown" to add one.</div>`;
      countSub.textContent = '';
      return;
    }

    const list = getFilteredSorted();
    countSub.textContent = list.length + '/' + state.events.length + (state.events.length===1 ? ' countdown' : ' countdowns');

    if(list.length === 0){
      grid.innerHTML = `<div class="empty-grid-note">No countdowns match "${escapeHtml(state.search)}".</div>`;
      return;
    }

    list.forEach(ev=>{
      const mode = eventMode(ev);
      const t = targetDate(ev);
      const d = diffParts(t, mode);
      const isFeatured = ev.id === state.featuredId;
      const created = new Date(ev.createdAt).getTime();
      const total = t.getTime() - created;
      const elapsed = Date.now() - created;
      const pct = mode === 'elapsed' ? 100 : (total > 0 ? Math.min(100, Math.max(0, (elapsed/total)*100)) : 100);

      const card = document.createElement('div');
      card.className = 'card' + (isFeatured ? ' featured' : '');
      card.style.setProperty('--accent', ev.color);
      card.dataset.id = ev.id;

      card.innerHTML = `
        <div class="card-accent"></div>
        <div class="card-top">
          <div>
            <div class="card-name"${ev.notes ? ` title="${escapeHtml(ev.notes)}"` : ''}><span>${ev.emoji}</span>${escapeHtml(ev.name)}</div>
            <div class="card-date">${fmtShortDate(ev.target)}</div>
          </div>
          <div class="card-actions">
            <button class="icon-btn card-dup" title="Duplicate">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button class="icon-btn card-edit" title="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </button>
            <button class="icon-btn card-delete" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg>
            </button>
          </div>
        </div>
        <div class="card-digits">
          <div class="card-digit"><div class="n">${d.days}</div><div class="l">Days</div></div>
          <div class="card-digit"><div class="n">${pad(d.hours)}</div><div class="l">Hrs</div></div>
          <div class="card-digit"><div class="n">${pad(d.mins)}</div><div class="l">Min</div></div>
          <div class="card-digit"><div class="n">${pad(d.secs)}</div><div class="l">Sec</div></div>
        </div>
        <div class="card-progress"><div class="card-progress-fill" style="width:${pct}%"></div></div>
        <div class="card-badge">
          <span class="tag category"><span class="dot" style="background:${CATEGORIES[ev.category] || CATEGORIES.Other}"></span>${ev.category}</span>
          ${mode==='elapsed' ? '<span class="tag elapsed">↑ time since</span>' : ''}
          ${ev.repeat ? '<span class="tag repeat">↻ yearly</span>' : ''}
          ${ev.notify ? '<span class="tag">🔔 notify</span>' : ''}
        </div>
      `;

      card.addEventListener('click', (e)=>{
        if(e.target.closest('.card-edit') || e.target.closest('.card-delete') || e.target.closest('.card-dup')) return;
        setFeatured(ev.id);
      });
      card.querySelector('.card-edit').addEventListener('click', (e)=>{ e.stopPropagation(); openModal(ev); });
      card.querySelector('.card-delete').addEventListener('click', (e)=>{ e.stopPropagation(); deleteEvent(ev.id); });
      card.querySelector('.card-dup').addEventListener('click', (e)=>{ e.stopPropagation(); duplicateEvent(ev.id); });

      grid.appendChild(card);
    });
  }

  // ---------------- Rendering: hero ----------------
  function pickFeaturedEvent(){
    if(state.events.length===0) return null;
    let ev = state.events.find(e => e.id === state.featuredId);
    if(!ev){
      const sorted = [...state.events].sort((a,b)=> targetDate(a) - targetDate(b));
      ev = sorted[0];
      state.featuredId = ev.id;
      save();
    }
    return ev;
  }

  function renderHero(){
    const ev = pickFeaturedEvent();
    const heroEmpty = $('hero-empty');
    const heroContent = $('hero-content');

    if(!ev){
      heroEmpty.classList.remove('hidden');
      heroContent.classList.add('hidden');
      return;
    }
    heroEmpty.classList.add('hidden');
    heroContent.classList.remove('hidden');

    const mode = eventMode(ev);
    const t = targetDate(ev);
    const d = diffParts(t, mode);
    const created = new Date(ev.createdAt).getTime();
    const total = t.getTime() - created;
    const elapsed = Date.now() - created;
    const pct = mode === 'elapsed' ? 100 : (total > 0 ? Math.min(100, Math.max(0, (elapsed/total)*100)) : 100);

    $('hero-emoji').textContent = ev.emoji;
    $('hero-eyebrow').textContent = mode === 'elapsed' ? 'Counting up since' : 'Featured countdown';
    $('hero-name').textContent = ev.name;
    $('hero-date').textContent = fmtFullDate(ev.target) + (ev.repeat ? '  ·  repeats yearly' : '');
    $('hero-notes').textContent = ev.notes || '';

    const ringFill = $('hero-ring-fill');
    ringFill.style.stroke = ev.color;
    ringFill.style.strokeDashoffset = RING_CIRCUMFERENCE - (pct/100)*RING_CIRCUMFERENCE;
    $('hero-pct').textContent = mode === 'elapsed' ? '∞' : Math.round(pct) + '%';
    $('hero-ring-label').textContent = mode === 'elapsed' ? 'ongoing' : 'elapsed';

    updateDigit('d-days', d.days);
    updateDigit('d-hours', pad(d.hours));
    updateDigit('d-mins', pad(d.mins));
    updateDigit('d-secs', pad(d.secs));
  }

  function updateDigit(id, value){
    const el = $(id);
    const strVal = String(value);
    if(el.textContent !== strVal){
      el.textContent = strVal;
      el.classList.remove('tick');
      void el.offsetWidth;
      el.classList.add('tick');
    }
  }

  // ---------------- Featured / CRUD ----------------
  function setFeatured(id){
    state.featuredId = id;
    save();
    renderHero();
    renderGrid();
  }

  function deleteEvent(id){
    const ev = state.events.find(e=>e.id===id);
    if(!ev) return;
    if(!confirm(`Delete "${ev.name}"?`)) return;
    state.events = state.events.filter(e=>e.id!==id);
    if(state.featuredId === id) state.featuredId = null;
    save();
    renderHero();
    renderGrid();
    toast('Deleted');
  }

  function duplicateEvent(id){
    const ev = state.events.find(e=>e.id===id);
    if(!ev) return;
    const copy = Object.assign({}, ev, {
      id: 'ev_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
      name: ev.name + ' (copy)',
      createdAt: new Date().toISOString(),
      _milestonesFired: [],
      _celebrated: eventMode(ev) === 'elapsed'
    });
    state.events.push(copy);
    save();
    renderGrid();
    toast('Duplicated');
  }

  // ---------------- Modal ----------------
  const backdrop = $('modal-backdrop');
  const form = $('event-form');
  let editingId = null;
  let selectedEmoji = EMOJIS[0];

  function buildEmojiPicker(selected){
    selectedEmoji = selected;
    const wrap = $('emoji-picker');
    wrap.innerHTML = '';
    EMOJIS.forEach(em=>{
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emoji-btn' + (em===selected ? ' selected' : '');
      btn.textContent = em;
      btn.addEventListener('click', ()=>{
        wrap.querySelectorAll('.emoji-btn').forEach(b=>b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedEmoji = em;
      });
      wrap.appendChild(btn);
    });
  }

  function buildSwatches(selected){
    const wrap = $('swatches');
    wrap.innerHTML = '';
    COLORS.forEach(c=>{
      const sw = document.createElement('div');
      sw.className = 'swatch' + (c===selected ? ' selected' : '');
      sw.style.background = c;
      sw.dataset.color = c;
      sw.addEventListener('click', ()=>{
        wrap.querySelectorAll('.swatch').forEach(s=>s.classList.remove('selected'));
        sw.classList.add('selected');
      });
      wrap.appendChild(sw);
    });
  }

  $('presets').addEventListener('click', (e)=>{
    const btn = e.target.closest('.preset-btn');
    if(!btn) return;
    document.querySelectorAll('.preset-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const base = new Date();
    if(btn.dataset.days) base.setDate(base.getDate() + parseInt(btn.dataset.days,10));
    if(btn.dataset.months) base.setMonth(base.getMonth() + parseInt(btn.dataset.months,10));
    if(btn.dataset.years) base.setFullYear(base.getFullYear() + parseInt(btn.dataset.years,10));
    $('f-date').value = base.toISOString().slice(0,10);
  });

  function openModal(ev){
    editingId = ev ? ev.id : null;
    $('modal-title').textContent = ev ? 'Edit countdown' : 'New countdown';
    $('modal-save').textContent = ev ? 'Save changes' : 'Save countdown';
    document.querySelectorAll('.preset-btn').forEach(b=>b.classList.remove('active'));

    if(ev){
      const t = new Date(ev.target);
      $('f-name').value = ev.name;
      $('f-date').value = t.toISOString().slice(0,10);
      $('f-time').value = t.toTimeString().slice(0,5);
      $('f-repeat').checked = !!ev.repeat;
      $('f-notify').checked = !!ev.notify;
      $('f-category').value = ev.category || 'Other';
      $('f-notes').value = ev.notes || '';
      buildSwatches(ev.color);
      buildEmojiPicker(ev.emoji);
    } else {
      form.reset();
      $('f-time').value = '09:00';
      $('f-notify').checked = true;
      $('f-category').value = 'Personal';
      const tomorrow = new Date(Date.now() + 86400000);
      $('f-date').value = tomorrow.toISOString().slice(0,10);
      buildSwatches(COLORS[state.events.length % COLORS.length]);
      buildEmojiPicker(EMOJIS[state.events.length % EMOJIS.length]);
    }
    backdrop.classList.add('open');
    setTimeout(()=>$('f-name').focus(), 50);
  }
  function closeModal(){
    backdrop.classList.remove('open');
    editingId = null;
  }

  $('add-btn').addEventListener('click', ()=>openModal(null));
  $('hero-add-btn').addEventListener('click', ()=>openModal(null));
  $('modal-close').addEventListener('click', closeModal);
  $('modal-cancel').addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e)=>{ if(e.target===backdrop) closeModal(); });
  document.addEventListener('keydown', (e)=>{
    if(e.key==='Escape' && backdrop.classList.contains('open')) closeModal();
    if(e.key.toLowerCase()==='n' && !backdrop.classList.contains('open') && document.activeElement.tagName!=='INPUT'){
      openModal(null);
    }
  });

  $('hero-edit').addEventListener('click', ()=>{ const ev = pickFeaturedEvent(); if(ev) openModal(ev); });
  $('hero-delete').addEventListener('click', ()=>{ const ev = pickFeaturedEvent(); if(ev) deleteEvent(ev.id); });
  $('hero-ics').addEventListener('click', ()=>{ const ev = pickFeaturedEvent(); if(ev) downloadICS(ev); });
  $('hero-share').addEventListener('click', ()=>{ const ev = pickFeaturedEvent(); if(ev) shareEvent(ev); });

  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const name = $('f-name').value.trim();
    const date = $('f-date').value;
    const time = $('f-time').value || '00:00';
    if(!name || !date){ toast('Please fill in a name and date'); return; }

    const targetIso = new Date(`${date}T${time}:00`).toISOString();
    const selectedSwatch = document.querySelector('.swatch.selected');
    const color = selectedSwatch ? selectedSwatch.dataset.color : COLORS[0];
    const repeat = $('f-repeat').checked;
    const notify = $('f-notify').checked;
    const category = $('f-category').value;
    const notes = $('f-notes').value.trim();

    if(notify && 'Notification' in window && Notification.permission === 'default'){
      Notification.requestPermission();
    }

    if(editingId){
      const ev = state.events.find(e=>e.id===editingId);
      if(ev){
        const dateChanged = ev.target !== targetIso;
        ev.name = name; ev.target = targetIso; ev.color = color; ev.repeat = repeat; ev.notify = notify;
        ev.emoji = selectedEmoji; ev.category = category; ev.notes = notes;
        ev._celebrated = eventMode(ev) === 'elapsed';
        if(dateChanged) ev._milestonesFired = [];
      }
      toast('Countdown updated');
    } else {
      const ev = {
        id: 'ev_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
        name, target: targetIso, color, repeat, notify, emoji: selectedEmoji,
        category, notes,
        createdAt: new Date().toISOString(),
        _milestonesFired: []
      };
      ev._celebrated = eventMode(ev) === 'elapsed';
      state.events.push(ev);
      state.featuredId = ev.id;
      toast('Countdown added');
    }
    save();
    closeModal();
    renderHero();
    renderGrid();
    refreshNotifBanner();
  });

  // ---------------- Search, sort, category filter, view toggle ----------------
  $('search-input').addEventListener('input', (e)=>{
    state.search = e.target.value;
    renderGrid();
  });
  $('sort-select').addEventListener('change', (e)=>{
    state.sort = e.target.value;
    renderGrid();
  });

  function renderCategoryChips(){
    const wrap = $('category-chips');
    const used = ['All', ...Object.keys(CATEGORIES).filter(c => state.events.some(ev => ev.category === c))];
    wrap.innerHTML = '';
    used.forEach(cat=>{
      const chip = document.createElement('button');
      chip.className = 'chip' + (state.category === cat ? ' active' : '');
      chip.innerHTML = cat === 'All' ? 'All' : `<span class="dot" style="background:${CATEGORIES[cat]}"></span>${cat}`;
      chip.addEventListener('click', ()=>{
        state.category = cat;
        renderCategoryChips();
        renderGrid();
      });
      wrap.appendChild(chip);
    });
  }

  document.querySelectorAll('.view-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.view = btn.dataset.view;
      localStorage.setItem('tminus_view', state.view);
      document.querySelectorAll('.view-btn').forEach(b=>b.classList.toggle('active', b===btn));
      renderGrid();
    });
  });

  // ---------------- Export / Import ----------------
  $('export-btn').addEventListener('click', ()=>{
    const blob = new Blob([JSON.stringify(state.events, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tminus-backup-' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup downloaded');
  });

  $('import-btn').addEventListener('click', ()=> $('import-file').click());
  $('import-file').addEventListener('change', (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const imported = JSON.parse(reader.result);
        if(!Array.isArray(imported)) throw new Error('bad format');
        const validated = imported.filter(ev => ev && ev.name && ev.target).map(ev => ({
          id: ev.id || ('ev_' + Date.now() + '_' + Math.random().toString(36).slice(2,7)),
          name: ev.name,
          target: ev.target,
          color: ev.color || COLORS[0],
          emoji: ev.emoji || '🎯',
          category: ev.category || 'Other',
          notes: ev.notes || '',
          repeat: !!ev.repeat,
          notify: !!ev.notify,
          createdAt: ev.createdAt || new Date().toISOString(),
          _milestonesFired: [],
          _celebrated: true
        }));
        state.events = state.events.concat(validated);
        save();
        renderHero();
        renderGrid();
        toast(`Imported ${validated.length} countdown${validated.length===1?'':'s'}`);
      }catch(err){
        toast('Could not read that file — is it a valid T-Minus backup?');
      }
      $('import-file').value = '';
    };
    reader.readAsText(file);
  });

  // ---------------- Notifications + confetti on completion ----------------
  function checkNotifications(){
    let changed = false;
    state.events.forEach(ev=>{
      const mode = eventMode(ev);
      if(mode === 'elapsed' && !ev._celebrated){
        ev._celebrated = true;
        changed = true;
        fireConfetti();
        playChime();
        showCelebration(ev);
        if(ev.notify && 'Notification' in window && Notification.permission === 'granted'){
          try{ new Notification('🎉 ' + ev.name, {body:"It's here!", tag: ev.id}); }catch(e){}
        }
        toast(ev.emoji + ' "' + ev.name + '" has arrived!');
      } else if(mode === 'countdown'){
        const daysLeft = (targetDate(ev).getTime() - Date.now()) / 86400000;
        MILESTONE_DAYS.forEach(m=>{
          if(daysLeft <= m && !ev._milestonesFired.includes(m)){
            ev._milestonesFired.push(m);
            changed = true;
            toast(`${ev.emoji} ${m} day${m===1?'':'s'} left for "${ev.name}"`);
          }
        });
      }
    });
    if(changed) save();
  }

  // ---------------- Permission banner ----------------
  function refreshNotifBanner(){
    const banner = $('notif-banner');
    const hasNotifyEvents = state.events.some(ev => ev.notify);
    const supported = 'Notification' in window;
    const dismissed = sessionStorage.getItem('tminus_banner_dismissed') === '1';
    if(supported && hasNotifyEvents && Notification.permission === 'default' && !dismissed){
      banner.classList.add('show');
    } else {
      banner.classList.remove('show');
    }
  }
  $('notif-enable-btn').addEventListener('click', async ()=>{
    if('Notification' in window){
      const perm = await Notification.requestPermission();
      if(perm === 'granted') toast('Notifications enabled');
    }
    refreshNotifBanner();
  });
  $('notif-dismiss-btn').addEventListener('click', ()=>{
    sessionStorage.setItem('tminus_banner_dismissed', '1');
    refreshNotifBanner();
  });

  // ---------------- Tick loop ----------------
  function tick(){
    renderHero();
    renderGrid();
    checkNotifications();
  }

  // ---------------- Init ----------------
  applyTheme(localStorage.getItem('tminus_theme') || 'dark');
  load();
  checkIncomingShare();
  document.querySelectorAll('.view-btn').forEach(b=>b.classList.toggle('active', b.dataset.view===state.view));
  renderHero();
  renderGrid();
  refreshNotifBanner();
  setInterval(tick, 1000);

})();