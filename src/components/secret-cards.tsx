import { useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, ShieldCheck, ShieldX, ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type ToolRun } from "@/lib/chat-store";
import { loadSecrets, saveSecret, testSecret, SERVICE_LABEL, guessService, useSecrets, type TestStatus } from "@/lib/secret-store";

export function AiDots({ className = "" }: { className?: string }) {
  return (
    <span className={`ai-dots ${className}`} role="status" aria-label="WenGPT sedang memproses">
      <span />
      <span />
      <span />
    </span>
  );
}

export function SecretRequestCard({ run }: { run: ToolRun }) {
  const name = String(run.output?.name ?? run.input.name ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_");
  const service = run.input.service || guessService(name);
  const { secrets } = useSecrets();
  const saved = secrets.find((s) => s.name === name);
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [check, setCheck] = useState<{ status: TestStatus; detail?: string; account?: string } | null>(null);
  useEffect(() => void loadSecrets(), []);

  if (!name) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-xl border border-border/70 bg-card/55 px-3 py-3 text-xs text-muted-foreground">
        <KeyRound className="size-4 text-primary" /> Menyiapkan form secret <AiDots />
      </div>
    );
  }

  const apply = async () => {
    setBusy(true);
    setError("");
    try {
      await saveSecret(name, value, service);
      setValue("");
      setDone(true);
      try {
        setCheck(await testSecret(name));
      } catch {
        setCheck({ status: "error", detail: "Pengujian token gagal." });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="secret-card my-3 overflow-hidden rounded-2xl border border-primary/35 bg-card/80 shadow-panel">
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
        <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary">
          <KeyRound className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm font-semibold">{name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {SERVICE_LABEL[service] ?? service} · disimpan terenkripsi di perangkat ini
          </p>
        </div>
        {(done || saved) && <CheckCircle2 className="size-5 shrink-0 text-success" />}
      </div>
      {done ? (
        <p className={`px-4 py-3 text-xs ${check?.status === "active" ? "text-success" : check?.status === "invalid" ? "text-destructive" : "text-muted-foreground"}`}>
          {!check ? "Tersimpan aman · memeriksa token…" : check.status === "active" ? `Token aktif${check.account ? ` · ${check.account}` : ""}` : check.detail ?? "Token belum dapat dipastikan aktif."}
        </p>
      ) : (
        <form
          className="grid gap-2 px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            void apply();
          }}
        >
          {run.input.reason && <p className="text-xs text-muted-foreground">{run.input.reason}</p>}
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={saved ? "Sudah tersimpan — isi untuk mengganti" : "Tempel token di sini"}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label={`Nilai ${name}`}
              className="h-11 pr-10 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground"
              aria-label={show ? "Sembunyikan" : "Tampilkan"}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" disabled={!value.trim() || busy} className="h-10">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            Terapkan
          </Button>
        </form>
      )}
    </div>
  );
}

export function SecretResultCard({ run }: { run: ToolRun }) {
  const out = run.output;
  if (run.name === "list_secrets") {
    const list = (out as { secrets?: { name: string; service: string }[] } | undefined)?.secrets;
    return (
      <div className="my-2 rounded-xl border border-border/70 bg-card/55 px-3 py-2.5 text-xs">
        <p className="mb-1.5 flex items-center gap-2 font-medium">
          <KeyRound className="size-4 text-primary" /> Secret tersimpan
          {!out && <AiDots />}
        </p>
        {list?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {list.map((s) => (
              <span key={s.name} className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px]">
                {s.name} · ••••
              </span>
            ))}
          </div>
        ) : out ? (
          <p className="text-muted-foreground">Belum ada secret.</p>
        ) : null}
      </div>
    );
  }
  const status = out?.status;
  const Icon = status === "active" ? ShieldCheck : status === "invalid" || status === "missing" ? ShieldX : ShieldQuestion;
  const tone = status === "active" ? "text-success" : status === "invalid" || status === "missing" ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="my-2 flex min-w-0 items-center gap-2.5 rounded-xl border border-border/70 bg-card/55 px-3 py-2.5">
      <Icon className={`size-4 shrink-0 ${out ? tone : "text-primary"}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs">Uji {run.input.name}</p>
        {out && (
          <p className={`truncate text-[11px] ${tone}`}>
            {status === "active" ? `Aktif${out.account ? ` · ${out.account}` : ""}` : out.detail}
          </p>
        )}
      </div>
      {!out && <AiDots />}
    </div>
  );
}
