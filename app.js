/* ==========================================================================
   闇市出品プランナー（Black Market Sell Planner）
   craftguide-main の「原価入力」からアーティファクト装備を除いた部分だけを
   引き継ぎ、闇市（Black Market）での出品計画に特化させた単独ツール。
   ========================================================================== */

const CATS = [
  {id:'weapon', label:'武器',       ic:'⚔️'},
  {id:'head',   label:'頭防具',     ic:'🪖'},
  {id:'chest',  label:'胴防具',     ic:'👕'},
  {id:'foot',   label:'足防具',     ic:'👢'},
  {id:'offhand',label:'オフハンド', ic:'🛡️'},
];

const MATERIALS = [
  {id:'plank',   label:'木材 (Plank)'},
  {id:'steel',   label:'鋼 (Steel)'},
  {id:'leather', label:'革 (Leather)'},
  {id:'cloth',   label:'布 (Cloth)'},
];

const TIERS = [4,5,6,7,8];
const ENCH  = [0,1,2]; // 闇市プランナーでは .0〜.2 のみ扱う

const SUBTYPE_ORDER = {
  weapon: ['sword','axe','mace','hammer','fist','crossbow','bow','spear',
           'naturestaff','dagger','quarterstaff',
           'firestaff','holystaff','arcanestaff','froststaff','cursedstaff'],
  head:  ['plate','leather','cloth'],
  chest: ['plate','leather','cloth'],
  foot:  ['plate','leather','cloth'],
  offhand: ['shield','torch','tome'],
};

const SUBTYPE_LABELS = {
  sword:'ソード', axe:'アックス', mace:'メイス', hammer:'ハンマー',
  fist:'フィスト', crossbow:'クロスボウ', bow:'ボウ', spear:'スピア',
  naturestaff:'ネイチャースタッフ', dagger:'ダガー', quarterstaff:'クォータースタッフ',
  firestaff:'ファイアスタッフ', holystaff:'ホーリースタッフ', arcanestaff:'アルケインスタッフ',
  froststaff:'フロストスタッフ', cursedstaff:'カースドスタッフ',
  plate:'プレート', leather:'レザー', cloth:'クロス',
  shield:'シールド', torch:'トーチ', tome:'魔導書',
};

const CITIES = ['Martlock', 'Thetford', 'FortSterling', 'Lymhurst', 'Bridgewatch', 'Caerleon'];
const CITY_LABELS_JA = {
  Martlock:'マートロック', Thetford:'セットフォード', FortSterling:'フォートスターリング',
  Lymhurst:'リムハースト', Bridgewatch:'ブリッジウォッチ', Caerleon:'カエルレオン',
};

function key(tier, ench){ return `T${tier}_${ench}`; }

/* ---------------------------------------------------------------------
   State (localStorage)
--------------------------------------------------------------------- */
const LS_KEY = 'bm_planner_state_v1';

function defaultState(){
  return {
    settings:{ standardCity:'Lymhurst', premium:true, days:1 },
    matPrices:{},  // matPrices[city][materialId][T{tier}_{ench}] = price
    bmPrices:{},   // bmPrices[itemId][T{tier}_{ench}] = price
    volumes:{},    // volumes[itemId][T{tier}_{ench}] = 個/日
    inventory:{},  // inventory[city][materialId][T{tier}_{ench}] = 所持数
    sellRatios:{}, // sellRatios[itemId][T{tier}_{ench}] = 出品比率(%)。未設定なら15
  };
}

let state = loadState();

function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(raw){
      const data = JSON.parse(raw);
      const merged = Object.assign(defaultState(), data);
      merged.settings = Object.assign(defaultState().settings, data.settings || {});
      merged.matPrices = data.matPrices || {};
      merged.bmPrices = data.bmPrices || {};
      merged.volumes = data.volumes || {};
      merged.inventory = data.inventory || {};
      merged.sellRatios = data.sellRatios || {};
      return merged;
    }
  }catch(e){ console.error('state load failed', e); }
  return defaultState();
}

