package com.tianditu.authbridge;

import java.util.Map;

public final class JsonSupport {
  private JsonSupport() {
  }

  public static String escape(String value) {
    if (value == null) {
      return "";
    }
    return value
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("\r", "\\r")
        .replace("\n", "\\n");
  }

  public static void appendStringField(StringBuilder json, String key, String value, boolean first) {
    if (value == null || value.trim().isEmpty()) {
      return;
    }
    if (!first && json.length() > 1) {
      json.append(',');
    }
    json.append('"').append(escape(key)).append('"').append(':')
        .append('"').append(escape(value.trim())).append('"');
  }

  public static void appendNumberField(StringBuilder json, String key, Number value, boolean first) {
    if (value == null) {
      return;
    }
    if (!first && json.length() > 1) {
      json.append(',');
    }
    json.append('"').append(escape(key)).append('"').append(':').append(value);
  }

  public static String mapToJson(Map<String, String> values) {
    StringBuilder json = new StringBuilder();
    json.append('{');
    boolean first = true;
    for (Map.Entry<String, String> entry : values.entrySet()) {
      if (!first) {
        json.append(',');
      }
      json.append('"').append(escape(entry.getKey())).append('"').append(':');
      if (entry.getValue() == null) {
        json.append("null");
      } else {
        json.append('"').append(escape(entry.getValue())).append('"');
      }
      first = false;
    }
    json.append('}');
    return json.toString();
  }
}
