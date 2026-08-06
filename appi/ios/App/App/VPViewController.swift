import UIKit
import Capacitor

// Palauttaa iOS:n luonnollisen kumijouston: Capacitor kytkee sen oletuksena
// pois (scrollView.bounces = false), jolloin skrollin pääty töksähtää.
// Storyboard käyttää tätä luokkaa CAPBridgeViewControllerin sijaan.
class VPViewController: CAPBridgeViewController {

    override open func capacitorDidLoad() {
        webView?.scrollView.bounces = true
        webView?.scrollView.alwaysBounceVertical = true
    }
}
