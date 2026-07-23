export function sanitizeFilenameForKey(name: string): string {
  const lastDot = name.lastIndexOf('.');
  const ext = lastDot !== -1 ? name.slice(lastDot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const base = lastDot !== -1 ? name.slice(0, lastDot) : name;
  const sanitized = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')    // tudo que não é alfanumérico vira hífen
    .replace(/^-+|-+$/g, '')         // remove hífens no início/fim
    .slice(0, 80);
  return ext ? `${sanitized}.${ext}` : sanitized;
}
