package com.pizzaherogaming.wallop;

import android.app.Activity;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.annotation.NonNull;

import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;

/**
 * Bridges the game's window.AndroidAds.* calls (see GameAds in ui.js) to Google
 * AdMob. Rewarded results are delivered back to the WebView via
 * window.__onRewarded(success), exactly the contract the JS expects.
 *
 * Uses Google-provided TEST ad unit IDs — safe to display/click in development.
 * Swap REWARDED_UNIT / INTERSTITIAL_UNIT (and the manifest APPLICATION_ID) for
 * the real Wallop AdMob units before release.
 */
public class AdsInterface {
    private static final String REWARDED_UNIT     = "ca-app-pub-3940256099942544/5224354917";
    private static final String INTERSTITIAL_UNIT = "ca-app-pub-3940256099942544/1033173712";

    private final Activity activity;
    private final WebView webView;
    private RewardedAd rewardedAd;
    private InterstitialAd interstitialAd;

    AdsInterface(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        // Warm up both formats so the first show is instant.
        activity.runOnUiThread(() -> { loadRewarded(); loadInterstitial(); });
    }

    // ===== JS-facing API (matches the GameAds bridge contract) =====

    @JavascriptInterface
    public void showRewarded() { activity.runOnUiThread(this::doShowRewarded); }

    @JavascriptInterface
    public void showInterstitial() { activity.runOnUiThread(this::doShowInterstitial); }

    @JavascriptInterface
    public void preloadInterstitial() {
        activity.runOnUiThread(() -> { if (interstitialAd == null) loadInterstitial(); });
    }

    // ===== internals (all on the UI thread) =====

    private void loadRewarded() {
        RewardedAd.load(activity, REWARDED_UNIT, new AdRequest.Builder().build(),
            new RewardedAdLoadCallback() {
                @Override public void onAdLoaded(@NonNull RewardedAd ad) { rewardedAd = ad; }
                @Override public void onAdFailedToLoad(@NonNull LoadAdError e) { rewardedAd = null; }
            });
    }

    private void loadInterstitial() {
        InterstitialAd.load(activity, INTERSTITIAL_UNIT, new AdRequest.Builder().build(),
            new InterstitialAdLoadCallback() {
                @Override public void onAdLoaded(@NonNull InterstitialAd ad) { interstitialAd = ad; }
                @Override public void onAdFailedToLoad(@NonNull LoadAdError e) { interstitialAd = null; }
            });
    }

    private void doShowRewarded() {
        if (rewardedAd == null) {
            // Not ready: report failure so the game re-enables the button, warm one up.
            deliverReward(false);
            loadRewarded();
            return;
        }
        final boolean[] earned = {false};
        rewardedAd.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override public void onAdDismissedFullScreenContent() {
                deliverReward(earned[0]);
                rewardedAd = null;
                loadRewarded();
            }
            @Override public void onAdFailedToShowFullScreenContent(@NonNull AdError e) {
                deliverReward(false);
                rewardedAd = null;
                loadRewarded();
            }
        });
        rewardedAd.show(activity, rewardItem -> earned[0] = true);
    }

    private void doShowInterstitial() {
        if (interstitialAd == null) { loadInterstitial(); return; }
        interstitialAd.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override public void onAdDismissedFullScreenContent() { interstitialAd = null; loadInterstitial(); }
            @Override public void onAdFailedToShowFullScreenContent(@NonNull AdError e) { interstitialAd = null; loadInterstitial(); }
        });
        interstitialAd.show(activity);
    }

    private void deliverReward(final boolean success) {
        webView.post(() ->
            webView.evaluateJavascript("window.__onRewarded && window.__onRewarded(" + success + ")", null));
    }
}
