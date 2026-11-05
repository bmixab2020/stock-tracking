const STORAGE_KEY = 'stockLists';
const quotes = {};

function loadLists() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function saveLists(lists) { localStorage.setItem(STORAGE_KEY, JSON.stringify(lists)); }

function fmt(n, decimals = 2) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function money(n) { return '$' + fmt(n); }
function pct(n) { if (n === null || n === undefined || isNaN(n)) return '-'; return (n >= 0 ? '+' : '') + fmt(n) + '%'; }

async function fetchQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const proxy = `https://proxy.cors.dev/${url}`;
  const res = await fetch(proxy);
  if (!res.ok) throw new Error('proxy error');
  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta || meta.regularMarketPrice == null) throw new Error('no data for ' + symbol);
  const prev = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice;
  const price = meta.regularMarketPrice;
  return {
    symbol: meta.symbol || symbol,
    regularMarketPrice: price,
    regularMarketChange: price - prev,
    regularMarketChangePercent: meta.regularMarketChangePercent != null ? meta.regularMarketChangePercent : ((price / prev - 1) * 100),
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
    companyName: meta.longName || meta.shortName || symbol,
  };
}

function getListNames() {
  let names = Object.keys(loadLists());
  names = ['My Watchlist', ...names.filter(n => n !== 'My Watchlist')].filter((v, i, arr) => arr.indexOf(v) === i);
  return names;
}

function populateListSelect(selected) {
  const sel = document.getElementById('listSelect');
  sel.innerHTML = '';
  const names = getListNames();
  if (names.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '(no lists)';
    sel.appendChild(opt);
    updateDeleteButton();
    return;
  }
  for (const n of names) {
    const opt = document.createElement('option');
    opt.value = n;
    opt.textContent = n;
    if (n === selected) opt.selected = true;
    sel.appendChild(opt);
  }
  updateDeleteButton();
}

function updateTotals(name) {
  const lists = loadLists();
  const holdings = lists[name] || [];
  let totalMkt = 0, totalDay = 0, totalGain = 0, totalCost = 0;
  for (const h of holdings) {
    const q = quotes[h.symbol];
    const price = q?.regularMarketPrice ?? 0;
    const qty = Number(h.qty) || 0;
    const costAvg = Number(h.costAvg) || 0;
    totalMkt += price * qty;
    totalDay += (q?.regularMarketChange ?? 0) * qty;
    totalGain += (price - costAvg) * qty;
    totalCost += costAvg * qty;
  }
  const totalGainPct = totalCost > 0 ? ((totalMkt / totalCost) - 1) * 100 : 0;
  const foot = document.getElementById('stockFoot');
  foot.innerHTML = '<tr>' +
    '<td>Total</td><td></td><td></td><td></td>' +
    '<td>' + money(totalMkt) + '</td><td></td>' +
    '<td class="' + (totalDay >= 0 ? 'pos' : 'neg') + '">' + money(totalDay) + '</td>' +
    '<td class="' + (totalGainPct >= 0 ? 'pos' : 'neg') + '">' + pct(totalGainPct) + '</td>' +
    '<td class="' + (totalGain >= 0 ? 'pos' : 'neg') + '">' + money(totalGain) + '</td>' +
    '<td></td><td></td><td></td>' +
  '</tr>';
}

