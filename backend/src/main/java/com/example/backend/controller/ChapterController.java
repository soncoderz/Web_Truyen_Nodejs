package com.example.backend.controller;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Optional;

import jakarta.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.example.backend.model.Chapter;
import com.example.backend.model.EApprovalStatus;
import com.example.backend.model.Notification;
import com.example.backend.model.Story;
import com.example.backend.model.User;
import com.example.backend.payload.request.ChapterRequest;
import com.example.backend.payload.request.ModerationRequest;
import com.example.backend.payload.response.ChapterListItemResponse;
import com.example.backend.payload.response.MessageResponse;
import com.example.backend.repository.ChapterRepository;
import com.example.backend.repository.NotificationRepository;
import com.example.backend.repository.StoryRepository;
import com.example.backend.repository.UserRepository;
import com.example.backend.security.services.UserDetailsImpl;

@CrossOrigin(origins = "*", maxAge = 3600)
@RestController
@RequestMapping("/api/chapters")
public class ChapterController {

    @Autowired
    ChapterRepository chapterRepository;

    @Autowired
    StoryRepository storyRepository;

    @Autowired
    NotificationRepository notificationRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    MongoTemplate mongoTemplate;

    @GetMapping("/story/{storyId}")
    public ResponseEntity<List<ChapterListItemResponse>> getChaptersByStory(@PathVariable String storyId) {
        Optional<Story> storyOpt = storyRepository.findById(storyId);
        if (storyOpt.isEmpty()) {
            return ResponseEntity.ok(List.of());
        }

        Story story = storyOpt.get();
        UserDetailsImpl currentUser = getCurrentUserOrNull();
        boolean admin = isAdmin(currentUser);
        if (!canViewStory(story, currentUser, admin)) {
            return ResponseEntity.ok(List.of());
        }

        List<Chapter> chapters = chapterRepository.findByStoryIdOrderByChapterNumberAsc(storyId);
        if (admin || canManageStory(story, currentUser, admin)) {
            return ResponseEntity.ok(chapters.stream().map(ChapterListItemResponse::new).toList());
        }

        return ResponseEntity.ok(chapters.stream()
                .filter(this::isApprovedForPublic)
                .map(ChapterListItemResponse::new)
                .toList());
    }

    @GetMapping("/story/{storyId}/manage")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<?> getManageChaptersByStory(@PathVariable String storyId) {
        Optional<Story> storyOpt = storyRepository.findById(storyId);
        if (storyOpt.isEmpty()) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Story not found!"));
        }

        UserDetailsImpl currentUser = requireCurrentUser();
        Story story = storyOpt.get();
        boolean admin = isAdmin(currentUser);
        if (!canManageStory(story, currentUser, admin)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(new MessageResponse("Error: You do not have permission to view these chapters."));
        }