function saveState(){
  try{ localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  catch(e){ console.error('state save failed', e); }
}

function getMatPrice(city, matId, tier, ench){
  return (state.matPrices[city] && state.matPrices[city][matId] && state.matPrices[city][matId][key(tier,ench)]) || 0;
}
function setMatPrice(city, matId, tier, ench, val){
  state.matPrices[city] = state.matPrices[city] || {};
  state.matPrices[city][matId] = state.matPrices[city][matId] || {};
  state.matPrices[city][matId][key(tier,ench)] = val;
  saveState();
}

function getBmPrice(itemId, tier, ench){
  return (state.bmPrices[itemId] && state.bmPrices[itemId][key(tier,ench)]) || 0;
}
function setBmPrice(itemId, tier, ench, val){
  state.bmPrices[itemId] = state.bmPrices[itemId] || {};
  state.bmPrices[itemId][key(tier,ench)] = val;
  saveState();
}

function getVolume(itemId, tier, ench){
  return (state.volumes[itemId] && state.volumes[itemId][key(tier,ench)]) || 0;
}
function setVolume(itemId, tier, ench, val){
  state.volumes[itemId] = state.volumes[itemId] || {};
  state.volumes[itemId][key(tier,ench)] = val;
  saveState();
}

function getInventoryQty(city, matId, tier, ench){
  return (state.inventory[city] && state.inventory[city][matId] && state.inventory[city][matId][key(tier,ench)]) || 0;
}
function setInventoryQty(city, matId, tier, ench, val){
  state.inventory[city] = state.inventory[city] || {};
  state.inventory[city][matId] = state.inventory[city][matId] || {};
  state.inventory[city][matId][key(tier,ench)] = val;
  saveState();
}

function getSellRatio(itemId, tier, ench){
  const v = state.sellRatios[itemId] && state.sellRatios[itemId][key(tier,ench)];
  return (v === undefined || v === null) ? 15 : v;
}
function setSellRatio(itemId, tier, ench, val){
  state.sellRatios[itemId] = state.sellRatios[itemId] || {};
  state.sellRatios[itemId][key(tier,ench)] = val;
  saveState();
}

function computeCost(item, tier, ench, city){
  return MATERIALS.reduce((sum, m)=>{
    const qty = item.materials[m.id] || 0;
    if(qty <= 0) return sum;
    return sum + qty * getMatPrice(city, m.id, tier, ench);
  }, 0);
}

function taxRate(){ return state.settings.premium ? 4 : 8; }

// 利益率(%)に応じた色（プラスが大きいほど明るい緑、マイナスが大きいほど明るい赤）
function rateColor(rate){
  if(rate >= 0){
    const t = Math.max(0, Math.min(1, rate/150));
    return `hsl(142, 70%, ${40 + t*34}%)`;
  }else{
    const t = Math.max(0, Math.min(1, -rate/100));
    return `hsl(0, 78%, ${38 + t*32}%)`;
  }
}

/* ---------------------------------------------------------------------
   入力欄でEnterキーを押すと次の欄にフォーカスを移す（委譲イベントなので
   グリッドを再描画しても効き続ける）
--------------------------------------------------------------------- */
function enableEnterNav(container){
  if(!container) return;
  container.addEventListener('keydown', (e)=>{
    if(e.key !== 'Enter') return;
    const t = e.target;
    if(!t || t.tagName !== 'INPUT') return;
    e.preventDefault();
    const inputs = Array.from(container.querySelectorAll('input[type="number"]'));
    const idx = inputs.indexOf(t);
    if(idx > -1 && idx < inputs.length - 1){
      const next = inputs[idx+1];
      next.focus();
      if(next.select) next.select();
    }
  });
}

/* ---------------------------------------------------------------------
   Tabs
--------------------------------------------------------------------- */
document.querySelectorAll('.tabbtn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tabbtn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('page-'+btn.dataset.page).classList.add('active');
    // タブを開くたびに、他タブでの入力を反映して再描画する
    const page = btn.dataset.page;
    if(page === 'cost') renderCostPage();
    if(page === 'bm') bmTab.renderAll();
    if(page === 'volume') volTab.renderAll();
    if(page === 'plan') renderPlanPage();
    if(page === 'settings') renderSettingsPage();
  });
});

/* ---------------------------------------------------------------------
   Header pills
--------------------------------------------------------------------- */
function renderHeader(){
  document.getElementById('hdrCity').textContent = CITY_LABELS_JA[state.settings.standardCity] || state.settings.standardCity;
  document.getElementById('hdrTax').textContent = taxRate() + '%';
}

