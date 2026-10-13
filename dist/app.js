'use strict';
const $ = id => document.getElementById(id);
let data = [], months = [], selected = '', filtered = [], shown = 0, continuation = '';
const batchSize = 20;
const params = new URLSearchParams(location.search);
$('search').value = params.get('q') || '';
$('all-months').checked = params.get('all') === '1';
$('sort').value = params.get('sort') === 'desc' ? 'desc' : 'asc';
function linkedText(text) {
  const fragment = document.createDocumentFragment();
  const pattern = /https?:\/\/[^\s<>]+/g; let position = 0;
  for (const match of text.matchAll(pattern)) {
    fragment.append(document.createTextNode(text.slice(position, match.index)));
    const anchor = document.createElement('a'); anchor.href = match[0]; anchor.textContent = match[0]; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; fragment.append(anchor); position = match.index + match[0].length;
  }
  fragment.append(document.createTextNode(text.slice(position))); return fragment;
}
function node(tag, className, text) { const element = document.createElement(tag); if(className)element.className = className; if(text !== undefined)element.textContent = text; return element; }
function card(post) {
  const article = node('article', 'post'); article.id = `post-${post.id}`;
  const content = node('div', 'post-content'); const header = node('div','post-header');
  const account = node('a','account'); account.href = `https://x.com/${encodeURIComponent(post.handle)}`; account.target = '_blank'; account.rel = 'noopener noreferrer';
  const avatar = node('span','account-icon'); avatar.textContent = (post.name || post.handle).slice(0,1);
  if(post.avatar) { const image = node('img','avatar'); image.src = post.avatar; image.alt = `${post.name} 프로필 사진`; image.width = 38; image.height = 38; image.loading = 'lazy'; image.addEventListener('error', () => image.remove(), {once:true}); avatar.append(image); }
  const identity = node('span','account-identity'); identity.append(node('strong','',post.name),node('span','account-handle',`@${post.handle}`)); account.append(avatar, identity);
  const time = node('time','',post.date.slice(5,10).replace('-','.') + ' · ' + post.date.slice(11,16)); time.dateTime = post.date; time.title = post.date.slice(0,10) + ' (한국 시간)'; header.append(account,time);
  const translation = node('div','translation'); translation.append(linkedText(post.translation)); content.append(header,translation); article.append(content);
  if(post.media.length) { const images = node('div','post-media'); for(const [index,url] of post.media.entries()) {const link = node('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';const img=node('img');img.src=url;img.alt=`${post.date.slice(0,10)} ${post.name} 게시물 첨부 이미지 ${index+1}`;img.loading='lazy';img.decoding='async';img.addEventListener('error',()=>{img.hidden=true;link.textContent='첨부 이미지 열기 ↗';link.style.padding='20px';},{once:true});link.append(img);images.append(link);}article.append(images);}
  const actions = node('div','post-actions'); actions.append(node('span',post.corrected?'corrected':'',post.corrected?'수정 번역 반영':'한국어 번역'));
  const source=node('a','','X에서 원문 보기 ↗');source.href=post.url;source.target='_blank';source.rel='noopener noreferrer';actions.append(source);article.append(actions);
  const details=node('details');details.append(node('summary','','일본어 원문 펼치기'));const original=node('div','original');original.lang='ja';original.append(linkedText(post.original));details.append(original);article.append(details);return article;
}
function monthTitle(month) { return `${month.slice(0,4)}년 ${Number(month.slice(5))}월`; }
function matches(post, includeMonth = true) {
  const query = $('search').value.trim().toLocaleLowerCase();
  return (!includeMonth || $('all-months').checked || post.month === selected)
    && (!$('member').value || post.handle === $('member').value)
    && (!query || `${post.name}\n${post.handle}\n${post.translation}\n${post.original}`.toLocaleLowerCase().includes(query));
}
function focusArchive() {
  $('month-title').focus({preventScroll:true});
  $('month-title').scrollIntoView({block:'start',behavior:'instant'});
}
function setMonth(month, moveFocus = false) {
  if (!month) return;
  selected = month; render();
  if (moveFocus) focusArchive();
}
function updateReadingControls() {
  $('reading-progress').textContent = filtered.length ? `${filtered.length.toLocaleString()}개 중 ${shown.toLocaleString()}개의 기록을 펼쳤어요` : '';
  $('more').hidden = shown >= filtered.length;
  $('reading-end').hidden = shown < filtered.length || !filtered.length;
  continuation = '';
  if (!$('all-months').checked) {
    const step = $('sort').value === 'asc' ? 1 : -1;
    for (let i = months.indexOf(selected) + step; i >= 0 && i < months.length; i += step) {
      if (data.some(post => post.month === months[i] && matches(post, false))) { continuation = months[i]; break; }
    }
  }
  $('continue-month').hidden = !continuation;
  $('continue-month').textContent = continuation ? `${monthTitle(continuation)} 이어 읽기 →` : '';
  $('reading-end-label').textContent = continuation
    ? '이 달의 기록을 모두 펼쳤어요. 다음 이야기로 이어가 볼까요?'
    : '선택한 범위의 마지막 기록까지 왔어요.';
}
function appendBatch(moveFocus = false) {
  const previousShown = shown;
  const batch = filtered.slice(shown, shown + batchSize);
  let lastDay = shown ? filtered[shown - 1].date.slice(0,10) : '';
  let firstNew = null;
  for (const post of batch) {
    const day = post.date.slice(0,10);
    if (day !== lastDay) {
      const heading = node('h3','day-heading');
      const date = node('time','',new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'long'}).format(new Date(post.date)));
      date.dateTime = day;
      heading.append(node('span','day-dot'),date,node('span','day-year',`${day.slice(0,4)}년`));
      $('posts').append(heading); lastDay = day;
    }
    const article = card(post); article.tabIndex = -1;
    article.setAttribute('aria-label', `${post.date.slice(0,10)} ${post.date.slice(11,16)} ${post.name}의 기록`);
    $('posts').append(article); firstNew ||= article;
  }
  shown = previousShown + batch.length;
  updateReadingControls();
  if (moveFocus && firstNew) { firstNew.focus({preventScroll:true}); firstNew.scrollIntoView({block:'start',behavior:'instant'}); }
}
function render() {
  const year = selected.slice(0,4); $('year').value = year; $('months').replaceChildren();
  for (const month of months.filter(m => m.startsWith(year))) {
    const count = data.filter(p => p.month === month && (!$('member').value || p.handle === $('member').value)).length;
    const button = node('button','month-button'+(month === selected ? ' active' : ''),`${Number(month.slice(5))}월`);
    button.type = 'button'; button.setAttribute('aria-current',month === selected ? 'date' : 'false');
    button.append(node('span','',`${count}개의 번역`)); button.addEventListener('click',() => setMonth(month,true)); $('months').append(button);
  }
  const all = $('all-months').checked;
  const index = months.indexOf(selected);
  $('previous').disabled = all || index === 0; $('next').disabled = all || index === months.length - 1;
  $('month-label').textContent = all ? 'ALL MONTHS COLLECTION' : `${year} · MONTHLY COLLECTION`;
  $('month-title').textContent = all ? '전체 기록' : monthTitle(selected);
  $('search').placeholder = all ? '전체 번역 검색' : '이 달의 번역 검색';
  $('reading-description').textContent = $('sort').value === 'asc' ? '여러 멤버의 글을 오래된 글부터 한 줄로 이어 읽어요.' : '여러 멤버의 글을 최신 글부터 한 줄로 이어 읽어요.';
  filtered = data.filter(post => matches(post));
  if ($('sort').value === 'desc') filtered.reverse();
  $('result-count').textContent = `${$('search').value.trim() ? '검색 결과' : '번역'} ${filtered.length.toLocaleString()}개`;
  $('posts').replaceChildren(); shown = 0;
  appendBatch();
  if (!filtered.length) $('posts').append(node('div','empty',$('search').value.trim() ? '검색 결과가 없어요. 다른 단어로 찾아보세요.' : '이 기간에는 선택한 멤버의 기록이 없어요. 다른 달이나 전체 기간을 선택해 주세요.'));
  $('posts').setAttribute('aria-busy','false');
  const url = new URL(location.href); url.search = ''; url.searchParams.set('month',selected);
  if ($('member').value) url.searchParams.set('member',$('member').value);
  if ($('search').value.trim()) url.searchParams.set('q',$('search').value.trim());
  if (all) url.searchParams.set('all','1');
  if ($('sort').value === 'desc') url.searchParams.set('sort','desc');
  history.replaceState(null,'',url);
}
$('month-title').tabIndex = -1;
$('year').addEventListener('change',() => setMonth(months.find(m => m.startsWith($('year').value)),true));
$('previous').addEventListener('click',() => setMonth(months[months.indexOf(selected)-1],true));
$('next').addEventListener('click',() => setMonth(months[months.indexOf(selected)+1],true));
for (const id of ['search','all-months','sort','member']) $(id).addEventListener(id === 'search' ? 'input' : 'change',render);
$('more').addEventListener('click',() => appendBatch(true));
$('continue-month').addEventListener('click',() => setMonth(continuation,true));
$('start-reading').addEventListener('click',() => {
  $('sort').value = 'asc'; $('search').value = ''; $('all-months').checked = false; $('member').value = '';
  setMonth(months[0],true);
});
fetch('data.json').then(response => { if (!response.ok) throw Error('data'); return response.json(); }).then(posts => {
  data = posts.sort((a,b) => a.date.localeCompare(b.date) || (BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0));
  months = [...new Set(data.map(p => p.month))].sort(); if (!months.length) throw Error('empty');
  for (const year of [...new Set(months.map(m => m.slice(0,4)))]) { const option = node('option','',`${year}년`); option.value = year; $('year').append(option); }
  for (const member of [...new Map(data.map(p => [p.handle,p])).values()].sort((a,b) => a.name.localeCompare(b.name,'ko'))) { const option = node('option','',member.name); option.value = member.handle; $('member').append(option); }
  if (data.some(p => p.handle === params.get('member'))) $('member').value = params.get('member');
  selected = months.includes(params.get('month')) ? params.get('month') : ($('sort').value === 'desc' ? months.at(-1) : months[0]);
  $('total').textContent = data.length.toLocaleString(); $('month-total').textContent = months.length; render();
}).catch(() => { $('month-title').textContent = '자료를 불러올 수 없어요'; $('posts').setAttribute('aria-busy','false'); $('posts').append(node('div','empty','잠시 후 페이지를 새로고침해 주세요. 로컬에서는 HTTP 서버로 실행해 주세요.')); });
