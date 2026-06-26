package com.pizzaherogaming.wallop;

import android.os.Bundle;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.google.android.gms.ads.MobileAds;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        enableImmersiveMode();
        // Initialize the Mobile Ads SDK (App ID is declared in AndroidManifest).
        MobileAds.initialize(this, initStatus -> {});
        // Expose window.AndroidAds.* to the game's GameAds bridge (ui.js).
        getBridge().getWebView().addJavascriptInterface(
            new AdsInterface(this, getBridge().getWebView()), "AndroidAds");
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // Re-hide the bars after dialogs/ads/recents steal focus and give it back.
        if (hasFocus) enableImmersiveMode();
    }

    /** Full-screen game: hide the status + navigation bars. They reappear
     *  transiently on an edge swipe (immersive sticky), then auto-hide again.
     *  Display-cutout insets are still reported to CSS env(safe-area-inset-*),
     *  so the HUD keeps clearing the camera notch. */
    private void enableImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
