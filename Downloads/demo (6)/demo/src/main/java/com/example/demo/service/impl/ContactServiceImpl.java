package com.example.demo.service.impl;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

import com.example.demo.dto.*;
import com.example.demo.entity.ContactMessage;
import com.example.demo.repository.ContactRepository;
import com.example.demo.service.ContactService;

@Service
@RequiredArgsConstructor
public class ContactServiceImpl implements ContactService {

    private final ContactRepository contactRepository;

    @Override
    public ContactResponseDTO saveMessage(ContactRequestDTO request) {

        ContactMessage message = ContactMessage.builder()
                .name(request.getName())
                .email(request.getEmail())
                .subject(request.getSubject())
                .message(request.getMessage())
                .createdAt(LocalDateTime.now())
                .build();

        ContactMessage saved = contactRepository.save(message);

        return ContactResponseDTO.builder()
                .id(saved.getId())
                .name(saved.getName())
                .email(saved.getEmail())
                .subject(saved.getSubject())
                .message(saved.getMessage())
                .createdAt(saved.getCreatedAt())
                .build();
    }
}
