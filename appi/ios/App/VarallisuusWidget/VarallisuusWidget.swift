import WidgetKit
import SwiftUI

// Varallisuuspolun kotinäyttöwidget (iOS): näyttää natiivilisat.js:n
// App Group -tallennukseen kirjoittaman valmiin tiivistelmän — widget ei
// laske mitään, kuten Android-vastineensakaan (VarallisuusWidget.java).
// Tiedot: {otsikko, arvo, alarivi, paivitetty, kayra} suomeksi valmiiksi
// muotoiltuna; kayra on odotettu kehitys normalisoituna 0–100 ja piirtyy
// brändipolkuna tekstin taustalle.

struct VpTiedot: Decodable {
    var otsikko: String
    var arvo: String
    var alarivi: String?
    var paivitetty: String?
    var kayra: [Double]?
}

struct VpEntry: TimelineEntry {
    let date: Date
    let tiedot: VpTiedot?
}

struct VpProvider: TimelineProvider {
    func lue() -> VpTiedot? {
        guard let d = UserDefaults(suiteName: "group.com.varallisuuspolku.app"),
              let s = d.string(forKey: "vp-widget"),
              let data = s.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(VpTiedot.self, from: data)
    }
    func placeholder(in context: Context) -> VpEntry {
        VpEntry(date: Date(), tiedot: VpTiedot(otsikko: "Onnistumis-%", arvo: "99 %", alarivi: "Eläkkeelle 65 v", paivitetty: nil, kayra: [4, 5, 7, 9, 11, 14, 17, 20, 24, 28, 33, 38, 43, 49, 55, 61, 67, 73, 79, 84, 89, 93, 96, 98, 100]))
    }
    func getSnapshot(in context: Context, completion: @escaping (VpEntry) -> Void) {
        completion(VpEntry(date: Date(), tiedot: lue()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<VpEntry>) -> Void) {
        // Appi lataa aikajanan uudelleen heti kun luvut muuttuvat (VpWidgetPlugin);
        // varapäivitys 30 min välein kattaa tilanteet joissa appia ei avata
        let entry = VpEntry(date: Date(), tiedot: lue())
        let seuraava = Date().addingTimeInterval(30 * 60)
        completion(Timeline(entries: [entry], policy: .after(seuraava)))
    }
}

private let tausta = Color(red: 0.039, green: 0.055, blue: 0.102)   // #0a0e1a
private let teksti = Color(red: 0.910, green: 0.925, blue: 0.973)   // #e8ecf8
private let himmea = Color(red: 0.576, green: 0.631, blue: 0.722)   // #93a1b8
private let aksentti = Color(red: 0.176, green: 0.831, blue: 0.749) // #2dd4bf
private let violetti = Color(red: 0.545, green: 0.486, blue: 0.965) // #8b7cf6

// Polkuviiva: pisteet 0–100 skaalattuna kehykseen; suljettu = täyttöalue
struct VpKayra: Shape {
    let pisteet: [Double]
    let suljettu: Bool
    func path(in rect: CGRect) -> Path {
        var p = Path()
        guard pisteet.count > 1 else { return p }
        let n = CGFloat(pisteet.count - 1)
        for (i, v) in pisteet.enumerated() {
            let x = rect.width * CGFloat(i) / n
            let y = rect.height * (1 - CGFloat(min(max(v, 0), 100)) / 100)
            if i == 0 { p.move(to: CGPoint(x: x, y: y)) } else { p.addLine(to: CGPoint(x: x, y: y)) }
        }
        if suljettu {
            p.addLine(to: CGPoint(x: rect.width, y: rect.height))
            p.addLine(to: CGPoint(x: 0, y: rect.height))
            p.closeSubpath()
        }
        return p
    }
}

struct VarallisuusWidgetView: View {
    var entry: VpEntry
    var body: some View {
        ZStack(alignment: .topLeading) {
            // polku piirtyy alaosaan tekstin taakse — sama käyrä kuin appissa
            if let k = entry.tiedot?.kayra, k.count > 1 {
                VStack {
                    Spacer(minLength: 0)
                    ZStack {
                        VpKayra(pisteet: k, suljettu: true)
                            .fill(LinearGradient(colors: [aksentti.opacity(0.22), aksentti.opacity(0.02)],
                                                 startPoint: .top, endPoint: .bottom))
                        VpKayra(pisteet: k, suljettu: false)
                            .stroke(LinearGradient(colors: [aksentti, violetti],
                                                   startPoint: .leading, endPoint: .trailing),
                                    style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                    }
                    .frame(height: 42)
                }
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(entry.tiedot?.otsikko ?? "Varallisuuspolku")
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(himmea)
                    .lineLimit(1)
                Text(entry.tiedot?.arvo ?? "—")
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .foregroundColor(aksentti)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                if let ala = entry.tiedot?.alarivi, !ala.isEmpty {
                    Text(ala)
                        .font(.caption2)
                        .foregroundColor(teksti)
                        .lineLimit(2)
                }
                if entry.tiedot == nil {
                    Text("Avaa sovellus kerran")
                        .font(.caption2)
                        .foregroundColor(himmea)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .vpTausta()
    }
}

extension View {
    @ViewBuilder func vpTausta() -> some View {
        if #available(iOS 17.0, *) {
            self.containerBackground(for: .widget) { tausta }
        } else {
            self.padding(14).background(tausta)
        }
    }
}

@main
struct VarallisuusWidget: Widget {
    let kind: String = "VarallisuusWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: VpProvider()) { entry in
            VarallisuusWidgetView(entry: entry)
        }
        .configurationDisplayName("Varallisuuspolku")
        .description("Suunnitelmasi tila yhdellä vilkaisulla")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
