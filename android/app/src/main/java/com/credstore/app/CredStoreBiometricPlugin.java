package com.credstore.app;

import android.app.Activity;
import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.Executor;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "CredStoreBiometric")
public class CredStoreBiometricPlugin extends Plugin {
    private static final String KEYSTORE_PROVIDER = "AndroidKeyStore";
    private static final String KEY_PREFIX = "credstore_bio_";
    private static final int AUTHENTICATORS = BiometricManager.Authenticators.BIOMETRIC_STRONG;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        Context context = getContext();
        BiometricManager manager = BiometricManager.from(context);
        JSObject result = new JSObject();
        result.put("available", manager.canAuthenticate(AUTHENTICATORS) == BiometricManager.BIOMETRIC_SUCCESS);
        call.resolve(result);
    }

    @PluginMethod
    public void createSecret(PluginCall call) {
        String slotId = call.getString("slotId");
        String secret = call.getString("secret");

        if (slotId == null || secret == null) {
            call.reject("slotId and secret are required");
            return;
        }

        try {
            Cipher cipher = createCipher(slotId, Cipher.ENCRYPT_MODE, null);
            authenticate(
                "Save biometric master key",
                "Confirm to protect this vault key with your device biometrics.",
                cipher,
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        try {
                            Cipher authedCipher = result.getCryptoObject().getCipher();
                            byte[] encrypted = authedCipher.doFinal(secret.getBytes(StandardCharsets.UTF_8));
                            JSObject response = new JSObject();
                            response.put("encrypted", Base64.encodeToString(encrypted, Base64.NO_WRAP));
                            response.put("iv", Base64.encodeToString(authedCipher.getIV(), Base64.NO_WRAP));
                            call.resolve(response);
                        } catch (Exception error) {
                            call.reject("Unable to encrypt biometric secret", error);
                        }
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                        call.reject(errString.toString());
                    }
                }
            );
        } catch (Exception error) {
            call.reject("Unable to create biometric key", error);
        }
    }

    @PluginMethod
    public void getSecret(PluginCall call) {
        String slotId = call.getString("slotId");
        String encrypted = call.getString("encrypted");
        String iv = call.getString("iv");

        if (slotId == null || encrypted == null || iv == null) {
            call.reject("slotId, encrypted, and iv are required");
            return;
        }

        try {
            Cipher cipher = createCipher(slotId, Cipher.DECRYPT_MODE, Base64.decode(iv, Base64.NO_WRAP));
            authenticate(
                "Unlock CredStore",
                "Confirm to unlock this vault with your biometric master key.",
                cipher,
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        try {
                            Cipher authedCipher = result.getCryptoObject().getCipher();
                            byte[] decrypted = authedCipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP));
                            JSObject response = new JSObject();
                            response.put("secret", new String(decrypted, StandardCharsets.UTF_8));
                            call.resolve(response);
                        } catch (Exception error) {
                            call.reject("Unable to decrypt biometric secret", error);
                        }
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                        call.reject(errString.toString());
                    }
                }
            );
        } catch (Exception error) {
            call.reject("Unable to open biometric key", error);
        }
    }

    private void authenticate(
        String title,
        String subtitle,
        Cipher cipher,
        BiometricPrompt.AuthenticationCallback callback
    ) {
        Activity bridgeActivity = getActivity();
        if (!(bridgeActivity instanceof FragmentActivity)) {
            throw new IllegalStateException("Biometric prompt requires a FragmentActivity");
        }

        FragmentActivity activity = (FragmentActivity) bridgeActivity;
        Executor executor = ContextCompat.getMainExecutor(activity);
        BiometricPrompt prompt = new BiometricPrompt(activity, executor, callback);
        BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setAllowedAuthenticators(AUTHENTICATORS)
            .setNegativeButtonText("Cancel")
            .build();

        prompt.authenticate(promptInfo, new BiometricPrompt.CryptoObject(cipher));
    }

    private Cipher createCipher(String slotId, int mode, byte[] iv) throws Exception {
        SecretKey key = getOrCreateSecretKey(KEY_PREFIX + slotId);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");

        if (mode == Cipher.ENCRYPT_MODE) {
            cipher.init(mode, key);
        } else {
            cipher.init(mode, key, new GCMParameterSpec(128, iv));
        }

        return cipher;
    }

    private SecretKey getOrCreateSecretKey(String alias) throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
        keyStore.load(null);

        if (keyStore.containsAlias(alias)) {
            return (SecretKey) keyStore.getKey(alias, null);
        }

        KeyGenerator keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER);
        KeyGenParameterSpec keySpec = new KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(false)
            .build();

        keyGenerator.init(keySpec);
        return keyGenerator.generateKey();
    }
}
