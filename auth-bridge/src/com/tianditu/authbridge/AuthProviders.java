package com.tianditu.authbridge;

public final class AuthProviders {
  private AuthProviders() {
  }

  public static AuthProvider create(AuthBridgeConfig config) {
    if ("official-sdk".equalsIgnoreCase(config.getMode())) {
      return new OfficialSdkAuthProvider(config);
    }
    return new MockAuthProvider(config);
  }
}
