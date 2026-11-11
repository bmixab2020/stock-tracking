const STORAGE_KEY = 'stockLists';
const quotes = {};
let sortState = { col: 0, dir: 1 };
let isRendering = false;
let currentDetailSymbol = '';

function loadLists() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function saveLists(lists) { localStorage.setItem(STORAGE_KEY, JSON.stringify(lists)); }

function fmt(n, decimals = 2) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function money(n) { return '$' + fmt(n); }
function priceMoney(n) { if (n === null || n === undefined || isNaN(n)) return '-'; const decimals = Math.abs(n) < 1 ? 3 : 2; return '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); }
function pct(n) { if (n === null || n === undefined || isNaN(n)) return '-'; return (n >= 0 ? '+' : '') + fmt(n) + '%'; }

async function fetchExtra(symbol) {
  try {
    const url = 'https://proxy.cors.dev/https://finance.yahoo.com/quote/' + encodeURIComponent(symbol);
    const res = await fetch(url);
    const html = await res.text();
    const mcIdx = html.indexOf('Market Cap (intraday)');
    let marketCap = '-';
    if (mcIdx !== -1) {
      const mcSlice = html.slice(mcIdx, mcIdx + 300);
      const mc = mcSlice.match(/data-value="([^"]+)"/);
      if (mc) marketCap = mc[1];
    }
    const edIdx = html.indexOf('Earnings Date');
    let earningsDate = '-';
    if (edIdx !== -1) {
      const edSlice = html.slice(edIdx, edIdx + 300);
      const ed = edSlice.match(/<span class="value[^>]*title="([^"]+)"/);
      if (ed) earningsDate = ed[1];
    }
    return { marketCap, earningsDate };
  } catch (e) {
    return { marketCap: '-', earningsDate: '-' };
  }
}

async function fetchQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const proxy = `https://proxy.cors.dev/${url}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(proxy);
      const text = await res.text();
      if (!res.ok || text.includes('Too Many Requests')) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      const data = JSON.parse(text);
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta || meta.regularMarketPrice == null) throw new Error('no data for ' + symbol);
      const prev = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice;
      const price = meta.regularMarketPrice;
      let targetPrice = null;
      try {
        const pageRes = await fetch(`https://proxy.cors.dev/https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`);
        const html = await pageRes.text();
        const tm = html.match(/data-field="targetMeanPrice"[^>]*>([\d.]+)/);
        if (tm) targetPrice = parseFloat(tm[1]);
      } catch (e) {}
      return {
        symbol: meta.symbol || symbol,
        regularMarketPrice: price,
        regularMarketChange: price - prev,
        regularMarketChangePercent: meta.regularMarketChangePercent != null ? meta.regularMarketChangePercent : ((price / prev - 1) * 100),
        fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
        fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
        companyName: meta.longName || meta.shortName || symbol,
        tradeVol: meta.regularMarketVolume,
        targetPrice: targetPrice,
      };
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw new Error('no data for ' + symbol);
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

function sortValue(h, col) {
  const q = quotes[h.symbol];
  const price = q?.regularMarketPrice ?? 0;
  const qty = Number(h.qty) || 0;
  const costAvg = Number(h.costAvg) || 0;
  const mktVal = price * qty;
  const dayPct = q?.regularMarketChangePercent ?? 0;
  const dayDollar = (q?.regularMarketChange ?? 0) * qty;
  const gainPct = costAvg > 0 ? ((price / costAvg) - 1) * 100 : 0;
  const gainDollar = (price - costAvg) * qty;
  const low = q?.fiftyTwoWeekLow ?? 0;
  const high = q?.fiftyTwoWeekHigh ?? 0;
  const company = q?.companyName ?? h.symbol;
  switch (col) {
    case 0: return h.symbol;
    case 1: return price;
    case 2: return dayPct;
    case 3: return dayDollar;
    case 4: return q?.tradeVol ?? 0;
    case 5: return q?.marketCap ?? '-';
    case 6: return low;
    case 7: return high;
    case 8: return q?.earningsDate ?? '-';
    case 9: return q?.targetPrice ?? 0;
    case 10: return costAvg;
    case 11: return qty;
    case 12: return mktVal;
    case 13: return gainPct;
    case 14: return gainDollar;
    case 15: return company;
    default: return 0;
  }
}
function sortHoldings(list) {
  if (sortState.col === null) return list;
  const col = sortState.col;
  const dir = sortState.dir;
  return [...list].sort((a, b) => {
    const va = sortValue(a, col);
    const vb = sortValue(b, col);
    if (typeof va === 'string' || typeof vb === 'string') {
      return String(va).localeCompare(String(vb)) * dir;
    }
    return (va - vb) * dir;
  });
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
    totalDay += (q?.regularMarketChange ?? 0);
    totalGain += (price - costAvg) * qty;
    totalCost += costAvg * qty;
  }
  const totalGainPct = totalCost > 0 ? ((totalMkt / totalCost) - 1) * 100 : 0;
  const foot = document.getElementById('stockFoot');
  foot.innerHTML = '<tr>' +
    '<td>Total</td>' +                                    // Stock Symbol
    '<td></td>' +                                         // Price
    '<td></td>' +                                         // Day Chng%
    '<td class="' + (totalDay >= 0 ? 'pos' : 'neg') + '">' + money(totalDay) + '</td>' +  // Day Chng $
    '<td></td>' +                                         // Trade Vol
    '<td></td>' +                                         // Market Cap
    '<td></td>' +                                         // 52 Weeks Low
    '<td></td>' +                                         // 52 Weeks High
    '<td></td>' +                                         // Earning Date
    '<td></td>' +                                         // Target Price
    '<td></td>' +                                         // Cost Average
    '<td></td>' +                                         // Quantity
    '<td>' + money(totalMkt) + '</td>' +                   // Mkt Val
    '<td class="' + (totalGainPct >= 0 ? 'pos' : 'neg') + '">' + pct(totalGainPct) + '</td>' +  // Gain/Loss %
    '<td class="' + (totalGain >= 0 ? 'pos' : 'neg') + '">' + money(totalGain) + '</td>' +      // Gain/Loss $
    '<td></td>' +                                         // Company Name
    '<td></td>' +                                         // delete
  '</tr>';
}

