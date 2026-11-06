> **Historical document — not current setup instructions.** This records the earlier Supabase/Vercel design. Current runtime uses direct PostgreSQL; use [README.md](README.md), [db/README.md](db/README.md), and [deploy/README.md](deploy/README.md). Do not execute legacy SQL or seeding commands from this document.

# Prompt Engineering Challenge Platform

## Project Summary

This project is a web-based prompt engineering challenge platform for LLMs and eventually VLMs. The initial MVP focuses on text-only synthetic, non-PHI radiology reports.

The platform allows organizers/admins to create structured prompt engineering challenges. Participants receive a task, write and refine prompts, test them against sample reports, receive quantitative feedback, and submit final prompts for scoring.

The first use case is a knee MRI report extraction challenge.

## Important Context

This project is being developed with Dr. Po-Hao Chen and Dr. Chintan Shah.

The first version should be simple and end-to-end rather than feature-complete. The goal is to build a working platform that can support a workshop or small conference-style exercise with around 50 participants.

The project should prioritize:
- clean architecture
- reliable scoring
- simple participant workflow
- admin/participant separation
- support for public and private testing sets
- synthetic non-PHI data only

## Current Tech Stack

Use:

- Next.js
- TypeScript
- Tailwind CSS
- GitHub
- Vercel
- Supabase later for database/auth
- OpenRouter later for model API calls

Do not use the old Buildman/Vite prototype as the main codebase. It can be used only as a UI/design reference.

## Old Prototype Reference

There is an older Buildman/Vite prototype that may contain useful UI ideas, including:

- landing page
- challenge workspace
- prompt editor
- task/sidebar layout
- results panel
- leaderboard page
- mock challenge data
- mock scoring logic

However, the real project should be rebuilt cleanly in Next.js.

Do not directly depend on the old prototype architecture, localStorage-only workflow, or fake scoring logic. Recreate only the useful UI concepts in clean Next.js components.

## MVP Goal

Build a working MVP where:

1. A participant enters an assigned participant ID.
2. The participant sees an active challenge.
3. The participant reads task instructions and output schema.
4. The participant writes a prompt.
5. The prompt is run against a small sample set of synthetic MRI reports.
6. The model output is expected to be structured JSON.
7. The app scores the structured output against answer keys.
8. The participant can submit to a public testing set for feedback.
9. The participant can make a final private submission.
10. A leaderboard shows final/private scores.

## First Challenge

The initial task is text-only knee MRI report extraction.

Participants receive synthetic MRI reports and must write prompts that extract structured findings.

Input:
- synthetic knee MRI report text

Output:
- structured JSON

Initial fields:

- acl_tear
- mcl_injury
- meniscus_tear
- fracture
- osteoarthritis
- effusion

Each field should have one of these values:

- present
- absent
- uncertain

Example output:

```json
{
  "acl_tear": "present",
  "mcl_injury": "absent",
  "meniscus_tear": "present",
  "fracture": "absent",
  "osteoarthritis": "uncertain",
  "effusion": "present"
}