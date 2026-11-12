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
