package com.pizzaherogaming.wallop;

import android.content.Intent;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.leaderboard.LeaderboardScore;
import com.google.android.gms.games.leaderboard.LeaderboardScoreBuffer;
import com.google.android.gms.games.leaderboard.LeaderboardVariant;

/**
 * Play Games Services bridge for ACHIEVEMENTS + LEADERBOARDS (cloud save lives in
 * SavesBridge). Exposed to the WebView as window.AndroidGames; the game-side
 * src/js/pgs.js wraps it, and src/js/steam.js's platform-neutral trigger layer
 * calls into it. Uses the same silent PGS v2 auth as SavesBridge — no prompts.
 *
 * Async results (score submit rank, leaderboard entries) come back through
 * window.__onPgsResult(token, jsonOrNull), matching the token→resolver map in
 * pgs.js. Achievement unlocks are fire-and-forget.
 */
public class GamesBridge {
    private static final String TAG = "GamesBridge";
    private static final int RC_ACHIEVEMENTS = 9101;
    private static final int RC_LEADERBOARDS = 9102;

    private final BridgeActivity activity;
    private final WebView webView;
    private volatile boolean signedIn = false;
    private volatile String selfPlayerId = null;

    GamesBridge(BridgeActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        try {
            PlayGames.getGamesSignInClient(activity).isAuthenticated()
                .addOnCompleteListener(task -> {
                    signedIn = task.isSuccessful() && task.getResult().isAuthenticated();
                    Log.d(TAG, "Play Games authenticated = " + signedIn);
                    if (signedIn) cacheSelfPlayerId();
                });
        } catch (Exception e) {
            Log.w(TAG, "Auth check failed: " + e.getMessage());
        }
    }

    private void cacheSelfPlayerId() {
        try {
            PlayGames.getPlayersClient(activity).getCurrentPlayer()
                .addOnSuccessListener(player -> {
                    if (player != null) selfPlayerId = player.getPlayerId();
                });
        } catch (Exception e) { /* self-highlight just won't resolve */ }
    }

    @JavascriptInterface
    public boolean isSignedIn() { return signedIn; }

    // ── Achievements (fire-and-forget standard unlocks) ─────────────────────
    @JavascriptInterface
    public void unlock(final String id) {
        if (!signedIn || id == null || id.isEmpty()) return;
        activity.runOnUiThread(() -> {
            try { PlayGames.getAchievementsClient(activity).unlock(id); }
            catch (Exception e) { Log.w(TAG, "unlock failed: " + e.getMessage()); }
        });
    }

    @JavascriptInterface
    public void showAchievements() {
        if (!signedIn) return;
        activity.runOnUiThread(() -> PlayGames.getAchievementsClient(activity)
            .getAchievementsIntent()
            .addOnSuccessListener(intent -> activity.startActivityForResult(intent, RC_ACHIEVEMENTS))
            .addOnFailureListener(e -> Log.w(TAG, "achievements UI failed: " + e.getMessage())));
    }

    @JavascriptInterface
    public void showLeaderboard(final String id) {
        if (!signedIn) return;
        activity.runOnUiThread(() -> {
            com.google.android.gms.tasks.Task<Intent> t = (id == null || id.isEmpty())
                ? PlayGames.getLeaderboardsClient(activity).getAllLeaderboardsIntent()
                : PlayGames.getLeaderboardsClient(activity).getLeaderboardIntent(id);
            t.addOnSuccessListener(intent -> activity.startActivityForResult(intent, RC_LEADERBOARDS))
             .addOnFailureListener(e -> Log.w(TAG, "leaderboard UI failed: " + e.getMessage()));
        });
    }

    // ── Leaderboards: submit + fetch (async via __onPgsResult) ──────────────
    @JavascriptInterface
    public void submitScore(final long token, final String id, final double score, final boolean weekly) {
        if (!signedIn || id == null || id.isEmpty()) { deliver(token, null); return; }
        final int span = weekly ? LeaderboardVariant.TIME_SPAN_WEEKLY : LeaderboardVariant.TIME_SPAN_ALL_TIME;
        activity.runOnUiThread(() -> {
            try {
                PlayGames.getLeaderboardsClient(activity)
                    .submitScoreImmediate(id, (long) score)
                    .addOnCompleteListener(sub ->
                        // Read back the player's current rank so the end screen can show it.
                        PlayGames.getLeaderboardsClient(activity)
                            .loadCurrentPlayerLeaderboardScore(id, span, LeaderboardVariant.COLLECTION_PUBLIC)
                            .addOnSuccessListener(data -> {
                                LeaderboardScore s = data != null ? data.get() : null;
                                long rank = (s != null) ? s.getRank() : -1;
                                deliver(token, "{\"rank\":" + rank + "}");
                            })
                            .addOnFailureListener(e -> deliver(token, "{\"rank\":-1}")));
            } catch (Exception e) {
                Log.w(TAG, "submitScore failed: " + e.getMessage());
                deliver(token, null);
            }
        });
    }

