package com.example.backend.model;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

@Document(collection = "chapters")
public class Chapter {
    @Id
    private String id;

    @NotBlank
    private String storyId;

    @NotNull
    private Integer chapterNumber;

    @NotBlank
    private String title;

    private String content;

    private List<String> pages = new ArrayList<>();

    private String uploaderId;
    private String uploaderUsername;

    private EApprovalStatus approvalStatus = EApprovalStatus.APPROVED;

    private String reviewedById;
    private String reviewedByUsername;
    private String reviewNote;
    private Date reviewedAt;

    private Date createdAt = new Date();
    private Date updatedAt = new Date();

    public Chapter() {}

    public Chapter(String storyId, Integer chapterNumber, String title, String content) {
        this.storyId = storyId;
        this.chapterNumber = chapterNumber;
        this.title = title;
        this.content = content;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getStoryId() { return storyId; }
    public void setStoryId(String storyId) { this.storyId = storyId; }

    public Integer getChapterNumber() { return chapterNumber; }
    public void setChapterNumber(Integer chapterNumber) { this.chapterNumber = chapterNumber; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public String getUploaderId() { return uploaderId; }
    public void setUploaderId(String uploaderId) { this.uploaderId = uploaderId; }

    public String getUploaderUsername() { return uploaderUsername; }
    public void setUploaderUsername(String uploaderUsername) { this.uploaderUsername = uploaderUsername; }

    public EApprovalStatus getApprovalStatus() { return approvalStatus; }
    public void setApprovalStatus(EApprovalStatus approvalStatus) { this.approvalStatus = approvalStatus; }

    public String getReviewedById() { return reviewedById; }
    public void setReviewedById(String reviewedById) { this.reviewedById = reviewedById; }

    public String getReviewedByUsername() { return reviewedByUsername; }
    public void setReviewedByUsername(String reviewedByUsername) { this.reviewedByUsername = reviewedByUsername; }

    public String getReviewNote() { return reviewNote; }
    public void setReviewNote(String reviewNote) { this.reviewNote = reviewNote; }

    public Date getReviewedAt() { return reviewedAt; }
    public void setReviewedAt(Date reviewedAt) { this.reviewedAt = reviewedAt; }

    public Date getCreatedAt() { return createdAt; }
    public void setCreatedAt(Date createdAt) { this.createdAt = createdAt; }

    public Date getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Date updatedAt) { this.updatedAt = updatedAt; }

    public List<String> getPages() { return pages; }
    public void setPages(List<String> pages) { this.pages = pages; }
}
