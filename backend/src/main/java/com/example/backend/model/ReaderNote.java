package com.example.backend.model;

import java.util.Date;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import jakarta.validation.constraints.NotBlank;

@Document(collection = "reader_notes")
public class ReaderNote {
    @Id
    private String id;

    @NotBlank
    private String userId;

    @NotBlank
    private String storyId;

    @NotBlank
    private String chapterId;

    private Integer pageIndex;

    private Integer paragraphIndex;

    private String note;

    private Date updatedAt = new Date();

    public ReaderNote() {}

    public ReaderNote(
            String userId,
            String storyId,
            String chapterId,
            Integer pageIndex,
            Integer paragraphIndex,
            String note) {
        this.userId = userId;
        this.storyId = storyId;
        this.chapterId = chapterId;
        this.pageIndex = pageIndex;
        this.paragraphIndex = paragraphIndex;
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

    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }

    public Date getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Date updatedAt) { this.updatedAt = updatedAt; }
}
