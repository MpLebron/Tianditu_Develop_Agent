package com.tianditu.authbridge;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

public final class SignedSessionToken {
  private SignedSessionToken() {
  }

  public static String sign(AuthBridgeUser user, String secret, long maxAgeSeconds) {
    long nowSeconds = System.currentTimeMillis() / 1000L;
    String payloadJson = toPayloadJson(user, nowSeconds, nowSeconds + Math.max(60L, maxAgeSeconds));
    String encodedPayload = base64UrlEncode(payloadJson.getBytes(StandardCharsets.UTF_8));
    String signature = signPayload(encodedPayload, secret);
    return encodedPayload + "." + signature;
  }

  public static AuthBridgeUser verify(String token, String secret) {
    if (token == null || token.trim().isEmpty() || secret == null || secret.isEmpty()) {
      return null;
    }

    String[] parts = token.trim().split("\\.");
    if (parts.length != 2) {
      return null;
    }

    String encodedPayload = parts[0];
    String actualSignature = parts[1];
    String expectedSignature = signPayload(encodedPayload, secret);
    if (!constantTimeEquals(actualSignature, expectedSignature)) {
      return null;
    }

    String payloadJson;
    try {
      payloadJson = new String(base64UrlDecode(encodedPayload), StandardCharsets.UTF_8);
    } catch (IllegalArgumentException ex) {
      return null;
    }

    Map<String, String> payload = parseSimpleJsonObject(payloadJson);
    long nowSeconds = System.currentTimeMillis() / 1000L;
    long exp = parseLong(payload.get("exp"), 0L);
    if (exp <= nowSeconds) {
      return null;
    }

    String sub = trimToNull(payload.get("sub"));
    String loginName = trimToNull(payload.get("loginName"));
    if (sub == null || loginName == null) {
      return null;
    }

    return new AuthBridgeUser(
        sub,
        loginName,
        trimToNull(payload.get("displayName")),
        trimToNull(payload.get("email")),
        trimToNull(payload.get("gbcode")),
        trimToNull(payload.get("companyName")),
        parseOptionalInt(payload.get("userType"))
    );
  }

  private static String toPayloadJson(AuthBridgeUser user, long iat, long exp) {
    StringBuilder json = new StringBuilder();
    json.append('{');
    appendStringField(json, "sub", user.getSub(), true);
    appendStringField(json, "loginName", user.getLoginName(), false);
    appendStringField(json, "displayName", user.getDisplayName(), false);
    appendStringField(json, "email", user.getEmail(), false);
    appendStringField(json, "gbcode", user.getGbcode(), false);
    appendStringField(json, "companyName", user.getCompanyName(), false);
    appendNumberField(json, "userType", user.getUserType(), false);
    appendNumberField(json, "iat", iat, false);
    appendNumberField(json, "exp", exp, false);
    json.append('}');
    return json.toString();
  }

  private static void appendStringField(StringBuilder json, String key, String value, boolean first) {
    if (value == null || value.trim().isEmpty()) {
      return;
    }
    if (!first && json.length() > 1) {
      json.append(',');
    }
    json.append('"').append(escapeJson(key)).append('"').append(':')
        .append('"').append(escapeJson(value.trim())).append('"');
  }

  private static void appendNumberField(StringBuilder json, String key, Number value, boolean first) {
    if (value == null) {
      return;
    }
    if (!first && json.length() > 1) {
      json.append(',');
    }
    json.append('"').append(escapeJson(key)).append('"').append(':').append(value);
  }

  private static String escapeJson(String value) {
    return value
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("\r", "\\r")
        .replace("\n", "\\n");
  }

  private static String signPayload(String encodedPayload, String secret) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      return base64UrlEncode(mac.doFinal(encodedPayload.getBytes(StandardCharsets.UTF_8)));
    } catch (GeneralSecurityException ex) {
      throw new IllegalStateException("无法生成会话签名", ex);
    }
  }

  private static String base64UrlEncode(byte[] bytes) {
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  private static byte[] base64UrlDecode(String value) {
    return Base64.getUrlDecoder().decode(value);
  }

  private static boolean constantTimeEquals(String left, String right) {
    byte[] leftBytes = left.getBytes(StandardCharsets.UTF_8);
    byte[] rightBytes = right.getBytes(StandardCharsets.UTF_8);
    if (leftBytes.length != rightBytes.length) {
      return false;
    }
    int diff = 0;
    for (int i = 0; i < leftBytes.length; i += 1) {
      diff |= leftBytes[i] ^ rightBytes[i];
    }
    return diff == 0;
  }

  private static Map<String, String> parseSimpleJsonObject(String json) {
    Map<String, String> result = new LinkedHashMap<String, String>();
    String source = json == null ? "" : json.trim();
    if (source.length() < 2 || source.charAt(0) != '{' || source.charAt(source.length() - 1) != '}') {
      return result;
    }

    int i = 1;
    while (i < source.length() - 1) {
      char current = source.charAt(i);
      if (current == ',' || Character.isWhitespace(current)) {
        i += 1;
        continue;
      }
      if (current != '"') {
        break;
      }

      int keyEnd = findStringEnd(source, i + 1);
      if (keyEnd < 0) {
        break;
      }
      String key = unescapeJson(source.substring(i + 1, keyEnd));
      i = keyEnd + 1;
      while (i < source.length() && Character.isWhitespace(source.charAt(i))) {
        i += 1;
      }
      if (i >= source.length() || source.charAt(i) != ':') {
        break;
      }
      i += 1;
      while (i < source.length() && Character.isWhitespace(source.charAt(i))) {
        i += 1;
      }
      if (i >= source.length()) {
        break;
      }

      String value;
      if (source.charAt(i) == '"') {
        int valueEnd = findStringEnd(source, i + 1);
        if (valueEnd < 0) {
          break;
        }
        value = unescapeJson(source.substring(i + 1, valueEnd));
        i = valueEnd + 1;
      } else {
        int valueEnd = i;
        while (valueEnd < source.length() && source.charAt(valueEnd) != ',' && source.charAt(valueEnd) != '}') {
          valueEnd += 1;
        }
        value = source.substring(i, valueEnd).trim();
        i = valueEnd;
      }

      result.put(key, value);
    }

    return result;
  }

  private static int findStringEnd(String source, int start) {
    boolean escaped = false;
    for (int i = start; i < source.length(); i += 1) {
      char c = source.charAt(i);
      if (escaped) {
        escaped = false;
      } else if (c == '\\') {
        escaped = true;
      } else if (c == '"') {
        return i;
      }
    }
    return -1;
  }

  private static String unescapeJson(String value) {
    return value
        .replace("\\n", "\n")
        .replace("\\r", "\r")
        .replace("\\\"", "\"")
        .replace("\\\\", "\\");
  }

  private static String trimToNull(String value) {
    if (value == null || value.trim().isEmpty()) {
      return null;
    }
    return value.trim();
  }

  private static long parseLong(String value, long defaultValue) {
    if (value == null || value.trim().isEmpty()) {
      return defaultValue;
    }
    try {
      return Long.parseLong(value.trim());
    } catch (NumberFormatException ex) {
      return defaultValue;
    }
  }

  private static Integer parseOptionalInt(String value) {
    if (value == null || value.trim().isEmpty()) {
      return null;
    }
    try {
      return Integer.valueOf(value.trim());
    } catch (NumberFormatException ex) {
      return null;
    }
  }
}
