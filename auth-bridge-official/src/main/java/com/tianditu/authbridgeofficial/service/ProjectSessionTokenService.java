package com.tianditu.authbridgeofficial.service;

import com.tianditu.authbridgeofficial.config.BridgeAuthProperties;
import com.tianditu.authbridgeofficial.model.BridgeUser;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.Base64;

@Service
public class ProjectSessionTokenService {
  private final BridgeAuthProperties properties;

  public ProjectSessionTokenService(BridgeAuthProperties properties) {
    this.properties = properties;
  }

  public String sign(BridgeUser user) {
    long nowSeconds = System.currentTimeMillis() / 1000L;
    long exp = nowSeconds + Math.max(60L, properties.getCookieMaxAgeSeconds());
    String payloadJson = toPayloadJson(user, nowSeconds, exp);
    String payloadEncoded = base64UrlEncode(payloadJson.getBytes(StandardCharsets.UTF_8));
    return payloadEncoded + "." + signPayload(payloadEncoded);
  }

  private String toPayloadJson(BridgeUser user, long iat, long exp) {
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

  private String signPayload(String payload) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(properties.getSharedSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      return base64UrlEncode(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
    } catch (GeneralSecurityException ex) {
      throw new IllegalStateException("无法生成项目登录态", ex);
    }
  }

  private String base64UrlEncode(byte[] bytes) {
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  private void appendStringField(StringBuilder json, String key, String value, boolean first) {
    if (value == null || value.trim().isEmpty()) {
      return;
    }
    if (!first && json.length() > 1) {
      json.append(',');
    }
    json.append('"').append(escape(key)).append('"').append(':')
        .append('"').append(escape(value.trim())).append('"');
  }

  private void appendNumberField(StringBuilder json, String key, Number value, boolean first) {
    if (value == null) {
      return;
    }
    if (!first && json.length() > 1) {
      json.append(',');
    }
    json.append('"').append(escape(key)).append('"').append(':').append(value);
  }

  private String escape(String value) {
    return value
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("\r", "\\r")
        .replace("\n", "\\n");
  }
}
