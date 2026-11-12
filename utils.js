function fmt(n, decimals = 2) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function money(n) { return '$' + fmt(n); }

function priceMoney(n) { if (n === null || n === undefined || isNaN(n)) return '-'; const decimals = Math.abs(n) < 1 ? 3 : 2; return '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); }

function pct(n) { if (n === null || n === undefined || isNaN(n)) return '-'; return (n >= 0 ? '+' : '') + fmt(n) + '%'; }

function fmtSharesShort(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  if (n >= 1e12) return (n / 1e12).toFixed(2) + ' Tril';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' Bil';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + ' Mil';
  return Number(n).toLocaleString();
}
