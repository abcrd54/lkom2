export function PageShell({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <main className="app-shell">{children}</main>;
}
