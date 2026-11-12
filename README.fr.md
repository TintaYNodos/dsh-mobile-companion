# DSH Mobile Companion

> 🌐 **Idiomas / Languages :** [English](README.md) · [Español (México)](README.es.md) · [简体中文](README.zh.md) · [日本語](README.ja.md) · [Português (Brasil)](README.pt.md) · **[Français](README.fr.md)** · [Deutsch](README.de.md)

> 🌐 **Avis linguistique :** Ce document est traduit pour rendre DSH Mobile Companion accessible aux développeurs du monde entier. Les corrections linguistiques et les contributions de la communauté sont les bienvenues. Le document original de référence est en [Espagnol (Mexique)](README.es.md).

Accès mobile à DeepSeek Harness via un réseau privé chiffré ZeroTier ou Tailscale, sans ouvrir de ports et sans casser le cache de prompt.

L'application mobile ne réimplémente pas l'interface : elle agit comme un proxy inverse servant la propre Web GUI de DeepSeek Harness enrichie d'ajustements tactiles. Ce que vous voyez sur votre téléphone est exactement le même produit que celui qui s'exécute sur votre ordinateur.

Édition durcie (*hardened*) par Ismael Muñoz Reyes pour Tinta y Nodos.

---

## Problématiques résolues

DeepSeek Harness écoute sur `127.0.0.1` et protège ses sessions au moyen d'un cookie HMAC dérivé de `.credentials.yaml`. C'est pourquoi une simple ouverture de port ou un tunnel générique ne suffisent pas : sans ce cookie, l'interface renvoie une erreur 401 et, si l'origine de la requête est réécrite de manière inadéquate, le préfixe stable garantissant le cache de prompt est irrémédiablement perdu.

Ce projet résout ces trois aspects simultanément :

- **Signature de session transparente.** Le pont lit le secret local, génère le cookie HMAC-SHA256 (version 1) et le renouvelle avant son expiration. Le navigateur mobile n'a jamais accès au secret.
- **Ajustements tactiles sur le produit réel.** Des métadonnées de viewport et une feuille de style minimale sont injectées. L'interface n'est aucunement substituée et aucun code JavaScript n'est injecté dans le document.
- **Verrouillage réseau.** Le socket se lie exclusivement à l'interface du VPN et n'accepte que les clients provenant de ce même réseau privé chiffré.

---

## Architecture

```text
Téléphone (réseau ZeroTier / Tailscale)
        |
        v
bridge.mjs  —liaison exclusive à l'IP du VPN—
   |-- /                      proxy vers DeepSeek Harness + ajustements mobiles
   |-- /offline               page d'attente lorsque Harness ne répond pas encore
   |-- /dsh-companion/status  découverte et intégrité de la liaison
   |-- /dsh-companion/sync    sauvegarde des conversations sur disque
        |
        v
127.0.0.1:52710  DeepSeek Harness
```

Modules :

```text
companion/
├── bridge.mjs              démarrage, routage, politiques de socket et de contrôle d'accès
├── offline.html            page d'attente reprenant l'esthétique du produit
├── manifest.webmanifest    installation en tant qu'application web (PWA)
├── icon.svg
├── android_src/
│   └── MainActivity.java   client natif : WebView durcie, sélecteur bunker, reconnexion
├── test/
│   ├── verify_bridge.mjs      routes, injection, origine, framing, limites
│   ├── verify_sync_ws.mjs     neutralisation du contenu et handshake WebSocket
│   └── verify_access_key.mjs  contrôle d'accès avec clé partagée
├── src/
│   ├── config.mjs          configuration et seuils centralisés
│   ├── log.mjs             journalisation horodatée
│   ├── network.mjs         découverte VPN, autorisations réseau, port de Harness
│   ├── crypto.mjs          secret, cookie HMAC v1, clé d'accès, comparaison en temps constant
│   ├── http.mjs            assainissement des en-têtes, corps borné, origine de confiance
│   ├── proxy.mjs           proxy HTTP et tunnel WebSocket
│   ├── mobile.mjs          injection du viewport et ajustements tactiles
│   ├── sync.mjs            persistance atomique des conversations
│   ├── static.mjs          ressources locales avec ETag
│   └── ratelimit.mjs       seau à jetons par client (token bucket)
└── synced_chats/           conversations synchronisées (.md et .json)
```

