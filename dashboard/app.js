// Token Launch Radar — the dashboard. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, a filterable table, a
// per-protocol detail view with the model's own inputs and the protocol's farm
// plan, the live-token set and the model itself. No network: every byte it
// shows is in data.js, and no address in it points anywhere else.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('app');
  var state = { tab: 'board', q: '', category: 'all', chain: 'all', verdict: 'all', sort: 'implied', dir: -1, watchOnly: false, selected: null };
  var sandbox = { curveScale: 1, growthWeight: DATA.model.growth_weight };

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtFull(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return (Math.round(n * 10000) / 10000).toFixed(4).replace(/0+$/, '').replace(/\.$/, '.0'); }

  // The model, recomputed in the page from the row's own factors: the same
  // arithmetic main.ts ran, so the page can check the board's number instead
  // of taking it on trust. Full-precision factors are carried in data.js, so
  // the recompute lands on the same dollar. The base is the power law fitted
  // to the live tokens: exp(intercept + slope x ln(TVL)).
  function impliedOf(row) {
    var base = Math.exp(DATA.fit.intercept + DATA.fit.slope * Math.log(row.tvl_usd));
    return Math.max(1, Math.round(base * row.growth_multiplier * row.maturity_multiplier * row.chain_multiplier));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json:
  // category, chains, TVL and age decide the action, the capital, the hold
  // and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0) return 'Deposit $' + capital + ' into ' + name + "'s highest-TVL vault on " + chain + ' and keep the shares.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('capital') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('payment') >= 0) return 'Send $' + capital + ' through ' + name + ' on ' + chain + ' and keep the receipt.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + " into " + name + "'s basis vault on " + chain + ' and keep the position open.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + name + "'s chain and use one of its apps.";
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Make one qualifying action each week, such as a deposit, a borrow, a repayment or a vote.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0) return 'Make one qualifying action each week, such as a deposit, a swap, a claim or a vote.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Make one qualifying action each week, such as a trade, a funding payment or a vote.';
    if (c.indexOf('rwa') >= 0) return 'Make one qualifying action each week, such as a mint, a redemption or a vote.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Make one qualifying action each week, such as a deposit, a rebalance or a vote.';
    return 'Make one qualifying action each week, such as a deposit, a swap or a vote.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: weeklyFor(p), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('verdict')) state.verdict = params.get('verdict');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('watch') === '1') state.watchOnly = true;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.verdict !== 'all') params.set('verdict', state.verdict);
    if (state.watchOnly) params.set('watch', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    window.history.replaceState(null, '', next ? '#' + next : window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchOnly && !r.on_watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function hero() {
    var top = DATA.rows[0];
    var b = DATA.backtest;
    var meanBetter = b.baseline_mean_log_err > 0 ? Math.round((1 - b.model_mean_log_err / b.baseline_mean_log_err) * 100) : 0;
    var medBetter = b.baseline_median_log_err > 0 ? Math.round((1 - b.model_median_log_err / b.baseline_median_log_err) * 100) : 0;
    return el('header', { class: 'hero' },
      el('p', { class: 'kicker', text: 'Token Launch Radar · ' + DATA.model_version + ' model · Snapshot ' + DATA.as_of }),
      el('h1', null, 'Pre-token protocols, ranked by ', el('span', { class: 'thin', text: 'implied value' })),
      el('p', { class: 'lede' },
        'The watchlist is the floor: every protocol with at least ', el('b', { text: fmtUsd(DATA.floor_usd) }),
        ' of TVL and no token on record. The early radar adds ', el('b', { text: String(DATA.early_size) }),
        ' pre-token protocols below that floor, scored the same way. Implied value is a model, not a promise — ',
        el('b', { text: top ? top.name + ' leads at ' + fmtUsd(top.implied_value_usd) : '' }), '. Each row carries a range and a verdict — ',
        el('b', { text: 'Farm' }), ', ', el('b', { text: 'Thin' }), ' or ', el('b', { text: 'Skip' }), ' — netted from that range against the board\u2019s median. ',
        'The curve was tested blind over the ', el('b', { text: String(b.live_tokens) }), ' live tokens and beats a flat multiple by ',
        el('b', { text: String(meanBetter) + '% on the mean error' }), ' and ', el('b', { text: String(medBetter) + '% on the median' }), '.'
      ),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('div', { class: 'n amber', text: String(DATA.watchlist_size) }), el('div', { class: 'l', text: 'Watchlist covered' })),
        el('div', { class: 'stat' }, el('div', { class: 'n', text: String(DATA.board_size) }), el('div', { class: 'l', text: 'Rows ranked' })),
        el('div', { class: 'stat' }, el('div', { class: 'n green', text: String(DATA.early_size) }), el('div', { class: 'l', text: 'Early rows below floor' })),
        el('div', { class: 'stat' }, el('div', { class: 'n', text: String(DATA.live_size) }), el('div', { class: 'l', text: 'Live tokens set aside' })),
        el('div', { class: 'stat' }, el('div', { class: 'n', text: String(DATA.fit.live_tokens) }), el('div', { class: 'l', text: 'Live comps fitted' })),
      )
    );
  }

  function tabs() {
    function tab(name, label) {
      return el('button', { type: 'button', class: 'tab' + (state.tab === name ? ' on' : ''), text: label, onclick: function () { state.tab = name; state.selected = null; writeHash(); render(); } });
    }
    return el('div', { class: 'tabs', role: 'tablist' },
      tab('board', 'Board (' + DATA.board_size + ')'),
      tab('live', 'Live tokens (' + DATA.live_size + ')'),
      tab('model', 'Model')
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = el('select', { 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var verdictSel = el('select', { 'aria-label': 'Filter by verdict' },
      [['all', 'All verdicts'], ['Farm', 'Farm'], ['Thin', 'Thin'], ['Skip', 'Skip']].map(function (o) {
        return el('option', { value: o[0], text: o[1], selected: state.verdict === o[0] ? 'selected' : null });
      })
    );
    verdictSel.addEventListener('change', function () { state.verdict = verdictSel.value; writeHash(); render(); });
    var watchChk = el('input', { type: 'checkbox', id: 'watchonly', checked: state.watchOnly ? 'checked' : null });
    watchChk.addEventListener('change', function () { state.watchOnly = watchChk.checked; writeHash(); render(); });
    var sortSel = el('select', { 'aria-label': 'Sort the board' },
      [['implied', 'Sort: implied value'], ['tvl', 'Sort: TVL'], ['growth', 'Sort: 7-day change'], ['age', 'Sort: age'], ['name', 'Sort: name']].map(function (o) {
        return el('option', { value: o[0], text: o[1], selected: state.sort === o[0] ? 'selected' : null });
      })
    );
    sortSel.addEventListener('change', function () { state.sort = sortSel.value; state.dir = -1; render(); });
    return el('div', { class: 'controls' },
      search, catSel, chainSel, verdictSel, sortSel,
      el('label', { class: 'chk', for: 'watchonly' }, watchChk, ' Watchlist only'),
      el('span', { class: 'count', text: filteredRows().length + ' of ' + DATA.board_size + ' rows' })
    );
  }

  function sortHeader(key, label) {
    var arrow = state.sort === key ? (state.dir < 0 ? ' ▼' : ' ▲') : '';
    return el('th', { scope: 'col', class: 'sortable', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } }, label + arrow);
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'tab', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.verdict = 'all'; state.watchOnly = false; writeHash(); render(); } })
      ));
    }
    var max = DATA.rows[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? 'flat' : r.change_7d >= 0 ? 'up' : 'down';
      var tr = el('tr', {
        class: (r.rank <= 3 ? 'top3' : '') + (state.selected === r.slug ? ' sel' : ''),
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'rank', text: String(r.rank) }),
        el('td', { class: 'name' },
          el('b', null, r.name,
            r.on_watchlist
              ? el('span', { class: 'badge watch', text: 'WATCHLIST' })
              : el('span', { class: 'badge early', text: 'EARLY' })
          ),
          el('span', { class: 'slug', text: r.slug })
        ),
        el('td', null, el('span', { class: 'pill', text: r.category || 'Other' })),
        el('td', { class: 'num', text: (r.chains || []).slice(0, 2).join(', ') || '—' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num' }, el('span', { class: 'verdict ' + (r.verdict || '').toLowerCase(), text: r.verdict || '—' })),
        el('td', { class: 'impl' },
          el('div', { text: fmtUsd(r.implied_value_usd) }),
          el('div', { class: 'range', text: fmtUsd(r.implied_low_usd) + ' – ' + fmtUsd(r.implied_high_usd) }),
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' }))
        )
      );
      tbody.appendChild(tr);
    });
    return el('table', { class: 'board' },
      el('thead', null, el('tr', null,
        sortHeader('implied', 'Rank'),
        sortHeader('name', 'Protocol'),
        el('th', { scope: 'col', text: 'Category' }),
        el('th', { scope: 'col', text: 'Chains' }),
        sortHeader('tvl', 'TVL'),
        sortHeader('growth', '7d'),
        sortHeader('age', 'Age'),
        el('th', { scope: 'col', text: 'Verdict' }),
        sortHeader('implied', 'Implied value')
      )),
      tbody
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'rank', text: 'live' }),
        el('td', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'slug', text: r.slug })),
        el('td', null, el('span', { class: 'pill', text: r.category || 'Other' })),
        el('td', { class: 'num', text: (r.chains || []).slice(0, 2).join(', ') || '—' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d === null ? 'flat' : r.change_7d >= 0 ? 'up' : 'down'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: '—' }),
        el('td', { class: 'impl' }, fmtUsd(r.mcap_usd))
      ));
    });
    return el('div', null,
      el('p', { class: 'lede' }, 'These protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and they are the peers the model prices the board against.'),
      el('table', { class: 'board' },
        el('thead', null, el('tr', null,
          el('th', { scope: 'col', text: 'Status' }),
          el('th', { scope: 'col', text: 'Protocol' }),
          el('th', { scope: 'col', text: 'Category' }),
          el('th', { scope: 'col', text: 'Chains' }),
          el('th', { scope: 'col', text: 'TVL' }),
          el('th', { scope: 'col', text: '7d' }),
          el('th', { scope: 'col', text: 'Age' }),
          el('th', { scope: 'col', text: 'Market cap' })
        )),
        tbody
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var f = DATA.fit;
    var b = DATA.backtest;
    var sandboxOut = el('div', { id: 'sandbox-out' });
    var curveScale = el('input', { type: 'range', min: '0.5', max: '2', step: '0.05', value: String(sandbox.curveScale) });
    var curveVal = el('span', { class: 'val', text: sandbox.curveScale.toFixed(2) + 'x' });
    var growthW = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(sandbox.growthWeight) });
    var growthVal = el('span', { class: 'val', text: sandbox.growthWeight.toFixed(2) });
    function renderSandbox() {
      sandbox.curveScale = parseFloat(curveScale.value);
      sandbox.growthWeight = parseFloat(growthW.value);
      curveVal.textContent = sandbox.curveScale.toFixed(2) + 'x';
      growthVal.textContent = sandbox.growthWeight.toFixed(2);
      var rescored = DATA.rows.map(function (r) {
        var growthMult = 1 + (r.growth_pct / 100) * sandbox.growthWeight;
        var v = Math.max(1, Math.round(r.base_value_usd * sandbox.curveScale * growthMult * r.maturity_multiplier * r.chain_multiplier));
        return { slug: r.slug, name: r.name, implied: v, was: r.rank };
      }).sort(function (a, b) { return b.implied - a.implied || (a.slug < b.slug ? -1 : 1); });
      sandboxOut.textContent = '';
      var rows = rescored.slice(0, 10).map(function (r, i) {
        return el('tr', null,
          el('td', { class: 'num', text: String(i + 1) }),
          el('td', { text: r.name }),
          el('td', { class: 'num', text: fmtUsd(r.implied) }),
          el('td', { class: 'num', text: 'was #' + r.was })
        );
      });
      sandboxOut.appendChild(el('table', { class: 'mini' },
        el('thead', null, el('tr', null,
          el('th', { scope: 'col', text: 'Rank' }),
          el('th', { scope: 'col', text: 'Protocol' }),
          el('th', { scope: 'col', text: 'Implied value' }),
          el('th', { scope: 'col', text: 'Board rank' })
        )),
        el('tbody', null, rows)
      ));
    }
    curveScale.addEventListener('input', renderSandbox);
    growthW.addEventListener('input', renderSandbox);
    renderSandbox();
    var meanBetter = b.baseline_mean_log_err > 0 ? Math.round((1 - b.model_mean_log_err / b.baseline_mean_log_err) * 100) : 0;
    var medBetter = b.baseline_median_log_err > 0 ? Math.round((1 - b.model_median_log_err / b.baseline_median_log_err) * 100) : 0;
    return el('div', null,
      el('section', { class: 'panel' },
        el('h2', { text: 'How implied value is computed' }),
        el('p', null, 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. The base is a power law fitted to the ', el('b', { text: String(f.live_tokens) }), ' protocols that already trade, at run time from this snapshot: log(market cap) = ', el('code', { text: f.intercept.toFixed(4) + ' + ' + f.slope.toFixed(4) + ' x log(TVL)' }), '. A token\u2019s value grows slower than the TVL behind it, so a flat multiple overstates the biggest protocols and understates the small ones — the curve is what the live tokens actually show.'),
        el('div', { class: 'formula' },
          'implied = round( exp(', String(f.intercept.toFixed(4)), ' + ', String(f.slope.toFixed(4)), ' x ln(tvl_usd)) × (1 + clamp(change_7d, ', String(m.growth_floor), ', ', String(m.growth_cap), ') / 100 × ', String(m.growth_weight), ') × (', String(m.maturity_floor), ' + min(age_days, ', String(m.maturity_days), ') / ', String(m.maturity_days), ' × ', String(m.maturity_range), ') × (1 + ', String(m.chain_step), ' × min(chains − 1, ', String(m.chain_max_steps), ')) )'
        ),
        el('p', null, 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ', el('code', { text: String(m.unknown_age_days) + ' days' }), '. The three adjustments are kept small on purpose: the fitted curve, not the knobs, drives the ranking. A protocol is rankable when it records no token and is not an exchange, a bridge, a liquid-staking product, a versioned pool or a wrapped or staked product of a token that already trades — the same rule the snapshot\u2019s own watchlist was drawn with, applied below its floor too.')
      ),
      el('section', { class: 'panel' },
        el('h2', { text: 'Tested blind, against a flat multiple' }),
        el('p', null, 'Leave-one-out over the ', el('b', { text: String(b.live_tokens) }), ' live tokens: refit the curve without each token, predict its market cap, and measure the error in log terms. The flat median multiple is the baseline the curve is tested against. A category offset and a separate growth term were tried the same way and dropped — each made the out-of-sample error worse.'),
        el('table', { class: 'mini' },
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Model' }),
            el('th', { scope: 'col', text: 'Mean |log error|' }),
            el('th', { scope: 'col', text: 'Median |log error|' })
          )),
          el('tbody', null,
            el('tr', null,
              el('td', { text: 'Power law + adjustments (this board)' }),
              el('td', { class: 'num', text: b.model_mean_log_err.toFixed(3) }),
              el('td', { class: 'num', text: b.model_median_log_err.toFixed(3) })
            ),
            el('tr', null,
              el('td', { text: 'Flat median multiple (baseline)' }),
              el('td', { class: 'num', text: b.baseline_mean_log_err.toFixed(3) }),
              el('td', { class: 'num', text: b.baseline_median_log_err.toFixed(3) })
            )
          )
        ),
        el('p', null, 'The curve beats the flat multiple by ', el('b', { text: String(meanBetter) + '% on the mean error' }), ' and ', el('b', { text: String(medBetter) + '% on the median' }), '. The range on each row is the blind test\u2019s own residuals: the middle half of the live tokens\u2019 fitted values land between ', el('code', { text: Math.exp(b.resid_p25).toFixed(2) + 'x' }), ' and ', el('code', { text: Math.exp(b.resid_p75).toFixed(2) + 'x' }), ' of the market\u2019s own value, so the range says how far a fitted value usually sits from a real one.')
      ),
      el('section', { class: 'panel' },
        el('h2', { text: 'The verdict: Farm, Thin or Skip' }),
        el('p', null, 'The verdict nets each row\u2019s range against the board\u2019s median implied value of ', el('b', { text: fmtUsd(DATA.board_median_usd) }), '. ', el('b', { text: 'Farm' }), ' when even the range\u2019s low end clears the median — the model is confident this one is above average. ', el('b', { text: 'Thin' }), ' when the point estimate clears it but the low end does not — worth a small position, not a large one. ', el('b', { text: 'Skip' }), ' when the point estimate does not clear it. The verdict is the plan\u2019s bottom line, not a second ranking.')
      ),
      el('section', { class: 'panel' },
        el('h2', { text: 'Try the model yourself' }),
        el('p', null, 'Move the sliders and the board re-ranks in front of you. Nothing here changes the submitted board — it only shows how much the ranking depends on each assumption.'),
        el('div', { class: 'sandbox' },
          el('div', null, el('label', { text: 'Curve scale ' }, curveVal), curveScale),
          el('div', null, el('label', { text: 'Growth weight ' }, growthVal), growthW)
        ),
        sandboxOut
      )
    );
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    render();
    var d = document.getElementById('detail');
    if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function closeDetail() {
    state.selected = null;
    writeHash();
    render();
  }

  function detailView() {
    var row = DATA.rows.filter(function (r) { return r.slug === state.selected; })[0];
    if (!row) return null;
    var recomputed = impliedOf(row);
    var match = recomputed === row.implied_value_usd;
    var steps = farmSteps(row);
    var verdictClass = (row.verdict || '').toLowerCase();
    return el('section', { class: 'detail', id: 'detail' },
      el('button', { class: 'close', type: 'button', text: 'Close', onclick: closeDetail }),
      el('div', { class: 'crumb', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.on_watchlist ? ' · On the watchlist' : ' · Early radar') }),
      el('h2', null, row.name, ' ', el('span', { class: 'slug', text: row.slug })),
      el('p', { class: 'meta' },
        (row.category || 'Other') + ' · ' + (row.chains || []).join(', ') + ' · listed ' + (row.listed_at || 'date unknown') +
        ' · ' + fmtAge(row.age_days) + ' old · TVL ' + fmtUsd(row.tvl_usd) + ' · 7d ' + fmtPct(row.change_7d)
      ),
      el('div', { class: 'verdict-line' },
        el('span', { class: 'verdict ' + verdictClass, text: row.verdict || '—' }),
        el('span', { class: 'verdict-note', text: ' Range ' + fmtUsd(row.implied_low_usd) + ' – ' + fmtUsd(row.implied_high_usd) + ' · board median ' + fmtUsd(DATA.board_median_usd) })
      ),
      el('div', { class: 'formula' },
        fmtFull(row.base_value_usd) + ' curve base × ' + fmtMult(row.growth_multiplier) + ' growth × ' +
        fmtMult(row.maturity_multiplier) + ' maturity × ' + fmtMult(row.chain_multiplier) + ' chains ',
        el('span', { class: 'eq', text: '= ' + fmtFull(row.implied_value_usd) })
      ),
      el('div', { class: 'factors' },
        el('div', { class: 'factor' },
          el('div', { class: 'v', text: fmtUsd(row.base_value_usd) }),
          el('div', { class: 'k', text: 'Curve base' }),
          el('div', { class: 'd', text: 'exp(' + DATA.fit.intercept.toFixed(2) + ' + ' + DATA.fit.slope.toFixed(2) + ' x ln(TVL)), fitted on ' + DATA.fit.live_tokens + ' live tokens' })
        ),
        el('div', { class: 'factor' },
          el('div', { class: 'v', text: fmtMult(row.growth_multiplier) + 'x' }),
          el('div', { class: 'k', text: 'Growth' }),
          el('div', { class: 'd', text: '7-day change ' + fmtPct(row.change_7d) })
        ),
        el('div', { class: 'factor' },
          el('div', { class: 'v', text: fmtMult(row.maturity_multiplier) + 'x' }),
          el('div', { class: 'k', text: 'Maturity' }),
          el('div', { class: 'd', text: fmtAge(row.age_days) + ' with no token' })
        ),
        el('div', { class: 'factor' },
          el('div', { class: 'v', text: fmtMult(row.chain_multiplier) + 'x' }),
          el('div', { class: 'k', text: 'Chains' }),
          el('div', { class: 'd', text: (row.chains || []).length + ' chain' + ((row.chains || []).length === 1 ? '' : 's') })
        ),
        el('div', { class: 'factor' },
          el('div', { class: 'v', text: fmtUsd(row.implied_value_usd) }),
          el('div', { class: 'k', text: 'Implied value' }),
          el('div', { class: 'd', text: match ? 'This page recomputes the same dollar.' : 'This page recomputes ' + fmtFull(recomputed) + '.' })
        )
      ),
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('div', { class: 'cost' }, tail));
      })),
      el('p', { class: 'note' },
        el('b', { text: 'What this is not: ' }),
        '“Records no token” is what the snapshot says, not proof the protocol has none — a token can exist outside the snapshot. Implied value is a model, not a price, and no token launch is promised. Check the protocol\u2019s own page before you farm it.'
      )
    );
  }

  function footer() {
    return el('footer', null,
      el('b', { text: 'Token Launch Radar' }),
      ' · model ' + DATA.model_version + ' · snapshot ' + DATA.as_of + ' · source ' + DATA.source +
      ' · ' + DATA.board_size + ' rows ranked, ' + DATA.live_size + ' live tokens set aside · Implied value is a model, not a price.'
    );
  }

  function render() {
    app.textContent = '';
    app.appendChild(hero());
    app.appendChild(tabs());
    if (state.tab === 'board') {
      app.appendChild(controls());
      var d = detailView();
      if (d) app.appendChild(d);
      app.appendChild(boardTable());
    } else if (state.tab === 'live') {
      app.appendChild(liveTable());
    } else {
      app.appendChild(modelPanel());
    }
    app.appendChild(footer());
    app.setAttribute('aria-busy', 'false');
  }

  readHash();
  render();
  window.addEventListener('hashchange', function () { readHash(); render(); });
})();
