/** Keep inline delivery metadata only when the body is safely shorter than a bubble line. */
export function shouldPlaceTextMetaInline(body: string, screenWidth: number, fontScale: number) {
  return !/[\r\n]/.test(body)
    && body.length <= Math.max(14, Math.floor(screenWidth / (18 * fontScale)));
}
