package com.example.backend.model;

import java.util.Date;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

@Document(collection = "ratings")
public class Rating {
    @Id
    private String id;

    @NotBlank
    private String storyId;

    @NotBlank
    private String userId;

    @NotNull
    @Min(1)
    @Max(5)
    private Integer score;

    private Date createdAt = new Date();

    public Rating() {}

    public Rating(String storyId, String userId, Integer score) {
        this.storyId = storyId;
        this.userId = userId;
        this.score = score;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getStoryId() { return storyId; }
    public void setStoryId(String storyId) { this.storyId = storyId; }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public Integer getScore() { return score; }
    public void setScore(Integer score) { this.score = score; }

    public Date getCreatedAt() { return createdAt; }
    public void setCreatedAt(Date createdAt) { this.createdAt = createdAt; }
}
