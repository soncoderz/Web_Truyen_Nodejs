package com.example.backend.payload.response;

import java.util.List;

import com.example.backend.model.Story;

public class HotStories {
    private List<Story> topByViews;
    private List<Story> topByRating;

    public HotStories() {}

    public HotStories(List<Story> topByViews, List<Story> topByRating) {
        this.topByViews = topByViews;
        this.topByRating = topByRating;
    }

    public List<Story> getTopByViews() { return topByViews; }
    public void setTopByViews(List<Story> v) { this.topByViews = v; }

    public List<Story> getTopByRating() { return topByRating; }
    public void setTopByRating(List<Story> v) { this.topByRating = v; }
}
