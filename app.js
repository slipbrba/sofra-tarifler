'use strict';

const CATS = {
  sebze: 'Sebze', tavuk: 'Tavuk', et: 'Etli', bakliyat: 'Bakliyat',
  corba: 'Çorba', pratik: 'Pratik', pilav: 'Pilav',
};
const ICON = {
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.900 1.900 6.500 5.500M16 4.800a3.500 3.500 0 0 1 0 6.400M18.500 14.900c1.700.800 2.700 2.500 3 5.100"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 0 0-14.500-4.500L4 8M4 4v4h4M4 13a8 8 0 0 0 14.500 4.500L20 16M20 20v-4h-4"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.500A2.500 2.500 0 0 1 6.500 3H20v15H6.500A2.500 2.500 0 0 0 4 20.500zM4 20.500A2.500 2.500 0 0 0 6.500 21H20"/></svg>',
  basket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h18l-1.800 9.200A2 2 0 0 1 17.200 21H6.800a2 2 0 0 1-2-1.800zM7.500 10l3-6M16.500 10l-3-6M9 14v3M15 14v3"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.500l4.500 4.500L19 7.500"/></svg>',
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const lower = (s) => String(s).toLocaleLowerCase('tr');

let recipes = [];
let pantry = [];   // [{ group, items: [[id, ad], ...] }]
let ingName = {};
let byId = {};
let contentVersion = 0;

// ---- Kalıcı durum ---------------------------------------------------------
const store = (() => {
  let s = {};
  try { s = JSON.parse(localStorage.getItem('sofra')) || {}; } catch (e) { /* ilk açılış */ }
  s.shown = s.shown || {};    // { 'YYYY-MM-DD': [id, ...] } son günlerde önerilenler
  s.cooked = s.cooked || {};  // { id: 'YYYY-MM-DD' } en son pişirme günü
  s.have = s.have || [];      // "Elimde ne var?" ekranında seçili malzemeler
  return { s, save() { try { localStorage.setItem('sofra', JSON.stringify(s)); } catch (e) { /* yoksay */ } } };
})();

// ---- Tarih ----------------------------------------------------------------
function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function daysAgo(key) {
  const [y, m, d] = key.split('-').map(Number);
  const [ty, tm, td] = dateKey().split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 864e5);
}

// ---- Günün iki önerisi ----------------------------------------------------
const SHOWN_DAYS = 3;   // son 3 günde önerilen tekrar önerilmez
const COOKED_DAYS = 6;  // pişirilen yemek 6 gün dinlenir