---

## Installation

### Ordinateur

```bash
git clone https://github.com/TintaYNodos/dsh-mobile-companion.git
```

1. Définissez une clé d'accès (fortement recommandé, voir plus bas).
2. Installez le démarrage automatique avec `install-autostart.bat` (enregistre une tâche silencieuse au démarrage de Windows).
3. Le pont détecte automatiquement l'interface ZeroTier ou Tailscale et s'y lie. Si la détection échoue, définissez `DSH_BIND_HOST` avec l'adresse IP privée.

### Téléphone

Deux méthodes équivalentes :

- **Application native :** installez `DSH-Companion.apk` depuis la section *Releases*. Elle apporte la reconnexion automatique, un sélecteur de bunker et le mode plein écran. Elle pèse 140 Ko et n'inclut aucune bibliothèque tierce : uniquement le client, son icône et son thème.
- **Sans rien installer :** ouvrez `http://<IP_VPN>:57420` dans votre navigateur et utilisez « Ajouter à l'écran d'accueil ».

`/m` répond par une redirection permanente vers `/` : l'ancien mode satellite a été retiré au profit de l'interface réelle.

---

## Variables d'environnement

| Variable | Valeur par défaut | Utilisation |
| --- | --- | --- |
| `DSH_BIND_HOST` | autodétecté | Force l'IP privée de liaison |
| `DSH_TARGET_PORT` | `52710` | Port de DeepSeek Harness |
| `DSH_LISTEN_PORT` | `57420` | Port du pont |
| `DSH_HOME` | `%USERPROFILE%\.dsh` | Répertoire des identifiants et de la clé |
| `DSH_BROWSER_SECRET` | — | Secret direct, évite la lecture du fichier YAML |
| `DSH_ACCESS_KEY` | autogénérée | Clé partagée ; remplace celle du fichier |
| `DSH_ACCESS_DISABLE` | — | `1` désactive la clé (uniquement avec liaison loopback) |
| `DSH_COMPANION_TOKEN` | vide | Jeton additionnel pour `/dsh-companion/sync` |
| `DSH_ALLOW_CIDR` | vide | Sous-réseaux autorisés additionnels, séparés par des virgules |

### Validation unique depuis l'ordinateur

Aucune clé n'est à saisir.

1. Vous ouvrez l'application sur le téléphone. Elle affiche « Confirmer sur l'ordinateur ».
2. Sur le PC, vous ouvrez `http://<IP_VPN>:57420/pair`.
3. L'appareil apparaît avec son adresse IP. Cliquez sur **Autoriser**.
4. Le téléphone se connecte automatiquement et ne redemandera plus rien.

La session dure **30 jours et se renouvelle à l'usage** : chaque fois que vous ouvrez l'application après 24 heures, le compteur est réinitialisé à 30. Si vous l'utilisez au moins une fois par mois, elle n'expire jamais.

Le panneau d'administration écoute **exclusivement sur 127.0.0.1** et exige son propre identifiant ; il est donc inaccessible depuis le VPN ou depuis une autre machine. Il liste les appareils autorisés avec un bouton permettant de révoquer chacun d'eux.

Les appareils sont enregistrés dans `%USERPROFILE%\.dsh\companion-devices.json`. Un bouton **Tout révoquer** est présent sur le panneau. Plus de détails dans [DISPOSITIVOS.md](DISPOSITIVOS.md).

La clé manuelle existe toujours comme solution de secours pour une connexion depuis un navigateur, dans `%USERPROFILE%\.dsh\companion-access-key`. L'application n'en a pas besoin.

**Limitation réelle :** HTTP Basic transmet la clé en Base64, sans chiffrement. Cela n'est acceptable que parce que ZeroTier et Tailscale chiffrent le transport. Sur un réseau ZeroTier partagé ou public, un membre hostile pourrait tenter une interception au niveau de la couche 2 ; la protection appropriée consiste à maintenir le réseau strictement privé avec autorisation manuelle.