/* ---------------------------------------------------------------------
   PAGE: 原価入力（精製素材の単価・在庫）
--------------------------------------------------------------------- */
// 汎用：素材×T4〜T8×.0〜.2 の入力グリッドを作る（単価グリッド・在庫グリッド共通）
function buildMaterialGrid(container, valueGetter, valueSetter){
  container.innerHTML = '';
  MATERIALS.forEach(mat=>{
    const col = document.createElement('div');
    col.className = 'pricecol';
    col.innerHTML = `<h5>${mat.label}</h5>`;
    TIERS.forEach(tier=>{
      const tg = document.createElement('div');
      tg.className = 'tiergroup';
      tg.innerHTML = `<div class="tiergroup-label">T${tier}</div>`;
      const row = document.createElement('div');
      row.className = 'enchrow';
      ENCH.forEach(ench=>{
        const cell = document.createElement('div');
        cell.className = 'enchcell';
        const val = valueGetter(mat.id, tier, ench);
        cell.innerHTML = `<span>.${ench}</span><input type="number" min="0" value="${val||''}" placeholder="0">`;
        const input = cell.querySelector('input');
        input.addEventListener('input', ()=>{
          valueSetter(mat.id, tier, ench, Number(input.value)||0);
        });
        row.appendChild(cell);
      });
      tg.appendChild(row);
      col.appendChild(tg);
    });
    container.appendChild(col);
  });
}

function renderMatGrid(){
  const city = state.settings.standardCity;
  buildMaterialGrid(
    document.getElementById('matGrid'),
    (matId,t,e)=>getMatPrice(city,matId,t,e),
    (matId,t,e,val)=>setMatPrice(city,matId,t,e,val)
  );
}

function renderInvGrid(){
  const city = state.settings.standardCity;
  buildMaterialGrid(
    document.getElementById('invGrid'),
    (matId,t,e)=>getInventoryQty(city,matId,t,e),
    (matId,t,e,val)=>{ setInventoryQty(city,matId,t,e,val); renderPlanPage(); }
  );
}

function renderCostPage(){
  document.getElementById('costCityDisplay').textContent = CITY_LABELS_JA[state.settings.standardCity] || state.settings.standardCity;
  renderMatGrid();
  renderInvGrid();
}

// 原価入力タブ内のサブタブ（素材単価／在庫）切り替え
document.querySelectorAll('.subtabbtn[data-costsub]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.subtabbtn[data-costsub]').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('#page-cost .subpage').forEach(p=>p.style.display='none');
    btn.classList.add('active');
    document.getElementById('costsub-'+btn.dataset.costsub).style.display = '';
  });
});

document.getElementById('clearInventoryBtn').addEventListener('click', ()=>{
  const city = state.settings.standardCity;
  const cityLabel = CITY_LABELS_JA[city] || city;
  if(!confirm(`${cityLabel}の在庫データをすべて削除します。よろしいですか？`)) return;
  delete state.inventory[city];
  saveState();
  renderInvGrid();
  renderPlanPage();
});

enableEnterNav(document.getElementById('matGrid'));
enableEnterNav(document.getElementById('invGrid'));

/* ---------------------------------------------------------------------
   共通: カテゴリ／種類ナビ + 装備ごとの入力グリッド
   （闇市入力タブ・販売数入力タブで使い回す）
--------------------------------------------------------------------- */
function itemsInCategory(catId){
  return ITEMS.filter(i=>i.category===catId);
}
function subtypesInCategory(catId){
  const order = SUBTYPE_ORDER[catId] || [];
  const present = new Set(itemsInCategory(catId).map(i=>i.subtype));
  return order.filter(s=>present.has(s));
}
function itemsInSubtype(catId, subtype){
  return ITEMS.filter(i=>i.category===catId && i.subtype===subtype);
}
function repImageForSubtype(catId, subtype){
  const items = itemsInSubtype(catId, subtype);
  return items.length ? items[0].file : '';
}

