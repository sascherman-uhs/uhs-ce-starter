export default function LoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // This layout is nested inside /admin/layout.tsx.
  // We need to break out of the sidebar layout for the login page.
  // We do this by rendering a full-screen overlay that covers the sidebar.
  return (
    <div className="fixed inset-0 z-50 bg-background">
      {children}
    </div>
  )
}
