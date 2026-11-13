# DSH Mobile Companion

> 🌐 **Idiomas / Languages:** [English](README.md) · [Español (México)](README.es.md) · [简体中文](README.zh.md) · [日本語](README.ja.md) · [Português (Brasil)](README.pt.md) · [Français](README.fr.md) · **[Deutsch](README.de.md)**

> 🌐 **Sprachhinweis:** Dieses Dokument wurde übersetzt, um DSH Mobile Companion für Entwickler weltweit zugänglich zu machen. Sprachkorrekturen und Pull Requests aus der Community sind herzlich willkommen. Das kanonische Originaldokument ist auf [Spanisch (Mexiko)](README.es.md).

Mobiler Zugriff auf DeepSeek Harness über ein privates, verschlüsseltes ZeroTier- oder Tailscale-Netzwerk, ohne Portfreigaben und ohne das Prompt-Caching zu beeinträchtigen.

Die mobile Anwendung reimplementiert die Benutzeroberfläche nicht: Sie fungiert als Reverse Proxy, zeigt die originale Web-GUI von DeepSeek Harness an und wendet touch-optimierte Anpassungen darauf an. Was Sie auf dem Smartphone sehen, ist exakt dasselbe Produkt, das auf dem Computer ausgeführt wird.

Gehärtete Edition (*hardened*) von Ismael Muñoz Reyes für Tinta y Nodos.

---

## Was dieses Projekt löst

DeepSeek Harness lauscht auf `127.0.0.1` und sichert seine Sitzungen mit einem aus `.credentials.yaml` abgeleiteten HMAC-Cookie ab. Daher genügt weder eine einfache Portfreigabe noch ein generischer Tunnel: Ohne dieses Cookie antwortet die Schnittstelle mit HTTP 401, und wird der Origin des Requests unbedacht umgeschrieben, geht das stabile Präfix verloren, auf dem das Prompt-Caching aufbaut.

Dieses Projekt löst alle drei Problemstellungen zugleich:

- **Transparente Sitzungssignierung.** Die Bridge liest das lokale Secret aus, generiert das HMAC-SHA256-Cookie (Version 1) und erneuert es vor Ablauf der Gültigkeit. Der mobile Browser bekommt das Secret niemals zu Gesicht.
- **Touch-Anpassung direkt auf dem echten Produkt.** Viewport-Metadaten und ein minimales Stylesheet werden injiziert. Weder wird die Schnittstelle ersetzt, noch wird JavaScript in das Dokument eingeschleust.
- **Netzwerkabriegelung.** Der Socket bindet ausschließlich an die Schnittstelle des VPNs und akzeptiert nur Clients aus demselben privaten Netzwerk.

---

## Architektur

```text
Smartphone (ZeroTier- / Tailscale-Netzwerk)
        |
        v
bridge.mjs  —exklusive Bindung an die VPN-IP—
   |-- /                      Proxy zu DeepSeek Harness + mobile Anpassung
   |-- /offline               Warteseite, solange Harness noch nicht antwortet
   |-- /dsh-companion/status  Discovery und Verbindungsstatus
   |-- /dsh-companion/sync    Speicherung von Konversationen auf Datenträger
        |
        v
127.0.0.1:52710  DeepSeek Harness
```

Module:

```text
companion/
├── bridge.mjs              Start, Routing, Socket- und Zugriffspolicies
├── offline.html            Warteseite im Design des Produkts
├── manifest.webmanifest    Installation als Web-App (PWA)
├── icon.svg
├── android_src/
│   └── MainActivity.java   nativer Client: gehärtete WebView, Bunker-Pille, Wiederverbindung
├── test/
│   ├── verify_bridge.mjs      Routen, Injektion, Origin, Framing, Grenzwerte
│   ├── verify_sync_ws.mjs     Inhaltsneutralisierung und WebSocket-Handshake
│   └── verify_access_key.mjs  Zugriffskontrolle mit Shared Key
├── src/
│   ├── config.mjs          zentrale Konfiguration und Grenzwerte
│   ├── log.mjs             zeitgestempeltes Logging
│   ├── network.mjs         VPN-Erkennung, Netzwerkautorisierung, Harness-Port
│   ├── crypto.mjs          Secret, HMAC-v1-Cookie, Zugriffsschlüssel, Constant-Time-Vergleich
│   ├── http.mjs            Header-Bereinigung, begrenzter Body, vertrauenswürdiger Origin
│   ├── proxy.mjs           HTTP-Proxy und WebSocket-Tunnel
│   ├── mobile.mjs          Viewport-Injektion und Touch-Anpassungen
│   ├── sync.mjs            atomare Persistenz von Konversationen
│   ├── static.mjs          lokale Assets mit ETag
│   └── ratelimit.mjs       Token-Bucket pro Client
└── synced_chats/           gespeicherte Konversationen (.md und .json)
```

