package com.example.backend.controller;

import java.util.Date;
import java.util.List;
import java.util.Optional;

import jakarta.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import com.example.backend.model.ReadingHistory;
import com.example.backend.payload.request.ReadingHistoryRequest;
import com.example.backend.repository.ReadingHistoryRepository;
import com.example.backend.security.services.UserDetailsImpl;

@CrossOrigin(origins = "*", maxAge = 3600)
@RestController
@RequestMapping("/api/reading-history")
public class ReadingHistoryController {

    @Autowired
    ReadingHistoryRepository readingHistoryRepository;

    @GetMapping
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<List<ReadingHistory>> getMyHistory() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        UserDetailsImpl userDetails = (UserDetailsImpl) authentication.getPrincipal();
        return ResponseEntity.ok(readingHistoryRepository.findByUserIdOrderByLastReadAtDesc(userDetails.getId()));
    }

    @GetMapping("/story/{storyId}")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<ReadingHistory> getMyStoryHistory(@PathVariable String storyId) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        UserDetailsImpl userDetails = (UserDetailsImpl) authentication.getPrincipal();
        return ResponseEntity.ok(
                readingHistoryRepository.findByUserIdAndStoryId(userDetails.getId(), storyId).orElse(null));
    }

    @PostMapping
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<?> saveHistory(@Valid @RequestBody ReadingHistoryRequest payload) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        UserDetailsImpl userDetails = (UserDetailsImpl) authentication.getPrincipal();

        String storyId = normalizeId(payload.getStoryId());
        String chapterId = normalizeId(payload.getChapterId());
        String note = normalizeNote(payload.getNote());

        Optional<ReadingHistory> existing = readingHistoryRepository
                .findByUserIdAndStoryId(userDetails.getId(), storyId);

        ReadingHistory history;
        if (existing.isPresent()) {
            history = existing.get();
            if (chapterId != null) {
                history.setChapterId(chapterId);
            }
            if (payload.getNote() != null) {
                history.setNote(note);
            }
            history.setLastReadAt(new Date());
        } else {
            history = new ReadingHistory(userDetails.getId(), storyId, chapterId);
            history.setNote(note);
        }
        readingHistoryRepository.save(history);
        return ResponseEntity.ok(history);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<?> deleteHistory(@PathVariable String id) {
        readingHistoryRepository.deleteById(id);
        return ResponseEntity.ok(new com.example.backend.payload.response.MessageResponse("History deleted!"));
    }

    private String normalizeId(String value) {
        if (value == null) {
            return null;
        }

        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String normalizeNote(String value) {
        if (value == null) {
            return null;
        }

        String normalized = value.trim();
        if (normalized.isEmpty()) {
            return null;
        }

        return normalized.length() > 4000 ? normalized.substring(0, 4000) : normalized;
    }
}