function rng(seedText) {
  let h = 1779033703;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 3432918353), h = (h << 13) | (h >>> 19);
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function todaysPicks(reroll) {
  const today = dateKey();
  const want = Math.min(2, recipes.length);
  let p = store.s.picks;
  const valid = p && p.date === today && p.ids.length === want && p.ids.every((id) => byId[id]);
  if (valid && !reroll) return p.ids.map((id) => byId[id]);

  let seen = valid ? p.seen.filter((id) => byId[id]) : [];
  const n = valid ? p.reroll + 1 : 0;

  const resting = new Set();
  for (const [day, ids] of Object.entries(store.s.shown)) {
    const ago = daysAgo(day);
    if (ago > 7) delete store.s.shown[day];
    else if (ago >= 1 && ago <= SHOWN_DAYS) ids.forEach((id) => resting.add(id));
  }
  for (const [id, day] of Object.entries(store.s.cooked)) {
    if (daysAgo(day) <= COOKED_DAYS) resting.add(id);
  }

  // Havuz daraldıkça kuralları sırayla gevşet.
  let pool = recipes.filter((r) => !resting.has(r.id) && !seen.includes(r.id));
  if (pool.length < want) pool = recipes.filter((r) => !seen.includes(r.id));
  if (pool.length < want) { pool = recipes.slice(); seen = []; }

  const rand = rng(`${today}#${n}`);
  pool = pool.map((r) => [rand(), r]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const picks = pool.slice(0, 1);
  if (want > 1) picks.push(pool.find((r) => r.category !== picks[0].category) || pool[1]);

  const ids = picks.map((r) => r.id);
  store.s.picks = { date: today, ids, reroll: n, seen: seen.concat(ids) };
  store.s.shown[today] = [...new Set([...(store.s.shown[today] || []), ...ids])];
  store.save();
  return picks;
}

// ---- Ortak parçalar -------------------------------------------------------
function img(r) {
  const letter = esc(r.name.trim().charAt(0));
  return `<span class="noimg">${letter}</span>` +
    (r.image ? `<img src="img/${encodeURIComponent(r.image)}" alt="" decoding="async" onerror="this.remove()">` : '');
}
const meta = (r) =>
  `<span>${ICON.clock}${r.time} dk</span><span>${ICON.people}${r.servings} kişilik</span>`;

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---- Ana ekran ------------------------------------------------------------
function renderHome(reroll) {
  const now = new Date();
  const date = now.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
  const picks = todaysPicks(reroll);
  $('home').innerHTML = `
    <span class="eyebrow">${esc(date)}</span>
    <h1 class="headline">Bugün ne <em>pişirsek?</em></h1>
    <div class="picks">
      ${picks.map((r) => `
        <button class="pick" data-open="${esc(r.id)}">
          ${img(r)}
          <span class="tag">${esc(CATS[r.category] || r.category)}</span>
          <span class="body">
            <h2>${esc(r.name)}</h2>
            <p class="sum">${esc(r.summary || '')}</p>
            <span class="meta">${meta(r)}</span>
          </span>
        </button>`).join('') || '<p class="empty">Henüz tarif yok.</p>'}
    </div>
    <button class="btn primary have-btn" data-go="#/dolap">${ICON.basket}Elimdekilerle ne pişer?</button>
    <div class="home-actions">
      <button class="btn" id="reroll">${ICON.shuffle}Başka öner</button>
      <button class="btn" data-go="#/tum">${ICON.book}Tüm tarifler</button>
    </div>`;
  $('reroll').onclick = () => {
    renderHome(true);
    $('reroll').classList.add('spin');
  };
}

// ---- Tarif ----------------------------------------------------------------
function renderRecipe(r) {
  const cookedToday = store.s.cooked[r.id] === dateKey();
  $('recipe').innerHTML = `
    <div class="hero">${img(r)}<button class="round" data-back aria-label="Geri">${ICON.back}</button></div>
    <article class="sheet">
      <span class="eyebrow">${esc(CATS[r.category] || r.category)}</span>
      <h1>${esc(r.name)}</h1>
      ${r.summary ? `<p class="sum">${esc(r.summary)}</p>` : ''}
      <div class="facts">
        <div class="fact"><b>${r.time} dk</b><small>süre</small></div>
        <div class="fact"><b>${r.servings}</b><small>kişilik</small></div>
        <div class="fact"><b>${r.ingredients.length}</b><small>malzeme</small></div>
      </div>
      <h3>Malzemeler <small>hazır olana dokun</small></h3>
      <ul class="ings">${r.ingredients.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
      <h3>Yapılışı <small>biten adıma dokun</small></h3>
      <ol class="steps">${r.steps.map((s, i) => `<li><span class="n">${i + 1}</span><p>${esc(s)}</p></li>`).join('')}</ol>
      ${r.tip ? `<p class="tip"><b>Püf noktası.</b> ${esc(r.tip)}</p>` : ''}
      <button class="btn ${cookedToday ? 'done' : 'primary'}" id="cooked">
        ${ICON.check}${cookedToday ? 'Bugün pişirildi' : 'Bugün bunu pişirdim'}
      </button>
    </article>`;
  $('recipe').querySelectorAll('.ings li, .steps li').forEach((li) => {
    li.onclick = () => li.classList.toggle('on');
  });
  $('cooked').onclick = () => {
    if (store.s.cooked[r.id] === dateKey()) delete store.s.cooked[r.id];
    else { store.s.cooked[r.id] = dateKey(); toast('Afiyet olsun!'); }
    store.save();
    const y = window.scrollY;
    renderRecipe(r);
    window.scrollTo(0, y);
  };
}

// ---- Tüm tarifler ---------------------------------------------------------
const filter = { q: '', cat: '' };

function renderAll() {
  const cats = [...new Set(recipes.map((r) => r.category))];
  $('all').innerHTML = `
    <div class="bar">
      <button class="round" data-back aria-label="Geri">${ICON.back}</button>
      <h1>Tüm tarifler</h1><small>${recipes.length} tarif</small>
    </div>
    <input class="search" id="q" type="search" placeholder="Yemek ya da malzeme ara" value="${esc(filter.q)}" autocomplete="off">
    <div class="chips">
      <button class="chip ${filter.cat ? '' : 'on'}" data-cat="">Hepsi</button>
      ${cats.map((c) => `<button class="chip ${filter.cat === c ? 'on' : ''}" data-cat="${esc(c)}">${esc(CATS[c] || c)}</button>`).join('')}
    </div>
    <div class="grid" id="grid"></div>`;
  $('q').oninput = (e) => { filter.q = e.target.value; renderGrid(); };
  $('all').querySelectorAll('.chip').forEach((c) => {
    c.onclick = () => {
      filter.cat = c.dataset.cat;
      $('all').querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === c));
      renderGrid();
    };
  });
  renderGrid();
}

