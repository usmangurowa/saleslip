export default function PortalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="bg-background relative isolate flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden p-6 md:p-10">
      <div
        aria-hidden
        className="bg-foreground/5 pointer-events-none absolute -top-40 -right-40 -z-10 size-160 rounded-full blur-[160px]"
      />
      <div
        aria-hidden
        className="bg-foreground/5 pointer-events-none absolute -bottom-40 -left-40 -z-10 size-160 rounded-full blur-[160px]"
      />

      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
