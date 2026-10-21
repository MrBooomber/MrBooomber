const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let listener, menus = 0, components = 0, params = 0, select, modal;
const pending = [];
function element() { return { on() { return this; }, eq() { return this; }, attr() { return this; }, append() { menus++; return this; } }; }
const Lampa = {
    Reguest: function () { this.timeout = () => {}; this.clear = () => {}; this.native = (url, done, fail) => pending.push({ url, done, fail }); },
    Listener: { follow(name, cb) { listener = cb; } },
    SettingsApi: { addComponent() { components++; }, addParam() { params++; } },
    Manifest: {}, Storage: { get(k, d) { return d; } },
    Select: { show(s) { select = s; }, close() {} }, Controller: { toggle() {} },
    Modal: { open(s) { modal = s; }, close() { modal = null; } }, Noty: { show() {} }
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
// Cancelled responses must not reopen a modal or replace the restored menu.
api.open(); select.onSelect(select.items[0]); const cancelled = pending.at(-1);
modal.onBack(); const restored = select;
cancelled.done(html); assert.equal(select, restored); assert.equal(modal, null);
console.log('PASS: readiness, duplicate loading, menu, settings, manifest, catalog parsing, HTML entities, deduplication, URL restrictions, iframe filtering, empty results, category/card/player/back flow, cancelled responses.');
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
