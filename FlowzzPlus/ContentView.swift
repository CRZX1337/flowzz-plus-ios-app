import SwiftUI
import UIKit

private enum FlowzzPalette {
    static let teal = Color(red: 0.11, green: 0.56, blue: 0.51)
    static let deepTeal = Color(red: 0.08, green: 0.42, blue: 0.38)
    static let canvas = Color(uiColor: .systemGroupedBackground)
    static let card = Color(uiColor: .secondarySystemGroupedBackground)
}

private enum FlowzzLinks {
    static let website = URL(string: "https://flowzz.com")!
    static let builds = URL(string: "https://github.com/CRZX1337/flowzz-plus-ios-app/actions/workflows/build-unsigned-ipa.yml")!
}

struct ContentView: View {
    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "Unbekannt"
    }

    private var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "—"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    brand
                    websiteButton
                    setupCard
                    helpCard
                    privacyCard
                    updatesCard
                    footer
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 32)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
            }
            .background(FlowzzPalette.canvas.ignoresSafeArea())
            .navigationTitle("flowzz+")
            .navigationBarTitleDisplayMode(.inline)
        }
        .tint(FlowzzPalette.deepTeal)
    }

    private var brand: some View {
        HStack(spacing: 15) {
            Image(systemName: "plus")
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
                .frame(width: 64, height: 64)
                .background(FlowzzPalette.teal, in: RoundedRectangle(cornerRadius: 20, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 0) {
                    Text("flowzz").foregroundStyle(.primary)
                    Text("+").foregroundStyle(FlowzzPalette.teal)
                }
                .font(.system(size: 30, weight: .bold))
                .tracking(-1)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("flowzz plus")

                Text("Safari-Erweiterung")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, 8)
    }

    private var websiteButton: some View {
        VStack(spacing: 8) {
            Link(destination: FlowzzLinks.website) {
                Label("flowzz.com besuchen", systemImage: "safari")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 5)
            }
            .buttonStyle(.borderedProminent)
            .tint(FlowzzPalette.teal)

            Text("Für die Erweiterung flowzz.com in Safari öffnen.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    private var setupCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeading(
                "Einrichtung",
                subtitle: "Aktiviere flowzz+ einmalig in Safari.",
                symbol: "checkmark.shield"
            )

            VStack(spacing: 0) {
                SetupStep(number: 1, title: "Öffne Einstellungen → Apps → Safari → Erweiterungen.")
                Divider().padding(.leading, 42)
                SetupStep(number: 2, title: "Tippe auf flowzz+ und schalte die Erweiterung ein.")
                Divider().padding(.leading, 42)
                SetupStep(number: 3, title: "Erlaube den Website-Zugriff für flowzz.com.")
                Divider().padding(.leading, 42)
                SetupStep(number: 4, title: "Öffne flowzz.com in Safari und lade die Seite neu.")
            }
            .padding(.top, 4)
        }
        .padding(18)
        .background(FlowzzPalette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var helpCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeading("Hilfe", subtitle: "Häufige Probleme schnell lösen.", symbol: "questionmark.circle")

            helpItem(
                "flowzz+ wird in Safari nicht angezeigt",
                symbol: "puzzlepiece",
                detail: "Prüfe unter Einstellungen → Apps → Safari → Erweiterungen, ob flowzz+ eingeschaltet ist. Kehre danach zu Safari zurück und lade flowzz.com neu."
            )
            Divider()
            helpItem(
                "Das flowzz+-Fenster öffnet sich nicht",
                symbol: "rectangle.on.rectangle",
                detail: "Öffne eine Seite unter https://flowzz.com. Prüfe den Website-Zugriff für flowzz+ und tippe bei Bedarf in Safaris Erweiterungsmenü auf flowzz+. Lade die Seite anschließend neu."
            )
            Divider()
            helpItem(
                "Produkte oder Zusatzdaten fehlen",
                symbol: "arrow.clockwise",
                detail: "Prüfe die Internetverbindung und lade flowzz.com erneut. Produktinformationen kommen von flowzz.com; der zusätzliche Attribut-Index wird öffentlich von GitHub geladen."
            )
        }
        .padding(18)
        .background(FlowzzPalette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var privacyCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeading("Zugriff & Datenschutz", symbol: "hand.raised")

            Text("flowzz+ arbeitet auf https://flowzz.com/. Favoriten, Darstellungseinstellung und Attribut-Cache werden lokal im Safari-Erweiterungsspeicher abgelegt. Für Produktdaten nutzt die Erweiterung flowzz.com; den zusätzlichen Attribut-Index lädt sie aus dem öffentlichen flowzz+-GitHub-Repository.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(18)
        .background(FlowzzPalette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var updatesCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeading("App & Updates", symbol: "arrow.down.circle")

            HStack {
                Label("Version \(appVersion)", systemImage: "info.circle")
                    .font(.subheadline.weight(.medium))
                Spacer()
                Text("Build \(buildNumber)")
                    .font(.footnote.monospacedDigit())
                    .foregroundStyle(.secondary)
            }

            Text("Neue IPA-Builds findest du in GitHub Actions. Updates müssen mit deinem Signer signiert und erneut installiert werden. Für den privaten GitHub-Workflow kann eine Anmeldung erforderlich sein.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Link(destination: FlowzzLinks.builds) {
                Label("Builds auf GitHub ansehen", systemImage: "arrow.up.right")
                    .font(.subheadline.weight(.semibold))
            }
        }
        .padding(18)
        .background(FlowzzPalette.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var footer: some View {
        Label("Safari verwaltet den Erweiterungszugriff. Diese App zeigt dir, wo du ihn ändern kannst.", systemImage: "info.circle")
            .font(.footnote)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 4)
    }

    private func sectionHeading(_ title: String, subtitle: String? = nil, symbol: String) -> some View {
        HStack(alignment: .top, spacing: 11) {
            Image(systemName: symbol)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(FlowzzPalette.teal)
                .frame(width: 24)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(.primary)
                if let subtitle {
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func helpItem(_ title: String, symbol: String, detail: String) -> some View {
        DisclosureGroup {
            Text(detail)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 8)
        } label: {
            Label(title, systemImage: symbol)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.primary)
        }
        .tint(FlowzzPalette.teal)
        .padding(.vertical, 5)
    }
}

private struct SetupStep: View {
    let number: Int
    let title: String

    var body: some View {
        HStack(alignment: .top, spacing: 13) {
            Text(String(number))
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
                .frame(width: 28, height: 28)
                .background(FlowzzPalette.teal, in: Circle())
                .accessibilityHidden(true)

            Text(title)
                .font(.subheadline)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 4)
        }
        .padding(.vertical, 11)
    }
}

#Preview {
    ContentView()
}
