package com.tianditu.authbridgeofficial.model;

public class BridgeUser {
  private String sub;
  private String loginName;
  private String displayName;
  private String email;
  private String gbcode;
  private String companyName;
  private Integer userType;

  public String getSub() {
    return sub;
  }

  public void setSub(String sub) {
    this.sub = sub;
  }

  public String getLoginName() {
    return loginName;
  }

  public void setLoginName(String loginName) {
    this.loginName = loginName;
  }

  public String getDisplayName() {
    return displayName;
  }

  public void setDisplayName(String displayName) {
    this.displayName = displayName;
  }

  public String getEmail() {
    return email;
  }

  public void setEmail(String email) {
    this.email = email;
  }

  public String getGbcode() {
    return gbcode;
  }

  public void setGbcode(String gbcode) {
    this.gbcode = gbcode;
  }

  public String getCompanyName() {
    return companyName;
  }

  public void setCompanyName(String companyName) {
    this.companyName = companyName;
  }

  public Integer getUserType() {
    return userType;
  }

  public void setUserType(Integer userType) {
    this.userType = userType;
  }
}
