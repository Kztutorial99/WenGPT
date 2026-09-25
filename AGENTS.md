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
