package com.kolamrenang.app;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.Manifest;
import android.content.pm.PackageManager;
import android.util.Log;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.UUID;

import org.json.JSONException;

@CapacitorPlugin(name = "BluetoothPrinter")
public class BluetoothPrinterPlugin extends Plugin {

  private static final String TAG = "BluetoothPrinter";
  private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

  private BluetoothSocket socket;
  private OutputStream outputStream;

  @PluginMethod
  public void listDevices(PluginCall call) {
    BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
    JSArray devices = new JSArray();

    if (adapter == null) {
      call.resolve(new JSObject() {{
        put("devices", devices);
      }});
      return;
    }

    if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT)
        != PackageManager.PERMISSION_GRANTED) {
      call.resolve(new JSObject() {{
        put("devices", devices);
      }});
      return;
    }

    Set<BluetoothDevice> bonded = adapter.getBondedDevices();
    if (bonded != null) {
      for (BluetoothDevice device : bonded) {
        JSObject obj = new JSObject();
        obj.put("name", device.getName());
        obj.put("address", device.getAddress());
        devices.put(obj);
      }
    }

    JSObject result = new JSObject();
    result.put("devices", devices);
    call.resolve(result);
  }

  @PluginMethod
  public void connect(PluginCall call) {
    String address = call.getString("address");
    if (address == null || address.isEmpty()) {
      call.reject("Device address is required");
      return;
    }

    BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
    if (adapter == null) {
      call.reject("Bluetooth not supported");
      return;
    }

    try {
      if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT)
          != PackageManager.PERMISSION_GRANTED) {
        call.reject("BLUETOOTH_CONNECT permission not granted");
        return;
      }

      BluetoothDevice device = adapter.getRemoteDevice(address);
      socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
      socket.connect();
      outputStream = socket.getOutputStream();
      call.resolve();
    } catch (IOException e) {
      Log.e(TAG, "Failed to connect to " + address, e);
      call.reject("Failed to connect: " + e.getMessage());
    }
  }

  @PluginMethod
  public void disconnect(PluginCall call) {
    try {
      if (outputStream != null) {
        outputStream.close();
        outputStream = null;
      }
      if (socket != null) {
        socket.close();
        socket = null;
      }
      call.resolve();
    } catch (IOException e) {
      Log.e(TAG, "Error disconnecting", e);
      call.reject("Error disconnecting: " + e.getMessage());
    }
  }

  @PluginMethod
  public void printText(PluginCall call) {
    String text = call.getString("text");
    if (text == null || text.isEmpty()) {
      call.reject("Text is required");
      return;
    }

    if (outputStream == null) {
      call.reject("Not connected to a printer");
      return;
    }

    try {
      byte[] escPosInit = new byte[]{0x1B, 0x40};
      byte[] escPosCharset = new byte[]{0x1C, 0x21, 0x08};
      byte[] data = (text + "\n\n\n\n\n").getBytes(StandardCharsets.US_ASCII);
      byte[] escPosCut = new byte[]{0x1D, 0x56, 0x00};

      outputStream.write(escPosInit);
      outputStream.write(escPosCharset);
      outputStream.write(data);
      outputStream.write(escPosCut);
      outputStream.flush();

      call.resolve();
    } catch (IOException e) {
      Log.e(TAG, "Failed to print text", e);
      call.reject("Print failed: " + e.getMessage());
    }
  }

  @PluginMethod
  public void printEscPos(PluginCall call) {
    JSArray dataArray = call.getArray("data");
    if (dataArray == null) {
      call.reject("Data array is required");
      return;
    }

    if (outputStream == null) {
      call.reject("Not connected to a printer");
      return;
    }

    try {
      byte[] buffer = new byte[dataArray.length()];
      for (int i = 0; i < dataArray.length(); i++) {
        buffer[i] = (byte) dataArray.getInt(i);
      }
      outputStream.write(buffer);
      outputStream.flush();
      call.resolve();
    } catch (IOException | JSONException e) {
      Log.e(TAG, "ESC/POS print failed", e);
      call.reject("ESC/POS print failed: " + e.getMessage());
    }
  }

  @PluginMethod
  public void isConnected(PluginCall call) {
    JSObject result = new JSObject();
    result.put("connected", socket != null && socket.isConnected());
    call.resolve(result);
  }
}