function renderGrid() {
  const q = lower(filter.q.trim());
  const list = recipes.filter((r) =>
    (!filter.cat || r.category === filter.cat) &&
    (!q || lower(r.name).includes(q) || r.ingredients.some((i) => lower(i).includes(q))));
  $('grid').innerHTML = list.map((r) => `
    <button class="tile" data-open="${esc(r.id)}">
      <span class="ph">${img(r)}</span>
      <b>${esc(r.name)}</b><small>${r.time} dk · ${esc(CATS[r.category] || r.category)}</small>
    </button>`).join('') || '<p class="empty">Buna uyan tarif yok.</p>';
}

// ---- Elimde ne var? ------------------------------------------------------
function renderPantry() {
  const have = new Set(store.s.have);
  $('pantry').innerHTML = `
    <div class="bar">
      <button class="round" data-back aria-label="Geri">${ICON.back}</button>
      <h1>Elimde ne var?</h1>
      <button class="link" id="clear" ${have.size ? '' : 'hidden'}>Temizle</button>
    </div>
    <p class="hint">Elindeki malzemelere dokun. Soğan, sarımsak, salça, zeytinyağı, un ve baharatlar evde var sayılır.</p>
    ${pantry.map((g) => `
      <h3 class="group">${esc(g.group)}</h3>
      <div class="chips wrap">
        ${g.items.map(([id, name]) => `<button class="chip ${have.has(id) ? 'on' : ''}" data-ing="${esc(id)}">${esc(name)}</button>`).join('')}
      </div>`).join('')}
    <div id="matches"></div>`;
  $('pantry').querySelectorAll('[data-ing]').forEach((c) => {
    c.onclick = () => {
      const id = c.dataset.ing;
      const i = store.s.have.indexOf(id);
      if (i >= 0) store.s.have.splice(i, 1); else store.s.have.push(id);
      store.save();
      c.classList.toggle('on', i < 0);
      $('clear').hidden = !store.s.have.length;
      renderMatches();
    };
  });
  $('clear').onclick = () => {
    store.s.have = [];
    store.save();
    renderPantry();
  };
  renderMatches();
}

const SHOW_FIRST = 6;          // eksikli bölümlerde önce bu kadarı gösterilir
const expanded = new Set();

