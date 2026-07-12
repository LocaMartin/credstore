package com.credstore.app;

import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;
import android.os.Debug;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.security.MessageDigest;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
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
