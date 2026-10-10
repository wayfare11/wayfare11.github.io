'use strict';
// Website logic only; articles and photos are generated from content/ by build.py.
// Avoid editing this file when publishing a new post.
const SITE = window.BLOG_DATA.site;
const posts = window.BLOG_DATA.posts;
const albums = window.BLOG_DATA.albums || [];
const categories = window.BLOG_DATA.categories || {};
const CHANNEL_NAMES = {tech:'技术博客',life:'生活日记'};
const CHANNEL_ROUTES = {tech:'tech',life:'journal'};


    let visiblePhotos = [];
    let selectedAlbum = null;
    // Decrypted photos only live in this browser tab (blob: URLs), never localStorage.
    const unlockedAlbums = new Map();
    const unlockedPosts = new Map();
    const channelPageState = {
      tech: {subcategory:'all', tag:null, search:'', sort:'newest'},
      journal: {subcategory:'all', tag:null, search:'', sort:'newest'}
    };
    let activePhotoIndex = 0;

    let activeSubcategory = 'all';
    let activeTag = null;
    let showAllTags = false;
    let activeChannel = null;
    let keyword = '';
    let sortOrder = 'newest';
    let toastTimer;
    let currentPostId = null;
    let lastListingRoute = '#articles';

    const $ = selector => document.querySelector(selector);
    const dateLabel = iso => new Date(iso + 'T12:00:00').toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric'});
    const minutes = post => Math.max(2, Math.ceil((post.content || '').replace(/<[^>]*>/g, '').replace(/\s+/g, '').length / 320));
    const sortedPosts = arr => [...arr].sort((a,b) => sortOrder === 'newest' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
    const getPost = id => posts.find(post => post.id === id);
    const escapeHtml = str => String(str).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

    function setSiteInfo() {
      document.title = SITE.name + ' · 代码、生活与光影';
      document.querySelectorAll('[data-site-name]').forEach(el => el.textContent = SITE.name);
      document.querySelectorAll('[data-author]').forEach(el => el.textContent = SITE.author);
      $('#copyright-year').textContent = String(new Date().getFullYear());
      const emailLink = $('#footer-email');
      if (SITE.email) { emailLink.href = 'mailto:' + SITE.email; emailLink.hidden = false; }
      const githubLink = $('#footer-github');
      if (SITE.github) { githubLink.href = SITE.github; githubLink.hidden = false; }
      $('#article-total').textContent = String(posts.length).padStart(2,'0');
      $('#photo-total').textContent = String(albums.reduce((sum, a) => sum + a.count, 0)).padStart(2,'0');
    }

    // V10: sticky desktop taxonomy sidebars and a focus-managed mobile drawer.
    let openFilterScope = null;
    let returnFilterFocus = null;

    function syncFilterCount(scope) {
      const badge = document.querySelector(`[data-filter-count="${scope}"]`);
      if (!badge) return;
      let count = 0;
      if (scope === 'archive') {
        count = Number(Boolean(activeChannel)) + Number(activeSubcategory !== 'all') + Number(Boolean(activeTag));
      } else {
        const state = channelPageState[scope];
        count = Number(state.subcategory !== 'all') + Number(Boolean(state.tag));
      }
      badge.textContent = count ? `${count} 项已选` : '全部';
      badge.classList.toggle('has-selection',count > 0);
    }

    function closeFilterDrawer(restoreFocus = false) {
      if (!openFilterScope) return;
      const previous = openFilterScope;
      const panel = document.querySelector(`[data-filter-panel="${previous}"]`);
      panel?.classList.remove('is-open');
      panel?.removeAttribute('role');
      panel?.removeAttribute('aria-modal');
      document.querySelector(`[data-filter-toggle="${previous}"]`)?.setAttribute('aria-expanded','false');
      document.body.classList.remove('filter-drawer-open');
      $('#filter-backdrop').hidden = true;
      openFilterScope = null;
      if (restoreFocus && returnFilterFocus?.isConnected) returnFilterFocus.focus({preventScroll:true});
      returnFilterFocus = null;
    }

    function openFilterDrawer(scope) {
      if (!['tech','journal','archive'].includes(scope)) return;
      if (window.innerWidth > 920) return;
      if (openFilterScope) closeFilterDrawer();
      const panel = document.querySelector(`[data-filter-panel="${scope}"]`);
      const trigger = document.querySelector(`[data-filter-toggle="${scope}"]`);
      if (!panel || !trigger) return;
      returnFilterFocus = trigger;
      openFilterScope = scope;
      panel.classList.add('is-open');
      panel.setAttribute('role','dialog');
      panel.setAttribute('aria-modal','true');
      trigger.setAttribute('aria-expanded','true');
      $('#filter-backdrop').hidden = false;
      document.body.classList.add('filter-drawer-open');
      panel.querySelector('.filter-sidebar-close')?.focus({preventScroll:true});
    }

    function setupFilterDrawers() {
      document.addEventListener('click', event => {
        const trigger = event.target.closest('[data-filter-toggle]');
        if (trigger) {
          const scope = trigger.dataset.filterToggle;
          if (openFilterScope === scope) closeFilterDrawer(true);
          else openFilterDrawer(scope);
          return;
        }
        const close = event.target.closest('[data-filter-close]');
        if (close) closeFilterDrawer(true);
      });
      $('#filter-backdrop').addEventListener('click',() => closeFilterDrawer(true));
      document.addEventListener('keydown', event => {
        if (!openFilterScope) return;
        if (event.key === 'Escape') { event.preventDefault(); closeFilterDrawer(true); return; }
        if (event.key !== 'Tab') return;
        const panel = document.querySelector(`[data-filter-panel="${openFilterScope}"]`);
        const focusable = [...panel.querySelectorAll('button:not([disabled])')]
          .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length-1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      });
      window.addEventListener('resize',() => { if (window.innerWidth > 920) closeFilterDrawer(); });
    }

    function renderFilters() {
      const options = [[null,'全部文章'],['tech','技术'],['life','生活']];
      $('#channel-filters').innerHTML = options.map(([channel,label]) => {
        const total = posts.filter(post => !channel || post.channel === channel).length;
        const selected = activeChannel === channel;
        return `<button class="channel-filter ${selected ? 'active' : ''}" type="button" data-channel="${channel || 'all'}" aria-pressed="${selected}">${escapeHtml(label)} <small>${total}</small></button>`;
      }).join('');

      const countFor = (channel,id) => posts.filter(p => p.channel === channel && p.subcategory === id).length;
      const scopeLabel = activeChannel === 'tech' ? '全部技术' : activeChannel === 'life' ? '全部生活' : '全部主题';
      const scopeTotal = posts.filter(p => !activeChannel || p.channel === activeChannel).length;
      const selectedAll = activeSubcategory === 'all';
      const nav = [`<button type="button" class="filter-button toc-all ${selectedAll ? 'active' : ''}" data-subcategory="all" data-entry-channel="${activeChannel || 'all'}" aria-pressed="${selectedAll}"><span>${scopeLabel}</span><small>${scopeTotal}</small></button>`];
      for (const [channel,name] of [['tech','技术笔记'],['life','生活手记']]) {
        if (activeChannel && activeChannel !== channel) continue;
        const available = Object.entries(categories[channel] || {}).map(([id,label]) => ({id,label,count:countFor(channel,id)})).filter(x => x.count > 0);
        if (!available.length) continue;
        if (!activeChannel) nav.push(`<div class="toc-group-heading">${name}<span>${posts.filter(p => p.channel === channel).length}</span></div>`);
        nav.push(...available.map(item => {
          const selected = activeChannel === channel && activeSubcategory === item.id;
          return `<button type="button" class="filter-button ${selected ? 'active' : ''}" data-subcategory="${escapeHtml(item.id)}" data-entry-channel="${channel}" aria-pressed="${selected}"><span>${escapeHtml(item.label)}</span><small>${item.count}</small></button>`;
        }));
      }
      $('#subcategory-filters').innerHTML = nav.join('');
      $('#taxonomy-panel').hidden = false;
      const withinChannel = posts.filter(post => (!activeChannel || post.channel === activeChannel) && (activeSubcategory === 'all' || post.subcategory === activeSubcategory));
      const tagCounts = new Map();
      withinChannel.forEach(post => (post.tags || []).forEach(tag => tagCounts.set(tag,(tagCounts.get(tag) || 0)+1)));
      const entries = [...tagCounts].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0],'zh-CN'));
      $('#tag-panel').hidden = entries.length === 0;
      const visibleTags = showAllTags || (activeTag && !entries.slice(0,10).some(([tag]) => tag === activeTag)) ? entries : entries.slice(0,10);
      $('#tag-filters').innerHTML = `<button class="tag-filter ${!activeTag ? 'active' : ''}" type="button" data-tag="all" aria-pressed="${!activeTag}">全部标签</button>` +
        visibleTags.map(([tag,count]) => `<button class="tag-filter ${activeTag === tag ? 'active' : ''}" type="button" data-tag="${escapeHtml(tag)}" aria-pressed="${activeTag === tag}">#${escapeHtml(tag)} <small>${count}</small></button>`).join('') +
        (entries.length > 10 ? `<button class="tag-expand" type="button" data-expand-tags="true">${showAllTags ? '收起标签' : '更多标签 +'}</button>` : '');
      $('#archive-tag-mark').textContent = activeTag ? '#' + activeTag : '选择';
      $('#archive-tag-mark').classList.toggle('is-chosen',!!activeTag);
    }

    function makeCard(post, featured = false) {
      const i = posts.indexOf(post) + 1;
      const href = '#post/' + encodeURIComponent(post.id);
      return `
        <article class="post-card ${featured ? 'is-featured' : ''}">
          <a class="post-cover cover-${escapeHtml(post.cover)}" href="${href}" aria-label="阅读《${escapeHtml(post.title)}》">
            <span class="cover-nr">NOTE / ${String(i).padStart(2,'0')}</span><span class="cover-deco" aria-hidden="true">${escapeHtml(post.icon)}</span><span class="cover-word">${escapeHtml(post.coverWord)}</span>
          </a>
          <div class="post-content">
            <div class="post-overline"><span>${escapeHtml(CHANNEL_NAMES[post.channel])}</span><span class="dot"></span><span>${escapeHtml(post.subcategoryLabel)}</span></div>
            <h3><a href="${href}">${escapeHtml(post.title)}</a></h3>
            <p>${escapeHtml(post.excerpt)}</p>
            <div class="post-tags">${(post.tags || []).slice(0,3).map(t => `<button type="button" class="post-tag-link" data-card-tag="${escapeHtml(t)}" data-card-channel="${post.channel}" aria-label="按 ${escapeHtml(t)} 标签筛选">#${escapeHtml(t)}</button>`).join('')}</div>
            <div class="post-footer"><time datetime="${post.date}">${dateLabel(post.date)}</time><a class="read-link" href="${href}">阅读全文 <span aria-hidden="true">↗</span></a></div>
          </div>
        </article>`;
    }

    function sortValue(scope) {
      return scope === 'archive' ? sortOrder : channelPageState[scope].sort;
    }

    function updateSortUI(scope) {
      const control = document.querySelector(`[data-sort-control="${scope}"]`);
      if (!control) return;
      const value = sortValue(scope);
      control.querySelector('.sort-current').textContent = value === 'oldest' ? '\u6700\u65e9\u53d1\u5e03' : '\u6700\u65b0\u53d1\u5e03';
      control.querySelectorAll('[data-sort-option]').forEach(option => option.setAttribute('aria-checked',String(option.dataset.sortOption === value)));
    }

    function closeSortMenus(exceptScope = null) {
      document.querySelectorAll('[data-sort-control]').forEach(control => {
        if (control.dataset.sortControl === exceptScope) return;
        control.querySelector('.sort-menu').hidden = true;
        control.querySelector('.sort-trigger').setAttribute('aria-expanded','false');
      });
    }

    function chooseSort(scope, value) {
      if (value !== 'newest' && value !== 'oldest') return;
      if (scope === 'archive') { sortOrder = value; renderPosts(); }
      else { channelPageState[scope].sort = value; renderChannelPage(scope); }
      updateSortUI(scope);
      closeSortMenus();
    }

    function setupSortMenus() {
      document.addEventListener('click', event => {
        const trigger = event.target.closest('[data-sort-trigger]');
        if (trigger) {
          const scope = trigger.dataset.sortTrigger;
          const control = trigger.closest('[data-sort-control]');
          const menu = control.querySelector('.sort-menu');
          const wasOpen = !menu.hidden;
          closeSortMenus();
          menu.hidden = wasOpen;
          trigger.setAttribute('aria-expanded',String(!wasOpen));
          return;
        }
        const option = event.target.closest('[data-sort-option]');
        if (option) {
          const scope = option.closest('[data-sort-control]').dataset.sortControl;
          chooseSort(scope, option.dataset.sortOption);
          document.querySelector(`[data-sort-trigger="${scope}"]`).focus({preventScroll:true});
          return;
        }
        if (!event.target.closest('.sort-control')) closeSortMenus();
      });
      document.addEventListener('keydown', event => {
        const control = event.target.closest?.('[data-sort-control]');
        if (event.key === 'Escape') {
          const wasOpen = [...document.querySelectorAll('.sort-menu')].some(menu => !menu.hidden);
          if (wasOpen) { closeSortMenus(); control?.querySelector('.sort-trigger').focus({preventScroll:true}); event.preventDefault(); }
        }
        if (!control) return;
        const trigger = control.querySelector('.sort-trigger');
        const menu = control.querySelector('.sort-menu');
        const items = [...menu.querySelectorAll('[data-sort-option]')];
        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && items.length) {
          event.preventDefault();
          closeSortMenus(control.dataset.sortControl);
          menu.hidden = false;
          trigger.setAttribute('aria-expanded','true');
          const current = items.indexOf(document.activeElement);
          const next = current === -1 ? (event.key === 'ArrowDown' ? 0 : items.length-1) : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[next].focus();
        }
        if (event.key === 'Tab' && !menu.hidden) closeSortMenus();
      });
    }

    function renderPosts() {
      const normalized = keyword.trim().toLocaleLowerCase();
      const list = sortedPosts(posts.filter(post => {
        const matchChannel = !activeChannel || post.channel === activeChannel;
        const matchSub = activeSubcategory === 'all' || post.subcategory === activeSubcategory;
        const matchTag = !activeTag || (post.tags || []).includes(activeTag);
        const plain = post.content.replace(/<[^>]*>/g,' ');
        const matchKeyword = !normalized || [post.title,post.subcategoryLabel,post.excerpt,plain,...(post.tags || [])]
          .some(value => String(value).toLocaleLowerCase().includes(normalized));
        return matchChannel && matchSub && matchTag && matchKeyword;
      }));
      // The archive is a compact index: keep every card equal-sized.
      $('#posts-grid').innerHTML = list.map(post => makeCard(post)).join('');
      const currentLabel = activeChannel && categories[activeChannel]?.[activeSubcategory];
      $('#results-count').textContent = `共找到 ${list.length} 篇文章${activeChannel ? ' · ' + CHANNEL_NAMES[activeChannel] : ''}${currentLabel ? ' · ' + currentLabel : ''}${activeTag ? ' · #' + activeTag : ''}`;
      $('#empty-state').hidden = list.length !== 0;
      renderFilters();
      syncFilterCount('archive');
      updateSortUI('archive');
    }

    // V15: editorial timeline / the chronological archive is separate from the card index.
    function renderChronicle() {
      const ordered = [...posts].sort((a,b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
      const byYear = new Map();
      for (const post of ordered) {
        const [year, month] = post.date.split('-');
        if (!byYear.has(year)) byYear.set(year, new Map());
        const months = byYear.get(year);
        if (!months.has(month)) months.set(month, []);
        months.get(month).push(post);
      }
      $('#chronicle-total').textContent = String(ordered.length).padStart(2,'0');
      $('#chronicle-year-total').textContent = String(byYear.size).padStart(2,'0');
      const recent = ordered[0];
      const recentNode = $('#chronicle-latest-date');
      recentNode.textContent = recent ? dateLabel(recent.date) : '等待第一篇';
      if (recent) recentNode.setAttribute('datetime',recent.date);
      else recentNode.removeAttribute('datetime');
      $('#chronicle-result-label').textContent = `${ordered.length} 篇记录 · 最新在前`;
      $('#chronicle-bottom-note').hidden = ordered.length === 0;
      const monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
      $('#chronicle-year-nav').innerHTML = [...byYear].map(([year,months],i) => {
        const total = [...months.values()].reduce((sum,entries)=>sum+entries.length,0);
        return `<button type="button" class="chronicle-year-jump ${i===0 ? 'is-current' : ''}" data-chronicle-year="${escapeHtml(year)}" aria-label="跳转到 ${escapeHtml(year)} 年的 ${total} 篇文章"><span>${escapeHtml(year)}</span><small>${total.toString().padStart(2,'0')}</small></button>`;
      }).join('');
      const renderEntry = post => {
        const day = post.date.slice(8,10);
        const monthName = monthNames[Number(post.date.slice(5,7))-1] || '';
        const href = '#post/' + encodeURIComponent(post.id);
        return `<li class="chronicle-entry">
          <time class="chronicle-entry-date" datetime="${escapeHtml(post.date)}"><strong>${escapeHtml(day)}</strong><small>${monthName}</small></time>
          <div class="chronicle-entry-body">
            <div class="chronicle-entry-meta"><span class="chronicle-entry-kind ${post.channel==='tech' ? 'is-tech':'is-life'}">${post.channel==='tech' ? '技术':'生活'}</span><span>${escapeHtml(post.subcategoryLabel)}</span></div>
            <h4><a href="${href}">${escapeHtml(post.title)}</a></h4>
            <p>${escapeHtml(post.excerpt)}</p>
            <div class="chronicle-entry-tags">${(post.tags||[]).slice(0,2).map(t=>`<span>#${escapeHtml(t)}</span>`).join('')}</div>
          </div>
          <a href="${href}" class="chronicle-entry-arrow" aria-label="阅读《${escapeHtml(post.title)}》"><span aria-hidden="true">↗</span></a>
        </li>`;
      };
      $('#chronicle-timeline').innerHTML = [...byYear].map(([year,months]) => {
        const total = [...months.values()].reduce((sum,entries)=>sum+entries.length,0);
        const monthsHtml = [...months].map(([month,entries]) => `<section class="chronicle-month" aria-label="${escapeHtml(year)} 年 ${Number(month)} 月">
          <div class="chronicle-month-heading"><span class="chronicle-month-number">${Number(month).toString().padStart(2,'0')} <small>月</small></span><span class="chronicle-month-english">${monthNames[Number(month)-1] || ''}</span><span class="chronicle-month-count">${entries.length} 篇</span></div>
          <ol class="chronicle-entries">${entries.map(renderEntry).join('')}</ol>
        </section>`).join('');
        return `<section class="chronicle-year-group" id="chronicle-year-${escapeHtml(year)}" aria-label="${escapeHtml(year)} 年归档">
          <header class="chronicle-year-heading"><span class="chronicle-year-title">${escapeHtml(year)}</span><span class="chronicle-year-caption">${total} 篇文字 / NOTES FROM ${escapeHtml(year)}</span></header>
          <div class="chronicle-months">${monthsHtml}</div>
        </section>`;
      }).join('') || `<div class="chronicle-empty"><span aria-hidden="true">✳</span><h3>第一段时光，正在酝酿</h3><p>在技术或生活栏目发布一篇 Markdown 文章，新的时间线就会从这里开始。</p><a href="#articles">去文章列表看看 ↗</a></div>`;
    }

    function setupChronicle() {
      $('#chronicle-year-nav').addEventListener('click',event => {
        const button = event.target.closest('[data-chronicle-year]');
        if (!button) return;
        const year = button.dataset.chronicleYear;
        document.getElementById('chronicle-year-' + year)?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant':'smooth',block:'start'});
        $('#chronicle-year-nav').querySelectorAll('button').forEach(b => b.classList.toggle('is-current',b===button));
      });
      let pending=false;
      window.addEventListener('scroll',() => {
        if (location.hash !== '#archive' || pending) return;
        pending=true;
        requestAnimationFrame(()=>{
          pending=false;
          const groups=[...document.querySelectorAll('#chronicle-timeline .chronicle-year-group')];
          if (!groups.length) return;
          const chosen=[...groups].reverse().find(group=>group.getBoundingClientRect().top<=175) || groups[0];
          $('#chronicle-year-nav').querySelectorAll('[data-chronicle-year]').forEach(b=>b.classList.toggle('is-current',b.dataset.chronicleYear===chosen.id.slice('chronicle-year-'.length)));
        });
      },{passive:true});
    }

    function renderTechAndJournal() {
      const tech = posts.filter(post => post.channel === 'tech').sort((a,b) => b.date.localeCompare(a.date));
      $('#tech-posts').innerHTML = tech.slice(0,3).map((post,index) => `
        <a class="tech-list-row" href="#post/${encodeURIComponent(post.id)}"><span>${String(index+1).padStart(2,'0')}</span><span><small>${escapeHtml(post.subcategoryLabel)} · ${dateLabel(post.date)}</small><strong>${escapeHtml(post.title)}</strong></span><b aria-hidden="true">↗</b></a>`).join('');
      const featuredTech = $('#featured-tech-title');
      if (tech.length) {
        featuredTech.textContent = tech[0].title;
        $('#featured-tech-summary').textContent = tech[0].excerpt;
        $('#featured-tech-link').href = '#post/' + encodeURIComponent(tech[0].id);
      } else {
        featuredTech.textContent = '写下第一篇技术文章';
        $('#featured-tech-summary').textContent = '把 Markdown 文件放进 content/tech/，运行更新脚本就会展示在这里。';
        $('#featured-tech-link').href = '#articles';
      }
      const life = posts.filter(post => post.channel === 'life').sort((a,b) => b.date.localeCompare(a.date));
      $('#journal-posts').innerHTML = life.slice(0,3).map(post => `
        <a class="journal-entry" href="#post/${encodeURIComponent(post.id)}"><span class="journal-date">${escapeHtml(post.date.slice(5).replace('-','.'))}<small>${escapeHtml(post.date.slice(0,4))}</small></span><span class="journal-entry-text"><small>${escapeHtml(post.subcategoryLabel)}</small><strong>${escapeHtml(post.title)}</strong><span>${escapeHtml(post.excerpt)}</span></span><span class="journal-entry-arrow" aria-hidden="true">↗</span></a>`).join('');
    }

    function renderChannelPage(page) {
      const channel = page === 'journal' ? 'life' : 'tech';
      const state = channelPageState[page];
      const all = posts.filter(post => post.channel === channel);
      const found = all.filter(post => {
        if (state.subcategory !== 'all' && post.subcategory !== state.subcategory) return false;
        const text = state.search.trim().toLocaleLowerCase();
        if (!text) return true;
        const content = post.content.replace(/<[^>]*>/g,' ');
        return [post.title,post.excerpt,post.subcategoryLabel,content,...(post.tags || [])]
          .some(part => String(part).toLocaleLowerCase().includes(text));
      }).sort((a,b) => state.sort === 'oldest' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
      document.getElementById(page+'-page-total').textContent = String(all.length).padStart(2,'0');
      document.getElementById(page+'-page-filters').innerHTML =
        [['all','\u5168\u90e8\u4e3b\u9898'],...Object.entries(categories[channel] || {}).filter(([id]) => all.some(post => post.subcategory === id))].map(([id,label]) => {
          const selected = state.subcategory === id;
          const count = id === 'all' ? all.length : all.filter(post => post.subcategory === id).length;
          return `<button type="button" class="filter-button ${selected ? 'active' : ''}" data-channel-topic="${page}" data-topic="${escapeHtml(id)}" aria-pressed="${selected}">${escapeHtml(label)} <small>${count}</small></button>`;
        }).join('');
      const tagCounts = new Map();
      all.filter(p => state.subcategory === 'all' || p.subcategory === state.subcategory)
        .forEach(p => (p.tags || []).forEach(t => tagCounts.set(t, (tagCounts.get(t) || 0)+1)));
      const tags = [...tagCounts].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0],'zh-CN'));
      if (state.tag && !tagCounts.has(state.tag)) state.tag = null;
      const tagsElement = document.getElementById(page+'-page-tags');
      tagsElement.hidden = tags.length === 0;
      tagsElement.innerHTML = tags.length ? `<button type="button" class="tag-filter ${!state.tag ? 'active' : ''}" data-channel-tag="${page}" data-tag="all" aria-pressed="${!state.tag}">\u5168\u90e8\u6807\u7b7e</button>` + tags.map(([tag,num]) =>
        `<button type="button" class="tag-filter ${state.tag === tag ? 'active' : ''}" data-channel-tag="${page}" data-tag="${escapeHtml(tag)}" aria-pressed="${state.tag === tag}">#${escapeHtml(tag)} <small>${num}</small></button>`).join('') : '';
      const mark = document.getElementById(page+'-tag-mark');
      mark.textContent = state.tag ? '#' + state.tag : '选择';
      mark.classList.toggle('is-chosen',!!state.tag);
      const filtered = state.tag ? found.filter(p => (p.tags || []).includes(state.tag)) : found;
      document.getElementById(page+'-page-posts').innerHTML = filtered.map(post => makeCard(post)).join('');
      document.getElementById(page+'-page-results').textContent = `\u5171 ${filtered.length} \u7bc7${channel === 'tech' ? '\u6280\u672f\u6587\u7ae0' : '\u751f\u6d3b\u65e5\u8bb0'}`;
      document.getElementById(page+'-page-empty').hidden = filtered.length !== 0;
      updateSortUI(page);
      syncFilterCount(page);
    }

    function resolvedAlbum(album) {
      return unlockedAlbums.get(album.id) || album;
    }

    function albumCoverMarkup(album, alt, attributes = '') {
      const ready = resolvedAlbum(album);
      if (album.protected && !unlockedAlbums.has(album.id)) {
        return `<span class="album-locked-art" role="img" aria-label="相册已加密，需要密码">
          <span class="album-locked-glyph" aria-hidden="true">✳</span><span class="album-locked-icon" aria-hidden="true">🔒</span>
          <small>PRIVATE COLLECTION / 私密相册</small></span>`;
      }
      return `<img src="${escapeHtml(ready.cover)}" alt="${escapeHtml(alt)}" ${attributes} />`;
    }

    function albumCard(album, index) {
      const secured = album.protected && !unlockedAlbums.has(album.id);
      return `<a class="album-card ${secured ? 'is-locked' : ''}" href="#album/${encodeURIComponent(album.id)}" aria-label="查看相册：${escapeHtml(album.title)}">
          <span class="album-card-image">${albumCoverMarkup(album, album.title, 'loading="lazy" decoding="async"')}</span>
          <span class="album-card-info"><span class="album-card-upper">${secured ? '🔒 PRIVATE COLLECTION' : 'COLLECTION'} / ${String(index+1).padStart(2,'0')}</span><strong>${escapeHtml(album.title)}</strong><span class="album-card-desc">${escapeHtml(album.description)}</span><span class="album-card-meta">${album.count} 张照片 ${secured ? '· 需要密码' : ''}<span aria-hidden="true">↗</span></span></span>
        </a>`;
    }

    // V13: editorial lead stories in each channel header. Content is read from
    // the same Markdown / photo-album data as the grids, never hard-coded.
    function renderChannelHighlights() {
      const storySections = [
        {page:'tech', channel:'tech', overline:'LATEST / DEV NOTES', label:'最新技术笔记', action:'阅读最新技术文章'},
        {page:'journal', channel:'life', overline:'LATEST / LIFE STORIES', label:'最新生活手记', action:'翻开这篇日记'}
      ];
      storySections.forEach(({page, channel, overline, label, action}) => {
        const target = document.getElementById(page + '-landing-highlight');
        if (!target) return;
        const recent = posts.filter(p => p.channel === channel).sort((a,b) =>
          b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
        const main = recent[0];
        if (!main) {
          target.innerHTML = `<div class="landing-highlight-top"><span>${escapeHtml(overline)}</span></div>
            <div class="landing-highlight-empty"><span class="landing-highlight-symbol" aria-hidden="true">✳</span>
              <h2>这里正准备写下第一篇</h2><p>在 content/${channel}/ 新建 Markdown 文章，发布后就会自动展示在这里。</p></div>
            <a class="landing-highlight-action" href="#articles">去文章归档 <span aria-hidden="true">↗</span></a>`;
          return;
        }
        const postLink = '#post/' + encodeURIComponent(main.id);
        const second = recent[1];
        const nextHtml = second ? `<div class="landing-highlight-next">
          <span class="landing-highlight-next-label">接着读</span>
          <a href="#post/${encodeURIComponent(second.id)}">${escapeHtml(second.title)}<span aria-hidden="true">↗</span></a>
        </div>` : '';
        target.innerHTML = `
          <div class="landing-highlight-top"><span class="landing-highlight-dot" aria-hidden="true"></span>
            <span>${escapeHtml(overline)}</span><span class="landing-highlight-index">01 / ${String(recent.length).padStart(2,'0')}</span></div>
          <div class="landing-highlight-story">
            <div class="landing-highlight-meta"><time datetime="${main.date}">${escapeHtml(dateLabel(main.date))}</time><span aria-hidden="true">·</span><span>${escapeHtml(main.subcategoryLabel)}</span></div>
            <h2><a href="${postLink}">${escapeHtml(main.title)}</a></h2>
            <p>${escapeHtml(main.excerpt)}</p>
            <a class="landing-highlight-action" href="${postLink}">${escapeHtml(action)} <span aria-hidden="true">↗</span></a>
          </div>
          ${nextHtml}`;
      });

      const galleryTarget = document.getElementById('gallery-landing-highlight');
      if (!galleryTarget) return;
      const recentAlbum = [...albums].sort((a,b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0];
      if (!recentAlbum) {
        galleryTarget.innerHTML = `<div class="landing-highlight-top"><span>NEW COLLECTION / 主题新作</span></div>
          <div class="landing-highlight-empty"><span class="landing-highlight-symbol" aria-hidden="true">◎</span>
            <h2>下一本相册，正在路上</h2><p>在 photos/ 下面添加一个主题文件夹，最新相册就会自动出现在这里。</p></div>`;
        return;
      }
      const albumLink = '#album/' + encodeURIComponent(recentAlbum.id);
      galleryTarget.innerHTML = `<a class="landing-album-feature" href="${albumLink}" aria-label="打开最新相册：${escapeHtml(recentAlbum.title)}">
          <span class="landing-album-image">
            ${albumCoverMarkup(recentAlbum, recentAlbum.title + '相册封面', 'decoding="async"')}
            <span class="landing-album-image-label">NEW COLLECTION / 最新主题</span>
          </span>
          <span class="landing-album-information">
            <span class="landing-album-meta"><time datetime="${recentAlbum.date}">${escapeHtml(dateLabel(recentAlbum.date))}</time><span>${recentAlbum.count} 张照片${recentAlbum.protected && !unlockedAlbums.has(recentAlbum.id) ? ' · 🔒 私密' : ''}</span></span>
            <strong>${escapeHtml(recentAlbum.title)}<span aria-hidden="true">↗</span></strong>
            <span class="landing-album-description">${escapeHtml(recentAlbum.description)}</span>
          </span>
        </a>`;
    }

    function renderAlbums() {
      $('#home-albums-grid').innerHTML = albums.slice(0,3).map(albumCard).join('');
      $('#gallery-albums-grid').innerHTML = albums.map(albumCard).join('');
      $('#gallery-albums-empty').hidden = albums.length !== 0;
      $('#gallery-page-total').textContent = String(albums.length).padStart(2,'0');
    }

    function renderAlbumDetail(album) {
      if (!album) return;
      const ready = resolvedAlbum(album);
      selectedAlbum = ready;
      const date = album.date.replace(/-/g, '.');
      const locked = album.protected && !unlockedAlbums.has(album.id);
      const lockArea = locked ? `<div class="album-unlock-panel">
            <span class="album-unlock-kicker">🔒 PASSWORD REQUIRED / 私密相册</span>
            <p>这本相册的照片已加密。请输入相册密码，仅在当前页面中解锁查看。</p>
            <form data-album-unlock="${escapeHtml(album.id)}" class="album-unlock-form">
              <label class="album-unlock-label" for="album-password">相册密码</label>
              <div class="album-unlock-input-row"><input id="album-password" type="password" autocomplete="off" minlength="12" required placeholder="输入相册密码" aria-describedby="album-unlock-result" />
                <button type="submit">解锁相册 ↗</button></div>
              <p class="album-unlock-status" id="album-unlock-result" aria-live="polite"></p>
            </form>
          </div>` : '';
      const photoGrid = locked ? '' : `<div class="album-photo-heading"><div><span class="eyebrow">THE FRAMES</span><h2>这本相册里的照片<span class="landing-period">.</span></h2></div><span>${ready.count} PHOTOS</span></div>
        <div class="album-photo-grid" id="album-photo-grid">${ready.photos.map((photo,index) => `
          <button class="album-photo" type="button" data-album-photo="${index}" aria-label="查看照片：${escapeHtml(photo.title)}">
            <span class="album-photo-image"><img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.alt)}" loading="lazy" decoding="async" /></span>
            <span class="album-photo-caption"><span>${String(index+1).padStart(2,'0')} / ${escapeHtml(photo.title)}</span><span aria-hidden="true">↗</span></span>
          </button>`).join('')}</div>`;
      $('#album-detail-content').innerHTML = `
        <div class="interior-topline"><a href="#gallery">← 返回全部相册</a><span>COLLECTION / ${escapeHtml(date)}</span></div>
        <header class="album-detail-hero ${locked ? 'is-protected' : ''}">
          <div class="album-detail-copy"><span class="eyebrow">PHOTO ESSENTIALS / ${escapeHtml(date)}</span>
            <h1>${escapeHtml(album.title)}<span class="landing-period">.</span></h1>
            <p>${escapeHtml(album.description)}</p>
            <div class="album-detail-meta"><span>${album.count} 帧画面</span><span>${escapeHtml(date)}</span>${album.protected ? '<span>🔒 私密主题</span>' : ''}</div>
            ${lockArea}
          </div>
          <div class="album-detail-cover">${albumCoverMarkup(album, album.title)}</div>
        </header>
        ${photoGrid}
        <div class="album-detail-bottom"><a href="#gallery">← 返回主题相册</a></div>`;
    }

    function fromBase64(text) {
      return Uint8Array.from(atob(text), ch => ch.charCodeAt(0));
    }

    async function decryptAsset(url, key) {
      const response = await fetch(url, {cache:'no-store'});
      if (!response.ok) throw new Error('加密文件未找到，请检查构建设置');
      const data = await response.arrayBuffer();
      if (data.byteLength < 29) throw new Error('加密文件格式不正确');
      const nonce = new Uint8Array(data, 0, 12);
      // Node writes [12-byte nonce][ciphertext][16-byte GCM authentication tag].
      return crypto.subtle.decrypt({name:'AES-GCM', iv:nonce, tagLength:128}, key, data.slice(12));
    }

    async function decryptProtectedAlbum(album, password) {
      if (!window.isSecureContext || !window.crypto?.subtle) {
        throw new Error('密码相册需要 HTTPS 或 localhost 环境');
      }
      const material = await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
      const key = await crypto.subtle.deriveKey({name:'PBKDF2',salt:fromBase64(album.salt),iterations:350000,hash:'SHA-256'},
        material,{name:'AES-GCM',length:256},false,['decrypt']);
      const metadataBytes = await decryptAsset(album.manifest, key);
      const privateInfo = JSON.parse(new TextDecoder().decode(metadataBytes));
      if (!Array.isArray(privateInfo.photos) || privateInfo.photos.length !== album.count) {
        throw new Error('相册内容与配置不一致');
      }
      const paths = [...new Set(privateInfo.photos.map(p => p.src))];
      const blobs = new Map();
      try {
        // The password only unlocks encrypted payloads in this tab. The site
        // never stores the password or plaintext photos on the server.
        for (const path of paths) {
          if (!path.startsWith('photos/.vault/' + album.id + '/')) throw new Error('加密图片路径异常');
          const info = privateInfo.photos.find(p=>p.src===path);
          const decoded = await decryptAsset(path,key);
          blobs.set(path,URL.createObjectURL(new Blob([decoded],{type:info.mime})));
        }
      } catch (error) {
        blobs.forEach(url => URL.revokeObjectURL(url));
        throw error;
      }
      if (!blobs.has(privateInfo.cover)) {
        blobs.forEach(url => URL.revokeObjectURL(url));
        throw new Error('相册封面未找到');
      }
      return {...album,cover:blobs.get(privateInfo.cover),photos:privateInfo.photos.map(p=>({
        title:p.title,alt:p.alt,note:p.note,src:blobs.get(p.src)
      }))};
    }

    async function handlePostUnlock(event) {
      const form = event.target.closest('[data-post-unlock]');
      if (!form) return;
      event.preventDefault();
      const post = getPost(form.dataset.postUnlock);
      if (!post?.protected) return;
      const input = form.querySelector('input');
      const button = form.querySelector('button');
      const status = form.querySelector('[aria-live]');
      const password = input.value;
      input.value = '';
      button.disabled = true;
      status.textContent = '正在解锁…';
      try {
        if (!window.isSecureContext || !window.crypto?.subtle) throw new Error('需要 HTTPS 或 localhost');
        const material = await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
        const key = await crypto.subtle.deriveKey({name:'PBKDF2',salt:fromBase64(post.salt),iterations:350000,hash:'SHA-256'},
          material,{name:'AES-GCM',length:256},false,['decrypt']);
        if (post.vault !== 'posts/.vault/' + post.id + '.bin') throw new Error('文章路径异常');
        const data = await decryptAsset(post.vault,key);
        unlockedPosts.set(post.id,new TextDecoder().decode(data));
        renderPost(post);
        showToast('文章已解锁，仅在当前标签页有效');
      } catch (error) {
        status.textContent = error.name === 'OperationError' ? '密码错误，请重新输入' : (error.message || '解锁失败');
        button.disabled = false;
        input.focus();
      }
    }

    async function handleAlbumUnlock(event) {
      const form = event.target.closest('[data-album-unlock]');
      if (!form) return;
      event.preventDefault();
      const album = albums.find(a=>a.id===form.dataset.albumUnlock);
      if (!album || !album.protected) return;
      const input = form.querySelector('input');
      const button = form.querySelector('button');
      const status = form.querySelector('[aria-live]');
      const password = input.value;
      input.value = '';
      status.textContent = '正在安全解锁…';
      button.disabled = true;
      try {
        const resolved = await decryptProtectedAlbum(album,password);
        unlockedAlbums.set(album.id,resolved);
        renderAlbumDetail(album);
        renderAlbums();
        renderChannelHighlights();
        showToast('相册已解锁，只在当前标签页有效');
      } catch (error) {
        status.textContent = error.name === 'OperationError' ? '密码不正确，请再试一次' : (error.message || '解锁失败，请重试');
        button.disabled = false;
        input.focus();
      }
    }

    function showPhoto(index) {
      if (!visiblePhotos.length || !selectedAlbum) return;
      activePhotoIndex = (index + visiblePhotos.length) % visiblePhotos.length;
      const photo = visiblePhotos[activePhotoIndex];
      $('#photo-large').src = photo.src;
      $('#photo-large').alt = photo.alt;
      $('#photo-large-kind').textContent = selectedAlbum.title + ' / PHOTO';
      $('#photo-large-title').textContent = photo.title;
      $('#photo-large-desc').textContent = photo.note || selectedAlbum.description;
      $('#photo-large-count').textContent = `${activePhotoIndex+1} / ${visiblePhotos.length}`;
    }

    function openPhoto(index) {
      visiblePhotos = selectedAlbum?.photos || [];
      if (!visiblePhotos.length) return;
      showPhoto(index);
      if (!$('#photo-dialog').open) $('#photo-dialog').showModal();
    }

    function makeToc(content) {
      const doc = new DOMParser().parseFromString(content, 'text/html');
      return [...doc.querySelectorAll('h2')].map((heading,index) => ({ id:'section-' + index, label:heading.textContent.trim() }));
    }

    function renderPost(post) {
      const channelHref = '#' + CHANNEL_ROUTES[post.channel];
      const backHref = ['#home','#tech','#journal','#gallery','#articles','#archive'].includes(lastListingRoute) ? lastListingRoute : channelHref;
      const backLabel = {
        '#home':'\u8fd4\u56de\u9996\u9875','#tech':'\u8fd4\u56de\u6280\u672f',
        '#journal':'\u8fd4\u56de\u65e5\u8bb0','#gallery':'\u8fd4\u56de\u6444\u5f71',
        '#articles':'\u8fd4\u56de\u6587\u7ae0\u5217\u8868', '#archive':'返回时间归档'
      }[backHref];
      const readableContent = post.protected ? (unlockedPosts.get(post.id) || '') : post.content;
      const toc = makeToc(readableContent);
      let tocIndex = 0;
      const bodyHtml = readableContent.replace(/<h2>/g, () => '<h2 id="section-' + (tocIndex++) + '">');
      const recs = posts.filter(p => p.id !== post.id).sort((a,b) => (b.channel === post.channel) - (a.channel === post.channel) || b.date.localeCompare(a.date)).slice(0,2);
      $('#post-view').innerHTML = `
        <div class="container article-shell">
          <nav class="article-breadcrumb" aria-label="面包屑导航"><a href="#home">首页</a><span class="slash">/</span><a href="${channelHref}">${escapeHtml(CHANNEL_NAMES[post.channel])}</a><span class="slash">/</span><a href="#articles" data-article-channel="${post.channel}" data-article-subcategory="${escapeHtml(post.subcategory)}">${escapeHtml(post.subcategoryLabel)}</a></nav>
          <header class="article-heading">
            <span class="eyebrow">${escapeHtml(CHANNEL_NAMES[post.channel])} / ${escapeHtml(post.subcategoryLabel)}</span>
            <h1>${escapeHtml(post.title)}</h1>
            <p>${escapeHtml(post.excerpt)}</p>
            <div class="article-tags">${(post.tags || []).map(t => `<a href="#articles" data-article-channel="${post.channel}" data-article-tag="${escapeHtml(t)}">#${escapeHtml(t)}</a>`).join('')}</div>
            <div class="article-meta"><span>文 / ${escapeHtml(SITE.author)}</span><b></b><time datetime="${post.date}">${dateLabel(post.date)}</time><b></b><span>约 ${minutes(post)} 分钟阅读</span></div>
          </header>
          <div class="article-cover cover-${escapeHtml(post.cover)}" role="img" aria-label="文章装饰封面">
            <span class="cover-nr">AN OPEN JOURNAL / ${post.date.slice(0,4)}</span><span class="cover-deco" aria-hidden="true">${escapeHtml(post.icon)}</span><span class="cover-word">${escapeHtml(post.coverWord)}</span>
          </div>
          <div class="article-body-layout">
            <div>
              <article class="prose">${post.protected && !unlockedPosts.has(post.id) ? `
                <section class="post-unlock-panel">
                  <span class="eyebrow">PRIVATE WRITING / 加密文章</span>
                  <h2>这篇文字需要密码解锁</h2>
                  <p>文章正文已加密，输入密码后仅在当前浏览器标签页中解锁。</p>
                  <form data-post-unlock="${escapeHtml(post.id)}">
                    <label for="post-password">文章密码</label>
                    <div class="album-unlock-input-row">
                      <input id="post-password" type="password" autocomplete="off" minlength="12" required placeholder="输入文章密码" />
                      <button type="submit">解锁文章</button>
                    </div>
                    <p class="album-unlock-status" aria-live="polite"></p>
                  </form>
                </section>` : bodyHtml}</article>
              <div class="article-bottom"><button type="button" id="share-post"><span aria-hidden="true">↗</span> 复制文章链接</button><a href="${backHref}">← ${backLabel}</a></div>
            </div>
            <aside class="reading-aside" aria-label="文章目录">
              <span>IN THIS ARTICLE / 阅读目录</span><nav class="toc-list">${toc.map(t => `<a href="#${t.id}" data-section="${t.id}">${escapeHtml(t.label)}</a>`).join('')}</nav>
              <div class="aside-divider"></div><p class="aside-quote">“慢慢写，<br />慢慢遇见好风景。”</p>
            </aside>
          </div>
          <h2 class="related-header">或许你还想读<span style="color:var(--accent)">.</span></h2>
          <div class="related-grid">${recs.map(p => `<a class="related-card" href="#post/${encodeURIComponent(p.id)}"><div><small>${escapeHtml(p.subcategoryLabel)}</small><h3>${escapeHtml(p.title)}</h3></div><span aria-hidden="true">↗</span></a>`).join('')}</div>
        </div>`;
      $('#share-post').addEventListener('click', () => copyLink(location.href));
      $('#post-view').querySelectorAll('[data-section]').forEach(link => {
        link.addEventListener('click', event => {
          event.preventDefault();
          document.getElementById(link.dataset.section)?.scrollIntoView({behavior:'smooth'});
        });
      });
    }

    function route() {
      const hash = decodeURIComponent(location.hash.slice(1));
      const isPost = hash.startsWith('post/');
      const isAlbum = hash.startsWith('album/');
      const post = isPost ? getPost(hash.slice(5)) : null;
      const album = isAlbum ? albums.find(item => item.id === hash.slice(6)) : null;
      const allowed = ['home','tech','journal','gallery','articles','archive','about'];
      const page = post ? 'post' : album ? 'album' : allowed.includes(hash) ? hash : 'home';
      if (!post && ['home','tech','journal','gallery','articles','archive'].includes(page)) lastListingRoute = '#' + page;
      const views = {home:'home-view',tech:'tech-view',journal:'journal-view',articles:'articles-view',archive:'archive-view',about:'about-view',post:'post-view'};
      Object.entries(views).forEach(([key,id]) => { document.getElementById(id).hidden = page !== key; });
      $('#gallery-page-view').hidden = !['gallery','album'].includes(page);
      $('#album-overview').hidden = page !== 'gallery';
      $('#album-detail').hidden = page !== 'album';
      currentPostId = post ? post.id : null;
      const labels = {tech:'\u6280\u672f\u5b9e\u9a8c\u5ba4',journal:'\u751f\u6d3b\u65e5\u8bb0',gallery:'\u6444\u5f71\u76f8\u518c',articles:'\u6587\u7ae0',archive:'时光归档',about:'\u5173\u4e8e'};
      document.title = post ? post.title + ' \u00b7 ' + SITE.name : album ? album.title + ' \u00b7 ' + SITE.name : labels[page] ? labels[page] + ' \u00b7 ' + SITE.name : SITE.name + ' \u00b7 CODE / LIFE / PHOTOS';
      document.querySelectorAll('[data-nav]').forEach(link => {
        const active = !post && (page === link.dataset.nav || (page === 'album' && link.dataset.nav === 'gallery'));
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
      });
      $('#site-header').classList.remove('nav-open');
      $('#menu-toggle').setAttribute('aria-expanded','false');
      $('#menu-toggle').setAttribute('aria-label','\u6253\u5f00\u5bfc\u822a\u83dc\u5355');
      closeSortMenus();
      closeFilterDrawer();
      if ($('#photo-dialog').open) $('#photo-dialog').close();
      if (post) renderPost(post);
      else {
        $('#post-view').innerHTML = '';
        if (page === 'tech' || page === 'journal') renderChannelPage(page);
        if (page === 'album') renderAlbumDetail(album);
        if (isPost && !post) showToast('\u8fd9\u7bc7\u6587\u7ae0\u4e0d\u5b58\u5728');
        if (isAlbum && !album) showToast('\u76f8\u518c\u4e0d\u5b58\u5728');
      }
      requestAnimationFrame(() => window.scrollTo({top:0,behavior:'instant'}));
      updateProgress();
    }

    function updateProgress() {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const percent = currentPostId && maxScroll > 0 ? Math.min(100,Math.max(0,window.scrollY / maxScroll * 100)) : 0;
      $('#read-progress').style.width = percent + '%';
    }

    function showToast(message) {
      const toast = $('#toast');
      toast.textContent = message;
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
    }

    async function copyLink(url) {
      try {
        if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(url);
        else {
          const textArea = document.createElement('textarea');
          textArea.value = url;
          textArea.style.position = 'fixed';
          textArea.style.opacity = '0';
          document.body.appendChild(textArea);
          textArea.select();
          if (!document.execCommand('copy')) throw new Error('copy failed');
          textArea.remove();
        }
        showToast('文章链接已复制 ✳');
      } catch (_) { showToast('暂时无法复制，请手动复制浏览器地址'); }
    }

    function focusSearch() {
      activeChannel = null; activeSubcategory = 'all'; activeTag = null; showAllTags = false; renderPosts();
      if (location.hash !== '#articles') location.hash = '#articles';
      else $('#articles').scrollIntoView({behavior:'smooth'});
      requestAnimationFrame(() => setTimeout(() => $('#search-input').focus({preventScroll:true}),120));
    }

    function init() {
      setSiteInfo();
      setupFilterDrawers();
      document.querySelector('.skip-link').addEventListener('click', event => {
        event.preventDefault();
        const title = document.querySelector('#post-view:not([hidden]) h1, #tech-view:not([hidden]) h1, #journal-view:not([hidden]) h1, #gallery-page-view:not([hidden]) h1, #articles-view:not([hidden]) h2, #archive-view:not([hidden]) h1, #about-view:not([hidden]) h2, #home-view:not([hidden]) h1');
        if (title) {
          title.setAttribute('tabindex','-1');
          title.focus({preventScroll:true});
          title.scrollIntoView({behavior:'smooth',block:'start'});
        }
      });
      renderPosts();
      renderChronicle();
      setupChronicle();
      renderTechAndJournal();
      renderChannelPage('tech');
      renderChannelPage('journal');
      renderAlbums();
      renderChannelHighlights();
      $('#channel-filters').addEventListener('click', event => {
        const btn = event.target.closest('[data-channel]');
        if (!btn) return;
        activeChannel = btn.dataset.channel === 'all' ? null : btn.dataset.channel;
        activeSubcategory = 'all';
        activeTag = null;
        showAllTags = false;
        renderPosts();
      });
      $('#subcategory-filters').addEventListener('click', event => {
        const btn = event.target.closest('[data-subcategory]');
        if (!btn) return;
        const entryChannel = btn.dataset.entryChannel;
        if (entryChannel) activeChannel = entryChannel === 'all' ? null : entryChannel;
        activeSubcategory = btn.dataset.subcategory;
        activeTag = null;
        showAllTags = false;
        renderPosts();
      });
      $('#tag-filters').addEventListener('click', event => {
        if (event.target.closest('[data-expand-tags]')) { showAllTags = !showAllTags; renderFilters(); return; }
        const btn = event.target.closest('[data-tag]');
        if (!btn) return;
        activeTag = btn.dataset.tag === 'all' || btn.dataset.tag === activeTag ? null : btn.dataset.tag;
        renderPosts();
        $('#tag-panel').open = false;
      });
      document.addEventListener('click', event => {
        const link = event.target.closest('[data-article-channel]');
        if (!link) return;
        activeChannel = link.dataset.articleChannel;
        activeSubcategory = link.dataset.articleSubcategory || 'all';
        activeTag = link.dataset.articleTag || null;
        showAllTags = !!activeTag;
        keyword = '';
        $('#search-input').value = '';
        renderPosts();
        if (location.hash === '#articles') $('#articles').scrollIntoView({behavior:'smooth'});
      });
      $('#search-input').addEventListener('input', event => { keyword = event.target.value; renderPosts(); });
      document.querySelectorAll('[data-tag-disclosure]').forEach(detail => {
        detail.addEventListener('toggle', () => {
          if (!detail.open) return;
          document.querySelectorAll('[data-tag-disclosure]').forEach(other => { if (other !== detail) other.open = false; });
        });
      });
      document.addEventListener('click', event => {
        if (!event.target.closest('[data-tag-disclosure]')) {
          document.querySelectorAll('[data-tag-disclosure]').forEach(detail => { detail.open = false; });
        }
      });
      document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        document.querySelectorAll('[data-tag-disclosure]').forEach(detail => {
          if (!detail.open) return;
          detail.open = false;
          detail.querySelector('summary').focus({preventScroll:true});
        });
      });
      setupSortMenus();
      $('#reset-filters').addEventListener('click', () => {
        activeChannel = null; activeSubcategory = 'all'; activeTag = null; showAllTags = false; keyword = ''; sortOrder = 'newest';
        $('#search-input').value = ''; renderPosts();
      });
      $('#search-jump').addEventListener('click', focusSearch);
      document.querySelectorAll('[data-channel-search]').forEach(input => input.addEventListener('input', event => {
        const page = event.target.dataset.channelSearch;
        channelPageState[page].search = event.target.value;
        renderChannelPage(page);
      }));
      document.querySelectorAll('.channel-page-view').forEach(view => view.addEventListener('click', event => {
        const topic = event.target.closest('[data-channel-topic]');
        const tag = event.target.closest('[data-channel-tag]');
        const reset = event.target.closest('[data-reset-channel]');
        if (topic) {
          const page = topic.dataset.channelTopic;
          channelPageState[page].subcategory = topic.dataset.topic;
          channelPageState[page].tag = null;
          renderChannelPage(page);
        } else if (tag) {
          const page = tag.dataset.channelTag;
          const selected = tag.dataset.tag;
          channelPageState[page].tag = selected === 'all' || channelPageState[page].tag === selected ? null : selected;
          renderChannelPage(page);
          document.querySelector(`[data-tag-disclosure="${page}"]`).open = false;
        } else if (reset) {
          const page = reset.dataset.resetChannel;
          Object.assign(channelPageState[page],{subcategory:'all',tag:null,search:'',sort:'newest'});
          document.getElementById(page+'-page-search').value = '';
          renderChannelPage(page);
        }
      }));
      document.addEventListener('click', event => {
        const tag = event.target.closest('[data-card-tag]');
        if (!tag) return;
        const chosen = tag.dataset.cardTag;
        const channel = tag.dataset.cardChannel;
        const page = location.hash === '#tech' ? 'tech' : location.hash === '#journal' ? 'journal' : null;
        if (page && channel === (page === 'tech' ? 'tech' : 'life')) {
          channelPageState[page].tag = chosen;
          renderChannelPage(page);
        } else {
          activeChannel = channel;
          activeSubcategory = 'all';
          activeTag = chosen;
          showAllTags = true;
          keyword = '';
          $('#search-input').value = '';
          renderPosts();
          if (location.hash !== '#articles') location.hash = '#articles';
        }
      });
      $('#album-detail').addEventListener('submit', handleAlbumUnlock);
      $('#post-view').addEventListener('submit', handlePostUnlock);
      $('#album-detail').addEventListener('click', event => {
        const photo = event.target.closest('[data-album-photo]');
        if (photo) openPhoto(Number(photo.dataset.albumPhoto));
      });
      $('#photo-close').addEventListener('click', () => $('#photo-dialog').close());
      $('#photo-prev').addEventListener('click', () => showPhoto(activePhotoIndex-1));
      $('#photo-next').addEventListener('click', () => showPhoto(activePhotoIndex+1));
      $('#photo-dialog').addEventListener('click', event => { if (event.target === $('#photo-dialog')) $('#photo-dialog').close(); });
      // Independently selectable palettes (default warm garden), persisted locally.
      const PALETTES = ['feather','garden','moss','plum','coral'];
      const paletteToggle = $('#palette-toggle');
      const paletteMenu = $('#palette-menu');
      const updateThemeColor = () => {
        document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#fff9ef';
      };
      const closePalette = (focus) => {
        paletteMenu.hidden = true;
        paletteToggle.setAttribute('aria-expanded','false');
        if (focus) paletteToggle.focus();
      };
      const syncPalette = () => {
        const current = document.documentElement.dataset.palette || 'feather';
        paletteMenu.querySelectorAll('[data-palette-option]').forEach(button => {
          button.setAttribute('aria-pressed',String(button.dataset.paletteOption === current));
        });
        updateThemeColor();
      };
      if (!PALETTES.includes(document.documentElement.dataset.palette)) document.documentElement.dataset.palette = 'feather';
      syncPalette();
      paletteToggle.addEventListener('click', () => {
        const opening = paletteMenu.hidden;
        paletteMenu.hidden = !opening;
        paletteToggle.setAttribute('aria-expanded',String(opening));
        if (opening) paletteMenu.querySelector('[aria-pressed="true"]')?.focus();
      });
      paletteMenu.addEventListener('click', event => {
        const option = event.target.closest('[data-palette-option]');
        if (!option) return;
        const chosen = option.dataset.paletteOption;
        if (!PALETTES.includes(chosen)) return;
        document.documentElement.dataset.palette = chosen;
        try { localStorage.setItem('xiaoman-palette', chosen); } catch (_) {}
        syncPalette();
        closePalette(true);
      });
      document.addEventListener('click', event => {
        if (!$('#palette-control').contains(event.target)) closePalette(false);
      });
      paletteMenu.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); closePalette(true); }
        const options = [...paletteMenu.querySelectorAll('[data-palette-option]')];
        const index = options.indexOf(document.activeElement);
        if (index >= 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
          event.preventDefault();
          options[(index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length].focus();
        }
      });
      $('#theme-toggle').addEventListener('click', () => {
        const dark = document.documentElement.dataset.theme !== 'dark';
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
        $('#theme-toggle').setAttribute('aria-label', dark ? '切换浅色模式' : '切换深色模式');
        $('#theme-toggle').setAttribute('aria-pressed',String(dark));
        updateThemeColor();
        try { localStorage.setItem('xiaoman-theme',dark ? 'dark' : 'light'); } catch (_) {}
      });
      if (document.documentElement.dataset.theme === 'dark') {
        $('#theme-toggle').setAttribute('aria-label','切换浅色模式');
        $('#theme-toggle').setAttribute('aria-pressed','true');
        updateThemeColor();
      }
      $('#menu-toggle').addEventListener('click', () => {
        const open = $('#site-header').classList.toggle('nav-open');
        $('#menu-toggle').setAttribute('aria-expanded',String(open));
        $('#menu-toggle').setAttribute('aria-label',open ? '关闭导航菜单' : '打开导航菜单');
      });
      document.addEventListener('keydown', event => {
        if (event.key === '/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName) && !event.metaKey && !event.ctrlKey) { event.preventDefault(); focusSearch(); }
        if ($('#photo-dialog').open && event.key === 'ArrowLeft') { event.preventDefault(); showPhoto(activePhotoIndex-1); }
        if ($('#photo-dialog').open && event.key === 'ArrowRight') { event.preventDefault(); showPhoto(activePhotoIndex+1); }
        if (event.key === 'Escape') { $('#site-header').classList.remove('nav-open'); $('#menu-toggle').setAttribute('aria-expanded','false'); }
      });
      window.addEventListener('hashchange',route);
      window.addEventListener('scroll',updateProgress,{passive:true});
      window.addEventListener('resize',updateProgress,{passive:true});
      route();
    }

    document.addEventListener('DOMContentLoaded',init);
