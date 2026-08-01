package com.varallisuuspolku.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Pikkusilta webistä widgetille: natiivilisat.js kutsuu tätä kirjoitettuaan
 *  tuoreen tiivistelmän Preferencesiin, jolloin widget päivittyy heti eikä
 *  vasta omalla 30 minuutin rytmillään. */
@CapacitorPlugin(name = "VpWidget")
public class VpWidgetPlugin extends Plugin {

    @PluginMethod
    public void paivita(PluginCall call) {
        VarallisuusWidget.paivitaKaikki(getContext());
        call.resolve();
    }
}
