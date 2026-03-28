package com.example.backend.payload.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public class RatingRequest {
    @NotBlank
    private String storyId;

    @NotNull
    @Min(1)
    @Max(5)
    private Integer score;

    public String getStoryId() { return storyId; }
    public void setStoryId(String storyId) { this.storyId = storyId; }

    public Integer getScore() { return score; }
    public void setScore(Integer score) { this.score = score; }
}
