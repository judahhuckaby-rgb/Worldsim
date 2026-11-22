package com.worldsim.ages;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Self-updater: downloads a newer APK from GitHub Releases and hands it to the system installer.
 * The user confirms the install; Android keeps app data because every build shares one signing key.
 */
@CapacitorPlugin(name = "AppUpdater")
public class UpdaterPlugin extends Plugin {

    @PluginMethod
    public void getVersion(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            PackageInfo p = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            ret.put("versionName", p.versionName);
            ret.put("versionCode", Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode);
        } catch (Exception e) {
            ret.put("versionName", "0");
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject ret = new JSObject();
        boolean ok = Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls();
        ret.put("allowed", ok);
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 26) {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        final String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) {
            call.reject("A https download URL is required");
            return;
        }
        call.setKeepAlive(true);
        new Thread(() -> {
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists()) dir.mkdirs();
                File apk = new File(dir, "WorldSim-Ages-update.apk");
                HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setInstanceFollowRedirects(true);
                conn.setConnectTimeout(20000);
                conn.setReadTimeout(30000);
                conn.connect();
                int code = conn.getResponseCode();
                if (code < 200 || code >= 300) throw new Exception("Download failed (HTTP " + code + ")");
                long total = conn.getContentLengthLong();
                try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(apk)) {
                    byte[] buf = new byte[64 * 1024];
                    long done = 0;
                    int lastPct = -1;
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        done += n;
                        if (total > 0) {
                            int pct = (int) (done * 100 / total);
                            if (pct != lastPct) {
                                lastPct = pct;
                                JSObject ev = new JSObject();
                                ev.put("percent", pct);
                                notifyListeners("progress", ev);
                            }
                        }
                    }
                }
                conn.disconnect();
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent install = new Intent(Intent.ACTION_VIEW);
                install.setDataAndType(uri, "application/vnd.android.package-archive");
                install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(install);
                JSObject ret = new JSObject();
                ret.put("started", true);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "Update failed");
            }
        }).start();
    }
}
