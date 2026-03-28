package com.example.backend.repository;

import java.util.List;

import org.springframework.data.mongodb.repository.MongoRepository;

import com.example.backend.model.Comment;

public interface CommentRepository extends MongoRepository<Comment, String> {
    List<Comment> findByStoryIdOrderByCreatedAtDesc(String storyId);
    List<Comment> findByChapterIdOrderByCreatedAtDesc(String chapterId);
    List<Comment> findByChapterIdAndPageIndexIsNullOrderByCreatedAtDesc(String chapterId);
    List<Comment> findByChapterIdAndPageIndexOrderByCreatedAtDesc(String chapterId, int pageIndex);
    List<Comment> findByStoryIdAndChapterIdIsNullOrderByCreatedAtDesc(String storyId);
    long countByStoryId(String storyId);
}
