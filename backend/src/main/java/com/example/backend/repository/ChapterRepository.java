package com.example.backend.repository;

import java.util.List;

import org.springframework.data.mongodb.repository.MongoRepository;

import com.example.backend.model.EApprovalStatus;
import com.example.backend.model.Chapter;

public interface ChapterRepository extends MongoRepository<Chapter, String> {
    List<Chapter> findByStoryIdOrderByChapterNumberAsc(String storyId);
    List<Chapter> findByStoryIdAndApprovalStatusOrderByChapterNumberAsc(String storyId, EApprovalStatus approvalStatus);
    List<Chapter> findByUploaderIdOrderByUpdatedAtDesc(String uploaderId);
    List<Chapter> findByApprovalStatusOrderByUpdatedAtDesc(EApprovalStatus approvalStatus);
    Chapter findByStoryIdAndChapterNumber(String storyId, Integer chapterNumber);
    long countByStoryId(String storyId);
    void deleteByStoryId(String storyId);

    long countByCreatedAtGreaterThan(java.util.Date date);
    long countByApprovalStatus(EApprovalStatus approvalStatus);
}
