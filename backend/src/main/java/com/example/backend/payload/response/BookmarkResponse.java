package com.example.backend.payload.response;

import java.util.Date;

import com.example.backend.model.Bookmark;
import com.example.backend.model.Chapter;
import com.example.backend.model.Story;

public class BookmarkResponse {
    private String id;
    private String userId;
    private String storyId;
    private String chapterId;
    private Integer pageIndex;
    private Integer paragraphIndex;
    private String textSnippet;
    private String note;
    private Date createdAt;
    private StorySummary story;
    private ChapterSummary chapter;

    public BookmarkResponse() {}

    public BookmarkResponse(Bookmark bookmark, Story story, Chapter chapter) {
        this.id = bookmark.getId();
        this.userId = bookmark.getUserId();
        this.storyId = bookmark.getStoryId();
        this.chapterId = bookmark.getChapterId();
        this.pageIndex = bookmark.getPageIndex();
        this.paragraphIndex = bookmark.getParagraphIndex();
        this.textSnippet = bookmark.getTextSnippet();
        this.note = bookmark.getNote();
        this.createdAt = bookmark.getCreatedAt();
        this.story = story != null ? new StorySummary(story) : null;
        this.chapter = chapter != null ? new ChapterSummary(chapter) : null;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

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

    public Date getCreatedAt() { return createdAt; }
    public void setCreatedAt(Date createdAt) { this.createdAt = createdAt; }

    public StorySummary getStory() { return story; }
    public void setStory(StorySummary story) { this.story = story; }

    public ChapterSummary getChapter() { return chapter; }
    public void setChapter(ChapterSummary chapter) { this.chapter = chapter; }

    public static class StorySummary {
        private String id;
        private String title;
        private String coverImage;
        private String type;
        private String status;
        private Long views;
        private Long followers;
        private Double averageRating;

        public StorySummary() {}

        public StorySummary(Story story) {
            this.id = story.getId();
            this.title = story.getTitle();
            this.coverImage = story.getCoverImage();
            this.type = story.getType() != null ? story.getType().name() : null;
            this.status = story.getStatus() != null ? story.getStatus().name() : null;
            this.views = story.getViews();
            this.followers = story.getFollowers();
            this.averageRating = story.getAverageRating();
        }

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }

        public String getTitle() { return title; }
        public void setTitle(String title) { this.title = title; }

        public String getCoverImage() { return coverImage; }
        public void setCoverImage(String coverImage) { this.coverImage = coverImage; }

        public String getType() { return type; }
        public void setType(String type) { this.type = type; }

        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }

        public Long getViews() { return views; }
        public void setViews(Long views) { this.views = views; }

        public Long getFollowers() { return followers; }
        public void setFollowers(Long followers) { this.followers = followers; }

        public Double getAverageRating() { return averageRating; }
        public void setAverageRating(Double averageRating) { this.averageRating = averageRating; }
    }

    public static class ChapterSummary {
        private String id;
        private Integer chapterNumber;
        private String title;
        private Date createdAt;

        public ChapterSummary() {}

        public ChapterSummary(Chapter chapter) {
            this.id = chapter.getId();
            this.chapterNumber = chapter.getChapterNumber();
            this.title = chapter.getTitle();
            this.createdAt = chapter.getCreatedAt();
        }

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }

        public Integer getChapterNumber() { return chapterNumber; }
        public void setChapterNumber(Integer chapterNumber) { this.chapterNumber = chapterNumber; }

        public String getTitle() { return title; }
        public void setTitle(String title) { this.title = title; }

        public Date getCreatedAt() { return createdAt; }
        public void setCreatedAt(Date createdAt) { this.createdAt = createdAt; }
    }
}
