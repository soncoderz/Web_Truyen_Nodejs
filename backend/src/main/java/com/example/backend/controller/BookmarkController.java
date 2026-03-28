package com.example.backend.controller;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import jakarta.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import com.example.backend.model.Bookmark;
import com.example.backend.model.Chapter;
import com.example.backend.model.EApprovalStatus;
import com.example.backend.model.EStoryType;
import com.example.backend.model.Story;
import com.example.backend.payload.request.BookmarkRequest;
import com.example.backend.payload.response.BookmarkResponse;
import com.example.backend.payload.response.MessageResponse;
import com.example.backend.repository.BookmarkRepository;
import com.example.backend.repository.ChapterRepository;
import com.example.backend.repository.StoryRepository;
import com.example.backend.security.services.UserDetailsImpl;

@CrossOrigin(origins = "*", maxAge = 3600)
@RestController
@RequestMapping("/api/bookmarks")
public class BookmarkController {

    @Autowired
    BookmarkRepository bookmarkRepository;

    @Autowired
    StoryRepository storyRepository;

    @Autowired
    ChapterRepository chapterRepository;

    @GetMapping
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<List<BookmarkResponse>> getMyBookmarks() {
        UserDetailsImpl userDetails = requireCurrentUser();
        List<Bookmark> bookmarks = bookmarkRepository.findByUserIdOrderByCreatedAtDesc(userDetails.getId());
        return ResponseEntity.ok(toBookmarkResponses(normalizeBookmarks(bookmarks), userDetails));
    }

    @PostMapping
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<?> addBookmark(@Valid @RequestBody BookmarkRequest request) {
        UserDetailsImpl userDetails = requireCurrentUser();
        boolean admin = isAdmin(userDetails);

        Optional<Story> storyOpt = storyRepository.findById(request.getStoryId());
        if (storyOpt.isEmpty()) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Story not found!"));
        }

        Story story = storyOpt.get();
        if (!canViewStory(story, userDetails, admin)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(new MessageResponse("Error: You do not have permission to bookmark this story."));
        }

        String normalizedChapterId = normalizeId(request.getChapterId());
        Integer normalizedPageIndex = normalizeIndex(request.getPageIndex());
        Integer normalizedParagraphIndex = normalizeIndex(request.getParagraphIndex());
        String normalizedTextSnippet = normalizeTextSnippet(request.getTextSnippet());
        String normalizedNote = normalizeNote(request.getNote());

        if (normalizedPageIndex != null && normalizedParagraphIndex != null) {
            return ResponseEntity.badRequest()
                    .body(new MessageResponse("Error: Bookmark can only target a page or a paragraph."));
        }

        if ((normalizedPageIndex != null || normalizedParagraphIndex != null || normalizedTextSnippet != null)
                && normalizedChapterId == null) {
            return ResponseEntity.badRequest()
                    .body(new MessageResponse("Error: Chapter is required for page or paragraph bookmarks."));
        }

        if (normalizedTextSnippet != null && normalizedParagraphIndex == null) {
            return ResponseEntity.badRequest()
                    .body(new MessageResponse("Error: Paragraph index is required when saving text snippet."));
        }

        if (story.getType() == EStoryType.MANGA) {
            if (normalizedParagraphIndex != null || normalizedTextSnippet != null) {
                return ResponseEntity.badRequest()
                        .body(new MessageResponse("Error: Manga bookmarks must target a page."));
            }
        } else if (normalizedPageIndex != null) {
            return ResponseEntity.badRequest()
                    .body(new MessageResponse("Error: Novel bookmarks must target a paragraph."));
        }

        Chapter chapter = null;
        if (normalizedChapterId != null) {
            Optional<Chapter> chapterOpt = chapterRepository.findById(normalizedChapterId);
            if (chapterOpt.isEmpty()) {
                return ResponseEntity.badRequest().body(new MessageResponse("Error: Chapter not found!"));
            }

            chapter = chapterOpt.get();
            if (!Objects.equals(chapter.getStoryId(), story.getId())) {
                return ResponseEntity.badRequest().body(new MessageResponse("Error: Chapter does not belong to this story."));
            }
            if (!canViewChapter(chapter, story, userDetails, admin)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                        .body(new MessageResponse("Error: You do not have permission to bookmark this chapter."));
            }

            if (normalizedPageIndex != null) {
                if (normalizedPageIndex < 0
                        || chapter.getPages() == null
                        || normalizedPageIndex >= chapter.getPages().size()) {
                    return ResponseEntity.badRequest()
                            .body(new MessageResponse("Error: Page index is out of range."));
                }

                if (normalizedNote == null) {
                    normalizedNote = "Trang " + (normalizedPageIndex + 1);
                }
            }

            if (normalizedParagraphIndex != null) {
                List<String> paragraphs = extractParagraphs(chapter.getContent());
                if (normalizedParagraphIndex < 0 || normalizedParagraphIndex >= paragraphs.size()) {
                    return ResponseEntity.badRequest()
                            .body(new MessageResponse("Error: Paragraph index is out of range."));
                }

                if (normalizedTextSnippet == null) {
                    normalizedTextSnippet = buildTextSnippet(paragraphs.get(normalizedParagraphIndex));
                }

                if (normalizedNote == null) {
                    normalizedNote = "Doan " + (normalizedParagraphIndex + 1);
                }
            }
        }