---

## Installation

### Computer

```bash
git clone https://github.com/TintaYNodos/dsh-mobile-companion.git
```

1. Legen Sie einen Zugriffsschlüssel fest (dringend empfohlen, siehe unten).
2. Installieren Sie den Autostart über `install-autostart.bat` (registriert eine stille Aufgabe beim Windows-Start).
3. Die Bridge erkennt die ZeroTier- oder Tailscale-Schnittstelle automatisch und bindet daran. Falls die Erkennung fehlschlägt, setzen Sie `DSH_BIND_HOST` auf die private IP-Adresse.

### Smartphone

Zwei gleichwertige Wege:

- **Native App:** Installieren Sie `DSH-Companion.apk` aus dem Bereich *Releases*. Bietet automatische Wiederverbindung, Bunker-Auswahl und Vollbildmodus. Ist 140 KB groß und enthält keinerlei Drittanbieter-Bibliotheken: lediglich der Client, sein Icon und sein Theme.
- **Ohne Installation:** Öffnen Sie `http://<VPN_IP>:57420` im Browser und wählen Sie „Zum Startbildschirm hinzufügen“.

`/m` antwortet mit einer permanenten Weiterleitung auf `/`: Der frühere Satellitenmodus wurde zugunsten der echten Benutzeroberfläche entfernt.

---

## Umgebungsvariablen

| Variable | Standardwert | Verwendung |
| --- | --- | --- |
| `DSH_BIND_HOST` | automatisch erkannt | Erzwingt die private IP zur Bindung |
| `DSH_TARGET_PORT` | `52710` | Port von DeepSeek Harness |
| `DSH_LISTEN_PORT` | `57420` | Port der Bridge |
| `DSH_HOME` | `%USERPROFILE%\.dsh` | Verzeichnis für Anmeldeinformationen und Schlüssel |
| `DSH_BROWSER_SECRET` | — | Direktes Secret, umgeht das Lesen der YAML-Datei |
| `DSH_ACCESS_KEY` | automatisch generiert | Shared Key; überschreibt den Wert aus der Datei |
| `DSH_ACCESS_DISABLE` | — | `1` deaktiviert den Schlüssel (nur bei Loopback-Bindung) |
| `DSH_COMPANION_TOKEN` | leer | Zusätzlicher Token für `/dsh-companion/sync` |
| `DSH_ALLOW_CIDR` | leer | Zusätzliche autorisierte Subnetze, kommagetrennt |

### Einmalige Bestätigung am Computer

Keine Eingabe eines Schlüssels erforderlich.

1. Sie öffnen die App auf dem Smartphone. Es erscheint „Am Computer bestätigen“.
2. Auf dem PC öffnen Sie `http://<VPN_IP>:57420/pair`.
3. Das Gerät wird mit seiner Adresse aufgeführt. Klicken Sie auf **Autorisieren**.
4. Das Smartphone verbindet sich von selbst und fragt nicht mehr nach.

Die Sitzung ist **30 Tage gültig und verlängert sich bei Nutzung**: Jedes Mal, wenn Sie die App nach 24 Stunden erneut öffnen, wird der Zähler wieder auf 30 gesetzt. Bei einer Nutzung mindestens einmal im Monat läuft sie nie ab.

Das Dashboard lauscht **ausschließlich auf 127.0.0.1** und verlangt eigene Zugangsdaten, ist also weder über das VPN noch von anderen Rechnern aus erreichbar. Es listet autorisierte Geräte mit einer Schaltfläche zum Widerrufen der Freigabe auf.

Die Geräte werden in `%USERPROFILE%\.dsh\companion-devices.json` abgelegt. Im Dashboard gibt es die Schaltfläche **Alle widerrufen**. Details in [DISPOSITIVOS.md](DISPOSITIVOS.md).

Der manuelle Schlüssel verbleibt als Fallback für den Browserzugriff in `%USERPROFILE%\.dsh\companion-access-key`. Die App benötigt ihn nicht.

**Reale Einschränkung:** HTTP Basic überträgt den Schlüssel unverschlüsselt in Base64. Dies ist nur deshalb vertretbar, weil ZeroTier und Tailscale den Transport verschlüsseln. In einem geteilten oder öffentlichen ZeroTier-Netzwerk könnte ein böswilliges Mitglied versuchen, den Datenverkehr auf Layer 2 abzufangen; der wirksame Schutz besteht darin, das Netzwerk privat zu halten und Beitritte manuell zu autorisieren.

