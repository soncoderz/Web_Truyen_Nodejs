package com.example.backend.model;

import java.util.Date;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import jakarta.validation.constraints.NotBlank;

@Document(collection = "reading_history")
public class ReadingHistory {
    @Id
    private String id;

    @NotBlank
    private String userId;

    @NotBlank
    private String storyId;

    private String chapterId;

    private String note;

    private Date lastReadAt = new Date();

    public ReadingHistory() {}

    public ReadingHistory(String userId, String storyId, String chapterId) {
        this.userId = userId;
        this.storyId = storyId;
        this.chapterId = chapterId;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getStoryId() { return storyId; }
    public void setStoryId(String storyId) { this.storyId = storyId; }

    public String getChapterId() { return chapterId; }
    public void setChapterId(String chapterId) { this.chapterId = chapterId; }

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }

    public Date getLastReadAt() { return lastReadAt; }
    public void setLastReadAt(Date lastReadAt) { this.lastReadAt = lastReadAt; }
}
