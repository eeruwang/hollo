/* 홀로 포크 — shared shell: clock · j/k selection · action toggles · peek drawer */
(function(){
  function pad(n){ return String(n).padStart(2,'0'); }
  function tick(){
    var d=new Date();
    var s=pad(d.getHours())+':'+pad(d.getMinutes());
    document.querySelectorAll('[data-clock]').forEach(function(el){ el.textContent=s; });
  }
  tick(); setInterval(tick,15000);

  var page=document.querySelector('.page');

  /* ---------- peek drawer (split pane) ---------- */
  var REPLIES = {
    self: [
      {au:'mira', hn:'@mira@social.coop · +6m', tx:'so you\u2019d red-team the disposition, not the transcript? that reframes the whole eval pipeline.', a:'\u21a9 1   \u2665 22',
        kids:[{au:'eeru', hn:'@eeru · +9m', tx:'exactly \u2014 that\u2019s the whole essay. <span class="tag">#alignment</span>', a:'\u2665 96'}]},
      {au:'jin', hn:'@jin@assemblag.es · +14m', tx:'ok, that distinction is actually useful. retracting my snark.', a:'\u21a9 0   \u2665 18'},
      {au:'dev', hn:'@dev@merveilles.town · +20m', tx:'does Hollo thread your own follow-ups into one page? \ud83d\udc40', a:'\u21a9 1   \u2665 7'}
    ]
  };
  var backEl, peekEl, savedScroll=0;
  function buildPeek(){
    backEl=document.createElement('div'); backEl.className='peek-back';
    peekEl=document.createElement('aside'); peekEl.className='peek';
    var mid=document.querySelector('.mid')||document.querySelector('.win');
    mid.appendChild(backEl); mid.appendChild(peekEl);
    backEl.addEventListener('click', closePeek);
  }
  function reactionsHTML(){
    return '<div class="rxn-chips">'+
      '<span class="rxn-chip mine"><span class="em">\ud83d\udd25</span><span class="n">6</span></span>'+
      '<span class="rxn-chip"><span class="em">\ud83d\udca1</span><span class="n">4</span></span>'+
      '<span class="rxn-chip"><span class="em">\ud83e\udde0</span><span class="n">3</span></span>'+
      '<span class="rxn-chip"><span class="em">\ud83d\udc40</span><span class="n">2</span></span>'+
      '<span class="rxn-chip add"><span class="em">\uff0b</span><span class="n">react</span></span>'+
      '</div>'+
      '<div class="rxn-by">'+
      '<span class="ic fav">\u2665</span><span class="who"><span class="au">mira</span>, <span class="au">jin</span>, <span class="au">noor</span> <span class="more">+71 favourited</span></span>'+
      '<span class="ic boost">\u21bb</span><span class="who"><span class="au">jin</span>, <span class="au">assemblage.bot</span> <span class="more">+10 boosted</span></span>'+
      '</div>';
  }
  function replyHTML(r){
    var kids = (r.kids||[]).map(replyHTML).join('');
    return '<div class="pk-reply"><div><span class="au">'+r.au+'</span> <span class="hn">'+r.hn+'</span></div>'+
      '<div class="rtx">'+r.tx+'</div><div class="ra"><span class="a reply">'+r.a.split('   ')[0]+'</span>'+
      (r.a.split('   ')[1]?'<span class="a fav">'+r.a.split('   ')[1]+'</span>':'')+'</div>'+kids+'</div>';
  }
  function openPeek(entry){
    if(!peekEl) buildPeek();
    var au=(entry.querySelector('.au')||{}).textContent||'eeru';
    var meta=entry.querySelector('.meta');
    var hn='@'+au;
    if(meta){ var ts=meta.querySelector('.ts'); if(ts) hn=ts.textContent.replace(/^@?/, '@').replace('@@','@'); }
    var txEl=entry.querySelector('.txt, .quote, .thr-title');
    var tx=txEl?txEl.innerHTML:'';
    var acts=entry.querySelector('.acts');
    var actsHTML=acts?acts.innerHTML:'<span class="a reply">\u21a9 <b>0</b></span>';
    var replies=REPLIES.self;
    var rc=replies.reduce(function(n,r){ return n+1+((r.kids&&r.kids.length)||0); },0);
    peekEl.innerHTML =
      '<div class="pk-head"><span class="ttl"><span class="ac">\u275a</span> conversation \u00b7 '+rc+' replies</span><span class="x" data-close>esc \u2715</span></div>'+
      '<div class="pk-body">'+
        '<div class="pk-op"><div class="ph"><span class="av">'+au.charAt(0)+'</span><span class="au">'+au+'</span> <span class="hn">'+hn+'</span></div>'+
        '<div class="tx">'+tx+'</div>'+
        '<div class="pk-acts">'+actsHTML+'</div></div>'+
        '<div class="pk-sec">\u2728 reactions \u00b7 who responded</div>'+ reactionsHTML()+
        '<div class="pk-sec">\u21b3 '+replies.length+' reply threads</div>'+ replies.map(replyHTML).join('')+
        '<div class="pk-reply-box"><span class="u">eeru@hollo</span>:reply$ <span class="cursor"></span></div>'+
        '<div class="pk-foot"><a href="post.html">open full conversation \u2197</a></div>'+
      '</div>';
    peekEl.querySelector('[data-close]').addEventListener('click', closePeek);
    savedScroll = page?page.scrollTop:0;
    backEl.classList.add('open'); peekEl.classList.add('open');
    var sm=document.querySelector('.statusbar .mode'); if(sm){ peekEl._oldmode=sm.textContent; sm.textContent='PEEK'; }
  }
  function closePeek(){
    if(!peekEl) return;
    backEl.classList.remove('open'); peekEl.classList.remove('open');
    if(page) page.scrollTop=savedScroll;        // keep your place
    var sm=document.querySelector('.statusbar .mode'); if(sm&&peekEl._oldmode) sm.textContent=peekEl._oldmode;
  }

  /* ---------- clicks ---------- */
  document.addEventListener('click', function(e){
    if(e.target.closest('.peek')) {              // inside drawer: toggles only
      var rxd=e.target.closest('.rxn-chip'); if(rxd && !rxd.classList.contains('add')){ var nd=rxd.querySelector('.n'); var vd=parseInt((nd&&nd.textContent)||'0',10)||0; var od=rxd.classList.toggle('mine'); if(nd) nd.textContent=(od?vd+1:vd-1); return; }
      var ad=e.target.closest('.pk-acts .a, .pk-reply .a'); if(ad){ var bd=ad.querySelector('b'); if(bd){ var mb=parseInt(bd.textContent.replace(/,/g,''),10)||0; var ob=ad.classList.toggle('on'); bd.textContent=(ob?mb+1:mb-1).toLocaleString(); } return; }
      return;
    }
    var rx=e.target.closest('.rxn-chip, .rxn-mini .chip');
    if(rx){ if(rx.classList.contains('add')){ return; } var nn=rx.querySelector('.n'); var v=parseInt((nn&&nn.textContent)||'0',10)||0; var ron=rx.classList.toggle('mine'); if(nn) nn.textContent=(ron?v+1:v-1); return; }
    var a=e.target.closest('.acts .a, .focus .acts .a');
    if(a && !a.classList.contains('reply')){ var b=a.querySelector('b'); var n=b?parseInt(b.textContent.replace(/,/g,''),10)||0:0; var on=a.classList.toggle('on'); if(b){ b.textContent=(on?n+1:n-1).toLocaleString(); } return; }
    // self-thread CTA → article reader
    if(e.target.closest('.threadcta')){ location.href='thread.html'; return; }
    // reply count OR post body → peek drawer (no navigation, keeps scroll)
    var rep=e.target.closest('.a.reply');
    var entry=e.target.closest('.entry, .notif');
    if(entry && entry.dataset.open==='thread.html' && !rep){ location.href='thread.html'; return; }
    if(rep && entry){ e.preventDefault(); openPeek(entry); return; }
    if(entry && !e.target.closest('a')){ openPeek(entry); return; }
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
    if(k==='Escape'){ closePeek(); return; }
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
    var cnt=document.querySelector('.composer .count b'); var max=500;
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
    objects:['💡','🧠','📚','📝','💻','🖥','⌨','🔭','🧪','🧵','📌','🔗','📈','🗂','☕','🌱','🌙','🛰','⚙','🔒','🧭','📡','🪄','📎','✅','❌','⚠','❤','💚','💙','💜','🩵'],
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
})();