---

## Routen

- `GET /` — Web-GUI von DeepSeek Harness, mit angewandter Touch-Optimierung für Mobilgeräte.
- `GET /offline` — Warteseite während des Starts von Harness, inklusive redaktionellem Offline-Reader für vorgeladene Sitzungen.
- `GET /dsh-companion/status` — `{ service, version, status, dshOnline, targetPort, time }`.
- `POST /dsh-companion/sync` — speichert eine Konversation in `synced_chats/` im Markdown- und JSON-Format.
- `GET /dsh-companion/chats` — chronologische Liste synchronisierter Sitzungen für den Offline-Reader.
- `GET /dsh-companion/chat/:id` — liefert den Inhalt einer Sitzung aus (strukturiertes JSON oder Markdown mit `?format=md`).
- `POST /dsh-companion/action` — Remote-Bestätigung von Tool-Autorisierungen und Sandbox-Berechtigungen im Hintergrund.
- `GET /companion.webmanifest` — Web-App-Manifest (PWA-Installation).

---

## Sicherheitsmodell

**Zugriff**

- Verbindlicher Shared Key via HTTP Basic auf allen Routen, einschließlich Discovery; Constant-Time-Vergleich und Ratenbegrenzung pro IP.
- Strikte Client-Autorisierung: Loopback, das Subnetz der Bind-Schnittstelle **mit seiner realen Netzmaske** oder deklarierte CIDR-Blöcke.
- Der `Host`-Header muss mit dem der Bridge übereinstimmen: verhindert DNS-Rebinding.
- Abweisung von `Origin: null`, leerem Origin und `Sec-Fetch-Site`-Werten abweichend von `same-origin`/`none`.
- Abweisung von Anfragen mit gleichzeitigem `Content-Length` und `Transfer-Encoding` (HTTP Request Smuggling).
- Zugriffsschlüssel und Client-Token werden nicht an das Backend weitergeleitet: Sie werden vor dem Proxy-Forwarding entfernt.
- WebSocket-Tunnel unterliegt denselben Origin-Prüfungen, CRLF-Bereinigung und geordnetem Verbindungsabbau.

**Anmeldeinformationen**

- Das Sitzungs-Secret wird einmalig eingelesen, niemals protokolliert und gelangt nie an den Client. Es wird beim Start validiert: Fehlt es, bricht der Prozess sofort ab, anstatt Requests hängen zu lassen.
- HMAC-SHA256-Cookie Version 1, identisch mit dem von DeepSeek Harness generierten Cookie, mit 12 Stunden Gültigkeit und vorausschauender Erneuerung.
- Antwortet das Backend mit 401, lädt die Bridge das Secret neu und versucht es einmal erneut: übersteht eine Rotation von `.credentials.yaml` ohne Neustart.

**Daten und Speicherung**

- Synchronisierte Konversationen werden atomar geschrieben, mit Dateinamen aus einer kontrollierten ID und strikter Path-Traversal-Prüfung.
- Sämtliche Inhalte werden vor der Serialisierung escaped: Es wird kein ausführbares HTML in Dateien oder den Index eingeschleust.
- Explizite Grenzwerte für Body-Größe, Nachrichtenanzahl und Maximallänge einzelner Nachrichten.
- Das Rate-Limiting besitzt eine Speicherbegrenzung: Kann nicht durch das Fluten mit eindeutigen Schlüsseln aufgebläht werden.

**Native App (Android)**

- `DSH-Companion.apk` — Version 4.4.0, `versionCode` 21, `minSdk` 26, `targetSdk` 35.
- Weniger als 240 KB, ohne AndroidX oder Kotlin: `classes.dex` besteht aus reinem, reproduzierbarem Java-Bytecode.
- **Dynamische Multi-PC-Unterstützung:** Beliebig viele Computer hinzufügen und umschalten, inklusive intelligenter Auswahl und sicherem Löschen.
- **Interaktive Hintergrundbenachrichtigungen:** Ermöglicht das Genehmigen oder Ablehnen von Werkzeugen und `danger-full-access`-Berechtigungen direkt aus der Benachrichtigungsleiste heraus, ohne das App-Fenster öffnen zu müssen.
- **Redaktioneller Offline-Reader:** Erlaubt das komfortable Lesen synchronisierter Sitzungen auf dem Smartphone mit literarischer, auf Kapitel und narrative Texte optimierter Typografie – selbst bei ausgeschaltetem Computer.
- **Nüchternes Konsolendesign:** Sachliche Benutzeroberfläche ohne störende Emojis, mit klarer visueller Konsolenhierarchie und der offiziellen dunklen Farbpalette von DeepSeek / GitHub Dark.
- Lokaler Dateizugriff deaktiviert, Mixed Content blockiert, Popups und Remote-Debugging abgeschaltet.
- Mikrofonzugriff wird ausschließlich für den exakten Bunker-Origin gewährt (Schema, Host und Port); jeder abweichende Origin wird abgewiesen.
- Navigation strikt auf den Bunker-Origin beschränkt; externe Links werden über den nativen System-Auswahldialog geöffnet.
- TLS-Fehler führen ausnahmslos zum Verbindungsabbruch.
- Navigationsabbrüche (`ERR_ABORTED`) werden nicht als Netzwerkausfälle fehlinterpretiert: keine Endlos-Reload-Schleifen.
- Wiederholungsversuche werden im Hintergrund pausiert und über exponentiellen Backoff mit Jitter begrenzt.

