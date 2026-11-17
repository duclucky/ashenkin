export function DepthDoorArt({ lit = false, opened = false, tone = '#222', className }: {
  lit?: boolean; opened?: boolean; tone?: string; className?: string
}) {
  const frame = '#111'
  return (
    <svg viewBox="0 0 24 32" shapeRendering="crispEdges" className={className} aria-hidden="true">
      {lit && <g>
        <rect x={11} y={0} width={2} height={2} fill={frame} />
        <rect x={10} y={2} width={4} height={4} fill={frame} />
        <rect x={11} y={3} width={2} height={2} fill="#FFDD00" className="chm-m-blink" />
      </g>}
      <rect x={3} y={7} width={18} height={25} fill={frame} />
      {opened && <rect x={5} y={9} width={14} height={23} fill={tone} opacity={0.8} />}
      <g className={opened ? 'chm-lantern-door-open' : undefined} transform={opened ? 'translate(3 0) scale(.4 1)' : undefined}>
        <rect x={5} y={9} width={14} height={23} fill="#8e5a28" />
        <rect x={5} y={9} width={14} height={2} fill="#c08447" />
        <rect x={9} y={11} width={1} height={21} fill="#5e3a18" />
        <rect x={14} y={11} width={1} height={21} fill="#5e3a18" />
        <rect x={5} y={16} width={14} height={1} fill={frame} />
        <rect x={5} y={25} width={14} height={1} fill={frame} />
        <rect x={16} y={20} width={2} height={2} fill="#FFDD00" />
      </g>
      <rect x={1} y={7} width={2} height={25} fill="#c9c4b5" />
      <rect x={21} y={7} width={2} height={25} fill="#c9c4b5" />
    </svg>
  )
}
