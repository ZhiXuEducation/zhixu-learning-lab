# ZHIXU 作文审题训练器

Entry: `zhixu/essay.html` (linked from learning centre).
Buildless HTML/CSS/JS, relative asset paths for GitHub Pages. No account, API or server required. Progress is browser-local and may be unavailable in private browsing.

## Verified sources

Connected Google Drive, inspected 31 October 2026:
- `o level paper 1 2020.pdf`, file ID `1P8reT-6vQhjNka2CwjoEfgzk4hX456Sb`
- `o level paper 1 2021.pdf`, file ID `1qin5aMqsA5-r_DSms8_rBCjkIw4Ecq82`

Both are Higher Chinese, not Express Chinese. PDF page 2 contains Q4/Q5; page 4 contains publisher reference compositions. Footers identify UCLES & MOE and Singapore Asia Publishers. Publisher reference answers are not official SEAB mark schemes.

The four source tasks concern the exclusivity of rules in social improvement, hawker culture heritage nomination, language as a prerequisite to understanding culture, and integrated facilities serving seniors. The 20 MCQs are original teaching analysis tied to these verified tasks; no replacement or fabricated exam prompt is presented.

## Copyright approach

The public app identifies year/question number and asks learners to consult legally held papers. It does not publish full exam prompts, scans, publisher compositions or private Drive links. Drive sharing was not altered. No permission to reproduce was found. SEAB rule checked: https://file.go.gov.sg/registration-information-for-gce-nao-level-school-candidates.pdf . This is an implementation choice to respect the stated restriction, not a claim of legal clearance for all derivative educational uses.

## Expansion

`essay-data.js` holds 20 questions: year, prompt, skill, options, zero-based answer array, explanation. Five per source prompt. Full set scores out of 20; exact-match scoring for multiple selections. Advanced and Sets 2–5 are explicitly marked unavailable. Future sets should have separate IDs/storage keys and verified source/rights review.

## Validation

JavaScript syntax checks; browser completion of all 20 questions with one intentional wrong answer (19/20); correct/incorrect explanations; missing-answer guard; retry of single wrong answer (1/1). Browser progress persistence and responsive layout checked separately before publishing.
