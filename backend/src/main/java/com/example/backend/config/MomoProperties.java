package com.example.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "momo")
public class MomoProperties {
    private String endpoint = "https://test-payment.momo.vn/v2/gateway/api/create";
    private String partnerCode;
    private String accessKey;
    private String secretKey;
    private String storeId;
    private String partnerName = "Web Tuyen Online";

    public String getEndpoint() {
        return endpoint;
    }

    public void setEndpoint(String endpoint) {
        this.endpoint = endpoint;
    }

    public String getPartnerCode() {
        return partnerCode;
    }

    public void setPartnerCode(String partnerCode) {
        this.partnerCode = partnerCode;
    }

    public String getAccessKey() {
        return accessKey;
    }

    public void setAccessKey(String accessKey) {
        this.accessKey = accessKey;
    }

    public String getSecretKey() {
        return secretKey;
    }

    public void setSecretKey(String secretKey) {
        this.secretKey = secretKey;
    }

    public String getStoreId() {
        return storeId;
    }

    public void setStoreId(String storeId) {
        this.storeId = storeId;
    }

    public String getPartnerName() {
        return partnerName;
    }

    public void setPartnerName(String partnerName) {
        this.partnerName = partnerName;
    }

    public boolean isConfigured() {
        return hasText(endpoint)
                && hasText(partnerCode)
                && hasText(accessKey)
                && hasText(secretKey);
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
