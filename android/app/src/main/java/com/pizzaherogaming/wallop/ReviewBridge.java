package com.pizzaherogaming.wallop;

import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;

/**
 * Play In-App Review bridge. Exposed to the WebView as window.PlayReview; the
 * game-side src/js/review.js decides WHEN to ask (see its gating rules) and this
 * class just runs the flow.
 *
 * Google throttles this API hard — a request often shows nothing at all, and the
 * API deliberately gives NO signal about whether the card appeared or whether the
 * player rated. That's by design (it stops apps from rewarding reviews), so:
 *   - never gate gameplay or a reward on the result
 *   - never pre-prompt ("enjoying the game?") to filter who sees it — that's a
 *     policy violation, the card must be shown unconditionally
 * The onComplete callback fires whether or not anything was displayed; we only use
 * it to let JS record "we spent an ask" so our own cooldown advances.
 */
public class ReviewBridge {
    private static final String TAG = "ReviewBridge";

    private final BridgeActivity activity;
    private final WebView webView;
    private final ReviewManager manager;

    ReviewBridge(BridgeActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.manager = ReviewManagerFactory.create(activity);
    }

    /** True on Android where the Play Store can host the flow. JS uses this to
     *  skip its own bookkeeping entirely off-platform. */
    @JavascriptInterface
    public boolean isAvailable() { return true; }

    /**
     * Ask Play to show the in-app review card. Fire-and-forget from JS's point of
     * view; resolves back through window.__onReviewDone() so review.js can stamp
     * its cooldown exactly once per real attempt.
     */
    @JavascriptInterface
    public void requestReview() {
        try {
            manager.requestReviewFlow().addOnCompleteListener(request -> {
                if (!request.isSuccessful()) {
                    Log.w(TAG, "requestReviewFlow failed: " + request.getException());
                    notifyDone();
                    return;
                }
                ReviewInfo info = request.getResult();
                // launchReviewFlow must run on the UI thread — the Play task
                // callback is not guaranteed to be on it.
                activity.runOnUiThread(() -> {
                    try {
                        manager.launchReviewFlow(activity, info)
                            .addOnCompleteListener(flow -> notifyDone());
                    } catch (Exception e) {
                        Log.w(TAG, "launchReviewFlow threw: " + e.getMessage());
                        notifyDone();
                    }
                });
            });
        } catch (Exception e) {
            Log.w(TAG, "requestReview threw: " + e.getMessage());
            notifyDone();
        }
    }

    private void notifyDone() {
        webView.post(() -> {
            try { webView.evaluateJavascript("window.__onReviewDone && window.__onReviewDone();", null); }
            catch (Exception e) { /* WebView gone — nothing to record */ }
        });
    }
}