---

## Routes

- `GET /` — Web GUI de DeepSeek Harness, avec ajustements mobiles appliqués lorsque le client est un smartphone.
- `GET /offline` — page d'attente pendant le démarrage de Harness, intégrant le lecteur éditorial hors ligne des sessions préchargées.
- `GET /dsh-companion/status` — `{ service, version, status, dshOnline, targetPort, time }`.
- `POST /dsh-companion/sync` — enregistre une conversation dans `synced_chats/` aux formats Markdown et JSON.
- `GET /dsh-companion/chats` — liste chronologique des sessions synchronisées pour le lecteur hors ligne.
- `GET /dsh-companion/chat/:id` — fournit le contenu d'une session (JSON structuré ou Markdown via `?format=md`).
- `POST /dsh-companion/action` — résolution à distance des autorisations d'outils et des permissions de bac à sable (*sandbox*) en arrière-plan.
- `GET /companion.webmanifest` — manifeste d'installation PWA.

---

## Modèle de sécurité

**Accès**

- Clé partagée obligatoire via HTTP Basic sur toutes les routes, y compris la découverte ; comparaison en temps constant et limitation du débit de requêtes par IP.
- Autorisation client restreinte : boucle locale (*loopback*), sous-réseau de l'interface d'écoute **avec son masque réel**, ou CIDR explicitement déclarés.
- L'en-tête `Host` doit correspondre à celui du pont : neutralise les attaques par DNS rebinding.
- Rejet systématique de `Origin: null`, de l'origine vide et des valeurs `Sec-Fetch-Site` autres que `same-origin`/`none`.
- Rejet des requêtes présentant simultanément `Content-Length` et `Transfer-Encoding` (contrebande de requêtes HTTP / *HTTP request smuggling*).
- La clé d'accès et le jeton client ne sont jamais transférés au backend : ils sont purgés avant le proxy.
- Tunnel WebSocket soumis aux mêmes critères d'origine, assainissement des sauts de ligne CRLF et fermeture propre.

**Identifiants**

- Le secret de session n'est lu qu'une seule fois, n'apparaît jamais dans les logs et ne transite jamais vers le client. Il est validé au démarrage : s'il est manquant, le processus échoue immédiatement au lieu de laisser les requêtes en suspens.
- Cookie HMAC-SHA256 version 1, strictement identique à celui émis par DeepSeek Harness, avec 12 heures de validité et renouvellement anticipé.
- Si le backend renvoie une erreur 401, le pont recharge le secret et retente une fois la requête : survit à la rotation de `.credentials.yaml` sans redémarrage.

**Données et stockage**

- Les conversations synchronisées sont écrites de manière atomique, avec des noms dérivés d'un identifiant contrôlé et une vérification stricte du confinement de chemin contre toute traversée de répertoires (*path traversal*).
- Tout le contenu est échappé avant sérialisation : aucun code HTML exécutable n'est propagé dans les fichiers ou dans l'index.
- Limites explicites sur la taille du corps de requête, le nombre de messages et la longueur par message.
- La limitation de débit (*rate limit*) dispose d'un plafond mémoire : impossible de saturer la mémoire avec des clés uniques forgées.

**Application native (Android)**