// 装備1個分の入力カードを作る（闇市入力・販売数入力タブ共通）
// opts: {valueGetter, valueSetter, showProfitRate}
function buildEquipCard(item, opts){
  const card = document.createElement('div');
  card.className = 'equipcard';
  let hasAny = false;
  TIERS.forEach(t=>ENCH.forEach(e=>{ if(opts.valueGetter(item.id,t,e) > 0) hasAny = true; }));
  card.innerHTML = `<h5><img class="colthumb" src="${item.file}" alt="">${item.name}${hasAny?'<span class="hasval">入力済み</span>':''}</h5>`;
  TIERS.forEach(tier=>{
    const tg = document.createElement('div');
    tg.className = 'tiergroup';
    tg.innerHTML = `<div class="tiergroup-label">T${tier}</div>`;
    const row = document.createElement('div');
    row.className = 'enchrow';
    ENCH.forEach(ench=>{
      const cell = document.createElement('div');
      cell.className = 'enchcell';
      const val = opts.valueGetter(item.id, tier, ench);
      if(opts.showProfitRate){
        cell.innerHTML = `<span>.${ench}</span><div class="enchcell-inputrow">
          <input type="number" min="0" value="${val||''}" placeholder="0">
          <span class="ratelabel" data-rate></span></div>`;
      }else{
        cell.innerHTML = `<span>.${ench}</span><input type="number" min="0" value="${val||''}" placeholder="0">`;
      }
      const input = cell.querySelector('input');
      const rateEl = opts.showProfitRate ? cell.querySelector('[data-rate]') : null;
      function updateRate(){
        if(!rateEl) return;
        const sell = Number(input.value) || 0;
        const cost = computeCost(item, tier, ench, state.settings.standardCity);
        if(sell <= 0 || cost <= 0){ rateEl.textContent=''; rateEl.style.color=''; return; }
        const net = sell * (1 - taxRate()/100);
        const rate = ((net - cost) / cost) * 100;
        rateEl.textContent = (rate>=0?'+':'') + Math.round(rate) + '%';
        rateEl.style.color = rateColor(rate);
      }
      input.addEventListener('input', ()=>{
        opts.valueSetter(item.id, tier, ench, Number(input.value)||0);
        updateRate();
      });
      updateRate();
      row.appendChild(cell);
    });
    tg.appendChild(row);
    card.appendChild(tg);
  });
  return card;
}

function makeInputTab(opts){
  // opts: {catListId, subtypeRowId, gridPanelId, searchId, valueGetter, valueSetter, showProfitRate}
  const nav = { cat: CATS[0].id, subtype: null };

  function renderCatList(){
    const box = document.getElementById(opts.catListId);
    box.innerHTML = '';
    CATS.forEach(cat=>{
      const count = itemsInCategory(cat.id).length;
      if(count === 0) return;
      const btn = document.createElement('button');
      btn.className = 'catbtn' + (nav.cat===cat.id ? ' active' : '');
      btn.innerHTML = `<span class="ic">${cat.ic}</span>${cat.label}<span class="catcount">${count}</span>`;
      btn.addEventListener('click', ()=>{
        nav.cat = cat.id;
        nav.subtype = null;
        document.getElementById(opts.searchId).value = '';
        renderCatList(); renderSubtypeRow(); renderGrid();
      });
      box.appendChild(btn);
    });
  }

  function renderSubtypeRow(){
    const row = document.getElementById(opts.subtypeRowId);
    row.innerHTML = '';
    const subtypes = subtypesInCategory(nav.cat);
    if(!nav.subtype || !subtypes.includes(nav.subtype)) nav.subtype = subtypes[0] || null;
    subtypes.forEach(st=>{
      const items = itemsInSubtype(nav.cat, st);
      const icon = document.createElement('div');
      icon.className = 'subtypeicon' + (nav.subtype===st ? ' active' : '');
      icon.innerHTML = `<img src="${repImageForSubtype(nav.cat, st)}" alt="">
        <span>${SUBTYPE_LABELS[st] || st}</span>
        <span class="micount">${items.length}</span>`;
      icon.addEventListener('click', ()=>{
        nav.subtype = st;
        document.getElementById(opts.searchId).value = '';
        renderSubtypeRow(); renderGrid();
      });
      row.appendChild(icon);
    });
  }

  function renderGrid(){
    const panel = document.getElementById(opts.gridPanelId);
    panel.innerHTML = '';
    const q = document.getElementById(opts.searchId).value.trim().toLowerCase();
    let items;
    if(q){
      items = ITEMS.filter(i=>i.name.toLowerCase().includes(q));
    }else if(nav.subtype){
      items = itemsInSubtype(nav.cat, nav.subtype);
    }else{
      items = [];
    }
    const wrap = document.createElement('div');
    wrap.className = 'equipgridpanel';
    if(items.length === 0){
      wrap.innerHTML = '<div class="empty-hint">該当する装備がありません。</div>';
    }else{
      items.forEach(item=> wrap.appendChild(buildEquipCard(item, opts)));
    }
    panel.appendChild(wrap);
  }

  document.getElementById(opts.searchId).addEventListener('input', renderGrid);

  return { renderAll(){ renderCatList(); renderSubtypeRow(); renderGrid(); } };
}

const bmTab = makeInputTab({
  catListId:'bmCategoryList', subtypeRowId:'bmSubtypeRow', gridPanelId:'bmGridPanel', searchId:'bmSearch',
  valueGetter:getBmPrice, valueSetter:setBmPrice, showProfitRate:true,
});

