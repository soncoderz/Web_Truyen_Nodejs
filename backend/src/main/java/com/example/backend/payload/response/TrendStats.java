package com.example.backend.payload.response;

public class TrendStats {
    private long newUsersToday;
    private long newUsersThisWeek;
    private long newUsersThisMonth;
    private long newStoriesThisWeek;
    private long newStoriesThisMonth;
    private long newChaptersThisWeek;
    private long newChaptersThisMonth;

    public TrendStats() {}

    public TrendStats(long newUsersToday, long newUsersThisWeek, long newUsersThisMonth,
                      long newStoriesThisWeek, long newStoriesThisMonth,
                      long newChaptersThisWeek, long newChaptersThisMonth) {
        this.newUsersToday = newUsersToday;
        this.newUsersThisWeek = newUsersThisWeek;
        this.newUsersThisMonth = newUsersThisMonth;
        this.newStoriesThisWeek = newStoriesThisWeek;
        this.newStoriesThisMonth = newStoriesThisMonth;
        this.newChaptersThisWeek = newChaptersThisWeek;
        this.newChaptersThisMonth = newChaptersThisMonth;
    }

    public long getNewUsersToday() { return newUsersToday; }
    public void setNewUsersToday(long v) { this.newUsersToday = v; }

    public long getNewUsersThisWeek() { return newUsersThisWeek; }
    public void setNewUsersThisWeek(long v) { this.newUsersThisWeek = v; }

    public long getNewUsersThisMonth() { return newUsersThisMonth; }
    public void setNewUsersThisMonth(long v) { this.newUsersThisMonth = v; }

    public long getNewStoriesThisWeek() { return newStoriesThisWeek; }
    public void setNewStoriesThisWeek(long v) { this.newStoriesThisWeek = v; }

    public long getNewStoriesThisMonth() { return newStoriesThisMonth; }
    public void setNewStoriesThisMonth(long v) { this.newStoriesThisMonth = v; }

    public long getNewChaptersThisWeek() { return newChaptersThisWeek; }
    public void setNewChaptersThisWeek(long v) { this.newChaptersThisWeek = v; }

    public long getNewChaptersThisMonth() { return newChaptersThisMonth; }
    public void setNewChaptersThisMonth(long v) { this.newChaptersThisMonth = v; }
}