        return ResponseEntity.ok(chapterRepository.findByStoryIdOrderByChapterNumberAsc(storyId));
    }

    @GetMapping("/mine")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<List<Chapter>> getMyChapters() {
        UserDetailsImpl currentUser = requireCurrentUser();
        return ResponseEntity.ok(chapterRepository.findByUploaderIdOrderByUpdatedAtDesc(currentUser.getId()));
    }

    @GetMapping("/review")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<Chapter>> getChaptersForReview(
            @RequestParam(defaultValue = "PENDING") String approvalStatus,
            @RequestParam(required = false) String storyId) {
        Query query = new Query().with(Sort.by(Sort.Direction.DESC, "updatedAt"));
        if (storyId != null && !storyId.isBlank()) {
            query.addCriteria(Criteria.where("storyId").is(storyId));
        }
        applyApprovalFilter(query, approvalStatus);
        return ResponseEntity.ok(mongoTemplate.find(query, Chapter.class));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getChapterById(@PathVariable String id) {
        Optional<Chapter> chapterOpt = chapterRepository.findById(id);
        if (chapterOpt.isEmpty()) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Chapter not found!"));
        }

        Chapter chapter = chapterOpt.get();
        Optional<Story> storyOpt = storyRepository.findById(chapter.getStoryId());
        if (storyOpt.isEmpty()) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Story not found!"));
        }

        Story story = storyOpt.get();
        UserDetailsImpl currentUser = getCurrentUserOrNull();
        boolean admin = isAdmin(currentUser);

        boolean visible = canViewStory(story, currentUser, admin)
                && canAccessLicensedStory(story, currentUser, admin)
                && (isApprovedForPublic(chapter) || canManageStory(story, currentUser, admin));

        if (!visible) {
            if (isApprovedForPublic(story)
                    && Boolean.TRUE.equals(story.getLicensed())
                    && !canManageStory(story, currentUser, admin)
                    && !hasPurchasedStory(story, currentUser)) {
                return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED)
                        .body(new MessageResponse("Error: Buy this licensed story before reading."));
            }

            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(new MessageResponse("Error: Chapter not found!"));
        }

        return ResponseEntity.ok(chapter);
    }

    @PostMapping
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<?> createChapter(@Valid @RequestBody ChapterRequest request) {
        UserDetailsImpl currentUser = requireCurrentUser();
        boolean admin = isAdmin(currentUser);

        Optional<Story> storyOpt = storyRepository.findById(request.getStoryId());
        if (storyOpt.isEmpty()) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Story not found!"));
        }

        Story story = storyOpt.get();
        if (!canManageStory(story, currentUser, admin)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(new MessageResponse("Error: You do not have permission to add chapters to this story."));
        }

        Chapter existingChapter = chapterRepository.findByStoryIdAndChapterNumber(
                request.getStoryId(), request.getChapterNumber());
        if (existingChapter != null) {
            return ResponseEntity.badRequest()
                    .body(new MessageResponse("Error: Chapter number already exists in this story."));
        }

        Chapter chapter = new Chapter(request.getStoryId(), request.getChapterNumber(),
                request.getTitle(), request.getContent());
        chapter.setPages(request.getPages() != null ? new ArrayList<>(request.getPages()) : new ArrayList<>());
        chapter.setUploaderId(currentUser.getId());
        chapter.setUploaderUsername(currentUser.getUsername());
        chapter.setCreatedAt(new Date());
        chapter.setUpdatedAt(new Date());

        if (admin) {
            markReviewed(chapter, EApprovalStatus.APPROVED, currentUser, null);
        } else {
            markPending(chapter);
        }

        Chapter savedChapter = chapterRepository.save(chapter);
        if (admin && isApprovedForPublic(story)) {
            sendNewChapterNotifications(story, savedChapter);
        }

        return ResponseEntity.ok(savedChapter);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<?> updateChapter(@PathVariable String id, @Valid @RequestBody ChapterRequest request) {
        Optional<Chapter> chapterData = chapterRepository.findById(id);
        if (chapterData.isEmpty()) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Chapter not found!"));
        }

        Chapter chapter = chapterData.get();
        Optional<Story> storyOpt = storyRepository.findById(chapter.getStoryId());
        if (storyOpt.isEmpty()) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Story not found!"));
        }

        Story story = storyOpt.get();
        UserDetailsImpl currentUser = requireCurrentUser();
        boolean admin = isAdmin(currentUser);
        if (!canManageStory(story, currentUser, admin)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(new MessageResponse("Error: You do not have permission to update this chapter."));
        }

        Chapter existingChapter = chapterRepository.findByStoryIdAndChapterNumber(
                chapter.getStoryId(), request.getChapterNumber());
        if (existingChapter != null && !existingChapter.getId().equals(chapter.getId())) {
            return ResponseEntity.badRequest()
                    .body(new MessageResponse("Error: Chapter number already exists in this story."));
        }

        EApprovalStatus previousStatus = chapter.getApprovalStatus();
        chapter.setTitle(request.getTitle());
        chapter.setContent(request.getContent());
        chapter.setChapterNumber(request.getChapterNumber());
        chapter.setPages(request.getPages() != null ? new ArrayList<>(request.getPages()) : new ArrayList<>());
        chapter.setUpdatedAt(new Date());

        if (admin) {
            markReviewed(chapter, EApprovalStatus.APPROVED, currentUser, null);
        } else {
            markPending(chapter);
        }

        Chapter savedChapter = chapterRepository.save(chapter);
        if (admin && previousStatus != EApprovalStatus.APPROVED && isApprovedForPublic(story)) {
            sendNewChapterNotifications(story, savedChapter);
        }

        return ResponseEntity.ok(savedChapter);
    }

    @PutMapping("/{id}/approval")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> reviewChapter(@PathVariable String id, @Valid @RequestBody ModerationRequest request) {
        Optional<Chapter> chapterData = chapterRepository.findById(id);
        if (chapterData.isEmpty()) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Chapter not found!"));
        }

        Chapter chapter = chapterData.get();
        Optional<Story> storyOpt = storyRepository.findById(chapter.getStoryId());
        if (storyOpt.isEmpty()) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Story not found!"));
        }

        Story story = storyOpt.get();
        UserDetailsImpl currentUser = requireCurrentUser();
        EApprovalStatus previousStatus = chapter.getApprovalStatus();

        chapter.setUpdatedAt(new Date());
        markReviewed(chapter, request.getApprovalStatus(), currentUser, request.getReviewNote());
        Chapter savedChapter = chapterRepository.save(chapter);

        if (request.getApprovalStatus() == EApprovalStatus.APPROVED
                && previousStatus != EApprovalStatus.APPROVED
                && isApprovedForPublic(story)) {
            sendNewChapterNotifications(story, savedChapter);
        }

        return ResponseEntity.ok(savedChapter);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<?> deleteChapter(@PathVariable String id) {
        Optional<Chapter> chapterData = chapterRepository.findById(id);
        if (chapterData.isEmpty()) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Chapter not found!"));
        }

        Chapter chapter = chapterData.get();
        Optional<Story> storyOpt = storyRepository.findById(chapter.getStoryId());
        if (storyOpt.isEmpty()) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Story not found!"));
        }

        UserDetailsImpl currentUser = requireCurrentUser();
        boolean admin = isAdmin(currentUser);
        if (!canManageStory(storyOpt.get(), currentUser, admin)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(new MessageResponse("Error: You do not have permission to delete this chapter."));
        }

        chapterRepository.deleteById(id);
        return ResponseEntity.ok(new MessageResponse("Chapter deleted successfully!"));
    }

    private void sendNewChapterNotifications(Story story, Chapter chapter) {
        List<User> followers = userRepository.findByFollowedStoryIdsContaining(story.getId());
        for (User user : followers) {
            Notification notification = new Notification(
                    user.getId(),
                    "Chuong moi: " + chapter.getTitle(),
                    story.getId(),
                    chapter.getId());
            notificationRepository.save(notification);
        }
    }

    private void markPending(Chapter chapter) {
        chapter.setApprovalStatus(EApprovalStatus.PENDING);
        chapter.setReviewedAt(null);
        chapter.setReviewedById(null);
        chapter.setReviewedByUsername(null);
        chapter.setReviewNote(null);
    }

    private void markReviewed(Chapter chapter, EApprovalStatus approvalStatus, UserDetailsImpl reviewer, String reviewNote) {
        chapter.setApprovalStatus(approvalStatus);
        chapter.setReviewedAt(new Date());
        chapter.setReviewedById(reviewer.getId());
        chapter.setReviewedByUsername(reviewer.getUsername());
        chapter.setReviewNote(reviewNote == null || reviewNote.isBlank() ? null : reviewNote.trim());
    }

    private void applyApprovalFilter(Query query, String approvalStatus) {
        if (approvalStatus == null || approvalStatus.isBlank()) {
            return;
        }

        if (EApprovalStatus.APPROVED.name().equalsIgnoreCase(approvalStatus)) {
            query.addCriteria(new Criteria().orOperator(
                    Criteria.where("approvalStatus").is(EApprovalStatus.APPROVED.name()),
                    Criteria.where("approvalStatus").exists(false),
                    Criteria.where("approvalStatus").is(null)));
            return;
        }

        query.addCriteria(Criteria.where("approvalStatus").is(approvalStatus.toUpperCase()));
    }

    private boolean isApprovedForPublic(Story story) {
        return story.getApprovalStatus() == null || story.getApprovalStatus() == EApprovalStatus.APPROVED;
    }

    private boolean isApprovedForPublic(Chapter chapter) {
        return chapter.getApprovalStatus() == null || chapter.getApprovalStatus() == EApprovalStatus.APPROVED;
    }

    private boolean canViewStory(Story story, UserDetailsImpl currentUser, boolean admin) {
        return isApprovedForPublic(story) || admin || isOwner(story, currentUser);
    }

    private boolean canAccessLicensedStory(Story story, UserDetailsImpl currentUser, boolean admin) {
        if (!Boolean.TRUE.equals(story.getLicensed()) || (story.getUnlockPrice() != null && story.getUnlockPrice() <= 0L)) {
            return true;
        }

        return admin || isOwner(story, currentUser) || hasPurchasedStory(story, currentUser);
    }

    private boolean hasPurchasedStory(Story story, UserDetailsImpl currentUser) {
        if (currentUser == null) {
            return false;
        }

        return userRepository.findById(currentUser.getId())
                .map(User::getPurchasedStoryIds)
                .map(ids -> ids != null && ids.contains(story.getId()))
                .orElse(false);
    }

    private boolean canManageStory(Story story, UserDetailsImpl currentUser, boolean admin) {
        return admin || isOwner(story, currentUser);
    }

    private boolean isOwner(Story story, UserDetailsImpl currentUser) {
        return currentUser != null
                && story.getUploaderId() != null
                && story.getUploaderId().equals(currentUser.getId());
    }

    private boolean isAdmin(UserDetailsImpl currentUser) {
        return currentUser != null
                && currentUser.getAuthorities().stream()
                        .anyMatch(authority -> "ROLE_ADMIN".equals(authority.getAuthority()));
    }

    private UserDetailsImpl requireCurrentUser() {
        UserDetailsImpl userDetails = getCurrentUserOrNull();
        if (userDetails == null) {
            throw new RuntimeException("Authenticated user not found.");
        }
        return userDetails;
    }

    private UserDetailsImpl getCurrentUserOrNull() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null) {
            return null;
        }

        Object principal = authentication.getPrincipal();
        if (principal instanceof UserDetailsImpl userDetails) {
            return userDetails;
        }

        return null;
    }
}
