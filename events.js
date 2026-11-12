function setStatus(msg) { document.getElementById('status').textContent = msg; }

function showLoading() { document.getElementById('loadingOverlay').classList.add('show'); }

function hideLoading() { document.getElementById('loadingOverlay').classList.remove('show'); }

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
  document.getElementById('symbolInput').value = '';
  setStatus('Added ' + symbol + ' to ' + listName);
  await renderList(listName);
}

function showNewListInput() {
  document.getElementById('listSelect').style.display = 'none';
  document.getElementById('newListWrap').style.display = 'flex';
  document.getElementById('newListInput').value = '';
  document.getElementById('newListInput').focus();
  const addBtn = document.getElementById('addBtn');
  addBtn.disabled = true;
  addBtn.style.opacity = '0.5';
  addBtn.style.cursor = 'not-allowed';
  const refreshBtn = document.getElementById('refreshBtn');
  refreshBtn.disabled = true;
  refreshBtn.style.opacity = '0.5';
  refreshBtn.style.cursor = 'not-allowed';
}

function hideNewListInput() {
  document.getElementById('newListWrap').style.display = 'none';
  document.getElementById('listSelect').style.display = '';
  const addBtn = document.getElementById('addBtn');
  addBtn.disabled = false;
  addBtn.style.opacity = '1';
  addBtn.style.cursor = 'pointer';
  const refreshBtn = document.getElementById('refreshBtn');
  refreshBtn.disabled = false;
  refreshBtn.style.opacity = '1';
  refreshBtn.style.cursor = 'pointer';
}

function saveNewList() {
  const name = document.getElementById('newListInput').value.trim();
  if (!name) { setStatus('Enter a watch list name'); return; }
  const lists = loadLists();
  if (!lists[name]) lists[name] = [];
  saveLists(lists);
  hideNewListInput();
  populateListSelect(name);
  document.getElementById('listSelect').value = name;
  updateDeleteButton();
  renderList(name);
  setStatus('Created list ' + name);
}

function cancelNewList() {
  hideNewListInput();
  const prev = getListNames().find(n => n !== '__new__') || 'My Watchlist';
  document.getElementById('listSelect').value = prev;
  updateDeleteButton();
}

