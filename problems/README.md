# Problem sets

`bank.json` is the exam-style problem set Curvelet uses in Study: the problems are mixed into Practice and the worksheet generator at their level and unit. The app ships with a copy, and **Get the latest set** in the Study tab downloads this file again, so problems added here reach installed apps without a new release.

The problems are new ones written in the style of the CSAT (수능) and its mock exams, not past exam questions.

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
      "level": "exam",
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
| `unit` | `algebra` (수학Ⅰ), `calculus` (수학Ⅱ), `calc2` (미적분), `stats` (확률과 통계), `geometry` (기하) |
| `level` | `basic`, `advanced` or `exam` (default `exam`) |
| `points` | 2, 3 or 4 |
| `prompt`, `solution` | Text with math between `$$…$$` as LaTeX; the solution is one line per step, the same number of lines in both languages |
| `answer` | A number. For a fraction answer, ask for p + q as the other problems do |

A problem that doesn't fit the format is skipped when the set loads, and the app says how many were skipped. `npm test` checks that every problem in this file reads.
