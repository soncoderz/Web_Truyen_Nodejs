package com.example.backend.repository;

import java.util.List;

import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import com.example.backend.model.EApprovalStatus;
import com.example.backend.model.Story;

@Repository
public interface StoryRepository extends MongoRepository<Story, String> {
    List<Story> findTop10ByOrderByViewsDesc();
    List<Story> findTop10ByOrderByAverageRatingDesc();
    List<Story> findByUploaderIdOrderByUpdatedAtDesc(String uploaderId);
    List<Story> findByApprovalStatusOrderByUpdatedAtDesc(EApprovalStatus approvalStatus);

    List<Story> findByCreatedAtGreaterThanOrderByCreatedAtDesc(java.util.Date date);

    long countByCreatedAtGreaterThan(java.util.Date date);
    long countByApprovalStatus(EApprovalStatus approvalStatus);

    long countByType(String type);

    long countByStatus(String status);
}
