package com.example.backend.controller;

import java.util.List;
import java.util.Optional;

import jakarta.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.backend.model.Author;
import com.example.backend.payload.request.AuthorRequest;
import com.example.backend.payload.response.MessageResponse;
import com.example.backend.repository.AuthorRepository;

@CrossOrigin(origins = "*", maxAge = 3600)
@RestController
@RequestMapping("/api/authors")
public class AuthorController {

    @Autowired
    AuthorRepository authorRepository;

    @GetMapping
    public ResponseEntity<List<Author>> getAllAuthors() {
        return ResponseEntity.ok(authorRepository.findAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getAuthorById(@PathVariable String id) {
        Optional<Author> author = authorRepository.findById(id);
        if (author.isPresent()) {
            return ResponseEntity.ok(author.get());
        } else {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Author not found!"));
        }
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> createAuthor(@Valid @RequestBody AuthorRequest request) {
        Author author = new Author(request.getName(), request.getDescription());
        authorRepository.save(author);
        return ResponseEntity.ok(author);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> updateAuthor(@PathVariable String id, @Valid @RequestBody AuthorRequest request) {
        Optional<Author> authorData = authorRepository.findById(id);

        if (authorData.isPresent()) {
            Author author = authorData.get();
            author.setName(request.getName());
            author.setDescription(request.getDescription());
            return ResponseEntity.ok(authorRepository.save(author));
        } else {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Author not found!"));
        }
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> deleteAuthor(@PathVariable String id) {
        if (!authorRepository.existsById(id)) {
            return ResponseEntity.badRequest().body(new MessageResponse("Error: Author not found!"));
        }
        authorRepository.deleteById(id);
        return ResponseEntity.ok(new MessageResponse("Author deleted successfully!"));
    }
}
