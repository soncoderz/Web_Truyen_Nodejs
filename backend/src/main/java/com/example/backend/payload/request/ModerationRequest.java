package com.example.backend.payload.request;

import com.example.backend.model.EApprovalStatus;

import jakarta.validation.constraints.NotNull;

public class ModerationRequest {
    @NotNull
    private EApprovalStatus approvalStatus;

    private String reviewNote;

    public EApprovalStatus getApprovalStatus() {
        return approvalStatus;
    }

    public void setApprovalStatus(EApprovalStatus approvalStatus) {
        this.approvalStatus = approvalStatus;
    }

    public String getReviewNote() {
        return reviewNote;
    }

    public void setReviewNote(String reviewNote) {
        this.reviewNote = reviewNote;
    }
}
