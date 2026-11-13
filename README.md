# Flowzz+

Die inoffizielle [flowzz+](https://github.com/CRZX1337/flowzz-plus)-Erweiterung als
native iOS-App mit echter Safari-Web-Extension. Herkunftsfilter, Volltextsuche,
Apotheken-Preisvergleich, Favoriten, Vergleich und CSV-Export – für **Blüten, Extrakte
und Edibles** auf [flowzz.com](https://flowzz.com).

Die App selbst zeigt nur die Einrichtung und Hilfe; die Arbeit macht die eingebettete
Safari-Erweiterung. Erweiterungen können sich auf iOS nicht selbst aktualisieren, deshalb
liefert jeder App-Build die aktuelle Erweiterung mit.

## Installation

Es gibt kein App-Store-Angebot. Der Weg ist immer derselbe:

1. **Unsigned IPA holen** – aus den [Releases](../../releases/latest) (Tag-Build) oder als
   Workflow-Artefakt aus GitHub Actions. Beides ist unsigniert und ohne Zertifikat nicht
   installierbar.
2. **Selbst signieren** – mit [zsign](https://github.com/zhlynn/zsign) und **zwei**
   Provisioning-Profilen, eines für die App und eines für die Erweiterung. Details,
   Linux- und macOS-Build von zsign sowie die Fehlersuche stehen in [BUILD.md](BUILD.md).
3. **Installieren** – die signierte IPA über einen Installer einspielen, der nicht erneut
   signiert.
4. **In Safari aktivieren** – *Einstellungen → Safari → Erweiterungen* (ab iOS 18: *Einstellungen → Apps → Safari → Erweiterungen*) → flowzz+
   einschalten und den Website-Zugriff für `flowzz.com` erlauben. Danach flowzz.com in
   Safari neu laden.

**Nicht mit Feather re-signieren.** Feather signiert die Bundle-Hierarchie mit einem
einzigen Profil und kann die eingebettete `.appex` damit unbrauchbar machen; Safari zeigt
die Erweiterung dann gar nicht an. Die Begründung steht in [BUILD.md](BUILD.md).

## Voraussetzungen

- iOS 16.4 oder neuer auf dem Gerät.
- Ein Apple-Developer-Zertifikat (`.p12`) mit zwei passenden Provisioning-Profilen; bei
  Development-Profilen muss die UDID des iPhones registriert sein.
- Zum Signieren genügt ein Linux-Rechner oder ein Mac. Xcode braucht nur, wer selbst baut.

## Aufbau

```
FlowzzPlus/                      Host-App (SwiftUI): Einrichtung, Hilfe, Version
FlowzzPlus Extension/            Safari-Web-Extension
  SafariWebExtensionHandler.swift  nativer Nachrichten-Handler
  Resources/                     Web-Extension-Payload, landet im .appex
    manifest.json                Manifest V3
    background.js                Allowlist-Proxy für zwei GitHub-URLs
    content.js / content.css     Overlay, Filter, Suche, Vergleich, CSV
    images/attrs*.js             Attribut-Index (Effekte, Terpene, Geschmack)
tools/validate-project.py        statische Prüfung des Projekts, ohne Xcode
BUILD.md                         Build, Signieren, Installieren, Fehlersuche
.github/workflows/               Build der unsignierten IPA, Release-Upload
```

## Entwicklung

```bash
python3 tools/validate-project.py                      # Projekt + Manifest prüfen
node --check 'FlowzzPlus Extension/Resources/content.js'
```

Der Build läuft in GitHub Actions (`.github/workflows/build-unsigned-ipa.yml`): Projekt und
JavaScript werden validiert, die Release-App samt Erweiterung ohne Signatur gebaut, das
`.appex` und die IPA geprüft. Ein Push auf einen `v*`-Tag hängt die IPA zusätzlich an das
Release des Tags.

Die Web-Extension ist eine angepasste Kopie von `flowzz-plus/src/`. Änderungen an
`content.js`, `content.css` und `attrs-ui.js` gehören in beide Repositories – ein
automatischer Abgleich existiert noch nicht.

## Rechtliches

Kein offizielles Angebot von flowzz.com und nicht mit flowzz verbunden. Die Daten und die
Marke gehören flowzz.com; diese App zeigt die Daten nur anders an. Wirkungs- und
Terpenangaben stammen aus freiwilligen Community-Angaben und sind **keine medizinische
Aussage, keine Indikation und kein Heilversprechen**.

Der Code steht unter MIT, siehe [LICENSE](LICENSE).
