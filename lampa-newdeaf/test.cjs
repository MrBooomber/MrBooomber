const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let listener, fullListener, menus = 0, components = 0, params = 0, select, modal, controller;
const pending = [];
let selectCloseDepth = 0;
let coreModalBind;
const coreFlag = process.argv.find(arg => arg.startsWith('--core='));
if (coreFlag) {
    // Run the installed core's real binder; do not modify the application.
    const core = fs.readFileSync(coreFlag.slice(7), 'utf8');
    const start = core.indexOf('  function bind$1(where)', core.indexOf('  function open$5(params)'));
    const end = core.indexOf('\n  function jump(', start);
    assert.ok(start >= 0 && end > start, 'Installed Lampa Modal binder not found');
    const coreContext = vm.createContext({ active$4: {}, _scroll: { update() {} }, $: x => x });
    vm.runInContext(core.slice(start, end) + '\nthis.validate = bind$1;', coreContext);
    coreModalBind = coreContext.validate;
    assert.throws(() => coreModalBind('<div>loading</div>'), /where.find is not a function/);
}
function closeSelect() {
    // Lampa 3.3.8 Select.close() calls onBack even after selection hid the UI.
    // This is deliberately different from Modal.close(), which does not.
    if (++selectCloseDepth > 30) throw new RangeError('Maximum call stack size exceeded: recursive Select.close/onBack');
    try { const closed = select; if (closed && closed.onBack) closed.onBack(); }
    finally { selectCloseDepth--; }
}
function element() {
    return { events: {}, values: {}, length: 1,
        on(name, callback) { this.events[name] = callback; return this; },
        eq() { return this; }, attr() { return this; },
        find() { return this; },
        data(key, value) { if (arguments.length === 1) return this.values[key]; this.values[key] = value; return this; },
        append() { menus++; return this; }
    };
}
const Lampa = {
    Reguest: function () { this.timeout = () => {}; this.clear = () => {}; this.native = (url, done, fail) => pending.push({ url, done, fail }); },
    Listener: { follow(name, cb) { if (name === 'app') listener = cb; else if (name === 'full') fullListener = cb; } },
    SettingsApi: { addComponent() { components++; }, addParam() { params++; } },
    Manifest: {}, Storage: { get(k, d) { return d; } },
    Select: { show(s) { select = s; }, close: closeSelect }, Controller: { toggle(name) { controller = name; } },
    Modal: { open(s) {
        assert.equal(typeof s.html.find, 'function', 'Lampa 3.3.8 Modal.html must be a jQuery element');
        if (coreModalBind) coreModalBind(s.html);
        s.html.find('.selector').on('hover:focus', () => {}).on('hover:enter', () => {});
        modal = s;
    }, close() { modal = null; } }, Noty: { show() {} }
};
const ctx = { window: { Lampa, appready: false }, $: element };
const source = fs.readFileSync(__dirname + '/newdeaf.js', 'utf8');
vm.createContext(ctx); vm.runInContext(source, ctx);
assert.equal(menus, 0); listener({ type: 'ready' }); listener({ type: 'ready' });
assert.equal(menus, 1); assert.equal(components, 1); assert.equal(params, 1);
vm.runInContext(source, ctx); assert.equal(menus, 1);
assert.equal(Lampa.Manifest.plugins.name, 'NewDeaf');
ctx.window.NewDeafPlugin.open(); assert.equal(select.items.length, 6);
const api = ctx.window.NewDeafPlugin;
const html = `<script>throw new Error('must not execute')</script>
<article class="card d-flex"><h2 class="card__title"><a href="/film/1-a.html">A &amp; B (2020)</a></h2><p class="card__text line-clamp">Hello <b>world</b></p></article>
<article class="card"><h2 class="card__title"><a href="javascript:alert(1)">Bad</a></h2></article>
<article class="card"><h2 class="card__title"><a href="https://attacker.test/a">Bad</a></h2></article>
<article class="card"><h2 class="card__title"><a href="/film/1-a.html">Duplicate</a></h2></article>`;
const result = api.parseCatalog(html, 'https://21oct.newdeaf.co');
assert.equal(result.cards.length, 1); assert.equal(result.cards[0].title, 'A & B (2020)');
assert.equal(result.cards[0].description, 'Hello world');
const players = api.parsePlayers(`<iframe class="newdeaf-video" data-src="https://allo.cdnlbox.club/?a=1&amp;b=2"></iframe>
<iframe class="newdeaf-video" src="https://api.nextembed.ws/embed/movie/1"></iframe>
<iframe class="newdeaf-video" src="javascript:alert(1)"></iframe>
<iframe class="newdeaf-video" src="https://allo.cdnlbox.club.attacker.test/"></iframe>
<iframe src="https://advertising.test/"></iframe>`);
assert.equal(players.length, 2); assert.equal(players[0].url, 'https://allo.cdnlbox.club/?a=1&b=2');
assert.equal(api.parseCatalog('No results', 'https://21oct.newdeaf.co').cards.length, 0);
// Same flow a user follows: main menu -> category -> card -> web player -> Back.
api.open(); select.onSelect(select.items[1]);
assert.equal(pending.at(-1).url, 'https://21oct.newdeaf.co/film/');
pending.at(-1).done(html + '<a href="https://21oct.newdeaf.co/film/page/2/">2</a>');
assert.equal(select.items.length, 2);
select.onSelect(select.items[0]);
assert.equal(pending.at(-1).url, 'https://21oct.newdeaf.co/film/1-a.html');
const detailHTML = '<iframe class="newdeaf-video" src="https://api.nextembed.ws/embed/movie/1"></iframe>';
pending.at(-1).done(detailHTML);
select.onSelect(select.items[0]); assert.equal(modal.size, 'full');
modal.onBack(); pending.at(-1).done(detailHTML); assert.ok(select.items[0].player);
// Back from source list returns to category; Back from category returns home.
Lampa.Select.close(); pending.at(-1).done(html);
assert.equal(select.items[0].card.title, 'A & B (2020)');
Lampa.Select.close(); assert.equal(select.items.length, 6);
// Back from the top-level menu restores the Lampa menu without recursive close.
Lampa.Select.close(); assert.equal(selectCloseDepth, 0);
// Cancelled responses must not reopen a modal or replace the restored menu.
api.open(); select.onSelect(select.items[0]); const cancelled = pending.at(-1);
modal.onBack(); const restored = select;
cancelled.done(html); assert.equal(select, restored); assert.equal(modal, null);
// Full-card integration: inject a standard button into Lampa's grouped Source container.
let sourceButton, sourceCount = 0;
const sourceRoot = { find(selector) {
    if (selector === '.buttons--container') return { eq() { return this; }, length: 1,
        append(button) { sourceButton = button; sourceCount++; } };
    if (selector === '.view--newdeaf') return { length: sourceCount };
    throw new Error('Unexpected source selector: ' + selector);
} };
const movie = { title: 'Локалізована назва', original_title: 'Original title', release_date: '2020-01-01' };
fullListener({ type: 'build', body: sourceRoot, data: { movie } }); assert.equal(sourceCount, 0);
fullListener({ type: 'complite', body: sourceRoot, data: { movie } });
fullListener({ type: 'complite', body: sourceRoot, data: { movie } });
assert.equal(sourceCount, 1); assert.equal(sourceButton.data('subtitle'), 'Фільми та серіали із субтитрами');
sourceButton.events['hover:enter']();
assert.ok(pending.at(-1).url.endsWith('story=Original%20title'));
pending.at(-1).done('No results');
assert.ok(pending.at(-1).url.endsWith('story=' + encodeURIComponent(movie.title)));
pending.at(-1).done(html); assert.ok(select.items[0].card);
select.onSelect(select.items[0]); pending.at(-1).done(detailHTML);
assert.ok(select.items[0].player); select.onSelect(select.items[0]); assert.equal(modal.size, 'full');
modal.onBack(); pending.at(-1).done(detailHTML);
Lampa.Select.close(); pending.at(-1).done(html);
Lampa.Select.close(); assert.equal(controller, 'content');
sourceButton.events['hover:enter'](); pending.at(-1).done('No results'); pending.at(-1).done('No results');
assert.equal(controller, 'content'); assert.equal(modal, null);
console.log('PASS: parsers, init, menus, Select.close regression, category/card/player/back, cancellation, Watch source injection, deduplication, title fallback, source/player/back to movie, not-found handling.');
if (coreModalBind) console.log('CORE PASS: loading and player modal contents pass the installed Lampa Modal.bind; original string input reproduces where.find error.');
if (process.argv.includes('--stdin')) {
    const live = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''));
    const catalog = api.parseCatalog(live.catalog, 'https://21oct.newdeaf.co');
    const search = api.parseCatalog(live.search, 'https://21oct.newdeaf.co');
    const players = api.parsePlayers(live.detail);
    assert.ok(catalog.cards.length > 0, 'Live catalog must have cards');
    assert.ok(search.cards.length > 0, 'Live search must have cards');
    assert.ok(players.length > 0, 'Live detail must have at least one recognized web player');
    console.log('LIVE PASS:', catalog.cards.length, 'catalog cards;', search.cards.length, 'search results;', players.length, 'web players.');
}
