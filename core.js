const STORAGE_KEY = 'stockLists';
const quotes = {};
let sortState = { col: 0, dir: 1 };
let isRendering = false;
let currentDetailSymbol = '';

