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
