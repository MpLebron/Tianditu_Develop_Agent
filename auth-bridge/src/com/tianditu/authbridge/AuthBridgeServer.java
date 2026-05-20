package com.tianditu.authbridge;

import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

public final class AuthBridgeServer {
  private final AuthBridgeConfig config;
  private final AuthProvider provider;

  private AuthBridgeServer(AuthBridgeConfig config, AuthProvider provider) {
    this.config = config;
    this.provider = provider;
  }

  public static void main(String[] args) throws Exception {
    AuthBridgeConfig config = AuthBridgeConfig.fromEnv();
    AuthProvider provider = AuthProviders.create(config);
    AuthBridgeServer server = new AuthBridgeServer(config, provider);
    server.start();
  }

  private void start() throws IOException {
    HttpServer server = HttpServer.create(new InetSocketAddress(config.getPort()), 0);
    server.createContext("/sso/login", new LoginHandler());
    server.createContext("/sso/logout", new LogoutHandler());
    server.createContext("/sso/me", new MeHandler());
    server.createContext("/sso/health", new HealthHandler());
    server.setExecutor(null);
    server.start();

    System.out.println("[auth-bridge] listening on http://localhost:" + config.getPort());
    System.out.println("[auth-bridge] mode: " + provider.getMode());
  }

  private final class LoginHandler implements HttpHandler {
    public void handle(HttpExchange exchange) throws IOException {
      if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
        writeJson(exchange, 405, "{\"success\":false,\"error\":\"Method Not Allowed\"}");
        return;
      }

      Map<String, String> query = parseQuery(exchange.getRequestURI().getRawQuery());
      String redirect = normalizeRedirectPath(query.get("redirect"), "/workspace");
      LoginDecision decision = provider.login(redirect);
      if (decision.getType() == LoginDecision.Type.ERROR) {
        writeHtml(exchange, 503, renderProviderErrorPage("统一登录暂不可用", decision.getMessage(), redirect));
        return;
      }

      String token = SignedSessionToken.sign(decision.getUser(), config.getSharedSecret(), config.getCookieMaxAgeSeconds());

