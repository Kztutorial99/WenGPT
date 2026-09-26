import { useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, ShieldCheck, ShieldX, ShieldQuestion, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type ToolRun } from "@/lib/chat-store";
import { checkSecretValue, loadSecrets, saveSecret, SERVICE_LABEL, guessService, useSecrets, type TestStatus } from "@/lib/secret-store";

export function AiDots({ className = "" }: { className?: string }) {
  return (
    <span className={`ai-dots ${className}`} role="status" aria-label="WenGPT sedang memproses">
      <span />
      <span />
      <span />
    </span>
  );
}

type CheckState = { status: TestStatus; account?: string; detail?: string };

export function SecretForm({ run, onSaved }: { run: ToolRun; onSaved?: () => void }) {
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
  const [check, setCheck] = useState<CheckState | null>(null);
  useEffect(() => void loadSecrets(), []);

  if (!name) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
        <KeyRound className="size-4 text-primary" /> Menyiapkan form secret <AiDots />
      </div>
    );
  }

  const apply = async () => {
    setBusy(true);
    setError("");
    try {
      // Periksa dulu; hanya token aktif yang disimpan.
      const result = await checkSecretValue(service, value.trim());
      setCheck(result);
      if (result.status !== "active") return;
      await saveSecret(name, value, service);
      setValue("");
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memproses token.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="secret-card overflow-hidden rounded-2xl border border-primary/35 bg-card/95 shadow-panel">
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
        {saved && <CheckCircle2 className="size-5 shrink-0 text-success" />}
      </div>
      {saved && check?.status === "active" ? (
        <p className="px-4 py-3 text-xs text-success">
          {`Token aktif${check.account ? ` · ${check.account}` : ""} · tersimpan aman`}
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
          {check && check.status !== "active" && (
            <p role="status" className={`text-xs ${check.status === "invalid" ? "text-destructive" : "text-muted-foreground"}`}>
              {check.detail ?? "Token belum dapat dipastikan aktif."} Belum disimpan.
            </p>
          )}
          <Button type="submit" disabled={!value.trim() || busy} className="h-10">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            {busy ? "Memeriksa…" : "Terapkan"}
          </Button>
        </form>
      )}
    </div>
  );
}

/** Catatan kecil di dalam percakapan; formulirnya ada di panel di atas kotak pesan. */
export function SecretRequestNote({ run }: { run: ToolRun }) {
  const name = String(run.output?.name ?? run.input.name ?? "").toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const { secrets } = useSecrets();
  const saved = secrets.some((s) => s.name === name);
  return (
    <div className="my-2 flex w-fit items-center gap-2 rounded-xl border border-primary/30 bg-primary/8 px-3 py-2 text-xs">
      <KeyRound className="size-4 shrink-0 text-primary" />
      <span>{name ? (saved ? `Token ${name} tersimpan.` : `Form token ${name} ada di panel di atas.`) : "Form secret ditampilkan di panel di atas."}</span>
    </div>
  );
}

export function SecretSlider({ run, onClose }: { run: ToolRun; onClose: () => void }) {
  return (
    <div className="secret-slider mx-auto mb-2 w-full max-w-3xl">
      <div className="relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup form secret"
          className="absolute -top-1 right-0 z-10 grid size-7 place-items-center rounded-full border border-border/70 bg-background/90 text-muted-foreground shadow-panel"
        >
          <X className="size-3.5" />
        </button>
        <SecretForm run={run} onSaved={onClose} />
      </div>
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
