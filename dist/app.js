'use strict';
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const batchSize = 20;
let data = [], months = [], selected = '', selectedDay = '', calendarMonth = '', filtered = [], shown = 0, continuation = '', mode = 'month';
let toastTimer;
let selectedMember = '', members = [];
$('search').value = params.get('q') || '';
$('sort').value = params.get('sort') === 'desc' ? 'desc' : 'asc';
function node(tag, className, text) { const el = document.createElement(tag); if(className) el.className = className; if(text !== undefined) el.textContent = text; return el; }
function icon(kind) {
  const paths = {external:'M14 3h7v7 M21 3 10 14 M10 3H3v18h18v-7',link:'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2'};
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('class','action-icon'); svg.setAttribute('aria-hidden','true');
  const path = document.createElementNS('http://www.w3.org/2000/svg','path'); path.setAttribute('d',paths[kind]); svg.append(path); return svg;
}
function linkedText(text) {
  const fragment = document.createDocumentFragment(); let position = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>]+/g)) {
    fragment.append(document.createTextNode(text.slice(position,match.index)));
    const link = node('a','',match[0]); link.href = match[0]; link.target = '_blank'; link.rel = 'noopener noreferrer'; fragment.append(link); position = match.index + match[0].length;
  }
  fragment.append(document.createTextNode(text.slice(position))); return fragment;
}
function notify(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => $('toast').hidden = true,3500); }
function card(post) {
  const article = node('article','post'); article.id = `post-${post.id}`; article.tabIndex = -1;
  article.setAttribute('aria-label',`${post.date.slice(0,10)} ${post.date.slice(11,16)} ${post.name}의 기록`);
  const avatar = node('a','avatar-link',(post.name || post.handle).slice(0,1)); avatar.href = `https://x.com/${encodeURIComponent(post.handle)}`; avatar.target = '_blank'; avatar.rel = 'noopener noreferrer'; avatar.setAttribute('aria-label',`${post.name}의 X 프로필`);
  if(post.avatar) { const img = node('img','avatar'); img.src = post.avatar; img.alt = `${post.name} 프로필 사진`; img.width = 42; img.height = 42; img.loading = 'lazy'; img.addEventListener('error',() => img.remove(),{once:true}); avatar.append(img); }
  const body = node('div','post-body'); const header = node('div','post-header');
  const name = node('a','account-name',post.name); name.href = avatar.href; name.target = '_blank'; name.rel = 'noopener noreferrer';
  const time = node('time','',post.date.slice(5,10).replace('-','.') + ' ' + post.date.slice(11,16)); time.dateTime = post.date; time.title = `${post.date.slice(0,10)} (한국 시간)`;
  header.append(name,node('span','account-handle',`@${post.handle}`),node('span','post-dot','·'),time);
  const translation = node('div','translation'); translation.append(linkedText(post.translation)); body.append(header,translation);
  if(post.media.length) {
    const images = node('div','post-media');
    for(const [index,url] of post.media.entries()) {
      const link = node('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; const img = node('img'); img.src = url; img.alt = `${post.name} 게시물 첨부 이미지 ${index+1}`; img.loading = 'lazy'; img.decoding = 'async';
      img.addEventListener('error',() => { img.hidden = true; link.textContent = '첨부 이미지 열기 ↗'; },{once:true}); link.append(img); images.append(link);
    }
    body.append(images);
  }
  const details = node('details'); details.append(node('summary','','일본어 원문 보기')); const original = node('div','original'); original.lang = 'ja'; original.append(linkedText(post.original)); details.append(original); body.append(details);
  const actions = node('div','post-actions'); actions.append(node('span','translation-badge'+(post.corrected?' corrected':''),post.corrected?'수정 번역':'한국어 번역'));
  const source = node('a'); source.href = post.url; source.target = '_blank'; source.rel = 'noopener noreferrer'; source.append(icon('external'),document.createTextNode('X에서 보기')); actions.append(source);
  const share = node('button'); share.type = 'button'; share.append(icon('link'),document.createTextNode('링크 복사')); share.setAttribute('aria-label',`${post.name}의 게시물 링크 복사`);
  share.addEventListener('click',async () => { const url = new URL(location.href); url.searchParams.set('mode','day'); url.searchParams.set('date',post.date.slice(0,10)); url.searchParams.set('month',post.month); url.hash = article.id; try { await navigator.clipboard.writeText(url.href); notify('이 기록의 링크를 복사했어요.'); } catch { notify('링크를 복사하지 못했어요. 브라우저의 주소 복사를 이용해 주세요.'); } });
  actions.append(share); body.append(actions); article.append(avatar,body); return article;
}
function buildMemberPicker() {
  const choices = [{handle:'',name:'전체'}, ...members];
  $('member-profiles').replaceChildren();
  for(const member of choices) {
    const button = node('button','member-button'); button.type = 'button'; button.dataset.member = member.handle;
    button.title = member.handle ? `${member.name} (@${member.handle})` : '전체 멤버';
    button.setAttribute('aria-label', member.handle ? `${member.name}의 글만 보기` : '전체 멤버의 글 보기');
    const photo = node('span','member-photo',member.handle ? member.name.slice(0,1) : '✳');
    if(member.avatar) { const img = node('img'); img.src = member.avatar; img.alt = ''; img.width = 36; img.height = 36; img.decoding = 'async'; img.addEventListener('error',() => img.remove(),{once:true}); photo.append(img); }
    button.append(photo,node('span','member-name',member.name));
    button.addEventListener('click',() => { selectedMember = member.handle; render(); });
    $('member-profiles').append(button);
  }
}
function updateMemberPicker() {
  for(const button of $('member-profiles').children) {
    const active = button.dataset.member === selectedMember;
    button.setAttribute('aria-pressed',String(active)); button.classList.toggle('selected',active);
  }
  $('selected-member-label').textContent = selectedMember ? `${members.find(member => member.handle === selectedMember).name}의 기록` : '전체 멤버';
}
function validMonth(value) { return /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value || ''); }
function validDay(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value; }
function monthTitle(value) { return `${value.slice(0,4)}년 ${Number(value.slice(5))}월`; }
function dayTitle(value) { return `${monthTitle(value.slice(0,7))} ${Number(value.slice(8))}일`; }
function shiftMonth(value,step) { const d = new Date(value+'-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth()+step); return d.toISOString().slice(0,7); }
function shiftDay(value,step) { const d = new Date(value+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+step); return d.toISOString().slice(0,10); }
function matches(post,includePeriod = true) {
  const query = $('search').value.trim().toLocaleLowerCase();
  return (!includePeriod || mode === 'all' || (mode === 'day' ? post.date.slice(0,10) === selectedDay : post.month === selected))
    && (!selectedMember || post.handle === selectedMember)
    && (!query || `${post.name}\n${post.handle}\n${post.translation}\n${post.original}`.toLocaleLowerCase().includes(query));
}
function firstDay(month) { return data.find(p => p.month === month && matches(p,false))?.date.slice(0,10) || month+'-01'; }
function focusArchive() { $('month-title').focus({preventScroll:true}); $('month-title').scrollIntoView({block:'start',behavior:'instant'}); }
function closeCalendar() { document.querySelector('.layout').classList.remove('calendar-open'); $('calendar-panel').classList.remove('mobile-open'); $('calendar-toggle').setAttribute('aria-expanded','false'); }
function setMonth(month,moveFocus = false) {
  if(!validMonth(month)) return; selected = month; calendarMonth = month; mode = 'month';
  if(selectedDay.slice(0,7) !== month) selectedDay = firstDay(month);
  render(); if(moveFocus) { closeCalendar(); focusArchive(); }
}
function setDay(day,moveFocus = false) { if(!validDay(day)) return; selectedDay = day; selected = day.slice(0,7); calendarMonth = selected; mode = 'day'; render(); if(moveFocus) { closeCalendar(); focusArchive(); } }
function setMode(value) { mode = value; if(value === 'day' && selectedDay.slice(0,7) !== selected) selectedDay = firstDay(selected); render(); }
function renderMonthNav() {
  const year = selected.slice(0,4); const years = [...new Set([...months.map(m => m.slice(0,4)),year])].sort();
  $('year').replaceChildren(...years.map(y => { const option = node('option','',`${y}년`); option.value = y; return option; })); $('year').value = year;
  const mobile = window.matchMedia('(max-width:640px)').matches;
  const choices = mobile ? [...new Set([...months,selected])].sort() : Array.from({length:12},(_,i) => `${year}-${String(i+1).padStart(2,'0')}`);
  $('months').replaceChildren();
  for(const month of choices) {
    const count = data.filter(p => p.month === month && (!selectedMember || p.handle === selectedMember)).length;
    const button = node('button','month-button'+(month === selected && mode !== 'all'?' active':''),mobile?`${month.slice(0,4)}.${Number(month.slice(5))}`:`${Number(month.slice(5))}월`);
    button.type = 'button'; button.setAttribute('aria-current',month === selected && mode !== 'all'?'date':'false'); button.setAttribute('aria-label',`${monthTitle(month)}, 번역 ${count}개`);
    button.append(node('span','',`${count}개`)); button.addEventListener('click',() => setMonth(month,true)); $('months').append(button);
  }
}
function renderCalendar() {
  $('month-picker').value = calendarMonth;
  $('calendar-days').replaceChildren();
  const offset = new Date(calendarMonth+'-01T00:00:00Z').getUTCDay();
  const lastDay = new Date(shiftMonth(calendarMonth,1)+'-01T00:00:00Z'); lastDay.setUTCDate(0);
  const counts = new Map();
  for(const post of data) if(post.month === calendarMonth && (!selectedMember || post.handle === selectedMember)) { const day = post.date.slice(0,10); counts.set(day,(counts.get(day)||0)+1); }
  for(let i = 0; i < offset; i++) { const blank = node('span','calendar-blank'); blank.setAttribute('aria-hidden','true'); $('calendar-days').append(blank); }
  for(let i = 1; i <= lastDay.getUTCDate(); i++) {
    const day = `${calendarMonth}-${String(i).padStart(2,'0')}`; const count = counts.get(day)||0;
    const button = node('button','calendar-day'+(count?' has-records':'')+(mode === 'day' && day === selectedDay?' selected':'')); button.type = 'button'; button.dataset.date = day;
    button.setAttribute('aria-label',`${dayTitle(day)}, 기록 ${count}개`); button.setAttribute('aria-pressed',String(mode === 'day' && day === selectedDay));
    button.append(node('span','',String(i)),node('span','day-count',count?`${count}개`:'')); button.addEventListener('click',() => setDay(day,true)); $('calendar-days').append(button);
  }
  $('calendar-count').textContent = `${[...counts.values()].reduce((a,b) => a+b,0)}개의 기록`;
  $('calendar-month-view').textContent = `${Number(calendarMonth.slice(5))}월 전체 보기`;
  $('calendar-days').setAttribute('aria-label',`${monthTitle(calendarMonth)} 날짜 선택`);
}
function updateReadingControls() {
  $('reading-progress').textContent = filtered.length?`${filtered.length.toLocaleString()}개 중 ${shown.toLocaleString()}개의 기록을 펼쳤어요`:'';
  $('more').hidden = shown >= filtered.length; continuation = '';
  if(mode !== 'all') {
    const current = mode === 'day'?selectedDay:selected; const asc = $('sort').value === 'asc';
    const periods = [...new Set(data.filter(p => matches(p,false)).map(p => mode === 'day'?p.date.slice(0,10):p.month))].sort();
    continuation = asc?periods.find(p => p > current)||'':periods.reverse().find(p => p < current)||'';
  }
  $('reading-end').hidden = shown < filtered.length || (!filtered.length && !continuation);
  $('continue-month').hidden = !continuation;
  $('continue-month').textContent = continuation?`${mode === 'day'?dayTitle(continuation):monthTitle(continuation)} 이어 읽기 →`:'';
  $('reading-end-label').textContent = !filtered.length?'선택한 조건으로 다음 기록이 있는 날로 이어갈 수 있어요.':continuation?`${mode === 'day'?'이 날':'이 달'}의 기록을 모두 펼쳤어요. 다음 이야기로 이어가 볼까요?`:'선택한 범위의 마지막 기록까지 왔어요.';
}
function appendBatch(moveFocus = false) {
  const batch = filtered.slice(shown,shown+batchSize); let lastDay = shown?filtered[shown-1].date.slice(0,10):''; let firstNew = null;
  for(const post of batch) {
    const day = post.date.slice(0,10);
    if(day !== lastDay) {
      const heading = node('h3','day-heading'); const date = node('time','',new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'long'}).format(new Date(post.date))); date.dateTime = day;
      heading.append(node('span','day-dot'),date,node('span','day-year',`${day.slice(0,4)}년`)); $('posts').append(heading); lastDay = day;
    }
    const article = card(post); $('posts').append(article); firstNew ||= article;
  }
  shown += batch.length; updateReadingControls();
  if(moveFocus && firstNew) { firstNew.focus({preventScroll:true}); firstNew.scrollIntoView({block:'start',behavior:'instant'}); }
}
function render() {
  updateMemberPicker(); renderMonthNav(); renderCalendar(); $('date-picker').value = selectedDay;
  for(const value of ['month','day','all']) $(`view-${value}`).setAttribute('aria-pressed',String(mode === value));
  $('previous').disabled = mode === 'all'; $('next').disabled = mode === 'all';
  $('previous').setAttribute('aria-label',mode === 'day'?'이전 날짜':'이전 달'); $('next').setAttribute('aria-label',mode === 'day'?'다음 날짜':'다음 달');
  $('month-label').textContent = mode === 'all'?'ALL RECORDS':mode === 'day'?'DAILY TIMELINE':'MONTHLY TIMELINE';
  $('month-title').textContent = mode === 'all'?'전체 기록':mode === 'day'?dayTitle(selectedDay):monthTitle(selected);
  $('search').placeholder = mode === 'all'?'전체 번역 검색':mode === 'day'?'이 날의 번역 검색':'이 달의 번역 검색';
  $('period-help').textContent = mode === 'day'?'선택한 하루의 글을 함께 읽어요.':mode === 'all'?'월을 넘어 모든 기록이 이어집니다.':'날짜를 선택하면 일별 보기로 이동해요.';
  $('reading-description').textContent = `${$('sort').value === 'asc'?'오래된 글부터':'최신 글부터'} · 한국 시간`;
  filtered = data.filter(p => matches(p)); if($('sort').value === 'desc') filtered.reverse();
  $('result-count').textContent = `${$('search').value.trim()?'검색 결과':'번역'} ${filtered.length.toLocaleString()}개`;
  $('posts').replaceChildren(); shown = 0; appendBatch();
  if(!filtered.length) { const empty = node('div','empty'); empty.append(node('strong','', '아직 이곳에는 기록이 없어요.'),node('span','',$('search').value.trim()?'다른 검색어로 찾아보세요.':'다른 날짜를 선택하거나 월 전체를 살펴보세요.')); const button = node('button','',mode === 'day'?'이 달 전체 보기':'전체 기록 보기'); button.type = 'button'; button.addEventListener('click',() => mode === 'day'?setMonth(selected):setMode('all')); empty.append(node('br'),button); $('posts').append(empty); }
  $('posts').setAttribute('aria-busy','false');
  const url = new URL(location.href); url.search = ''; url.hash = ''; url.searchParams.set('month',selected);
  if(mode !== 'month') url.searchParams.set('mode',mode); if(mode === 'day') url.searchParams.set('date',selectedDay);
  if(selectedMember) url.searchParams.set('member',selectedMember); if($('search').value.trim()) url.searchParams.set('q',$('search').value.trim()); if($('sort').value === 'desc') url.searchParams.set('sort','desc');
  history.replaceState(null,'',url);
}
$('year').addEventListener('change',() => setMonth(`${$('year').value}-${selected.slice(5)}`,true));
$('previous').addEventListener('click',() => mode === 'day'?setDay(shiftDay(selectedDay,-1),true):setMonth(shiftMonth(selected,-1),true));
$('next').addEventListener('click',() => mode === 'day'?setDay(shiftDay(selectedDay,1),true):setMonth(shiftMonth(selected,1),true));
for(const value of ['month','day','all']) $(`view-${value}`).addEventListener('click',() => setMode(value));
for(const id of ['search','sort']) $(id).addEventListener(id === 'search'?'input':'change',render);
$('date-picker').addEventListener('change',() => setDay($('date-picker').value));
$('month-picker').addEventListener('change',() => setMonth($('month-picker').value));
$('calendar-previous').addEventListener('click',() => { calendarMonth = shiftMonth(calendarMonth,-1); renderCalendar(); });
$('calendar-next').addEventListener('click',() => { calendarMonth = shiftMonth(calendarMonth,1); renderCalendar(); });
$('calendar-month-view').addEventListener('click',() => setMonth(calendarMonth,true));
$('calendar-toggle').addEventListener('click',() => { const open = $('calendar-toggle').getAttribute('aria-expanded') !== 'true'; document.querySelector('.layout').classList.toggle('calendar-open',open); $('calendar-panel').classList.toggle('mobile-open',open); $('calendar-toggle').setAttribute('aria-expanded',String(open)); if(open) { $('calendar-panel').scrollIntoView({block:'start',behavior:'instant'}); $('month-picker').focus({preventScroll:true}); } });
$('calendar-close').addEventListener('click',() => { closeCalendar(); $('calendar-toggle').focus(); });
$('calendar-panel').addEventListener('keydown',event => { if(event.key === 'Escape') { closeCalendar(); $('calendar-toggle').focus(); } });
$('calendar-days').addEventListener('keydown',event => { const step = {ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key]; if(!step || !event.target.dataset.date) return; event.preventDefault(); const day = shiftDay(event.target.dataset.date,step); if(day.slice(0,7) !== calendarMonth) { calendarMonth = day.slice(0,7); renderCalendar(); } $('calendar-days').querySelector(`[data-date="${day}"]`)?.focus(); });
$('more').addEventListener('click',() => appendBatch(true));
$('continue-month').addEventListener('click',() => mode === 'day'?setDay(continuation,true):setMonth(continuation,true));
$('start-reading').addEventListener('click',() => { $('sort').value = 'asc'; $('search').value = ''; selectedMember = ''; setMonth(months[0],true); });
window.matchMedia('(max-width:640px)').addEventListener('change',() => { if(data.length) renderMonthNav(); });
fetch('data.json').then(response => { if(!response.ok) throw Error('data'); return response.json(); }).then(posts => {
  data = posts.sort((a,b) => a.date.localeCompare(b.date) || (BigInt(a.id) < BigInt(b.id)?-1:BigInt(a.id) > BigInt(b.id)?1:0)); months = [...new Set(data.map(p => p.month))].sort(); if(!months.length) throw Error('empty');
  const order = ['POLKA','MAI','AKIRA','HANABI','YUKURI','MIRACLE','SHION','AURORA','NORIKO','MIDORI'];
  members = [...new Map(data.map(p => [p.handle,p])).values()].sort((a,b) => order.indexOf(a.character)-order.indexOf(b.character));
  buildMemberPicker();
  if(data.some(p => p.handle === params.get('member'))) selectedMember = params.get('member');
  mode = ['day','all'].includes(params.get('mode'))?params.get('mode'):params.get('all') === '1'?'all':'month';
  selected = validMonth(params.get('month'))?params.get('month'):($('sort').value === 'desc'?months.at(-1):months[0]);
  selectedDay = validDay(params.get('date'))?params.get('date'):firstDay(selected); if(mode === 'day') selected = selectedDay.slice(0,7); calendarMonth = selected;
  const targetId = location.hash.slice(1); $('total').textContent = data.length.toLocaleString(); $('month-total').textContent = months.length; render();
  if(/^post-\d+$/.test(targetId)) { const index = filtered.findIndex(p => `post-${p.id}` === targetId); if(index >= 0) { while(shown <= index) appendBatch(); history.replaceState(null,'',location.href+'#'+targetId); requestAnimationFrame(() => { $(targetId).focus({preventScroll:true}); $(targetId).scrollIntoView({block:'start',behavior:'instant'}); }); } }
}).catch(() => { $('month-title').textContent = '자료를 불러올 수 없어요'; $('posts').setAttribute('aria-busy','false'); $('posts').append(node('div','empty','잠시 후 페이지를 새로고침해 주세요. 로컬에서는 HTTP 서버로 실행해 주세요.')); });
