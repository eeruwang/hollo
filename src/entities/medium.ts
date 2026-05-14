import { proxyUrl } from "../media-proxy";
import type { Medium } from "../schema";

function normalizeAttachmentType(type: string): string {
  if (["image", "video", "audio", "gifv", "unknown"].includes(type)) {
    return type;
  }
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return "unknown";
}

// biome-ignore lint/suspicious/noExplicitAny: JSON
export function serializeMedium(
  medium: Medium,
  baseUrl: URL | string,
): Record<string, any> {
  return {
    id: medium.id,
    type: normalizeAttachmentType(medium.type),
    url: proxyUrl(medium.url, baseUrl),
    preview_url: proxyUrl(medium.thumbnailUrl, baseUrl),
    remote_url: null,
    text_url: null,
    meta: {
      original: {
        width: medium.width,
        height: medium.height,
        size: `${medium.width}x${medium.height}`,
        aspect: medium.width / medium.height,
      },
      small: {
        width: medium.thumbnailWidth,
        height: medium.thumbnailHeight,
        size: `${medium.thumbnailWidth}x${medium.thumbnailHeight}`,
        aspect: medium.thumbnailWidth / medium.thumbnailHeight,
      },
      focus: { x: 0, y: 0 },
    },
    description: medium.description,
    blurhash: null,
  };
}
