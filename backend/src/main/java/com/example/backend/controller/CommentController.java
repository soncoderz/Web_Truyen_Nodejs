package com.example.backend.controller;

import java.util.List;

import jakarta.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import com.example.backend.model.Comment;
import com.example.backend.model.Chapter;
import com.example.backend.payload.request.CommentRequest;
import com.example.backend.payload.response.MessageResponse;
import com.example.backend.repository.CommentRepository;
import com.example.backend.repository.ChapterRepository;
import com.example.backend.security.services.UserDetailsImpl;

@CrossOrigin(origins = "*", maxAge = 3600)
@RestController
@RequestMapping("/api/comments")
public class CommentController {

    @Autowired
    CommentRepository commentRepository;

    @Autowired
    ChapterRepository chapterRepository;

    @GetMapping("/story/{storyId}")
    public ResponseEntity<List<Comment>> getCommentsByStory(@PathVariable String storyId) {
        return ResponseEntity.ok(commentRepository.findByStoryIdOrderByCreatedAtDesc(storyId));
    }

    @GetMapping("/chapter/{chapterId}")
    public ResponseEntity<List<Comment>> getCommentsByChapter(@PathVariable String chapterId) {
        return ResponseEntity.ok(commentRepository.findByChapterIdAndPageIndexIsNullOrderByCreatedAtDesc(chapterId));
    }

    @GetMapping("/chapter/{chapterId}/page/{pageIndex}")
    public ResponseEntity<List<Comment>> getCommentsByPage(@PathVariable String chapterId, @PathVariable int pageIndex) {
        return ResponseEntity.ok(commentRepository.findByChapterIdAndPageIndexOrderByCreatedAtDesc(chapterId, pageIndex));
    }

    @PostMapping
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<?> createComment(@Valid @RequestBody CommentRequest request) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        UserDetailsImpl userDetails = (UserDetailsImpl) authentication.getPrincipal();

        Integer chapterNumber = null;
        if (request.getChapterId() != null && !request.getChapterId().isBlank()) {
            Chapter chapter = chapterRepository.findById(request.getChapterId()).orElse(null);
            if (chapter != null) {
                chapterNumber = chapter.getChapterNumber();
            }
        }
        if (chapterNumber == null) {
            chapterNumber = request.getChapterNumber();
        }

        if ((request.getContent() == null || request.getContent().trim().isEmpty())
                && (request.getGifUrl() == null || request.getGifUrl().trim().isEmpty())) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Comment content or GIF is required!"));
        }

        if (request.getGifSize() != null && request.getGifSize() > 2 * 1024 * 1024) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: GIF size must be <= 2MB!"));
        }

        Comment comment = new Comment(
            request.getStoryId(),
            request.getChapterId(),
            chapterNumber,
            request.getPageIndex(),
            userDetails.getId(),
            userDetails.getUsername(),
            request.getContent(),
            request.getGifUrl(),
            request.getGifSize()
        );
        comment.setPageIndex(request.getPageIndex());
        commentRepository.save(comment);
        return ResponseEntity.ok(comment);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('USER') or hasRole('ADMIN')")
    public ResponseEntity<?> deleteComment(@PathVariable String id) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        UserDetailsImpl userDetails = (UserDetailsImpl) authentication.getPrincipal();

        return commentRepository.findById(id).map(comment -> {
            boolean isAdmin = userDetails.getAuthorities().stream()
                    .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"));
            if (comment.getUserId().equals(userDetails.getId()) || isAdmin) {
                commentRepository.deleteById(id);
                return ResponseEntity.ok(new MessageResponse("Comment deleted successfully!"));
            }
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Not authorized!"));
        }).orElse(ResponseEntity.badRequest().body(new MessageResponse("Error: Comment not found!")));
    }
}
