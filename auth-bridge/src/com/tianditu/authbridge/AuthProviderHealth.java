package com.tianditu.authbridge;

import java.util.LinkedHashMap;
import java.util.Map;

public final class AuthProviderHealth {
  private final String mode;
  private final String status;
  private final String message;
  private final Map<String, String> details;

  public AuthProviderHealth(String mode, String status, String message, Map<String, String> details) {
    this.mode = mode;
    this.status = status;
    this.message = message;
    this.details = details == null ? new LinkedHashMap<String, String>() : new LinkedHashMap<String, String>(details);
  }

  public String getMode() {
    return mode;
  }

  public String getStatus() {
    return status;
  }

  public String getMessage() {
    return message;
  }

  public Map<String, String> getDetails() {
    return new LinkedHashMap<String, String>(details);
  }

  public String toJson() {
    StringBuilder json = new StringBuilder();
    json.append('{')
        .append("\"mode\":\"").append(JsonSupport.escape(mode)).append('"')
        .append(",\"status\":\"").append(JsonSupport.escape(status)).append('"')
        .append(",\"message\":\"").append(JsonSupport.escape(message)).append('"')
        .append(",\"details\":").append(JsonSupport.mapToJson(details))
        .append('}');
    return json.toString();
  }
}
