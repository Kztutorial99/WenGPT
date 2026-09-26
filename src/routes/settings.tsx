import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Database,
  Info,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Settings,
  ShieldCheck,
  ShieldQuestion,
  ShieldX,
  Trash2,
  Eye,
  EyeOff,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  deleteSecret,
  guessService,
  loadSecrets,
  saveSecret,
  SECRET_NAME,
  SERVICE_LABEL,
  testSecret,
  useSecrets,
  type SecretMeta,
} from "@/lib/secret-store";
import { useChatStore } from "@/lib/use-chat-store";
import { loadAllFiles } from "@/lib/chat-store";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Pengaturan — WenGPT" },
      { name: "description", content: "Kelola secret, token API, dan data WenGPT." },
      { property: "og:title", content: "Pengaturan — WenGPT" },
      { property: "og:description", content: "Kelola secret, token API, dan data WenGPT." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

type Tab = "secrets" | "data" | "about";
const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "secrets", label: "Secret", icon: KeyRound },
  { id: "data", label: "Data", icon: Database },
  { id: "about", label: "Tentang", icon: Info },
];

function timeAgo(at: number) {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return "baru saja";
  if (s < 3600) return `${Math.round(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.round(s / 3600)} jam lalu`;
  return new Date(at).toLocaleDateString("id-ID");
}

function StatusBadge({ meta }: { meta: SecretMeta }) {
  const t = meta.lastTest;
  if (!t) return <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">Belum diuji</span>;
  const map = {
    active: ["Aktif", "bg-success/15 text-success"],
    invalid: ["Tidak valid", "bg-destructive/15 text-destructive"],
    unknown: ["Tidak bisa diuji", "bg-muted text-muted-foreground"],
    error: ["Gagal dicek", "bg-muted text-muted-foreground"],
  } as const;
  const [label, tone] = map[t.status];
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}>{label}</span>;
}

function SecretDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: SecretMeta | null;
}) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setValue("");
    setShow(false);
  }, [open, editing]);
  const clean = name.trim().toUpperCase();
  const valid = SECRET_NAME.test(clean);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[92vw] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{editing ? "Ganti nilai secret" : "Tambah secret"}</DialogTitle>
          <DialogDescription className="text-xs">
            Nilai dienkripsi di perangkat ini dan tidak pernah ditampilkan di chat.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const meta = await saveSecret(clean, value);
              onOpenChange(false);
              toast.success(`${meta.name} tersimpan · memeriksa token…`);
              void testSecret(meta.name).then((result) => {
                if (result.status === "active") toast.success(`${meta.name} aktif${result.account ? ` · ${result.account}` : ""}`);
                else toast.error(result.detail ?? "Token tidak aktif.");
              }).catch(() => toast.error("Pengujian token gagal."));
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Gagal menyimpan.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid gap-1.5">
            <label className="text-xs font-medium" htmlFor="secret-name">Nama</label>
            <Input
              id="secret-name"
              value={name}
              disabled={!!editing}
              onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
              placeholder="GITHUB_TOKEN"
              autoComplete="off"
              className="h-11 font-mono text-sm"
            />
            {clean && (
              <p className="text-[11px] text-muted-foreground">
                Layanan: {SERVICE_LABEL[guessService(clean)]}
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-medium" htmlFor="secret-value">Nilai</label>
            <div className="relative">
              <Input
                id="secret-value"
                type={show ? "text" : "password"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Tempel token di sini"
                autoComplete="off"
                spellCheck={false}
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
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="submit" disabled={!valid || !value.trim() || busy}>
              {busy && <Loader2 className="size-4 animate-spin" />} Terapkan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SecretsPanel() {
  const { ready, secrets } = useSecrets();
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<SecretMeta | null>(null);
  const [removing, setRemoving] = useState<SecretMeta | null>(null);

  return (
    <section className="grid gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Secret & token</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Dipakai WenGPT sebagai variabel lingkungan di sandbox. AI bisa memakai dan menguji tanpa melihat nilainya.
          </p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setDialog(true); }}>
          <Plus className="size-4" /> Tambah
        </Button>
      </div>
      {!ready ? (
        <div className="grid place-items-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : !secrets.length ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-border/80 px-6 py-12 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary/12 text-primary"><KeyRound className="size-5" /></span>
          <p className="mt-3 text-sm font-medium">Belum ada secret</p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            Tambah di sini, atau minta di chat: “load token GitHub ke secret”.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card/55">
          {secrets.map((s) => {
            const t = s.lastTest;
            const Icon = t?.status === "active" ? ShieldCheck : t?.status === "invalid" ? ShieldX : ShieldQuestion;
            return (
              <li key={s.name} className="flex items-center gap-3 px-3 py-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted">
                  <Icon className={`size-4 ${t?.status === "active" ? "text-success" : t?.status === "invalid" ? "text-destructive" : "text-primary"}`} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate font-mono text-sm font-semibold">{s.name}</p>
                    <StatusBadge meta={s} />
                  </div>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {SERVICE_LABEL[s.service] ?? s.service} · {"•".repeat(Math.min(12, s.length))}
                    {t?.account ? ` · ${t.account}` : ""} · {timeAgo(t?.at ?? s.updatedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center">
                  <Button variant="ghost" size="icon" title="Ganti nilai" aria-label={`Ganti ${s.name}`} onClick={() => { setEditing(s); setDialog(true); }}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" title="Hapus" aria-label={`Hapus ${s.name}`} className="text-destructive" onClick={() => setRemoving(s)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <SecretDialog open={dialog} onOpenChange={setDialog} editing={editing} />
      <Dialog open={!!removing} onOpenChange={(v) => !v && setRemoving(null)}>
        <DialogContent className="max-w-[92vw] rounded-2xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Hapus {removing?.name}?</DialogTitle>
            <DialogDescription className="text-xs">AI dan sandbox tidak bisa memakai token ini lagi.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>Batal</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (removing) await deleteSecret(removing.name);
                toast.success("Secret dihapus");
                setRemoving(null);
              }}
            >
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Row({ title, detail, children }: { title: string; detail: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      {children}
    </div>
  );
}

function DataPanel() {
  const snapshot = useChatStore();
  const files = snapshot.ready ? loadAllFiles().length : 0;
  const [confirm, setConfirm] = useState(false);
  return (
    <section className="grid gap-4">
      <div>
        <h2 className="text-lg font-semibold">Data & penyimpanan</h2>
        <p className="mt-1 text-xs text-muted-foreground">Semua data tersimpan di browser perangkat ini.</p>
      </div>
      <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card/55">
        <Row title="Sesi chat" detail={`${snapshot.sessions.length} sesi tersimpan`} />
        <Row title="File Manager" detail={`${files} file`} />
        <Row title="Hapus semua data" detail="Sesi, file, dan secret di perangkat ini.">
          <Button variant="destructive" size="sm" onClick={() => setConfirm(true)}>Hapus</Button>
        </Row>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="max-w-[92vw] rounded-2xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Hapus semua data?</DialogTitle>
            <DialogDescription className="text-xs">Tindakan ini tidak bisa dibatalkan.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>Batal</Button>
            <Button
              variant="destructive"
              onClick={() => {
                localStorage.clear();
                indexedDB.deleteDatabase("wengpt-secrets");
                window.location.assign("/");
              }}
            >
              Hapus semua
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function AboutPanel() {
  return (
    <section className="grid gap-4">
      <h2 className="text-lg font-semibold">Tentang WenGPT</h2>
      <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card/55">
        <Row title="Asisten" detail="Chat AI dengan sandbox Linux, terminal, dan File Manager." />
        <Row title="Keamanan secret" detail="Enkripsi AES-GCM di perangkat; nilai disamarkan dari keluaran AI." />
      </div>
    </section>
  );
}

function SettingsPage() {
  const [tab, setTab] = useState<Tab>("secrets");
  const snapshot = useChatStore();
  useEffect(() => void loadSecrets(), []);
  const back = snapshot.activeId;
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/60 bg-background/88 px-4 py-3 backdrop-blur-xl">
        <Button asChild variant="outline" size="icon">
          {back ? (
            <Link to="/chat/$sessionId" params={{ sessionId: back }} aria-label="Kembali ke chat"><ArrowLeft className="size-4" /></Link>
          ) : (
            <Link to="/" aria-label="Kembali"><ArrowLeft className="size-4" /></Link>
          )}
        </Button>
        <Settings className="size-4 text-primary" />
        <h1 className="text-sm font-semibold">Pengaturan</h1>
      </header>
      <div className="mx-auto grid w-full max-w-4xl gap-5 px-4 py-5 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-8 sm:py-8">
        <nav className="flex gap-1.5 overflow-x-auto sm:flex-col" aria-label="Menu pengaturan">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors ${tab === t.id ? "bg-primary/15 font-medium text-primary" : "text-muted-foreground hover:bg-muted/60"}`}
            >
              <t.icon className="size-4" /> {t.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 animate-fade-in" key={tab}>
          {tab === "secrets" ? <SecretsPanel /> : tab === "data" ? <DataPanel /> : <AboutPanel />}
        </div>
      </div>
    </main>
  );
}
