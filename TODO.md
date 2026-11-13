# TODO — Befunde der Tiefenanalyse

Stand: 13.11.2026. `[x]` erledigt, `[~]` teilweise, `[ ]` offen.
Dateipfade sind relativ zu diesem Repository.

## P0 — vor echter Nutzung

- [x] **P0-1 Verteilung** — neuer Job `publish-release` in
      `.github/workflows/build-unsigned-ipa.yml` hängt die IPA an das Release eines
      `v*`-Tags; die 14-Tage-Grenze der Artefakte fällt damit weg.
      *Noch kein Tag-Push gelaufen, der Job ist ungetestet.*
- [x] **P0-2 In-App-Link** — `FlowzzLinks.builds` zeigt auf `releases/latest` statt auf
      die Actions-Seite. (`FlowzzPlus/ContentView.swift`)
- [x] **P0-3 Signing-Doku** — neues `README.md`: Kurzfassung in vier Schritten,
      Feather-Warnung an dritter Stelle, Verweis auf `BUILD.md`.
- [x] **P0-4 Signing auf Linux** — `BUILD.md` beschreibt jetzt den Linux-Build von
      zsign (Ubuntu/Debian) neben dem macOS-Build.
- [ ] **P0-5 Erster echter Test** — signiertes IPA installieren, Extension in Safari
      aktivieren, Website-Zugriff für flowzz.com erteilen. Bisher kein On-Device-Lauf.

## P1 — iPhone & UX

- [x] **P1-1 Zoom beim Suchen** — `.fx-search input`, `.fx-mini-search`,
      `.fx-linkinput` und `.fx-select select` stehen bei `pointer: coarse` auf 16px;
      die beiden `<select>` (Sortierung, Filter) zusätzlich auf 44px Höhe. (`content.css`)
- [~] **P1-2 Touchziele** — 44px für Tabs, Schließen, Filter, Modal-Schließen, Buttons,
      Checkbox-Zeilen und Icon-Knöpfe. Kartenaktionen nur 40px: 2 × 44px überdeckt die
      148px breite Karte. (`content.css`)
- [x] **P1-3 Header auf 390px** — auf Touch wird „Schließen“ zum ✕, Text und Esc-Badge
      verschwinden; `aria-label` bleibt. (`content.js`, `content.css`)
- [x] **P1-4 Hilfe ist Desktop** — Touch-Geräte bekommen eine Tipp-Liste (`TOUCH_TIPS`)
      statt der Tastaturliste. (`content.js`)
- [x] **P1-5 Onboarding-Text** — verweist nicht mehr auf `?` als Tastenkürzel, sondern
      auf das Hilfe-Symbol oben rechts. (`content.js`)
- [x] **P1-6 Update-Banner** — `<a href="#">` durch einen echten Button ersetzt; der Text
      sagt, was zu tun ist (IPA neu signieren und installieren). (`content.js`)
- [~] **P1-7 Safe-Area** — `env(safe-area-inset-*)` für Launcher, Toast, Update-Banner
      und Kopfzeile. Auf flowzz.com wirkungslos: das Viewport-Meta der Seite ist
      `initial-scale=1, width=device-width` ohne `viewport-fit=cover`, damit sind alle
      Insets 0. Die Regeln bleiben als Vorbereitung drin; Safaris untere Leiste selbst
      bleibt unberücksichtigt, `dvh` fehlt.
- [~] **P1-8 Scroll-Lock** — `overscroll-behavior: contain` auf den scrollenden Flächen.
      Der eigentliche Lock bleibt `documentElement.style.overflow`; auf iOS blockt das
      nicht zuverlässig.
- [~] **P1-9 SPA-Polling** — `popstate` und `hashchange` lösen die Routen-Prüfung sofort
      aus; das 1,2s-Intervall bleibt als Fallback für History-Aufrufe ohne Event.
- [~] **P1-10 Accessibility** — `aria-modal` auf Overlay und Modal, Fokus wandert in den
      Dialog und nach dem Schließen zurück. Fokus-Falle und `inert` für den Hintergrund
      fehlen noch. (`content.js`)
- [ ] **P1-11 Speicher** — `storage.local` fasst 5 MB, der Attribut-Cache liegt bei ~2,1 MB.
      `unlimitedStorage` prüfen oder komprimiert ablegen. (`attrs-ui.js`)
- [ ] **P1-12 Mobilfunk-Daten** — kalter Index sind 12 Requests à ~338 KB (~4 MB).
      Kleinere `pageSize`, Nachladen pro Tab oder Server-Filter.
