package com.example.backend.repository;

import java.util.List;

import org.springframework.data.mongodb.repository.MongoRepository;

import com.example.backend.model.Bookmark;

public interface BookmarkRepository extends MongoRepository<Bookmark, String> {
    List<Bookmark> findByUserIdOrderByCreatedAtDesc(String userId);
    List<Bookmark> findByUserIdAndStoryId(String userId, String storyId);
    List<Bookmark> findByUserIdAndStoryIdAndChapterId(String userId, String storyId, String chapterId);
}
