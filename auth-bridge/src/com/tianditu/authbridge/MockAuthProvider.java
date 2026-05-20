package com.tianditu.authbridge;

import java.util.LinkedHashMap;
import java.util.Map;

public final class MockAuthProvider implements AuthProvider {
  private final AuthBridgeConfig config;

  public MockAuthProvider(AuthBridgeConfig config) {
    this.config = config;
  }

  public String getMode() {
    return "mock";
  }

  public AuthBridgeUser resolveSignedInUser(String signedToken) {
    return SignedSessionToken.verify(signedToken, config.getSharedSecret());
  }

  public AuthProviderHealth health() {
    Map<String, String> details = new LinkedHashMap<String, String>();
    details.put("loginName", config.getMockUser().getLoginName());
    details.put("displayName", config.getMockUser().getDisplayName());
    details.put("cookieName", config.getCookieName());
    return new AuthProviderHealth("mock", "ready", "本地 mock 登录可用", details);
  }

  public LoginDecision login(String redirectPath) {
    return LoginDecision.issueSignedCookie(config.getMockUser());
  }
}
