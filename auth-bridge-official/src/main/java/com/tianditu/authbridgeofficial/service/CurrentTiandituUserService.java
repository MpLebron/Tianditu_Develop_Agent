package com.tianditu.authbridgeofficial.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tianditu.authbridgeofficial.config.BridgeAuthProperties;
import com.tianditu.authbridgeofficial.model.BridgeUser;
import cn.gov.tianditu.uss.sdk.TdtServiceClient;
import cn.gov.tianditu.uss.sdk.common.ResponseResult;
import org.jasig.cas.client.authentication.AttributePrincipal;
import org.springframework.stereotype.Service;

import javax.servlet.http.HttpServletRequest;
import java.security.Principal;
import java.util.Collections;
import java.util.Map;
import java.util.Optional;

@Service
public class CurrentTiandituUserService {
  private final BridgeAuthProperties properties;
  private final ObjectMapper objectMapper;

  public CurrentTiandituUserService(BridgeAuthProperties properties, ObjectMapper objectMapper) {
    this.properties = properties;
    this.objectMapper = objectMapper;
  }

  public Optional<BridgeUser> resolveCurrentUser(HttpServletRequest request) {
    Principal principal = request.getUserPrincipal();
    if (principal == null) {
      return Optional.empty();
    }

    Map<String, Object> principalAttributes = principal instanceof AttributePrincipal
        ? ((AttributePrincipal) principal).getAttributes()
        : Collections.<String, Object>emptyMap();

    BridgeUser user = fromPrincipal(principal.getName(), principalAttributes);
    enrichFromUnifiedUserInfo(user);
    return Optional.of(user);
  }

  public Map<String, Object> currentPrincipalAttributes(HttpServletRequest request) {
    Principal principal = request.getUserPrincipal();
    if (!(principal instanceof AttributePrincipal)) {
      return Collections.emptyMap();
    }
    return ((AttributePrincipal) principal).getAttributes();
  }

  private BridgeUser fromPrincipal(String principalName, Map<String, Object> attributes) {
    BridgeUser user = new BridgeUser();
    user.setSub(trimToNull(principalName));
    user.setLoginName(firstNonBlank(
        firstString(attributes, "loginName", "login_name", "username", "userName", "uuid", "id", "sub", "name"),
        trimToNull(principalName)
    ));
    user.setDisplayName(firstNonBlank(
        firstString(attributes, "userRealName", "displayName", "realName", "name"),
        user.getLoginName()
    ));
    user.setEmail(firstString(attributes, "loginEmail", "email"));
    user.setGbcode(firstString(attributes, "userGbcode", "gbcode"));
    user.setCompanyName(firstString(attributes, "companyName"));
    user.setUserType(firstInteger(attributes.get("userType")));
    return user;
  }

  private void enrichFromUnifiedUserInfo(BridgeUser user) {
    if (!properties.isUserInfoLookupEnabled()) {
      return;
    }
    if (isBlank(properties.getSdkAccessKey()) || isBlank(properties.getSdkSecretKey()) || isBlank(user.getSub())) {
      return;
    }

    try {
      TdtServiceClient client = TdtServiceClient.getInstance(properties.getSdkAccessKey(), properties.getSdkSecretKey(), false);
      ResponseResult result = client.findUserInfoByUuid(user.getSub());
      Map<String, Object> payload = objectMapper.convertValue(result.getData(), new TypeReference<Map<String, Object>>() {});
      if (payload == null || payload.isEmpty()) {
        return;
      }

      user.setLoginName(firstNonBlank(user.getLoginName(), stringValue(payload.get("loginName")), stringValue(payload.get("uuid"))));
      user.setDisplayName(firstNonBlank(user.getDisplayName(), stringValue(payload.get("userRealName"))));
      user.setEmail(firstNonBlank(user.getEmail(), stringValue(payload.get("loginEmail"))));
      user.setGbcode(firstNonBlank(user.getGbcode(), stringValue(payload.get("userGbcode"))));
      user.setCompanyName(firstNonBlank(user.getCompanyName(), stringValue(payload.get("companyName"))));
      if (user.getUserType() == null) {
        user.setUserType(firstInteger(payload.get("userType")));
      }
    } catch (Exception ignored) {
      // 真实接入时统一用户信息查询失败不应阻断登录闭环，先保留 principal 降级结果
    }
  }

  private String firstString(Map<String, Object> attributes, String... keys) {
    for (String key : keys) {
      if (!attributes.containsKey(key)) {
        continue;
      }
      String value = stringValue(attributes.get(key));
      if (!isBlank(value)) {
        return value;
      }
    }
    return null;
  }

  private String firstNonBlank(String... values) {
    for (String value : values) {
      if (!isBlank(value)) {
        return value;
      }
    }
    return null;
  }

  private String stringValue(Object value) {
    if (value == null) {
      return null;
    }
    return trimToNull(String.valueOf(value));
  }

  private Integer firstInteger(Object value) {
    if (value == null) {
      return null;
    }
    try {
      return Integer.valueOf(String.valueOf(value).trim());
    } catch (NumberFormatException ex) {
      return null;
    }
  }

  private String trimToNull(String value) {
    if (value == null || value.trim().isEmpty()) {
      return null;
    }
    return value.trim();
  }

  private boolean isBlank(String value) {
    return value == null || value.trim().isEmpty();
  }
}
