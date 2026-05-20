package com.tianditu.authbridge;

import java.util.LinkedHashMap;
import java.util.Map;

public final class OfficialSdkAuthProvider implements AuthProvider {
  private final AuthBridgeConfig config;

  public OfficialSdkAuthProvider(AuthBridgeConfig config) {
    this.config = config;
  }

  public String getMode() {
    return "official-sdk";
  }

  public AuthBridgeUser resolveSignedInUser(String signedToken) {
    return SignedSessionToken.verify(signedToken, config.getSharedSecret());
  }

  public AuthProviderHealth health() {
    OfficialSdkProbeResult probe = OfficialSdkProbe.run(config);
    Map<String, String> details = new LinkedHashMap<String, String>(probe.getDetails());
    details.put("sdkJarPath", config.getSdkJarPath());
    details.put("sdkAutoDetectLocalDeps", String.valueOf(config.isSdkAutoDetectLocalDeps()));
    return new AuthProviderHealth("official-sdk", probe.getStatus(), probe.getMessage(), details);
  }

  public LoginDecision login(String redirectPath) {
    OfficialSdkProbeResult probe = OfficialSdkProbe.run(config);
    return LoginDecision.error(
        "official-sdk 模式当前只完成 SDK 探测与依赖校验，尚未在这个纯 HttpServer bridge 中完成官方 CAS 登录链路。"
            + " 当前探测状态: " + probe.getStatus()
            + "；" + probe.getMessage()
    );
  }
}
