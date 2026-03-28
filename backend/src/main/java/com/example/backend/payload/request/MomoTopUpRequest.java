package com.example.backend.payload.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public class MomoTopUpRequest {
    @NotNull
    @Min(1000)
    private Long amount;

    private String returnPath;

    public Long getAmount() {
        return amount;
    }

    public void setAmount(Long amount) {
        this.amount = amount;
    }

    public String getReturnPath() {
        return returnPath;
    }

    public void setReturnPath(String returnPath) {
        this.returnPath = returnPath;
    }
}
