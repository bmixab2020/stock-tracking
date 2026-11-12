function loadLists() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

function saveLists(lists) { localStorage.setItem(STORAGE_KEY, JSON.stringify(lists)); }

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
    const addOpt = document.createElement('option');
    addOpt.value = '__new__';
    addOpt.textContent = '+ Add new watchlist';
    sel.appendChild(addOpt);
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
  const addOpt = document.createElement('option');
  addOpt.value = '__new__';
  addOpt.textContent = '+ Add new watchlist';
  sel.appendChild(addOpt);
  updateDeleteButton();
}
