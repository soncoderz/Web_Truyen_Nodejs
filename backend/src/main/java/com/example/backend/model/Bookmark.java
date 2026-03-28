package com.example.backend.model;

import java.util.Date;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import jakarta.validation.constraints.NotBlank;

@Document(collection = "bookmarks")
public class Bookmark {
    @Id
    private String id;

    @NotBlank
    private String userId;

    @NotBlank
    private String storyId;

    private String chapterId;

    private Integer pageIndex;

    private Integer paragraphIndex;

    private String textSnippet;

    private String note;

    private Date createdAt = new Date();

    public Bookmark() {}

    public Bookmark(String userId, String storyId, String chapterId, String note) {
        this.userId = userId;
        this.storyId = storyId;
        this.chapterId = chapterId;
        this.note = note;
    }

    public Bookmark(
            String userId,
            String storyId,
            String chapterId,
            Integer pageIndex,
            Integer paragraphIndex,
            String textSnippet,
            String note) {
        this.userId = userId;
        this.storyId = storyId;
        this.chapterId = chapterId;
        this.pageIndex = pageIndex;
        this.paragraphIndex = paragraphIndex;
        this.textSnippet = textSnippet;
        this.note = note;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getStoryId() { return storyId; }
    public void setStoryId(String storyId) { this.storyId = storyId; }

    public String getChapterId() { return chapterId; }
    public void setChapterId(String chapterId) { this.chapterId = chapterId; }

    public Integer getPageIndex() { return pageIndex; }
    public void setPageIndex(Integer pageIndex) { this.pageIndex = pageIndex; }

    public Integer getParagraphIndex() { return paragraphIndex; }
    public void setParagraphIndex(Integer paragraphIndex) { this.paragraphIndex = paragraphIndex; }

    public String getTextSnippet() { return textSnippet; }
    public void setTextSnippet(String textSnippet) { this.textSnippet = textSnippet; }

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }

    public Date getCreatedAt() { return createdAt; }
    public void setCreatedAt(Date createdAt) { this.createdAt = createdAt; }
}
