function getInitial(username) {
  return String(username || "?").trim().charAt(0).toUpperCase() || "?";
}

export default function RankedAvatar({
  user,
  skin,
  size = "md",
  className = "",
  showRibbon = false,
}) {
  const displaySkin = skin || {};
  const variant = displaySkin.frameVariant || "royal";
  const style = {
    "--rank-frame-bg":
      displaySkin.background ||
      "linear-gradient(145deg, rgba(91,33,182,0.72), rgba(15,23,42,0.96))",
    "--rank-frame-border": displaySkin.border || "rgba(139,92,246,0.38)",
    "--rank-frame-accent": displaySkin.accent || "#8b5cf6",
    "--rank-frame-secondary": displaySkin.secondaryAccent || displaySkin.accent || "#c4b5fd",
    "--rank-frame-text": displaySkin.textColor || "#ffffff",
    "--rank-frame-glow": displaySkin.glow || "rgba(139,92,246,0.28)",
  };

  return (
    <div
      className={`ranked-avatar ranked-avatar-${size} ranked-avatar-variant-${variant} ${className}`.trim()}
      style={style}
    >
      <span className="ranked-avatar-aura" />
      <span className="ranked-avatar-backdrop" />
      <span className="ranked-avatar-ornament ranked-avatar-ornament-top" />
      <span className="ranked-avatar-ornament ranked-avatar-ornament-bottom" />
      <span className="ranked-avatar-ornament ranked-avatar-ornament-left" />
      <span className="ranked-avatar-ornament ranked-avatar-ornament-right" />
      <span className="ranked-avatar-aux ranked-avatar-aux-left" />
      <span className="ranked-avatar-aux ranked-avatar-aux-right" />
      <span className="ranked-avatar-orb ranked-avatar-orb-top" />
      <span className="ranked-avatar-orb ranked-avatar-orb-bottom" />
      <span className="ranked-avatar-orb ranked-avatar-orb-left" />
      <span className="ranked-avatar-orb ranked-avatar-orb-right" />
      <span className="ranked-avatar-core-ring" />
      <div className="ranked-avatar-core">
        {user?.avatar ? (
          <img
            src={user.avatar}
            alt={user?.username || "avatar"}
            className="ranked-avatar-image"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="ranked-avatar-fallback">{getInitial(user?.username)}</span>
        )}
      </div>
      <span className="ranked-avatar-crest">
        {displaySkin.crest || displaySkin.tier?.charAt(0) || "I"}
      </span>
      {showRibbon && displaySkin.ribbon && (
        <span className="ranked-avatar-ribbon">{displaySkin.ribbon}</span>
      )}
    </div>
  );
}
