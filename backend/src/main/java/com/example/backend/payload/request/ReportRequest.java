package com.example.backend.payload.request;

import jakarta.validation.constraints.NotBlank;

public class ReportRequest {
    @NotBlank
    private String storyId;

    private String chapterId;

    @NotBlank
    private String reason;

    public String getStoryId() { return storyId; }
    public void setStoryId(String storyId) { this.storyId = storyId; }

    public String getChapterId() { return chapterId; }
    public void setChapterId(String chapterId) { this.chapterId = chapterId; }

    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
}