/* ---------------------------------------------------------------------
   販売数入力タブ：片手武器／両手武器／頭・靴防具／胴防具／オフハンド
   の5グループでまとめて入力する
--------------------------------------------------------------------- */
// 基本武器（destiny盤の最初の分岐）のうち片手武器はこの13種のみ。
// それ以外の武器（Great系・二刀流系・Pike/Glaive等）と、
// Bow系・War Gloves(フィスト)系・Quarterstaff系は全て両手武器。
const ONE_HANDED_WEAPON_NAMES = new Set([
  'Broadsword','Battleaxe','Mace','Hammer','Light Crossbow','Spear',
  'Nature Staff','Dagger','Fire Staff','Holy Staff','Arcane Staff',
  'Frost Staff','Cursed Staff',
]);

const VOL_GROUPS = [
  {id:'weapon1h', label:'片手武器',     ic:'🗡️'},
  {id:'weapon2h', label:'両手武器',     ic:'⚔️'},
  {id:'headfoot', label:'頭・靴防具',   ic:'🪖'},
  {id:'chest',    label:'胴防具',       ic:'👕'},
  {id:'offhand',  label:'オフハンド',   ic:'🛡️'},
];

function volGroupOf(item){
  if(item.category === 'weapon'){
    return ONE_HANDED_WEAPON_NAMES.has(item.name) ? 'weapon1h' : 'weapon2h';
  }
  if(item.category === 'head' || item.category === 'foot') return 'headfoot';
  return item.category; // 'chest' or 'offhand'
}
function itemsInVolGroup(groupId){
  return ITEMS.filter(i=>volGroupOf(i)===groupId);
}
function volSubKey(item){
  if(item.category==='head' || item.category==='foot') return item.category+':'+item.subtype;
  return item.subtype;
}
function volSubLabel(item){
  if(item.category==='head') return '頭:'+(SUBTYPE_LABELS[item.subtype]||item.subtype);
  if(item.category==='foot') return '足:'+(SUBTYPE_LABELS[item.subtype]||item.subtype);
  return SUBTYPE_LABELS[item.subtype] || item.subtype;
}
function volSubtypesInGroup(groupId){
  const items = itemsInVolGroup(groupId);
  let orderKeys;
  if(groupId==='weapon1h' || groupId==='weapon2h') orderKeys = SUBTYPE_ORDER.weapon.slice();
  else if(groupId==='headfoot') orderKeys = ['head:plate','head:leather','head:cloth','foot:plate','foot:leather','foot:cloth'];
  else if(groupId==='chest') orderKeys = SUBTYPE_ORDER.chest.slice();
  else orderKeys = SUBTYPE_ORDER.offhand.slice();

  const out = [];
  orderKeys.forEach(k=>{
    const matches = items.filter(i=>volSubKey(i)===k);
    if(matches.length) out.push({key:k, label:volSubLabel(matches[0]), items:matches});
  });
  return out;
}

function makeVolumeTab(opts){
  // opts: {catListId, subtypeRowId, gridPanelId, searchId, valueGetter, valueSetter}
  const nav = { group: VOL_GROUPS[0].id, subKey: null };

  function renderGroupList(){
    const box = document.getElementById(opts.catListId);
    box.innerHTML = '';
    VOL_GROUPS.forEach(g=>{
      const count = itemsInVolGroup(g.id).length;
      if(count === 0) return;
      const btn = document.createElement('button');
      btn.className = 'catbtn' + (nav.group===g.id ? ' active' : '');
      btn.innerHTML = `<span class="ic">${g.ic}</span>${g.label}<span class="catcount">${count}</span>`;
      btn.addEventListener('click', ()=>{
        nav.group = g.id;
        nav.subKey = null;
        document.getElementById(opts.searchId).value = '';
        renderGroupList(); renderSubRow(); renderGrid();
      });
      box.appendChild(btn);
    });
  }

  function renderSubRow(){
    const row = document.getElementById(opts.subtypeRowId);
    row.innerHTML = '';
    const subs = volSubtypesInGroup(nav.group);
    if(!nav.subKey || !subs.some(s=>s.key===nav.subKey)) nav.subKey = subs.length ? subs[0].key : null;
    subs.forEach(s=>{
      const icon = document.createElement('div');
      icon.className = 'subtypeicon' + (nav.subKey===s.key ? ' active' : '');
      icon.innerHTML = `<img src="${s.items[0].file}" alt="">
        <span>${s.label}</span>
        <span class="micount">${s.items.length}</span>`;
      icon.addEventListener('click', ()=>{
        nav.subKey = s.key;
        document.getElementById(opts.searchId).value = '';
        renderSubRow(); renderGrid();
      });
      row.appendChild(icon);
    });
  }

  function renderGrid(){
    const panel = document.getElementById(opts.gridPanelId);
    panel.innerHTML = '';
    const q = document.getElementById(opts.searchId).value.trim().toLowerCase();
    let items;
    if(q){
      items = ITEMS.filter(i=>i.name.toLowerCase().includes(q));
    }else if(nav.subKey){
      const subs = volSubtypesInGroup(nav.group);
      const found = subs.find(s=>s.key===nav.subKey);
      items = found ? found.items : [];
    }else{
      items = [];
    }
    const wrap = document.createElement('div');
    wrap.className = 'equipgridpanel';
    if(items.length === 0){
      wrap.innerHTML = '<div class="empty-hint">該当する装備がありません。</div>';
    }else{
      items.forEach(item=> wrap.appendChild(buildEquipCard(item, opts)));
    }
    panel.appendChild(wrap);
  }

  document.getElementById(opts.searchId).addEventListener('input', renderGrid);

  return { renderAll(){ renderGroupList(); renderSubRow(); renderGrid(); } };
}

