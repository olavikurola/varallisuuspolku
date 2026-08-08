import UIKit
import Capacitor

// Palauttaa iOS:n luonnollisen kumijouston: Capacitor kytkee sen oletuksena
// pois (scrollView.bounces = false), jolloin skrollin pääty töksähtää.
// Storyboard käyttää tätä luokkaa CAPBridgeViewControllerin sijaan.
class VPViewController: CAPBridgeViewController {

    override open func capacitorDidLoad() {
        webView?.scrollView.bounces = true
        webView?.scrollView.alwaysBounceVertical = true
        // Oma pikkuplugin (widget-silta + kuvakkeen pikatoiminnot) — paikallinen
        // Swift-luokka rekisteröidään käsin, npm-pluginit rekisteröityvät itse
        bridge?.registerPluginInstance(VpWidgetPlugin())
    }
}
