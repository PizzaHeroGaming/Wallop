package com.pizzaherogaming.wallop;

import android.os.Bundle;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.RequestConfiguration;
import com.google.android.gms.games.PlayGamesSdk;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

import java.util.Collections;
import java.util.concurrent.atomic.AtomicBoolean;

public class MainActivity extends BridgeActivity {
    private ConsentInformation consentInformation;
    private AdsInterface adsInterface;
    private final AtomicBoolean mobileAdsInitialized = new AtomicBoolean(false);

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        enableImmersiveMode();

        // Initialize Play Games Services (v2). Kicks off the automatic, silent
        // sign-in attempt at startup — matching the no-prompt cloud-sync design.
        // Must run before SavesBridge checks auth state.
        PlayGamesSdk.initialize(this);

        // Cloud-save bridge (Play Games Saved Games). js/cloud.js calls
        // window.PlayCloud.* to sync the whole wallop_profile_v1 JSON to the
        // cloud (last-write-wins). No-ops silently if the player isn't signed in.
        getBridge().getWebView().addJavascriptInterface(
            new SavesBridge(this, getBridge().getWebView()), "PlayCloud");

        // Play Games achievements + leaderboards bridge → window.AndroidGames.
        // (Cloud save is PlayCloud above; both share the same silent PGS sign-in.)
        getBridge().getWebView().addJavascriptInterface(
            new GamesBridge(this, getBridge().getWebView()), "AndroidGames");

        // Expose window.AndroidAds.* to the game's GameAds bridge (ui.js). Ad
        // loading is deferred (see startLoading) until UMP consent is resolved,
        // so no ad request fires before the user can consent (EEA/UK).
        adsInterface = new AdsInterface(this, getBridge().getWebView());
        getBridge().getWebView().addJavascriptInterface(adsInterface, "AndroidAds");

        // UMP (User Messaging Platform) consent: gather consent BEFORE initializing
        // the Ads SDK or loading any ad. Required to serve real ads in the EEA/UK.
        // Degrades gracefully — if no consent message is configured in AdMob, or the
        // user isn't in a consent region, canRequestAds() is true and ads proceed.
        ConsentRequestParameters params = new ConsentRequestParameters.Builder().build();
        consentInformation = UserMessagingPlatform.getConsentInformation(this);
        consentInformation.requestConsentInfoUpdate(this, params,
            () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(this, formError -> {
                if (consentInformation.canRequestAds()) initializeMobileAdsSdk();
            }),
            requestError -> {
                // Consent lookup failed (e.g. offline): fall back to whatever consent
                // state we already have so ads still work outside consent regions.
                if (consentInformation.canRequestAds()) initializeMobileAdsSdk();
            });

        // Consent may already be available from a previous session — start ads now.
        if (consentInformation.canRequestAds()) initializeMobileAdsSdk();
    }

    /** Initialize the Ads SDK exactly once, then let the bridge warm up formats. */
    private void initializeMobileAdsSdk() {
        if (mobileAdsInitialized.getAndSet(true)) return;
        // Register dev/tester devices so they receive TEST creatives even though the
        // build now serves the REAL Wallop ad units. Clicking a test ad never counts
        // as invalid traffic, so this keeps our own phones safe. This hashed ID is the
        // same physical device registered for Athanor (get new ones from logcat:
        // "Use RequestConfiguration.Builder().setTestDeviceIds(...)"). MUST be set
        // before MobileAds.initialize so the very first ad request honors it.
        MobileAds.setRequestConfiguration(
            new RequestConfiguration.Builder()
                .setTestDeviceIds(Collections.singletonList("998F7B531862D3F0969C32837B395A22"))
                .build());
        MobileAds.initialize(this, initStatus -> {});
        adsInterface.startLoading();
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
