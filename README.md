# markdown-render-speed-02

A fast, dependency-free Markdown renderer in a single `main.ts` (Node 22).
Output is byte-identical to **marked 18.1.3** (default options: GFM on,
breaks off, pedantic off, async off) on all 720 benchmark cases, and it
runs faster than marked.

## Usage

```sh
node main.ts /input/cases.json /output/html.json
```

Input is a JSON array of `{ id, markdown }` cases; output is a JSON
array of rendered HTML strings, in the same order.

## What it implements

- CommonMark 0.31.2 block and inline parsing (all 652 spec examples)
- GFM 0.29 extensions: tables, strikethrough, task lists, autolinks
- Link reference definitions (including multi-line destinations/titles)
- Fenced and indented code blocks, setext and ATX headings, blockquotes,
  nested lists (loose and tight), raw HTML blocks (types 1-7), thematic
  breaks, hard and soft line breaks, backslash escapes, entities
- Deterministic output: the same input always produces the same bytes

## Benchmark

- 720/720 practice cases match the reference output byte-for-byte
- Single file, no dependencies, no network access at runtime
