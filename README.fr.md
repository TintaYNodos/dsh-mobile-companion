# DSH Mobile Companion

![version](https://img.shields.io/badge/version-5.1.4-1f6feb?style=flat-square) ![license](https://img.shields.io/badge/license-BUSL--1.1-8b5cf6?style=flat-square) ![android](https://img.shields.io/badge/Android-8.0%2B-3ddc84?style=flat-square&logo=android&logoColor=white) ![node](https://img.shields.io/badge/Node-22.15%2B-339933?style=flat-square&logo=node.js&logoColor=white) ![ci](https://github.com/TintaYNodos/dsh-mobile-companion/actions/workflows/verify.yml/badge.svg?branch=main) ![tests](https://img.shields.io/badge/tests-154%20passing-2ea043?style=flat-square) ![size](https://img.shields.io/badge/APK-210%20KB-0ea5e9?style=flat-square)

> 🌐 **Idiomas / Languages:** [English](README.md) · [Español (México)](README.es.md) · [简体中文](README.zh.md) · [日本語](README.ja.md) · [Português (Brasil)](README.pt.md) · **[Français](README.fr.md)** · [Deutsch](README.de.md)

> 🌐 **Avis linguistique :** Ce document est traduit pour rendre DSH Mobile Companion accessible aux développeurs internationaux. Les corrections linguistiques, les améliorations de formulation et les pull requests de la communauté sont chaleureusement les bienvenues. Le document de référence canonique est en [Español (México)](README.es.md).

Accès mobile à DeepSeek Harness via un réseau privé ZeroTier ou Tailscale, sans ouvrir de ports et sans casser le cache de prompt.

L'application mobile ne réimplémente pas l'interface : elle affiche la propre Web GUI de DeepSeek Harness et y ajoute une couche tactile. Ce que vous voyez sur votre téléphone est le même produit que celui qui s'exécute sur votre ordinateur.

Édition durcie par Ismael Muñoz Reyes pour Tinta y Nodos.

Version actuelle : **5.1.4** (`versionCode` 44).

---

## Ce que cela résout

DeepSeek Harness écoute sur `127.0.0.1` et protège ses sessions au moyen d'un cookie HMAC dérivé de `.credentials.yaml`. C'est pourquoi ouvrir un port ou utiliser un tunnel générique ne suffit pas : sans ce cookie, l'interface répond 401, et réécrire imprudemment les origines des requêtes casse le préfixe stable requis pour le cache de prompt.

Ce projet résout les trois problèmes d'un seul coup :

- **Signature transparente des sessions.** Le pont lit le secret local, génère le cookie HMAC-SHA256 (version 1) et le renouvelle avant expiration. Le navigateur mobile ne voit jamais le secret.
- **Couche tactile sur le produit réel.** Les métadonnées de viewport, une feuille de style et un petit script client sont injectés. L'interface n'est pas remplacée : le script ajoute seulement des éléments tactiles (dock de commandes, touches de code, synchronisation de thème, relais d'approbation, relais de notification). Il s'exécute avec la même origine et les mêmes privilèges que la page : traitez-le donc comme faisant partie de la frontière de confiance.
- **Isolation réseau.** Le socket se lie exclusivement à l'interface VPN et n'accepte que les clients issus de ce même réseau privé.

---

## Architecture

```text
Téléphone (réseau ZeroTier / Tailscale)
        |
        v
bridge.mjs  —liaison exclusive à l'IP du VPN—
   |-- /                        proxy vers DeepSeek Harness + couche tactile
   |-- /offline                 page de veille et lecteur éditorial hors ligne
   |-- /dsh-companion/status    découverte du lien et contrôle de santé
   |-- /dsh-companion/sync      export de la conversation sur disque
   |-- /dsh-companion/chats     index des conversations synchronisées
   |-- /dsh-companion/pc-events Server-Sent Events : « un tour vient de se terminer »
   |-- /dsh-companion/pair-*    appairage et approbation d'appareil
        |
        v
127.0.0.1:<port du Harness>  DeepSeek Harness
```

Modules :

```text
companion/
├── bridge.mjs                 démarrage, routage, socket et politiques d'accès
├── package.json               source unique de la version, `npm start` / `npm test`
├── offline.html               coquille de l'écran de veille
├── offline.css                mise en page de base, thèmes et onglets
├── offline-reader.css         lecteur éditorial et détail de conversation
├── offline-satellite.css      section satellite
├── offline-core.js            état partagé, statut de connexion, navigation
├── offline-reader.js          lecteur hors ligne, liste, détail, modes de lecture
├── offline-satellite.js       relais satellite (envoi, chunks, achèvement)
├── src/
│   ├── config.mjs             configuration et limites centralisées
│   ├── log.mjs                journaliseur horodaté
│   ├── network.mjs            découverte VPN, autorisation, port du Harness
│   ├── crypto.mjs             secret, cookie HMAC v1, clé d'accès, rotation
│   ├── http.mjs               assainissement des en-têtes, corps borné, origine de confiance
│   ├── routes.mjs             répartition des routes (état, données, contrôle)
│   ├── routes-pairing.mjs     appairage, approbation, transmission au panneau
│   ├── panel.mjs              panneau d'approbation local (loopback uniquement)
│   ├── pairing.mjs            requêtes en attente et codes
│   ├── pairing-views.mjs      HTML du panneau
│   ├── devices.mjs            registre des appareils, TTL, révocation
│   ├── registry.mjs           registre JSON atomique et résistant aux pannes
│   ├── proxy.mjs              proxy HTTP
│   ├── proxy-ws.mjs           tunnel WebSocket
│   ├── mobile.mjs             point d'entrée d'injection (viewport + script client)
│   ├── mobile-client*.mjs     client injecté, découpé par responsabilité
│   ├── mobile-styles.mjs      feuille de style injectée
│   ├── pc-events.mjs          observateur des tours de session -> notifications SSE
│   ├── sync.mjs               persistance atomique des conversations
│   ├── static.mjs             ressources locales avec ETag
│   ├── system-stats.mjs       télémétrie CPU, mémoire et température
│   ├── qr.mjs / visual-lab.mjs assistants pour les harnais QR et visuel
│   └── ratelimit.mjs          seau à jetons par client
│   ├── device-claim, panel-session, routes-data, sync-format, sync-index, sync-retention
├── tools/
├── audit-repo.mjs   audit du dépôt (texte, syntaxe, versions, secrets)
├── build-apk.ps1   construit et signe l'APK sans Gradle
├── doctor.ps1                  diagnostic d'installation (Node, tunnel, pont, panneau)
├── RELEASING.md   liste de contrôle de publication
├── .github/workflows/verify.yml   CI : syntaxe + audit à chaque push
├── SECURITY.md   comment signaler une vulnérabilité
└── CHANGELOG.md   historique des versions
├── android_src/               client natif (Java pur, sans AndroidX)
│   ├── MainActivity.java      cycle de vie et orchestration
│   ├── CompanionWebViewClient.java, CompanionChromeClient.java
│   ├── CleartextPolicy.java   bloque le cleartext vers les hôtes non privés
│   ├── PcRegistryStore.java, PcEntry.java   registre multi-PC
│   ├── SettingsScreen.java, HubSheet.java, PcDialogs.java, QrDialogs.java
│   ├── UpdateInstaller.java, KillSwitchUi.java, BiometricGate.java
│   ├── PcEventsService.java   service de premier plan pour les notifications PC
│   ├── NotificationHelper.java, NotificationChannels.java, NotificationsPc.java
│   ├── KeyStoreVault.java    chiffrement Android Keystore des clés stockées
│   └── …                     découverte, télémétrie, satellite, WOL, widget
├── test/
│   ├── verify_*.mjs           onze suites de vérification (154 contrôles)
│   ├── _harness.mjs           client partagé
│   └── run-all.mjs            `npm test`
└── synced_chats/              conversations persistées (.md et .json)
```

---

## Installation

### Méthode 1 : configuration automatisée avec votre assistant IA (recommandée)

Si vous utilisez un agent IA ou un assistant de programmation sur votre machine (DeepSeek Harness, Cursor, Claude Code, Copilot, etc.), collez l'invite ci-dessous dans votre chat. L'assistant clonera le dépôt, configurera le démarrage en arrière-plan, vérifiera le pont et vous fournira les étapes de connexion mobile.

> Guide complet : [AI_SETUP_PROMPT.md](AI_SETUP_PROMPT.md)

```text
Tu es un assistant d'installation. Lance d'abord le diagnostic et colle sa sortie :

    powershell -ExecutionPolicy Bypass -File doctor.ps1

S'il indique AUCUN TUNNEL (aucune interface ZeroTier/Tailscale avec IP privée), ARRÊTE-TOI : sans réseau privé le téléphone ne peut pas joindre cet ordinateur. Explique comment installer ZeroTier (https://my.zerotier.com + client sur PC et téléphone, réseau privé, autoriser les deux nœuds) ou Tailscale (même compte sur les deux), puis relance doctor.ps1.
Si Node est antérieur à 22.15, installe Node 22 LTS. S'il manque les identifiants Harness, ouvre DeepSeek Harness et connecte-toi. Si le pont est arrêté, exécute install-autostart.bat.
Ensuite : démarre le pont (install-autostart.bat enregistre le démarrage automatique ET le lance ; ne relance pas run-hidden.vbs), associe le téléphone avec panel.bat (le panneau affiche le même code à 4 chiffres) et teste les notifications (Réglages -> Notifications du PC -> Tester depuis le PC).
Termine en relançant doctor.ps1 et en rapportant : interface et IP du tunnel, URL du téléphone, version du pont, panneau, état de l'association et résultat du test. Ne déclare jamais que ça marche sans ces preuves. N'expose jamais le pont à Internet, n'affiche jamais la clé d'accès et n'exécute pas le kill switch sans demande.
```

### Méthode 2 : installation manuelle

#### Ordinateur

```bash
git clone https://github.com/TintaYNodos/dsh-mobile-companion.git
```

Node.js 22.15 ou plus récent, aucune dépendance npm.

1. Définissez une clé d'accès (fortement recommandé ; voir ci-dessous).
2. Installez le démarrage automatique avec `install-autostart.bat` (tâche silencieuse à l'ouverture de session Windows).
3. Le pont détecte l'interface ZeroTier ou Tailscale et s'y lie. Si la détection échoue, définissez `DSH_BIND_HOST` sur votre IP privée.

#### Téléphone

Deux méthodes équivalentes :

- **Application native :** installez `DSH-Companion.apk` depuis la section *Releases*. Sélecteur multi-PC, reconnexion automatique, service de notification de premier plan, verrou biométrique. Environ 210 Ko sans aucune dépendance tierce : du Java pur et reproductible, une icône d'asset et le thème.
- **Sans rien installer :** ouvrez `http://<VPN_IP>:57420` dans votre navigateur et choisissez « Ajouter à l'écran d'accueil ».

`/m` répond par une redirection permanente vers `/` : l'ancien mode satellite a été retiré au profit de l'interface réelle.

---

Pour l'arrêter ou le retirer du démarrage automatique : `stop.bat`, `uninstall-autostart.bat` (Windows) ; `uninstall-launchd.sh`, `uninstall-systemd.sh` (macOS/Linux).

## Variables d'environnement

| Variable | Valeur par défaut | Effet |
| --- | --- | --- |
| `DSH_BIND_HOST` | détection automatique | Force l'IP de liaison privée |
| `DSH_TARGET_PORT` | détection automatique | Port de DeepSeek Harness |
| `DSH_LISTEN_PORT` | `57420` | Port d'écoute du pont |
| `DSH_PANEL_PORT` | `57421` | Port du panneau d'approbation local |
| `DSH_HOME` | `%USERPROFILE%\.dsh` | Répertoire des identifiants, de la clé et du registre |
| `DSH_BROWSER_SECRET` | — | Secret fourni directement, évite la lecture du YAML |
| `DSH_ACCESS_KEY` | générée automatiquement | Clé partagée ; remplace la clé basée sur un fichier |
| `DSH_ACCESS_DISABLE` | — | `1` désactive la clé d'accès, **autorisé uniquement en liaison loopback** |
| `DSH_COMPANION_TOKEN` | vide | Jeton supplémentaire pour `/dsh-companion/sync` |
| `DSH_ALLOW_CIDR` | vide | Sous-réseaux supplémentairement autorisés, séparés par des virgules |
| `DSH_DEVICE_TTL_DAYS` | `30` | Durée de vie de la session d'appareil ; les appareils expirés sont rejetés et purgés |
| `DSH_DEVICE_REFRESH_HOURS` | `24` | Fréquence de renouvellement de la durée de vie à l'usage |
| `DSH_PENDING_TTL_MIN` | `15` | Minutes pendant lesquelles une demande d'appairage attend l'approbation |
| `DSH_ALLOWED_HOSTS` | vide | Noms d'hôte supplémentaires acceptés dans `Host`/`Origin` (MagicDNS Tailscale) |
| `DSH_ALLOW_GENERIC_VPN` | — | `1` accepte une interface tun/tap générique |
| `DSH_SYNC_MAX_FILES` | `200` | Nombre maximal de conversations conservées |
| `DSH_SYNC_MAX_TOTAL_MB` | `200` | Taille maximale de `synced_chats/` en Mo |

### Approbation unique depuis l'ordinateur

1. Ouvrez l'application sur votre téléphone : elle affiche « Confirmez sur votre ordinateur ».
2. Sur votre PC, exécutez `panel.bat` (ou ouvrez l'URL qu'affiche le pont). Le panneau écoute **strictement sur 127.0.0.1**.
3. L'appareil apparaît avec son code et son adresse. Appuyez sur **Autoriser**.
4. Le téléphone se connecte et ne redemandera plus rien.

La session de l'appareil dure **30 jours et se renouvelle à l'usage** : à chaque ouverture de l'application après 24 heures, le compteur est réinitialisé. Les appareils expirés ne sont plus acceptés et sont retirés du registre.

L'accès au panneau repose sur un **ticket à usage unique** qui expire et devient caduc une fois utilisé ; en échange, le navigateur reçoit un cookie de session `HttpOnly`, `SameSite=Strict` dont l'identifiant n'existe qu'en mémoire. Aucun jeton ne circule dans une URL partageable, et rien n'est écrit dans un fichier contenant l'identifiant permanent.

Les appareils autorisés résident dans `%USERPROFILE%\.dsh\companion-devices.json`. Le panneau propose la révocation individuelle et **Tout révoquer**. Sur le téléphone, le **Kill switch** révoque chaque appareil, ferme les tunnels WebSocket **et fait tourner la clé d'accès**. Détails dans [DISPOSITIVOS.md](DISPOSITIVOS.md).

La clé d'accès manuelle reste disponible comme solution de repli pour l'accès depuis un navigateur standard, stockée dans `%USERPROFILE%\.dsh\companion-access-key`. L'application native la conserve chiffrée avec l'Android Keystore.

**Limitation pratique :** HTTP Basic transmet la clé en Base64 sans chiffrement de couche transport propre. Ce n'est acceptable que parce que ZeroTier et Tailscale chiffrent tout le trafic de bout en bout. Sur un réseau ZeroTier partagé ou public, un pair malveillant pourrait tenter une interception de couche 2 ; gardez le réseau strictement privé en autorisant manuellement les nœuds.

---

## Routes

- `GET /` — Web GUI de DeepSeek Harness, avec la couche tactile appliquée lorsque le client est un téléphone.
- `GET /offline` — page de veille pendant le démarrage de Harness, plus le lecteur éditorial hors ligne.
- `GET /dsh-companion/status` — `{ service, version, status, dshOnline, targetPort, time }`. Les appelants anonymes obtiennent cette forme minimale ; la liste des appareils et la télémétrie exigent une autorisation.
- `POST /dsh-companion/sync` — enregistre une conversation dans `synced_chats/` au format Markdown et JSON.
- `GET /dsh-companion/chats` — index des conversations synchronisées.
- `GET /dsh-companion/chat/:id` — contenu de la conversation (JSON, ou Markdown avec `?format=md`).
- `GET /dsh-companion/pc-events` — flux Server-Sent Events qui émet `response-finished` lorsqu'un tour se termine sur l'ordinateur.
- `POST /dsh-companion/pc-events/test` — émet un événement synthétique ; utilisé par le bouton « Tester depuis le PC ».
- `GET /dsh-companion/pair-state` — point de terminaison d'interrogation utilisé par l'écran d'attente.
- `GET /dsh-companion/pair-events` — flux d'approbation pour l'écran d'attente.
- `POST /dsh-companion/open-panel` — ouvre la fenêtre du panneau local (loopback uniquement).
- `POST /dsh-companion/retry` — efface un rejet et redemande l'accès.
- `POST /dsh-companion/kill-switch` — révoque chaque appareil, ferme les tunnels et fait tourner la clé d'accès.
- `POST /dsh-companion/action` — relais d'approbation des outils. Renvoie `501` : les approbations vivent dans le DOM de la GUI, le pont ne les simule pas.
- `GET /companion.webmanifest` — manifeste PWA.

---

## Fonctionnalités du client mobile

- **Dock de commandes et touches de code.** Une rangée de raccourcis de la zone de saisie et une rangée de symboles de code qui n'apparaissent que pendant que le clavier est ouvert, sous la carte de saisie lorsqu'elle tient, au-dessus sinon. Les deux rangées peuvent être activées ou désactivées dans les Réglages.
- **Comportement de la touche Entrée.** Par défaut, Entrée insère un saut de ligne ; « Entrée envoie » inverse ce comportement. Implémenté sur Lexical avec `execCommand`, qui est la seule écriture que la zone de saisie accepte.
- **Notifications PC.** Avec le service de premier plan activé, le téléphone reçoit une notification lorsqu'un tour se termine sur l'ordinateur, **même application fermée**. Le pont surveille le journal de session et se déclenche sur l'enregistrement `turn/end` : exactement une notification par tour, quelle que soit la durée des pauses du modèle ou d'un outil.
- **Canal de notification de premier plan, canal critique et canal d'approbation.** Les avis critiques (résultat du kill switch, accès révoqué) apparaissent toujours, en contournant le filtre « uniquement lorsque masqué ».
- **Verrou biométrique**, sélecteur multi-PC avec QR et saisie manuelle, wake-on-LAN, pastille de télémétrie, relais satellite, widget système.

---

## Modèle de sécurité

**Accès**

- Clé partagée via HTTP Basic sur chaque route, comparaison à temps constant, limitation de débit par IP.
- Autorisation stricte des clients : loopback, le sous-réseau de l'interface de liaison **avec son masque réseau réel**, ou des CIDR explicitement déclarés.
- L'identité de l'appareil est le **jeton du cookie de session**, pas l'IP source : un appareil qui hérite d'une adresse n'hérite pas de la session.
- Validation de `Host` par rapport à l'adresse du pont (DNS rebinding), rejet de `Origin: null`, d'une origine vide et d'un `Sec-Fetch-Site` inattendu.
- Rejet immédiat de `Content-Length` + `Transfer-Encoding` (contrebande de requêtes).
- Les clés d'accès et les jetons clients sont retirés avant le proxy vers le backend.
- `DSH_ACCESS_DISABLE=1` refuse de démarrer sauf si le pont est lié au loopback.
- Le kill switch **fait tourner** la clé d'accès ; tout ce qui était déjà appairé doit être approuvé à nouveau.

**Identifiants**

- Le secret de session est lu une seule fois, jamais journalisé et jamais envoyé au client ; le processus échoue immédiatement s'il manque.
- Cookie HMAC-SHA256 version 1 identique à celui émis par Harness, 12 heures de validité avec renouvellement proactif.
- Sur un 401 du backend, le pont recharge le secret et réessaie une fois, de sorte qu'une rotation de `.credentials.yaml` ne nécessite pas de redémarrage.
- La clé d'accès n'est jamais imprimée en entier dans le journal : seulement ses quatre derniers caractères.
- Le panneau n'a pas de jeton permanent : ticket à usage unique plus cookie de session en mémoire.
- Sur Android, les clés stockées sont chiffrées avec **AES-256-GCM dans l'Android Keystore**, avec migration automatique des anciennes valeurs en clair.

**Données et stockage**

- Les conversations sont écrites de façon atomique, avec des identifiants assainis et un confinement de chemin strict contre le traversal.
- Le contenu est échappé avant sérialisation : aucun HTML exécutable ne fuit dans les fichiers exportés ou les index.
- Limites explicites de taille de corps, de nombre de messages et de longueur par message.
- Limitation de débit en mémoire avec un plafond borné.

**Application native (Android)**

- `DSH-Companion.apk` — version **5.1.4**, `versionCode` 44, `minSdk` 26, `targetSdk` 35.
- Ni AndroidX ni Kotlin : bytecode Java pur, environ 210 Ko.
- **Cleartext bloqué hors du réseau privé** : `CleartextPolicy` rejette toute requête qui n'est pas en HTTPS ou qui ne pointe pas vers le bunker configuré ou une adresse privée/loopback, et la configuration de sécurité réseau interdit le cleartext vers les services publics avec lesquels l'application communique (GitHub, DeepSeek). Cela est appliqué au-dessus de la WebView, car la configuration de sécurité réseau d'Android ne peut pas exprimer « plages d'IP privées uniquement ».
- Accès aux fichiers locaux désactivé, contenu mixte bloqué, popups et débogage distant désactivés.
- Accès au microphone restreint à l'origine exacte du bunker (schéma, hôte et port).
- Navigation confinée à l'origine du bunker ; les liens externes sont délégués au sélecteur système.
- Les erreurs TLS annulent immédiatement la navigation.
- `ERR_ABORTED` est distingué des coupures de transport, ce qui supprime la boucle de rechargement infinie.
- `onRenderProcessGone` reconstruit la vue au lieu de laisser Android tuer l'application.
- La reconnexion s'interrompt en arrière-plan et applique un backoff exponentiel avec jitter.
- Les notifications d'approbation sont masquées sur l'écran verrouillé (`VISIBILITY_SECRET`) et l'action d'approbation refuse de s'exécuter lorsque l'appareil est verrouillé.

---

## Construire l'APK

Sans Gradle ni Android Studio : l'APK est assemblé avec les outils du SDK. Prérequis : JDK 17+, SDK Android avec la plateforme `android-35` et les build-tools, et un keystore (par défaut celui de débogage).

```powershell
`powershell -ExecutionPolicy Bypass -File build-apk.ps1`
```


## Tests

```bash
npm test
```

Onze suites, **154 contrôles**, couvrant la découverte, l'injection mobile, `?dshc=off`, le rejet cross-origin, les défenses contre la contrebande de requêtes, les limites de corps, l'assainissement du contenu, l'intégrité du handshake WebSocket, la sûreté face à la corruption du registre, le contrôle d'accès, le relais satellite, le TTL du registre des appareils, le flux du panneau et le kill switch.

La suite parle à un **pont en direct** (ce n'est pas une simulation) : démarrez d'abord le pont. L'exécution réelle du kill switch est destructrice — elle révoque des appareils et fait tourner la clé —, elle doit donc être activée explicitement avec `DSH_TEST_DESTRUCTIVE=1`.

---

> **Mode satellite (facultatif) :** la page hors ligne peut envoyer une conversation à `api.deepseek.com` avec la clé d'API configurée sur le téléphone. C'est la seule fonction qui sort de votre réseau privé ; elle est facultative, exige cette clé et, depuis la 5.1.0, seul le frame principal du bunker peut la déclencher.

## Limites honnêtes

Cette conception est destinée à un **usage personnel** : un opérateur, ses appareils de confiance et son réseau privé. Ce n'est pas un service multi-locataires.

- Le pont accorde un accès complet à la session DeepSeek Harness du compte utilisateur Windows sous-jacent. Il n'y a pas de séparation des privilèges par appareil.
- Il n'y a ni comptes utilisateurs ni RBAC : quiconque détient un appareil autorisé contrôle la session.
- Le panneau d'appairage journalise l'activité récente pour la visibilité opérationnelle, mais ce n'est pas un registre d'audit immuable et il peut être effacé d'un simple bouton.
- Un réseau ZeroTier public ou partagé annule le périmètre privé. Gardez les réseaux privés avec l'autorisation manuelle des nœuds sur my.zerotier.com.
- Un administrateur local sur l'hôte peut inspecter les identifiants et les journaux de conversation. C'est le modèle de sécurité de Windows, pas un défaut d'architecture du pont.
- Les conversations synchronisées sont stockées en clair dans `synced_chats/`. Sous Windows, le `0600` POSIX ne se traduit pas en ACL strictes : la protection effective est l'ACL du profil utilisateur. Utilisez BitLocker sur du matériel partagé.
- Le pont parle HTTP en clair à l'intérieur du tunnel VPN. C'est sain tant que ZeroTier ou Tailscale chiffrent le transit de bout en bout ; n'exposez jamais le port du pont hors du VPN.
- La configuration de sécurité réseau d'Android ne peut pas exprimer de plages d'IP, donc la règle cleartext « privé uniquement » est appliquée dans le code de l'application (voir `CleartextPolicy`). Un attaquant déjà installé dans votre VPN peut néanmoins lire ce trafic : le chiffrement, c'est le tunnel.
- La notification d'achèvement dépend de l'écriture par DeepSeek Harness de l'enregistrement `turn/end` dans le journal de session. Si une future version de Harness change ce format, l'avis cesse d'arriver (le bouton de test dans l'application vous indique quelle moitié a échoué).

---

## Stabilité

**La 5.1.4 est la base figée de la série 5.** Elle ne reçoit aucune nouvelle fonction ; seul un correctif de sécurité critique donnerait une 5.1.4. La suite sort en **pre-release** (5.2.0-pre.1, etc.). La branche `stable/5` conserve exactement cet arbre.

## Captures

| Application | Panneau d'appairage | Lecteur hors ligne |
| --- | --- | --- |
| ![Application](docs/images/app.png) | ![Panneau d'appairage](docs/images/panel.png) | ![Lecteur hors ligne](docs/images/offline.png) |

## Avis de projet communautaire

> **Avis :** DSH Mobile Companion est un client mobile compagnon développé par la communauté pour faciliter l'accès distant sécurisé à DeepSeek Harness via des réseaux privés (ZeroTier / Tailscale). Ce n'est pas un produit officiel de DeepSeek, et il n'est ni affilié à DeepSeek, ni sponsorisé, ni approuvé par DeepSeek. Toutes les marques et logos cités appartiennent à leurs propriétaires respectifs.

## Licence

Business Source License 1.1 (BUSL-1.1). Gratuit pour un usage individuel, éducatif et non commercial. La redistribution commerciale et l'exploitation commerciale sont interdites sans autorisation expresse.

Paternité et titulaire du droit d'auteur : Ismael Muñoz Reyes · Tinta y Nodos. Voir [LICENSE](LICENSE).
