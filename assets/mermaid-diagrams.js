/* Lazy Mermaid rendering for Markdown fences on a dynamically routed blog.
 * Standard code blocks remain untouched if the diagram engine is unavailable.
 */
(() => {
  'use strict';
  const article = document.getElementById('post-view');
  if (!article) return;

  const providers = [
    'assets/mermaid.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.3/mermaid.min.js',
    'https://cdn.jsdelivr.net/npm/mermaid@10.9.3/dist/mermaid.min.js',
    'https://unpkg.com/mermaid@10.9.3/dist/mermaid.min.js'
  ];
  let mermaidReady;
  let renderId = 0;
  let lightbox;

  function loadProvider(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.async = true;
      script.src = url;
      script.onload = () => window.mermaid ? resolve(window.mermaid) : reject(new Error('Mermaid export missing'));
      script.onerror = () => { script.remove(); reject(new Error('Mermaid CDN unavailable')); };
      document.head.appendChild(script);
    });
  }

  async function loadMermaid() {
    if (!mermaidReady) {
      mermaidReady = (async () => {
        let lastError;
        for (const url of providers) {
          try {
            const mermaid = await loadProvider(url);
            mermaid.initialize({
              startOnLoad: false,
              securityLevel: 'strict',
              theme: 'base',
              themeVariables: {
                fontFamily: '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif',
                fontSize: '15px',
                primaryColor: '#f5e6d8',
                primaryTextColor: '#49392f',
                primaryBorderColor: '#bf7954',
                lineColor: '#9c9f98',
                secondaryColor: '#e9edf0',
                tertiaryColor: '#f1eee9',
                background: '#fffdfa',
                mainBkg: '#fffdfa',
                clusterBkg: '#fbf9f5',
                clusterBorder: '#d7cec3',
                edgeLabelBackground: '#fffdfa'
              },
              flowchart: {
                htmlLabels: true,
                curve: 'basis',
                nodeSpacing: 26,
                rankSpacing: 43,
                useMaxWidth: true,
                padding: 12
              }
            });
            return mermaid;
          } catch (error) {
            lastError = error;
          }
        }
        throw lastError || new Error('Mermaid could not be loaded');
      })();
    }
    return mermaidReady;
  }

  function diagramLightbox() {
    if (lightbox) return lightbox;
    lightbox = document.createElement('dialog');
    lightbox.className = 'mermaid-lightbox';
    const content = document.createElement('div');
    content.className = 'mermaid-lightbox-content';
    const header = document.createElement('div');
    header.className = 'mermaid-lightbox-header';
    const label = document.createElement('span');
    label.textContent = '架构与流程 · 大图查看';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '关闭 ×';
    close.addEventListener('click', () => lightbox.close());
    header.append(label, close);
    const canvas = document.createElement('div');
    canvas.className = 'mermaid-lightbox-canvas';
    content.append(header, canvas);
    lightbox.append(content);
    lightbox.addEventListener('click', e => { if (e.target === lightbox) lightbox.close(); });
    document.body.appendChild(lightbox);
    return lightbox;
  }

  function displayWarning(pre, message) {
    if (!pre.isConnected || pre.dataset.diagramError) return;
    pre.dataset.diagramError = 'true';
    pre.classList.add('mermaid-source-fallback');
    const note = document.createElement('p');
    note.className = 'mermaid-render-note';
    note.textContent = message;
    pre.insertAdjacentElement('beforebegin', note);
  }

  async function renderDiagrams() {
    const blocks = [...article.querySelectorAll('pre > code.language-mermaid')];
    if (!blocks.length) return;
    for (const code of blocks) {
      const pre = code.parentElement;
      if (!pre?.isConnected || pre.dataset.diagramRendering || pre.dataset.diagramError) continue;
      pre.dataset.diagramRendering = 'true';
      const source = code.textContent.trim();
      try {
        const engine = await loadMermaid();
        if (!pre.isConnected) continue;
        const { svg, bindFunctions } = await engine.render('feather-mermaid-' + (++renderId), source);
        if (!pre.isConnected) continue;
        const figure = document.createElement('figure');
        figure.className = 'mermaid-figure';
        const toolbar = document.createElement('div');
        toolbar.className = 'mermaid-figure-toolbar';
        const indicator = document.createElement('span');
        indicator.textContent = 'DIAGRAM / 架构与流程';
        const expand = document.createElement('button');
        expand.type = 'button';
        expand.textContent = '放大查看 ↗';
        toolbar.append(indicator, expand);
        const viewport = document.createElement('div');
        viewport.className = 'mermaid-viewport';
        viewport.innerHTML = svg;
        figure.append(toolbar, viewport);
        pre.replaceWith(figure);
        if (typeof bindFunctions === 'function') bindFunctions(viewport);
        expand.addEventListener('click', () => {
          const modal = diagramLightbox();
          const canvas = modal.querySelector('.mermaid-lightbox-canvas');
          canvas.innerHTML = svg;
          modal.showModal();
        });
      } catch (error) {
        console.error('Mermaid diagram rendering failed:', error);
        displayWarning(pre, '图示暂时无法渲染，以下为原始 Mermaid 图定义。');
      } finally {
        delete pre.dataset.diagramRendering;
      }
    }
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; void renderDiagrams(); });
  }
  new MutationObserver(schedule).observe(article, { childList: true, subtree: true });
  schedule();
})();
