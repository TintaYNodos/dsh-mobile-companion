/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;
import java.util.ArrayList;
import java.util.List;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;


import static com.tintaynodos.dshcompanion.PrefKeys.*;

/**
 * Envio de paquetes magicos Wake-on-LAN.
 */
class WakeOnLan {

    static void sendWakeOnLan(MainActivity a, String macAddress) {
        if (macAddress == null || macAddress.trim().isEmpty()) {
            Toast.makeText(a, "Dirección MAC no configurada", Toast.LENGTH_SHORT).show();
            return;
        }

        final String cleanMac = macAddress.replaceAll("[^0-9A-Fa-f]", "");
        if (cleanMac.length() != 12) {
            Toast.makeText(a, "Dirección MAC inválida (debe contener 12 dígitos hexadecimales)", Toast.LENGTH_SHORT).show();
            return;
        }

        new Thread(() -> {
            try {
                byte[] macBytes = new byte[6];
                for (int i = 0; i < 6; i++) {
                    macBytes[i] = (byte) Integer.parseInt(cleanMac.substring(i * 2, i * 2 + 2), 16);
                }

                byte[] packetData = new byte[102];
                for (int i = 0; i < 6; i++) {
                    packetData[i] = (byte) 0xFF;
                }
                for (int i = 6; i < 102; i += 6) {
                    System.arraycopy(macBytes, 0, packetData, i, 6);
                }

                InetAddress broadcastAddr = InetAddress.getByName("255.255.255.255");
                DatagramPacket packet = new DatagramPacket(packetData, packetData.length, broadcastAddr, 9);
                try (DatagramSocket socket = new DatagramSocket()) {
                    socket.setBroadcast(true);
                    socket.send(packet);
                }

                a.ui.post(() -> {
                    a.vibrateHaptic("confirm");
                    Toast.makeText(a, "Paquete WOL enviado a " + macAddress, Toast.LENGTH_SHORT).show();
                });
            } catch (Exception e) {
                a.ui.post(() -> {
                    a.vibrateHaptic("reject");
                    Toast.makeText(a, "Error al enviar paquete WOL: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                });
            }
        }).start();
    }
}
