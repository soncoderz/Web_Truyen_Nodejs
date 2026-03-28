package com.example.backend.payload.request;

import java.util.List;
import java.util.Set;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import com.example.backend.model.EStoryStatus;
import com.example.backend.model.EStoryType;

public class StoryRequest {
    @NotBlank
    @Size(max = 200)
    private String title;

    private String description;

    private EStoryStatus status;

    private Set<String> categoryIds;

    private String coverImage;

    private EStoryType type;

    private List<String> relatedStoryIds;

    private Set<String> authorIds;

    private Boolean licensed;

    private Long unlockPrice;

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public EStoryStatus getStatus() {
        return status;
    }

    public void setStatus(EStoryStatus status) {
        this.status = status;
    }

    public Set<String> getCategoryIds() {
        return categoryIds;
    }

    public void setCategoryIds(Set<String> categoryIds) {
        this.categoryIds = categoryIds;
    }

    public Set<String> getAuthorIds() {
        return authorIds;
    }

    public void setAuthorIds(Set<String> authorIds) {
        this.authorIds = authorIds;
    }

    public String getCoverImage() {
        return coverImage;
    }

    public void setCoverImage(String coverImage) {
        this.coverImage = coverImage;
    }

    public EStoryType getType() { return type; }
    public void setType(EStoryType type) { this.type = type; }

    public List<String> getRelatedStoryIds() { return relatedStoryIds; }
    public void setRelatedStoryIds(List<String> relatedStoryIds) { this.relatedStoryIds = relatedStoryIds; }

    public Boolean getLicensed() { return licensed; }
    public void setLicensed(Boolean licensed) { this.licensed = licensed; }

    public Long getUnlockPrice() { return unlockPrice; }
    public void setUnlockPrice(Long unlockPrice) { this.unlockPrice = unlockPrice; }
}