async function renderList(name) {
  if (isRendering) return;
  isRendering = true;
  showLoading();
  try {
    const body = document.getElementById('stockBody');
    const foot = document.getElementById('stockFoot');
    body.innerHTML = '';
    foot.innerHTML = '';
    if (!name) return;
    const lists = loadLists();
    const holdings = lists[name] || [];
    await Promise.all(holdings.map(async h => {
      try {
        const [q, extra] = await Promise.all([fetchQuote(h.symbol), fetchExtra(h.symbol)]);
        quotes[h.symbol] = Object.assign({}, q, extra);
      } catch (e) {
        try { quotes[h.symbol] = await fetchQuote(h.symbol); }
        catch (e2) { /* keep cached */ }
      }
    }));
    const sortedHoldings = sortHoldings(holdings);
    let totalMkt = 0, totalDay = 0, totalGain = 0, totalCost = 0;

    for (const h of sortedHoldings) {
      const q = quotes[h.symbol];
      const price = q?.regularMarketPrice ?? 0;
      const dayPct = q?.regularMarketChangePercent ?? 0;
      const dayChg = q?.regularMarketChange ?? 0;
      const low = q?.fiftyTwoWeekLow ?? 0;
      const high = q?.fiftyTwoWeekHigh ?? 0;
      const qty = Number(h.qty) || 0;
      const costAvg = Number(h.costAvg) || 0;
      const mktVal = price * qty;
      const dayDollar = dayChg;
      const gainDollar = (price - costAvg) * qty;
      const gainPct = costAvg > 0 ? ((price / costAvg) - 1) * 100 : 0;
      totalMkt += mktVal;
      totalDay += dayDollar;
      totalGain += gainDollar;
      totalCost += costAvg * qty;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><a href="#" class="sym-link" data-symbol="${h.symbol}" title="See detail on this stock">${h.symbol}</a></td>
        <td>${priceMoney(price)}</td>
        <td class="${dayPct >= 0 ? 'pos' : 'neg'}">${pct(dayPct)}</td>
        <td class="${dayDollar >= 0 ? 'pos' : 'neg'}">${money(dayDollar)}</td>
        <td>${(q?.tradeVol ?? 0).toLocaleString()}</td>
        <td>${q?.marketCap ?? '-'}</td>
        <td>${money(low)}</td>
        <td>${money(high)}</td>
        <td>${q?.earningsDate ?? '-'}</td>
        <td>${q?.targetPrice != null ? money(q.targetPrice) : '-'}</td>
        <td><input class="cell-input" data-symbol="${h.symbol}" data-field="costAvg" type="text" value="$${Number(costAvg).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}" /></td>
        <td><input class="cell-input" data-symbol="${h.symbol}" data-field="qty" type="text" value="${Number(qty).toLocaleString()}" /></td>
        <td>${money(mktVal)}</td>
        <td class="${gainPct >= 0 ? 'pos' : 'neg'}">${pct(gainPct)}</td>
        <td class="${gainDollar >= 0 ? 'pos' : 'neg'}">${money(gainDollar)}</td>
        <td>${(q?.companyName ?? h.symbol).slice(0, 20)}</td>
        <td><button class="delete" data-symbol="${h.symbol}" title="Deleting stock from the list">x</button></td>
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
          const cleaned = inp.value.replace(/[$,]/g, '');
          item[field] = cleaned;
          saveLists(lists2);
          if (field === 'qty') inp.value = Number(item[field] || 0).toLocaleString();
          if (field === 'costAvg') inp.value = '$' + Number(item[field] || 0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
          const tr = inp.closest('tr');
          const q = quotes[sym];
          const price = q?.regularMarketPrice ?? 0;
          const qty = Number(item.qty) || 0;
          const costAvg = Number(item.costAvg) || 0;
          const mktVal = price * qty;
          const gainDollar = (price - costAvg) * qty;
          const gainPct = costAvg > 0 ? ((price / costAvg) - 1) * 100 : 0;
          const cells = tr.querySelectorAll('td');
          cells[12].textContent = money(mktVal);
          cells[13].textContent = pct(gainPct);
          cells[13].className = gainPct >= 0 ? 'pos' : 'neg';
          cells[14].textContent = money(gainDollar);
          cells[14].className = gainDollar >= 0 ? 'pos' : 'neg';
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

    body.querySelectorAll('.sym-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        openDetail(link.dataset.symbol);
      });
    });

    updateTotals(name);
  } finally {
    isRendering = false;
    hideLoading();
  }
}

