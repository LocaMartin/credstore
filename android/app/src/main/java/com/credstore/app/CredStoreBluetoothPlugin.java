package com.credstore.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothServerSocket;
import android.bluetooth.BluetoothSocket;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(
    name = "CredStoreBluetooth",
    permissions = {
        @Permission(strings = { Manifest.permission.BLUETOOTH }, alias = "bluetooth"),
        @Permission(strings = { Manifest.permission.BLUETOOTH_ADMIN }, alias = "bluetoothAdmin"),
        @Permission(strings = { Manifest.permission.BLUETOOTH_CONNECT }, alias = "bluetoothConnect"),
        @Permission(strings = { Manifest.permission.BLUETOOTH_SCAN }, alias = "bluetoothScan")
    }
)
public class CredStoreBluetoothPlugin extends Plugin {
    private static final String SERVICE_NAME = "CredStoreSync";
    private static final UUID SERVICE_UUID = UUID.fromString("1e89b6a8-0f62-4ce8-9478-83d94d4aa83a");
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private BluetoothServerSocket serverSocket;

    @PluginMethod
    public void requestBluetoothPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || hasConnectPermission()) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }

        requestPermissionForAliases(
            new String[] { "bluetoothConnect", "bluetoothScan" },
            call,
            "bluetoothPermissionsCallback"
        );
    }

    @PermissionCallback
    private void bluetoothPermissionsCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", hasConnectPermission());
        call.resolve(result);
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        JSObject result = new JSObject();
        result.put("available", adapter != null && adapter.isEnabled() && hasConnectPermission());
        result.put("code", adapter == null ? "NO_HARDWARE" : adapter.isEnabled() ? "AVAILABLE" : "DISABLED");
        call.resolve(result);
    }

    @PluginMethod
    public void listBondedDevices(PluginCall call) {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            call.reject("Bluetooth hardware is not available");
            return;
        }
        if (!hasConnectPermission()) {
            call.reject("Bluetooth connect permission is not granted");
            return;
        }

        JSArray devices = new JSArray();
        Set<BluetoothDevice> bondedDevices = adapter.getBondedDevices();
        for (BluetoothDevice device : bondedDevices) {
            JSObject item = new JSObject();
            item.put("id", device.getAddress());
            item.put("name", device.getName());
            devices.put(item);
        }

        JSObject response = new JSObject();
        response.put("devices", devices);
        call.resolve(response);
    }

    @PluginMethod
    public void startReceiver(PluginCall call) {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !adapter.isEnabled()) {
            call.reject("Bluetooth is not enabled");
            return;
        }
        if (!hasConnectPermission()) {
            call.reject("Bluetooth connect permission is not granted");
            return;
        }

        executor.execute(() -> {
            try {
                closeServerSocket();
                serverSocket = adapter.listenUsingRfcommWithServiceRecord(SERVICE_NAME, SERVICE_UUID);
                BluetoothSocket socket = serverSocket.accept();
                InputStream input = socket.getInputStream();
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                byte[] chunk = new byte[4096];
                int read;
                while ((read = input.read(chunk)) != -1) {
                    buffer.write(chunk, 0, read);
                }
                socket.close();
                closeServerSocket();

                JSObject response = new JSObject();
                response.put("payload", buffer.toString(StandardCharsets.UTF_8.name()));
                call.resolve(response);
            } catch (Exception error) {
                call.reject("Bluetooth receive failed", error);
            }
        });
    }

    @PluginMethod
    public void sendPayload(PluginCall call) {
        String deviceId = call.getString("deviceId");
        String payload = call.getString("payload");

        if (deviceId == null || payload == null) {
            call.reject("deviceId and payload are required");
            return;
        }

        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !adapter.isEnabled()) {
            call.reject("Bluetooth is not enabled");
            return;
        }
        if (!hasConnectPermission()) {
            call.reject("Bluetooth connect permission is not granted");
            return;
        }

        executor.execute(() -> {
            try {
                BluetoothDevice device = adapter.getRemoteDevice(deviceId);
                BluetoothSocket socket = device.createRfcommSocketToServiceRecord(SERVICE_UUID);
                adapter.cancelDiscovery();
                socket.connect();
                OutputStream output = socket.getOutputStream();
                output.write(payload.getBytes(StandardCharsets.UTF_8));
                output.flush();
                socket.close();
                call.resolve();
            } catch (Exception error) {
                call.reject("Bluetooth send failed", error);
            }
        });
    }

    @PluginMethod
    public void stopReceiver(PluginCall call) {
        closeServerSocket();
        call.resolve();
    }

    private boolean hasConnectPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        return ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    private void closeServerSocket() {
        if (serverSocket == null) return;
        try {
            serverSocket.close();
        } catch (Exception ignored) {
        }
        serverSocket = null;
    }
}