const volTab = makeVolumeTab({
  catListId:'volCategoryList', subtypeRowId:'volSubtypeRow', gridPanelId:'volGridPanel', searchId:'volSearch',
  valueGetter:getVolume, valueSetter:setVolume, showProfitRate:false,
});
enableEnterNav(document.getElementById('bmGridPanel'));
enableEnterNav(document.getElementById('volGridPanel'));

/* ---------------------------------------------------------------------
   PAGE: 計画
--------------------------------------------------------------------- */
function fmt(n){ return Math.round(n).toLocaleString('ja-JP'); }

function buildPlanRows(){
  const city = state.settings.standardCity;
  const tax = taxRate();
  const days = Math.max(1, Number(state.settings.days) || 1);
  const rows = [];
  ITEMS.forEach(item=>{
    TIERS.forEach(tier=>{
      ENCH.forEach(ench=>{
        const sell = getBmPrice(item.id, tier, ench);
        const cost = computeCost(item, tier, ench, city);
        // 原価・売値の両方が入力されている組み合わせのみ対象
        if(sell <= 0 || cost <= 0) return;
        const volume = getVolume(item.id, tier, ench);
        const ratio = getSellRatio(item.id, tier, ench);
        const net = sell * (1 - tax/100);
        const profitUnit = net - cost;
        const qtyPerDay = Math.floor(volume * (ratio/100));
        const qty = qtyPerDay * days; // 「何日分作るか」は単純な掛け算
        const profitTotal = profitUnit * qty;
        rows.push({item, tier, ench, sell, volume, cost, net, profitUnit, ratio, qtyPerDay, qty, profitTotal});
      });
    });
  });
  return rows;
}

// 表示中の行（rows）から、必要な素材数を在庫差し引き後の「買う量」として集計する
function aggregateMaterials(rows){
  const city = state.settings.standardCity;
  const agg = {};
  rows.forEach(r=>{
    if(r.qty <= 0) return;
    MATERIALS.forEach(m=>{
      const perUnit = r.item.materials[m.id] || 0;
      if(perUnit <= 0) return;
      const k = m.id+'|'+r.tier+'|'+r.ench;
      agg[k] = agg[k] || {matId:m.id, label:m.label, tier:r.tier, ench:r.ench, needed:0};
      agg[k].needed += perUnit * r.qty;
    });
  });
  return Object.values(agg).map(a=>{
    const owned = getInventoryQty(city, a.matId, a.tier, a.ench);
    const unitPrice = getMatPrice(city, a.matId, a.tier, a.ench);
    const toBuy = Math.max(0, a.needed - owned);
    return {...a, owned, toBuy, unitPrice, buyCost: toBuy*unitPrice};
  }).sort((x,y)=> x.matId.localeCompare(y.matId) || x.tier-y.tier || x.ench-y.ench);
}

// 表示中の行（rows）を装備カテゴリごとにまとめる（作る量まとめ）
function aggregateByCategory(rows){
  const agg = {};
  rows.forEach(r=>{
    if(r.qty <= 0) return;
    const c = r.item.category;
    agg[c] = agg[c] || {category:c, items:new Set(), qty:0, profit:0};
    agg[c].items.add(r.item.id);
    agg[c].qty += r.qty;
    agg[c].profit += r.profitTotal;
  });
  return Object.values(agg).map(a=>({...a, itemCount:a.items.size}))
    .sort((x,y)=>y.profit-x.profit);
}

