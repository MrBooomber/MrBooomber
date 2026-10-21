/* NewDeaf for Lampa v1.1.1 | ES5 | MIT */
(function () {
    'use strict';
    if (window.NewDeafPlugin) return;
    var DEFAULT_BASE = 'https://21oct.newdeaf.co';
    var L = window.Lampa;
    if (!L) return;
    var network = new L.Reguest();
    network.timeout(20000);
    var generation = 0;
    var initialized = false;

    function decode(value) {
        return String(value || '').replace(/&#(x[0-9a-f]+|[0-9]+);/gi, function (m, n) {
            var code = n.charAt(0).toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : parseInt(n, 10);
            return code > 0 && code <= 65535 ? String.fromCharCode(code) : '';
        }).replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
            .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    }
    function text(value) {
        return decode(String(value || '').replace(/<script\b[\s\S]*?<\/script>/gi, '')
            .replace(/<style\b[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
    }
    function escape(value) {
        return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function attr(tag, name) {
        var re = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\x27([^\x27]*)\x27)', 'i');
        var m = re.exec(tag);
        return m ? decode(m[1] === undefined ? m[2] : m[1]) : '';
    }
    function base() {
        var value = String(L.Storage.get('newdeaf_base', DEFAULT_BASE)).replace(/\/+$/, '');
        return /^https:\/\/(?:[a-z0-9-]+\.)?newdeaf\.co$/i.test(value) ? value : DEFAULT_BASE;
    }
    function absolute(value, origin) {
        value = String(value || '').trim();
        if (/^https:\/\//i.test(value)) return value;
        if (/^\/\//.test(value)) return 'https:' + value;
        if (value.charAt(0) === '/' && value.charAt(1) !== '/') return origin + value;
        return '';
    }
    function siteURL(value, origin) {
        var url = absolute(value, origin);
        return url.indexOf(origin + '/') === 0 ? url : '';
    }
    function parseCatalog(html, origin) {
        var cards = [], seen = {}, match;
        var re = /<article\b[^>]*class=["'][^"']*\bcard\b[^"']*["'][^>]*>([\s\S]*?)<\/article>/gi;
        while ((match = re.exec(html))) {
            var block = match[1];
            var heading = /<h2\b[^>]*class=["'][^"']*card__title[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i.exec(block);
            var link = heading && /<a\b[^>]*>/i.exec(heading[1]);
            var url = link && siteURL(attr(link[0], 'href'), origin);
            if (!url || seen[url]) continue;
            seen[url] = true;
            var desc = /<p\b[^>]*class=["'][^"']*card__text[^"']*["'][^>]*>([\s\S]*?)<\/p>/i.exec(block);
            cards.push({ title: text(heading[1]), url: url, description: desc ? text(desc[1]) : '' });
        }
        var next = '', pages = /<div\b[^>]*id=["']pagination["'][^>]*>([\s\S]*?)<\/div>/i.exec(html);
        if (pages) {
            var first = /<a\b[^>]*>/i.exec(pages[1]);
            if (first) next = siteURL(attr(first[0], 'href'), origin);
        }
        return { cards: cards, next: next };
    }
    function parsePlayers(html) {
        var result = [], seen = {}, re = /<iframe\b[^>]*>/gi, m;
        while ((m = re.exec(html))) {
            if (!/(?:^|\s)newdeaf-video(?:\s|$)/.test(attr(m[0], 'class'))) continue;
            var url = absolute(attr(m[0], 'data-src') || attr(m[0], 'src'), base());
            if (!/^https:\/\/(?:allo\.cdnlbox\.club|api\.nextembed\.ws)(?:\/|$)/i.test(url) || seen[url]) continue;
            seen[url] = true;
            result.push({ url: url, title: 'Вебплеєр ' + (result.length + 1) });
        }
        return result;
    }
    function menu(title, items, onSelect, back) {
        // Select hides itself before onSelect and closes itself before onBack.
        // Unlike Modal.close(), Select.close() calls onBack in Lampa 3.3.8.
        // Calling it from either callback triggers a second navigation or recursion.
        L.Select.show({ title: title, items: items, onSelect: function (item) {
            onSelect(item);
        }, onBack: function () { if (back) back(); else L.Controller.toggle('menu'); } });
    }
    function request(url, done, back) {
        var id = ++generation;
        network.clear();
        L.Modal.open({ title: 'NewDeaf', html: $('<div style="padding:1em">Завантаження…</div>'), size: 'small',
            onBack: function () { ++generation; network.clear(); L.Modal.close(); back(); } });
        network.native(url, function (raw) {
            if (id !== generation) return;
            L.Modal.close();
            if (typeof raw !== 'string' || raw.length > 3000000) {
                L.Noty.show('NewDeaf: неочікувана відповідь сайту'); back(); return;
            }
            done(raw);
        }, function () {
            if (id !== generation) return;
            L.Modal.close(); L.Noty.show('NewDeaf недоступний. Перевірте домен і мережу.'); back();
        }, null, { dataType: 'text' });
    }
    function catalog(url, title, pageNumber, back) {
        request(url, function (html) {
            var data = parseCatalog(html, base());
            var items = data.cards.map(function (card) {
                return { title: escape(card.title), subtitle: escape(card.description.slice(0, 180)), card: card };
            });
            // Select the precise next page instead of the pagination's first link (which can point backwards).
            var anchorRe = /<a\b[^>]*>/gi, m, next = '';
            var expected = '/page/' + (pageNumber + 1) + '/';
            while ((m = anchorRe.exec(html))) {
                var candidate = siteURL(attr(m[0], 'href'), base());
                if (candidate && candidate.indexOf(expected) !== -1) { next = candidate; break; }
            }
            if (next) items.push({ title: 'Наступна сторінка →', next: next });
            if (!items.length) { L.Noty.show('Нічого не знайдено або сайт змінив розмітку.'); back(); return; }
            menu(title + ' · ' + pageNumber, items, function (item) {
                if (item.next) catalog(item.next, title, pageNumber + 1, back);
                else details(item.card, function () { catalog(url, title, pageNumber, back); });
            }, back);
        }, back);
    }
    function openExternal(url) {
        var opened = window.open(url, '_blank', 'noopener,noreferrer');
        L.Noty.show('Сторінка відкривається в браузері. Якщо ТВ її не відкрив — скористайтеся браузером пристрою.');
        return opened;
    }
    function embed(player, title, back) {
        var wrap = $('<div style="height:65vh;background:#000"></div>');
        var frame = $('<iframe title="NewDeaf web player" style="width:100%;height:100%;border:0" allowfullscreen></iframe>');
        // No top navigation or popups. The remote provider's scripts remain isolated from Lampa.
        frame.attr('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation');
        frame.attr('allow', 'autoplay; fullscreen; picture-in-picture');
        frame.attr('referrerpolicy', 'no-referrer');
        frame.attr('src', player.url); wrap.append(frame);
        function close() { frame.attr('src', 'about:blank'); L.Modal.close(); back(); }
        L.Modal.open({ title: title, html: wrap, size: 'full', buttons: [{ name: 'Закрити плеєр', onSelect: close }], onBack: close });
    }
    function details(card, back) {
        request(card.url, function (html) {
            var players = parsePlayers(html);
            var items = players.map(function (player) {
                return { title: player.title + ' · експериментально', subtitle: 'Вебплеєр сайту, не нативний плеєр Lampa', player: player };
            });
            items.push({ title: 'Відкрити сторінку у браузері', subtitle: 'Запасний варіант для плеєрів із обмеженнями', external: true });
            if (!players.length) L.Noty.show('Вебплеєри не знайдені. Можлива зміна сайту або обмеження доступу.');
            menu(escape(card.title), items, function (item) {
                if (item.player) embed(item.player, escape(card.title), function () { details(card, back); });
                else { openExternal(card.url); back(); }
            }, back);
        }, back);
    }
    function search(query) {
        var q = String(query || '').trim().slice(0, 80);
        if (q.length < 3) { L.Noty.show('Введіть щонайменше 3 символи'); home(); return; }
        catalog(base() + '/index.php?do=search&subaction=search&search_start=1&full_search=0&story=' + encodeURIComponent(q),
            'Пошук ' + escape(q), 1, home);
    }
    function launchSource(movie) {
        var titles = [movie.original_title, movie.original_name, movie.title, movie.name];
        var queries = [], seen = {};
        titles.forEach(function (title) {
            var q = String(title || '').trim().slice(0, 80);
            if (q.length >= 3 && !seen[q]) { seen[q] = true; queries.push(q); }
        });
        function back() { L.Controller.toggle('content'); }
        if (!queries.length) { L.Noty.show('У картці немає назви для пошуку NewDeaf'); back(); return; }
        function find(index) {
            var query = queries[index];
            var url = base() + '/index.php?do=search&subaction=search&search_start=1&full_search=1&story=' + encodeURIComponent(query);
            request(url, function (html) {
                var cards = parseCatalog(html, base()).cards;
                if (!cards.length && index + 1 < queries.length) { find(index + 1); return; }
                if (!cards.length) { L.Noty.show('NewDeaf: фільм або серіал не знайдено'); back(); return; }
                var year = String(movie.release_date || movie.first_air_date || '').slice(0, 4);
                if (year) cards.sort(function (a, b) {
                    return (b.title.indexOf(year) !== -1 ? 1 : 0) - (a.title.indexOf(year) !== -1 ? 1 : 0);
                });
                var items = cards.map(function (card) {
                    return { title: escape(card.title), subtitle: escape(card.description.slice(0, 180)), card: card };
                });
                if (index + 1 < queries.length) {
                    items.push({ title: 'Пошук за іншою назвою', subtitle: escape(queries[index + 1]), another: true });
                }
                menu('NewDeaf · ' + escape(movie.title || movie.name || query), items, function (item) {
                    if (item.another) find(index + 1);
                    else details(item.card, function () { find(index); });
                }, back);
            }, back);
        }
        find(0);
    }
    function attachSource(event) {
        if (event.type !== 'complite') return;
        var root = event.body;
        if (!root && event.object && event.object.activity) root = event.object.activity.render();
        if (!root || typeof root.find !== 'function') return;
        var movie = event.data && event.data.movie;
        if (!movie && event.props && event.props.get) movie = event.props.get('movie');
        if (!movie) return;
        // Lampa 3.3.8 builds Watch -> Source from children of this container.
        var target = root.find('.buttons--container').eq(0);
        if (!target.length || root.find('.view--newdeaf').length) return;
        var button = $('<div class="full-start__button selector view--newdeaf">' +
            '<svg viewBox="0 0 24 24" width="24" height="24"><rect x="2" y="4" width="20" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/>' +
            '<path d="M10 9L16 12L10 15Z" fill="currentColor"/></svg><span>NewDeaf</span></div>');
        button.data('subtitle', 'Фільми та серіали із субтитрами');
        button.on('hover:enter', function () { launchSource(movie); });
        target.append(button);
    }
    function home() {
        menu('NewDeaf · каталог із субтитрами', [
            { title: 'Новинки', path: '/' }, { title: 'Фільми', path: '/film/' },
            { title: 'Серіали', path: '/serial/' }, { title: 'Мультфільми', path: '/multfilm/' },
            { title: 'Аніме', path: '/anime/' }, { title: 'Пошук', search: true }
        ], function (item) {
            if (item.search) {
                if (!L.Input || !L.Input.edit) { L.Noty.show('Ця версія Lampa не має Input.edit'); home(); return; }
                L.Input.edit({ title: 'Пошук NewDeaf', value: '', free: true, nosave: true }, function (value) {
                    L.Controller.toggle('menu'); if (value) search(value); else home();
                });
            } else catalog(base() + item.path, item.title, 1, home);
        });
    }
    function init() {
        if (initialized) return;
        initialized = true;
        var icon = '<svg viewBox="0 0 24 24" width="40" height="40"><rect x="2" y="4" width="20" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><text x="4" y="15" fill="currentColor" font-size="9">CC</text></svg>';
        var button = $('<li class="menu__item selector newdeaf-menu"><div class="menu__ico">' + icon + '</div><div class="menu__text">NewDeaf</div></li>');
        button.on('hover:enter', home);
        $('.menu .menu__list').eq(0).append(button);
        L.SettingsApi.addComponent({ component: 'newdeaf', name: 'NewDeaf', icon: icon });
        L.SettingsApi.addParam({ component: 'newdeaf',
            param: { name: 'newdeaf_base', type: 'input', placeholder: DEFAULT_BASE, default: DEFAULT_BASE },
            field: { name: 'Домен NewDeaf', description: 'HTTPS адреса newdeaf.co або його піддомену без кінцевого слеша' } });
        L.Listener.follow('full', attachSource);
        L.Manifest.plugins = { type: 'video', version: '1.1.1', name: 'NewDeaf', description: 'Каталог NewDeaf із субтитрами',
            onContextMenu: function () { return { name: 'Знайти в NewDeaf', description: 'Пошук за назвою' }; },
            onContextLauch: launchSource };
    }
    window.NewDeafPlugin = { version: '1.1.1', open: home, parseCatalog: parseCatalog, parsePlayers: parsePlayers };
    if (window.appready) init();
    else L.Listener.follow('app', function (event) { if (event.type === 'ready') init(); });
}());
