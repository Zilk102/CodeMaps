export function getRiskColor(risk: string): string {
  switch (risk) {
    case 'critical':
      return 'bg-[rgba(255,107,107,0.16)] text-(--red)';
    case 'high':
      return 'bg-[rgba(255,170,68,0.18)] text-(--orange)';
    case 'medium':
      return 'bg-[rgba(255,210,102,0.18)] text-(--yellow)';
    case 'low':
      return 'bg-[rgba(64,201,114,0.18)] text-(--green)';
    default:
      return 'bg-(--bg2) text-(--t1)';
  }
}

export function getFileStatusDotClass(status: unknown): string {
  if (status === 'added') return 'bg-(--green)';
  if (status === 'deleted') return 'bg-(--red)';
  return 'bg-(--yellow)';
}
