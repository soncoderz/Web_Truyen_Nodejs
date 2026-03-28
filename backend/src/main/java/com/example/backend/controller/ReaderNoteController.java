package com.example.backend.controller;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

import jakarta.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.example.backend.model.Chapter;
import com.example.backend.model.EStoryType;
import com.example.backend.model.ReaderNote;
import com.example.backend.model.Story;
import com.example.backend.payload.request.ReaderNoteRequest;
import com.example.backend.payload.response.MessageResponse;
import com.example.backend.repository.ChapterRepository;
import com.example.backend.repository.ReaderNoteRepository;
import com.example.backend.repository.StoryRepository;
import com.example.backend.security.services.UserDetailsImpl;

@CrossOrigin(origins = "*", maxAge = 3600)
@RestController
@RequestMapping("/api/reader-notes")
public class ReaderNoteController {

    @Autowired
    ReaderNoteRepository readerNoteRepository;

    @Autowired
    StoryRepository storyRepository;

    @Autowired
    ChapterRepository chapterRepository;

    @GetMapping("/story/{storyId}/chapter/{chapterId}")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<?> getMyChapterNotes(@PathVariable String storyId, @PathVariable String chapterId) {
        UserDetailsImpl userDetails = requireCurrentUser();
        StoryChapterContext context = resolveContext(storyId, chapterId);
        if (context.error != null) {
            return ResponseEntity.badRequest().body(new MessageResponse(context.error));
        }

        return ResponseEntity.ok(readerNoteRepository.findByUserIdAndStoryIdAndChapterIdOrderByUpdatedAtDesc(
                userDetails.getId(),
                context.story.getId(),
                context.chapter.getId()));
    }

    @PostMapping
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<?> saveNote(@Valid @RequestBody ReaderNoteRequest request) {
        UserDetailsImpl userDetails = requireCurrentUser();
        String normalizedStoryId = normalizeId(request.getStoryId());
        String normalizedChapterId = normalizeId(request.getChapterId());
        String normalizedNote = normalizeNote(request.getNote());
        Integer pageIndex = request.getPageIndex();
        Integer paragraphIndex = request.getParagraphIndex();

        if (normalizedNote == null) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Note is required."));
        }

        if (pageIndex != null && paragraphIndex != null) {
            return ResponseEntity.badRequest()
                    .body(new MessageResponse("Error: Note can only target a page or a paragraph."));
        }

        if (pageIndex == null && paragraphIndex == null) {
            return ResponseEntity.badRequest()
                    .body(new MessageResponse("Error: Page or paragraph is required for note."));
        }

        StoryChapterContext context = resolveContext(normalizedStoryId, normalizedChapterId);
        if (context.error != null) {
            return ResponseEntity.badRequest().body(new MessageResponse(context.error));
        }

        String locationError = validateLocation(context.story, context.chapter, pageIndex, paragraphIndex);
        if (locationError != null) {
            return ResponseEntity.badRequest().body(new MessageResponse(locationError));
        }

        List<ReaderNote> chapterNotes = readerNoteRepository.findByUserIdAndStoryIdAndChapterIdOrderByUpdatedAtDesc(
                userDetails.getId(),
                context.story.getId(),
                context.chapter.getId());
        ReaderNote existing = findMatchingNote(chapterNotes, pageIndex, paragraphIndex);

        ReaderNote note = existing != null
                ? existing
                : new ReaderNote(
                        userDetails.getId(),
                        context.story.getId(),
                        context.chapter.getId(),
                        pageIndex,
                        paragraphIndex,
                        normalizedNote);

        note.setPageIndex(pageIndex);
        note.setParagraphIndex(paragraphIndex);
        note.setNote(normalizedNote);
        note.setUpdatedAt(new Date());

