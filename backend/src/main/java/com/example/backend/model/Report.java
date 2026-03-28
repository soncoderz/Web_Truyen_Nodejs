package com.example.backend.model;

import java.util.Date;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import jakarta.validation.constraints.NotBlank;

@Document(collection = "reports")
public class Report {
    @Id
    private String id;

    @NotBlank
    private String userId;

    @NotBlank
    private String storyId;

    private String chapterId;

    @NotBlank
    private String reason;

    private String status = "PENDING"; // PENDING, RESOLVED, DISMISSED

    private Date createdAt = new Date();

    public Report() {}

    public Report(String userId, String storyId, String chapterId, String reason) {
        this.userId = userId;
        this.storyId = storyId;
        this.chapterId = chapterId;
        this.reason = reason;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getStoryId() { return storyId; }
    public void setStoryId(String storyId) { this.storyId = storyId; }

    public String getChapterId() { return chapterId; }
    public void setChapterId(String chapterId) { this.chapterId = chapterId; }

    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Date getCreatedAt() { return createdAt; }
    public void setCreatedAt(Date createdAt) { this.createdAt = createdAt; }
}
