package com.example.backend.controller;

import java.util.List;
import java.util.Optional;

import jakarta.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import com.example.backend.model.Rating;
import com.example.backend.model.Story;
import com.example.backend.payload.request.RatingRequest;
import com.example.backend.payload.response.MessageResponse;
import com.example.backend.repository.RatingRepository;
import com.example.backend.repository.StoryRepository;
import com.example.backend.security.services.UserDetailsImpl;

@CrossOrigin(origins = "*", maxAge = 3600)
@RestController
@RequestMapping("/api/ratings")
public class RatingController {

    @Autowired
    RatingRepository ratingRepository;

    @Autowired
    StoryRepository storyRepository;

    @PostMapping
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<?> rateStory(@Valid @RequestBody RatingRequest request) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        UserDetailsImpl userDetails = (UserDetailsImpl) authentication.getPrincipal();

        Optional<Rating> existingRating = ratingRepository.findByStoryIdAndUserId(
                request.getStoryId(), userDetails.getId());

        Rating rating;
        if (existingRating.isPresent()) {
            rating = existingRating.get();
            rating.setScore(request.getScore());
        } else {
            rating = new Rating(request.getStoryId(), userDetails.getId(), request.getScore());
        }
        ratingRepository.save(rating);

        // Update story average rating
        updateStoryRating(request.getStoryId());

        return ResponseEntity.ok(rating);
    }

    @GetMapping("/story/{storyId}")
    public ResponseEntity<?> getStoryRating(@PathVariable String storyId) {
        List<Rating> ratings = ratingRepository.findByStoryId(storyId);
        double average = ratings.stream().mapToInt(Rating::getScore).average().orElse(0.0);
        return ResponseEntity.ok(java.util.Map.of(
            "averageRating", Math.round(average * 10.0) / 10.0,
            "totalRatings", ratings.size()
        ));
    }

    @GetMapping("/story/{storyId}/user")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<?> getUserRating(@PathVariable String storyId) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        UserDetailsImpl userDetails = (UserDetailsImpl) authentication.getPrincipal();

        Optional<Rating> rating = ratingRepository.findByStoryIdAndUserId(storyId, userDetails.getId());
        if (rating.isPresent()) {
            return ResponseEntity.ok(rating.get());
        }
        return ResponseEntity.ok(new MessageResponse("No rating yet"));
    }

    private void updateStoryRating(String storyId) {
        List<Rating> ratings = ratingRepository.findByStoryId(storyId);
        double average = ratings.stream().mapToInt(Rating::getScore).average().orElse(0.0);

        Optional<Story> storyOpt = storyRepository.findById(storyId);
        if (storyOpt.isPresent()) {
            Story story = storyOpt.get();
            story.setAverageRating(Math.round(average * 10.0) / 10.0);
            story.setTotalRatings(ratings.size());
            storyRepository.save(story);
        }
    }
}
