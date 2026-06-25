package com.pizzaherogaming.wallop;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.google.android.gms.ads.MobileAds;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Initialize the Mobile Ads SDK (App ID is declared in AndroidManifest).
        MobileAds.initialize(this, initStatus -> {});
        // Expose window.AndroidAds.* to the game's GameAds bridge (ui.js).
        getBridge().getWebView().addJavascriptInterface(
            new AdsInterface(this, getBridge().getWebView()), "AndroidAds");
    }
}
