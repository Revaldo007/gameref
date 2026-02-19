package com.example.demo.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import com.example.demo.dto.*;
import com.example.demo.service.ContactService;

@RestController
@RequestMapping("/api/contact")
@RequiredArgsConstructor
@CrossOrigin(origins = "http://localhost:5174")
public class ContactController {

    private final ContactService contactService;

    @PostMapping
    public ContactResponseDTO saveMessage(@RequestBody ContactRequestDTO request) {
        return contactService.saveMessage(request);
    }
}
