'use strict';
const $ = id => document.getElementById(id);
let data = [], months = [], selected = '', visible = 20;
const params = new URLSearchParams(location.search);
$('search').value = params.get('q') || '';
$('all-months').checked = params.get('all') === '1';
$('sort').value = params.get('sort') === 'asc' ? 'asc' : 'desc';
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
  const account = node('span','account'); account.append(node('span','account-icon','✳'),node('span','','OFFICIAL'));
  const time = node('time','',post.date.slice(5,10).replace('-','.') + ' · ' + post.date.slice(11,16)); time.dateTime = post.date; time.title = post.date.slice(0,10) + ' (한국 시간)'; header.append(account,time);
  const translation = node('div','translation'); translation.append(linkedText(post.translation)); content.append(header,translation); article.append(content);
  if(post.media.length) { const images = node('div','post-media'); for(const [index,url] of post.media.entries()) {const link = node('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';const img=node('img');img.src=url;img.alt=`${post.date.slice(0,10)} 공식 게시물 첨부 이미지 ${index+1}`;img.loading='lazy';img.decoding='async';img.addEventListener('error',()=>{img.hidden=true;link.textContent='첨부 이미지 열기 ↗';link.style.padding='20px';},{once:true});link.append(img);images.append(link);}article.append(images);}
  const actions = node('div','post-actions'); actions.append(node('span',post.corrected?'corrected':'',post.corrected?'수정 번역 반영':'한국어 번역'));
  const source=node('a','','X에서 원문 보기 ↗');source.href=post.url;source.target='_blank';source.rel='noopener noreferrer';actions.append(source);article.append(actions);
  const details=node('details');details.append(node('summary','','일본어 원문 펼치기'));const original=node('div','original');original.lang='ja';original.append(linkedText(post.original));details.append(original);article.append(details);return article;
}
function setMonth(month) {selected = month;visible = 20;render();}
function render() {
  const year=selected.slice(0,4);$('year').value=year;$('months').replaceChildren();
  for(const month of months.filter(m=>m.startsWith(year))) {const count=data.filter(p=>p.month===month).length;const button=node('button','month-button'+(month===selected?' active':''),`${Number(month.slice(5))}월`);button.type='button';button.setAttribute('aria-current',month===selected?'date':'false');button.append(node('span','',`${count}개의 번역`));button.addEventListener('click',()=>setMonth(month));$('months').append(button);}
  const index=months.indexOf(selected);$('previous').disabled=index===months.length-1;$('next').disabled=index===0;
  const query=$('search').value.trim().toLocaleLowerCase();const all=$('all-months').checked;
  $('month-label').textContent=all?'ALL MONTHS COLLECTION':`${year} · MONTHLY COLLECTION`;
  $('month-title').textContent=all?'전체 기록':`${year}년 ${Number(selected.slice(5))}월`;
  $('search').placeholder=all?'전체 번역 검색':'이 달의 번역 검색';
  let filtered=data.filter(p=>(all||p.month===selected)&&(!query||`${p.translation}\n${p.original}`.toLocaleLowerCase().includes(query)));
  if($('sort').value==='asc')filtered.reverse();
  $('result-count').textContent=`${query?'검색 결과':'번역'} ${filtered.length.toLocaleString()}개`;
  $('posts').replaceChildren(...filtered.slice(0,visible).map(card));
  if(!filtered.length)$('posts').append(node('div','empty',query?'검색 결과가 없어요. 다른 단어로 찾아보세요.':'이 기간에는 번역이 없어요.'));
  $('posts').setAttribute('aria-busy','false');$('more').hidden=filtered.length<=visible;
  const url=new URL(location.href);url.search='';url.searchParams.set('month',selected);if(query)url.searchParams.set('q',$('search').value.trim());if(all)url.searchParams.set('all','1');if($('sort').value==='asc')url.searchParams.set('sort','asc');history.replaceState(null,'',url);
}
$('year').addEventListener('change',()=>setMonth(months.find(m=>m.startsWith($('year').value))));
$('previous').addEventListener('click',()=>setMonth(months[months.indexOf(selected)+1]));$('next').addEventListener('click',()=>setMonth(months[months.indexOf(selected)-1]));
for(const id of ['search','all-months','sort'])$(id).addEventListener(id==='search'?'input':'change',()=>{visible=20;render();});
$('more').addEventListener('click',()=>{visible+=20;render();});
fetch('data.json').then(response=>{if(!response.ok)throw Error('data');return response.json();}).then(posts=>{data=posts;months=[...new Set(data.map(p=>p.month))].sort().reverse();if(!months.length)throw Error('empty');for(const year of [...new Set(months.map(m=>m.slice(0,4)))]){const option=node('option','',`${year}년`);option.value=year;$('year').append(option);}selected=months.includes(params.get('month'))?params.get('month'):months[0];$('total').textContent=data.length.toLocaleString();$('month-total').textContent=months.length;render();}).catch(()=>{$('month-title').textContent='자료를 불러올 수 없어요';$('posts').setAttribute('aria-busy','false');$('posts').append(node('div','empty','잠시 후 페이지를 새로고침해 주세요. 로컬에서는 HTTP 서버로 실행해 주세요.'));});
