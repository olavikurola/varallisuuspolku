package com.varallisuuspolku.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Pikkusilta webistä natiiviin: (1) widget päivittyy heti kun natiivilisat.js
 *  on kirjoittanut tuoreen tiivistelmän Preferencesiin (eikä vasta omalla
 *  30 minuutin rytmillään), (2) kuvakkeen pikatoiminnon valinta välittyy
 *  webille — MainActivity kirjaa intentin extran tähän, ja web hakee sen
 *  käynnistyessään tai etualalle palatessaan. */
@CapacitorPlugin(name = "VpWidget")
public class VpWidgetPlugin extends Plugin {

    /** Odottava pikatoiminto (tulkki/toteuma/suunnitelma), null = ei mitään. */
    static volatile String oikotieArvo = null;

    @PluginMethod
    public void paivita(PluginCall call) {
        VarallisuusWidget.paivitaKaikki(getContext());
        call.resolve();
    }

    @PluginMethod
    public void oikotie(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("arvo", oikotieArvo);
        oikotieArvo = null; // kertakäyttöinen — sama valinta ei laukea uudestaan
        call.resolve(ret);
    }
}
