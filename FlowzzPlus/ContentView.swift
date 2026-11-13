import SwiftUI

private enum FlowzzPalette {
    static let ink = Color(red: 0.07, green: 0.08, blue: 0.14)
    static let teal = Color(red: 0.20, green: 0.66, blue: 0.61)
    static let darkTeal = Color(red: 0.11, green: 0.52, blue: 0.47)
    static let muted = Color(red: 0.48, green: 0.52, blue: 0.59)
    static let canvas = Color(red: 0.97, green: 0.985, blue: 0.99)
    static let paleTeal = Color(red: 0.88, green: 0.96, blue: 0.95)
}

struct ContentView: View {
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                background

                ScrollView {
                    VStack(spacing: 0) {
                        brand

                        Text("Aktiviere flowzz+ in den Safari-Einstellungen.")
                            .font(.system(size: 17, weight: .regular))
                            .foregroundStyle(FlowzzPalette.ink)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 28)
                            .padding(.bottom, 22)

                        setupSteps

                        HStack(alignment: .center, spacing: 9) {
                            Image(systemName: "info.circle.fill")
                                .font(.system(size: 17, weight: .medium))
                                .foregroundStyle(FlowzzPalette.muted)

                            Text("Die Erweiterung läuft auf flowzz.com in Safari.")
                                .font(.system(size: 14, weight: .regular))
                                .foregroundStyle(FlowzzPalette.muted)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 26)
                        .padding(.horizontal, 5)
                    }
                    .padding(.horizontal, 22)
                    .padding(.top, 42)
                    .padding(.bottom, 40)
                    .frame(maxWidth: 500)
                    .frame(maxWidth: .infinity, minHeight: geometry.size.height, alignment: .top)
                }
                .scrollIndicators(.hidden)
            }
        }
        .background(FlowzzPalette.canvas.ignoresSafeArea())
        .preferredColorScheme(.light)
    }

    private var background: some View {
        FlowzzPalette.canvas
            .overlay(alignment: .topLeading) {
                Circle()
                    .fill(FlowzzPalette.paleTeal.opacity(0.62))
                    .frame(width: 310, height: 310)
                    .offset(x: -185, y: -205)
            }
            .overlay(alignment: .bottomTrailing) {
                Circle()
                    .fill(FlowzzPalette.paleTeal.opacity(0.48))
                    .frame(width: 270, height: 270)
                    .offset(x: 150, y: 170)
            }
            .ignoresSafeArea()
    }

    private var brand: some View {
        VStack(spacing: 10) {
            Image(systemName: "plus")
                .font(.system(size: 54, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
                .frame(width: 88, height: 88)
                .background(FlowzzPalette.teal, in: RoundedRectangle(cornerRadius: 25, style: .continuous))
                .shadow(color: FlowzzPalette.darkTeal.opacity(0.18), radius: 13, x: 0, y: 8)

            HStack(spacing: 0) {
                Text("flowzz")
                    .foregroundStyle(FlowzzPalette.ink)
                Text("+")
                    .foregroundStyle(FlowzzPalette.teal)
            }
            .font(.system(size: 39, weight: .bold))
            .tracking(-1.4)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("flowzz plus")

            Text("Safari-Erweiterung")
                .font(.system(size: 19, weight: .regular))
                .foregroundStyle(FlowzzPalette.muted)
                .padding(.top, -5)
        }
        .frame(maxWidth: .infinity)
    }

    private var setupSteps: some View {
        VStack(spacing: 0) {
            SetupStep(number: 1, title: Text("Öffne die Einstellungen"))
            stepDivider
            SetupStep(number: 2, title: Text("Tippe auf ") + Text("Apps und Safari").fontWeight(.semibold))
            stepDivider
            SetupStep(
                number: 3,
                title: Text("Öffne ") + Text("Erweiterungen").fontWeight(.semibold) +
                    Text(" und aktiviere ") + Text("flowzz+").fontWeight(.semibold)
            )
        }
        .padding(.horizontal, 18)
        .background(.white.opacity(0.72), in: RoundedRectangle(cornerRadius: 25, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 25, style: .continuous)
                .stroke(.white.opacity(0.92), lineWidth: 1)
        }
        .shadow(color: FlowzzPalette.ink.opacity(0.035), radius: 18, x: 0, y: 8)
    }

    private var stepDivider: some View {
        Rectangle()
            .fill(FlowzzPalette.muted.opacity(0.16))
            .frame(height: 1)
            .padding(.leading, 49)
    }
}

private struct SetupStep: View {
    let number: Int
    let title: Text

    var body: some View {
        HStack(alignment: .center, spacing: 17) {
            Text(String(number))
                .font(.system(size: 18, weight: .semibold, design: .rounded))
                .foregroundStyle(FlowzzPalette.darkTeal)
                .frame(width: 36, height: 36)
                .background(FlowzzPalette.paleTeal, in: Circle())

            title
                .font(.system(size: 16, weight: .regular))
                .foregroundStyle(FlowzzPalette.ink)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 13)
    }
}

#Preview {
    ContentView()
}
