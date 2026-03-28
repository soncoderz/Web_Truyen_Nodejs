package com.example.backend.model;

import java.util.Date;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import jakarta.validation.constraints.NotBlank;

@Document(collection = "notifications")
public class Notification {
    @Id
    private String id;

    @NotBlank
    private String userId;

    @NotBlank
    private String message;

    private String storyId;

    private String chapterId;

    private Boolean isRead = false;

    private Date createdAt = new Date();

    public Notification() {}

    public Notification(String userId, String message, String storyId, String chapterId) {
        this.userId = userId;
        this.message = message;
        this.storyId = storyId;
        this.chapterId = chapterId;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }

    public String getStoryId() { return storyId; }
    public void setStoryId(String storyId) { this.storyId = storyId; }

    public String getChapterId() { return chapterId; }
    public void setChapterId(String chapterId) { this.chapterId = chapterId; }

    public Boolean getIsRead() { return isRead; }
    public void setIsRead(Boolean isRead) { this.isRead = isRead; }

    public Date getCreatedAt() { return createdAt; }
    public void setCreatedAt(Date createdAt) { this.createdAt = createdAt; }
}
