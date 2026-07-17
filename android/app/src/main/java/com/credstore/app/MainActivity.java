package com.credstore.app;

import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;
import android.os.Debug;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebStorage;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.security.MessageDigest;
import java.security.KeyStore;
import java.util.Enumeration;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private static final String INSTALL_STATE_PREF = "credstore_install_state";
    private static final String FIRST_INSTALL_TIME_KEY = "first_install_time";
    private static final String BIOMETRIC_KEY_PREFIX = "credstore_bio_";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        clearRestoredStateAfterFreshInstall();

        if (!verifyAppSignature() || !verifyRuntimeEnvironment()) {
            finishAndRemoveTask();
            return;
        }

        Window window = getWindow();
        window.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);

        registerPlugin(CredStoreBiometricPlugin.class);
        registerPlugin(CredStoreBluetoothPlugin.class);
        super.onCreate(savedInstanceState);
        hardenWebViewInputState();
    }

    private void hardenWebViewInputState() {
        try {
            WebView webView = getBridge().getWebView();
            if (webView == null) return;

            webView.setSaveEnabled(false);
            webView.setSaveFromParentEnabled(false);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                webView.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
            }
        } catch (Exception ignored) {
            // Keep startup available if the Capacitor WebView is not ready yet.
        }
    }

    private void clearRestoredStateAfterFreshInstall() {
        try {
            PackageInfo packageInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
            long firstInstallTime = packageInfo.firstInstallTime;
            SharedPreferences installState = getSharedPreferences(INSTALL_STATE_PREF, MODE_PRIVATE);
            long storedFirstInstallTime = installState.getLong(FIRST_INSTALL_TIME_KEY, 0L);

            if (storedFirstInstallTime != 0L && storedFirstInstallTime != firstInstallTime) {
                clearLocalAppState();
            }

            getSharedPreferences(INSTALL_STATE_PREF, MODE_PRIVATE)
                .edit()
                .putLong(FIRST_INSTALL_TIME_KEY, firstInstallTime)
                .apply();
        } catch (Exception ignored) {
            // If install-state inspection fails, keep normal startup behavior.
        }
    }

    private void clearLocalAppState() {
        clearSharedPreferences();
        clearWebViewState();
        clearBiometricKeys();
    }

    private void clearSharedPreferences() {
        File prefsDir = new File(getApplicationInfo().dataDir, "shared_prefs");
        File[] prefFiles = prefsDir.listFiles();
        if (prefFiles == null) return;

        for (File prefFile : prefFiles) {
            String name = prefFile.getName();
            if (!name.endsWith(".xml")) continue;
            String prefName = name.substring(0, name.length() - 4);
            getSharedPreferences(prefName, MODE_PRIVATE).edit().clear().commit();
            prefFile.delete();
        }
    }

    private void clearWebViewState() {
        try {
            WebStorage.getInstance().deleteAllData();
            CookieManager.getInstance().removeAllCookies(null);
            CookieManager.getInstance().flush();
        } catch (Exception ignored) {
            // WebView storage may be unavailable before the engine is initialized.
        }
    }

    private void clearBiometricKeys() {
        try {
            KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
            keyStore.load(null);
            Enumeration<String> aliases = keyStore.aliases();
            while (aliases.hasMoreElements()) {
                String alias = aliases.nextElement();
                if (alias.startsWith(BIOMETRIC_KEY_PREFIX)) keyStore.deleteEntry(alias);
            }
        } catch (Exception ignored) {
            // Keystore cleanup is best-effort.
        }
    }

    private boolean verifyAppSignature() {
        String expected = BuildConfig.EXPECTED_ANDROID_CERT_SHA256;
        if (expected == null || expected.trim().isEmpty()) return true;

        try {
            PackageInfo packageInfo;
            Signature[] signatures;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                packageInfo = getPackageManager().getPackageInfo(getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
                signatures = packageInfo.signingInfo.getApkContentsSigners();
            } else {
                packageInfo = getPackageManager().getPackageInfo(getPackageName(), PackageManager.GET_SIGNATURES);
                signatures = packageInfo.signatures;
            }

            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            String normalizedExpected = expected.replace(":", "").toLowerCase(Locale.US);
            for (Signature signature : signatures) {
                byte[] hashed = digest.digest(signature.toByteArray());
                if (toHex(hashed).equals(normalizedExpected)) return true;
            }
        } catch (Exception ignored) {
            return false;
        }

        return false;
    }

    private boolean verifyRuntimeEnvironment() {
        if (BuildConfig.DEBUG) return true;
        if (Debug.isDebuggerConnected() || Debug.waitingForDebugger()) return false;
        if (readTracerPid() > 0) return false;

        String[] blockedPaths = new String[] {
            "/system/bin/su",
            "/system/xbin/su",
            "/sbin/su",
            "/system/app/Superuser.apk",
            "/system/framework/XposedBridge.jar",
            "/data/local/tmp/frida-server"
        };

        for (String path : blockedPaths) {
            if (new File(path).exists()) return false;
        }

        return true;
    }

    private int readTracerPid() {
        try (BufferedReader reader = new BufferedReader(new FileReader("/proc/self/status"))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (!line.startsWith("TracerPid:")) continue;
                return Integer.parseInt(line.replace("TracerPid:", "").trim());
            }
        } catch (Exception ignored) {
            return 0;
        }
        return 0;
    }

    private String toHex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte item : bytes) {
            builder.append(String.format(Locale.US, "%02x", item));
        }
        return builder.toString();
    }
}
