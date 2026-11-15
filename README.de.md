# DSH Mobile Companion

![version](https://img.shields.io/badge/version-5.1.5-1f6feb?style=flat-square) ![license](https://img.shields.io/badge/license-BUSL--1.1-8b5cf6?style=flat-square) ![android](https://img.shields.io/badge/Android-8.0%2B-3ddc84?style=flat-square&logo=android&logoColor=white) ![node](https://img.shields.io/badge/Node-22.15%2B-339933?style=flat-square&logo=node.js&logoColor=white) ![ci](https://github.com/TintaYNodos/dsh-mobile-companion/actions/workflows/verify.yml/badge.svg?branch=main) ![tests](https://img.shields.io/badge/tests-154%20passing-2ea043?style=flat-square) ![size](https://img.shields.io/badge/APK-210%20KB-0ea5e9?style=flat-square)

> 🌐 **Idiomas / Languages:** [English](README.md) · [Español (México)](README.es.md) · [简体中文](README.zh.md) · [日本語](README.ja.md) · [Português (Brasil)](README.pt.md) · [Français](README.fr.md) · **[Deutsch](README.de.md)**

> 🌐 **Sprachhinweis:** Dieses Dokument wurde übersetzt, um DSH Mobile Companion für internationale Entwickler zugänglich zu machen. Korrekturen der Gemeinschaft an Sprache und Formulierungen sowie Pull Requests sind herzlich willkommen. Das kanonische Referenzdokument ist auf [Español (México)](README.es.md).

Mobiler Zugriff auf DeepSeek Harness über ein privates ZeroTier- oder Tailscale-Netzwerk, ohne Ports zu öffnen und ohne das Prompt-Caching zu beeinträchtigen.

Die mobile App implementiert die Oberfläche nicht neu: Sie rendert die eigene Web-GUI von DeepSeek Harness und fügt eine Touch-Schicht hinzu. Was Sie auf Ihrem Telefon sehen, ist dasselbe Produkt, das auf Ihrem Computer läuft.

Gehärtete Edition von Ismael Muñoz Reyes für Tinta y Nodos.

Aktuelle Version: **5.1.5** (`versionCode` 45).

---

## Was es löst

DeepSeek Harness lauscht auf `127.0.0.1` und schützt seine Sitzungen mit einem aus `.credentials.yaml` abgeleiteten HMAC-Cookie. Deshalb genügt es nicht, einen Port zu öffnen oder einen generischen Tunnel zu verwenden: Ohne dieses Cookie antwortet die Oberfläche mit 401, und ein unbedachtes Umschreiben der Origins der Anfragen zerstört das stabile Präfix, das für das Prompt-Caching erforderlich ist.

Dieses Projekt löst alle drei Probleme gleichzeitig:

- **Transparentes Signieren der Sitzung.** Die Bridge liest das lokale Geheimnis, erzeugt das HMAC-SHA256-Cookie (Version 1) und erneuert es vor Ablauf. Der mobile Browser sieht das Geheimnis nie.
- **Touch-Schicht auf dem echten Produkt.** Viewport-Metadaten, ein Stylesheet und ein kleines Client-Skript werden injiziert. Die Oberfläche wird nicht ersetzt: Das Skript ergänzt lediglich Touch-Elemente (Befehls-Dock, Code-Tasten, Theme-Synchronisierung, Freigabe-Relais, Benachrichtigungs-Relais). Es läuft mit derselben Origin und denselben Rechten wie die Seite, behandeln Sie es also als Teil der Vertrauensgrenze.
- **Netzwerkisolation.** Der Socket bindet ausschließlich an die VPN-Schnittstelle und akzeptiert nur Clients, die aus demselben privaten Netzwerk stammen.

---

## Architektur

```text
Telefon (ZeroTier-/Tailscale-Netzwerk)
        |
        v
bridge.mjs  —exklusives Binden an die VPN-IP—
   |-- /                        Proxy zu DeepSeek Harness + Touch-Schicht
   |-- /offline                 Bereitschaftsseite und Offline-Leser für redaktionelle Inhalte
   |-- /dsh-companion/status    Link-Erkennung und Zustandsprüfung
   |-- /dsh-companion/sync      Konversations-Dump auf die Festplatte
   |-- /dsh-companion/chats     Index der synchronisierten Konversationen
   |-- /dsh-companion/pc-events Server-Sent Events: „ein Turn ist gerade zu Ende gegangen“
   |-- /dsh-companion/pair-*    Geräte-Pairing und Freigabe
        |
        v
127.0.0.1:<Harness-Port>  DeepSeek Harness
```

Module:

```text
companion/
├── bridge.mjs                 Start, Routing, Socket- und Zugriffsrichtlinien
├── package.json               einzige Quelle der Version, `npm start` / `npm test`
├── offline.html               Hülle des Bereitschaftsbildschirms
├── offline.css                Basislayout, Themes und Tabs
├── offline-reader.css         redaktioneller Leser und Konversationsdetail
├── offline-satellite.css      Satellitenbereich
├── offline-core.js            gemeinsamer Zustand, Verbindungsstatus, Navigation
├── offline-reader.js          Offline-Leser, Liste, Detail, Lesemodi
├── offline-satellite.js       Satelliten-Übergabe (Senden, Chunks, Abschluss)
├── src/
│   ├── config.mjs             zentrale Konfiguration und Limits
│   ├── log.mjs                Logger mit Zeitstempeln
│   ├── network.mjs            VPN-Erkennung, Autorisierung, Harness-Port
│   ├── crypto.mjs             Geheimnis, HMAC-v1-Cookie, Zugriffsschlüssel, Rotation
│   ├── http.mjs               Header-Bereinigung, begrenzter Body, vertrauenswürdige Origin
│   ├── routes.mjs             Routen-Dispatch (Status, Daten, Steuerung)
│   ├── routes-pairing.mjs     Pairing, Freigabe, Panel-Übergabe
│   ├── panel.mjs              lokales Freigabe-Panel (nur Loopback)
│   ├── pairing.mjs            ausstehende Anfragen und Codes
│   ├── pairing-views.mjs      HTML des Panels
│   ├── devices.mjs            Geräteregister, TTL, Widerruf
│   ├── registry.mjs           atomares, absturzsicheres JSON-Register
│   ├── proxy.mjs              HTTP-Proxy
│   ├── proxy-ws.mjs           WebSocket-Tunnel
│   ├── mobile.mjs             Injektionseinstieg (Viewport + Client-Skript)
│   ├── mobile-client*.mjs     injizierter Client, nach Verantwortlichkeit aufgeteilt
│   ├── mobile-styles.mjs      injiziertes Stylesheet
│   ├── pc-events.mjs          Watcher für Sitzungs-Turns -> SSE-Benachrichtigungen
│   ├── sync.mjs               atomare Persistenz der Konversationen
│   ├── static.mjs             lokale Assets mit ETag
│   ├── system-stats.mjs       Telemetrie für CPU, Speicher und Temperatur
│   ├── qr.mjs / visual-lab.mjs Helfer für die QR- und Visual-Harnesses
│   └── ratelimit.mjs          Token-Bucket pro Client
│   ├── device-claim, panel-session, routes-data, sync-format, sync-index, sync-retention
├── tools/
├── audit-repo.mjs   Prüfung des Repositorys (Text, Syntax, Versionen, Geheimnisse)
├── build-apk.ps1   baut und signiert das APK ohne Gradle
├── doctor.ps1                  Installationsdiagnose (Node, Tunnel, Bridge, Panel)
├── RELEASING.md   Checkliste für Veröffentlichungen
├── .github/workflows/verify.yml   CI: Syntax + Prüfung bei jedem Push
├── SECURITY.md   wie man eine Schwachstelle meldet
└── CHANGELOG.md   Versionshistorie
├── android_src/               nativer Client (reines Java, kein AndroidX)
│   ├── MainActivity.java      Lebenszyklus und Orchestrierung
│   ├── CompanionWebViewClient.java, CompanionChromeClient.java
│   ├── CleartextPolicy.java   blockiert Cleartext zu nicht-privaten Hosts
│   ├── PcRegistryStore.java, PcEntry.java   Multi-PC-Register
│   ├── SettingsScreen.java, HubSheet.java, PcDialogs.java, QrDialogs.java
│   ├── UpdateInstaller.java, KillSwitchUi.java, BiometricGate.java
│   ├── PcEventsService.java   Vordergrunddienst für PC-Benachrichtigungen
│   ├── NotificationHelper.java, NotificationChannels.java, NotificationsPc.java
│   ├── KeyStoreVault.java    Android-Keystore-Verschlüsselung für gespeicherte Schlüssel
│   └── …                     Erkennung, Telemetrie, Satellit, WOL, Widget
├── test/
│   ├── verify_*.mjs           elf Verifikations-Suites (154 Prüfungen)
│   ├── _harness.mjs           gemeinsamer Client
│   └── run-all.mjs            `npm test`
└── synced_chats/              persistierte Konversationen (.md und .json)
```

---

## Installation

### Methode 1: automatisierte Einrichtung mit Ihrem KI-Assistenten (empfohlen)

Wenn Sie einen KI-Agenten oder Programmierassistenten auf Ihrem Rechner verwenden (DeepSeek Harness, Cursor, Claude Code, Copilot usw.), fügen Sie den folgenden Prompt in Ihren Chat ein. Der Assistent klont das Repository, konfiguriert den Hintergrundstart, überprüft die Bridge und übergibt Ihnen die Schritte zur mobilen Verbindung.

> Vollständige Anleitung: [AI_SETUP_PROMPT.md](AI_SETUP_PROMPT.md)

```text
Du bist ein Einrichtungsassistent. Führe zuerst die Diagnose aus und gib die Ausgabe weiter:

    powershell -ExecutionPolicy Bypass -File doctor.ps1

Meldet sie KEINEN TUNNEL (keine ZeroTier/Tailscale-Schnittstelle mit privater IP), HALTE AN: ohne privates Netz erreicht das Telefon diesen Rechner nicht. Erkläre, wie man ZeroTier (https://my.zerotier.com + Client auf PC und Telefon, privates Netz, beide Knoten autorisieren) oder Tailscale (gleiches Konto auf beiden) einrichtet, und starte doctor.ps1 erneut.
Ist Node älter als 22.15, installiere Node 22 LTS. Fehlen Harness-Zugangsdaten, öffne DeepSeek Harness und melde dich an. Läuft die Bridge nicht, führe install-autostart.bat aus.
Dann: Bridge starten (install-autostart.bat registriert den Autostart UND startet sie; run-hidden.vbs nicht erneut ausführen), Telefon mit panel.bat koppeln (das Panel zeigt denselben 4-stelligen Code) und Benachrichtigungen testen (Einstellungen -> PC-Benachrichtigungen -> Vom PC testen).
Zum Schluss doctor.ps1 erneut ausführen und berichten: Tunnelschnittstelle und IP, Telefon-URL, Bridge-Version, Panel, Kopplungsstatus und Testergebnis. Ohne diese Belege nichts als funktionierend melden. Die Bridge nie ins Internet stellen, den Zugangsschlüssel nie ausgeben und den Kill-Switch nicht ohne Aufforderung ausführen.
```

### Methode 2: manuelle Installation

#### Computer

```bash
git clone https://github.com/TintaYNodos/dsh-mobile-companion.git
```

Node.js 22.15 oder neuer, keine npm-Abhängigkeiten.

1. Legen Sie einen Zugriffsschlüssel fest (dringend empfohlen; siehe unten).
2. Installieren Sie den automatischen Start mit `install-autostart.bat` (stiller Task bei der Windows-Anmeldung).
3. Die Bridge erkennt die ZeroTier- oder Tailscale-Schnittstelle und bindet daran. Wenn die Erkennung fehlschlägt, setzen Sie `DSH_BIND_HOST` auf Ihre private IP.

#### Telefon

Zwei gleichwertige Methoden:

- **Native Anwendung:** Installieren Sie `DSH-Companion.apk` aus dem Bereich *Releases*. Multi-PC-Auswahl, automatische Wiederverbindung, Vordergrund-Benachrichtigungsdienst, biometrische Sperre. Rund 210 KB ohne jegliche Drittanbieter-Abhängigkeiten: reines, reproduzierbares Java, ein Asset-Icon und das Theme.
- **Ohne Installation:** Öffnen Sie `http://<VPN_IP>:57420` in Ihrem Browser und wählen Sie „Zum Startbildschirm hinzufügen“.

`/m` antwortet mit einer permanenten Weiterleitung auf `/`: Der alte Satellitenmodus wurde zugunsten der echten Oberfläche eingestellt.

---

Zum Beenden oder Entfernen aus dem Autostart: `stop.bat`, `uninstall-autostart.bat` (Windows); `uninstall-launchd.sh`, `uninstall-systemd.sh` (macOS/Linux).

## Umgebungsvariablen

| Variable | Standard | Wirkung |
| --- | --- | --- |
| `DSH_BIND_HOST` | automatisch erkannt | Erzwingt die private Bind-IP |
| `DSH_TARGET_PORT` | automatisch erkannt | Port von DeepSeek Harness |
| `DSH_LISTEN_PORT` | `57420` | Listen-Port der Bridge |
| `DSH_PANEL_PORT` | `57421` | Port des lokalen Freigabe-Panels |
| `DSH_HOME` | `%USERPROFILE%\.dsh` | Verzeichnis für Anmeldedaten, Schlüssel und Register |
| `DSH_BROWSER_SECRET` | — | Direkt angegebenes Geheimnis, überspringt das Lesen der YAML |
| `DSH_ACCESS_KEY` | automatisch generiert | Gemeinsamer Schlüssel; überschreibt den dateibasierten Schlüssel |
| `DSH_ACCESS_DISABLE` | — | `1` deaktiviert den Zugriffsschlüssel, **nur erlaubt, wenn an Loopback gebunden** |
| `DSH_COMPANION_TOKEN` | leer | Zusätzliches Token für `/dsh-companion/sync` |
| `DSH_ALLOW_CIDR` | leer | Zusätzlich autorisierte Subnetze, durch Kommas getrennt |
| `DSH_DEVICE_TTL_DAYS` | `30` | Lebensdauer der Gerätesitzung; abgelaufene Geräte werden abgelehnt und entfernt |
| `DSH_DEVICE_REFRESH_HOURS` | `24` | Wie oft die Lebensdauer bei Nutzung erneuert wird |
| `DSH_PENDING_TTL_MIN` | `15` | Minuten, die eine Pairing-Anfrage auf Freigabe wartet |
| `DSH_ALLOWED_HOSTS` | leer | Zusätzliche Hostnamen für `Host`/`Origin` (Tailscale MagicDNS) |
| `DSH_ALLOW_GENERIC_VPN` | — | `1` akzeptiert ein generisches tun/tap-Interface |
| `DSH_SYNC_MAX_FILES` | `200` | Maximale Anzahl gespeicherter Unterhaltungen |
| `DSH_SYNC_MAX_TOTAL_MB` | `200` | Maximale Größe von `synced_chats/` in MB |
| `DSH_LOG_MAX_MB` | `5` | Maximale Größe von `bridge.log` in MB vor der Rotation (Minimum 1) |
| `DSH_LOG_KEEP` | `3` | Aufbewahrte `bridge.log.N`-Dateien (1–10) |

### Einmalige Freigabe vom Computer

1. Öffnen Sie die App auf Ihrem Telefon: Sie zeigt „Auf Ihrem Computer bestätigen“ an.
2. Führen Sie auf Ihrem PC `panel.bat` aus (oder öffnen Sie die URL, die die Bridge ausgibt). Das Panel lauscht **ausschließlich auf 127.0.0.1**.
3. Das Gerät erscheint mit seinem Code und seiner Adresse. Drücken Sie **Autorisieren**.
4. Das Telefon verbindet sich und fragt nicht erneut.

Die Gerätesitzung dauert **30 Tage und wird bei Nutzung erneuert**: Jedes Mal, wenn die App nach 24 Stunden geöffnet wird, wird der Zähler zurückgesetzt. Abgelaufene Geräte werden nicht mehr akzeptiert und aus dem Register entfernt.

Der Zugang zum Panel ist ein **Einmal-Ticket**, das abläuft und beim Einlösen ungültig wird; im Gegenzug erhält der Browser ein `HttpOnly`-Sitzungscookie mit `SameSite=Strict`, dessen Kennung nur im Speicher existiert. Kein Token reist in einer URL, die Sie teilen können, und nichts wird in eine Datei mit dem dauerhaften Anmeldedatum geschrieben.

Autorisierte Geräte liegen in `%USERPROFILE%\.dsh\companion-devices.json`. Das Panel bietet individuellen Widerruf und **Alle widerrufen**. In der Telefon-App widerruft der **Kill-Switch** jedes Gerät, schließt die WebSocket-Tunnel **und rotiert den Zugriffsschlüssel**. Details in [DISPOSITIVOS.md](DISPOSITIVOS.md).

Der manuelle Zugriffsschlüssel bleibt als Rückfalllösung für den Zugriff mit einem Standardbrowser verfügbar und wird unter `%USERPROFILE%\.dsh\companion-access-key` gespeichert. Die native App hält ihn mit dem Android Keystore verschlüsselt.

**Praktische Einschränkung:** HTTP Basic überträgt den Schlüssel in Base64 ohne eigene Verschlüsselung auf der Transportschicht. Das ist nur akzeptabel, weil ZeroTier und Tailscale den gesamten Transport Ende-zu-Ende verschlüsseln. In einem geteilten oder öffentlichen ZeroTier-Netzwerk könnte ein gegnerischer Peer eine Abfangattacke auf Schicht 2 versuchen; halten Sie das Netzwerk strikt privat, indem Sie Knoten manuell autorisieren.

---

## Routen

- `GET /` — Web-GUI von DeepSeek Harness, mit angewendeter Touch-Schicht, wenn der Client ein Telefon ist.
- `GET /offline` — Bereitschaftsseite, während Harness startet, plus der Offline-Leser für redaktionelle Inhalte.
- `GET /dsh-companion/status` — `{ service, version, status, dshOnline, targetPort, time }`. Anonyme Aufrufer erhalten diese minimale Form; Geräteliste und Telemetrie erfordern Autorisierung.
- `POST /dsh-companion/sync` — speichert eine Konversation in `synced_chats/` als Markdown und JSON.
- `GET /dsh-companion/chats` — Index der synchronisierten Konversationen.
- `GET /dsh-companion/chat/:id` — Inhalt der Konversation (JSON oder Markdown mit `?format=md`).
- `GET /dsh-companion/pc-events` — Server-Sent-Events-Stream, der `response-finished` ausgibt, wenn ein Turn auf dem Computer endet.
- `POST /dsh-companion/pc-events/test` — gibt ein synthetisches Ereignis aus; wird von der Schaltfläche „Vom PC testen“ verwendet.
- `GET /dsh-companion/pair-state` — Polling-Endpunkt, den der Wartebildschirm verwendet.
- `GET /dsh-companion/pair-events` — Freigabe-Stream für den Wartebildschirm.
- `POST /dsh-companion/open-panel` — öffnet das lokale Panel-Fenster (nur Loopback).
- `POST /dsh-companion/retry` — löscht eine Ablehnung und fordert erneut Zugriff an.
- `POST /dsh-companion/kill-switch` — widerruft jedes Gerät, schließt Tunnel und rotiert den Zugriffsschlüssel.
- `POST /dsh-companion/action` — Relais für Werkzeug-Freigaben. Gibt `501` zurück: Freigaben leben im DOM der GUI, die Bridge täuscht sie nicht vor.
- `GET /companion.webmanifest` — PWA-Manifest.

---

## Funktionen des mobilen Clients

- **Befehls-Dock und Code-Tasten.** Eine Reihe von Schnellzugriffen für die Eingabe und eine Reihe von Codesymbolen, die nur erscheinen, solange die Tastatur offen ist: unterhalb der Eingabekarte, wenn es passt, andernfalls darüber. Beide Reihen lassen sich in den Einstellungen ein- und ausschalten.
- **Verhalten der Eingabetaste.** Standardmäßig fügt die Eingabetaste einen Zeilenumbruch ein; „Eingabe sendet“ kehrt das um. Implementiert gegen Lexical mit `execCommand`, dem einzigen Schreibvorgang, den die Eingabe akzeptiert.
- **PC-Benachrichtigungen.** Mit aktiviertem Vordergrunddienst erhält das Telefon eine Benachrichtigung, wenn auf dem Computer ein Turn endet, **sogar bei geschlossener App**. Die Bridge beobachtet das Sitzungsprotokoll und reagiert auf den `turn/end`-Eintrag: genau eine Benachrichtigung pro Turn, egal wie lange das Modell oder ein Werkzeug pausiert.
- **Vordergrund-Benachrichtigungskanal, kritischer Kanal und Freigabekanal.** Kritische Hinweise (Ergebnis des Kill-Switch, widerrufener Zugriff) erscheinen immer und umgehen den Filter „nur wenn verborgen“.
- **Biometrische Sperre**, Multi-PC-Auswahl mit QR und manueller Eingabe, Wake-on-LAN, Telemetrie-Pille, Satelliten-Übergabe, System-Widget.

---

## Sicherheitsmodell

**Zugriff**

- Gemeinsamer Schlüssel per HTTP Basic auf jeder Route, Vergleich in konstanter Zeit, Ratenbegrenzung pro IP.
- Strikte Client-Autorisierung: Loopback, das Subnetz der Bind-Schnittstelle **mit seiner echten Netzmaske** oder explizit deklarierte CIDRs.
- Die Geräteidentität ist das **Sitzungscookie-Token**, nicht die Quell-IP: Ein Gerät, das eine Adresse erbt, erbt nicht die Sitzung.
- `Host`-Validierung gegen die Adresse der Bridge (DNS-Rebinding), Ablehnung von `Origin: null`, leerer Origin und unerwartetem `Sec-Fetch-Site`.
- Sofortige Ablehnung von `Content-Length` + `Transfer-Encoding` (Request-Smuggling).
- Zugriffsschlüssel und Client-Tokens werden vor dem Proxying an das Backend entfernt.
- `DSH_ACCESS_DISABLE=1` verweigert den Start, sofern die Bridge nicht an Loopback gebunden ist.
- Der Kill-Switch **rotiert** den Zugriffsschlüssel; alles, was bereits gepaart war, muss erneut freigegeben werden.

**Anmeldedaten**

- Das Sitzungsgeheimnis wird einmal gelesen, nie protokolliert und nie an den Client gesendet; der Prozess schlägt sofort fehl, wenn es fehlt.
- HMAC-SHA256-Cookie Version 1, identisch mit dem von Harness ausgegebenen, 12 Stunden Gültigkeit mit proaktiver Erneuerung.
- Bei einem Backend-401 lädt die Bridge das Geheimnis neu und versucht es einmal erneut, sodass eine Rotation von `.credentials.yaml` keinen Neustart erfordert.
- Der Zugriffsschlüssel wird nie vollständig ins Protokoll geschrieben: nur seine letzten vier Zeichen.
- Das Panel hat kein dauerhaftes Token: Einmal-Ticket plus Sitzungscookie im Speicher.
- Unter Android werden die gespeicherten Schlüssel mit **AES-256-GCM im Android Keystore** verschlüsselt, mit automatischer Migration älterer Klartextwerte.

**Daten und Speicherung**

- Konversationen werden atomar geschrieben, mit bereinigten Bezeichnern und strikter Pfadbegrenzung gegen Pfad-Traversal.
- Inhalte werden vor der Serialisierung escapt: kein ausführbares HTML gelangt in exportierte Dateien oder Indizes.
- Explizite Obergrenzen für Body-Größe, Nachrichtenzahl und Länge einzelner Nachrichten.
- Ratenbegrenzung im Speicher mit einer begrenzten Obergrenze.

**Native Anwendung (Android)**

- `DSH-Companion.apk` — Version **5.1.5**, `versionCode` 45, `minSdk` 26, `targetSdk` 35.
- Kein AndroidX und kein Kotlin: reiner Java-Bytecode, rund 210 KB.
- **Cleartext außerhalb des privaten Netzwerks blockiert**: `CleartextPolicy` lehnt jede Anfrage ab, die nicht HTTPS ist oder nicht auf den konfigurierten Bunker oder eine private bzw. Loopback-Adresse zeigt, und die Netzwerksicherheitskonfiguration verbietet Cleartext zu den öffentlichen Diensten, mit denen die App kommuniziert (GitHub, DeepSeek). Dies wird oberhalb der WebView erzwungen, weil Androids Netzwerksicherheitskonfiguration „nur private IP-Bereiche“ nicht ausdrücken kann.
- Lokaler Dateizugriff deaktiviert, gemischte Inhalte blockiert, Popups und Remote-Debugging deaktiviert.
- Mikrofonzugriff auf die exakte Origin des Bunkers beschränkt (Schema, Host und Port).
- Navigation auf die Bunker-Origin beschränkt; externe Links werden an die Systemauswahl delegiert.
- TLS-Fehler brechen die Navigation sofort ab.
- `ERR_ABORTED` wird von Transportabbrüchen unterschieden, was die endlose Neuladeschleife beseitigt.
- `onRenderProcessGone` baut die Ansicht neu auf, statt Android die App beenden zu lassen.
- Die Wiederverbindung pausiert im Hintergrund und wendet exponentielles Backoff mit Jitter an.
- Freigabe-Benachrichtigungen werden auf dem Sperrbildschirm verborgen (`VISIBILITY_SECRET`), und die Freigabeaktion verweigert die Ausführung, solange das Gerät gesperrt ist.

---

## Das APK bauen

Ohne Gradle und ohne Android Studio: das APK entsteht mit den Build-Tools des SDK. Voraussetzungen: JDK 17+, Android SDK mit Plattform `android-35` und Build-Tools, und ein Keystore (standardmäßig der Debug-Keystore).

```powershell
`powershell -ExecutionPolicy Bypass -File build-apk.ps1`
```


## Tests

```bash
npm test
```

Elf Suites, **154 Prüfungen**, die Erkennung, mobile Injektion, `?dshc=off`, Cross-Origin-Ablehnung, Abwehr von Request-Smuggling, Body-Limits, Inhaltssanierung, Handshake-Integrität von WebSockets, Sicherheit bei Registerkorruption, Zugriffskontrolle, Satelliten-Übergabe, TTL des Geräteregisters, Panel-Ablauf und den Kill-Switch abdecken.

Die Suite spricht mit einer **laufenden Bridge** (es ist keine Attrappe): Starten Sie zuerst die Bridge. Der echte Kill-Switch-Lauf ist destruktiv — er widerruft Geräte und rotiert den Schlüssel —, daher muss er mit `DSH_TEST_DESTRUCTIVE=1` ausdrücklich aktiviert werden.

---

> **Satellitenmodus (optional):** die Offline-Seite kann eine Unterhaltung mit dem auf dem Telefon hinterlegten API-Schlüssel an `api.deepseek.com` senden. Das ist die einzige Funktion, die das private Netz verlässt; sie ist optional, benötigt diesen Schlüssel und kann seit 5.1.0 nur vom Hauptframe des Bunkers ausgelöst werden.

## Ehrliche Einschränkungen

Dieses Design ist für den **persönlichen Gebrauch** gedacht: ein Betreiber, seine vertrauenswürdigen Geräte und sein privates Netzwerk. Es ist kein Dienst für mehrere getrennte Mandanten.

- Die Bridge gewährt vollen Zugriff auf die DeepSeek-Harness-Sitzung des zugrunde liegenden Windows-Benutzerkontos. Es gibt keine Rechte-Trennung pro Gerät.
- Es gibt keine Benutzerkonten oder RBAC: Wer ein autorisiertes Gerät besitzt, kontrolliert die Sitzung.
- Das Pairing-Panel protokolliert aktuelle Aktivitäten für die betriebliche Sichtbarkeit, ist aber kein unveränderliches Audit-Ledger und kann mit einem einzigen Knopfdruck geleert werden.
- Ein öffentliches oder geteiltes ZeroTier-Netzwerk hebt den privaten Perimeter auf. Halten Sie Netzwerke privat, indem Sie Knoten manuell auf my.zerotier.com autorisieren.
- Ein lokaler Administrator auf dem Host kann Anmeldedaten und Konversationsprotokolle einsehen. Das ist das Sicherheitsmodell von Windows, kein Architekturfehler der Bridge.
- Synchronisierte Chats werden im Klartext in `synced_chats/` gespeichert. Unter Windows übersetzt sich POSIX `0600` nicht in strikte ACLs: Der effektive Schutz ist die ACL des Benutzerprofils. Verwenden Sie BitLocker auf gemeinsam genutzter Hardware.
- Die Bridge spricht Klartext-HTTP innerhalb des VPN-Tunnels. Das ist solide, solange ZeroTier oder Tailscale den Transport Ende-zu-Ende verschlüsseln; exponieren Sie den Port der Bridge niemals außerhalb des VPN.
- Die Android-Netzwerksicherheitskonfiguration kann keine IP-Bereiche ausdrücken, daher wird die Cleartext-Regel „nur privat“ im App-Code erzwungen (siehe `CleartextPolicy`). Ein Angreifer, der bereits in Ihrem VPN sitzt, kann diesen Verkehr dennoch lesen: Die Verschlüsselung ist der Tunnel.
- Die Abschlussbenachrichtigung hängt davon ab, dass DeepSeek Harness den `turn/end`-Eintrag in das Sitzungsprotokoll schreibt. Ändert eine künftige Harness-Version dieses Format, kommt der Hinweis nicht mehr an (die Test-Schaltfläche in der App sagt Ihnen, welche Hälfte versagt hat).

---

## Stabilität

**5.1.5 ist die eingefrorene Basis der Serie 5.** Sie erhält keine neuen Funktionen; nur ein kritischer Sicherheitsfehler würde 5.1.5 ergeben. Alles Weitere erscheint als **Pre-Release** (5.2.0-pre.1 usw.). Der Branch `stable/5` bewahrt genau diesen Stand.

## Bildschirmfotos

| App | Kopplungs-Panel | Offline-Leser |
| --- | --- | --- |
| ![App](docs/images/app.png) | ![Kopplungs-Panel](docs/images/panel.png) | ![Offline-Leser](docs/images/offline.png) |

## Hinweis zum Gemeinschaftsprojekt

> **Hinweis:** DSH Mobile Companion ist ein von der Gemeinschaft entwickelter mobiler Begleitclient, der sicheren Fernzugriff auf DeepSeek Harness über private Netzwerke (ZeroTier / Tailscale) erleichtert. Es ist kein offizielles DeepSeek-Produkt und weder mit DeepSeek verbunden noch von DeepSeek gesponsert oder unterstützt. Alle genannten Marken und Logos gehören ihren jeweiligen Inhabern.

## Kommerzielle Nutzung

Der Produktionseinsatz in einem Unternehmen, die Integration in ein Produkt oder einen Dienst und die Weitergabe erfordern eine separate Lizenz (Business Source License 1.1). Unternehmen können eine Anfrage über das Formular **Commercial license** stellen: [github.com/TintaYNodos/dsh-mobile-companion/issues/new/choose](https://github.com/TintaYNodos/dsh-mobile-companion/issues/new/choose). Details in [LICENSING.md](LICENSING.md).

## Lizenz

Business Source License 1.1 (BUSL-1.1). Kostenlos für individuelle, bildungsbezogene und nicht-kommerzielle Nutzung. Kommerzielle Weiterverbreitung und kommerzielle Verwertung sind ohne ausdrückliche Genehmigung untersagt.

Urheberschaft und Urheberrecht: Ismael Muñoz Reyes · Tinta y Nodos. Siehe [LICENSE](LICENSE).
