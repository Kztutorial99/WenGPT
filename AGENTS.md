<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- Chat sessions are browser-persisted and route-addressed under `/chat/$sessionId`; one E2B sandbox ID belongs to one session so files and packages never bleed across sessions.
- Active chat streams live in the module-level chat store so internal route navigation does not cancel the in-flight request.
- Uploaded attachment blobs live in IndexedDB while browser-local chat metadata keeps only safe previews and references, because 20 MB files exceed localStorage capacity.
- Keep AI reasoning and execution details in per-turn timeline entries, with one compact chat link and completed answer text only, so the conversation remains readable during long runs.
- Classify timeline visibility from actual coding/work tools, milestones, or file changes; ordinary chat and simple web lookups must not create a visible work timeline.
- Supply the current Makassar date and use Firecrawl as the sole web-search source; preserve Firecrawl ranking, retry brief rate limits once, and surface provider failures instead of reporting false empty results.
- WenGPT system instructions live in root `AGENT.md` (including the always-known MODE WEBH persona), imported raw into the chat server, so behavior is edited as a document not code.
- Let WenGPT select Prime/WEBH semantically through the streamed set_theme tool and persist it per session; never infer the theme from client-side keyword matching.
- Ship to GitHub with the Git data API (blobs → tree → commit → ref on Kztutorial99/WenGPT main), never plain `git push`, because the sandbox blocks stateful git; then confirm the Vercel project build reaches READY.
