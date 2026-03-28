package com.example.backend.payload.request;

import jakarta.validation.constraints.NotBlank;

public class ReadingHistoryRequest {
    @NotBlank
    private String storyId;

    private String chapterId;

    private String note;

    public String getStoryId() {
        return storyId;
    }

    public void setStoryId(String storyId) {
        this.storyId = storyId;
    }

    public String getChapterId() {
        return chapterId;
    }

    public void setChapterId(String chapterId) {
        this.chapterId = chapterId;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
    }
}
