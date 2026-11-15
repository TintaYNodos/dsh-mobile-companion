    var isLandscape = false;
    var isKeyboardOpen = false;

    // Actualizador de reloj
    function updateClock() {
      var d = new Date();
      var h = String(d.getHours()).padStart(2, '0');
      var m = String(d.getMinutes()).padStart(2, '0');
      document.getElementById('clock-display').textContent = h + ':' + m;
    }
    setInterval(updateClock, 1000);
    updateClock();

    function logSim(msg) {
      var el = document.getElementById('sim-logs');
      var d = new Date();
      var ts = '[' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0') + '] ';
      el.textContent += '\n' + ts + msg;
      el.scrollTop = el.scrollHeight;
    }

    // Toggle Orientación Portrait / Landscape
    function toggleOrientation() {
      isLandscape = !isLandscape;
      var chassis = document.getElementById('chassis');
      var badge = document.getElementById('sim-status-badge');
      var btn = document.getElementById('btn-orientation');
      var dockOrient = document.getElementById('dock-orient');
      var dockViewport = document.getElementById('dock-viewport');

      if (isLandscape) {
        chassis.classList.remove('portrait');
        chassis.classList.add('landscape');
        badge.textContent = 'Galaxy S24 Landscape (915x412)';
        btn.classList.add('active');
        btn.querySelector('span').textContent = 'Girar Pantalla (Portrait)';
        dockOrient.textContent = 'Landscape (90°)';
        dockViewport.textContent = '915 × 368 px';
        logSim('Rotación a Landscape (915x412). Inyectando @media (orientation: landscape).');
      } else {
        chassis.classList.remove('landscape');
        chassis.classList.add('portrait');
        badge.textContent = 'Galaxy S24 (412x915)';
        btn.classList.remove('active');
        btn.querySelector('span').textContent = 'Girar Pantalla (Landscape)';
        dockOrient.textContent = 'Portrait (0°)';
        dockViewport.textContent = '412 × 871 px';
        logSim('Rotación a Portrait (412x915).');
      }
    }

    // Toggle Teclado Virtual (IME)
    function toggleKeyboard() {
      isKeyboardOpen = !isKeyboardOpen;
      var kb = document.getElementById('keyboard');
      var btn = document.getElementById('btn-keyboard');
      var dockIme = document.getElementById('dock-ime');
      var dockPill = document.getElementById('dock-pill');

      if (isKeyboardOpen) {
        kb.classList.add('visible');
        btn.classList.add('active');
        dockIme.textContent = 'Visible (240 px)';
        dockPill.textContent = 'Oculto (View.GONE vía IME)';
        logSim('Teclado virtual IME desplegado (altura 240px). Ventana activa ajustada.');
      } else {
        kb.classList.remove('visible');
        btn.classList.remove('active');
        dockIme.textContent = 'Oculto (0 px)';
        dockPill.textContent = 'Visible (Opacidad 0.94)';
        logSim('Teclado virtual cerrado. Ventana restaurada.');
      }
    }

    // Notificaciones Push de Acción
    function triggerNotification() {
      var notif = document.getElementById('notif-banner');
      notif.classList.add('visible');
      logSim('Notificación de acción crítica disparada: [Aprobar] / [Rechazar].');
    }

    function dismissNotification(action) {
      var notif = document.getElementById('notif-banner');
      notif.classList.remove('visible');
      logSim('Notificación resuelta con acción: ' + action);

      fetch('/dsh-companion/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: action, id: 'sim_' + Date.now() })
      }).then(function(r) { return r.json(); }).then(function(data) {
        logSim('Respuesta del puente ante acción: ' + JSON.stringify(data));
      }).catch(function(err) {
        logSim('Error notificando al puente: ' + err.message);
      });
    }

    function reloadWebview() {
      var f = document.getElementById('webview');
      f.src = '/?dshc=on&t=' + Date.now();
      logSim('Recargando iframe del WebView...');
    }

    function toggleDock() {
      var dock = document.getElementById('dock');
      dock.classList.toggle('collapsed');
    }

    // Auto-activación por query params para captura y automatización
    window.addEventListener('DOMContentLoaded', function() {
      var p = new URLSearchParams(window.location.search);
      if (p.get('orient') === 'landscape') toggleOrientation();
      if (p.get('ime') === 'on') toggleKeyboard();
      if (p.get('notif') === 'on') triggerNotification();
      if (p.get('dock') === 'off') toggleDock();
    });
