# Math Platform: Build Plan

Working name: TBD. Reference for interaction: Desmos (expression list, live graph). This project uses its own name, look and features.

## 1. Goal

A free math platform for students, teachers and anyone curious. One shared workspace powers many tools: scientific calculator, symbolic math (calculus, algebra), equation solver, 2D/3D/complex graphs, geometry, statistics, and exam-style figures that export cleanly.

Release order: **Web (PWA) → mobile apps (iOS/Android) → desktop apps → app stores.**

## 2. Core concept: one workspace, shared definitions

```
let f(x) = x^3 - 6x^2 + 11x - 6
let a = 2                  // can be changed and turned into a slider
const g = 9.81             // locked; redefining it is an error

f'(x)          → 3x² − 12x + 11
∫ f(x) dx      → x⁴/4 − 2x³ + 11x²/2 − 6x + C
factor(f(x))   → (x − 1)(x − 2)(x − 3)     [⇄ expand]
solve(f(x)=0)  → x = 1, 2, 3
```

- Every tool reads the same definitions.
- A dependency graph recomputes whatever uses a definition when it changes.
- Circular definitions (a depends on b, b depends on a) and redefining a `const` show clear error messages.
- The Definitions panel lists every `let` and `const`, where you can edit, rename or delete them.

## 3. Feature list

### Scientific calculator
- Exact ⇄ decimal toggle, history you can re-run, DEG/RAD switch
- Constants and units
- Copy results as LaTeX

### Symbolic math
- Derivatives: `f'`, `f''`, `d/dx`, partial `∂/∂y`
- Integrals: indefinite and definite, with a labeled numeric fallback when no exact answer exists
- Limits, Taylor series, `Σ`, `Π`
- Factor ⇄ expand button on every result; simplify, partial fractions, substitution `f(x) | x=2`

