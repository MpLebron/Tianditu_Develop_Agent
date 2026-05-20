package com.tianditu.authbridge;

public interface AuthProvider {
  String getMode();

  AuthBridgeUser resolveSignedInUser(String signedToken);

  AuthProviderHealth health();

  LoginDecision login(String redirectPath);
}
