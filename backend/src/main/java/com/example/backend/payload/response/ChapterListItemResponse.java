package com.example.backend.payload.response;

import java.util.Date;

import com.example.backend.model.Chapter;

public class ChapterListItemResponse {
    private String id;
    private String storyId;
    private Integer chapterNumber;
    private String title;
    private Date createdAt;
    private Date updatedAt;

    public ChapterListItemResponse() {}

    public ChapterListItemResponse(Chapter chapter) {
        this.id = chapter.getId();
        this.storyId = chapter.getStoryId();
        this.chapterNumber = chapter.getChapterNumber();
        this.title = chapter.getTitle();
        this.createdAt = chapter.getCreatedAt();
        this.updatedAt = chapter.getUpdatedAt();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getStoryId() { return storyId; }
    public void setStoryId(String storyId) { this.storyId = storyId; }

    public Integer getChapterNumber() { return chapterNumber; }
    public void setChapterNumber(Integer chapterNumber) { this.chapterNumber = chapterNumber; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public Date getCreatedAt() { return createdAt; }
    public void setCreatedAt(Date createdAt) { this.createdAt = createdAt; }

    public Date getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Date updatedAt) { this.updatedAt = updatedAt; }
}
