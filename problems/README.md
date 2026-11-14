# Problem sets

`bank.json` is the exam-style problem set Curvelet uses in Study: the problems are mixed into Practice and the worksheet generator at their level and unit. The app ships with a copy, and **Get the latest set** in the Study tab downloads this file again, so problems added here reach installed apps without a new release.

The problems are new ones written in the style of the CSAT (수능) and its mock exams, not past exam questions.

## The problem pack

`npm run problems:pack` makes `problems/dist/curvelet-problems.zip`: one set per unit (대수, 미적분Ⅰ, 미적분Ⅱ, 확률과 통계, 기하) with the hand-written problems of that unit from `bank.json` and, for every template of the unit at the basic, advanced and exam levels, 20 problems with fixed numbers (about 1,600 in all). Open the zip as it is with **Open a set file** in the Study tab; it replaces the set in use, and **Use the built-in set** goes back. `node scripts/problem-pack.mjs 40` makes 40 per template.

## Format

```json
{
  "format": "curvelet-problems",
  "version": 1,
  "title": { "ko": "…", "en": "…" },
  "problems": [
    {
      "id": "g02",
      "unit": "geometry",
      "points": 4,
      "prompt": { "ko": "…", "en": "…" },
      "answer": 16,
      "solution": { "ko": ["…", "…"], "en": ["…", "…"] }
    }
  ]
}
```

| Field | Values |
|---|---|
| `id` | Unique within the file |
| `unit` | `algebra` (대수), `calculus` (미적분Ⅰ), `calc2` (미적분Ⅱ), `stats` (확률과 통계), `geometry` (기하): the 2022 curriculum names |
| `level` | Optional. Without it a problem goes by its points: 2 to basic, 3 to advanced, 4 to exam |
| `source` | Optional, for a 평가원 problem: year, month and number as `YYYYMMNN`, e.g. `20261103` for problem 3 of the November 2026 exam. Shown next to the points |
| `points` | 2, 3 or 4 |
| `prompt`, `solution` | Text with math between `$$…$$` as LaTeX; the solution is one line per step, the same number of lines in both languages |
| `answer` | A number. For a fraction answer, ask for p + q as the other problems do |

A problem that doesn't fit the format is skipped when the set loads, and the app says how many were skipped. `npm test` checks that every problem in this file reads.