      Headers headers = exchange.getResponseHeaders();
      headers.add("Set-Cookie", buildSessionCookie(token));
      headers.add("Location", redirect);
      exchange.sendResponseHeaders(302, -1);
      exchange.close();
    }
  }

  private final class LogoutHandler implements HttpHandler {
    public void handle(HttpExchange exchange) throws IOException {
      if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
        writeJson(exchange, 405, "{\"success\":false,\"error\":\"Method Not Allowed\"}");
        return;
      }

      Map<String, String> query = parseQuery(exchange.getRequestURI().getRawQuery());
      String redirect = normalizeRedirectPath(query.get("redirect"), "/");

      Headers headers = exchange.getResponseHeaders();
      headers.add("Set-Cookie", buildExpiredCookie());
      headers.add("Location", redirect);
      exchange.sendResponseHeaders(302, -1);
      exchange.close();
    }
  }

  private final class MeHandler implements HttpHandler {
    public void handle(HttpExchange exchange) throws IOException {
      if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
        writeJson(exchange, 405, "{\"success\":false,\"error\":\"Method Not Allowed\"}");
        return;
      }

      Map<String, String> cookies = parseCookies(exchange.getRequestHeaders().getFirst("Cookie"));
      AuthBridgeUser user = provider.resolveSignedInUser(cookies.get(config.getCookieName()));
      String body = "{\"success\":true,\"data\":{"
          + "\"authenticated\":" + (user != null)
          + ",\"user\":" + (user != null ? toUserJson(user) : "null")
          + "}}";
      writeJson(exchange, 200, body);
    }
  }

  private final class HealthHandler implements HttpHandler {
    public void handle(HttpExchange exchange) throws IOException {
      if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
        writeJson(exchange, 405, "{\"success\":false,\"error\":\"Method Not Allowed\"}");
        return;
      }
      AuthProviderHealth health = provider.health();
      writeJson(exchange, 200, "{\"success\":true,\"data\":{\"status\":\"ok\",\"provider\":" + health.toJson() + "}}");
    }
  }

  private void writeJson(HttpExchange exchange, int statusCode, String body) throws IOException {
    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
    Headers headers = exchange.getResponseHeaders();
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set("Cache-Control", "no-store");
    exchange.sendResponseHeaders(statusCode, bytes.length);
    OutputStream outputStream = exchange.getResponseBody();
    outputStream.write(bytes);
    outputStream.flush();
    outputStream.close();
  }

  private void writeHtml(HttpExchange exchange, int statusCode, String body) throws IOException {
    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
    Headers headers = exchange.getResponseHeaders();
    headers.set("Content-Type", "text/html; charset=utf-8");
    headers.set("Cache-Control", "no-store");
    exchange.sendResponseHeaders(statusCode, bytes.length);
    OutputStream outputStream = exchange.getResponseBody();
    outputStream.write(bytes);
    outputStream.flush();
    outputStream.close();
  }

  private String buildSessionCookie(String token) {
    StringBuilder cookie = new StringBuilder();
    cookie.append(config.getCookieName()).append('=').append(token)
        .append("; Path=/")
        .append("; HttpOnly")
        .append("; SameSite=Lax")
        .append("; Max-Age=").append(config.getCookieMaxAgeSeconds());
    if (config.isCookieSecure()) {
      cookie.append("; Secure");
    }
    if (config.getCookieDomain() != null && !config.getCookieDomain().trim().isEmpty()) {
      cookie.append("; Domain=").append(config.getCookieDomain().trim());
    }
    return cookie.toString();
  }

  private String buildExpiredCookie() {
    StringBuilder cookie = new StringBuilder();
    cookie.append(config.getCookieName()).append("=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=")
        .append(httpDate(0L));
    if (config.isCookieSecure()) {
      cookie.append("; Secure");
    }
    if (config.getCookieDomain() != null && !config.getCookieDomain().trim().isEmpty()) {
      cookie.append("; Domain=").append(config.getCookieDomain().trim());
    }
    return cookie.toString();
  }

  private static String toUserJson(AuthBridgeUser user) {
    StringBuilder json = new StringBuilder();
    json.append('{');
    JsonSupport.appendStringField(json, "sub", user.getSub(), true);
    JsonSupport.appendStringField(json, "loginName", user.getLoginName(), false);
    JsonSupport.appendStringField(json, "displayName", user.getDisplayName(), false);
    JsonSupport.appendStringField(json, "email", user.getEmail(), false);
    JsonSupport.appendStringField(json, "gbcode", user.getGbcode(), false);
    JsonSupport.appendStringField(json, "companyName", user.getCompanyName(), false);
    JsonSupport.appendNumberField(json, "userType", user.getUserType(), false);
    json.append('}');
    return json.toString();
  }

  private static String normalizeRedirectPath(String value, String fallback) {
    if (value == null) {
      return fallback;
    }
    String trimmed = value.trim();
    if (trimmed.isEmpty() || !trimmed.startsWith("/") || trimmed.startsWith("//")) {
      return fallback;
    }
    return trimmed;
  }

  private static String renderProviderErrorPage(String title, String message, String redirectPath) {
    String safeTitle = JsonSupport.escape(title);
    String safeMessage = JsonSupport.escape(message);
    String safeRedirect = JsonSupport.escape(redirectPath);
    return "<!DOCTYPE html><html lang=\"zh-CN\"><head><meta charset=\"UTF-8\">"
        + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">"
        + "<title>" + safeTitle + "</title>"
        + "<style>"
        + "body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#0f172a;}"
        + ".wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}"
        + ".card{max-width:720px;width:100%;background:#fff;border:1px solid #e2e8f0;border-radius:24px;padding:32px;box-shadow:0 20px 60px rgba(15,23,42,.08);}"
        + "h1{margin:0 0 12px;font-size:24px;}p{line-height:1.7;color:#475569;}code{background:#f1f5f9;border-radius:8px;padding:2px 6px;}"
        + "a{display:inline-block;margin-top:16px;padding:10px 16px;border-radius:12px;background:#2563eb;color:#fff;text-decoration:none;}"
        + "</style></head><body><div class=\"wrap\"><div class=\"card\"><h1>" + safeTitle + "</h1><p>"
        + safeMessage
        + "</p><p>建议先继续使用 <code>AUTH_BRIDGE_MODE=mock</code> 做联调，或切换到官方要求的 Spring Boot/Servlet 运行形态。</p>"
        + "<a href=\"" + safeRedirect + "\">返回应用</a></div></div></body></html>";
  }

  private static Map<String, String> parseQuery(String rawQuery) {
    Map<String, String> result = new LinkedHashMap<String, String>();
    if (rawQuery == null || rawQuery.trim().isEmpty()) {
      return result;
    }

    String[] parts = rawQuery.split("&");
    for (String part : parts) {
      if (part == null || part.isEmpty()) {
        continue;
      }
      int index = part.indexOf('=');
      String key = index >= 0 ? part.substring(0, index) : part;
      String value = index >= 0 ? part.substring(index + 1) : "";
      result.put(urlDecode(key), urlDecode(value));
    }
    return result;
  }

  private static Map<String, String> parseCookies(String header) {
    Map<String, String> result = new LinkedHashMap<String, String>();
    if (header == null || header.trim().isEmpty()) {
      return result;
    }

    String[] parts = header.split(";");
    for (String part : parts) {
      if (part == null) {
        continue;
      }
      String trimmed = part.trim();
      if (trimmed.isEmpty()) {
        continue;
      }
      int index = trimmed.indexOf('=');
      if (index <= 0) {
        continue;
      }
      String key = trimmed.substring(0, index).trim();
      String value = trimmed.substring(index + 1).trim();
      result.put(key, value);
    }
    return result;
  }

  private static String urlDecode(String value) {
    try {
      return URLDecoder.decode(value, "UTF-8");
    } catch (Exception ex) {
      return value;
    }
  }

  private static String httpDate(long epochMillis) {
    SimpleDateFormat format = new SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss 'GMT'", Locale.US);
    format.setTimeZone(TimeZone.getTimeZone("GMT"));
    return format.format(new Date(epochMillis));
  }
}
