/* DSH Companion · pantalla sin conexión: modo satélite y arranque de la página. */
  function loadSatelliteStorage() {
    try {
      const savedMsgs = localStorage.getItem(STORAGE_KEY_SATELLITE_MSGS);
      if (savedMsgs) {
        satelliteConversation = JSON.parse(savedMsgs);
      }
    } catch {
      satelliteConversation = [];
    }
    try {
      const savedModel = localStorage.getItem(STORAGE_KEY_SATELLITE_MODEL);
      if (savedModel && satelliteModel) {
        satelliteModel.value = savedModel;
      }
    } catch {}
  }

  function saveSatelliteStorage() {
    try {
      localStorage.setItem(STORAGE_KEY_SATELLITE_MSGS, JSON.stringify(satelliteConversation));
      if (satelliteModel) {
        localStorage.setItem(STORAGE_KEY_SATELLITE_MODEL, satelliteModel.value);
      }
    } catch {}
  }

  function renderSatelliteMessages() {
    if (!satelliteMessagesContainer) return;
    satelliteMessagesContainer.innerHTML = '';

    if (!Array.isArray(satelliteConversation) || satelliteConversation.length === 0) {
      if (satelliteEmpty) {
        satelliteEmpty.style.display = 'block';
        satelliteMessagesContainer.appendChild(satelliteEmpty);
      }
      return;
    }

    if (satelliteEmpty) satelliteEmpty.style.display = 'none';

    for (const msg of satelliteConversation) {
      const msgDiv = document.createElement('div');
      msgDiv.className = 'satellite-msg ' + (msg.role === 'assistant' ? 'assistant' : 'user');

      const roleSpan = document.createElement('span');
      roleSpan.className = 'satellite-msg-role';
      roleSpan.textContent = msg.role === 'assistant' ? 'DeepSeek Satélite' : 'Usuario';
      msgDiv.appendChild(roleSpan);

      const bodyDiv = document.createElement('div');
      bodyDiv.className = 'satellite-msg-body';
      bodyDiv.appendChild(renderSafeContent(msg.content));
      msgDiv.appendChild(bodyDiv);

      satelliteMessagesContainer.appendChild(msgDiv);
    }

    satelliteMessagesContainer.scrollTop = satelliteMessagesContainer.scrollHeight;
  }

  function updateLastAssistantMsg(text) {
    if (!satelliteMessagesContainer) return;
    const items = satelliteMessagesContainer.querySelectorAll('.satellite-msg.assistant');
    if (items.length > 0) {
      const lastItem = items[items.length - 1];
      const bodyDiv = lastItem.querySelector('.satellite-msg-body');
      if (bodyDiv) {
        bodyDiv.innerHTML = '';
        bodyDiv.appendChild(renderSafeContent(text));
      }
      satelliteMessagesContainer.scrollTop = satelliteMessagesContainer.scrollHeight;
    }
  }

  function setSatelliteStreaming(streaming) {
    isSatelliteStreaming = streaming;
    if (streaming) {
      if (btnSatelliteSend) btnSatelliteSend.disabled = true;
      if (btnSatelliteCancel) btnSatelliteCancel.style.display = 'inline-block';
      if (satelliteStatus) satelliteStatus.textContent = 'Consultando satélite...';
    } else {
      if (btnSatelliteSend) btnSatelliteSend.disabled = false;
      if (btnSatelliteCancel) btnSatelliteCancel.style.display = 'none';
      if (satelliteStatus) satelliteStatus.textContent = 'Listo';
    }
  }

  function appendAssistantChunk(chunk) {
    if (!chunk) return;
    const lastMsg = satelliteConversation[satelliteConversation.length - 1];
    if (lastMsg && lastMsg.role === 'assistant') {
      lastMsg.content += chunk;
      updateLastAssistantMsg(lastMsg.content);
    }
  }

  function finishAssistantResponse(fullText) {
    const lastMsg = satelliteConversation[satelliteConversation.length - 1];
    if (lastMsg && lastMsg.role === 'assistant') {
      if (typeof fullText === 'string' && fullText.length > 0 && !lastMsg.content) {
        lastMsg.content = fullText;
        updateLastAssistantMsg(lastMsg.content);
      }
    }
    saveSatelliteStorage();
    setSatelliteStreaming(false);
  }

  function handleAssistantError(errorMsg) {
    const lastMsg = satelliteConversation[satelliteConversation.length - 1];
    const errText = '[Error satélite: ' + (errorMsg || 'desconocido') + ']';
    if (lastMsg && lastMsg.role === 'assistant') {
      lastMsg.content = lastMsg.content ? (lastMsg.content + '\n\n' + errText) : errText;
      updateLastAssistantMsg(lastMsg.content);
    } else {
      satelliteConversation.push({ role: 'assistant', content: errText, timestamp: Date.now() });
      renderSatelliteMessages();
    }
    saveSatelliteStorage();
    setSatelliteStreaming(false);
    if (satelliteStatus) satelliteStatus.textContent = 'Error satélite';
  }

  window.__DSH_SATELLITE_CHUNK__ = window.onSatelliteChunk = appendAssistantChunk;
  window.__DSH_SATELLITE_COMPLETE__ = window.onSatelliteComplete = finishAssistantResponse;
  window.__DSH_SATELLITE_ERROR__ = window.onSatelliteError = handleAssistantError;

  function sendSatelliteMessage() {
    if (isSatelliteStreaming) return;
    const text = satelliteInput ? satelliteInput.value.trim() : '';
    if (!text) return;

    satelliteConversation.push({ role: 'user', content: text, timestamp: Date.now() });
    satelliteConversation.push({ role: 'assistant', content: '', timestamp: Date.now() });
    if (satelliteInput) satelliteInput.value = '';
    renderSatelliteMessages();
    setSatelliteStreaming(true);

    const modelName = satelliteModel ? satelliteModel.value : 'deepseek-chat';
    saveSatelliteStorage();

    const payload = {
      model: modelName,
      stream: true,
      messages: satelliteConversation
        .filter(m => m.content || m.role === 'user')
        .map(m => ({ role: m.role, content: m.content }))
    };

    if (window.AndroidCompanion && typeof window.AndroidCompanion.startSatelliteQuery === 'function') {
      window.AndroidCompanion.startSatelliteQuery(JSON.stringify(payload));
    } else {
      setTimeout(() => {
        handleAssistantError('Modo Satélite requiere la aplicación Android DSH Companion para conexión directa a DeepSeek.');
      }, 300);
    }
  }

  function cancelSatellite() {
    if (window.AndroidCompanion && typeof window.AndroidCompanion.cancelSatelliteQuery === 'function') {
      window.AndroidCompanion.cancelSatelliteQuery();
    }
    finishAssistantResponse();
    if (satelliteStatus) satelliteStatus.textContent = 'Consulta cancelada';
  }

  function newSatelliteNote() {
    if (isSatelliteStreaming) cancelSatellite();
    satelliteConversation = [];
    saveSatelliteStorage();
    renderSatelliteMessages();
    if (satelliteStatus) satelliteStatus.textContent = 'Nueva nota iniciada';
  }

  async function absorbSatelliteNote() {
    if (satelliteConversation.length === 0) {
      if (satelliteStatus) satelliteStatus.textContent = 'Sin notas para absorber';
      return;
    }
    const firstUser = satelliteConversation.find(m => m.role === 'user');
    const title = firstUser ? firstUser.content.slice(0, 40) : 'Nota satélite';
    const satelliteId = 'sat_' + Date.now();
    const summary = 'Nota satélite (' + satelliteConversation.length + ' mensajes)';
    if (satelliteStatus) satelliteStatus.textContent = 'Absorbiendo en PC...';

    try {
      const res = await fetch('/dsh-companion/absorb-satellite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          satelliteId,
          title,
          messages: satelliteConversation,
          summary
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (satelliteStatus) satelliteStatus.textContent = 'Absorbido en PC: ' + (data.absorbedId || 'ok');
      } else {
        if (satelliteStatus) satelliteStatus.textContent = 'Error al absorber (HTTP ' + res.status + ')';
      }
    } catch {
      if (satelliteStatus) satelliteStatus.textContent = 'PC inaccesible: reintenta al reconectar';
    }
  }

  if (btnSatelliteSend) btnSatelliteSend.addEventListener('click', sendSatelliteMessage);
  if (btnSatelliteCancel) btnSatelliteCancel.addEventListener('click', cancelSatellite);
  if (btnSatelliteNew) btnSatelliteNew.addEventListener('click', newSatelliteNote);
  if (btnSatelliteAbsorb) btnSatelliteAbsorb.addEventListener('click', absorbSatelliteNote);
  if (satelliteModel) {
    satelliteModel.addEventListener('change', () => {
      saveSatelliteStorage();
    });
  }
  if (satelliteInput) {
    satelliteInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendSatelliteMessage();
      }
    });
  }

  if (location.hash === '#reader') {
    setTab('reader');
  } else if (location.hash === '#satellite') {
    setTab('satellite');
  } else {
    refresh();
  }
  setInterval(refresh, 4000);
