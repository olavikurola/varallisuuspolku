package com.varallisuuspolku.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * Kotinäyttöwidget: suunnitelman tila yhdellä vilkaisulla. Tiedot tulevat
 * webistä valmiiksi muotoiltuina (natiivilisat.js kirjoittaa tiivistelmän
 * Preferences-tallennukseen eli SharedPreferences "CapacitorStorage",
 * avain "vp-widget") — widget vain näyttää tekstit, ei laske mitään.
 * Päivittyy kun appi käy taustalla (VpWidgetPlugin) ja varalta 30 min välein.
 */
public class VarallisuusWidget extends AppWidgetProvider {

    static void paivitaKaikki(Context context) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(context, VarallisuusWidget.class));
        for (int id : ids) paivita(context, mgr, id);
    }

    static void paivita(Context context, AppWidgetManager mgr, int widgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.varallisuus_widget);
        SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        String raw = prefs.getString("vp-widget", null);
        if (raw != null) {
            try {
                JSONObject o = new JSONObject(raw);
                views.setTextViewText(R.id.widget_otsikko, o.optString("otsikko", ""));
                views.setTextViewText(R.id.widget_arvo, o.optString("arvo", "—"));
                views.setTextViewText(R.id.widget_alarivi, o.optString("alarivi", ""));
                views.setTextViewText(R.id.widget_paivitetty, o.optString("paivitetty", ""));
            } catch (Exception e) { /* rikkinäinen tallenne → layoutin oletustekstit */ }
        }
        Intent avaus = new Intent(context, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(context, 0, avaus,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_juuri, pi);
        mgr.updateAppWidget(widgetId, views);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) paivita(context, mgr, id);
    }
}
