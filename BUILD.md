# Build and manual iOS signing

This repository builds the native flowzz+ host app and embeds the Safari Web Extension at `Payload/FlowzzPlus.app/PlugIns/FlowzzPlus Extension.appex`. GitHub Actions creates a verified **unsigned IPA** artifact. Signing happens manually on your own trusted computer with your developer signing identity (`.p12`) and a matching provisioning profile for each bundle ID; signing credentials are never uploaded to GitHub.

## Why this pipeline uses zsign, not Feather

The host and nested Safari extension are separate iOS code bundles with different bundle IDs, and each must be authorized by a matching profile. Feather's current signing path accepts one profile for the bundle tree and does not expose separate profiles for embedded extensions. It may re-sign the `.appex` with the host profile, leaving Safari unable to activate it. Do not use Feather to re-sign this IPA unless a version adds per-extension provisioning profiles and you have verified the result on-device.

This guide uses [zsign](https://github.com/zhlynn/zsign), whose CLI supports multiple `-m` provisioning profiles for app extensions. The Safari extension remains embedded; it is never installed as a separate app. A successful zsign run is not proof of Safari runtime behavior, so verify activation on an iPhone after signing.

## GitHub Actions build

The workflow is `.github/workflows/build-unsigned-ipa.yml`.

- Runs on pushes to `main`, tags matching `v*`, and manual `workflow_dispatch`.
- Manual runs accept optional `app_bundle_id` and `extension_bundle_id`; for automatic push/tag builds, the repository **Variables** `FLOWZZ_APP_BUNDLE_ID` and `FLOWZZ_EXTENSION_BUNDLE_ID` can be set under **Settings → Secrets and variables → Actions → Variables**.
- If no IDs are supplied, the workflow uses `com.crzx.flowzzplus` and `com.crzx.flowzzplus.Extension` so it can still build an unsigned IPA. If only one ID is supplied, it stops with an error.
- To install a signed IPA, both provisioning profiles must authorize these exact IDs and include the developer certificate; the extension ID must start with the host ID followed by a dot. If your profiles use different IDs, pass those IDs to the workflow or set the repository Variables.
- The workflow validates the project and JavaScript, builds the Release device app and dependent extension with code signing disabled, verifies the embedded `.appex` and its resources, and packages the app under the IPA-required `Payload/` directory.
- No certificate, private key, password, or provisioning profile is used by CI. Never put these files in the repository, Actions Variables, or Actions logs.

### Download the IPA

1. Open the repository on GitHub and select **Actions**.
2. Open a successful **Build unsigned iOS IPA** run.
3. Download the `flowzz-plus-unsigned-ipa-<run number>` artifact.
4. Unzip GitHub's artifact download to obtain `flowzz-plus-unsigned.ipa`.

Artifacts are retained for 14 days; start another workflow run if one has expired.

## Developer certificate and profile requirements

Use your developer signing identity (`.p12`) with zsign. It must match **two separate provisioning profiles**:

1. A host-app profile whose App ID authorizes `FLOWZZ_APP_BUNDLE_ID`.
2. A Safari-extension profile whose App ID authorizes `FLOWZZ_EXTENSION_BUNDLE_ID`.

Both profiles must be valid for the same team and include the certificate used to sign. For development profiles, register the target iPhone's UDID; all profiles must be unexpired. The extension ID must be a child of the host ID. Confirm that your certificate provider can issue both matching profiles; a host-only profile is not enough to sign this Safari-enabled IPA.

The JIT option is separate from signing and is not needed by flowzz+ or its Safari extension. This app does not request JIT-related entitlements or perform JIT compilation; JIT availability does not replace either provisioning profile.

The Safari extension target currently declares **no custom entitlements** and uses no App Groups. The `com.apple.Safari.web-extension` extension point itself does not require an App Group entitlement. If a future change adds App Groups or another capability, provision both targets for it and pass matching profiles before distributing.

## Sign locally with zsign

Keep the certificate and profiles outside the repository, for example in `$HOME/flowzz-signing`. The repository `.gitignore` excludes common signing files and zsign cache, but do not rely on ignore rules alone. Never upload the `.p12`, its password, or either `.mobileprovision` to GitHub.

Build zsign from its official source on a trusted Mac (the upstream project also documents Linux and Windows builds):

1. Install the macOS build prerequisites (`pkg-config` and OpenSSL).
2. Clone `https://github.com/zhlynn/zsign` outside this repository.
3. In its `build/macos` directory, run `make clean && make` and use the resulting `zsign` executable.
4. From a private signing directory, set paths to the downloaded unsigned IPA, your developer `.p12`, host profile, and extension profile. Optionally inspect the certificate and profiles with `zsign -C` before signing.
5. Sign with both profiles; zsign selects the matching profile for each bundle ID:

```sh
SIGNING_DIR="$HOME/flowzz-signing"
INPUT_IPA="$HOME/Downloads/flowzz-plus-unsigned.ipa"
P12="$SIGNING_DIR/Developer.p12"
APP_PROFILE="$SIGNING_DIR/flowzzplus-host.mobileprovision"
EXTENSION_PROFILE="$SIGNING_DIR/flowzzplus-extension.mobileprovision"
OUTPUT_IPA="$SIGNING_DIR/flowzz-plus-signed.ipa"

read -s -r -p "Developer .p12 password: " P12_PASSWORD
printf '\n'
zsign -k "$P12" -p "$P12_PASSWORD" \
  -m "$APP_PROFILE" \
  -m "$EXTENSION_PROFILE" \
  -o "$OUTPUT_IPA" \
  "$INPUT_IPA"
unset P12_PASSWORD
```

If the `.p12` has no password, omit `-p "$P12_PASSWORD"`. Enter the password only on your own trusted computer; do not paste it into workflow YAML or a GitHub setting. Do not pass `-E` (`--rm_extensions`) or change the bundle ID unless you also have profiles for the changed IDs.

Verify the output is an IPA and still contains both embedded provisioning profiles:

```sh
zsign -C "$OUTPUT_IPA"
unzip -Z1 "$OUTPUT_IPA" | grep -F 'Payload/FlowzzPlus.app/PlugIns/FlowzzPlus Extension.appex/Info.plist'
unzip -Z1 "$OUTPUT_IPA" | grep -F 'Payload/FlowzzPlus.app/embedded.mobileprovision'
unzip -Z1 "$OUTPUT_IPA" | grep -F 'Payload/FlowzzPlus.app/PlugIns/FlowzzPlus Extension.appex/embedded.mobileprovision'
```

To install from a paired Mac, zsign supports `-i` (via `ideviceinstaller`) after the signing arguments; otherwise use a trusted installer that installs an already-signed IPA without re-signing it. Keep the final signed IPA in the private signing directory, not in the repository or Actions artifacts.

## Activate Safari on iPhone

1. Install the signed app. For a development-signed build, enable Developer Mode on the iPhone and trust the signing developer if iOS prompts for it.
2. Open **Settings → Apps → Safari → Extensions**, enable flowzz+, and grant `flowzz.com` website access.
3. Open Safari on flowzz.com and verify the extension UI appears.

Safari extensions cannot update independently; extension updates ship with a new host-app build. The minimum deployment target is iOS 16.4.

## Troubleshooting

- **Workflow stops before building:** provide both IDs or leave both blank; a single ID is an error. Confirm each ID uses dot-separated letters, digits, or hyphens and that the extension ID starts with `<host-id>.`.
- **zsign reports no matching profile / wrong application identifier:** use one profile for each exact bundle ID, both authorized for the developer certificate's team and including that certificate. Do not change the ID in the signing tool after profiles are created.
- **Installation reports integrity or verification errors:** check certificate revocation/expiry, profile expiry and device UDID registration, and that each profile authorizes its corresponding ID. Re-download the unsigned artifact if its ZIP was incomplete.
- **App installs but flowzz+ is absent in Safari:** confirm the signed IPA still contains `PlugIns/FlowzzPlus Extension.appex`, its `Info.plist`, manifest, scripts, CSS, images, and the extension's own `embedded.mobileprovision`; then verify Safari activation and website access. A host-only profile or a failed nested signature can prevent the extension from appearing.
- **Never send the signed IPA back through Feather:** Feather may replace the per-bundle signatures with its single-profile signing path.

## References

- [zsign — multiple profiles and CLI](https://github.com/zhlynn/zsign)
- [Apple: Safari web extensions](https://developer.apple.com/documentation/safariservices/safari-web-extensions)
- [Apple: provisioning profiles](https://developer.apple.com/help/account/manage-provisioning-profiles/)
