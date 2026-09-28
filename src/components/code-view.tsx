import { useEffect, useRef, useState } from "react";
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import type { Extension } from "@codemirror/state";

type CM = typeof import("@uiw/react-codemirror");

/** Penampil kode ala IDE: warna kode, nomor baris, pencocokan kurung, lipat kode, cari (Ctrl/Cmd+F), lompat ke baris. */
export function CodeView({
  path,
  content,
  line,
  className = "",
}: {
  path: string;
  content: string;
  line?: number | undefined;
  className?: string;
}) {
  const [mod, setMod] = useState<CM | null>(null);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const ref = useRef<ReactCodeMirrorRef>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [cm, data, lang, view, search] = await Promise.all([
        import("@uiw/react-codemirror"),
        import("@codemirror/language-data"),
        import("@codemirror/language"),
        import("@codemirror/view"),
        import("@codemirror/search"),
      ]);
      const name = path.split("/").pop() ?? path;
      const desc = lang.LanguageDescription.matchFilename(data.languages, name);
      const support = desc ? await desc.load().catch(() => null) : null;
      if (cancelled) return;
      const exts: Extension[] = [
        lang.foldGutter(),
        lang.bracketMatching(),
        lang.indentOnInput(),
        search.search({ top: true }),
        view.EditorView.lineWrapping,
      ];
      if (support) exts.push(support);
      setExtensions(exts);
      setMod(cm);
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  // Lompat & sorot baris target (mis. dari error main.cpp:42).
  useEffect(() => {
    const view = ref.current?.view;
    if (!view || !line) return;
    const total = view.state.doc.lines;
    const target = view.state.doc.line(Math.min(Math.max(1, line), total));
    view.dispatch({ selection: { anchor: target.from, head: target.to }, scrollIntoView: true });
    view.focus();
  }, [mod, line, content]);

  if (!mod)
    return (
      <div
        className={`flex items-center justify-center p-6 text-xs text-muted-foreground ${className}`}
      >
        Memuat editor…
      </div>
    );
  const Editor = mod.default;
  return (
    <div className={`min-h-0 overflow-auto text-xs ${className}`}>
      <Editor
        ref={ref}
        value={content}
        readOnly
        editable={false}
        theme="dark"
        extensions={extensions}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          bracketMatching: false,
        }}
        onCreateEditor={(view) => {
          if (!line) return;
          const target = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines));
          view.dispatch({
            selection: { anchor: target.from, head: target.to },
            scrollIntoView: true,
          });
        }}
      />
    </div>
  );
}
