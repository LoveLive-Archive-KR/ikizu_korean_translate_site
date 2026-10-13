'use strict';
const $ = id => document.getElementById(id);
const batchSize = 20;
let data = [], months = [], selected = '', selectedDay = '', calendarMonth = '', filtered = [], shown = 0, continuation = '', mode = 'month';
let toastTimer;
let calendarFocusTarget = null;
let selectedMembers = new Set(), members = [];
let recommendations = {}, postIndex = new Map();
function chosenMembers() { return members.filter(member => selectedMembers.has(member.handle)); }
// Sampled profile backgrounds. Shion's white uses a visible neutral outline.
const brandPalette = {color:'#239fde', orange:'#ed6d00'};
const memberPalette = {
  POLKA:'#ffff66', MAI:'#4d93d9', AKIRA:'#b5e6a2', HANABI:'#ff4747',
  YUKURI:'#c0e6f5', MIRACLE:'#ffb6c1', SHION:'#ffffff', AURORA:'#ff5b9d',
  NORIKO:'#cc66ff', MIDORI:'#3fbf7f'
};
function rgb(hex) { return hex.slice(1).match(/../g).map(v => parseInt(v,16)); }
function hex(values) { return '#'+values.map(v => Math.round(v).toString(16).padStart(2,'0')).join(''); }
function luminance(color) { const [r,g,b] = rgb(color).map(v => { v /= 255; return v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4; }); return .2126*r+.7152*g+.0722*b; }
function darkInk(color) {
  let ink = color;
  while ((1.05/(luminance(ink)+.05)) < 5.5) ink = hex(rgb(ink).map(v => v*.88));
  return ink;
}
function paletteFor(character) {
  const color = memberPalette[character] || brandPalette.color;
  return {color, ring:color === '#ffffff'?'#94a1b1':color, ink:color === '#ffffff'?'#526073':darkInk(color), soft:hex(rgb(color).map(v => v*.13+255*.87)), onColor:(luminance(color)+.05)/(luminance('#122637')+.05) >= 4.5?'#122637':'#ffffff'};
}
function setPalette(element,palette,prefix='accent') {
  for(const key of ['color','ring','ink','soft','onColor']) element.style.setProperty(`--${prefix}-${key}`,palette[key]);
}
function updateTheme() {
  const chosen = chosenMembers();
  const member = chosen.length === 1?chosen[0]:null;
  const palette = paletteFor(member?.character); setPalette(document.documentElement,palette);
  document.querySelector('meta[name="theme-color"]').content = palette.soft;
}
function buildPaletteRibbon() {
  const ribbon = $('palette-ribbon'); ribbon.replaceChildren();
  for(const member of members) { const color = node('span'); color.style.background = memberPalette[member.character]; ribbon.append(color); }
}

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
function splitQuotedText(text) {
  const lines = text.replace(/\r\n?/g,'\n').split('\n');
  const header = /^[ \t]*>[ \t]*(?:\*\*)?@([A-Za-z0-9_]{1,15})[ \t]+(?:인용|引用)[ \t]*[:：](?:\*\*)?[ \t]*$/;
  const prefix = /^[ \t]*>[ \t]?/;
  const blocks = []; let plain = [];
  const flush = () => { const value = plain.join('\n'); if(value.trim()) blocks.push({type:'text',text:value.replace(/^\n+|\n+$/g,'')}); plain = []; };
  for(let i = 0; i < lines.length; i++) {
    const match = lines[i].match(header);
    if(!match || !prefix.test(lines[i+1] || '')) { plain.push(lines[i]); continue; }
    flush(); const quoted = [];
    while(i+1 < lines.length && prefix.test(lines[i+1])) quoted.push(lines[++i].replace(prefix,''));
    blocks.push({type:'quote',handle:match[1],text:quoted.join('\n')});
  }
  flush();
  return blocks.some(block => block.type === 'quote')?blocks:[{type:'text',text}];
}
function quotedPost(handle,text,parentPost) {
  const normalize = value => value.replace(/\r\n?/g,'\n').trim();
  const value = normalize(text);
  const candidates = data.filter(post => post.handle.toLowerCase() === handle.toLowerCase() && post.date <= parentPost.date && post.id !== parentPost.id
    && (normalize(post.translation) === value || normalize(post.original) === value));
  return candidates.length === 1?candidates[0]:null;
}
function quoteCard(block,parentPost) {
  const profile = members.find(member => member.handle.toLowerCase() === block.handle.toLowerCase())
    || (block.handle.toLowerCase() === 'ikizulive_staff'?{name:'이키즈라이브!',handle:'ikizulive_staff',avatar:'avatars/ikizulive_staff.jpg'}:null);
  const name = profile?.name || `@${block.handle}`;
  const card = node('blockquote','quote-card'); card.setAttribute('aria-label',`${name}의 인용 게시물`);
  const header = node('div','quote-header');
  const avatar = node('a','quote-avatar',block.handle.slice(0,1).toUpperCase()); avatar.href = `https://x.com/${encodeURIComponent(block.handle)}`; avatar.target = '_blank'; avatar.rel = 'noopener noreferrer'; avatar.setAttribute('aria-label',`${name}의 X 프로필`);
  if(profile?.avatar) { const image = node('img'); image.src = profile.avatar; image.alt = ''; image.width = 24; image.height = 24; image.loading = 'lazy'; image.addEventListener('error',() => image.remove(),{once:true}); avatar.append(image); }
  const identity = node('div','quote-identity'); const author = node('a','quote-name',name); author.href = avatar.href; author.target = '_blank'; author.rel = 'noopener noreferrer'; identity.append(author);
  if(profile) identity.append(node('span','quote-handle',`@${block.handle}`));
  header.append(avatar,identity);
  const source = quotedPost(block.handle,block.text,parentPost);
  if(source) {
    const link = node('a','quote-time'); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.setAttribute('aria-label',`${name}의 인용 원글을 X에서 보기`);
    const time = node('time','',`${source.date.slice(5,10).replace('-','.')} ${source.date.slice(11,16)} ↗`); time.dateTime = source.date; link.append(time); header.append(link);
  }
  const content = node('div','quote-text'); content.append(linkedText(block.text)); card.append(header,content); return card;
}
function formattedPostText(text,parentPost) {
  const fragment = document.createDocumentFragment();
  for(const block of splitQuotedText(text)) {
    if(block.type === 'quote') fragment.append(quoteCard(block,parentPost));
    else { const content = node('div','translation-text'); content.append(linkedText(block.text)); fragment.append(content); }
  }
  return fragment;
}
function notify(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => $('toast').hidden = true,3500); }
function postLink(post) {
  const url = new URL(location.href); url.search = '';
  url.searchParams.set('mode','day'); url.searchParams.set('date',post.date.slice(0,10));
  url.searchParams.set('month',post.month); url.hash = `post-${post.id}`;
  return url.href;
}
function recommendationPanel(post) {
  const entries = Array.isArray(recommendations[post.id])?recommendations[post.id]:[];
  const seen = new Set();
  const valid = entries.filter(entry => {
    if(!entry || typeof entry.id !== 'string' || typeof entry.reason !== 'string' || entry.id === post.id || seen.has(entry.id) || !postIndex.has(entry.id)) return false;
    const gap = Math.abs(Date.parse(post.date)-Date.parse(postIndex.get(entry.id).date));
    if(!Number.isFinite(gap) || gap > 14*86400000) return false;
    seen.add(entry.id); return true;
  }).slice(0,3);
  if(!valid.length) return null;
  const details = node('details','ai-recommendations');
  const summary = node('summary'); summary.append(node('span','ai-label','AI 추천'),node('span','ai-count',`${valid.length}개 · 실험`));
  const explanation = node('p','ai-explanation','게시일 차이가 14일 이내인 글 중에서 고른 추천이에요. 실제 답글 관계를 뜻하지는 않아요.');
  const list = node('ul','ai-list');
  for(const entry of valid) {
    const target = postIndex.get(entry.id); const item = node('li');
    const link = node('a','ai-post-link'); link.href = postLink(target);
    link.setAttribute('aria-label',`${target.name} · ${target.date.slice(0,10)} ${target.date.slice(11,16)} · ${entry.reason}`);
    const header = node('span','ai-post-header');
    if(target.avatar) { const image = node('img','ai-avatar'); image.src = target.avatar; image.alt = ''; image.width = 24; image.height = 24; image.loading = 'lazy'; header.append(image); }
    const time = node('time','',`${target.date.slice(0,10).replaceAll('-','.')} ${target.date.slice(11,16)}`); time.dateTime = target.date;
    header.append(node('strong','',target.name),time);
    const text = (target.translation || target.original).replace(/\s+/g,' ').trim();
    link.append(header,node('span','ai-preview',text.length > 120?text.slice(0,120)+'…':text),node('span','ai-reason',entry.reason+' →'));
    item.append(link); list.append(item);
  }
  details.append(summary,explanation,list); return details;
}
function card(post) {
  const article = node('article','post'); setPalette(article,paletteFor(post.character),'member'); article.id = `post-${post.id}`; article.tabIndex = -1;
  article.setAttribute('aria-label',`${post.date.slice(0,10)} ${post.date.slice(11,16)} ${post.name}의 기록`);
  const avatar = node('a','avatar-link',(post.name || post.handle).slice(0,1)); avatar.href = `https://x.com/${encodeURIComponent(post.handle)}`; avatar.target = '_blank'; avatar.rel = 'noopener noreferrer'; avatar.setAttribute('aria-label',`${post.name}의 X 프로필`);
  if(post.avatar) { const img = node('img','avatar'); img.src = post.avatar; img.alt = `${post.name} 프로필 사진`; img.width = 42; img.height = 42; img.loading = 'lazy'; img.addEventListener('error',() => img.remove(),{once:true}); avatar.append(img); }
  const body = node('div','post-body'); const header = node('div','post-header');
  const name = node('a','account-name',post.name); name.href = avatar.href; name.target = '_blank'; name.rel = 'noopener noreferrer';
  const time = node('time','',post.date.slice(5,10).replace('-','.') + ' ' + post.date.slice(11,16)); time.dateTime = post.date; time.title = `${post.date.slice(0,10)} (한국 시간)`;
  const dot = node('span','member-color-dot'); dot.setAttribute('aria-hidden','true');
  header.append(name,dot,node('span','account-handle',`@${post.handle}`),node('span','post-dot','·'),time);
  const translation = node('div','translation'); translation.append(formattedPostText(post.translation,post)); body.append(header,translation);
  if(post.media.length) {
    const images = node('div','post-media');
    for(const [index,url] of post.media.entries()) {
      const link = node('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; const img = node('img'); img.src = url; img.alt = `${post.name} 게시물 첨부 이미지 ${index+1}`; img.loading = 'lazy'; img.decoding = 'async';
      img.addEventListener('error',() => { img.hidden = true; link.textContent = '첨부 이미지 열기 ↗'; },{once:true}); link.append(img); images.append(link);
    }
    body.append(images);
  }
  const details = node('details'); details.append(node('summary','','일본어 원문 보기')); const original = node('div','original'); original.lang = 'ja'; original.append(formattedPostText(post.original,post)); details.append(original); body.append(details);
  const actions = node('div','post-actions'); if(post.corrected) actions.append(node('span','translation-badge corrected','수정 번역'));
  const source = node('a'); source.href = post.url; source.target = '_blank'; source.rel = 'noopener noreferrer'; source.append(icon('external'),document.createTextNode('X에서 보기')); actions.append(source);
  const share = node('button'); share.type = 'button'; share.append(icon('link'),document.createTextNode('링크 복사')); share.setAttribute('aria-label',`${post.name}의 게시물 링크 복사`);
  share.addEventListener('click',async () => { const url = new URL(location.href); url.search = ''; url.searchParams.set('mode','day'); url.searchParams.set('date',post.date.slice(0,10)); url.searchParams.set('month',post.month); url.hash = article.id; try { await navigator.clipboard.writeText(url.href); notify('이 기록의 링크를 복사했어요.'); } catch { notify('링크를 복사하지 못했어요. X에서 보기로 원문을 열 수 있어요.'); } });
  actions.append(share); body.append(actions);
  const related = recommendationPanel(post); if(related) body.append(related);
  article.append(avatar,body); return article;
}
function buildMemberPicker() {
  const choices = [{handle:'',name:'전체',avatar:'avatars/ikizulive_staff.jpg'}, ...members];
  $('member-profiles').replaceChildren();
  for(const member of choices) {
    const button = node('button','member-button'); setPalette(button,paletteFor(member.character),'member'); button.type = 'button'; button.dataset.member = member.handle;
    button.title = member.handle ? `${member.name} (@${member.handle})` : '전체 멤버';
    button.setAttribute('aria-label', member.handle ? `${member.name}의 글 보기` : '전체 멤버의 글 보기');
    const photo = node('span',member.handle ? 'member-photo' : 'member-photo member-photo-logo',member.handle ? member.name.slice(0,1) : '전체');
    if(member.avatar) { const img = node('img'); img.src = member.avatar; img.alt = ''; img.width = 36; img.height = 36; img.decoding = 'async'; img.addEventListener('error',() => img.remove(),{once:true}); photo.append(img); }
    button.append(photo,node('span','member-name',member.name));
    button.addEventListener('click',() => {
      if(!member.handle) { if(!selectedMembers.size) return; selectedMembers.clear(); }
      else if(selectedMembers.has(member.handle)) selectedMembers.delete(member.handle);
      else selectedMembers.add(member.handle);
      render();
    });
    $('member-profiles').append(button);
  }
}
function updateMemberPicker() {
  for(const button of $('member-profiles').children) {
    const active = button.dataset.member?selectedMembers.has(button.dataset.member):selectedMembers.size === 0;
    button.setAttribute('aria-pressed',String(active)); button.classList.toggle('selected',active);
  }
  const chosen = chosenMembers();
  $('selected-member-label').textContent = chosen.length === 0?'전체 멤버':chosen.length === 1?`${chosen[0].name}의 기록`:`${chosen.length}명 선택`;
  $('selected-member-label').title = chosen.map(member => member.name).join(' · ');
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
    && (!selectedMembers.size || selectedMembers.has(post.handle))
    && (!query || `${post.name}\n${post.handle}\n${post.translation}\n${post.original}`.toLocaleLowerCase().includes(query));
}
function firstDay(month) { return data.find(p => p.month === month && matches(p,false))?.date.slice(0,10) || month+'-01'; }
function focusArchive() { $('month-title').focus({preventScroll:true}); $('month-title').scrollIntoView({block:'start',behavior:'instant'}); }
function closeCalendar(focusTarget = $('calendar-toggle')) {
  const panel = $('calendar-panel');
  if(!panel.classList.contains('show') && !panel.classList.contains('showing')) return false;
  calendarFocusTarget = focusTarget;
  bootstrap.Offcanvas.getOrCreateInstance(panel).hide();
  return true;
}
function setMonth(month,moveFocus = false) {
  if(!validMonth(month)) return;
  if(mode === 'month' && selected === month) { calendarMonth = month; renderCalendar(); if(moveFocus && !closeCalendar($('month-title'))) focusArchive(); return; }
  selected = month; calendarMonth = month; mode = 'month';
  if(selectedDay.slice(0,7) !== month) selectedDay = firstDay(month);
  render(); if(moveFocus && !closeCalendar($('month-title'))) focusArchive();
}
function setDay(day,moveFocus = false) { if(!validDay(day)) return; if(mode === 'day' && selectedDay === day) { if(moveFocus && !closeCalendar($('month-title'))) focusArchive(); return; } selectedDay = day; selected = day.slice(0,7); calendarMonth = selected; mode = 'day'; render(); if(moveFocus && !closeCalendar($('month-title'))) focusArchive(); }
function setMode(value) { if(mode === value) return; mode = value; if(value === 'day' && selectedDay.slice(0,7) !== selected) selectedDay = firstDay(selected); render(); }
function renderMonthNav() {
  const year = selected.slice(0,4); const years = [...new Set([...months.map(m => m.slice(0,4)),year])].sort();
  $('year').replaceChildren(...years.map(y => { const option = node('option','',`${y}년`); option.value = y; return option; })); $('year').value = year;
  const mobile = window.matchMedia('(max-width:767.98px)').matches;
  const choices = [...new Set([...months.filter(m => mobile || m.startsWith(year)),selected])].sort();
  $('months').replaceChildren();
  for(const month of choices) {
    const count = data.filter(p => p.month === month && matches(p,false)).length;
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
  for(const post of data) if(post.month === calendarMonth && matches(post,false)) { const day = post.date.slice(0,10); counts.set(day,(counts.get(day)||0)+1); }
  for(let i = 0; i < offset; i++) { const blank = node('span','calendar-blank'); blank.setAttribute('aria-hidden','true'); $('calendar-days').append(blank); }
  for(let i = 1; i <= lastDay.getUTCDate(); i++) {
    const day = `${calendarMonth}-${String(i).padStart(2,'0')}`; const count = counts.get(day)||0;
    const button = node('button','calendar-day'+(count?' has-records':'')+(mode === 'day' && day === selectedDay?' selected':'')); button.type = 'button'; button.dataset.date = day;
    button.setAttribute('aria-label',`${dayTitle(day)}, 기록 ${count}개`); button.setAttribute('aria-pressed',String(mode === 'day' && day === selectedDay));
    button.append(node('span','',String(i)),node('span','day-count',count?`${count}개`:'')); button.addEventListener('click',() => setDay(day,true)); $('calendar-days').append(button);
  }
  $('calendar-key').textContent = $('search').value.trim()?'검색 결과가 있는 날':'기록이 있는 날';
  $('calendar-count').textContent = `${[...counts.values()].reduce((a,b) => a+b,0)}개의 기록`;
  $('calendar-month-view').textContent = `${Number(calendarMonth.slice(5))}월 전체 보기`;
  $('calendar-days').setAttribute('aria-label',`${monthTitle(calendarMonth)} 날짜 선택`);
}
function updateReadingControls() {
  $('reading-progress').textContent = filtered.length?`${shown.toLocaleString()} / ${filtered.length.toLocaleString()}개 표시`:'';
  $('more').hidden = shown >= filtered.length; continuation = '';
  if(mode !== 'all') {
    const current = mode === 'day'?selectedDay:selected; const asc = $('sort').value === 'asc';
    const periods = [...new Set(data.filter(p => matches(p,false)).map(p => mode === 'day'?p.date.slice(0,10):p.month))].sort();
    continuation = asc?periods.find(p => p > current)||'':periods.reverse().find(p => p < current)||'';
  }
  $('reading-end').hidden = shown < filtered.length || (!filtered.length && !continuation);
  $('continue-month').hidden = !continuation;
  $('continue-month').textContent = continuation?`${mode === 'day'?dayTitle(continuation):monthTitle(continuation)} 이어 읽기 →`:'';
  $('reading-end-label').textContent = !filtered.length?'다음 기록으로 이동':continuation?`${mode === 'day'?'이 날':'이 달'}의 마지막 기록`:'마지막 기록입니다.';
}
function appendBatch(moveFocus = false) {
  const batch = filtered.slice(shown,shown+batchSize); let lastDay = shown?filtered[shown-1].date.slice(0,10):''; let firstNew = null;
  for(const post of batch) {
    const day = post.date.slice(0,10);
    if(mode !== 'day' && day !== lastDay) {
      const heading = node('h3','day-heading'); const date = node('time','',new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'long'}).format(new Date(post.date))); date.dateTime = day;
      heading.append(node('span','day-dot'),date,node('span','day-year',`${day.slice(0,4)}년`)); $('posts').append(heading); lastDay = day;
    }
    const article = card(post); $('posts').append(article); firstNew ||= article;
  }
  shown += batch.length; updateReadingControls();
  if(moveFocus && firstNew) { firstNew.focus({preventScroll:true}); firstNew.scrollIntoView({block:'start',behavior:'instant'}); }
}
function render({historyMode = 'push',targetId = ''} = {}) {
  updateTheme(); updateMemberPicker(); renderMonthNav(); renderCalendar();
  for(const value of ['month','day','all']) $(`view-${value}`).setAttribute('aria-pressed',String(mode === value));
  $('previous').disabled = mode === 'all'; $('next').disabled = mode === 'all';
  $('previous').setAttribute('aria-label',mode === 'day'?'이전 날짜':'이전 달'); $('next').setAttribute('aria-label',mode === 'day'?'다음 날짜':'다음 달');
  $('month-title').textContent = mode === 'all'?'전체 기록':mode === 'day'?dayTitle(selectedDay):monthTitle(selected);
  $('search').placeholder = mode === 'all'?'전체 번역 검색':mode === 'day'?'이 날의 번역 검색':'이 달의 번역 검색';
  $('reading-description').textContent = `${$('sort').value === 'asc'?'오래된 글부터':'최신 글부터'} · 한국 시간`;
  filtered = data.filter(p => matches(p)); if($('sort').value === 'desc') filtered.reverse();
  $('result-count').textContent = `${$('search').value.trim()?'검색 결과':'번역'} ${filtered.length.toLocaleString()}개`;
  $('posts').replaceChildren(); shown = 0; appendBatch();
  if(!filtered.length) {
    const query = $('search').value.trim();
    const title = query?'검색 결과가 없어요.':mode === 'day'?'이 날짜에는 기록이 없어요.':'이 기간에는 기록이 없어요.';
    const empty = node('div','empty'); empty.append(node('strong','',title));
    const button = node('button','',query?'검색 지우기':mode === 'day'?'이 달 전체 보기':'전체 기록 보기'); button.type = 'button';
    button.addEventListener('click',() => { if(query) { $('search').value = ''; render({historyMode:'replace'}); } else if(mode === 'day') setMonth(selected); else setMode('all'); });
    empty.append(button); $('posts').append(empty);
  }
  $('posts').setAttribute('aria-busy','false');
  const url = new URL(location.href); url.search = ''; url.hash = ''; url.searchParams.set('month',selected);
  if(mode !== 'month') url.searchParams.set('mode',mode); if(mode === 'day') url.searchParams.set('date',selectedDay);
  for(const member of chosenMembers()) url.searchParams.append('member',member.handle); if($('search').value.trim()) url.searchParams.set('q',$('search').value.trim()); if($('sort').value === 'desc') url.searchParams.set('sort','desc');
  if(/^post-\d+$/.test(targetId) && filtered.some(p => `post-${p.id}` === targetId)) url.hash = targetId;
  if(historyMode === 'replace') history.replaceState(null,'',url);
  else if(historyMode === 'push' && url.href !== location.href) history.pushState(null,'',url);
}
$('year').addEventListener('change',() => setMonth(`${$('year').value}-${selected.slice(5)}`,true));
$('previous').addEventListener('click',() => mode === 'day'?setDay(shiftDay(selectedDay,-1),true):setMonth(shiftMonth(selected,-1),true));
$('next').addEventListener('click',() => mode === 'day'?setDay(shiftDay(selectedDay,1),true):setMonth(shiftMonth(selected,1),true));
for(const value of ['month','day','all']) $(`view-${value}`).addEventListener('click',() => setMode(value));
$('search').addEventListener('input',() => render({historyMode:'replace'}));
$('sort').addEventListener('change',() => render());
$('month-picker').addEventListener('change',() => { if(validMonth($('month-picker').value)) { calendarMonth = $('month-picker').value; renderCalendar(); } });
$('calendar-previous').addEventListener('click',() => { calendarMonth = shiftMonth(calendarMonth,-1); renderCalendar(); });
$('calendar-next').addEventListener('click',() => { calendarMonth = shiftMonth(calendarMonth,1); renderCalendar(); });
$('calendar-month-view').addEventListener('click',() => setMonth(calendarMonth,true));
$('calendar-toggle').addEventListener('click',() => {
  calendarFocusTarget = $('calendar-toggle');
  bootstrap.Offcanvas.getOrCreateInstance($('calendar-panel')).toggle();
});
$('calendar-close').addEventListener('click',() => closeCalendar());
$('calendar-panel').addEventListener('shown.bs.offcanvas',() => {
  $('calendar-toggle').setAttribute('aria-expanded','true');
  $('month-picker').focus({preventScroll:true});
});
$('calendar-panel').addEventListener('hidden.bs.offcanvas',() => {
  $('calendar-toggle').setAttribute('aria-expanded','false');
  const target = calendarFocusTarget; calendarFocusTarget = null;
  if(target === $('month-title')) focusArchive();
  else if(target && window.matchMedia('(max-width:1199.98px)').matches) target.focus({preventScroll:true});
});
$('calendar-days').addEventListener('keydown',event => { const step = {ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key]; if(!step || !event.target.dataset.date) return; event.preventDefault(); const day = shiftDay(event.target.dataset.date,step); if(day.slice(0,7) !== calendarMonth) { calendarMonth = day.slice(0,7); renderCalendar(); } $('calendar-days').querySelector(`[data-date="${day}"]`)?.focus(); });
$('more').addEventListener('click',() => appendBatch(true));
$('continue-month').addEventListener('click',() => mode === 'day'?setDay(continuation,true):setMonth(continuation,true));
$('start-reading').addEventListener('click',() => { $('sort').value = 'asc'; $('search').value = ''; selectedMembers.clear(); mode = 'month'; selected = months[0]; selectedDay = firstDay(selected); calendarMonth = selected; render(); if(!closeCalendar($('month-title'))) focusArchive(); });
window.matchMedia('(max-width:767.98px)').addEventListener('change',() => { if(data.length) renderMonthNav(); });
async function loadArchive() {
  const response = await fetch('data.json'); if(!response.ok) throw Error('data');
  const raw = await response.text(); const posts = JSON.parse(raw);
  // The archive works even when the optional experiment is missing or stale.
  try {
    const response = await fetch('recommendations.json',{cache:'no-cache'});
    if(response.ok && crypto.subtle) {
      const payload = await response.json();
      const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
      const fingerprint = Array.from(new Uint8Array(digest),value => value.toString(16).padStart(2,'0')).join('');
      if(payload.metadata?.schemaVersion === 1 && payload.metadata.windowDays === 14 && payload.metadata.sourceSha256 === fingerprint && payload.byPost && typeof payload.byPost === 'object') recommendations = payload.byPost;
    }
  } catch { /* Recommendations never prevent the timeline from loading. */ }
  return posts;
}
loadArchive().then(posts => {
  data = posts.sort((a,b) => a.date.localeCompare(b.date) || (BigInt(a.id) < BigInt(b.id)?-1:BigInt(a.id) > BigInt(b.id)?1:0)); months = [...new Set(data.map(p => p.month))].sort(); if(!months.length) throw Error('empty');
  postIndex = new Map(data.map(post => [post.id,post]));
  const order = ['POLKA','MAI','AKIRA','HANABI','YUKURI','MIRACLE','SHION','AURORA','NORIKO','MIDORI'];
  members = [...new Map(data.map(p => [p.handle,p])).values()].sort((a,b) => order.indexOf(a.character)-order.indexOf(b.character));
  buildMemberPicker(); buildPaletteRibbon();
  $('total').textContent = data.length.toLocaleString(); $('month-total').textContent = months.length;
  applyLocation({historyMode:'replace'});
}).catch(() => { $('month-title').textContent = '자료를 불러올 수 없어요'; $('posts').setAttribute('aria-busy','false'); $('posts').append(node('div','empty','잠시 후 페이지를 새로고침해 주세요. 로컬에서는 HTTP 서버로 실행해 주세요.')); });