        List<Bookmark> storyBookmarks = findStoryBookmarks(userDetails.getId(), request.getStoryId());
        List<Bookmark> matchingBookmarks = findMatchingBookmarks(
                storyBookmarks,
                normalizedChapterId,
                normalizedPageIndex,
                normalizedParagraphIndex);
        Bookmark existing = pickPrimaryBookmark(matchingBookmarks);

        if (existing == null) {
            existing = pickPrimaryBookmark(storyBookmarks);
        }

        if (existing != null) {
            String existingId = existing.getId();

            if (!Objects.equals(normalizeId(existing.getChapterId()), normalizedChapterId)) {
                existing.setChapterId(normalizedChapterId);
            }
            if (!Objects.equals(existing.getPageIndex(), normalizedPageIndex)) {
                existing.setPageIndex(normalizedPageIndex);
            }
            if (!Objects.equals(existing.getParagraphIndex(), normalizedParagraphIndex)) {
                existing.setParagraphIndex(normalizedParagraphIndex);
            }
            if (!Objects.equals(existing.getTextSnippet(), normalizedTextSnippet)) {
                existing.setTextSnippet(normalizedTextSnippet);
            }
            if (!Objects.equals(existing.getNote(), normalizedNote)) {
                existing.setNote(normalizedNote);
            }

            existing = bookmarkRepository.save(existing);
            deleteStoryBookmarksExcept(storyBookmarks, existingId);

            return ResponseEntity.ok(toBookmarkResponse(existing, userDetails));
        }

        Bookmark bookmark = new Bookmark(
                userDetails.getId(),
                request.getStoryId(),
                normalizedChapterId,
                normalizedPageIndex,
                normalizedParagraphIndex,
                normalizedTextSnippet,
                normalizedNote);
        bookmark = bookmarkRepository.save(bookmark);
        deleteStoryBookmarksExcept(storyBookmarks, bookmark.getId());
        return ResponseEntity.ok(toBookmarkResponse(bookmark, userDetails));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<?> deleteBookmark(@PathVariable String id) {
        UserDetailsImpl userDetails = requireCurrentUser();

        Optional<Bookmark> bookmarkOpt = bookmarkRepository.findById(id);
        if (bookmarkOpt.isEmpty()) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Bookmark not found!"));
        }

        Bookmark bookmark = bookmarkOpt.get();
        if (!Objects.equals(bookmark.getUserId(), userDetails.getId())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(new MessageResponse("Error: You do not have permission to delete this bookmark."));
        }

        List<Bookmark> storyBookmarks = findStoryBookmarks(bookmark.getUserId(), bookmark.getStoryId());
        if (!storyBookmarks.isEmpty()) {
            bookmarkRepository.deleteAll(storyBookmarks);
        } else {
            bookmarkRepository.delete(bookmark);
        }