- `DSH-Companion.apk` — version 4.3.0, `versionCode` 20, `minSdk` 26, `targetSdk` 35.
- Moins de 240 Ko, sans AndroidX ni Kotlin : le fichier `classes.dex` est composé de code Java pur et reproductible.
- **Prise en charge Multi-PC dynamique :** ajoutez et commutez un nombre illimité d'ordinateurs avec sélecteur intelligent et suppression sécurisée.
- **Actions interactives dans les notifications en arrière-plan :** permet d'autoriser ou de refuser l'exécution d'outils et les permissions de bac à sable `danger-full-access` directement depuis la barre de notifications, sans avoir à ouvrir la fenêtre de l'application.
- **Lecteur éditorial hors ligne :** permet de consulter les sessions synchronisées sur le téléphone avec une typographie littéraire soignée, optimisée pour la lecture de chapitres et de narrations structurées, même lorsque l'ordinateur hôte est éteint.
- **Conception sobre d'ingénierie :** interface épurée, exempte d'émoticônes superflues, dotée d'une hiérarchie visuelle inspirée des consoles système et de la palette sombre officielle DeepSeek / GitHub Dark.
- Accès aux fichiers locaux désactivé, contenu mixte bloqué, fenêtres contextuelles (*pop-ups*) et débogage distant désactivés.
- L'accès au microphone n'est accordé qu'à l'origine exacte du bunker (schéma, hôte et port) ; toute autre origine est systématiquement refusée.
- Navigation strictement restreinte à l'origine du bunker ; les liens externes s'ouvrent via le sélecteur natif du système d'exploitation.
- Annulation sans exception des erreurs TLS.
- Les abandons de navigation (`ERR_ABORTED`) ne sont pas confondus avec des coupures réseau : aucun cycle de rechargement en boucle.
- Les tentatives de reconnexion s'interrompent en arrière-plan et sont régulées par un mécanisme d'attente exponentielle avec gigue (*backoff with jitter*).

## Tests

```bash
node test/verify_bridge.mjs
node test/verify_sync_ws.mjs
node test/verify_access_key.mjs   # nécessite DSH_ACCESS_KEY définie au démarrage
```

Couvrent la découverte, l'injection mobile, le respect de `?dshc=off`, le rejet *cross-origin*, la contrebande de requêtes, les limites de charge utile, la neutralisation de contenu, le *handshake* WebSocket et le contrôle d'accès.

---

## Limites honnêtes

Cette conception est pensée pour un **usage personnel** : une personne, ses machines, son réseau privé. Il ne s'agit aucunement d'un service mutualisé ou multi-utilisateurs.

- Le pont accorde un accès intégral à la session DeepSeek Harness du compte utilisateur Windows sous lequel il s'exécute. Il n'existe aucune étanchéité par utilisateur ou par appareil.
- Deux téléphones d'un même utilisateur partagent la même session, mais chacun s'autorise et se révoque individuellement depuis le tableau de bord d'appairage.
- Il n'existe ni comptes ni rôles : quiconque dispose d'un appareil autorisé détient le contrôle.
- Le panneau d'autorisation consigne l'activité récente, mais ne constitue pas un journal d'audit immuable : il peut être réinitialisé d'un simple clic.
- Un réseau ZeroTier public ou partagé annule la protection réseau. Maintenez-le strictement privé avec autorisation manuelle sur my.zerotier.com.
- Un administrateur local de l'ordinateur peut lire les identifiants et les conversations. C'est le modèle de sécurité propre à Windows, non un défaut du pont.
- Les conversations synchronisées sont stockées en clair dans `synced_chats/`. Sous Windows, le mode `0600` n'implique pas une ACL stricte : la protection effective repose sur l'ACL du profil utilisateur. Chiffrez le volume si la machine est partagée.
- Le trafic circule en HTTP au travers du VPN. Cela est sûr car ZeroTier et Tailscale chiffrent le transport de bout en bout ; ne l'exposez jamais hors du VPN.
- L'autorisation réseau repose sur l'adresse IP source. Elle ne protège pas contre un attaquant ayant déjà compromis une machine au sein de ce réseau privé : c'est précisément la raison d'être de `DSH_ACCESS_KEY`.

---

## Avis de projet communautaire

> **Avis :** DSH Mobile Companion est un client mobile compagnon open source développé par la communauté afin de faciliter l'accès distant sécurisé à DeepSeek Harness via des réseaux privés (ZeroTier / Tailscale). Ce n'est pas un produit officiel de DeepSeek et il n'est en aucun cas affilié, sponsorisé ou approuvé par DeepSeek. Toutes les marques et logos cités appartiennent à leurs propriétaires respectifs.

## Licence

BSL 1.1 / PolyForm Noncommercial 1.0.0. Libre pour un usage individuel, éducatif et non commercial. Redistribution et exploitation commerciale interdites sans autorisation expresse.
Auteur et titulaire des droits : Ismael Muñoz Reyes · Tinta y Nodos. Voir [LICENSE](LICENSE).
