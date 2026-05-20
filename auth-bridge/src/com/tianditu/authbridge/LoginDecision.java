package com.tianditu.authbridge;

public final class LoginDecision {
  public enum Type {
    ISSUE_SIGNED_COOKIE,
    ERROR
  }

  private final Type type;
  private final AuthBridgeUser user;
  private final String message;

  private LoginDecision(Type type, AuthBridgeUser user, String message) {
    this.type = type;
    this.user = user;
    this.message = message;
  }

  public static LoginDecision issueSignedCookie(AuthBridgeUser user) {
    return new LoginDecision(Type.ISSUE_SIGNED_COOKIE, user, null);
  }

  public static LoginDecision error(String message) {
    return new LoginDecision(Type.ERROR, null, message);
  }

  public Type getType() {
    return type;
  }

  public AuthBridgeUser getUser() {
    return user;
  }

  public String getMessage() {
    return message;
  }
}