function fmtSharesShort(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  if (n >= 1e12) return (n / 1e12).toFixed(2) + ' Tril';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' Bil';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + ' Mil';
  return Number(n).toLocaleString();
}

async function fetchDetail(symbol) {
  const data = { symbol, price: null, marketCap: '-', earningsDate: '-', company: symbol, description: '', employees: '-', news: [], splits: [], dividends: [], recentShortVolume: [], history: [], dividend: '-', shortRatio: '-', shortPercent: '-', sharesShort: '-', sharesShortTotal: '-', sharesShortDate: '-', shortInterestValue: null, marketCapRaw: '-' };
  try {
    const chartUrl = `https://proxy.cors.dev/https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const chartRes = await fetch(chartUrl);
    const chartJson = await chartRes.json();
    const meta = chartJson?.chart?.result?.[0]?.meta;
    if (meta) {
      data.price = meta.regularMarketPrice;
      data.company = meta.longName || meta.shortName || symbol;
      data.low = meta.fiftyTwoWeekLow;
      data.high = meta.fiftyTwoWeekHigh;
    }
    // split history
    try {
      const splitUrl = `https://proxy.cors.dev/https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&range=max&events=split`;
      const splitRes = await fetch(splitUrl);
      const splitJson = await splitRes.json();
      const splits = splitJson?.chart?.result?.[0]?.events?.splits || {};
      data.splits = Object.values(splits).map(s => ({
        date: new Date(s.date * 1000).toLocaleDateString(),
        ratio: s.splitRatio,
        reverse: s.denominator > s.numerator
      })).sort((a,b) => new Date(b.date) - new Date(a.date));
    } catch (e) { data.splits = []; }
    // price history (1 year)
    try {
      const histUrl = `https://proxy.cors.dev/https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y`;
      const histRes = await fetch(histUrl);
      const histJson = await histRes.json();
      const r = histJson?.chart?.result?.[0];
      const ts = r?.timestamp || [];
      const closes = r?.indicators?.quote?.[0]?.close || [];
      data.history = ts.map((t, i) => ({ date: new Date(t * 1000).toLocaleDateString(), price: closes[i] })).filter(p => p.price != null);
    } catch (e) { data.history = []; }
    // dividend history (last 5)
    try {
      const divUrl = `https://proxy.cors.dev/https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2y&events=div`;
      const divRes = await fetch(divUrl);
      const divJson = await divRes.json();
      const divs = divJson?.chart?.result?.[0]?.events?.dividends || {};
      data.dividends = Object.values(divs).map(d => ({
        date: new Date(d.date * 1000).toLocaleDateString(),
        amount: d.amount
      })).sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0,5);
    } catch (e) { data.dividends = []; }
    // recent volume (last 5 trading days)
    try {
      const volUrl = `https://proxy.cors.dev/https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
      const volRes = await fetch(volUrl);
      const volJson = await volRes.json();
      const r = volJson?.chart?.result?.[0];
      const ts = r?.timestamp || [];
      const vols = r?.indicators?.quote?.[0]?.volume || [];
      const pairs = ts.map((t,i) => ({ date: new Date(t*1000).toLocaleDateString(), volume: vols[i] })).filter(p => p.volume != null);
      data.recentShortVolume = pairs.slice(-5);
    } catch (e) { data.recentShortVolume = []; }
  } catch (e) {}
  try {
    const pageUrl = `https://proxy.cors.dev/https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`;
    const pageRes = await fetch(pageUrl);
    const html = await pageRes.text();
    const mcIdx = html.indexOf('Market Cap (intraday)');
    if (mcIdx !== -1) {
      const mcSlice = html.slice(mcIdx, mcIdx + 300);
      const mc = mcSlice.match(/data-value="([^"]+)"/);
      if (mc) data.marketCap = mc[1];
    }
    const edIdx = html.indexOf('Earnings Date');
    if (edIdx !== -1) {
      const edSlice = html.slice(edIdx, edIdx + 300);
      const ed = edSlice.match(/<span class="value[^>]*title="([^"]+)"/);
      if (ed) data.earningsDate = ed[1];
    }
    const descMatch = html.match(/\\"longBusinessSummary\\":\\"([^"\\]+)\\"/);
    if (descMatch) data.description = descMatch[1].replace(/\u002F/g, '/').replace(/\u0026/g, '&');
    const empMatch = html.match(/\\"fullTimeEmployees\\":(\d+)/);
    if (empMatch) data.employees = Number(empMatch[1]).toLocaleString();
    const sectorMatch = html.match(/\\"sectorDisp\\":\\"([^"\\]+)\\"/);
    if (sectorMatch) data.sector = sectorMatch[1];
    const industryMatch = html.match(/\\"industryDisp\\":\\"([^"\\]+)\\"/);
    if (industryMatch) data.industry = industryMatch[1];
    const targetMatch = html.match(/data-field="targetMeanPrice"[^>]*>([\d.]+)/);
    if (targetMatch) data.targetPrice = parseFloat(targetMatch[1]);
    const divIdx = html.indexOf('Forward Dividend');
    if (divIdx !== -1) {
      const divSlice = html.slice(divIdx, divIdx + 200);
      const divMatch = divSlice.match(/title="([^"]+)"/);
      if (divMatch) data.dividend = divMatch[1];
    }
  } catch (e) {}
  try {
    const statsUrl = 'https://proxy.cors.dev/https://finance.yahoo.com/quote/' + encodeURIComponent(symbol) + '/key-statistics';
    const statsRes = await fetch(statsUrl);
    const statsHtml = await statsRes.text();
    function parseSharesShort(str) {
      const m = str.match(/([\d.]+)\s*([KMBT]?)/i);
      if (!m) return null;
      let num = parseFloat(m[1]);
      const suf = m[2].toUpperCase();
      if (suf === 'K') num *= 1e3;
      else if (suf === 'M') num *= 1e6;
      else if (suf === 'B') num *= 1e9;
      else if (suf === 'T') num *= 1e12;
      return num;
    }
    function extractStat(label) {
      const idx = statsHtml.indexOf(label);
      if (idx === -1) return '-';
      const slice = statsHtml.slice(idx, idx + 160);
      const m = slice.match(/<td class="value[^>]*>([^<]+)</);
      const d = slice.match(/\(([^)]+)\)/);
      const val = m ? m[1].trim() : '-';
      const dt = d ? d[1] : '';
      const base = (val === '--' || val.startsWith('--')) ? 'N/A' : val;
      return (base !== 'N/A' && dt) ? base + ' as of ' + dt : base;
    }
    data.shortRatio = extractStat('Short Ratio');
    data.shortPercent = extractStat('Short % of Float');
    const ssRaw = extractStat('Shares Short');
    data.sharesShort = ssRaw;
    if (ssRaw === 'N/A' || ssRaw.startsWith('--')) {
      data.sharesShortTotal = 'N/A';
      data.sharesShortDate = '-';
    }
    const ssIdx = statsHtml.indexOf('Shares Short');
    const ssSlice = ssIdx !== -1 ? statsHtml.slice(ssIdx, ssIdx + 80) : '';
    const ssDateMatch = ssSlice.match(/\(([^)]+)\)/);
    if (ssRaw !== 'N/A' && !ssRaw.startsWith('--')) {
      data.sharesShortDate = ssDateMatch ? ssDateMatch[1] : '-';
    }
    if (ssRaw !== 'N/A' && !ssRaw.startsWith('--')) {
      const ssNum = parseSharesShort(ssRaw);
      data.sharesShortTotal = ssNum != null ? fmtSharesShort(ssNum) : '-';
      data.shortInterestValue = (ssNum != null && data.price) ? (ssNum * data.price) : null;
    } else {
      data.sharesShortTotal = 'N/A';
      data.sharesShortDate = '-';
      data.shortInterestValue = null;
    }
  } catch (e) {}

  try {
    const newsUrl = `https://proxy.cors.dev/https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
    const newsRes = await fetch(newsUrl);
    const newsText = await newsRes.text();
    const items = newsText.match(/<item>[\s\S]*?<\/item>/g) || [];
    data.news = items.slice(0, 5).map(item => {
      const title = (item.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
      const link = (item.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
      return { title: title.replace(/<!\[CDATA\[|\]\]>/g, '').trim(), link: link.trim() };
    });
  } catch (e) {}
  return data;
}


function renderDetail(data) {
  const price = priceMoney(data.price);
  const mc = data.marketCap || '-';
  const ed = data.earningsDate || '-';
  const desc = data.description || 'No description available.';
  const employees = data.employees || '-';
  const sector = data.sector || '-';
  const industry = data.industry || '-';
  const low = priceMoney(data.low);
  const high = priceMoney(data.high);
  const newsHtml = (data.news && data.news.length)
    ? '<ul class="news-list">' + data.news.map(n => `<li><a href="${n.link}" target="_blank" rel="noopener">${n.title}</a></li>`).join('') + '</ul>'
    : '<p>No recent news found.</p>';

  const riskScore = (data.price && data.low) ? Math.max(0, Math.min(100, Math.round((1 - (data.price / (data.low * 1.5 || 1))) * 100))) : 50;
  const dilutionScore = (data.marketCap && data.marketCap !== '-') ? 30 : 50;

  return `
    <div class="detail-section">
      <h2>${data.symbol} - ${data.company}</h2>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">Current Price</div><div class="value">${price}</div></div>
        <div class="detail-item"><div class="label">Market Cap</div><div class="value">${mc}</div></div>
        <div class="detail-item"><div class="label">Target Price</div><div class="value">${data.targetPrice != null ? money(data.targetPrice) : '-'}</div></div>
        <div class="detail-item"><div class="label">52W Low / High</div><div class="value">${low} / ${high}</div></div>
        <div class="detail-item"><div class="label">Earnings Date</div><div class="value">${ed}</div></div>
        <div class="detail-item"><div class="label">Sector</div><div class="value">${sector}</div></div>
        <div class="detail-item"><div class="label">Industry</div><div class="value">${industry}</div></div>
        <div class="detail-item"><div class="label">Employees</div><div class="value">${employees}</div></div>
      </div>
    </div>
    <div class="detail-section">
      <h3>Company Overview</h3>
      <p>${desc}</p>
    </div>
    <div class="detail-section">
      <h3>Split History</h3>
      ${data.splits && data.splits.length ? '<ul>' + data.splits.map(s => `<li>${s.date}: ${s.ratio}${s.reverse ? ' (reverse split)' : ''}</li>`).join('') + '</ul>' : '<p>No splits recorded.</p>'}
    </div>
    <div class="detail-section">
      <h3>Latest News</h3>
      ${newsHtml}
    </div>
    <div class="detail-section">
      <h3>Price History</h3>
      <p style="margin-left:16px;"><a href="https://finance.yahoo.com/quote/${data.symbol}/" target="_blank" rel="noopener">View Price History on Yahoo Finance</a></p>
    </div>
    <div class="detail-section">
      <h3>Dividend & Short Information</h3>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">Forward Dividend & Yield</div><div class="value">${data.dividend}</div></div>
        <div class="detail-item"><div class="label">Short Ratio</div><div class="value">${data.shortRatio}</div></div>
        <div class="detail-item"><div class="label">Short % of Float</div><div class="value">${data.shortPercent}</div></div>
        <div class="detail-item"><div class="label">Shares Short</div><div class="value">${(data.sharesShortTotal !== '-' && data.sharesShortTotal !== 'N/A') ? data.sharesShortTotal + ' as of ' + data.sharesShortDate : data.sharesShortTotal}</div></div>
        <div class="detail-item"><div class="label">Short Interest Value</div><div class="value">${data.shortInterestValue != null ? money(data.shortInterestValue) : 'N/A'}</div></div>
      </div>
      ${data.sharesShortDate !== '-' && data.sharesShortDate !== '' ? '<p style="font-size:11px;color:#555;margin-top:8px;">Short data as of ' + data.sharesShortDate + '.</p>' : ''}
    </div>
    <div class="detail-section">
      <h3>Dividend History (Last 5 times)</h3>
      ${data.dividends && data.dividends.length ? '<ul>' + data.dividends.map(d => `<li>${d.date}: $${Number(d.amount).toFixed(4)}</li>`).join('') + '</ul>' : '<p>No dividends recorded.</p>'}
    </div>
    <div class="detail-section">
      <h3>Recent Trade Volume (Last 5 days)</h3>
      ${data.recentShortVolume && data.recentShortVolume.length ? '<ul>' + data.recentShortVolume.map(v => `<li>${v.date}: ${Number(v.volume).toLocaleString()}</li>`).join('') + '</ul>' : '<p>No volume data.</p>'}
    </div>
    <div class="detail-section">
      <h3>Risk Analysis</h3>
      <div class="detail-grid">
        <div class="detail-item"><div class="label">Bankruptcy Risk Score (0-100, higher=worse)</div><div class="value">${riskScore}</div></div>
        <div class="detail-item"><div class="label">Dilution / Split Risk Score (0-100, higher=worse)</div><div class="value">${dilutionScore}</div></div>
      </div>
      <p style="font-size:11px;color:#555;margin-top:8px;">Heuristic scores based on price vs 52W low and available data. Not financial advice.</p>
    </div>
    <div class="detail-section">
      <h3>Options (Put/Call) &amp; Expiration Dates</h3>
      <p style="margin-left:16px;"><a href="https://finance.yahoo.com/quote/${data.symbol}/options" target="_blank" rel="noopener">View options on Yahoo Finance</a></p>
    </div>
    <div class="detail-section">
      <h3>Stock Lockup Period</h3>
      <p style="margin-left:16px;"><a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(data.company)}&type=10-K&dateb=&owner=include&count=10" target="_blank" rel="noopener">Search SEC EDGAR filings</a></p>
    </div>
    <div class="detail-section">
      <h3>Warrants &amp; Redemption Dates</h3>
      <p style="margin-left:16px;"><a href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(data.company)}&type=10-K&dateb=&owner=include&count=10" target="_blank" rel="noopener">Search SEC EDGAR filings</a></p>
    </div>
  `;
}

function openDetail(symbol) {
  currentDetailSymbol = symbol;
  const modal = document.getElementById('detailModal');
  const body = document.getElementById('detailBody');
  modal.classList.add('show');
  body.innerHTML = 'Loading ' + symbol + '...';
  fetchDetail(symbol).then(data => {
    body.innerHTML = renderDetail(data);
  }).catch(err => {
    body.innerHTML = 'Failed to load details: ' + err.message;
  });
}

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
document.getElementById('refreshBtn').addEventListener('click', () => {
  const name = document.getElementById('listSelect').value;
  if (name) renderList(name);
});
document.getElementById('listSelect').addEventListener('change', (e) => {
  const value = e.target.value;
  if (value === '__new__') {
    showNewListInput();
    return;
  }
  document.getElementById('newListWrap').style.display = 'none';
  document.getElementById('listSelect').style.display = '';
  renderList(value);
  updateDeleteButton();
});
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
  const _d = new Date();
  const ts = _d.getFullYear() + '-' + String(_d.getMonth() + 1).padStart(2, '0') + '-' + String(_d.getDate()).padStart(2, '0') + '-' + String(_d.getHours()).padStart(2, '0') + '-' + String(_d.getMinutes()).padStart(2, '0') + '-' + String(_d.getSeconds()).padStart(2, '0');
  a.href = url; a.download = 'stock-lists-' + ts + '.json'; a.click();
  URL.revokeObjectURL(url);
});
document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importInput').click());
document.getElementById('importInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
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
  renderList('My Watchlist');
  setStatus('Cleared');
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
renderList('My Watchlist');


window.__openDetail = openDetail;

window.fetchQuote = fetchQuote;

window.__fetchQuote = fetchQuote;