function renderMatches() {
  const have = new Set(store.s.have);
  const box = $('matches');
  if (!have.size) { box.innerHTML = '<p class="empty">Malzeme seçince yapabileceğin yemekler burada çıkar.</p>'; return; }
  const scored = recipes
    .filter((r) => Array.isArray(r.main) && r.main.length)
    .map((r) => ({ r, used: r.main.filter((k) => have.has(k)), miss: r.main.filter((k) => !have.has(k)) }))
    .filter((x) => x.used.length && x.miss.length <= 2)
    .sort((a, b) => a.miss.length - b.miss.length || b.used.length - a.used.length || a.r.time - b.r.time);
  const sections = [
    ['Hemen yapabileceklerin', scored.filter((x) => !x.miss.length)],
    ['Bir malzeme eksik', scored.filter((x) => x.miss.length === 1)],
    ['İki malzeme eksik', scored.filter((x) => x.miss.length === 2)],
  ].filter(([, list]) => list.length);
  const cut = (title, list) => (title === sections[0][0] && !list[0].miss.length) || expanded.has(title)
    ? list : list.slice(0, SHOW_FIRST);
  const names = (ids) => ids.map((k) => ingName[k] || k).join(', ');
  box.innerHTML = sections.map(([title, list]) => `
    <h3 class="group">${esc(title)} <small>${list.length}</small></h3>
    <div class="grid">${cut(title, list).map(({ r, used, miss }) => `
      <button class="tile" data-open="${esc(r.id)}">
        <span class="ph">${img(r)}</span>
        <b>${esc(r.name)}</b>
        ${miss.length
          ? `<small class="miss">Eksik: ${esc(names(miss))}</small>`
          : `<small class="ok">${ICON.check}${esc(names(used))}</small>`}
      </button>`).join('')}
    </div>
    ${cut(title, list).length < list.length
      ? `<button class="btn more" data-more="${esc(title)}">Tümünü göster (${list.length})</button>` : ''}`).join('')
    || '<p class="empty">Bu malzemelerle uyan tarif yok. Birkaç malzeme daha seç.</p>';
  box.querySelectorAll('[data-more]').forEach((b) => {
    b.onclick = () => { expanded.add(b.dataset.more); renderMatches(); };
  });
}

// ---- Gezinme --------------------------------------------------------------
let depth = 0; // uygulama içinde kaç adım ilerlendi (geri tuşu için)
const scrollPos = {};
let current = '';

function route() {
  const hash = location.hash || '#/';
  if (current) scrollPos[current] = window.scrollY;
  const m = hash.match(/^#\/tarif\/(.+)$/);
  const r = m && byId[decodeURIComponent(m[1])];
  const view = r ? 'recipe' : hash === '#/tum' ? 'all' : hash === '#/dolap' ? 'pantry' : 'home';

  if (view === 'recipe') renderRecipe(r);
  else if (view === 'all') { if (current !== '#/tum' && !$('grid')) renderAll(); }
  else if (view === 'pantry') renderPantry();
  else renderHome(false);

  for (const id of ['home', 'recipe', 'all', 'pantry']) $(id).hidden = id !== view;
  // Tariften geri dönünce listede kalınan yere dön; başka yerden gelince en üstten başla.
  const returning = current.startsWith('#/tarif/');
  window.scrollTo(0, (view === 'all' || (view === 'pantry' && returning)) ? (scrollPos[hash] || 0) : 0);
  current = hash;
  if (window.Android) window.Android.keepAwake(view === 'recipe');
}

function go(hash) { depth++; location.hash = hash; }
function back() {
  if (depth > 0) { depth--; history.back(); } else location.replace('#/');
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-open],[data-go],[data-back]');
  if (!el) return;
  if (el.dataset.open) go(`#/tarif/${encodeURIComponent(el.dataset.open)}`);
  else if (el.dataset.go) go(el.dataset.go);
  else back();
});
window.addEventListener('hashchange', route);
window.addEventListener('popstate', () => { /* sistem geri tuşu: hashchange zaten tetiklenir */ });

// Uygulama arka planda bekleyip ertesi gün açılırsa öneriler yenilensin.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && (location.hash || '#/') === '#/' && store.s.picks && store.s.picks.date !== dateKey()) {
    renderHome(false);
  }
});

// ---- İçerik ---------------------------------------------------------------
async function load() {
  const res = await fetch('recipes.json', { cache: 'no-store' });
  const data = await res.json();
  recipes = data.recipes.filter((r) => r && r.id && r.name && Array.isArray(r.ingredients) && Array.isArray(r.steps));
  byId = Object.fromEntries(recipes.map((r) => [r.id, r]));
  pantry = Array.isArray(data.pantry) ? data.pantry : [];
  ingName = Object.fromEntries(pantry.flatMap((g) => g.items));
  const grew = contentVersion && data.version > contentVersion;
  contentVersion = data.version || 0;
  return grew;
}

// Android tarafı yeni tarifleri indirince çağırır.
window.__contentUpdated = async () => {
  try {
    await load();
    $('all').innerHTML = '';
    current = '';
    route();
    toast('Yeni tarifler eklendi');
  } catch (e) { /* eski içerikle devam */ }
};

load().then(route).catch(() => {
  $('home').hidden = false;
  $('home').innerHTML = '<p class="empty">Tarifler yüklenemedi.</p>';
});
