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
    const minutes = post => Math.max(2, Math.ceil(post.content.replace(/<[^>]*>/g, '').replace(/\s+/g, '').length / 320));
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
      $('#photo-total').textContent = String(albums.reduce((sum, a) => sum + a.photos.length, 0)).padStart(2,'0');
    }

    function renderFilters() {
      const options = [[null,'全部文字'],['tech','技术博客'],['life','生活日记']];
      $('#channel-filters').innerHTML = options.map(([channel,label]) => {
        const total = posts.filter(post => !channel || post.channel === channel).length;
        const selected = activeChannel === channel;
        return `<button class="channel-filter ${selected ? 'active' : ''}" type="button" data-channel="${channel || 'all'}" aria-pressed="${selected}"><span>${escapeHtml(label)}</span><small>${total}</small></button>`;
      }).join('');

      $('#taxonomy-panel').hidden = !activeChannel;
      if (activeChannel) {
        const list = posts.filter(post => post.channel === activeChannel);
        const items = Object.entries(categories[activeChannel] || {});
        $('#subcategory-filters').innerHTML = `<button class="filter-button ${activeSubcategory === 'all' ? 'active' : ''}" type="button" data-subcategory="all" aria-pressed="${activeSubcategory === 'all'}">全部子分类 <small>${list.length}</small></button>` +
          items.map(([key,label]) => {
            const count = list.filter(post => post.subcategory === key).length;
            const active = key === activeSubcategory;
            return `<button class="filter-button ${active ? 'active' : ''}" type="button" data-subcategory="${escapeHtml(key)}" aria-pressed="${active}">${escapeHtml(label)} <small>${count}</small></button>`;
          }).join('');
      }
      const withinChannel = posts.filter(post => !activeChannel || post.channel === activeChannel);
      const tagCounts = new Map();
      withinChannel.forEach(post => (post.tags || []).forEach(tag => tagCounts.set(tag,(tagCounts.get(tag) || 0)+1)));
      const entries = [...tagCounts].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0],'zh-CN'));
      $('#tag-panel').hidden = entries.length === 0;
      const visibleTags = showAllTags ? entries : entries.slice(0,10);
      $('#tag-filters').innerHTML = `<button class="tag-filter ${!activeTag ? 'active' : ''}" type="button" data-tag="all" aria-pressed="${!activeTag}">全部标签</button>` +
        visibleTags.map(([tag,count]) => `<button class="tag-filter ${activeTag === tag ? 'active' : ''}" type="button" data-tag="${escapeHtml(tag)}" aria-pressed="${activeTag === tag}">#${escapeHtml(tag)} <small>${count}</small></button>`).join('') +
        (entries.length > 10 ? `<button class="tag-expand" type="button" data-expand-tags="true">${showAllTags ? '收起' : '更多标签 +'}</button>` : '');
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
            <div class="post-tags">${(post.tags || []).slice(0,3).map(t => `<span>#${escapeHtml(t)}</span>`).join('')}</div>
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
      const featured = !keyword.trim() && !activeChannel && !activeTag && activeSubcategory === 'all' && sortOrder === 'newest';
      $('#posts-grid').innerHTML = list.map((post,index) => makeCard(post, featured && index === 0)).join('');
      const currentLabel = activeChannel && categories[activeChannel]?.[activeSubcategory];
      $('#results-count').textContent = `共找到 ${list.length} 篇文章${activeChannel ? ' · ' + CHANNEL_NAMES[activeChannel] : ''}${currentLabel ? ' · ' + currentLabel : ''}${activeTag ? ' · #' + activeTag : ''}`;
      $('#empty-state').hidden = list.length !== 0;
      renderFilters();
      updateSortUI('archive');
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
        [['all','\u5168\u90e8\u4e3b\u9898'],...Object.entries(categories[channel] || {})].map(([id,label]) => {
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
      const filtered = state.tag ? found.filter(p => (p.tags || []).includes(state.tag)) : found;
      document.getElementById(page+'-page-posts').innerHTML = filtered.map(post => makeCard(post)).join('');
      document.getElementById(page+'-page-results').textContent = `\u5171 ${filtered.length} \u7bc7${channel === 'tech' ? '\u6280\u672f\u6587\u7ae0' : '\u751f\u6d3b\u65e5\u8bb0'}`;
      document.getElementById(page+'-page-empty').hidden = filtered.length !== 0;
      updateSortUI(page);
    }

    function albumCard(album, index) {
      return `<a class="album-card" href="#album/${encodeURIComponent(album.id)}" aria-label="\u67e5\u770b\u76f8\u518c\uff1a${escapeHtml(album.title)}">
          <span class="album-card-image"><img src="${escapeHtml(album.cover)}" alt="${escapeHtml(album.title)}" loading="lazy" decoding="async" /></span>
          <span class="album-card-info"><span class="album-card-upper">COLLECTION / ${String(index+1).padStart(2,'0')}</span><strong>${escapeHtml(album.title)}</strong><span class="album-card-desc">${escapeHtml(album.description)}</span><span class="album-card-meta">${album.count} \u5f20\u7167\u7247 <span aria-hidden="true">\u2197</span></span></span>
        </a>`;
    }

    function renderAlbums() {
      $('#home-albums-grid').innerHTML = albums.slice(0,3).map(albumCard).join('');
      $('#gallery-albums-grid').innerHTML = albums.map(albumCard).join('');
      $('#gallery-albums-empty').hidden = albums.length !== 0;
      $('#gallery-page-total').textContent = String(albums.length).padStart(2,'0');
    }

    function renderAlbumDetail(album) {
      selectedAlbum = album;
      if (!album) return;
      const date = album.date.replace(/-/g, '.');
      $('#album-detail-content').innerHTML = `
        <div class="interior-topline"><a href="#gallery">\u2190 \u8fd4\u56de\u5168\u90e8\u76f8\u518c</a><span>COLLECTION / ${escapeHtml(date)}</span></div>
        <header class="album-detail-hero">
          <div class="album-detail-copy"><span class="eyebrow">PHOTO ESSENTIALS / ${escapeHtml(date)}</span>
            <h1>${escapeHtml(album.title)}<span class="landing-period">.</span></h1>
            <p>${escapeHtml(album.description)}</p>
            <div class="album-detail-meta"><span>${album.count} \u5e27\u753b\u9762</span><span>${escapeHtml(date)}</span></div>
          </div>
          <div class="album-detail-cover"><img src="${escapeHtml(album.cover)}" alt="${escapeHtml(album.title)}" /></div>
        </header>
        <div class="album-photo-heading"><div><span class="eyebrow">THE FRAMES</span><h2>\u8fd9\u672c\u76f8\u518c\u91cc\u7684\u7167\u7247<span class="landing-period">.</span></h2></div><span>${album.count} PHOTOS</span></div>
        <div class="album-photo-grid" id="album-photo-grid">${album.photos.map((photo,index) => `
          <button class="album-photo" type="button" data-album-photo="${index}" aria-label="\u67e5\u770b\u7167\u7247\uff1a${escapeHtml(photo.title)}">
            <span class="album-photo-image"><img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.alt)}" loading="lazy" decoding="async" /></span>
            <span class="album-photo-caption"><span>${String(index+1).padStart(2,'0')} / ${escapeHtml(photo.title)}</span><span aria-hidden="true">\u2197</span></span>
          </button>`).join('')}</div>
        <div class="album-detail-bottom"><a href="#gallery">\u2190 \u8fd4\u56de\u4e3b\u9898\u76f8\u518c</a></div>`;
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
      const backHref = ['#home','#tech','#journal','#gallery','#articles'].includes(lastListingRoute) ? lastListingRoute : channelHref;
      const backLabel = {
        '#home':'\u8fd4\u56de\u9996\u9875','#tech':'\u8fd4\u56de\u6280\u672f',
        '#journal':'\u8fd4\u56de\u65e5\u8bb0','#gallery':'\u8fd4\u56de\u6444\u5f71',
        '#articles':'\u8fd4\u56de\u6587\u7ae0\u5217\u8868'
      }[backHref];
      const toc = makeToc(post.content);
      let tocIndex = 0;
      const bodyHtml = post.content.replace(/<h2>/g, () => '<h2 id="section-' + (tocIndex++) + '">');
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
              <article class="prose">${bodyHtml}</article>
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
      const allowed = ['home','tech','journal','gallery','articles','about'];
      const page = post ? 'post' : album ? 'album' : allowed.includes(hash) ? hash : 'home';
      if (!post && ['home','tech','journal','gallery','articles'].includes(page)) lastListingRoute = '#' + page;
      const views = {home:'home-view',tech:'tech-view',journal:'journal-view',articles:'articles-view',about:'about-view',post:'post-view'};
      Object.entries(views).forEach(([key,id]) => { document.getElementById(id).hidden = page !== key; });
      $('#gallery-page-view').hidden = !['gallery','album'].includes(page);
      $('#album-overview').hidden = page !== 'gallery';
      $('#album-detail').hidden = page !== 'album';
      currentPostId = post ? post.id : null;
      const labels = {tech:'\u6280\u672f\u5b9e\u9a8c\u5ba4',journal:'\u751f\u6d3b\u65e5\u8bb0',gallery:'\u6444\u5f71\u76f8\u518c',articles:'\u6587\u7ae0',about:'\u5173\u4e8e'};
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
      document.querySelector('.skip-link').addEventListener('click', event => {
        event.preventDefault();
        const title = document.querySelector('#post-view:not([hidden]) h1, #tech-view:not([hidden]) h1, #journal-view:not([hidden]) h1, #gallery-page-view:not([hidden]) h1, #articles-view:not([hidden]) h2, #about-view:not([hidden]) h2, #home-view:not([hidden]) h1');
        if (title) {
          title.setAttribute('tabindex','-1');
          title.focus({preventScroll:true});
          title.scrollIntoView({behavior:'smooth',block:'start'});
        }
      });
      renderPosts();
      renderTechAndJournal();
      renderChannelPage('tech');
      renderChannelPage('journal');
      renderAlbums();
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
        activeSubcategory = btn.dataset.subcategory;
        renderPosts();
      });
      $('#tag-filters').addEventListener('click', event => {
        if (event.target.closest('[data-expand-tags]')) { showAllTags = !showAllTags; renderFilters(); return; }
        const btn = event.target.closest('[data-tag]');
        if (!btn) return;
        activeTag = btn.dataset.tag === 'all' || btn.dataset.tag === activeTag ? null : btn.dataset.tag;
        renderPosts();
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
        } else if (reset) {
          const page = reset.dataset.resetChannel;
          Object.assign(channelPageState[page],{subcategory:'all',tag:null,search:'',sort:'newest'});
          document.getElementById(page+'-page-search').value = '';
          renderChannelPage(page);
        }
      }));
      $('#album-detail').addEventListener('click', event => {
        const photo = event.target.closest('[data-album-photo]');
        if (photo) openPhoto(Number(photo.dataset.albumPhoto));
      });
      $('#photo-close').addEventListener('click', () => $('#photo-dialog').close());
      $('#photo-prev').addEventListener('click', () => showPhoto(activePhotoIndex-1));
      $('#photo-next').addEventListener('click', () => showPhoto(activePhotoIndex+1));
      $('#photo-dialog').addEventListener('click', event => { if (event.target === $('#photo-dialog')) $('#photo-dialog').close(); });
      // Independently selectable palettes (default monochrome), persisted locally.
      const PALETTES = ['mono','moss','plum','coral'];
      const paletteToggle = $('#palette-toggle');
      const paletteMenu = $('#palette-menu');
      const updateThemeColor = () => {
        document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#f7f7f4';
      };
      const closePalette = (focus) => {
        paletteMenu.hidden = true;
        paletteToggle.setAttribute('aria-expanded','false');
        if (focus) paletteToggle.focus();
      };
      const syncPalette = () => {
        const current = document.documentElement.dataset.palette || 'mono';
        paletteMenu.querySelectorAll('[data-palette-option]').forEach(button => {
          button.setAttribute('aria-pressed',String(button.dataset.paletteOption === current));
        });
        updateThemeColor();
      };
      if (!PALETTES.includes(document.documentElement.dataset.palette)) document.documentElement.dataset.palette = 'mono';
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
