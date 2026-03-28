package com.example.backend.model;

import java.util.Date;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import jakarta.validation.constraints.NotBlank;

@Document(collection = "comments")
public class Comment {
    @Id
    private String id;

    @NotBlank
    private String storyId;

    private String chapterId;

    private Integer chapterNumber;


    private Integer pageIndex;

    @NotBlank
    private String userId;

    private String username;

    // text is optional when a GIF is attached
    private String content;

    private String gifUrl;

    // size in bytes of the GIF (if any)
    private Long gifSize;

    private Date createdAt = new Date();

    public Comment() {}

    public Comment(String storyId, String chapterId, Integer chapterNumber, Integer pageIndex,
                   String userId, String username, String content,
                   String gifUrl, Long gifSize) {
        this.storyId = storyId;
        this.chapterId = chapterId;
        this.chapterNumber = chapterNumber;
        this.pageIndex = pageIndex;
        this.userId = userId;
        this.username = username;
        this.content = content;
        this.gifUrl = gifUrl;
        this.gifSize = gifSize;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getStoryId() { return storyId; }
    public void setStoryId(String storyId) { this.storyId = storyId; }

    public String getChapterId() { return chapterId; }
    public void setChapterId(String chapterId) { this.chapterId = chapterId; }

    public Integer getChapterNumber() { return chapterNumber; }
    public void setChapterNumber(Integer chapterNumber) { this.chapterNumber = chapterNumber; }

    public Integer getPageIndex() { return pageIndex; }
    public void setPageIndex(Integer pageIndex) { this.pageIndex = pageIndex; }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public String getGifUrl() { return gifUrl; }
    public void setGifUrl(String gifUrl) { this.gifUrl = gifUrl; }

    public Long getGifSize() { return gifSize; }
    public void setGifSize(Long gifSize) { this.gifSize = gifSize; }

    public Date getCreatedAt() { return createdAt; }
    public void setCreatedAt(Date createdAt) { this.createdAt = createdAt; }
}
