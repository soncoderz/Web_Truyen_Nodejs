package com.example.backend.controller;

import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import jakarta.validation.Valid;

import org.bson.types.ObjectId;
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

import com.example.backend.model.Author;
import com.example.backend.model.Bookmark;
import com.example.backend.model.Category;
import com.example.backend.model.EApprovalStatus;
import com.example.backend.model.Story;
import com.example.backend.model.User;
import com.example.backend.payload.request.ModerationRequest;
import com.example.backend.payload.request.StoryRequest;
import com.example.backend.payload.response.HotStories;
import com.example.backend.payload.response.MessageResponse;
import com.example.backend.repository.AuthorRepository;
import com.example.backend.repository.BookmarkRepository;
import com.example.backend.repository.CategoryRepository;
import com.example.backend.repository.ChapterRepository;
import com.example.backend.repository.StoryRepository;
import com.example.backend.repository.UserRepository;
import com.example.backend.security.services.UserDetailsImpl;

@CrossOrigin(origins = "*", maxAge = 3600)
@RestController
@RequestMapping("/api/stories")
public class StoryController {

    @Autowired
    StoryRepository storyRepository;

    @Autowired
    CategoryRepository categoryRepository;

    @Autowired
    AuthorRepository authorRepository;

    @Autowired
    UserRepository userRepository;

    @Autowired
    BookmarkRepository bookmarkRepository;

    @Autowired
    ChapterRepository chapterRepository;

    @Autowired
    MongoTemplate mongoTemplate;

    @GetMapping
    public ResponseEntity<List<Story>> getAllStories() {
        Query query = new Query()
                .addCriteria(approvedStoryCriteria())
                .with(Sort.by(Sort.Direction.DESC, "updatedAt"));
        return ResponseEntity.ok(mongoTemplate.find(query, Story.class));
    }

    @GetMapping("/manage")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<Story>> getManageStories(
            @RequestParam(required = false) String approvalStatus) {
        Query query = new Query().with(Sort.by(Sort.Direction.DESC, "updatedAt"));
        applyApprovalFilter(query, approvalStatus);
        return ResponseEntity.ok(mongoTemplate.find(query, Story.class));
    }

    @GetMapping("/mine")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<List<Story>> getMyStories() {
        UserDetailsImpl userDetails = requireCurrentUser();
        return ResponseEntity.ok(storyRepository.findByUploaderIdOrderByUpdatedAtDesc(userDetails.getId()));
    }

    @GetMapping("/review")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<Story>> getStoriesForReview(
            @RequestParam(defaultValue = "PENDING") String approvalStatus) {
        Query query = new Query().with(Sort.by(Sort.Direction.DESC, "updatedAt"));
        applyApprovalFilter(query, approvalStatus);
        return ResponseEntity.ok(mongoTemplate.find(query, Story.class));
    }

    @GetMapping("/trending")
    public ResponseEntity<List<Story>> getTrendingStories(@RequestParam(defaultValue = "10") int limit) {
        Query query = new Query()
                .addCriteria(approvedStoryCriteria())
                .with(Sort.by(Sort.Direction.DESC, "views"))
                .limit(limit);
        return ResponseEntity.ok(mongoTemplate.find(query, Story.class));
    }

    @GetMapping("/new-releases")
    public ResponseEntity<List<Story>> getNewReleases(@RequestParam(defaultValue = "10") int limit) {
        Query query = new Query()
                .addCriteria(approvedStoryCriteria())
                .with(Sort.by(Sort.Direction.DESC, "updatedAt"))
                .limit(limit);
        return ResponseEntity.ok(mongoTemplate.find(query, Story.class));
    }

    @GetMapping("/licensed")
    public ResponseEntity<List<Story>> getLicensedStories(@RequestParam(defaultValue = "10") int limit) {
        Query query = new Query()
                .addCriteria(new Criteria().andOperator(
                        approvedStoryCriteria(),
                        Criteria.where("licensed").is(true),
                        Criteria.where("unlockPrice").gt(0L)))
                .with(Sort.by(Sort.Direction.DESC, "updatedAt"))
                .limit(limit);
        return ResponseEntity.ok(mongoTemplate.find(query, Story.class));
    }

