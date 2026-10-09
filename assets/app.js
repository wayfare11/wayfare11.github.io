'use strict';
// Website logic only; articles and photos are generated from content/ by build.py.
// Avoid editing this file when publishing a new post.
const SITE = window.BLOG_DATA.site;
const posts = window.BLOG_DATA.posts;
const photos = window.BLOG_DATA.photos;
const categories = window.BLOG_DATA.categories || {};
const CHANNEL_NAMES = {tech:'技术博客',life:'生活日记',photo:'摄影随笔'};


    let photoCategory = 'all';
    let visiblePhotos = photos;
    let activePhotoIndex = 0;

    let activeSubcategory = 'all';
    let activeTag = null;
    let showAllTags = false;
    let activeChannel = null;
    let keyword = '';
    let sortOrder = 'newest';
    let toastTimer;
    let currentPostId = null;

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

    function renderGallery() {
      const used = new Set(photos.map(photo => photo.subcategory));
      const kinds = [['all','全部照片'],...Object.entries(categories.photo || {}).filter(([key]) => used.has(key))];
      $('#photo-filters').innerHTML = kinds.map(([key,label]) => {
        const active = key === photoCategory;
        return `<button type="button" class="filter-button ${active ? 'active' : ''}" data-photo-filter="${escapeHtml(key)}" aria-pressed="${active}">${escapeHtml(label)} <small>${key === 'all' ? photos.length : photos.filter(photo => photo.subcategory === key).length}</small></button>`;
      }).join('');
      $('.gallery-sample-note').textContent = photos.length && photos.every(photo => photo.note.startsWith('示例素材')) ? '当前为演示图片，请替换成自己的作品' : '点击照片可放大查看';
      visiblePhotos = photoCategory === 'all' ? [...photos] : photos.filter(photo => photo.subcategory === photoCategory);
      $('#gallery-grid').innerHTML = visiblePhotos.map((photo,index) => `
        <button class="photo-card photo-card-${index}" type="button" data-photo-index="${index}" aria-label="放大照片：${escapeHtml(photo.title)}">
          <img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.alt)}" loading="lazy" decoding="async" />
          <span class="photo-badge">${escapeHtml(photo.subcategoryLabel)} / ${String(index+1).padStart(2,'0')}</span>
          <span class="photo-overlay"><strong>${escapeHtml(photo.title)}</strong><span aria-hidden="true">↗</span></span>
        </button>`).join('');
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

    function openPhoto(index) {
      showPhoto(index);
      if (!$('#photo-dialog').open) $('#photo-dialog').showModal();
    }

    function jumpToChannel(channel) {
      activeChannel = channel;
      activeSubcategory = 'all';
      activeTag = null;
      showAllTags = false;
      keyword = '';
      sortOrder = 'newest';
      $('#search-input').value = '';
      $('#sort-select').value = 'newest';
      renderPosts();
    }

    function makeToc(content) {
      const doc = new DOMParser().parseFromString(content, 'text/html');
      return [...doc.querySelectorAll('h2')].map((heading,index) => ({ id:'section-' + index, label:heading.textContent.trim() }));
    }

    function renderPost(post) {
      const toc = makeToc(post.content);
      let tocIndex = 0;
      const bodyHtml = post.content.replace(/<h2>/g, () => '<h2 id="section-' + (tocIndex++) + '">');
      const recs = posts.filter(p => p.id !== post.id).sort((a,b) => (b.channel === post.channel) - (a.channel === post.channel) || b.date.localeCompare(a.date)).slice(0,2);
      $('#post-view').innerHTML = `
        <div class="container article-shell">
          <nav class="article-breadcrumb" aria-label="面包屑导航"><a href="#home">首页</a><span class="slash">/</span><a href="#articles" data-article-channel="${post.channel}">${escapeHtml(CHANNEL_NAMES[post.channel])}</a><span class="slash">/</span><a href="#articles" data-article-channel="${post.channel}" data-article-subcategory="${escapeHtml(post.subcategory)}">${escapeHtml(post.subcategoryLabel)}</a></nav>
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
              <div class="article-bottom"><button type="button" id="share-post"><span aria-hidden="true">↗</span> 复制文章链接</button><a href="#articles">← 返回文章列表</a></div>
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
      const page = post ? 'post' : (hash === 'articles' || hash === 'about' ? hash : 'home');
      $('#home-view').hidden = page !== 'home';
      $('#articles-view').hidden = page !== 'articles';
      $('#about-view').hidden = page !== 'about';
      $('#post-view').hidden = page !== 'post';
      currentPostId = post ? post.id : null;
      document.title = post ? post.title + ' · ' + SITE.name :
        page === 'articles' ? '文章 · ' + SITE.name :
        page === 'about' ? '关于 · ' + SITE.name : SITE.name + ' · 代码、生活与光影';
      document.querySelectorAll('[data-nav]').forEach(a => {
        const active = !post && (hash || 'home') === a.dataset.nav;
        a.classList.toggle('active', active);
        if (active) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
      });
      $('#site-header').classList.remove('nav-open');
      $('#menu-toggle').setAttribute('aria-expanded','false');
      $('#menu-toggle').setAttribute('aria-label','打开导航菜单');
      if (post) {
        renderPost(post);
        window.scrollTo({top:0,behavior:'instant'});
      } else {
        $('#post-view').innerHTML = '';
        requestAnimationFrame(() => {
          // Archive / About are actual standalone pages, not homepage anchors.
          if (page === 'articles' || page === 'about' || hash === 'home' || !hash) {
            window.scrollTo({top:0,behavior:'instant'});
          } else if (['tech','journal','gallery'].includes(hash)) {
            document.getElementById(hash)?.scrollIntoView({behavior:'instant'});
          } else {
            window.scrollTo({top:0,behavior:'instant'});
          }
        });
        if (isPost && !post) showToast('这篇文章暂时不存在，已返回首页');
      }
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
        const title = document.querySelector('#post-view:not([hidden]) h1, #articles-view:not([hidden]) h2, #about-view:not([hidden]) h2, #home-view:not([hidden]) h1');
        if (title) {
          title.setAttribute('tabindex','-1');
          title.focus({preventScroll:true});
          title.scrollIntoView({behavior:'smooth',block:'start'});
        }
      });
      renderPosts();
      renderTechAndJournal();
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
      document.querySelectorAll('[data-filter-jump]').forEach(link => link.addEventListener('click', () => jumpToChannel(link.dataset.filterJump)));
      $('#photo-filters').addEventListener('click', event => {
        const button = event.target.closest('[data-photo-filter]');
        if (!button) return;
        photoCategory = button.dataset.photoFilter;
        renderGallery();
      });
      $('#gallery-grid').addEventListener('click', event => {
        const photo = event.target.closest('[data-photo-index]');
        if (photo) openPhoto(Number(photo.dataset.photoIndex));
      });
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
