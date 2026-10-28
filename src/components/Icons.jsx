const P = {
  undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'm15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
  cone: 'M12 3 5 20h14L12 3Z',
  grid: 'M3 9h18M3 15h18M9 3v18M15 3v18',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.5-1.1',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  camera: 'M3 8h12v10H3zM15 11l6-3v10l-6-3',
  light: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3Z',
  person: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0',
  cube: 'm12 2 9 5v10l-9 5-9-5V7l9-5Zm0 10 9-5M12 12 3 7m9 5v10',
  check: 'M5 12.5 10 17l9-10',
  x: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  send: 'M4 12 20 4l-6 16-3-7-7-1Z',
  download: 'M12 4v11m0 0-4-4m4 4 4-4M5 20h14',
  share: 'M8 12h8M14 8l4 4-4 4M4 5v14',
  frame: 'M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3',
  split: 'M3 5h18v14H3zM12 5v14',
  scan: 'M3 12h18M7 7l-4 5 4 5M17 7l4 5-4 5',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  rotate: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5',
  layers: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  box: 'M4 4h16v16H4z',
  arrowR: 'M5 12h14m-5-5 5 5-5 5',
  print: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  wand: 'm4 20 11-11m2-6v3m0 6v3m-3-6h-3m9 0h-3',
  image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15 9.5a1.5 1.5 0 1 0 0-.01',
}

export default function Icon({ name, size = 16, stroke = 1.7, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      <path d={P[name] || ''} />
    </svg>
  )
}