function applyLocation({historyMode = 'none',moveFocus = false} = {}) {
  const params = new URLSearchParams(location.search);
  $('search').value = params.get('q') || '';
  $('sort').value = params.get('sort') === 'desc'?'desc':'asc';
  const requestedMembers = params.getAll('member').flatMap(value => value.split(','));
  selectedMembers = new Set(requestedMembers.filter(handle => members.some(member => member.handle === handle)));
  mode = ['day','all'].includes(params.get('mode'))?params.get('mode'):params.get('all') === '1'?'all':'month';
  selected = validMonth(params.get('month'))?params.get('month'):($('sort').value === 'desc'?months.at(-1):months[0]);
  selectedDay = validDay(params.get('date'))?params.get('date'):firstDay(selected);
  if(mode === 'day') selected = selectedDay.slice(0,7);
  calendarMonth = selected;
  const targetId = location.hash.slice(1);
  render({historyMode,targetId});
  const index = /^post-\d+$/.test(targetId)?filtered.findIndex(p => `post-${p.id}` === targetId):-1;
  if(index >= 0) {
    while(shown <= index) appendBatch();
    requestAnimationFrame(() => { $(targetId).focus({preventScroll:true}); $(targetId).scrollIntoView({block:'start',behavior:'instant'}); });
  } else if(moveFocus && !closeCalendar($('month-title'))) focusArchive();
}
window.addEventListener('popstate',() => { if(data.length) applyLocation({moveFocus:true}); });
