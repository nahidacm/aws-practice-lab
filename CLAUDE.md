# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AWS learning lab built around a single evolving app called **Tiny Notes Lab**. The app grows stage by stage, each stage introducing one new AWS service. The educational value comes from isolating AWS adoption — not from application complexity.

## Core Principles

- Keep the application intentionally minimal. Only add app behavior that justifies learning the next AWS service.
- Use plain HTML, CSS, and vanilla JavaScript unless a stage truly requires otherwise — no frameworks, no build steps.
- Output runnable code, not pseudo-code.
- Prefer free-tier-friendly AWS choices.
- Every stage should include a Mermaid architecture diagram and a short deployment guide.

## Stage Progression

| Stage | AWS Service(s) Added |
|-------|----------------------|
| 1 | S3 static website hosting |
| 2 | CloudFront (CDN, optional ACM) |
| 3 | API Gateway + Lambda + DynamoDB |
| 4 | Cognito (auth, per-user data) |
| 5 | SQS + DLQ (async processing) |
| 6 | S3 presigned URLs (file uploads) |
| 7 | EventBridge (scheduled automation) |
| 8 | CloudWatch (logs, metrics, alarms, dashboards) |

The same repo and the same app evolve across all stages — one codebase, eight layers of AWS.

## Standard AI Prompt Rules

Include these constraints in every stage prompt:

```
- Keep the app intentionally tiny
- Prefer plain HTML/CSS/JS unless a stage truly needs otherwise
- Avoid complex domain logic
- Avoid overengineering
- Output runnable code, not pseudo-code
- Explain AWS resources briefly
- Include a Mermaid architecture diagram
- Include a short deployment guide
- Keep costs and free-tier friendliness in mind
```

## Notes Data Model (Stage 3+)

Minimal DynamoDB schema: `id`, `text`, `createdAt`. Extended in later stages with `processedStatus`, `processedAt`, `summary` (Stage 5) and attachment metadata (Stage 6).

## Repository Structure

The repo is expected to evolve as a single project. Resist adding separate directories per stage — keep one evolving codebase updated in place.