- [ ] **P1-13 Bundle-Index ungenutzt** — remote zuerst, das mitgelieferte `.gz` erst im
      Fehlerfall. Besser: lokal zuerst, Remote-Refresh im Hintergrund. (`attrs-ui.js`)
- [ ] **P1-14 Cache-Invalidierung** — `fx_attrs_v1` trägt keine Schema-Version;
      Formatänderungen bleiben bis zu 24 h falsch.

## P2 — Code & Repo

- [ ] **P2-1 Toter Template-Baum** — `Flowzz+/`, `Flowzz+Tests/`, `Flowzz+UITests/` sind
      nicht im Projekt, liegen aber öffentlich im Repo.
- [ ] **P2-2 Key-Logging** — `Flowzz+/Utils/ApiKeyManager.swift` printet entschlüsselte
      Keys, dazu `ENCRYPTED_KEYS.plist`. Beides löschen.
- [x] **P2-3 Kein README** — `README.md` angelegt.
- [x] **P2-4 Keine LICENSE** — MIT-Lizenz mit Attribution auf `flowzz-plus` angelegt.
- [x] **P2-5 Validator-Name** — gibt jetzt `flowzz-plus-ios-app — static validation` aus.
- [x] **P2-6 Validator-Schwelle** — prüft 16.4 für App *und* Extension statt 15.4.
- [~] **P2-7 Versions-Sync** — der Validator vergleicht `manifest.version`,
      `content.js VERSION` und `MARKETING_VERSION`. Erhöhen muss sie weiterhin ein Mensch,
      an vier Stellen.
- [ ] **P2-8 Copy-Fork ohne Sync** — kein Tool spiegelt `flowzz-plus/src/*` in die
      Extension-Ressourcen; jede Änderung muss von Hand in beide Repos.
- [ ] **P2-9 Totes Shadow-CSS** — `#fx-host`, `html.fx-lock`, `.fx-visible` in
      `content.css` erreichen das Dokument nicht; es funktioniert nur über Inline-Styles.
- [x] **P2-10 Ungenutzte Permission** — `activeTab` aus `manifest.json` entfernt;
      `host_permissions` deckt `tabs.sendMessage` ab.
- [ ] **P2-11 Ungenutzte Icons** — `toolbar-icon-*.png` liegen im Bundle,
      `action.default_icon` nutzt nur `128`.
- [ ] **P2-12 Kein `strict_min_version`** im Manifest.
- [ ] **P2-13 Kein SVG-Icon** (seit Safari 16.4 möglich).
- [ ] **P2-14 Doppelter Fetch-Code** — `fetchRemote()` (`content.js`) und `fxFetchBytes()`
      (`attrs.js`), Allowlist-URLs doppelt gepflegt.
- [ ] **P2-15 Keine Tests** — nur `node --check` und der Struktur-Validator.
- [ ] **P2-16 CI-Feinschliff** — keine `concurrency`-Gruppe, kein DerivedData-Cache.
- [ ] **P2-17 Kein `PrivacyInfo.xcprivacy`** — für Sideloading egal, für den App Store nötig.
- [ ] **P2-18 Rechtliches im UI** — im Overlay fehlt „inoffiziell, nicht mit flowzz.com
      verbunden“. (`README.md` und App-Fußzeile haben den Hinweis.)

## P3 — Optional

- [ ] **P3-1 App-Icon** — nur 1024px universal, keine Dark-/Tinted-Varianten.
- [ ] **P3-2 Lokalisierung** — UI Deutsch, `developmentRegion = en`.
- [ ] **P3-3 Changelog** — keine Release Notes.
- [ ] **P3-4 Host-App** — zeigt nur die App-Version, nicht die der gebündelten Extension.
- [ ] **P3-5 Versionsmodell** — jede Extension-Version wird zur App-Version und damit zur
      Re-Signatur.

## Was schon sauber ist

- Unsigned-IPA-Pipeline mit echten Prüfungen, reproduzierbar grün.
- Bundle-IDs konfigurierbar, Extension-ID-Präfix erzwungen, `CodeSignOnCopy` und
  Embed-Phase korrekt.
- `NSExtensionPrincipalClass` löst real auf `FlowzzPlus_Extension.SafariWebExtensionHandler` auf.
- iOS 16.4 ist inhaltlich begründet (Service-Worker-CORS-Fix, `DecompressionStream`).
- Background-Allowlist exakt auf zwei URLs, `sender.url`-Prüfung, 12s-Timeout, kein `eval`.
- Remote-Index mit Bundle-Fallback und 24h-Cache; Index-Daten verifiziert.
