package com.example.backend.payload.request;

import jakarta.validation.constraints.NotBlank;

public class ReaderNoteRequest {
    @NotBlank
    private String storyId;

    @NotBlank
    private String chapterId;

    private Integer pageIndex;

    private Integer paragraphIndex;

    private String note;

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
}
