package com.example.backend.model;

import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.DBRef;
import org.springframework.data.mongodb.core.mapping.Document;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@Document(collection = "stories")
public class Story {
    @Id
    private String id;

    @NotBlank
    @Size(max = 200)
    private String title;

    private String description;

    private String coverImage;

    private EStoryType type = EStoryType.NOVEL;

    private EStoryStatus status = EStoryStatus.ONGOING;

    private Long views = 0L;

    private Long followers = 0L;

    private Double averageRating = 0.0;

    private Integer totalRatings = 0;

    private String uploaderId;
    private String uploaderUsername;

    private Boolean licensed = false;

    private Long unlockPrice = 0L;

    private EApprovalStatus approvalStatus = EApprovalStatus.APPROVED;

    private String reviewedById;
    private String reviewedByUsername;
    private String reviewNote;
    private Date reviewedAt;

    @DBRef
    private Set<Category> categories = new HashSet<>();

    @DBRef
    private Set<Author> authors = new HashSet<>();

    private List<String> relatedStoryIds = new ArrayList<>();

    private Date createdAt = new Date();
    private Date updatedAt = new Date();

    public Story() {}

    public Story(String title, String description, EStoryStatus status) {
        this.title = title;
        this.description = description;
        this.status = status;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getCoverImage() { return coverImage; }
    public void setCoverImage(String coverImage) { this.coverImage = coverImage; }

    public EStoryStatus getStatus() { return status; }
    public void setStatus(EStoryStatus status) { this.status = status; }

    public Long getViews() { return views; }
    public void setViews(Long views) { this.views = views; }

    public Long getFollowers() { return followers; }
    public void setFollowers(Long followers) { this.followers = followers; }

    public Double getAverageRating() { return averageRating; }
    public void setAverageRating(Double averageRating) { this.averageRating = averageRating; }

    public Integer getTotalRatings() { return totalRatings; }
    public void setTotalRatings(Integer totalRatings) { this.totalRatings = totalRatings; }

    public String getUploaderId() { return uploaderId; }
    public void setUploaderId(String uploaderId) { this.uploaderId = uploaderId; }

    public String getUploaderUsername() { return uploaderUsername; }
    public void setUploaderUsername(String uploaderUsername) { this.uploaderUsername = uploaderUsername; }

    public Boolean getLicensed() { return licensed; }
    public void setLicensed(Boolean licensed) { this.licensed = licensed; }

    public Long getUnlockPrice() { return unlockPrice; }
    public void setUnlockPrice(Long unlockPrice) { this.unlockPrice = unlockPrice; }

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

    public Set<Category> getCategories() { return categories; }
    public void setCategories(Set<Category> categories) { this.categories = categories; }

    public Set<Author> getAuthors() { return authors; }
    public void setAuthors(Set<Author> authors) { this.authors = authors; }

    public Date getCreatedAt() { return createdAt; }
    public void setCreatedAt(Date createdAt) { this.createdAt = createdAt; }

    public Date getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Date updatedAt) { this.updatedAt = updatedAt; }

    public EStoryType getType() { return type; }
    public void setType(EStoryType type) { this.type = type; }

    public List<String> getRelatedStoryIds() { return relatedStoryIds; }
    public void setRelatedStoryIds(List<String> relatedStoryIds) { this.relatedStoryIds = relatedStoryIds; }
}
