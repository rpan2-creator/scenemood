export function LogoMark({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M4 11V6a2 2 0 0 1 2-2h5" />
        <path d="M21 4h5a2 2 0 0 1 2 2v5" />
        <path d="M28 21v5a2 2 0 0 1-2 2h-5" />
        <path d="M11 28H6a2 2 0 0 1-2-2v-5" />
      </g>
      <path d="M16 9a7 7 0 0 0 0 14z" fill="var(--tungsten)" />
      <path d="M16 9a7 7 0 0 1 0 14z" fill="var(--daylight)" />
    </svg>
  )
}

export default function Logo({ size = 24, onClick }) {
  return (
    <a className="logo" href="#/" onClick={onClick} aria-label="SceneMood home">
      <LogoMark size={size} />
      <span className="logo-word">SceneMood</span>
    </a>
  )
}
