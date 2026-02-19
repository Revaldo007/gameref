package com.example.demo.dto;

import lombok.Data;

@Data
public class ContactRequestDTO {
    private String name;
    private String email;
    private String subject;
    private String message;
}
