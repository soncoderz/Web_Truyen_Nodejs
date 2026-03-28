package com.example.backend.payload.request;

import jakarta.validation.constraints.NotBlank;

public class CommentRequest {
    @NotBlank
    private String storyId;

    private String chapterId;

    private Integer chapterNumber;

    private Integer pageIndex;

    private String gifUrl;
    private Long gifSize;

    // text optional (đã cho phép comment chỉ GIF)
    private String content;

    public String getStoryId() { return storyId; }
    public void setStoryId(String storyId) { this.storyId = storyId; }

    public String getChapterId() { return chapterId; }
    public void setChapterId(String chapterId) { this.chapterId = chapterId; }

    public Integer getChapterNumber() { return chapterNumber; }
    public void setChapterNumber(Integer chapterNumber) { this.chapterNumber = chapterNumber; }

    public Integer getPageIndex() { return pageIndex; }
    public void setPageIndex(Integer pageIndex) { this.pageIndex = pageIndex; }

    public String getGifUrl() { return gifUrl; }
    public void setGifUrl(String gifUrl) { this.gifUrl = gifUrl; }

    public Long getGifSize() { return gifSize; }
    public void setGifSize(Long gifSize) { this.gifSize = gifSize; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
}