## Tests

```bash
node test/verify_bridge.mjs
node test/verify_sync_ws.mjs
node test/verify_access_key.mjs   # erfordert beim Start gesetztes DSH_ACCESS_KEY
```

Decken Discovery, mobile Viewport-Injektion, Beachtung von `?dshc=off`, Cross-Origin-Abweisung, Request Smuggling, Payload-Grenzwerte, Inhaltsneutralisierung, WebSocket-Handshake und Zugriffskontrolle ab.

---

## Ehrliche Grenzen

Dieses Design ist für die **persönliche Nutzung** konzipiert: eine Person, ihre Geräte, ihr privates Netzwerk. Es ist kein mandantenfähiger Multi-User-Dienst.

- Die Bridge gewährt vollen Zugriff auf die DeepSeek-Harness-Sitzung des ausführenden Windows-Benutzerkontos. Es gibt keine Isolation nach Benutzern oder Geräten.
- Zwei Smartphones desselben Nutzers teilen sich dieselbe Sitzung, werden jedoch jeweils separat über das Dashboard autorisiert und widerrufen.
- Es gibt weder Benutzerkonten noch Rollen: Wer ein autorisiertes Gerät besitzt, hat die volle Kontrolle.
- Das Autorisierungs-Dashboard erfasst letzte Aktivitäten, stellt jedoch kein Revisions-Audit dar: Es lässt sich per Knopfdruck bereinigen.
- Ein öffentliches oder geteiltes ZeroTier-Netzwerk hebt die Netzwerkbarriere auf. Halten Sie es privat mit manueller Beitrittsautorisierung auf my.zerotier.com.
- Ein lokaler Windows-Administrator kann Anmeldedaten und Chats auslesen. Das entspricht dem Windows-Sicherheitsmodell, keinem Mangel der Bridge.
- Synchronisierte Chats werden im Klartext in `synced_chats/` abgelegt. Unter Windows garantiert Modus `0600` keine strikte ACL: Der wirksame Schutz sind die Zugriffsrechte des Benutzerprofils. Verschlüsseln Sie das Laufwerk bei geteilter Hardware.
- Der Datenverkehr erfolgt als HTTP über das VPN. Dies ist sicher, da ZeroTier und Tailscale den Transport Ende-zu-Ende verschlüsseln; niemals außerhalb des VPNs exponieren.
- Die Netzwerkautorisierung basiert auf der Quelladresse. Sie schützt nicht vor einem Angreifer, der bereits einen Rechner in diesem Netzwerk kontrolliert: Für diesen Fall existiert `DSH_ACCESS_KEY`.

---

## Hinweis zum Community-Projekt

> **Hinweis:** DSH Mobile Companion ist ein quelloffener, von der Community entwickelter mobiler Companion-Client zur Ermöglichung eines sicheren Fernzugriffs auf DeepSeek Harness über private Netzwerke (ZeroTier / Tailscale). Es handelt sich nicht um ein offizielles Produkt von DeepSeek; das Projekt ist weder mit DeepSeek verbunden noch wird es von DeepSeek gesponsert oder unterstützt. Alle genannten Markennamen und Logos sind Eigentum der jeweiligen Inhaber.

## Lizenz

BSL 1.1 / PolyForm Noncommercial 1.0.0. Frei für die individuelle, pädagogische und nicht-kommerzielle Nutzung. Weiterverbreitung und kommerzielle Verwertung ohne ausdrückliche Genehmigung untersagt.
Urheberschaft und Rechteinhaber: Ismael Muñoz Reyes · Tinta y Nodos. Siehe [LICENSE](LICENSE).
