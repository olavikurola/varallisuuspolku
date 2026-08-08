import Capacitor
import WidgetKit

// Pikkusilta webistä natiiviin (rekisteröidään VPViewControllerissa):
// (1) paivita: natiivilisat.js antaa widgetin tiivistelmä-JSONin — se
//     kirjoitetaan App Group -tallennukseen, josta WidgetKit-laajennus lukee
//     sen, ja widgetin aikajana ladataan heti uudelleen.
// (2) oikotie: kuvakkeen pikatoiminnon valinta (AppDelegate kirjaa) välittyy
//     webille kertakäyttöisenä — sama valinta ei laukea uudestaan.
@objc(VpWidgetPlugin)
public class VpWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VpWidgetPlugin"
    public let jsName = "VpWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "paivita", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "oikotie", returnType: CAPPluginReturnPromise)
    ]

    /// Odottava pikatoiminto (tulkki/toteuma/suunnitelma), nil = ei mitään
    static var oikotieArvo: String? = nil

    static let ryhma = "group.com.varallisuuspolku.app"

    @objc func paivita(_ call: CAPPluginCall) {
        // containerURL on luotettava App Group -oikeuden koetin: nil = appin
        // allekirjoituksesta puuttuu ryhmä (UserDefaults(suiteName:) palauttaisi
        // olion ja lukisi omaa välimuistiaan vaikka jako ei toimisi)
        let onRyhma = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: VpWidgetPlugin.ryhma) != nil
        if let data = call.getString("data"), let d = UserDefaults(suiteName: VpWidgetPlugin.ryhma) {
            d.set(data, forKey: "vp-widget")
        }
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve(["ok": onRyhma])
    }

    @objc func oikotie(_ call: CAPPluginCall) {
        if let arvo = VpWidgetPlugin.oikotieArvo {
            VpWidgetPlugin.oikotieArvo = nil
            call.resolve(["arvo": arvo])
        } else {
            call.resolve([:])
        }
    }
}
