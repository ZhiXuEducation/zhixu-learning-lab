# ZHIXU 作文审题训练器

Buildless GitHub Pages app at `zhixu/essay.html`. No account, API or server required. Three Basic sets, 20 click-only MCQs each, five questions per verified essay task. Advanced remains explicitly unavailable. Learning centre links to trainer.

## Verified source ledger

Google Drive scans inspected visually, questions on PDF page 2 and publisher reference compositions on PDF page 4. All identify O-Level Higher Chinese, UCLES & MOE and Singapore Asia Publishers. Publisher references are not official SEAB mark schemes.

| Basic set | Year | Drive file ID | Source tasks |
|---|---|---|---|
| 1 | 2020 | 1P8reT-6vQhjNka2CwjoEfgzk4hX456Sb | Q4 rules and social change; Q5 hawker culture nomination |
| 1 | 2021 | 1qin5aMqsA5-r_DSms8_rBCjkIw4Ecq82 | Q4 language and cultural understanding; Q5 integrated facilities for seniors |
| 2 | 2022 | 1xeBgR2PB873NYN1tXPw_AhIij5bZm1Nf | Q4 international youth symposium speech; Q5 kiasu mindset |
| 2 | 2023 | 1GF8H4e1gvh_l-RH66-AgRYMI2ouigvWk | Q4 government/public cooperation in national crises; Q5 environment/economic growth tradeoff |
| 3 | 2019 | 13Di5nN23w1o8ax5m0nk0iOOw8A2KJK-Y | Q4 governance efficiency and rising expectations; Q5 compulsory outdoor training/resilience |
| 3 | 2024 | 1d-R9qEDLuJijm7qQwehJ04UcaFFTmWaP | Q4 school speech on information overload; Q5 cross-cultural contact/inclusion |

Set 1 checked 31 October 2026; new sets checked 1 November 2026. Twelve distinct source essay tasks. Preserve speech genre/audience/context in 2022/2024 Q4. Treat policy dates and survey statements as historical exam contexts, not present-day announcements.

## Content and rights approach

At the user's request the app embeds substantially rephrased teaching prompts, labeled adaptations, preserving topic and task constraints. No scans, full verbatim official prompts, publisher compositions or private Drive links are published. Drive permissions were not changed. No reproduction permission was found. SEAB rule checked previously: https://file.go.gov.sg/registration-information-for-gce-nao-level-school-candidates.pdf . Rephrasing is not represented as legal clearance. MCQs and explanations are original teaching analysis, not official grading or fabricated original exam questions. Open-ended essays may admit multiple reasonable positions.

## Data and storage

- `essay-data.js`: original Set 1, unchanged.
- `essay-more.js`: Sets 2 and 3.
- `essay.js`: set catalogue, routing and scoring.
- IDs are 1–20 within each set. Exact-match multi-select scoring, one point per question.
- Separate storage keys `zhixu-essay-basic-{1,2,3}-v1`. Set 1 keeps its original key and schema so existing progress/results remain readable.
- Only the selected set is overwritten when restarting/retrying it. A retry result is labeled as a retry, not a 20-point set result. Progress is local to the current browser.

## Validation on 1 November 2026

JavaScript syntax and data checks; all three 20-question browser flows; Set 1 20/20; Set 2 with deliberate single-answer error and multi-select omission 18/20; wrong-only filter shows two items and retry scores 2/2; Set 3 20/20. Missing-answer guard works. Switching sets and reloading preserves separate answers and results. Mobile and desktop layout inspected. Publish only after checks; verify GitHub Pages deployment and live page after publishing.
