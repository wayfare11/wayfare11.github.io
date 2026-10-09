'use strict';
// Website logic only; articles and photos are generated from content/ by build.py.
// Avoid editing this file when publishing a new post.
const SITE = window.BLOG_DATA.site;
const posts = window.BLOG_DATA.posts;
const photos = window.BLOG_DATA.photos;
const categories = window.BLOG_DATA.categories || {};
const CHANNEL_NAMES = {tech:'技术博客',life:'生活日记',photo:'摄影随笔'};
const CHANNEL_ROUTES = {tech:'tech',life:'journal',photo:'gallery'};


    let photoCategory = 'all';
    let visiblePhotos = photos;
    let galleryPageCategory = 'all';
    const photoBuckets = {home: [], gallery: []};
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
      $('#photo-total').textContent = String(photos.length).padStart(2,'0');
    }

    function renderFilters() {
      const options = [[null,'全部文字'],['tech','技术博客'],['life','生活日记'],['photo','摄影随笔']];
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
      const featuredPhoto = posts.filter(post => post.channel === 'photo').sort((a,b) => b.date.localeCompare(a.date))[0];
      $('#featured-photo-link').href = featuredPhoto ? '#post/' + encodeURIComponent(featuredPhoto.id) : '#articles';
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
    }

    function renderGallery() {
      const used = new Set(photos.map(photo => photo.subcategory));
      const kinds = [['all','\u5168\u90e8\u7167\u7247'],...Object.entries(categories.photo || {}).filter(([key]) => used.has(key))];
      const sampleNote = photos.length && photos.every(photo => photo.note.startsWith('\u793a\u4f8b\u7d20\u6750'))
        ? '\u5f53\u524d\u4e3a\u6f14\u793a\u56fe\u7247\uff0c\u8bf7\u66ff\u6362\u6210\u81ea\u5df1\u7684\u4f5c\u54c1' : '\u70b9\u51fb\u7167\u7247\u53ef\u653e\u5927\u67e5\u770b';
      for (const [scope, category, filtersId, gridId] of [
        ['home',photoCategory,'photo-filters','gallery-grid'],
        ['gallery',galleryPageCategory,'gallery-page-filters','gallery-page-grid']
      ]) {
        const list = category === 'all' ? [...photos] : photos.filter(photo => photo.subcategory === category);
        photoBuckets[scope] = list;
        document.getElementById(filtersId).innerHTML = kinds.map(([key,label]) => {
          const selected = key === category;
          const count = key === 'all' ? photos.length : photos.filter(p => p.subcategory === key).length;
          return `<button type="button" class="filter-button ${selected ? 'active' : ''}" data-photo-filter="${escapeHtml(key)}" data-photo-scope="${scope}" aria-pressed="${selected}">${escapeHtml(label)} <small>${count}</small></button>`;
        }).join('');
        document.getElementById(gridId).innerHTML = list.map((photo,index) => `
          <button class="photo-card photo-card-${index}" type="button" data-photo-index="${index}" data-photo-scope="${scope}" aria-label="\u653e\u5927\u7167\u7247\uff1a${escapeHtml(photo.title)}">
            <img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.alt)}" loading="lazy" decoding="async" />
            <span class="photo-badge">${escapeHtml(photo.subcategoryLabel)} / ${String(index+1).padStart(2,'0')}</span>
            <span class="photo-overlay"><strong>${escapeHtml(photo.title)}</strong><span aria-hidden="true">\u2197</span></span>
          </button>`).join('');
        if (scope === 'gallery') document.getElementById('gallery-page-empty').hidden = list.length !== 0;
      }
      document.querySelector('#home-gallery .gallery-sample-note').textContent = sampleNote;
      document.getElementById('gallery-page-sample-note').textContent = sampleNote;
      document.getElementById('gallery-page-total').textContent = String(photos.length).padStart(2,'0');
      const essays = posts.filter(post => post.channel === 'photo').sort((a,b) => b.date.localeCompare(a.date));
      document.getElementById('photo-page-posts').innerHTML = essays.map(post => makeCard(post)).join('');
      document.getElementById('photo-page-empty').hidden = essays.length !== 0;
    }

    function showPhoto(index) {
      if (!visiblePhotos.length) return;
      activePhotoIndex = (index + visiblePhotos.length) % visiblePhotos.length;
      const photo = visiblePhotos[activePhotoIndex];
      $('#photo-large').src = photo.src;
      $('#photo-large').alt = photo.alt;
      $('#photo-large-kind').textContent = photo.subcategoryLabel + (photo.note.startsWith('示例素材') ? ' / SAMPLE PHOTO' : ' / PHOTO');
      $('#photo-large-title').textContent = photo.title;
      $('#photo-large-desc').textContent = photo.note;
      $('#photo-large-count').textContent = `${activePhotoIndex+1} / ${visiblePhotos.length}`;
    }

    function openPhoto(index, scope = 'home') {
      visiblePhotos = photoBuckets[scope] || [];
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
      const post = isPost ? getPost(hash.slice(5)) : null;
      const allowed = ['home','tech','journal','gallery','articles','about'];
      const page = post ? 'post' : allowed.includes(hash) ? hash : 'home';
      if (!post && ['home','tech','journal','gallery','articles'].includes(page)) lastListingRoute = '#' + page;
      const pageViews = {
        home:'home-view',tech:'tech-view',journal:'journal-view',gallery:'gallery-page-view',
        articles:'articles-view',about:'about-view',post:'post-view'
      };
      Object.entries(pageViews).forEach(([key,id]) => {
        document.getElementById(id).hidden = page !== key;
      });
      currentPostId = post ? post.id : null;
      const labels = {tech:'\u6280\u672f\u5b9e\u9a8c\u5ba4',journal:'\u751f\u6d3b\u65e5\u8bb0',gallery:'\u6444\u5f71\u4f5c\u54c1',articles:'\u6587\u7ae0',about:'\u5173\u4e8e'};
      document.title = post ? post.title + ' \u00b7 ' + SITE.name : labels[page] ? labels[page] + ' \u00b7 ' + SITE.name : SITE.name + ' \u00b7 \u4ee3\u7801\u3001\u751f\u6d3b\u4e0e\u5149\u5f71';
      document.querySelectorAll('[data-nav]').forEach(link => {
        const active = !post && page === link.dataset.nav;
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
      });
      $('#site-header').classList.remove('nav-open');
      $('#menu-toggle').setAttribute('aria-expanded','false');
      $('#menu-toggle').setAttribute('aria-label','\u6253\u5f00\u5bfc\u822a\u83dc\u5355');
      if ($('#photo-dialog').open) $('#photo-dialog').close();
      if (post) renderPost(post);
      else {
        $('#post-view').innerHTML = '';
        if (page === 'tech' || page === 'journal') renderChannelPage(page);
        if (page === 'gallery') renderGallery();
        if (isPost && !post) showToast('\u8fd9\u7bc7\u6587\u7ae0\u6682\u65f6\u4e0d\u5b58\u5728\uff0c\u5df2\u8fd4\u56de\u9996\u9875');
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
      renderGallery();
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
      $('#sort-select').addEventListener('change', event => { sortOrder = event.target.value; renderPosts(); });
      $('#reset-filters').addEventListener('click', () => {
        activeChannel = null; activeSubcategory = 'all'; activeTag = null; showAllTags = false; keyword = ''; sortOrder = 'newest';
        $('#search-input').value = ''; $('#sort-select').value = 'newest'; renderPosts();
      });
      $('#search-jump').addEventListener('click', focusSearch);
      document.querySelectorAll('[data-channel-search]').forEach(input => input.addEventListener('input', event => {
        const page = event.target.dataset.channelSearch;
        channelPageState[page].search = event.target.value;
        renderChannelPage(page);
      }));
      document.querySelectorAll('[data-channel-sort]').forEach(input => input.addEventListener('change', event => {
        const page = event.target.dataset.channelSort;
        channelPageState[page].sort = event.target.value;
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
          document.querySelector(`[data-channel-sort="${page}"]`).value = 'newest';
          renderChannelPage(page);
        }
      }));
      document.querySelectorAll('#photo-filters,#gallery-page-filters').forEach(group => group.addEventListener('click', event => {
        const button = event.target.closest('[data-photo-filter]');
        if (!button) return;
        if (button.dataset.photoScope === 'gallery') galleryPageCategory = button.dataset.photoFilter;
        else photoCategory = button.dataset.photoFilter;
        renderGallery();
      }));
      document.querySelectorAll('#gallery-grid,#gallery-page-grid').forEach(grid => grid.addEventListener('click', event => {
        const photo = event.target.closest('[data-photo-index]');
        if (photo) openPhoto(Number(photo.dataset.photoIndex), photo.dataset.photoScope);
      }));
      $('#photo-close').addEventListener('click', () => $('#photo-dialog').close());
      $('#photo-prev').addEventListener('click', () => showPhoto(activePhotoIndex-1));
      $('#photo-next').addEventListener('click', () => showPhoto(activePhotoIndex+1));
      $('#photo-dialog').addEventListener('click', event => { if (event.target === $('#photo-dialog')) $('#photo-dialog').close(); });
      $('#theme-toggle').addEventListener('click', () => {
        const dark = document.documentElement.dataset.theme !== 'dark';
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
        $('#theme-toggle').setAttribute('aria-label', dark ? '切换浅色模式' : '切换深色模式');
        $('#theme-toggle').setAttribute('aria-pressed',String(dark));
        document.querySelector('meta[name="theme-color"]').content = dark ? '#191e1b' : '#f8f7f2';
        try { localStorage.setItem('xiaoman-theme',dark ? 'dark' : 'light'); } catch (_) {}
      });
      if (document.documentElement.dataset.theme === 'dark') {
        $('#theme-toggle').setAttribute('aria-label','切换浅色模式');
        $('#theme-toggle').setAttribute('aria-pressed','true');
        document.querySelector('meta[name="theme-color"]').content = '#191e1b';
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
