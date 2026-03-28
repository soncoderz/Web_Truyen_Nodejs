package com.example.backend.repository;

import java.util.List;

import org.springframework.data.mongodb.repository.MongoRepository;

import com.example.backend.model.ReaderNote;

public interface ReaderNoteRepository extends MongoRepository<ReaderNote, String> {
    List<ReaderNote> findByUserIdAndStoryIdAndChapterIdOrderByUpdatedAtDesc(
            String userId,
            String storyId,
            String chapterId);
}
