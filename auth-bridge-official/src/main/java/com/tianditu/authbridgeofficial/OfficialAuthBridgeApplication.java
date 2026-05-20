package com.tianditu.authbridgeofficial;

import com.tianditu.authbridgeofficial.config.BridgeAuthProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(BridgeAuthProperties.class)
public class OfficialAuthBridgeApplication {
  public static void main(String[] args) {
    SpringApplication.run(OfficialAuthBridgeApplication.class, args);
  }
}
