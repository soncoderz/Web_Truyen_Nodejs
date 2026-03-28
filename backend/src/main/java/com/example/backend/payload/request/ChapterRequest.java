package com.example.backend.payload.request;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public class ChapterRequest {
    @NotBlank
    private String storyId;

    @NotNull
    private Integer chapterNumber;

    @NotBlank
    private String title;

    private String content;

    private List<String> pages;

    public String getStoryId() { return storyId; }
    public void setStoryId(String storyId) { this.storyId = storyId; }

    public Integer getChapterNumber() { return chapterNumber; }
    public void setChapterNumber(Integer chapterNumber) { this.chapterNumber = chapterNumber; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public List<String> getPages() { return pages; }
    public void setPages(List<String> pages) { this.pages = pages; }
}