    @GetMapping("/hot")
    public ResponseEntity<HotStories> getHotStories(@RequestParam(defaultValue = "10") int limit) {
        Query topByViewsQuery = new Query()
                .addCriteria(approvedStoryCriteria())
                .with(Sort.by(Sort.Direction.DESC, "views"))
                .limit(limit);

        Query topByRatingQuery = new Query()
                .addCriteria(approvedStoryCriteria())
                .with(Sort.by(Sort.Direction.DESC, "averageRating"))
                .limit(limit);

        List<Story> topByViews = mongoTemplate.find(topByViewsQuery, Story.class);
        List<Story> topByRating = mongoTemplate.find(topByRatingQuery, Story.class);

        return ResponseEntity.ok(new HotStories(topByViews, topByRating));
    }

    @GetMapping("/recommendations")
    public ResponseEntity<List<Story>> getRecommendations(
            @RequestParam(required = false) String userId,
            @RequestParam(defaultValue = "10") int limit) {

        if (userId != null && !userId.isBlank()) {
            List<Bookmark> bookmarks = bookmarkRepository.findByUserIdOrderByCreatedAtDesc(userId);
            if (!bookmarks.isEmpty()) {
                Set<String> categoryIds = new HashSet<>();
                Set<String> bookmarkedStoryIds = new HashSet<>();

                for (Bookmark bookmark : bookmarks) {
                    bookmarkedStoryIds.add(bookmark.getStoryId());
                    storyRepository.findById(bookmark.getStoryId()).ifPresent(story -> {
                        if (isApprovedForPublic(story)) {
                            story.getCategories().forEach(category -> categoryIds.add(category.getId()));
                        }
                    });
                }

                if (!categoryIds.isEmpty()) {
                    Query query = new Query();
                    query.addCriteria(approvedStoryCriteria());
                    query.addCriteria(Criteria.where("categories.$id").in(
                            categoryIds.stream().map(ObjectId::new).toList()));
                    if (!bookmarkedStoryIds.isEmpty()) {
                        query.addCriteria(Criteria.where("_id").nin(
                                bookmarkedStoryIds.stream().map(ObjectId::new).toList()));
                    }
                    query.with(Sort.by(Sort.Direction.DESC, "averageRating"));
                    query.limit(limit);

                    List<Story> recommended = mongoTemplate.find(query, Story.class);
                    if (!recommended.isEmpty()) {
                        return ResponseEntity.ok(recommended);
                    }
                }
            }
        }

        Query query = new Query()
                .addCriteria(approvedStoryCriteria())
                .with(Sort.by(Sort.Direction.DESC, "averageRating"))
                .limit(limit);
        return ResponseEntity.ok(mongoTemplate.find(query, Story.class));
    }

    @GetMapping("/followed")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<List<Story>> getFollowedStories() {
        UserDetailsImpl userDetails = requireCurrentUser();
        Optional<User> userOpt = userRepository.findById(userDetails.getId());

        if (userOpt.isPresent()) {
            User user = userOpt.get();
            List<String> followedIds = user.getFollowedStoryIds();
            if (followedIds != null && !followedIds.isEmpty()) {
                List<Story> stories = storyRepository.findAllById(followedIds).stream()
                        .filter(this::isApprovedForPublic)
                        .toList();
                return ResponseEntity.ok(stories);
            }
        }

        return ResponseEntity.ok(List.of());
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getStoryById(@PathVariable String id) {
        Optional<Story> storyOpt = storyRepository.findById(id);
        if (storyOpt.isEmpty()) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Story not found!"));
        }

        Story story = storyOpt.get();
        UserDetailsImpl currentUser = getCurrentUserOrNull();
        if (!canViewStory(story, currentUser, isAdmin(currentUser))) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(new MessageResponse("Error: Story not found!"));
        }

