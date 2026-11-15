/*
 * Copyright (c) 2026 Tinta y Nodos / Ismael Muñoz Reyes. All rights reserved.
 * SPDX-License-Identifier: BSL-1.1 OR PolyForm-Noncommercial-1.0.0
 * See LICENSE file in repository root for full terms.
 */
package com.tintaynodos.dshcompanion;

import java.util.Locale;

/**
 * Política de tráfico en claro del cliente.
 *
 * La configuración de seguridad de red de Android solo permite reglas por
 * nombre de host, no por rango de IP: no puede expresar "IP privada sí, IP
 * pública no". Por eso la decisión se toma aquí, en el código, antes de que la
 * WebView cargue nada.
 *
 * Regla: `https` siempre; `http` solo contra el búnker configurado o contra una
 * dirección de red privada/loopback. Cualquier `http` hacia un host público se
 * bloquea.
 *
 * Clase sin dependencias de Android a propósito: así se puede probar con un
 * `java` normal, fuera del dispositivo.
 */
final class CleartextPolicy {

    private CleartextPolicy() {
    }

    /** ¿La URL puede cargarse en claro? */
    static boolean allows(String url, String bunkerHost) {
        if (url == null) return false;
        String value = url.trim();
        if (value.isEmpty()) return false;

        String lower = value.toLowerCase(Locale.ROOT);
        if (lower.startsWith("https://") || lower.startsWith("wss://")) return true;
        if (!lower.startsWith("http://") && !lower.startsWith("ws://")) {
            // other schemes (data:, blob:, about:) no llevan tráfico de red
            return true;
        }

        String host = extractHost(value);
        if (host == null || host.isEmpty()) return false;
        return isPrivateHost(host) || matchesBunker(host, bunkerHost);
    }

    /** Host de una URL http(s), sin puerto ni credenciales. */
    static String extractHost(String url) {
        int schemeEnd = url.indexOf("://");
        if (schemeEnd < 0) return null;
        int start = schemeEnd + 3;
        int end = url.length();
        for (int i = start; i < url.length(); i++) {
            char c = url.charAt(i);
            if (c == '/' || c == '?' || c == '#') {
                end = i;
                break;
            }
        }
        String authority = url.substring(start, end);
        int at = authority.lastIndexOf('@');
        if (at >= 0) authority = authority.substring(at + 1);
        if (authority.startsWith("[")) {
            int close = authority.indexOf(']');
            return close > 0 ? authority.substring(1, close) : null;
        }
        int colon = authority.indexOf(':');
        if (colon >= 0) authority = authority.substring(0, colon);
        return authority;
    }

    /** Rangos privados, loopback y enlaces locales (IPv4 e IPv6). */
    static boolean isPrivateHost(String host) {
        if (host == null) return false;
        String h = host.trim().toLowerCase(Locale.ROOT);
        if (h.isEmpty()) return false;
        if (h.equals("localhost") || h.equals("localhost.localdomain")) return true;

        if (h.contains(":")) {
            // IPv6: loopback, link-local y ULA (fc00::/7)
            return h.equals("::1") || h.startsWith("fe80") || h.startsWith("fc") || h.startsWith("fd");
        }

        String[] parts = h.split("\\.");
        if (parts.length != 4) return false;
        int[] octets = new int[4];
        for (int i = 0; i < 4; i++) {
            if (parts[i].isEmpty() || parts[i].length() > 3) return false;
            try {
                octets[i] = Integer.parseInt(parts[i]);
            } catch (NumberFormatException error) {
                return false;
            }
            if (octets[i] < 0 || octets[i] > 255) return false;
        }

        if (octets[0] == 127) return true;                        // loopback
        if (octets[0] == 10) return true;                         // 10.0.0.0/8
        if (octets[0] == 192 && octets[1] == 168) return true;    // 192.168.0.0/16
        if (octets[0] == 172 && octets[1] >= 16 && octets[1] <= 31) return true; // 172.16/12
        if (octets[0] == 169 && octets[1] == 254) return true;    // link-local
        // CGNAT 100.64.0.0/10 (lo usan algunas VPN y redes de operador)
        if (octets[0] == 100 && octets[1] >= 64 && octets[1] <= 127) return true;
        return false;
    }

    private static boolean matchesBunker(String host, String bunkerHost) {
        if (bunkerHost == null) return false;
        String expected = bunkerHost.trim().toLowerCase(Locale.ROOT);
        return !expected.isEmpty() && host.trim().toLowerCase(Locale.ROOT).equals(expected);
    }
}