document.getElementById('addBtn').addEventListener('click', addStock);
document.getElementById('symbolInput').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });
document.getElementById('symbolInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') addStock(); });
document.getElementById('saveNewListBtn').addEventListener('click', saveNewList);
document.getElementById('cancelNewListBtn').addEventListener('click', cancelNewList);
document.getElementById('newListInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveNewList(); });
document.getElementById('refreshBtn').addEventListener('click', async () => {
  const name = document.getElementById('listSelect').value;
  if (name) {
    setStatus('Loading ' + name + '...');
    await renderList(name);
    setStatus('');
  }
});
document.getElementById('listSelect').addEventListener('change', async (e) => {
  const value = e.target.value;
  if (value === '__new__') {
    showNewListInput();
    return;
  }
  document.getElementById('newListWrap').style.display = 'none';
  document.getElementById('listSelect').style.display = '';
  setStatus('Loading ' + value + '...');
  await renderList(value);
  updateDeleteButton();
  setStatus('');
});
document.getElementById('deleteListBtn').addEventListener('click', () => {
  const name = document.getElementById('listSelect').value;
  if (!name || name === 'My Watchlist') return;
  if (!confirm('Delete list ' + name + '?')) return;
  const lists = loadLists();
  delete lists[name];
  saveLists(lists);
  populateListSelect('My Watchlist');
  document.getElementById('listSelect').value = 'My Watchlist';
  updateDeleteButton();
  setStatus('');
  renderList('My Watchlist');
});
document.getElementById('exportBtn').addEventListener('click', () => {
  const data = JSON.stringify(loadLists(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const _d = new Date();
  const ts = _d.getFullYear() + '-' + String(_d.getMonth() + 1).padStart(2, '0') + '-' + String(_d.getDate()).padStart(2, '0') + '-' + String(_d.getHours()).padStart(2, '0') + '-' + String(_d.getMinutes()).padStart(2, '0') + '-' + String(_d.getSeconds()).padStart(2, '0');
  a.href = url; a.download = 'stock-lists-' + ts + '.json'; a.click();
  URL.revokeObjectURL(url);
});
document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importInput').click());
document.getElementById('importInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  setStatus('import list, please wait for loading...');
  if (!file.name.toLowerCase().startsWith('stock-lists')) { setStatus('File must start with stock-lists'); e.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      saveLists(data);
      const lists = loadLists();
      if (!lists['My Watchlist']) { lists['My Watchlist'] = []; saveLists(lists); }
      hideNewListInput();
      populateListSelect('My Watchlist');
      document.getElementById('listSelect').value = 'My Watchlist';
      updateDeleteButton();
      setStatus('Loading...');
      await renderList('My Watchlist');
      setStatus('');
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
  setStatus('Loading My Watchlist...');
  renderList('My Watchlist').then(() => setStatus('Cleared'));
});
document.getElementById('printBtn').addEventListener('click', () => {
  const t = 'StockTracking-' + new Date().toISOString().slice(0, 10);
  document.title = t;
  try { if (window.parent && window.parent !== window) window.parent.document.title = t; } catch (e) {}
  window.print();
  setTimeout(() => { try { if (window.parent && window.parent !== window) window.parent.document.title = 'Useful Apps'; } catch (e) {} }, 1000);
});

const baseHeaders = Array.from(document.querySelectorAll('th')).map(th => th.textContent);
function updateSortIcons() {
  document.querySelectorAll('th').forEach((th, i) => {
    th.textContent = baseHeaders[i] + (sortState.col === i ? (sortState.dir === 1 ? ' \u25B2' : ' \u25BC') : '');
  });
}

document.querySelectorAll('th').forEach((th, index) => {
  th.style.cursor = 'pointer';
  th.addEventListener('click', () => {
    if (sortState.col === index) sortState.dir *= -1;
    else { sortState.col = index; sortState.dir = 1; }
    const name = document.getElementById('listSelect').value;
    updateSortIcons();
    if (name) renderList(name);
  });
});

document.getElementById('closeModal').addEventListener('click', () => {
  document.getElementById('detailModal').classList.remove('show');
});
document.getElementById('detailModal').addEventListener('click', (e) => {
  if (e.target.id === 'detailModal') e.target.classList.remove('show');
});

document.getElementById('printDetailBtn').addEventListener('click', () => {
  const _d = new Date();
  const ts = '-' + _d.getFullYear() + '-' + String(_d.getMonth() + 1).padStart(2, '0') + '-' + String(_d.getDate()).padStart(2, '0') + '-' + String(_d.getHours()).padStart(2, '0') + '-' + String(_d.getMinutes()).padStart(2, '0') + '-' + String(_d.getSeconds()).padStart(2, '0');
  const t = 'stockTrack-' + currentDetailSymbol + ts;
  document.title = t;
  try { if (window.parent && window.parent !== window) window.parent.document.title = t; } catch (e) {}
  document.body.classList.add('printing-detail');
  window.print();
  setTimeout(() => { document.body.classList.remove('printing-detail'); try { if (window.parent && window.parent !== window) window.parent.document.title = 'Useful Apps'; } catch (e) {} }, 1000);
});
window.addEventListener('afterprint', () => {
  document.body.classList.remove('printing-detail');
});

updateSortIcons();
const _lists = loadLists();
if (!_lists['My Watchlist']) { _lists['My Watchlist'] = []; saveLists(_lists); }
populateListSelect('My Watchlist');
document.getElementById('listSelect').value = 'My Watchlist';
updateDeleteButton();
setStatus('Loading My Watchlist...');
renderList('My Watchlist').then(() => setStatus(''));


