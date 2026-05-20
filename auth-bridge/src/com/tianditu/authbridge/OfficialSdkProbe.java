package com.tianditu.authbridge;

import java.io.File;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.net.URL;
import java.net.URLClassLoader;
import java.util.ArrayList;
import java.util.List;

public final class OfficialSdkProbe {
  private OfficialSdkProbe() {
  }

  public static OfficialSdkProbeResult run(AuthBridgeConfig config) {
    if (config.getSdkJarPath() == null || config.getSdkJarPath().trim().isEmpty()) {
      return OfficialSdkProbeResult.missingConfig("未配置 AUTH_BRIDGE_SDK_JAR");
    }

    List<File> classpathFiles = OfficialSdkClasspathResolver.resolve(config);
    List<String> missingFiles = new ArrayList<String>();
    List<URL> urls = new ArrayList<URL>();

    for (File file : classpathFiles) {
      if (!file.exists() || !file.isFile()) {
        missingFiles.add(file.getAbsolutePath());
        continue;
      }
      try {
        urls.add(file.toURI().toURL());
      } catch (Exception ex) {
        missingFiles.add(file.getAbsolutePath());
      }
    }

    if (!missingFiles.isEmpty()) {
      return OfficialSdkProbeResult.missingFiles("官方 SDK 运行依赖不完整", missingFiles);
    }

    if (config.getSdkAccessKey() == null || config.getSdkAccessKey().trim().isEmpty()
        || config.getSdkSecretKey() == null || config.getSdkSecretKey().trim().isEmpty()) {
      return OfficialSdkProbeResult.readyNoCredentials(config.getSdkJarPath(), urls.size());
    }

    URLClassLoader loader = null;
    try {
      loader = new URLClassLoader(urls.toArray(new URL[urls.size()]), OfficialSdkProbe.class.getClassLoader());
      Class<?> clientClass = Class.forName("cn.gov.tianditu.uss.sdk.TdtServiceClient", true, loader);
      Method getInstance = clientClass.getMethod("getInstance", String.class, String.class, boolean.class);
      Object client = getInstance.invoke(null, config.getSdkAccessKey(), config.getSdkSecretKey(), Boolean.FALSE);
      Method auth = clientClass.getMethod("auth");
      Object result = auth.invoke(client);
      return OfficialSdkProbeResult.ready(config.getSdkJarPath(), urls.size(), result == null ? null : result.toString());
    } catch (InvocationTargetException ex) {
      Throwable cause = ex.getTargetException() == null ? ex : ex.getTargetException();
      String message = cause.getMessage() == null ? cause.toString() : cause.getMessage();
      if (message.contains("登陆认证系统") || message.contains("登录认证系统")) {
        return OfficialSdkProbeResult.readyNeedsLoginContext(config.getSdkJarPath(), urls.size(), message);
      }
      return OfficialSdkProbeResult.failure(config.getSdkJarPath(), urls.size(), message);
    } catch (Throwable ex) {
      String message = ex.getMessage() == null ? ex.toString() : ex.getMessage();
      return OfficialSdkProbeResult.failure(config.getSdkJarPath(), urls.size(), message);
    } finally {
      if (loader != null) {
        try {
          loader.close();
        } catch (Exception ignored) {
          // ignore
        }
      }
    }
  }
}
