package com.kolamrenang.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import com.kolamrenang.app.BluetoothPrinterPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    registerPlugin(BluetoothPrinterPlugin.class);
  }
}