async function renderList(name) {
  const body = document.getElementById('stockBody');
  const foot = document.getElementById('stockFoot');
  body.innerHTML = '';
  foot.innerHTML = '';
  if (!name) return;
  const lists = loadLists();
  const holdings = lists[name] || [];
  await Promise.all(holdings.map(async h => {
    try { quotes[h.symbol] = await fetchQuote(h.symbol); }
    catch (e) { /* keep cached */ }
  }));
  let totalMkt = 0, totalDay = 0, totalGain = 0, totalCost = 0;

  for (const h of holdings) {
    const q = quotes[h.symbol];
    const price = q?.regularMarketPrice ?? 0;
    const dayPct = q?.regularMarketChangePercent ?? 0;
    const dayChg = q?.regularMarketChange ?? 0;
    const low = q?.fiftyTwoWeekLow ?? 0;
    const high = q?.fiftyTwoWeekHigh ?? 0;
    const qty = Number(h.qty) || 0;
    const costAvg = Number(h.costAvg) || 0;
    const mktVal = price * qty;
    const dayDollar = dayChg * qty;
    const gainDollar = (price - costAvg) * qty;
    const gainPct = costAvg > 0 ? ((price / costAvg) - 1) * 100 : 0;
    totalMkt += mktVal;
    totalDay += dayDollar;
    totalGain += gainDollar;
    totalCost += costAvg * qty;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><button class="delete" data-symbol="${h.symbol}" title="Deleting stock from the list">x</button> ${h.symbol}</td>
      <td>${money(price)}</td>
      <td><input class="cell-input" data-symbol="${h.symbol}" data-field="costAvg" type="number" step="0.01" value="${costAvg}" /></td>
      <td><input class="cell-input" data-symbol="${h.symbol}" data-field="qty" type="number" step="1" value="${qty}" /></td>
      <td>${money(mktVal)}</td>
      <td class="${dayPct >= 0 ? 'pos' : 'neg'}">${pct(dayPct)}</td>
      <td class="${dayDollar >= 0 ? 'pos' : 'neg'}">${money(dayDollar)}</td>
      <td class="${gainPct >= 0 ? 'pos' : 'neg'}">${pct(gainPct)}</td>
      <td class="${gainDollar >= 0 ? 'pos' : 'neg'}">${money(gainDollar)}</td>
      <td>${money(low)}</td>
      <td>${money(high)}</td>
      <td>${(q?.companyName ?? h.symbol).slice(0, 20)}</td>
    `;
    body.appendChild(tr);
  }

  body.querySelectorAll('.cell-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const sym = inp.dataset.symbol;
      const field = inp.dataset.field;
      const lists2 = loadLists();
      const arr = lists2[name] || [];
      const item = arr.find(x => x.symbol === sym);
      if (item) {
        item[field] = inp.value;
        saveLists(lists2);
        const tr = inp.closest('tr');
        const q = quotes[sym];
        const price = q?.regularMarketPrice ?? 0;
        const qty = Number(item.qty) || 0;
        const costAvg = Number(item.costAvg) || 0;
        const mktVal = price * qty;
        const gainDollar = (price - costAvg) * qty;
        const gainPct = costAvg > 0 ? ((price / costAvg) - 1) * 100 : 0;
        const cells = tr.querySelectorAll('td');
        cells[4].textContent = money(mktVal);
        cells[7].textContent = pct(gainPct);
        cells[7].className = gainPct >= 0 ? 'pos' : 'neg';
        cells[8].textContent = money(gainDollar);
        cells[8].className = gainDollar >= 0 ? 'pos' : 'neg';
        updateTotals(name);
      }
    });
  });
  body.querySelectorAll('.delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const sym = btn.dataset.symbol;
      const lists2 = loadLists();
      lists2[name] = (lists2[name] || []).filter(x => x.symbol !== sym);
      saveLists(lists2);
      renderList(name);
    });
  });

  updateTotals(name);
}

function setStatus(msg) { document.getElementById('status').textContent = msg; }

function updateDeleteButton() {
  const btn = document.getElementById('deleteListBtn');
  const name = document.getElementById('listSelect').value;
  const disabled = !name || name === 'My Watchlist';
  btn.disabled = disabled;
  btn.style.opacity = disabled ? '0.5' : '1';
  btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
}

async function addStock() {
  const symbol = document.getElementById('symbolInput').value.trim().toUpperCase();
  const listName = document.getElementById('listSelect').value || 'My Watchlist';
  if (!symbol) { setStatus('Enter a symbol'); return; }
  setStatus('Fetching...');
  let q;
  try {
    q = await fetchQuote(symbol);
    quotes[symbol] = q;
  } catch (e) {
    alert('Invalid or unknown stock symbol: ' + symbol);
    setStatus('Invalid symbol');
    return;
  }
  const lists = loadLists();
  if (!lists[listName]) lists[listName] = [];
  if (!lists[listName].some(h => h.symbol === symbol)) {
    lists[listName].push({ symbol, costAvg: 0, qty: 0 });
  }
  saveLists(lists);
  populateListSelect(listName);
  document.getElementById('listSelect').value = listName;
  updateDeleteButton();
  setStatus('Added ' + symbol + ' to ' + listName);
  await renderList(listName);
}

function addViewList() {
  const name = document.getElementById('viewNameInput').value.trim();
  if (!name) { setStatus('Enter a view name'); return; }
  const lists = loadLists();
  if (!lists[name]) lists[name] = [];
  saveLists(lists);
  populateListSelect(name);
  document.getElementById('listSelect').value = name;
  updateDeleteButton();
  document.getElementById('viewNameInput').value = '';
  setStatus('Created list ' + name);
}

document.getElementById('addBtn').addEventListener('click', addStock);
document.getElementById('addViewListBtn').addEventListener('click', addViewList);
document.getElementById('refreshBtn').addEventListener('click', () => {
  const name = document.getElementById('listSelect').value;
  if (name) renderList(name);
});
document.getElementById('listSelect').addEventListener('change', (e) => { renderList(e.target.value); updateDeleteButton(); });
document.getElementById('deleteListBtn').addEventListener('click', () => {
  const name = document.getElementById('listSelect').value;
  if (!name || name === 'My Watchlist') return;
  if (!confirm('Delete list ' + name + '?')) return;
  const lists = loadLists();
  delete lists[name];
  saveLists(lists);
  populateListSelect();
  document.getElementById('stockBody').innerHTML = '';
  document.getElementById('stockFoot').innerHTML = '';
  updateDeleteButton();
});
document.getElementById('exportBtn').addEventListener('click', () => {
  const data = JSON.stringify(loadLists(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  a.href = url; a.download = 'stock-lists-' + ts + '.json'; a.click();
  URL.revokeObjectURL(url);
});
document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importInput').click());
document.getElementById('importInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.name.toLowerCase().startsWith('stock-lists')) { setStatus('File must start with stock-lists'); e.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      saveLists(data);
      populateListSelect();
      setStatus('Imported lists');
    } catch { setStatus('Invalid JSON'); }
  };
  reader.readAsText(file);
});
document.getElementById('clearBtn').addEventListener('click', () => {
  if (!confirm('Clear all saved lists?')) return;
  localStorage.removeItem(STORAGE_KEY);
  const l = loadLists();
  l['My Watchlist'] = [];
  saveLists(l);
  populateListSelect('My Watchlist');
  document.getElementById('listSelect').value = 'My Watchlist';
  updateDeleteButton();
  renderList('My Watchlist');
  setStatus('Cleared');
});

document.getElementById('printBtn').addEventListener('click', () => { window.print(); });
const _lists = loadLists();
if (!_lists['My Watchlist']) { _lists['My Watchlist'] = []; saveLists(_lists); }
populateListSelect('My Watchlist');
document.getElementById('listSelect').value = 'My Watchlist';
updateDeleteButton();
renderList('My Watchlist');