        return ResponseEntity.ok(readerNoteRepository.save(note));
    }

    @DeleteMapping("/story/{storyId}/chapter/{chapterId}")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<?> deleteNote(
            @PathVariable String storyId,
            @PathVariable String chapterId,
            @RequestParam(required = false) Integer pageIndex,
            @RequestParam(required = false) Integer paragraphIndex) {
        UserDetailsImpl userDetails = requireCurrentUser();
        StoryChapterContext context = resolveContext(storyId, chapterId);
        if (context.error != null) {
            return ResponseEntity.badRequest().body(new MessageResponse(context.error));
        }

        String locationError = validateLocation(context.story, context.chapter, pageIndex, paragraphIndex);
        if (locationError != null) {
            return ResponseEntity.badRequest().body(new MessageResponse(locationError));
        }

        List<ReaderNote> chapterNotes = readerNoteRepository.findByUserIdAndStoryIdAndChapterIdOrderByUpdatedAtDesc(
                userDetails.getId(),
                context.story.getId(),
                context.chapter.getId());
        ReaderNote existing = findMatchingNote(chapterNotes, pageIndex, paragraphIndex);
        if (existing != null) {
            readerNoteRepository.delete(existing);
        }

        return ResponseEntity.ok(new MessageResponse("Note deleted successfully!"));
    }

    private ReaderNote findMatchingNote(List<ReaderNote> notes, Integer pageIndex, Integer paragraphIndex) {
        return notes.stream()
                .filter(note -> Objects.equals(note.getPageIndex(), pageIndex))
                .filter(note -> Objects.equals(note.getParagraphIndex(), paragraphIndex))
                .findFirst()
                .orElse(null);
    }

    private String validateLocation(Story story, Chapter chapter, Integer pageIndex, Integer paragraphIndex) {
        if (story.getType() == EStoryType.MANGA) {
            if (paragraphIndex != null) {
                return "Error: Manga notes must target a page.";
            }
            if (pageIndex == null) {
                return "Error: Page is required for manga notes.";
            }
            if (pageIndex < 0 || chapter.getPages() == null || pageIndex >= chapter.getPages().size()) {
                return "Error: Page index is out of range.";
            }
            return null;
        }

        if (pageIndex != null) {
            return "Error: Novel notes must target a paragraph.";
        }
        if (paragraphIndex == null) {
            return "Error: Paragraph is required for novel notes.";
        }

        List<String> paragraphs = extractParagraphs(chapter.getContent());
        if (paragraphIndex < 0 || paragraphIndex >= paragraphs.size()) {
            return "Error: Paragraph index is out of range.";
        }

        return null;
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

    private StoryChapterContext resolveContext(String storyId, String chapterId) {
        String normalizedStoryId = normalizeId(storyId);
        String normalizedChapterId = normalizeId(chapterId);

        if (normalizedStoryId == null) {
            return StoryChapterContext.error("Error: Story is required.");
        }
        if (normalizedChapterId == null) {
            return StoryChapterContext.error("Error: Chapter is required.");
        }

        Optional<Story> storyOpt = storyRepository.findById(normalizedStoryId);
        if (storyOpt.isEmpty()) {
            return StoryChapterContext.error("Error: Story not found!");
        }

        Optional<Chapter> chapterOpt = chapterRepository.findById(normalizedChapterId);
        if (chapterOpt.isEmpty()) {
            return StoryChapterContext.error("Error: Chapter not found!");
        }

        Chapter chapter = chapterOpt.get();
        if (!Objects.equals(chapter.getStoryId(), normalizedStoryId)) {
            return StoryChapterContext.error("Error: Chapter does not belong to this story.");
        }

        return StoryChapterContext.ok(storyOpt.get(), chapter);
    }

    private UserDetailsImpl requireCurrentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return (UserDetailsImpl) authentication.getPrincipal();
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

        String normalized = value.replace("\r\n", "\n").trim();
        if (normalized.isEmpty()) {
            return null;
        }

        return normalized.length() > 4000 ? normalized.substring(0, 4000) : normalized;
    }

    private static class StoryChapterContext {
        private final Story story;
        private final Chapter chapter;
        private final String error;

        private StoryChapterContext(Story story, Chapter chapter, String error) {
            this.story = story;
            this.chapter = chapter;
            this.error = error;
        }

        private static StoryChapterContext ok(Story story, Chapter chapter) {
            return new StoryChapterContext(story, chapter, null);
        }

        private static StoryChapterContext error(String error) {
            return new StoryChapterContext(null, null, error);
        }
    }
}
