/* DSH Companion · pantalla sin conexión: listado de sesiones sincronizadas y lector editorial offline. */
  const chatDetailEls = {
    titleEl: document.getElementById('chatDetailTitle'),
    dateEl: document.getElementById('chatDetailDate'),
    countEl: document.getElementById('chatDetailCount'),
    idEl: document.getElementById('chatDetailId'),
    bodyEl: document.getElementById('chatDetailBody'),
  };

  async function loadChatsList() {
    chatListContainer.innerHTML = '<div class="empty-state">Consultando sesiones sincronizadas...</div>';
    let chats = [];
    let isOnlineSource = false;

    try {
      const response = await fetch('/dsh-companion/chats', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        chats = Array.isArray(data.chats) ? data.chats : [];
        localStorage.setItem(STORAGE_KEY_LIST, JSON.stringify(chats));
        isOnlineSource = true;
        // Precarga en segundo plano de las 10 sesiones mas recientes para lectura sin PC
        prefetchChats(chats.slice(0, 10));
      }
    } catch {
      // Sin conexion al puente / PC apagada
    }

    if (!isOnlineSource) {
      try {
        const cached = localStorage.getItem(STORAGE_KEY_LIST);
        if (cached) chats = JSON.parse(cached);
      } catch {}
    }

    sourceBadge.textContent = isOnlineSource ? 'Puente en linea' : 'Copia local (dispositivo)';
    sourceBadge.classList.toggle('online', isOnlineSource);

    renderChatCards(chats);
  }

  function renderChatCards(chats) {
    chatListContainer.innerHTML = '';
    if (!Array.isArray(chats) || chats.length === 0) {
      try {
        const lastChatRaw = localStorage.getItem('dsh_last_synced_chat');
        if (lastChatRaw) {
          const lastChat = JSON.parse(lastChatRaw);
          if (lastChat && lastChat.text) {
            const card = document.createElement('div');
            card.className = 'chat-card';
            card.style.borderLeft = '3px solid var(--accent)';
            card.innerHTML = `<div class="chat-title">${escapeHtml(lastChat.title || 'Ultima conversacion en cache')}</div>
              <div class="chat-meta"><span>Copia local de sesion activa</span><span>${lastChat.updatedAt ? new Date(lastChat.updatedAt).toLocaleTimeString() : ''}</span></div>`;
            card.addEventListener('click', () => {
              openOfflineCachedChat(lastChat);
            });
            chatListContainer.appendChild(card);
            return;
          }
        }
      } catch {}
      chatListContainer.innerHTML = '<div class="empty-state">No hay sesiones sincronizadas disponibles. Cuando el búnker esté activo, las conversaciones sincronizadas desde el móvil aparecerán aquí.</div>';
      return;
    }

    for (const chat of chats) {
      const card = document.createElement('div');
      card.className = 'chat-card';

      const titleEl = document.createElement('div');
      titleEl.className = 'chat-title';
      titleEl.textContent = chat.title || chat.id;

      const metaEl = document.createElement('div');
      metaEl.className = 'chat-meta';

      const dateEl = document.createElement('span');
      dateEl.className = 'mono';
      const parsedDate = chat.savedAt ? new Date(chat.savedAt) : new Date(chat.syncedAt);
      dateEl.textContent = isNaN(parsedDate.getTime()) ? (chat.syncedAt || '') : parsedDate.toLocaleString();

      const countEl = document.createElement('span');
      countEl.className = 'count';
      countEl.textContent = (chat.messageCount || 0) + ' msgs';

      metaEl.appendChild(dateEl);
      metaEl.appendChild(countEl);

      card.appendChild(titleEl);
      card.appendChild(metaEl);

      card.addEventListener('click', () => openChatDetail(chat.id, chat.title));
      chatListContainer.appendChild(card);
    }
  }

  async function prefetchChats(items) {
    for (const item of items) {
      const key = STORAGE_KEY_PREFIX + item.id;
      if (!localStorage.getItem(key)) {
        try {
          const res = await fetch('/dsh-companion/chat/' + encodeURIComponent(item.id), { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            if (data.chat) localStorage.setItem(key, JSON.stringify(data.chat));
          }
        } catch {}
      }
    }
  }

  function openOfflineCachedChat(cachedChat) {
    viewList.style.display = 'none';
    viewDetail.classList.add('active');

    const { titleEl, dateEl, countEl, idEl, bodyEl } = chatDetailEls;

    titleEl.textContent = cachedChat.title || 'Conversacion en cache local';
    dateEl.textContent = cachedChat.updatedAt ? new Date(cachedChat.updatedAt).toLocaleString() : 'Copia local';
    countEl.textContent = 'Modo offline';
    idEl.textContent = 'cache:local';

    bodyEl.innerHTML = '';
    bodyEl.appendChild(renderSafeContent(cachedChat.text || ''));
    updateReadingMetrics();
  }

  async function openChatDetail(id, fallbackTitle) {
    viewList.style.display = 'none';
    viewDetail.classList.add('active');

    const { titleEl, dateEl, countEl, idEl, bodyEl } = chatDetailEls;

    titleEl.textContent = fallbackTitle || id;
    dateEl.textContent = 'Cargando fecha...';
    countEl.textContent = '';
    idEl.textContent = id;
    bodyEl.innerHTML = '<div class="empty-state">Abriendo contenido de la sesión...</div>';

    let chatData = null;
    const cacheKey = STORAGE_KEY_PREFIX + id;

    try {
      const res = await fetch('/dsh-companion/chat/' + encodeURIComponent(id), { cache: 'no-store' });
      if (res.ok) {
        const payload = await res.json();
        chatData = payload.chat;
        localStorage.setItem(cacheKey, JSON.stringify(chatData));
      }
    } catch {}

    if (!chatData) {
      try {
        const local = localStorage.getItem(cacheKey);
        if (local) chatData = JSON.parse(local);
      } catch {}
    }

    if (!chatData) {
      bodyEl.innerHTML = '<div class="empty-state">No se pudo cargar la conversación y no hay copia local guardada en este dispositivo.</div>';
      return;
    }

    titleEl.textContent = chatData.sessionTitle || fallbackTitle || id;
    const parsedDate = chatData.syncedTimestamp ? new Date(chatData.syncedTimestamp) : new Date(chatData.syncedAt);
    dateEl.textContent = isNaN(parsedDate.getTime()) ? (chatData.syncedAt || '') : parsedDate.toLocaleString();
    countEl.textContent = (chatData.messageCount || (chatData.messages ? chatData.messages.length : 0)) + ' mensajes';

    bodyEl.innerHTML = '';
    const messages = Array.isArray(chatData.messages) ? chatData.messages : [];

    if (messages.length === 0 && chatData.markdown) {
      bodyEl.appendChild(renderSafeContent(chatData.markdown));
      updateReadingMetrics();
      return;
    }

    for (const msg of messages) {
      const msgDiv = document.createElement('div');
      const isAssistant = msg.role === 'assistant';
      msgDiv.className = 'editorial-message ' + (isAssistant ? 'assistant' : 'user');

      const roleHeader = document.createElement('div');
      roleHeader.className = 'message-role';

      const dotRole = document.createElement('span');
      dotRole.className = 'role-indicator ' + (isAssistant ? 'assistant' : 'user');

      const labelRole = document.createElement('span');
      labelRole.textContent = isAssistant ? 'Capítulo / Texto Generado' : 'Instrucción / Prompt';

      roleHeader.appendChild(dotRole);
      roleHeader.appendChild(labelRole);

      msgDiv.appendChild(roleHeader);
      msgDiv.appendChild(renderSafeContent(msg.content));
      bodyEl.appendChild(msgDiv);
    }
    updateReadingMetrics();
  }

  const btnToggleReaderMode = document.getElementById('btnToggleReaderMode');
  const btnToggleReaderTheme = document.getElementById('btnToggleReaderTheme');
  const editorialDoc = document.getElementById('editorialDoc');
  const chatDetailWords = document.getElementById('chatDetailWords');
  const chatDetailReadTime = document.getElementById('chatDetailReadTime');
  const chatDetailFormat = document.getElementById('chatDetailFormat');

  let isReaderMode = false;
  let isReaderDark = false;

  function updateReadingMetrics() {
    const { bodyEl } = chatDetailEls;
    if (!bodyEl) return { words: 0, minutes: 0 };
    const text = (bodyEl.innerText || bodyEl.textContent || '').trim();
    const words = text ? (text.match(/[\p{L}\p{N}]+/gu) || []).length : 0;
    const minutes = words > 0 ? Math.max(1, Math.ceil(words / 200)) : 0;

    if (chatDetailWords) {
      chatDetailWords.textContent = words.toLocaleString() + ' palabras';
      chatDetailWords.style.display = words > 0 ? 'inline-block' : 'none';
    }
    if (chatDetailReadTime) {
      chatDetailReadTime.textContent = minutes > 0 ? (minutes + (minutes === 1 ? ' min de lectura' : ' mins de lectura')) : '';
      chatDetailReadTime.style.display = minutes > 0 ? 'inline-block' : 'none';
    }
    if (chatDetailFormat) {
      if (isReaderMode) {
        const themeLabel = isReaderDark ? 'Tinta oscura' : 'Sepia suave';
        chatDetailFormat.textContent = 'Modo lectura (' + themeLabel + ')';
      } else {
        chatDetailFormat.textContent = 'Formato editorial';
      }
    }
    return { words, minutes };
  }

  function applyReaderModeState() {
    if (!editorialDoc) return;
    if (isReaderMode) {
      editorialDoc.classList.add('ereader-mode');
      if (isReaderDark) {
        editorialDoc.classList.add('ereader-dark');
        if (btnToggleReaderTheme) btnToggleReaderTheme.textContent = 'Fondo sepia';
      } else {
        editorialDoc.classList.remove('ereader-dark');
        if (btnToggleReaderTheme) btnToggleReaderTheme.textContent = 'Tinta oscura';
      }
      if (btnToggleReaderMode) {
        btnToggleReaderMode.classList.add('active');
      }
      if (btnToggleReaderTheme) {
        btnToggleReaderTheme.style.display = 'inline-block';
      }
    } else {
      editorialDoc.classList.remove('ereader-mode');
      editorialDoc.classList.remove('ereader-dark');
      if (btnToggleReaderMode) {
        btnToggleReaderMode.classList.remove('active');
      }
      if (btnToggleReaderTheme) {
        btnToggleReaderTheme.style.display = 'none';
      }
    }
    updateReadingMetrics();
  }

  if (btnToggleReaderMode) {
    btnToggleReaderMode.addEventListener('click', () => {
      isReaderMode = !isReaderMode;
      applyReaderModeState();
    });
  }

  if (btnToggleReaderTheme) {
    btnToggleReaderTheme.addEventListener('click', () => {
      isReaderDark = !isReaderDark;
      applyReaderModeState();
    });
  }

  document.getElementById('btnBackToList').addEventListener('click', () => {
    viewDetail.classList.remove('active');
    viewList.style.display = 'block';
  });

  document.getElementById('btnRefreshChats').addEventListener('click', loadChatsList);
