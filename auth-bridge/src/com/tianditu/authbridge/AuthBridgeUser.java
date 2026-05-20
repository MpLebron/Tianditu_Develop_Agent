package com.tianditu.authbridge;

public final class AuthBridgeUser {
  private final String sub;
  private final String loginName;
  private final String displayName;
  private final String email;
  private final String gbcode;
  private final String companyName;
  private final Integer userType;

  public AuthBridgeUser(
      String sub,
      String loginName,
      String displayName,
      String email,
      String gbcode,
      String companyName,
      Integer userType
  ) {
    this.sub = sub;
    this.loginName = loginName;
    this.displayName = displayName;
    this.email = email;
    this.gbcode = gbcode;
    this.companyName = companyName;
    this.userType = userType;
  }

  public String getSub() {
    return sub;
  }

  public String getLoginName() {
    return loginName;
  }

  public String getDisplayName() {
    return displayName;
  }

  public String getEmail() {
    return email;
  }

  public String getGbcode() {
    return gbcode;
  }

  public String getCompanyName() {
    return companyName;
  }

  public Integer getUserType() {
    return userType;
  }
}
