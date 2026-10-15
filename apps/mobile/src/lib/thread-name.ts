export function threadSlug(name: string) {
  const slug = name.normalize('NFKC').trim().toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'thread';
}
