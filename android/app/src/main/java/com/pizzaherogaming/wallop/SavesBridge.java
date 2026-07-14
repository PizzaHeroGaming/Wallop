package com.pizzaherogaming.wallop;

import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.SnapshotsClient;
import com.google.android.gms.games.snapshot.Snapshot;
import com.google.android.gms.games.snapshot.SnapshotMetadataChange;

import java.nio.charset.StandardCharsets;

/**
 * Cloud-save bridge over Play Games Services (Saved Games / Snapshots).
 *
 * Design: silent + automatic. PGS v2 auto-attempts sign-in at app start (kicked
 * off by PlayGamesSdk.initialize in MainActivity). We cache the resulting auth
 * state; if the player isn't signed in we no-op silently and the game stays
 * local-only — no prompts, ever.
 *
 * The JS sync layer (js/cloud.js) drives this via window.PlayCloud.*:
 *   - isSignedIn() → gate; JS polls this briefly since auth resolves async
 *   - load()       → reads the cloud snapshot, hands the JSON back to JS via
 *                    window.__onCloudLoad(base64OrNull)
 *   - save(json)   → writes the snapshot (fire-and-forget), result via
 *                    window.__onCloudSaved(bool)
 *
 * Conflict resolution is LAST-WRITE-WINS by a `__savedAt` timestamp carried in
 * the JSON payload — js/cloud.js compares cloud vs local and adopts the newer.
 * The snapshot payload is the whole wallop_profile_v1 JSON (slices, unlocks,
 * boostLevels, arenaProgress, stats, endlessBest, weekly, prefs, …).
 */
public class SavesBridge {
    private static final String TAG = "SavesBridge";
    private static final String SNAPSHOT_NAME = "wallop_save_v1";
    private static final int CONFLICT_POLICY =
        SnapshotsClient.RESOLUTION_POLICY_MOST_RECENTLY_MODIFIED;

    private final BridgeActivity activity;
    private final WebView webView;
    private volatile boolean signedIn = false;

    SavesBridge(BridgeActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        // Cache the auto sign-in result so the synchronous isSignedIn() bridge
        // call can answer the JS layer's poll.
        try {
            PlayGames.getGamesSignInClient(activity).isAuthenticated()
                .addOnCompleteListener(task -> {
                    signedIn = task.isSuccessful() && task.getResult().isAuthenticated();
                    Log.d(TAG, "Play Games authenticated = " + signedIn);
                });
        } catch (Exception e) {
            Log.w(TAG, "Auth check failed: " + e.getMessage());
        }
    }

    @JavascriptInterface
    public boolean isSignedIn() { return signedIn; }

    /** JS: window.PlayCloud.load() → window.__onCloudLoad(base64OrNull) */
    @JavascriptInterface
    public void load() {
        if (!signedIn) { deliverLoad(null); return; }
        activity.runOnUiThread(() -> {
            SnapshotsClient client = PlayGames.getSnapshotsClient(activity);
            client.open(SNAPSHOT_NAME, true, CONFLICT_POLICY)
                .addOnSuccessListener(result -> {
                    Snapshot snapshot = result.getData();
                    if (snapshot == null) { deliverLoad(null); return; }
                    try {
                        byte[] bytes = snapshot.getSnapshotContents().readFully();
                        String json = (bytes != null && bytes.length > 0)
                            ? new String(bytes, StandardCharsets.UTF_8) : null;
                        deliverLoad(json);
                    } catch (Exception e) {
                        Log.w(TAG, "Snapshot read failed: " + e.getMessage());
                        deliverLoad(null);
                    } finally {
                        // Release the lock so a later save() can re-open it.
                        client.discardAndClose(snapshot);
                    }
                })
                .addOnFailureListener(e -> {
                    Log.w(TAG, "Snapshot open (load) failed: " + e.getMessage());
                    deliverLoad(null);
                });
        });
    }

    /** JS: window.PlayCloud.save(rawJson) — writes a snapshot, fire-and-forget. */
    @JavascriptInterface
    public void save(final String json) {
        if (!signedIn) return;
        activity.runOnUiThread(() -> {
            SnapshotsClient client = PlayGames.getSnapshotsClient(activity);
            client.open(SNAPSHOT_NAME, true, CONFLICT_POLICY)
                .addOnSuccessListener(result -> {
                    Snapshot snapshot = result.getData();
                    if (snapshot == null) return;
                    try {
                        snapshot.getSnapshotContents()
                            .writeBytes(json.getBytes(StandardCharsets.UTF_8));
                        SnapshotMetadataChange change = new SnapshotMetadataChange.Builder()
                            .setDescription("Wallop progress")
                            .build();
                        client.commitAndClose(snapshot, change)
                            .addOnSuccessListener(meta -> { Log.d(TAG, "Snapshot saved"); deliverSaved(true); })
                            .addOnFailureListener(e -> { Log.w(TAG, "Commit failed: " + e.getMessage()); deliverSaved(false); });
                    } catch (Exception e) {
                        Log.w(TAG, "Snapshot write failed: " + e.getMessage());
                        deliverSaved(false);
                    }
                })
                .addOnFailureListener(e -> {
                    Log.w(TAG, "Snapshot open (save) failed: " + e.getMessage());
                    deliverSaved(false);
                });
        });
    }

    // Tell JS a save finished, so the cloud-sync indicator can flip.
    private void deliverSaved(final boolean success) {
        activity.runOnUiThread(() -> {
            String js = "if (typeof window.__onCloudSaved === 'function') window.__onCloudSaved(" + success + ");";
            webView.evaluateJavascript(js, null);
        });
    }

    // Hand the snapshot JSON back to JS. Base64-encoded so arbitrary content
    // can't break out of the evaluateJavascript string literal.
    private void deliverLoad(final String json) {
        activity.runOnUiThread(() -> {
            String arg = (json == null) ? "null"
                : "'" + Base64.encodeToString(json.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP) + "'";
            String js = "if (typeof window.__onCloudLoad === 'function') window.__onCloudLoad(" + arg + ");";
            webView.evaluateJavascript(js, null);
        });
    }
}