        return ResponseEntity.ok(new MessageResponse("Bookmark deleted successfully!"));
    }

    private List<BookmarkResponse> toBookmarkResponses(List<Bookmark> bookmarks, UserDetailsImpl currentUser) {
        List<BookmarkResponse> responses = new ArrayList<>();
        for (Bookmark bookmark : bookmarks) {
            responses.add(toBookmarkResponse(bookmark, currentUser));
        }
        return responses;
    }

    private BookmarkResponse toBookmarkResponse(Bookmark bookmark, UserDetailsImpl currentUser) {
        boolean admin = isAdmin(currentUser);
        Story story = storyRepository.findById(bookmark.getStoryId())
                .filter(savedStory -> canViewStory(savedStory, currentUser, admin))
                .orElse(null);

        Chapter chapter = null;
        String chapterId = normalizeId(bookmark.getChapterId());
        if (chapterId != null && story != null) {
            chapter = chapterRepository.findById(chapterId)
                    .filter(savedChapter -> canViewChapter(savedChapter, story, currentUser, admin))
                    .orElse(null);
        }

        return new BookmarkResponse(bookmark, story, chapter);
    }

    private List<Bookmark> normalizeBookmarks(List<Bookmark> bookmarks) {
        Map<String, List<Bookmark>> bookmarksByStory = new LinkedHashMap<>();
        for (Bookmark bookmark : bookmarks) {
            bookmarksByStory
                    .computeIfAbsent(bookmark.getStoryId(), ignored -> new ArrayList<>())
                    .add(bookmark);
        }

        List<Bookmark> normalizedBookmarks = new ArrayList<>();
        for (List<Bookmark> storyBookmarks : bookmarksByStory.values()) {
            Bookmark primaryBookmark = pickPrimaryBookmark(storyBookmarks);
            if (primaryBookmark != null) {
                normalizedBookmarks.add(primaryBookmark);
            }
        }

        normalizedBookmarks.sort(bookmarkPreferenceComparator());
        return normalizedBookmarks;
    }

    private List<Bookmark> findStoryBookmarks(String userId, String storyId) {
        return bookmarkRepository.findByUserIdAndStoryId(userId, storyId).stream()
                .sorted(bookmarkPreferenceComparator())
                .toList();
    }

    private List<Bookmark> findMatchingBookmarks(
            List<Bookmark> storyBookmarks,
            String chapterId,
            Integer pageIndex,
            Integer paragraphIndex) {
        return storyBookmarks.stream()
                .filter(bookmark -> Objects.equals(normalizeId(bookmark.getChapterId()), chapterId))
                .filter(bookmark -> Objects.equals(bookmark.getPageIndex(), pageIndex))
                .filter(bookmark -> Objects.equals(bookmark.getParagraphIndex(), paragraphIndex))
                .toList();
    }

    private Bookmark pickPrimaryBookmark(List<Bookmark> bookmarks) {
        if (bookmarks.isEmpty()) {
            return null;
        }
        return bookmarks.stream()
                .sorted(bookmarkPreferenceComparator())
                .findFirst()
                .orElse(null);
    }

    private void deleteStoryBookmarksExcept(List<Bookmark> storyBookmarks, String bookmarkIdToKeep) {
        List<Bookmark> bookmarksToDelete = storyBookmarks.stream()
                .filter(bookmark -> !bookmark.getId().equals(bookmarkIdToKeep))
                .toList();
        if (!bookmarksToDelete.isEmpty()) {
            bookmarkRepository.deleteAll(bookmarksToDelete);
        }
    }

    private Comparator<Bookmark> bookmarkPreferenceComparator() {
        return Comparator
                .comparingInt(this::bookmarkPriority)
                .reversed()
                .thenComparing(Bookmark::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder()));
    }

    private int bookmarkPriority(Bookmark bookmark) {
        int priority = 0;

        if (bookmark.getPageIndex() != null || bookmark.getParagraphIndex() != null) {
            priority += 4;
        }
        if (normalizeId(bookmark.getChapterId()) != null) {
            priority += 2;
        }
        if (bookmark.getTextSnippet() != null && !bookmark.getTextSnippet().isBlank()) {
            priority += 1;
        }

        return priority;
    }

    private String normalizeId(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private Integer normalizeIndex(Integer value) {
        return value;
    }

    private String normalizeNote(String note) {
        if (note == null) {
            return null;
        }
        String normalized = note.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String normalizeTextSnippet(String textSnippet) {
        if (textSnippet == null) {
            return null;
        }

        String normalized = textSnippet.replace("\r", " ").replace("\n", " ").trim();
        if (normalized.isEmpty()) {
            return null;
        }

        return normalized.length() > 240 ? normalized.substring(0, 240) : normalized;
    }

    private List<String> extractParagraphs(String content) {
        if (content == null || content.isBlank()) {
            return List.of();
        }

        String normalizedContent = content.replace("\r\n", "\n").trim();
        List<String> paragraphs = new ArrayList<>();

        String[] blocks = normalizedContent.split("\\n\\s*\\n");
        for (String block : blocks) {
            String paragraph = block.trim();
            if (!paragraph.isEmpty()) {
                paragraphs.add(paragraph);
            }
        }

        if (!paragraphs.isEmpty()) {
            return paragraphs;
        }

        String[] lines = normalizedContent.split("\\n");
        for (String line : lines) {
            String paragraph = line.trim();
            if (!paragraph.isEmpty()) {
                paragraphs.add(paragraph);
            }
        }

        return paragraphs;
    }

    private String buildTextSnippet(String paragraph) {
        String normalizedParagraph = paragraph.replace("\r", " ").replace("\n", " ").trim();
        if (normalizedParagraph.length() <= 140) {
            return normalizedParagraph;
        }
        return normalizedParagraph.substring(0, 140) + "...";
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

    private boolean canViewChapter(Chapter chapter, Story story, UserDetailsImpl currentUser, boolean admin) {
        return canViewStory(story, currentUser, admin)
                && (isApprovedForPublic(chapter) || admin || isOwner(story, currentUser));
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