        return ResponseEntity.ok(story);
    }

    @GetMapping("/search")
    public ResponseEntity<List<Story>> searchStories(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String categoryId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String type) {

        Query query = new Query();
        List<Criteria> criteria = new ArrayList<>();
        criteria.add(approvedStoryCriteria());

        if (keyword != null && !keyword.isBlank()) {
            criteria.add(new Criteria().orOperator(
                    Criteria.where("title").regex(keyword, "i"),
                    Criteria.where("description").regex(keyword, "i")));
        }

        if (categoryId != null && !categoryId.isBlank()) {
            criteria.add(Criteria.where("categories.$id").is(new ObjectId(categoryId)));
        }

        if (status != null && !status.isBlank()) {
            criteria.add(Criteria.where("status").is(status));
        }

        if (type != null && !type.isBlank()) {
            criteria.add(Criteria.where("type").is(type));
        }

        query.addCriteria(new Criteria().andOperator(criteria.toArray(new Criteria[0])));
        query.with(Sort.by(Sort.Direction.DESC, "updatedAt"));

        return ResponseEntity.ok(mongoTemplate.find(query, Story.class));
    }

    @PostMapping
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<?> createStory(@Valid @RequestBody StoryRequest request) {
        UserDetailsImpl userDetails = requireCurrentUser();
        boolean admin = isAdmin(userDetails);

        Story story = new Story();
        applyStoryRequest(story, request, true, admin);
        String pricingError = validateStoryPricing(story);
        if (pricingError != null) {
            return ResponseEntity.badRequest().body(new MessageResponse(pricingError));
        }
        story.setUploaderId(userDetails.getId());
        story.setUploaderUsername(userDetails.getUsername());
        story.setCreatedAt(new Date());
        story.setUpdatedAt(new Date());

        if (admin) {
            markReviewed(story, EApprovalStatus.APPROVED, userDetails, null);
        } else {
            markPending(story);
        }

        storyRepository.save(story);
        return ResponseEntity.ok(story);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<?> updateStory(@PathVariable String id, @Valid @RequestBody StoryRequest request) {
        Optional<Story> storyData = storyRepository.findById(id);
        if (storyData.isEmpty()) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Story not found!"));
        }

        UserDetailsImpl userDetails = requireCurrentUser();
        boolean admin = isAdmin(userDetails);
        Story story = storyData.get();

        if (!canManageStory(story, userDetails, admin)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(new MessageResponse("Error: You do not have permission to update this story."));
        }

        applyStoryRequest(story, request, false, admin);
        String pricingError = validateStoryPricing(story);
        if (pricingError != null) {
            return ResponseEntity.badRequest().body(new MessageResponse(pricingError));
        }
        story.setUpdatedAt(new Date());

        if (admin) {
            markReviewed(story, EApprovalStatus.APPROVED, userDetails, null);
        } else {
            markPending(story);
        }

        return ResponseEntity.ok(storyRepository.save(story));
    }

    @PutMapping("/{id}/approval")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> reviewStory(@PathVariable String id, @Valid @RequestBody ModerationRequest request) {
        Optional<Story> storyData = storyRepository.findById(id);
        if (storyData.isEmpty()) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Story not found!"));
        }

        UserDetailsImpl userDetails = requireCurrentUser();
        Story story = storyData.get();
        story.setUpdatedAt(new Date());
        markReviewed(story, request.getApprovalStatus(), userDetails, request.getReviewNote());

        return ResponseEntity.ok(storyRepository.save(story));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<?> deleteStory(@PathVariable String id) {
        Optional<Story> storyData = storyRepository.findById(id);
        if (storyData.isEmpty()) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Story not found!"));
        }

        UserDetailsImpl userDetails = requireCurrentUser();
        Story story = storyData.get();
        boolean admin = isAdmin(userDetails);
        if (!canManageStory(story, userDetails, admin)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(new MessageResponse("Error: You do not have permission to delete this story."));
        }

        chapterRepository.deleteByStoryId(id);
        storyRepository.deleteById(id);
        return ResponseEntity.ok(new MessageResponse("Story deleted successfully!"));
    }

    @PutMapping("/{id}/views")
    public ResponseEntity<?> incrementViews(@PathVariable String id) {
        Optional<Story> storyData = storyRepository.findById(id);
        if (storyData.isEmpty()) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Story not found!"));
        }

        Story story = storyData.get();
        if (!isApprovedForPublic(story)) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Story is not available!"));
        }

        story.setViews(story.getViews() + 1);
        return ResponseEntity.ok(storyRepository.save(story));
    }

    @PostMapping("/{id}/follow")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<?> followStory(@PathVariable String id) {
        UserDetailsImpl userDetails = requireCurrentUser();

        Optional<User> userOpt = userRepository.findById(userDetails.getId());
        Optional<Story> storyOpt = storyRepository.findById(id);

        if (userOpt.isEmpty() || storyOpt.isEmpty()) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Story or User not found!"));
        }

        Story story = storyOpt.get();
        if (!isApprovedForPublic(story)) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Story is not available!"));
        }

        User user = userOpt.get();
        if (user.getFollowedStoryIds() == null) {
            user.setFollowedStoryIds(new ArrayList<>());
        }

        if (!user.getFollowedStoryIds().contains(id)) {
            user.getFollowedStoryIds().add(id);
            story.setFollowers(story.getFollowers() + 1);
        } else {
            user.getFollowedStoryIds().remove(id);
            story.setFollowers(Math.max(0, story.getFollowers() - 1));
        }

        userRepository.save(user);
        storyRepository.save(story);
        return ResponseEntity.ok(java.util.Map.of(
                "isFollowing", user.getFollowedStoryIds().contains(id),
                "followers", story.getFollowers()));
    }

    @GetMapping("/{id}/is-following")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<?> isFollowing(@PathVariable String id) {
        UserDetailsImpl userDetails = requireCurrentUser();
        Optional<User> userOpt = userRepository.findById(userDetails.getId());

        if (userOpt.isPresent()) {
            User user = userOpt.get();
            boolean following = user.getFollowedStoryIds() != null && user.getFollowedStoryIds().contains(id);
            return ResponseEntity.ok(java.util.Map.of("isFollowing", following));
        }

        return ResponseEntity.ok(java.util.Map.of("isFollowing", false));
    }

    @GetMapping("/{id}/related")
    public ResponseEntity<?> getRelatedStories(@PathVariable String id) {
        Optional<Story> storyOpt = storyRepository.findById(id);
        if (storyOpt.isEmpty()) {
            return ResponseEntity.ok(List.of());
        }

        Story story = storyOpt.get();
        UserDetailsImpl currentUser = getCurrentUserOrNull();
        boolean admin = isAdmin(currentUser);
        if (!canViewStory(story, currentUser, admin)) {
            return ResponseEntity.ok(List.of());
        }

        List<Story> related = new ArrayList<>();
        if (story.getRelatedStoryIds() != null) {
            for (String relatedId : story.getRelatedStoryIds()) {
                storyRepository.findById(relatedId)
                        .filter(relatedStory -> canViewStory(relatedStory, currentUser, admin))
                        .ifPresent(related::add);
            }
        }

        return ResponseEntity.ok(related);
    }

    private void applyStoryRequest(Story story, StoryRequest request, boolean createMode, boolean allowPricingChanges) {
        story.setTitle(request.getTitle());
        story.setDescription(request.getDescription());

        if (request.getCoverImage() != null || createMode) {
            story.setCoverImage(request.getCoverImage());
        }

        if (request.getStatus() != null) {
            story.setStatus(request.getStatus());
        }

        if (request.getType() != null) {
            story.setType(request.getType());
        }

        if (allowPricingChanges) {
            if (request.getLicensed() != null || createMode) {
                story.setLicensed(Boolean.TRUE.equals(request.getLicensed()));
            }

            if (request.getUnlockPrice() != null || createMode || !Boolean.TRUE.equals(story.getLicensed())) {
                story.setUnlockPrice(Boolean.TRUE.equals(story.getLicensed())
                        ? normalizeUnlockPrice(request.getUnlockPrice())
                        : 0L);
            }
        } else if (createMode) {
            story.setLicensed(false);
            story.setUnlockPrice(0L);
        }

        if (request.getRelatedStoryIds() != null) {
            story.setRelatedStoryIds(new ArrayList<>(request.getRelatedStoryIds()));
        } else if (createMode) {
            story.setRelatedStoryIds(new ArrayList<>());
        }

        if (request.getCategoryIds() != null) {
            story.setCategories(resolveCategories(request.getCategoryIds()));
        } else if (createMode) {
            story.setCategories(new HashSet<>());
        }

        if (request.getAuthorIds() != null) {
            story.setAuthors(resolveAuthors(request.getAuthorIds()));
        } else if (createMode) {
            story.setAuthors(new HashSet<>());
        }
    }

    private String validateStoryPricing(Story story) {
        if (Boolean.TRUE.equals(story.getLicensed())
                && (story.getUnlockPrice() == null || story.getUnlockPrice() <= 0L)) {
            return "Error: Licensed stories must have a positive unlock price.";
        }

        return null;
    }

    private Long normalizeUnlockPrice(Long value) {
        if (value == null || value < 0L) {
            return 0L;
        }

        return value;
    }

    private Set<Category> resolveCategories(Set<String> categoryIds) {
        Set<Category> categories = new HashSet<>();
        categoryIds.forEach(categoryId -> {
            Category category = categoryRepository.findById(categoryId)
                    .orElseThrow(() -> new RuntimeException("Error: Category is not found."));
            categories.add(category);
        });
        return categories;
    }

    private Set<Author> resolveAuthors(Set<String> authorIds) {
        Set<Author> authors = new HashSet<>();
        authorIds.forEach(authorId -> {
            Author author = authorRepository.findById(authorId)
                    .orElseThrow(() -> new RuntimeException("Error: Author is not found."));
            authors.add(author);
        });
        return authors;
    }

    private void markPending(Story story) {
        story.setApprovalStatus(EApprovalStatus.PENDING);
        story.setReviewedAt(null);
        story.setReviewedById(null);
        story.setReviewedByUsername(null);
        story.setReviewNote(null);
    }

    private void markReviewed(Story story, EApprovalStatus approvalStatus, UserDetailsImpl reviewer, String reviewNote) {
        story.setApprovalStatus(approvalStatus);
        story.setReviewedAt(new Date());
        story.setReviewedById(reviewer.getId());
        story.setReviewedByUsername(reviewer.getUsername());
        story.setReviewNote(reviewNote == null || reviewNote.isBlank() ? null : reviewNote.trim());
    }

    private void applyApprovalFilter(Query query, String approvalStatus) {
        if (approvalStatus == null || approvalStatus.isBlank()) {
            return;
        }

        if (EApprovalStatus.APPROVED.name().equalsIgnoreCase(approvalStatus)) {
            query.addCriteria(approvedStoryCriteria());
            return;
        }

        query.addCriteria(Criteria.where("approvalStatus").is(approvalStatus.toUpperCase()));
    }

    private Criteria approvedStoryCriteria() {
        return new Criteria().orOperator(
                Criteria.where("approvalStatus").is(EApprovalStatus.APPROVED.name()),
                Criteria.where("approvalStatus").exists(false),
                Criteria.where("approvalStatus").is(null));
    }

    private boolean isApprovedForPublic(Story story) {
        return story.getApprovalStatus() == null || story.getApprovalStatus() == EApprovalStatus.APPROVED;
    }

    private boolean canViewStory(Story story, UserDetailsImpl currentUser, boolean admin) {
        return isApprovedForPublic(story) || admin || isOwner(story, currentUser);
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
