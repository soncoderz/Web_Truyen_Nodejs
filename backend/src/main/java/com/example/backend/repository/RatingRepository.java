package com.example.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.mongodb.repository.MongoRepository;

import com.example.backend.model.Rating;

public interface RatingRepository extends MongoRepository<Rating, String> {
    List<Rating> findByStoryId(String storyId);
    Optional<Rating> findByStoryIdAndUserId(String storyId, String userId);
    long countByStoryId(String storyId);
}
