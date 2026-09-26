import { useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, ShieldCheck, ShieldX, ShieldQuestion, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type ToolRun } from "@/lib/chat-store";
import { checkSecretValue, loadSecrets, recordTest, saveSecret, SERVICE_LABEL, guessService, useSecrets, type TestStatus } from "@/lib/secret-store";

export function AiDots({ className = "" }: { className?: string }) {
  return (
    <span className={`ai-dots ${className}`} role="status" aria-label="WenGPT sedang memproses">
      <span />
      <span />
      <span />
    </span>
  );
}

const cleanName = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9_]/g, "_");

export type RequestedSecret = { name: string; service: string };

/** Semua token yang diminta satu atau beberapa panggilan request_secret, tanpa duplikat. */
export function requestedSecrets(runs: ToolRun[]): RequestedSecret[] {
  const seen = new Map<string, RequestedSecret>();
  for (const run of runs) {
    const list = run.input.secrets?.length ? run.input.secrets : run.input.name ? [{ name: run.input.name, service: run.input.service }] : [];
    for (const item of list) {
      const name = cleanName(item.name);
      if (name && !seen.has(name)) seen.set(name, { name, service: item.service || guessService(name) });
    }
  }
  return [...seen.values()];
}

type CheckState = { status: TestStatus | "saved"; account?: string | undefined; detail?: string | undefined };
export type SecretOutcome = { name: string; status: TestStatus; account?: string | undefined; detail?: string | undefined };

function SecretField({
  item,
  value,
  onChange,
  check,
  disabled,
}: {
  item: RequestedSecret;
  value: string;
  onChange: (v: string) => void;
  check?: CheckState | undefined;
  disabled: boolean;
}) {
  const [show, setShow] = useState(false);
  const ok = check?.status === "active";
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="truncate font-mono font-semibold">{item.name}</span>
        <span className="shrink-0 text-muted-foreground">{SERVICE_LABEL[item.service] ?? item.service}</span>
      </div>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || ok}
          placeholder={ok ? "Tersimpan" : "Tempel token"}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label={`Nilai ${item.name}`}
          className="h-9 w-full rounded-lg border border-input bg-background/70 px-3 pr-9 font-mono text-xs outline-none focus:border-primary disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute inset-y-0 right-0 grid w-9 place-items-center text-muted-foreground"
          aria-label={show ? "Sembunyikan" : "Tampilkan"}
        >
          {ok ? <CheckCircle2 className="size-4 text-success" /> : show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
      </div>
      {check && (
        <p className={`text-[11px] ${ok ? "text-success" : check.status === "invalid" ? "text-destructive" : "text-muted-foreground"}`}>
          {ok ? `Aktif${check.account ? ` · ${check.account}` : ""} · tersimpan` : `${check.detail ?? "Belum bisa dipastikan aktif."} Belum disimpan.`}
        </p>
      )}
    </div>
  );
}

export function SecretForm({ items, onDone }: { items: RequestedSecret[]; onDone: (results: SecretOutcome[]) => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Record<string, CheckState>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => void loadSecrets(), []);

  const pending = items.filter((i) => checks[i.name]?.status !== "active");
  const canApply = pending.some((i) => values[i.name]?.trim());

  const apply = async () => {
    setBusy(true);
    setError("");
    try {
      const next = { ...checks };
      await Promise.all(
        pending
          .filter((i) => values[i.name]?.trim())
          .map(async (i) => {
            const value = values[i.name]!.trim();
            const result = await checkSecretValue(i.service, value);
            next[i.name] = result;
            if (result.status === "active") {
              await saveSecret(i.name, value, i.service);
              await recordTest(i.name, result);
            }
          }),
      );
      setChecks(next);
      if (items.every((i) => next[i.name]?.status === "active")) {
        onDone(
          items.map((i) => {
            const c = next[i.name]!;
            return { name: i.name, status: c.status as TestStatus, account: c.account, detail: c.detail };
          }),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memproses token.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="secret-card grid gap-2.5 rounded-2xl border border-primary/35 bg-card/95 p-3 shadow-panel"
      onSubmit={(e) => {
        e.preventDefault();
        void apply();
      }}
    >
      <div className="flex items-center gap-2 pr-7 text-xs font-medium">
        <KeyRound className="size-4 text-primary" />
        {items.length > 1 ? `Simpan ${items.length} token` : "Simpan token"}
        <span className="truncate font-normal text-muted-foreground">· terenkripsi di perangkat ini</span>
      </div>
      <div className={`grid gap-2.5 ${items.length > 1 ? "max-h-[38dvh] overflow-y-auto sm:grid-cols-2" : ""}`}>
        {items.map((item) => (
          <SecretField
            key={item.name}
            item={item}
            value={values[item.name] ?? ""}
            onChange={(v) => setValues((s) => ({ ...s, [item.name]: v }))}
            check={checks[item.name]}
            disabled={busy}
          />
        ))}
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      <Button type="submit" size="sm" disabled={!canApply || busy} className="h-9">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
        {busy ? "Memeriksa…" : "Terapkan"}
      </Button>
    </form>
  );
}

/** Catatan kecil di dalam percakapan; formulirnya ada di panel di atas kotak pesan. */
export function SecretRequestNote({ run }: { run: ToolRun }) {
  const names = requestedSecrets([run]).map((s) => s.name);
  const { secrets } = useSecrets();
  const saved = names.length > 0 && names.every((n) => secrets.some((s) => s.name === n));
  return (
    <div className="my-2 flex w-fit max-w-full items-center gap-2 rounded-xl border border-primary/30 bg-primary/8 px-3 py-2 text-xs">
      <KeyRound className="size-4 shrink-0 text-primary" />
      <span className="min-w-0 truncate">
        {names.length ? (saved ? `${names.join(", ")} tersimpan.` : `Form ${names.join(", ")} ada di atas kotak pesan.`) : "Menyiapkan form secret…"}
      </span>
    </div>
  );
}

export function SecretSlider({ items, onClose, onDone }: { items: RequestedSecret[]; onClose: () => void; onDone: (r: SecretOutcome[]) => void }) {
  return (
    <div className="secret-slider relative mx-auto mb-2 w-full max-w-3xl">
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup form secret"
        className="absolute top-2 right-2 z-10 grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <X className="size-3.5" />
      </button>
      <SecretForm items={items} onDone={onDone} />
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
