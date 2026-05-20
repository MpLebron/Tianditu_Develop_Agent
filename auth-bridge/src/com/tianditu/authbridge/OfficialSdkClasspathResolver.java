package com.tianditu.authbridge;

import java.io.File;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

public final class OfficialSdkClasspathResolver {
  private OfficialSdkClasspathResolver() {
  }

  public static List<File> resolve(AuthBridgeConfig config) {
    Set<String> seen = new LinkedHashSet<String>();
    List<File> entries = new ArrayList<File>();

    addFile(entries, seen, config.getSdkJarPath());

    for (String raw : config.getSdkExtraClasspathEntries()) {
      addFile(entries, seen, raw);
    }

    if (config.isSdkAutoDetectLocalDeps()) {
      String home = System.getProperty("user.home", "");
      String repo = home + File.separator + ".m2" + File.separator + "repository";
      addFile(entries, seen, repo + "/com/fasterxml/jackson/core/jackson-databind/2.13.4.2/jackson-databind-2.13.4.2.jar");
      addFile(entries, seen, repo + "/com/fasterxml/jackson/core/jackson-core/2.13.4/jackson-core-2.13.4.jar");
      addFile(entries, seen, repo + "/com/fasterxml/jackson/core/jackson-annotations/2.13.4/jackson-annotations-2.13.4.jar");
      addFile(entries, seen, repo + "/org/apache/httpcomponents/httpclient/4.5.13/httpclient-4.5.13.jar");
      addFile(entries, seen, repo + "/org/apache/httpcomponents/httpcore/4.4.15/httpcore-4.4.15.jar");
      addFile(entries, seen, repo + "/commons-codec/commons-codec/1.15/commons-codec-1.15.jar");
      addFile(entries, seen, repo + "/org/springframework/spring-web/5.3.23/spring-web-5.3.23.jar");
      addFile(entries, seen, repo + "/org/springframework/spring-core/5.3.23/spring-core-5.3.23.jar");
      addFile(entries, seen, repo + "/org/springframework/spring-beans/5.3.23/spring-beans-5.3.23.jar");
      addFile(entries, seen, repo + "/org/springframework/spring-context/5.3.23/spring-context-5.3.23.jar");
      addFile(entries, seen, repo + "/org/springframework/spring-jcl/5.3.23/spring-jcl-5.3.23.jar");
    }

    return entries;
  }

  private static void addFile(List<File> entries, Set<String> seen, String rawPath) {
    if (rawPath == null || rawPath.trim().isEmpty()) {
      return;
    }
    File file = new File(rawPath.trim());
    String path = file.getAbsolutePath();
    if (seen.contains(path)) {
      return;
    }
    seen.add(path);
    entries.add(file);
  }
}
