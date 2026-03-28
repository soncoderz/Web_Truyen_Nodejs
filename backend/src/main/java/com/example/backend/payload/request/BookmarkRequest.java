package com.example.backend.payload.request;

import jakarta.validation.constraints.NotBlank;

public class BookmarkRequest {
    @NotBlank
    private String storyId;

    private String chapterId;

    private Integer pageIndex;

    private Integer paragraphIndex;

    private String textSnippet;

    private String note;

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
}