    @JavascriptInterface
    public void fetchLeaderboard(final long token, final String id, final String mode,
                                 final int count, final boolean weekly) {
        if (!signedIn || id == null || id.isEmpty()) { deliver(token, null); return; }
        final int span = weekly ? LeaderboardVariant.TIME_SPAN_WEEKLY : LeaderboardVariant.TIME_SPAN_ALL_TIME;
        final int collection = "friends".equals(mode)
            ? LeaderboardVariant.COLLECTION_FRIENDS : LeaderboardVariant.COLLECTION_PUBLIC;
        activity.runOnUiThread(() -> {
            try {
                PlayGames.getLeaderboardsClient(activity)
                    .loadTopScores(id, span, collection, Math.max(1, Math.min(count, 25)))
                    .addOnSuccessListener(data -> {
                        try {
                            deliver(token, entriesJson(data != null ? data.get() : null));
                        } catch (Exception e) {
                            Log.w(TAG, "parse scores failed: " + e.getMessage());
                            deliver(token, null);
                        }
                    })
                    .addOnFailureListener(e -> { Log.w(TAG, "loadTopScores failed: " + e.getMessage()); deliver(token, null); });
            } catch (Exception e) {
                Log.w(TAG, "fetchLeaderboard failed: " + e.getMessage());
                deliver(token, null);
            }
        });
    }

    // Build { entries:[{rank,score,name,isSelf}] } from a LeaderboardScores buffer.
    // score is the RAW long (pgs.js converts time boards from ms→s on its side).
    private String entriesJson(com.google.android.gms.games.LeaderboardsClient.LeaderboardScores scores) {
        if (scores == null) return "{\"entries\":[]}";
        StringBuilder sb = new StringBuilder("{\"entries\":[");
        LeaderboardScoreBuffer buf = scores.getScores();
        try {
            boolean first = true;
            for (LeaderboardScore s : buf) {
                if (!first) sb.append(',');
                first = false;
                String name = s.getScoreHolderDisplayName();
                boolean isSelf = selfPlayerId != null && s.getScoreHolder() != null
                    && selfPlayerId.equals(s.getScoreHolder().getPlayerId());
                sb.append("{\"rank\":").append(s.getRank())
                  .append(",\"score\":").append(s.getRawScore())
                  .append(",\"name\":\"").append(jsonEscape(name)).append('"')
                  .append(",\"isSelf\":").append(isSelf).append('}');
            }
        } finally {
            try { buf.release(); } catch (Exception e) { /* ignore */ }
            try { scores.release(); } catch (Exception e) { /* ignore */ }
        }
        sb.append("]}");
        return sb.toString();
    }

    private static String jsonEscape(String s) {
        if (s == null) return "";
        StringBuilder o = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' || c == '\\') o.append('\\').append(c);
            else if (c == '\n' || c == '\r' || c == '\t') o.append(' ');
            else if (c < 0x20) { /* drop other control chars */ }
            else o.append(c);
        }
        return o.toString();
    }

    // Hand the result JSON back to pgs.js. Base64-encoded (like SavesBridge) so
    // arbitrary player names can't break out of the JS string literal; pgs.js
    // decodes and JSON.parses. Passes null when there's no result.
    private void deliver(final long token, final String json) {
        activity.runOnUiThread(() -> {
            String arg = (json == null) ? "null"
                : "'" + android.util.Base64.encodeToString(
                      json.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                      android.util.Base64.NO_WRAP) + "'";
            String js = "if (typeof window.__onPgsResult === 'function') window.__onPgsResult(" + token + ", " + arg + ");";
            webView.evaluateJavascript(js, null);
        });
    }
}
