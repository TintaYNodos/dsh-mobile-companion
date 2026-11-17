/* DSH Companion · pantalla sin conexión: estado del puente, pestañas y utilidades compartidas. */
  const dot = document.getElementById('dot');
  const badgeText = document.getElementById('badgeText');
  const detail = document.getElementById('detail');
  const appShell = document.getElementById('appShell');
  const tabStatus = document.getElementById('tabStatus');
  const tabReader = document.getElementById('tabReader');
  const sectionStatus = document.getElementById('sectionStatus');
  const sectionReader = document.getElementById('sectionReader');
  const viewList = document.getElementById('viewList');
  const viewDetail = document.getElementById('viewDetail');
  const chatListContainer = document.getElementById('chatListContainer');
  const sourceBadge = document.getElementById('sourceBadge');

  const STORAGE_KEY_LIST = 'dsh_synced_chats_cache';
  const STORAGE_KEY_PREFIX = 'dsh_chat_cache_';

  let currentTab = 'status';

  function escapeHtml(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderInlineMarkdown(text) {
    let escaped = escapeHtml(text);
    // Negrita
    escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Cursiva
    escaped = escaped.replace(/\*([^\*]+?)\*/g, '<em>$1</em>');
    // Codigo en linea
    escaped = escaped.replace(/`([^`]+?)`/g, '<code>$1</code>');
    return escaped;
  }

  function renderSafeContent(rawContent) {
    const lines = String(rawContent ?? '').split('\n');
    const container = document.createElement('div');
    container.className = 'editorial-text';

    let currentParagraph = [];
    let inCodeBlock = false;
    let codeBlockLines = [];

    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        const p = document.createElement('p');
        p.innerHTML = renderInlineMarkdown(currentParagraph.join(' '));
        container.appendChild(p);
        currentParagraph = [];
      }
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (line.startsWith('```')) {
        if (inCodeBlock) {
          const pre = document.createElement('pre');
          const code = document.createElement('code');
          code.textContent = codeBlockLines.join('\n');
          pre.appendChild(code);
          container.appendChild(pre);
          codeBlockLines = [];
          inCodeBlock = false;
        } else {
          flushParagraph();
          inCodeBlock = true;
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockLines.push(rawLine);
        continue;
      }

      if (!line) {
        flushParagraph();
        continue;
      }

      if (line.startsWith('### ')) {
        flushParagraph();
        const h3 = document.createElement('h3');
        h3.textContent = line.slice(4);
        container.appendChild(h3);
      } else if (line.startsWith('## ')) {
        flushParagraph();
        const h2 = document.createElement('h2');
        h2.textContent = line.slice(3);
        container.appendChild(h2);
      } else if (line.startsWith('# ')) {
        flushParagraph();
        const h1 = document.createElement('h1');
        h1.textContent = line.slice(2);
        container.appendChild(h1);
      } else if (line.startsWith('> ')) {
        flushParagraph();
        const bq = document.createElement('blockquote');
        bq.innerHTML = renderInlineMarkdown(line.slice(2));
        container.appendChild(bq);
      } else {
        currentParagraph.push(line);
      }
    }

    if (inCodeBlock && codeBlockLines.length > 0) {
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = codeBlockLines.join('\n');
      pre.appendChild(code);
      container.appendChild(pre);
    }
    flushParagraph();

    return container;
  }

  function setTab(tab) {
    currentTab = tab;
    tabStatus.classList.remove('active');
    tabReader.classList.remove('active');

    sectionStatus.style.display = 'none';
    sectionReader.classList.remove('active');
    sectionReader.style.display = 'none';

    if (tab === 'reader') {
      tabReader.classList.add('active');
      sectionReader.classList.add('active');
      sectionReader.style.display = 'block';
      appShell.classList.add('wide');
      loadChatsList();
    } else {
      tabStatus.classList.add('active');
      sectionStatus.style.display = 'block';
      appShell.classList.remove('wide');
    }
  }

  tabStatus.addEventListener('click', () => setTab('status'));
  tabReader.addEventListener('click', () => setTab('reader'));
  document.getElementById('btnGoReader').addEventListener('click', () => setTab('reader'));

  async function refresh() {
    try {
      const response = await fetch('/dsh-companion/status', { cache: 'no-store' });
      const payload = await response.json();
      document.getElementById('version').textContent = 'v' + payload.version;
      if (payload.dshOnline) {
        dot.classList.add('ok');
        badgeText.textContent = 'Bunker en linea';
        detail.textContent = 'Todo listo. Abriendo la interfaz de DeepSeek Harness...';
        if (currentTab === 'status') {
          setTimeout(() => location.replace('/'), 600);
          return;
        }
      }
      dot.classList.remove('ok');
      badgeText.textContent = 'Bunker sin respuesta';
      detail.textContent = 'El puente responde en ' + location.host + ' pero Harness no escucha en el puerto ' + payload.targetPort + '.';
    } catch (error) {
      dot.classList.remove('ok');
      badgeText.textContent = 'Puente inaccesible';
      detail.textContent = 'No se pudo contactar al puente movil. Revisa la conexion de red privada.';
    }
  }

  document.getElementById('retry').addEventListener('click', () => location.replace('/'));
  document.getElementById('status').addEventListener('click', refresh);

  if (location.hash === '#reader') {
    setTab('reader');
  } else {
    refresh();
  }
  setInterval(refresh, 4000);
