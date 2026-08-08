package com.varallisuuspolku.app;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VpWidgetPlugin.class);
        poimiOikotie(getIntent());
        super.onCreate(savedInstanceState);
    }

    /** Kuvakkeen pikatoiminto lämpimässä käynnistyksessä (singleTask):
     *  intent saapuu tänne — web poimii arvon palatessaan etualalle. */
    @Override
    protected void onNewIntent(Intent intent) {
        poimiOikotie(intent);
        super.onNewIntent(intent);
    }

    private void poimiOikotie(Intent intent) {
        if (intent == null) return;
        String arvo = intent.getStringExtra("vp_oikotie");
        if (arvo != null && !arvo.isEmpty()) VpWidgetPlugin.oikotieArvo = arvo;
    }
}
