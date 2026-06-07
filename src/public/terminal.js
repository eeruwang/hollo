/* 홀로 포크 — shared shell: clock · j/k selection · action toggles · command palette · reaction picker
 * NOTE: the design's peek drawer was wired to a hardcoded REPLIES fixture
 * (mira / jin / dev) so every post showed the same fake conversation
 * regardless of who authored it. Until a real /@h/:id/peek partial-
 * content endpoint lands, clicking the reply count or post body
 * navigates to the conversation page via the entry's [data-open]
 * attribute. Inline counters (♥ ↻) still toggle locally without
 * navigating; ↩ (reply) does navigate to the conversation. */
(function(){
  function pad(n){ return String(n).padStart(2,'0'); }
  function tick(){
    var d=new Date();
    var s=pad(d.getHours())+':'+pad(d.getMinutes());
    document.querySelectorAll('[data-clock]').forEach(function(el){ el.textContent=s; });
  }
  tick(); setInterval(tick,15000);

  var page=document.querySelector('.page');

  /* ---------- clicks ---------- */
  document.addEventListener('click', function(e){
    /* emoji reaction chips: ＋ opens picker (handled below), other
       chips just toggle the local count + .mine state. */
    var rx=e.target.closest('.rxn-chip, .rxn-mini .chip');
    if(rx){
      if(rx.classList.contains('add')){ return; }
      var nn=rx.querySelector('.n');
      var v=parseInt((nn&&nn.textContent)||'0',10)||0;
      var ron=rx.classList.toggle('mine');
      if(nn) nn.textContent=(ron?v+1:v-1);
      return;
    }
    /* ↻ ↩ ♥ — boost / fav toggle locally; ↩ falls through so the
       entry's data-open navigation handler picks it up. */
    var a=e.target.closest('.acts .a, .focus .acts .a');
    if(a && !a.classList.contains('reply')){
      var b=a.querySelector('b');
      var n=b?parseInt(b.textContent.replace(/,/g,''),10)||0:0;
      var on=a.classList.toggle('on');
      if(b){ b.textContent=(on?n+1:n-1).toLocaleString(); }
      return;
    }
    /* self-thread CTA already has an <a href> — let the link navigate */
    if(e.target.closest('.threadcta a, .threadcta')){ return; }
    /* Any other click on an entry/notif row (including the reply
       count ↩) navigates to the URL the server put in [data-open]. */
    var entry=e.target.closest('.entry, .notif');
    if(entry && !e.target.closest('a, button, input, textarea, select, label')){
      var href=entry.getAttribute('data-open');
      if(href){ e.preventDefault(); location.href=href; }
    }
  });

  /* ---------- j/k selection ---------- */
  var items=[].slice.call(document.querySelectorAll('.entry, .notif'));
  var sel=items.findIndex(function(el){ return el.classList.contains('sel'); });
  if(sel<0 && items.length) sel=0;
  function paint(){
    items.forEach(function(el,i){ el.classList.toggle('sel', i===sel); });
    var el=items[sel]; if(!el||!page) return;
    var r=el.getBoundingClientRect(), pr=page.getBoundingClientRect();
    if(r.bottom>pr.bottom-10) page.scrollTop += (r.bottom-pr.bottom)+24;
    else if(r.top<pr.top+10) page.scrollTop -= (pr.top-r.top)+24;
  }
  if(items.length) paint();

  document.addEventListener('keydown', function(e){
    if(/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
    var k=e.key;
    if(k==='/' && !e.metaKey && !e.ctrlKey){ e.preventDefault(); location.href='/search'; return; }
    if(k==='c' && !e.metaKey && !e.ctrlKey){ e.preventDefault(); location.href='/compose'; return; }
    if(k==='j'||k==='ArrowDown'){ if(!items.length) return; e.preventDefault(); sel=Math.min(sel+1,items.length-1); paint(); }
    else if(k==='k'||k==='ArrowUp'){ if(!items.length) return; e.preventDefault(); sel=Math.max(sel-1,0); paint(); }
    else if(k==='f'){ var s=items[sel]; if(s){ var f=s.querySelector('.a.fav'); if(f) f.click(); } }
    else if(k==='b'){ var s2=items[sel]; if(s2){ var bo=s2.querySelector('.a.boost'); if(bo) bo.click(); } }
    else if(k==='Enter'){ var s3=items[sel]; if(s3 && s3.dataset.open){ location.href=s3.dataset.open; } }
  });

  /* ---------- compose char counter ---------- */
  var ta=document.querySelector('.composer textarea');
  if(ta){
    var cnt=document.querySelector('.composer .count b'); var max=10000;
    function upd(){ var n=ta.value.length; if(cnt){ cnt.textContent=(max-n); cnt.style.color=(max-n)<0?'var(--red)':'var(--ac)'; } }
    ta.addEventListener('input',upd); upd();
  }

  /* ---------- theme persistence (dark / paper) ---------- */
  try{ var savedTheme=localStorage.getItem('hollo-theme'); if(savedTheme) document.documentElement.setAttribute('data-theme', savedTheme); }catch(e){}
  window.holloSetTheme=function(t){ document.documentElement.setAttribute('data-theme', t); try{ localStorage.setItem('hollo-theme', t); }catch(e){} };

  /* ====================================================================
     Command palette  ( : / Ctrl+K )
     ==================================================================== */
  var CMDS=[
    {sec:'go', ico:'⌂', lbl:'home', hint:'timeline', kb:'1', url:'/social'},
    {sec:'go', ico:'⌕', lbl:'search', hint:'people · posts · tags', kb:'/', url:'/search'},
    {sec:'go', ico:'◔', lbl:'notifications', kb:'3', url:'/notifications'},
    {sec:'go', ico:'⌗', lbl:'bookmarks', kb:'4', url:'/bookmarks'},
    {sec:'go', ico:'🧵', lbl:'threads', hint:'self-threads', kb:'5', url:'/threads'},
    {sec:'go', ico:'⚙', lbl:'settings', kb:',', url:'/settings'},
    {sec:'go', ico:'🔑', lbl:'security', hint:'2FA · passkeys', url:'/auth'},
    {sec:'go', ico:'🌐', lbl:'federation', hint:'peers · refresh', url:'/federation'},
    {sec:'go', ico:'😀', lbl:'custom emojis', url:'/emojis'},
    {sec:'go', ico:'🪝', lbl:'webhooks', url:'/webhooks'},
    {sec:'go', ico:'📦', lbl:'backup / export', url:'/backup'},
    {sec:'action', ico:'✎', lbl:'compose', hint:'new post', kb:'c', url:'/compose'},
    {sec:'action', ico:'☀', lbl:'theme: paper (light)', run:function(){ holloSetTheme('paper'); }},
    {sec:'action', ico:'◐', lbl:'theme: green (dark)', run:function(){ holloSetTheme('dark'); }},
    {sec:'action', ico:'⎋', lbl:'log out', url:'/logout'}
  ];
  var ck, ckInput, ckList, ckSel=0, ckRows=[];
  function buildCK(){
    ck=document.createElement('div'); ck.className='cmdk-back';
    ck.innerHTML='<div class="cmdk"><div class="ck-in"><span class="pr">:</span>'+
      '<input type="text" placeholder="type a command or page…" spellcheck="false" autocomplete="off">'+
      '<span class="esc">esc</span></div><div class="ck-list"></div></div>';
    document.body.appendChild(ck);
    ckInput=ck.querySelector('input'); ckList=ck.querySelector('.ck-list');
    ck.addEventListener('click', function(e){ if(e.target===ck) closeCK(); });
    ck.querySelector('.esc').addEventListener('click', closeCK);
    ckInput.addEventListener('input', renderCK);
    ckInput.addEventListener('keydown', ckKey);
    renderCK();
  }
  function renderCK(){
    var q=(ckInput.value||'').replace(/^:/,'').trim().toLowerCase();
    var items=CMDS.filter(function(c){ return !q || c.lbl.toLowerCase().indexOf(q)>=0 || (c.hint&&c.hint.toLowerCase().indexOf(q)>=0); });
    ckRows=items; ckSel=0;
    if(!items.length){ ckList.innerHTML='<div class="ck-empty">no match · press <span style="color:var(--ac)">esc</span></div>'; return; }
    var html='', lastSec=null;
    items.forEach(function(c,i){
      if(c.sec!==lastSec){ html+='<div class="ck-sec">'+c.sec+'</div>'; lastSec=c.sec; }
      html+='<div class="ck-row'+(i===0?' sel':'')+'" data-i="'+i+'"><span class="ico">'+c.ico+'</span>'+
        '<span class="lbl">'+c.lbl+(c.arg?' <span class="arg">…</span>':'')+'</span>'+
        (c.hint?'<span class="hint">'+c.hint+'</span>':'')+
        (c.kb?'<span class="kb">'+c.kb+'</span>':'')+'</div>';
    });
    ckList.innerHTML=html;
    ckList.querySelectorAll('.ck-row').forEach(function(r){
      r.addEventListener('mouseenter', function(){ ckSel=+r.dataset.i; paintCK(); });
      r.addEventListener('click', function(){ ckSel=+r.dataset.i; execCK(); });
    });
  }
  function paintCK(){ ckList.querySelectorAll('.ck-row').forEach(function(r,i){ r.classList.toggle('sel', i===ckSel); }); }
  function execCK(){ var c=ckRows[ckSel]; if(!c) return; closeCK(); if(c.run){ c.run(); } else if(c.url){ location.href=c.url; } }
  function ckKey(e){
    if(e.key==='ArrowDown'){ e.preventDefault(); ckSel=Math.min(ckSel+1,ckRows.length-1); paintCK(); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); ckSel=Math.max(ckSel-1,0); paintCK(); }
    else if(e.key==='Enter'){ e.preventDefault(); execCK(); }
    else if(e.key==='Escape'){ closeCK(); }
  }
  function openCK(prefill){ if(!ck) buildCK(); ck.classList.add('open'); ckInput.value=prefill||''; renderCK(); setTimeout(function(){ ckInput.focus(); },10);
    var sm=document.querySelector('.statusbar .mode'); if(sm){ ck._oldmode=sm.textContent; sm.textContent='COMMAND'; } }
  function closeCK(){ if(!ck) return; ck.classList.remove('open');
    var sm=document.querySelector('.statusbar .mode'); if(sm&&ck._oldmode) sm.textContent=ck._oldmode; }
  document.addEventListener('keydown', function(e){
    var typing=/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if((e.key==='k'||e.key==='K') && (e.metaKey||e.ctrlKey)){ e.preventDefault(); openCK(); return; }
    if(e.key===':' && !typing){ e.preventDefault(); openCK(':'); return; }
  });

  /* ====================================================================
     Reaction picker  ( ＋ popover )
     ==================================================================== */
  var EMO={
    smileys:['😀','😄','😁','😅','😂','🙂','😉','😊','😍','😘','😎','🤔','🫡','😴','😮','😢','😭','😡','🥹','🤝','🙌','👏','👍','👎','🙏','💪','👀','🫶','💯','🔥','✨','⭐'],
    objects:['💡','🧠','📚','📝','💻','🖥','⌨','🔭','🧪','🧵','📌','🔗','📈','🗂','☕','🌱','🌙','🛰','⚙','🔒','🧭','📡','🪄','📎','✅','❌','⚠','❤','💚','💙','💜','🫥'],
    custom:[':blobcat:',':ablobwave:',':verified:',':fediverse:',':hollo:',':loading:',':thisisfine:',':partyparrot:']
  };
  var rxpick, rxTarget, rxTab='smileys';
  function buildRX(){
    rxpick=document.createElement('div'); rxpick.className='rxpick';
    rxpick.innerHTML='<div class="rp-tabs"><a data-t="smileys" class="on">smileys</a><a data-t="objects">objects</a><a data-t="custom">custom</a></div>'+
      '<div class="rp-search"><input type="text" placeholder="search emoji…" spellcheck="false"></div>'+
      '<div class="rp-grid"></div>'+
      '<div class="rp-foot"><span class="gn">↵</span> add reaction · <span class="gn">esc</span> close</div>';
    document.body.appendChild(rxpick);
    rxpick.querySelectorAll('.rp-tabs a').forEach(function(a){ a.addEventListener('click', function(){ rxTab=a.dataset.t; rxpick.querySelectorAll('.rp-tabs a').forEach(function(x){x.classList.toggle('on',x===a);}); fillRX(); }); });
    rxpick.querySelector('.rp-search input').addEventListener('input', fillRX);
    rxpick.addEventListener('click', function(e){ e.stopPropagation(); });
  }
  function fillRX(){
    var q=(rxpick.querySelector('.rp-search input').value||'').toLowerCase();
    var list=EMO[rxTab]||[]; var grid=rxpick.querySelector('.rp-grid'); grid.innerHTML='';
    list.filter(function(em){ return !q || em.toLowerCase().indexOf(q)>=0; }).forEach(function(em){
      var b=document.createElement('button'); if(rxTab==='custom') b.className='custom';
      b.textContent=em; b.addEventListener('click', function(){ addReaction(em); }); grid.appendChild(b);
    });
  }
  function addReaction(em){
    if(!rxTarget){ closeRX(); return; }
    var wrap=rxTarget.closest('.rxn-mini, .rxn-chips, .acts');
    if(wrap){
      var isMini=wrap.classList.contains('rxn-mini') || wrap.classList.contains('acts');
      var chip=document.createElement('span');
      chip.className=isMini?'chip mine':'rxn-chip mine';
      chip.innerHTML='<span class="em">'+em+'</span><span class="n">1</span>';
      wrap.insertBefore(chip, rxTarget);
    }
    closeRX();
  }
  function openRX(target){
    if(!rxpick) buildRX();
    rxTarget=target; fillRX(); rxpick.classList.add('open');
    var r=target.getBoundingClientRect();
    var top=r.bottom+6, left=r.left;
    if(left+268>window.innerWidth-8) left=window.innerWidth-276;
    if(top+260>window.innerHeight-8) top=r.top-266;
    rxpick.style.top=top+'px'; rxpick.style.left=Math.max(8,left)+'px';
    setTimeout(function(){ var s=rxpick.querySelector('.rp-search input'); if(s) s.focus(); },10);
  }
  function closeRX(){ if(rxpick){ rxpick.classList.remove('open'); rxTarget=null; } }
  document.addEventListener('click', function(e){
    var add=e.target.closest('.rxn-mini .chip.add, .rxn-chip.add');
    if(add){ e.preventDefault(); e.stopPropagation(); openRX(add); return; }
    if(rxpick && rxpick.classList.contains('open') && !e.target.closest('.rxpick')) closeRX();
  }, true);
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') closeRX(); });

  /* ====================================================================
     Image lightbox  (clicks on <a data-lightbox="post-uuid"> images)
     ==================================================================== */
  var lb=null, lbList=[], lbIdx=0, lbOldMode=null;
  function buildLB(){
    lb=document.createElement('div'); lb.className='lightbox-back';
    lb.innerHTML =
      '<div class="lightbox-top"><span class="count" data-lb-count>1/1</span>'+
      '<span data-lb-meta></span><span class="sp"></span>'+
      '<span class="x" data-lb-close>esc ✕</span></div>'+
      '<div class="lightbox">'+
      '<button class="nav" data-lb-prev aria-label="previous">‹</button>'+
      '<div class="stage"><img data-lb-img alt="" style="max-width:100%; max-height:72vh; display:block;"/></div>'+
      '<button class="nav" data-lb-next aria-label="next">›</button>'+
      '</div>'+
      '<div class="lightbox-cap" data-lb-cap></div>'+
      '<div class="lightbox-bar"><a class="a" data-lb-open target="_blank" rel="noreferrer">open original ↗</a></div>';
    document.body.appendChild(lb);
    lb.querySelector('[data-lb-close]').addEventListener('click', closeLB);
    lb.querySelector('[data-lb-prev]').addEventListener('click', function(){ navLB(-1); });
    lb.querySelector('[data-lb-next]').addEventListener('click', function(){ navLB(1); });
    // Close on any click outside the image and outside interactive
    // controls (prev/next arrows, close ✕, "open original" link).
    lb.addEventListener('click', function(ev){
      if (ev.target.closest('img, button, a')) return;
      closeLB();
    });
  }
  function navLB(d){
    if(!lbList.length) return;
    lbIdx=(lbIdx+d+lbList.length)%lbList.length; paintLB();
  }
  function paintLB(){
    if(!lb) return;
    var item=lbList[lbIdx]; if(!item) return;
    var img=lb.querySelector('[data-lb-img]');
    img.src=item.href; img.alt=item.alt||'';
    lb.querySelector('[data-lb-count]').textContent=(lbIdx+1)+'/'+lbList.length;
    lb.querySelector('[data-lb-meta]').textContent=item.meta||'';
    var capBox=lb.querySelector('[data-lb-cap]');
    capBox.innerHTML = item.alt ? '<span class="lbl">alt</span> '+escapeText(item.alt) : '';
    lb.querySelector('[data-lb-open]').href=item.href;
    var prev=lb.querySelector('[data-lb-prev]'); var next=lb.querySelector('[data-lb-next]');
    prev.style.visibility=lbList.length>1?'visible':'hidden';
    next.style.visibility=lbList.length>1?'visible':'hidden';
  }
  function escapeText(s){ var d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
  function openLB(anchor){
    if(!lb) buildLB();
    var gallery=anchor.getAttribute('data-lightbox');
    var selector='a[data-lightbox="'+gallery.replace(/"/g,'\\"')+'"]';
    lbList=[].slice.call(document.querySelectorAll(selector)).map(function(a){
      return { href:a.href, alt:a.getAttribute('data-lightbox-alt')||'', meta:a.getAttribute('data-lightbox-meta')||'' };
    });
    var idx=lbList.findIndex(function(x){ return x.href===anchor.href; });
    lbIdx=idx>=0?idx:0;
    paintLB();
    lb.classList.add('open');
    var sm=document.querySelector('.statusbar .mode'); if(sm){ lbOldMode=sm.textContent; sm.textContent='LIGHTBOX'; }
  }
  function closeLB(){
    if(!lb) return;
    lb.classList.remove('open');
    var sm=document.querySelector('.statusbar .mode'); if(sm&&lbOldMode){ sm.textContent=lbOldMode; }
  }
  document.addEventListener('click', function(e){
    var a=e.target.closest('a[data-lightbox]');
    if(a){ e.preventDefault(); openLB(a); }
  });
  document.addEventListener('keydown', function(e){
    if(!lb || !lb.classList.contains('open')) return;
    if(e.key==='Escape'){ closeLB(); }
    else if(e.key==='ArrowLeft'){ navLB(-1); }
    else if(e.key==='ArrowRight'){ navLB(1); }
  });
})();
