# AI Tools Used

- OpenAI Chat Completions API (model configurable via `OPENAI_MODEL`, default `gpt-4o-mini`) for resume analysis and rewriting.
- GitHub Copilot / OpenCode assistant used for code scaffolding and review (development only).

No AI-generated content is served to end users except the configured model's analysis output, which is validated against a Zod schema.