### Equation calculator
- Single equations, systems, polynomial roots, inequalities
- Numeric fallback (Newton's method)
- Step-by-step working (later)

### Matrices and vectors
- Arithmetic, determinant, inverse, transpose, rank, RREF (reduced row echelon form)
- Eigenvalues and eigenvectors
- Dot product, cross product, norm

### Statistics
- Lists and tables
- Mean, median, standard deviation, quartiles
- Regression: linear, polynomial, exponential, log, power, with R²
- Distributions (normal, binomial)

### Number theory and number bases
- `gcd`, `lcm`, `mod`, primality testing, prime factorization, `nCr`, `nPr`
- Base conversion: binary, octal, hex, any base 2–36

### Complex numbers
- Calculator with `i`, `a+bi`, `r∠θ`, `conj`, `arg`, `|z|`
- 2D complex graph using domain coloring: hue shows the angle (arg), brightness shows the size |f|
- 3D complex surface: height is |f(z)|, color is arg

### Graphing
- 2D: explicit, implicit, inequalities, parametric, polar, domain limits, piecewise, sliders, trace, roots, intersections and extrema
- 3D real: `z = f(x,y)`, parametric surfaces, rotate and zoom

### Geometry
- Points, segments, lines, rays, circles, polygons
- Constructions: intersection, midpoint, perpendicular, parallel, angle bisector, tangent
- Drag points and everything built from them updates
- Labels, angle marks, tick marks for equal lengths, measurements

### Exam-style figures (수능 style)
A **figure mode** that renders any graph or geometry construction in the visual style of Korean exam papers:
- Monochrome; thin, consistent line widths; no grid
- Axes with arrowheads; italic *x*, *y* labels; origin labeled **O**
- Points labeled with italic letters (A, B, P)
- Dashed helper lines from points to the axes
- Only the tick values you choose are shown
- Shaded regions in light gray or hatching
- Serif math font (for example, STIX Two / Nanum Myeongjo)
- Size presets that match exam-paper column widths
- Only original figures; actual exam problems aren't reproduced

### Export and sharing
- PNG at 1×, 2×, 300 dpi and 600 dpi, with a transparent background option
- SVG, PDF, LaTeX/TikZ
- HWP-friendly output: to be tested
- Share links containing the workspace state, compressed into the URL; no server needed at first
- Embed snippet for websites

### Formulas tab
- Library by subject: algebra, geometry, trig, calculus, statistics, physics
- Tapping a formula inserts it as a `let` with fields to fill in
- **Used formulas**: recently used, plus favorites

### Learning
- **Step-by-step solutions** for derivatives, integrals and equations, with a one-line explanation per step ("chain rule: outer function sin, inner function x²")
  - Derivatives: own rule engine (sum, product, quotient, chain rules)
  - Integrals: built on SymPy's `integral_steps`, which records the method used at each step (substitution, integration by parts, …)
  - Equations: own rules for linear, quadratic, factorable, rational and simple trig/exponential equations; anything else falls back to "solved numerically"
- **Explain this graph** panel: domain, intercepts, where the graph rises or falls, maxima and minima, concavity, asymptotes, and symmetry, in Korean or English
- **Practice mode**: generates similar problems from a template (same structure, new numbers), checks answers by testing whether they're mathematically equal rather than comparing text, then shows the steps

### Input
- **Typing in plain words**: "derivative of sin x squared" → `d/dx sin(x²)`. A rule-based grammar in Korean and English ("x제곱의 미분"). The expression it produced is always shown so you can check it.
- **Handwriting**: draw on the canvas or with a stylus → expression
- **Photo**: take a picture of a printed or handwritten problem → expression
- For handwriting and photos, the recognized expression always opens for editing before it's used

### Advanced graphs
- **Animation**: play/pause/loop button on any slider, adjustable speed, export as GIF / MP4 / WebM
- **Sequences and recurrences**: `a(n+1) = 2a(n) + 1`, shown as a term table, a dot plot and a cobweb diagram
- **Differential equations**: slope fields; click anywhere to draw the solution curve through that point; systems of equations shown as phase portraits
- **Vector fields**: `F(x,y) = (P, Q)`, drawn as arrows or streamlines
- **Probability distributions**: normal, binomial, t, χ², Poisson, with shaded areas such as `P(a ≤ X ≤ b)`, which also work in figure mode

### Teacher tools
- **Exam figure templates**: ready-made constructions you change with your own numbers, such as a graph with a tangent line, the area between curves, a triangle inside a circle, intersection points with dashed helper lines, and a function with a region over an interval
- **Worksheet builder**: arrange figures, problems (math text) and answer space on A4 / B4 / Letter pages, with 1 or 2 columns, problem numbers and an answer key page; export to PDF / PNG
- **Classroom mode**: the teacher shares a workspace by code or link; students work in their own copy; the teacher sees every student's work live and can show one to the class. Needs accounts and a server, so it's in the online phase.

### Accessibility and languages
- Korean and English from day one
- Keyboard-first input and an on-screen math keypad
- Screen-reader descriptions of graphs, audio trace (curves played as sound), high-contrast mode
- WCAG AA

## 4. Architecture

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript | One language for web, apps and engine |
| Build | Vite, npm workspaces monorepo | Fast; packages can be shared between apps; no extra tool to install |
| UI | React | Ecosystem and component libraries |
| Math input / display | MathLive (input), KaTeX (display) | Mature and free to use |
| Numeric engine | Own parser and evaluator (real, complex, matrix) | Instant results, full control over `let`/`const` |
| Symbolic engine | SymPy via Pyodide in a Web Worker, loaded only when needed | Strong integrals, factoring and solving; BSD license |
| 2D render | Canvas (interactive) + SVG renderer (export / figure mode) | Smooth on screen, sharp in exports |
| 3D render | three.js / WebGL; domain coloring as a GPU shader | Speed |
| Storage | IndexedDB (local), compressed state in the URL (sharing) | Works offline, no server needed |
| Video export | WebCodecs (MP4/WebM), gif.js-style encoder in a worker | Runs in the browser, no upload |
| Handwriting / photo | Built in: a rule-based recognizer on the device ($P point clouds + layout rules), no download, no upload | A trained model or a cloud API stays an option, see open decisions |
| Live classroom (later) | Server with WebSockets + accounts | Only needed for classroom mode and sync |
| Mobile apps | Capacitor (same web code inside iOS/Android) | One codebase |
| Desktop apps | Tauri | Small, native installers |
| Tests | Vitest (engine), Playwright (UI at 1440 / 768 / 390 widths) | |

```
packages/
  engine/     parser, let/const workspace, numeric, complex, matrix, number theory, stats
  cas/        SymPy worker bridge
  render/     2D canvas, SVG/figure mode, exporters, 3D, domain coloring
  geometry/   construction model, constraint updates
  steps/      step-by-step rule engine, graph explainer, practice problem generator
  input/      plain-word parser, handwriting/photo recognition adapters
  worksheet/  page layout, templates, PDF export
  ui/         shared components, keypad, i18n
apps/
  web/        PWA
  mobile/     Capacitor (iOS, Android)
  desktop/    Tauri (macOS, Windows)
```

**App store note:** Apple doesn't allow downloading executable code at runtime, so the mobile app bundles Pyodide/SymPy instead of fetching it.

## 5. Phases

| # | Phase | Deliverable |
|---|---|---|
| 0 | Foundation | Monorepo, parser, `let`/`const` workspace with dependency graph, engine tests |
| 1 | Scientific calculator | Numeric calculator, complex calculator, matrices, number theory, base conversion, history |
| 2 | Symbolic math | Derivative, integral, factor ⇄ expand, simplify, equation calculator |
| 3 | 2D graphing + figure mode | Done: curves, implicit equations, inequalities, points, sliders, exam-style figures, SVG/PNG export, share links |
| 3b | Graphing, part 2 | Done: parametric and polar curves, domain limits `{x > 0}`, trace with intercepts/extrema/intersections, PDF and TikZ export. Still open: HWP import test (needs Hangul installed), compiling the TikZ output (needs a LaTeX install) |
| 4 | Geometry | Done: segments, lines, rays, circles (incl. through 3 points), polygons, midpoint/foot/intersect/perpendicular/parallel/bisectors/tangents, angle marks, measurements, dragging, exam figures without axes. Still open: equal-length tick marks, length labels on segments |
| 5 | Statistics, 3D, complex graphs | Done: descriptive statistics, scatter plots, 6 regression models with R², normal/binomial/Poisson distributions, `z = f(x,y)` surfaces in a 3D view, domain colouring and |f(z)| surfaces. Still open: a table editor for data, exporting domain colouring and 3D to SVG/PDF |
| 6 | Advanced graphs | Done: ▶ play on sliders, animation export as GIF (own encoder, changed-region frames) and video (MP4 where the browser records it, else WebM); `seq`, `iterate`, `cobweb(f, x0, n)`; `slopefield` and `vectorfield` with RK4 solution curves through given points, added by clicking the graph; t and χ² distributions; shading under a distribution with a restriction. Still open: animating more than one slider at once, a time slider for parametric drawing, phase portraits with nullclines |
| 6b | Redesign | Done: typeset math input (MathLive, bundled offline): `^` raises, `_` lowers (and leaves on any operator), `/` builds a fraction, brackets close themselves, function names turn upright as you type; lines are still stored as plain text, converted both ways and round-trip tested over 400+ real lines. Results, definitions and history typeset in the same math font. New layout: expressions panel beside a full-height graph with floating controls (style, export menu, zoom, info card); light, dark and system themes with a toggle; graph-on-top layout on phones. Still open: the bundle grew to 1.2 MB (358 kB gzipped), MathLive could load after first paint |
| 7 | Learning | Done: new `@math/steps` package. Step-by-step working under any diff / integrate / solve line (and f'(a)): derivatives by its own rule engine (sum, constant multiple, power, product, quotient, chain, exponential, trig and inverse trig), equations by its own rules (linear, quadratic by factoring / square roots / the formula with exact surds, common factors, two-term powers, rational roots for higher degrees), integrals from SymPy's integral_steps (substitution names u, parts names u and dv). Explain this graph for a selected y = f(x): domain, intercepts, increase and decrease, extrema, concavity and inflections, vertical / horizontal / slant asymptotes, symmetry and period, found numerically and written exactly where recognisable (π/2, √3, 3/4). Practice tab: 8 templates (4 derivative, 2 equation, 2 integral), new numbers from a seed, answers checked by value so any equal form is right, then the answer and the steps. All in English and Korean. Still open: steps for limits and inequalities, practice by difficulty level, explanations that use SymPy for exact domains |
| 8 | Teacher tools | Done: exam figure templates from the graph's Templates menu (tangent line, area between curves, region over an interval, intersection points with helper lines, triangle in a circle), each a set of let values that become sliders, opened in exam style at its own range, the previous lines kept to bring back. Worksheet builder (Calculator / Worksheet switch in the top bar): title, subtitle, instructions, A4 / B4 / Letter, 1 or 2 columns, name and class line, numbered problems with $math$ text, points, space for working and an optional figure (from a template, from the calculator via Export → Add to worksheet, editable lines and range), generated problems from the practice templates, an answer key page; real-size pages measured and paginated, printed or saved as PDF through the print dialog; saved in the browser. Still open: PNG of whole pages (figures export on their own), problem banks to share, a print-quality serif option for Korean exams, the live classroom (Phase 12) |
| 9 | Formulas tab + plain-word input | Done: Formulas tab (the old Functions tab; the function reference is its second view) with 45 formulas in algebra, geometry, trigonometry, calculus, statistics and physics, searchable in either language and by subject; each opens with its values to fill in and the result worked out live (units for physics), and inserts as let lines (sliders), renaming any name the worksheet already uses (r → r_2); favorites and recently used are kept in the browser. New `@math/input` package: plain words in English or Korean to a calculator line (derivative, second derivative, integral with bounds, solve, factor, expand, simplify, limit, graph, mean / median / sum; powers, roots, fractions like 3분의 1, functions), shown typeset before it is added, from a box under the expression list. Also fixed: P(1 + r)^n with P a number is P·(1 + r)^n (it was (P(1 + r))^n). Still open: more formulas (chemistry, finance), formulas you save yourself, words for matrices and statistics tests |
| 10 | Handwriting + photo input | Done, on the device (nothing is uploaded): a drawing pad and a photo reader under the expression list. Symbols are matched as point clouds ($P recognizer) against handwriting shapes for 0 to 9, x y a b n t e, + − = ( ) / √ π < >, strokes are grouped into symbols by best total match (a +, an =, a π), and the layout is read for powers (raised and smaller), fractions (a bar with something over and under it) and roots (a long top bar). Photos: ink found against the local brightness (uneven light, a dark board flipped), pieces of ink grouped (= and dots), matched against printed glyphs from the app's fonts and the handwriting shapes; drag over the photo to read part of it, found symbols outlined. The result always opens in an editable math field before it is added. Tested on synthetic handwriting and rendered photos, not yet on real people's writing or camera photos. Still open: more symbols (letters, Greek, ∫, Σ), multi-line photos, perspective correction, learning from corrections |
| 10b | Polish (before apps) | Done (section 5b): plain definitions; any colour and line style; undo/redo; LaTeX for ∫, d/dx, lim, Σ, nCr, roots, matrices, ° with a tabbed keypad; the Graph / Calculator / Geometry / Worksheet switch; the Calculator and Geometry tools; faster first load; friendlier errors; self-closing notices; settings; saved graphs and files; slider settings; line reordering; graph settings (polar grid, π ticks, window); zoom box; fit to the graph; tables with regression; note lines; folders. Share links and files carry all of it. Still open: piecewise and ±, some geometry extras (section 5b) |
| 11 | Apps and publishing | In progress. Done: installable web app (manifest, icons, a service worker that keeps the app and the symbolic engine for offline use, tested with the server stopped; a reload button when a new version arrives); desktop app with Tauri, built and launched here (`Calculator.app` 14 MB, `.dmg` 13 MB, a strict content-security policy); iOS and Android projects with Capacitor, holding the whole web build including Pyodide, with icons, adaptive Android icon and launch screens; safe areas for notched phones; store listing text (English, Korean), screenshot list and privacy policy in `docs/store/`; build guide in `docs/apps.md`. Name: **Curvelet** (커블릿); IDs `com.curvelet.app` and `com.curvelet.desktop`. Waiting on you: checking the name is free (stores, trademarks) and owning curvelet.com before the first upload, Xcode and Android Studio to build the phone apps, developer accounts, signing, and a web address for share links from the apps |
| 12 | Online platform | Accounts, cloud sync, classroom mode (live), public gallery |

Release milestones:
- **v0.1 web (after Phase 3):** calculator, symbolic math, 2D graphs, exam-style figures and export
- **v0.5 web (after Phase 8):** geometry, 3D/complex, advanced graphs, learning features, teacher tools
- **v1.0 (after Phase 11):** web + iOS + Android + desktop in the stores
- **v2.0 (Phase 12):** online classroom and sync

## 5b. Polish roadmap (Phase 10b)

From using the app (2026-11-12). Goal: the app should feel finished to someone who knows Desmos, before it is packaged as apps in Phase 11.

### Found, with their causes
| # | Item | Cause today | Direction |
|---|---|---|---|
| 1 | `f(x) = …` should work like `let f(x) = …` | Only `let`/`const` define names; `f(x) = 3x` is read as an equation in an unknown f, and `a = 3` likewise | Plain `name = …` and `name(x) = …` define (changeable, like `let`). `x =`, `y =`, `r =`, `z =` stay graphs; `const` still locks; a second definition of the same name says which line already has it |
| 2 | Any colour, by hex | Five fixed theme colours | Click a line's swatch: a palette, a hex field, recent colours; also line style (solid, dashed, dotted), thickness, fill opacity, hide/show. Stored with the line, carried by share links and exports. Custom colours lightened in dark mode unless "exact" is chosen |
| 3 | No dashed lines when nothing is selected | Colour slots are never freed; past the 5th slot curves are drawn dash-dot to tell repeats apart | Drop the dash-dot rule; 8 to 10 distinct curve colours; freed slots reused; dashes only where they mean something (a strict inequality's edge) or where the user chose them |
| 4 | Separate Graph, Calculator and Geometry | One workspace with the graph always beside the list | Tools in the top switch: Graph, Calculator, Geometry, Worksheet. Each has its own documents; "send to graph" and "add to worksheet" link them |
| 5 | Every symbol by LaTeX and a quick keypad | Fractions, powers, roots, Greek and comparisons work; ∫, Σ, lim, d/dx, log base, matrices, cases, ±, ≠, ° don't | Typed templates (`int` → ∫ₐᵇ □ dx, `sum` → Σ, `lim`, `d/dx`, `log_2`, `nCr`, `matrix`, `cases`) that convert to the engine's functions; a tabbed keypad (123, abc, functions, calculus, symbols) |
| 6 | Free-form geometry | Geometry exists only as typed lines | A Geometry tool with a toolbar (below); every object is also a line in its list, so drawing and typing stay in step |

### More ideas (all accepted, 2026-11-12)
- **Lines:** undo and redo for the worksheet (Ctrl+Z); hide/show by clicking the swatch; drag to reorder; folders; note lines (plain text); duplicate a line
- **Graph:** tables of points (with regression from a table); slider settings (min, max, step, speed); graph settings (x/y ranges, grid, ticks in π, polar grid, axis labels); point labels with coordinates; zoom box and "fit to curves"
- **Calculator tool:** big result display; fraction ⇄ decimal ⇄ exact toggle; `ans`; digit precision; copy a result as LaTeX or text
- **Geometry tool:** point, segment, line, ray, circle (centre and point, three points), polygon, midpoint, perpendicular, parallel, bisector, intersection, compass, angle and length measures, reflect / rotate / translate / dilate, locus trace, text labels; snapping to grid and objects; drag free points and everything built on them follows; a pen that turns rough shapes into a circle, segment or polygon (reusing the Phase 10 recognizer); export to an exam figure
- **Everyday:** a settings dialog (angle, complex, precision, theme, language, keypad); several saved worksheets with names; import and export as a file; friendlier errors with suggestions ("did you mean sin(x)?"); notices that close themselves
- **Speed:** load MathLive and SymPy after the first paint, to bring the 1.35 MB first load down

### Progress (2026-11-12)
Done and checked in the browser (1440, 768, 390; light, dark, Korean):
- **Definitions:** `f(x) = …` and `a = 2` define like `let` (`a = 2` gets a slider); `x =`, `y =`, `r =` stay graphs
- **Colours:** 8 curve colours, freed slots reused, the dash-dot rule removed. Each swatch opens a style picker: palette, any hex colour, recent colours, solid / dashed / dotted, thickness, fill, hide/show, reset. Hex colours are lifted for dark mode unless "exact" is ticked; dashes grow with thickness; styles are saved with the line and in share links
- **Undo/redo:** for the expression list, from Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl+Y and two buttons; a burst of typing in one line is one step; plain text boxes keep their own undo
- **Input:** two-way LaTeX for ∫ (with or without bounds), d/dx and d²/dx², lim, Σ, nCr (binomial), nth roots, matrices, the degree sign and ≠, with round-trip tests. The engine reads `30°` in either angle mode, and `x != 2` now says ≠ isn't supported instead of being read as `x! = 2`. The keypad has five tabs: 123, abc, f(x), ∫ d/dx, ≤ π
- **Tools:** Graph, Calculator, Geometry and Worksheet in the top switch, remembered between visits, each with its own document. On phones the switch gets its own row
- **Calculator tool:** a large answer, a tape of earlier results (click one to edit it again), an Exact / Decimal switch (fractions found for decimals), `ans`, Copy LaTeX, Send to graph
- **Geometry tool:** point, segment, line, ray, polygon, circle, compass, midpoint, perpendicular, parallel, perpendicular bisector, intersection, angle, reflect, rotate (by a set angle), delete with dependants, and a pen that turns a rough stroke into a segment, circle or polygon. Snapping to the grid and to points, dragging free points (everything built on them follows), pan and zoom, lengths, radii, areas and angles shown, its own undo/redo. Send to graph writes engine lines (`polygon(A, B, C)`, `circle(A, B)`, `midpoint(segment(B, C))`; computed places as coordinates)

Also done (second pass, same day):
- **Load time:** MathLive loads right after the first paint (lines show as plain text for that moment, then become math fields) and the Calculator, Geometry, Worksheet, Practice, Formulas and handwriting panels load when first opened. First-load JavaScript went from 1.41 MB to about 530 kB (main chunk 433 kB, 144 kB gzipped); MathLive (801 kB) follows
- **Friendlier errors:** under a line that went wrong, a one-click fix when one is clear (`sinx` → `sin(x)`, `Sin`/`SQRT` → lowercase, `sqroot` → `sqrt`) or a plain explanation (an unfinished line, `%`)
- **Notices** close by themselves (6 s, or 12 s with a button), and wait while the pointer or focus is on them; a link to copy stays until closed
- **Settings dialog** (gear): angle unit, real or complex, theme, language, keypad. On phones the theme and language shortcuts move into it
- **Files dialog** (folder): name the graph, save it in the browser, reopen or delete saved graphs (delete asks twice), download it as a `.calc.json` file, open such a file, start a new graph. Opening or starting over can be undone with Ctrl+Z
- **Sliders:** min, max, step and speed per slider, kept with the line; the animation honours step and speed
- **Line order:** drag a line by its number, or Alt+↑ / Alt+↓ while typing in it; both are undoable

Third pass (same day, project moved to Desktop/Calc):
- **Graph settings** (HUD button): grid as squares, polar (circles and 15° spokes) or none; x-axis numbers in multiples of π (π/12 up to large multiples, chosen by zoom); coordinates beside points on or off; a window typed as x and y ranges (x and y keep one scale, so the shown window can be a little larger)
- **Zoom box:** a HUD button, or Shift+drag on the graph
- **Fit to the graph:** y fitted to y = f(x) over the current x range, whole parametric and polar curves, all points and scatter plots; the extreme 2% of curve values ignored so asymptotes don't flatten everything
- **Tables:** a "Table" button next to New line; x and y columns with a spare row, Enter or ↓ to go down a column; the line is written as `points([…], […])` and drawn as a scatter plot; Linear, Quadratic, Exponential and Logarithmic buttons add the regression as the next line (`linreg(…)` etc., with R²)

Fourth pass (finishing 10b):
- **Note lines:** plain text between the math (Add → Note), growing as you type; Enter starts a new line below
- **Folders** (Add → Folder): a heading with a name, how many lines it holds, a fold toggle and an eye that takes its lines off the graph. A folder holds the lines below it up to the next folder; lines above the first folder are outside any folder. Lines inside are indented, and say "Hidden from the graph" when their folder is hidden
- **Everything travels:** share links and downloaded files now carry every line with its style, slider settings, table, note or folder, and the graph's name. Older share links still open
- **Graph settings remembered** between visits (grid, π numbers, point coordinates, axes)

Not done yet:
- **Piecewise / cases:** `{x < 0: -x, x}` needs a new node in the evaluator, compiler and printer; lines restricted with `{x < 0}` cover most uses meanwhile. `±` is not read either
- **Geometry:** translate and dilate, locus trace, text labels and renaming, circle through three points, pinch zoom on touch screens, export as an exam figure, add to worksheet
- **Section 5 of the order:** all done

### Order
1. **Foundations:** plain definitions (1), the colour model with per-line colour, style and hide/show (2, 3), undo/redo
2. **Input:** LaTeX templates for every symbol and the tabbed keypad (5)
3. **Tools:** the Graph / Calculator / Geometry / Worksheet switch, documents per tool (4)
4. **Geometry tool:** free-form construction (6)
5. **Graph extras:** tables, slider and graph settings, labels; settings dialog; load-time work

### Decisions (working defaults; either can still change)
- Each tool keeps its own documents, linked by "send to graph" and "add to worksheet", rather than one shared set of definitions
- Custom colours are lightened automatically in dark mode, with an "exact colour" option

### Done when
- Typing `f(x) = x^2` then `f(3)` gives 9; `a = 2` makes a slider
- No curve is dashed unless it is a strict inequality or the user chose dashes; any hex colour sticks after reload and through a share link
- Each symbol in the keypad can also be typed, and converts both ways (round-trip tests)
- A triangle with its circumcircle can be built by clicking alone, and dragging a vertex moves everything built on it

## 5c. Next (2026-11-14)

After the review rounds of 2026-11-13 (pen, images, projects, exam-figure fractions and lengths, graph tools, calculator tape, graph-paper DMG).

### Release: planned, not started
| Item | Today | Direction |
|---|---|---|
| Windows code signing | The installer is unsigned, so SmartScreen warns on first run | A code-signing certificate (OV or EV), used by the Windows CI job to sign the NSIS and MSI installers |
| Auto-update | Every new version is installed again by hand | The Tauri updater: a signing key pair, an update manifest published with each release, and a check at start that offers the new version |
| Versions and releases | Always 0.1.0; builds live only as CI artifacts, and a new push cancels the run before it (`cancel-in-progress`), which kept dropping the Windows build | Bump the version per release; a tag starts a release run that is never cancelled and uploads the installers (and the updater manifest) to GitHub Releases |

### Gaps to close: next
| Item | Today | Direction | Done when |
|---|---|---|---|
| Calculator uses the graph's definitions | The calculator only knows what was defined on its own tape; `∫ f(x) dx` there says "No closed form" when f lives in the graph | The calculator reads the graph's definitions too; its own tape definitions win for the same name, and the tape says where a name comes from | With `f(x) = x^3 - 3x` in the graph, `f(2)` and `∫ f(x) dx` work in the calculator; changing f in the graph updates them |
| Stacked fractions in PDF and TikZ | Exam figures stack 11/5 on screen, in SVG and PNG, but PDF and TikZ write "11/5" on one line | Both writers set guide numbers (and typed lengths) as fractions: a drawn bar in the PDF, `\frac` in TikZ | An exam figure with 11/5 and √2/2 looks the same in all four exports |
| Images in vector PDF | A PDF with pictures is turned into one image of the page | Pictures embedded as images in the vector PDF, curves and text stay vector | Text in such a PDF can be selected and stays sharp when zoomed |
| Exact crossings with pen curves | Crossings of a pen Bézier with another curve are found from the drawn pixels, so they are close but not exact | Solve the Bézier against lines, circles and y = f(x) numerically to full precision | Marking where a pen curve crosses y = x gives a point that lies on both to 1e-9 |
| Undo on the calculator tape | Deleting or editing a tape line can't be taken back | Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z on the tape, like the expression list | A deleted definition comes back with Ctrl+Z, and the lines that use it recompute |

## 6. Success criteria
- Engine: test suite of known results (derivatives, integrals, roots, matrix operations) passes 100%
- Interaction: graph pans at about 60 fps with 10+ expressions; symbolic results within 2 s once SymPy has loaded
- Figure mode: exported SVG/PNG looks right side by side with typical exam figures, and holds up when printed at 600 dpi
- Usable at 390 px phone width and with keyboard only; WCAG AA contrast
- Works offline after the first visit

## 7. Open decisions
- Product name and visual identity
- Symbolic engine: plan assumes the SymPy hybrid (confirm)
- Which formats Hangul (HWP) imports cleanly: test SVG, EMF and high-dpi PNG
- Open source or closed source; free or freemium
- Handwriting/photo recognition: Phase 10 shipped a small rule-based recognizer that runs on the device (private, free, offline, no download). If real users' writing proves it too weak, the choices are:
  - A trained on-device model (ONNX in the browser): still private and free to run, but a large download
  - A cloud API (such as Mathpix or MyScript): the most accurate, but it costs money per use and sends images to a third party (needs a privacy notice; extra care for students)
- Classroom mode: needs a server, accounts and a privacy policy for students' data (minors), so where it's hosted and what it costs must be decided before Phase 12
