export function AdminLoadingShell() {
  return (
    <main className="app-shell">
      <div className="route-progress" aria-hidden="true">
        <span className="route-progress-bar" />
      </div>
      <div className="adminlte-layout">
        <aside className="admin-sidebar">
          <div className="sidebar-brand">
            <div className="brand-badge">OE</div>
            <div>
              <p className="sidebar-kicker">OTP Console</p>
              <h2>AdminLTE Style</h2>
            </div>
          </div>

          <nav className="sidebar-nav">
            <div className="skeleton sidebar-skeleton-link" />
            <div className="skeleton sidebar-skeleton-link" />
            <div className="skeleton sidebar-skeleton-link" />
            <div className="skeleton sidebar-skeleton-link" />
          </nav>

          <div className="sidebar-user sidebar-user-bottom">
            <div className="sidebar-avatar skeleton-avatar" />
            <div className="sidebar-user-copy">
              <div className="skeleton skeleton-text short" />
              <div className="skeleton skeleton-text medium" />
            </div>
          </div>
        </aside>

        <div className="admin-content route-transition">
          <header className="topbar">
            <div className="topbar-left">
              <span className="topbar-toggle">|||</span>
              <div className="topbar-copy">
                <div className="skeleton skeleton-text medium" />
                <div className="skeleton skeleton-text long" />
              </div>
            </div>
            <div className="topbar-right">
              <div className="skeleton chip-skeleton" />
              <div className="skeleton chip-skeleton" />
            </div>
          </header>

          <section className="content-header">
            <div className="content-header-copy">
              <div className="skeleton skeleton-title" />
              <div className="skeleton skeleton-text long" />
            </div>
            <div className="header-actions">
              <div className="skeleton button-skeleton" />
              <div className="skeleton button-skeleton" />
            </div>
          </section>

          <section className="small-box-grid">
            <div className="small-box skeleton-box" />
            <div className="small-box skeleton-box" />
            <div className="small-box skeleton-box" />
            <div className="small-box skeleton-box" />
          </section>

          <section className="card card-span-full">
            <div className="card-header">
              <div className="content-header-copy">
                <div className="skeleton skeleton-text medium" />
                <div className="skeleton skeleton-text long" />
              </div>
            </div>
            <div className="loading-table">
              <div className="skeleton row-skeleton" />
              <div className="skeleton row-skeleton" />
              <div className="skeleton row-skeleton" />
              <div className="skeleton row-skeleton" />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
