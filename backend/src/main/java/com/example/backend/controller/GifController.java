package com.example.backend.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.util.UriComponentsBuilder;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity.BodyBuilder;

import java.util.Map;
import java.util.Set;

@CrossOrigin(origins = "*", maxAge = 3600)
@RestController
@RequestMapping("/api/gifs")
public class GifController {

    @Value("${giphy.api.key:}")
    private String giphyApiKey;

    private final RestTemplate restTemplate = new RestTemplate();

    @GetMapping("/search")
    public ResponseEntity<?> search(
            @RequestParam String q,
            @RequestParam(defaultValue = "12") int limit,
            @RequestParam(defaultValue = "g") String rating
    ) {
        if (giphyApiKey == null || giphyApiKey.isBlank()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "GIPHY API key missing"));
        }
        String url = UriComponentsBuilder.fromUriString("https://api.giphy.com/v1/gifs/search")
                .queryParam("api_key", giphyApiKey)
                .queryParam("q", q)
                .queryParam("limit", limit)
                .queryParam("rating", rating)
                .build(true)
                .toUriString();
        Object res = restTemplate.getForObject(url, Object.class);
        return ResponseEntity.ok(res);
    }

    @GetMapping("/trending")
    public ResponseEntity<?> trending(
            @RequestParam(defaultValue = "12") int limit,
            @RequestParam(defaultValue = "g") String rating
    ) {
        if (giphyApiKey == null || giphyApiKey.isBlank()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "GIPHY API key missing"));
        }
        String url = UriComponentsBuilder.fromUriString("https://api.giphy.com/v1/gifs/trending")
                .queryParam("api_key", giphyApiKey)
                .queryParam("limit", limit)
                .queryParam("rating", rating)
                .build(true)
                .toUriString();
        Object res = restTemplate.getForObject(url, Object.class);
        return ResponseEntity.ok(res);
    }

    private static final Set<String> ALLOWED_HOSTS = Set.of(
            "media.giphy.com",
            "media1.giphy.com",
            "media2.giphy.com",
            "media3.giphy.com",
            "media4.giphy.com",
            "i.giphy.com"
    );

    @GetMapping("/proxy")
    public ResponseEntity<?> proxyGif(@RequestParam String url) {
        if (url == null || url.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Missing url"));
        }
        if (giphyApiKey == null || giphyApiKey.isBlank()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "GIPHY API key missing"));
        }
        try {
            String decoded = java.net.URLDecoder.decode(url, java.nio.charset.StandardCharsets.UTF_8);
            java.net.URI uri = java.net.URI.create(decoded);
            String host = uri.getHost();
            if (host == null || ALLOWED_HOSTS.stream().noneMatch(host::equalsIgnoreCase)) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Host not allowed"));
            }
            ResponseEntity<byte[]> res = restTemplate.exchange(uri, HttpMethod.GET, HttpEntity.EMPTY, byte[].class);
            MediaType ct = res.getHeaders().getContentType();
            BodyBuilder builder = ResponseEntity.status(res.getStatusCode());
            if (ct != null) builder.contentType(ct);
            return builder.body(res.getBody());
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("error", "Proxy failed"));
        }
    }
}
