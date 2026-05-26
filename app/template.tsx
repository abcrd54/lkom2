export default function AppTemplate({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="route-transition">{children}</div>;
}
