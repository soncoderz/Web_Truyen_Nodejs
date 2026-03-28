package com.example.backend.repository;

import java.util.List;

import org.springframework.data.mongodb.repository.MongoRepository;

import com.example.backend.model.Report;

public interface ReportRepository extends MongoRepository<Report, String> {
    List<Report> findByStatusOrderByCreatedAtDesc(String status);
    List<Report> findByStoryIdOrderByCreatedAtDesc(String storyId);
    List<Report> findAllByOrderByCreatedAtDesc();
}
