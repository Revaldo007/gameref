package com.example.demo.service;

import com.example.demo.dto.ContactRequestDTO;
import com.example.demo.dto.ContactResponseDTO;

public interface ContactService {
    ContactResponseDTO saveMessage(ContactRequestDTO request);
}