function renderPlanFilters(){
  const catSel = document.getElementById('planCategory');
  if(catSel.options.length <= 1){
    CATS.forEach(cat=>{
      if(itemsInCategory(cat.id).length === 0) return;
      const opt = document.createElement('option');
      opt.value = cat.id; opt.textContent = cat.label;
      catSel.appendChild(opt);
    });
  }
  const tierSel = document.getElementById('planTier');
  if(tierSel.options.length <= 1){
    TIERS.forEach(t=>{
      const opt = document.createElement('option');
      opt.value = t; opt.textContent = 'T'+t;
      tierSel.appendChild(opt);
    });
  }
}

function renderCategorySummary(rows){
  const wrap = document.getElementById('planCategoryWrap');
  const catAgg = aggregateByCategory(rows);
  if(catAgg.length === 0){
    wrap.innerHTML = '<div class="empty-hint">対象の装備がありません。</div>';
    return;
  }
  const catLabel = {}; CATS.forEach(c=>catLabel[c.id]=c.label);
  let html = `<div class="tablewrap"><table class="aggtable"><thead><tr>
    <th>カテゴリ</th><th>品目数</th><th>合計作成数</th><th>合計利益</th>
  </tr></thead><tbody>`;
  catAgg.forEach(a=>{
    html += `<tr>
      <td>${catLabel[a.category] || a.category}</td>
      <td>${fmt(a.itemCount)}</td>
      <td class="plan-qty">${fmt(a.qty)}</td>
      <td class="${a.profit<0?'plan-profit neg':'plan-profit'}">${fmt(a.profit)}</td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  wrap.innerHTML = html;
}

function renderMaterialsSummary(rows){
  const wrap = document.getElementById('planMaterialsWrap');
  const matAgg = aggregateMaterials(rows);
  if(matAgg.length === 0){
    wrap.innerHTML = '<div class="empty-hint">対象の装備がありません。</div>';
    return;
  }
  const totalBuyCost = matAgg.reduce((s,a)=>s+a.buyCost, 0);
  let html = `<div class="tablewrap"><table class="aggtable"><thead><tr>
    <th>素材</th><th>ティア</th><th>必要数</th><th>在庫</th><th>購入数</th><th>単価</th><th>購入金額</th>
  </tr></thead><tbody>`;
  matAgg.forEach(a=>{
    html += `<tr>
      <td>${a.label}</td>
      <td>T${a.tier}.${a.ench}</td>
      <td>${fmt(a.needed)}</td>
      <td>${fmt(a.owned)}</td>
      <td class="plan-qty">${fmt(a.toBuy)}</td>
      <td>${fmt(a.unitPrice)}</td>
      <td>${fmt(a.buyCost)}</td>
    </tr>`;
  });
  html += `</tbody><tfoot><tr><td colspan="6">購入金額 合計</td><td>${fmt(totalBuyCost)}</td></tr></tfoot></table></div>`;
  wrap.innerHTML = html;
}

function renderPlanPage(){
  renderPlanFilters();
  const daysInput = document.getElementById('planDays');
  daysInput.value = state.settings.days || 1;
  let rows = buildPlanRows();

  const cat = document.getElementById('planCategory').value;
  const tier = document.getElementById('planTier').value;
  const q = document.getElementById('planSearch').value.trim().toLowerCase();
  const sortKey = document.getElementById('planSort').value;

  if(cat) rows = rows.filter(r=>r.item.category===cat);
  if(tier) rows = rows.filter(r=>String(r.tier)===tier);
  if(q) rows = rows.filter(r=>r.item.name.toLowerCase().includes(q));

  const sorters = {
    profitTotal:(a,b)=>b.profitTotal-a.profitTotal,
    profitUnit:(a,b)=>b.profitUnit-a.profitUnit,
    volume:(a,b)=>b.volume-a.volume,
    qty:(a,b)=>b.qty-a.qty,
  };
  rows.sort(sorters[sortKey] || sorters.profitTotal);

  // summary (フィルタ前の全登録データを対象に集計)
  const allRows = buildPlanRows();
  const totalProfit = allRows.reduce((s,r)=>s + r.profitTotal, 0);
  document.getElementById('planSummary').innerHTML = `
    <div class="sumcard"><span class="sk">原価・売値とも入力済みの組み合わせ</span><span class="sv">${allRows.length}</span></div>
    <div class="sumcard"><span class="sk">推奨作成数の合計利益</span><span class="sv violet">${fmt(totalProfit)}</span></div>
    <div class="sumcard"><span class="sk">標準都市 / 税率 / 生産日数</span><span class="sv">${CITY_LABELS_JA[state.settings.standardCity]} / ${taxRate()}% / ${state.settings.days||1}日</span></div>
  `;

  renderCategorySummary(rows);
  renderMaterialsSummary(rows);

  const wrap = document.getElementById('planTableWrap');
  if(rows.length === 0){
    wrap.innerHTML = '<div class="empty-hint">「原価入力」の素材単価と「闇市入力」の売値が両方そろうと、ここに計画が表示されます。</div>';
    return;
  }
  let html = `<div class="tablewrap"><table class="plantable"><thead><tr>
    <th>装備</th><th>原価</th><th>闇市売値</th><th>手取り(税引後)</th>
    <th>1日の消化数</th><th>出品比率</th><th>推奨作成数</th><th>個あたり利益</th><th>合計利益</th>
  </tr></thead><tbody>`;
  rows.forEach(r=>{
    html += `<tr>
      <td><div class="plan-item"><img src="${r.item.file}" alt="">
        <span class="pname">${r.item.name}</span><span class="ptier">T${r.tier}.${r.ench}</span></div></td>
      <td>${fmt(r.cost)}</td>
      <td>${fmt(r.sell)}</td>
      <td>${fmt(r.net)}</td>
      <td>${fmt(r.volume)}</td>
      <td><input type="number" class="ratio-input" min="1" max="100" value="${r.ratio}"
        data-item-id="${r.item.id}" data-tier="${r.tier}" data-ench="${r.ench}">%</td>
      <td class="plan-qty">${fmt(r.qty)}</td>
      <td class="${r.profitUnit<0?'plan-profit neg':'plan-profit'}">${fmt(r.profitUnit)}</td>
      <td class="${r.profitTotal<0?'plan-profit neg':'plan-profit'}">${fmt(r.profitTotal)}</td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  wrap.innerHTML = html;
  wrap.querySelectorAll('.ratio-input').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      const v = Math.max(1, Math.min(100, Number(inp.value) || 15));
      setSellRatio(inp.dataset.itemId, Number(inp.dataset.tier), Number(inp.dataset.ench), v);
      renderPlanPage();
    });
  });
}

