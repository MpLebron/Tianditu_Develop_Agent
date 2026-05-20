package com.tianditu.authbridge;

import java.io.File;

public final class FilePathSupport {
  private FilePathSupport() {
  }

  public static String pathSeparatorRegex() {
    if ("\\".equals(File.separator)) {
      return ";";
    }
    return ":";
  }
}
