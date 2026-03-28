package com.example.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.mongodb.repository.MongoRepository;

import com.example.backend.model.ReadingHistory;

public interface ReadingHistoryRepository extends MongoRepository<ReadingHistory, String> {
    List<ReadingHistory> findByUserIdOrderByLastReadAtDesc(String userId);
    Optional<ReadingHistory> findByUserIdAndStoryId(String userId, String storyId);
}