['planCategory','planTier','planSort'].forEach(id=>{
  document.getElementById(id).addEventListener('change', renderPlanPage);
});
document.getElementById('planSearch').addEventListener('input', renderPlanPage);
document.getElementById('planDays').addEventListener('input', ()=>{
  const v = Math.max(1, Number(document.getElementById('planDays').value) || 1);
  state.settings.days = v;
  saveState();
  renderPlanPage();
});

/* ---------------------------------------------------------------------
   PAGE: 設定
--------------------------------------------------------------------- */
function renderSettingsPage(){
  const citySel = document.getElementById('settingsCity');
  citySel.innerHTML = CITIES.map(c=>`<option value="${c}" ${c===state.settings.standardCity?'selected':''}>${CITY_LABELS_JA[c]}</option>`).join('');
  citySel.onchange = ()=>{
    state.settings.standardCity = citySel.value;
    saveState();
    renderHeader(); renderCostPage(); renderPlanPage();
  };
  const premCk = document.getElementById('settingsPremium');
  premCk.checked = !!state.settings.premium;
  premCk.onchange = ()=>{
    state.settings.premium = premCk.checked;
    saveState();
    renderHeader(); renderPlanPage();
  };
}

/* ---------------------------------------------------------------------
   エクスポート／インポート／リセット
--------------------------------------------------------------------- */
document.getElementById('exportBtn').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'bm_planner_data.json';
  a.click();
  URL.revokeObjectURL(url);
});
document.getElementById('importBtn').addEventListener('click', ()=>{
  document.getElementById('importFileInput').click();
});
document.getElementById('importFileInput').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const data = JSON.parse(reader.result);
      state = Object.assign(defaultState(), data);
      state.settings = Object.assign(defaultState().settings, data.settings || {});
      saveState();
      renderAllPages();
      alert('インポートが完了しました。');
    }catch(err){
      alert('読み込みに失敗しました。正しいJSONファイルか確認してください。');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});
document.getElementById('resetBtn').addEventListener('click', ()=>{
  if(!confirm('すべてのデータ（素材単価・在庫・闇市売値・販売数・設定）を削除します。よろしいですか？')) return;
  state = defaultState();
  saveState();
  renderAllPages();
});

/* ---------------------------------------------------------------------
   初期描画
--------------------------------------------------------------------- */
function renderAllPages(){
  renderHeader();
  renderCostPage();
  bmTab.renderAll();
  volTab.renderAll();
  renderPlanPage();
  renderSettingsPage();
}
renderAllPages();
