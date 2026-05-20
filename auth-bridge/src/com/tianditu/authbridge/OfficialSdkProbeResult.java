package com.tianditu.authbridge;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class OfficialSdkProbeResult {
  private final String status;
  private final String message;
  private final Map<String, String> details;

  public OfficialSdkProbeResult(String status, String message, Map<String, String> details) {
    this.status = status;
    this.message = message;
    this.details = details == null ? new LinkedHashMap<String, String>() : new LinkedHashMap<String, String>(details);
  }

  public static OfficialSdkProbeResult missingConfig(String message) {
    return new OfficialSdkProbeResult("missing_config", message, new LinkedHashMap<String, String>());
  }

  public static OfficialSdkProbeResult missingFiles(String message, List<String> missingFiles) {
    Map<String, String> details = new LinkedHashMap<String, String>();
    details.put("missingFiles", join(missingFiles));
    return new OfficialSdkProbeResult("missing_files", message, details);
  }

  public static OfficialSdkProbeResult readyNoCredentials(String sdkJarPath, int classpathCount) {
    Map<String, String> details = new LinkedHashMap<String, String>();
    details.put("sdkJarPath", sdkJarPath);
    details.put("classpathEntries", String.valueOf(classpathCount));
    return new OfficialSdkProbeResult("ready_no_credentials", "SDK 依赖已补齐，但尚未配置 AK/SK", details);
  }

  public static OfficialSdkProbeResult readyNeedsLoginContext(String sdkJarPath, int classpathCount, String rawMessage) {
    Map<String, String> details = new LinkedHashMap<String, String>();
    details.put("sdkJarPath", sdkJarPath);
    details.put("classpathEntries", String.valueOf(classpathCount));
    details.put("sdkMessage", rawMessage);
    return new OfficialSdkProbeResult("needs_login_context", "SDK 已能加载，但当前轻量 bridge 缺少官方要求的登录上下文", details);
  }

  public static OfficialSdkProbeResult failure(String sdkJarPath, int classpathCount, String rawMessage) {
    Map<String, String> details = new LinkedHashMap<String, String>();
    details.put("sdkJarPath", sdkJarPath);
    details.put("classpathEntries", String.valueOf(classpathCount));
    details.put("sdkMessage", rawMessage);
    return new OfficialSdkProbeResult("probe_failed", "SDK 探测失败", details);
  }

  public static OfficialSdkProbeResult ready(String sdkJarPath, int classpathCount, String rawMessage) {
    Map<String, String> details = new LinkedHashMap<String, String>();
    details.put("sdkJarPath", sdkJarPath);
    details.put("classpathEntries", String.valueOf(classpathCount));
    if (rawMessage != null) {
      details.put("sdkMessage", rawMessage);
    }
    return new OfficialSdkProbeResult("ready", "SDK 探测通过", details);
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

  private static String join(List<String> values) {
    StringBuilder builder = new StringBuilder();
    for (int i = 0; i < values.size(); i += 1) {
      if (i > 0) {
        builder.append(" | ");
      }
      builder.append(values.get(i));
    }
    return builder.toString();
  }
}
