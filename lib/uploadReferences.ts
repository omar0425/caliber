import { prisma } from "./prisma";
import { deleteStoredFile } from "./upload";
import { recordFailure } from "./errorLog";

export async function deleteStoredFileIfUnreferenced(publicUrl: string): Promise<void> {
  const [cover, photo, document] = await Promise.all([
    prisma.watch.findFirst({ where: { imageUrl: publicUrl }, select: { id: true } }),
    prisma.photo.findFirst({ where: { url: publicUrl }, select: { id: true } }),
    prisma.document.findFirst({ where: { url: publicUrl }, select: { id: true } }),
  ]);
  if (!cover && !photo && !document) await deleteStoredFile(publicUrl);
}

export async function deleteStoredFilesBestEffort(publicUrls: string[]): Promise<void> {
  const unique = [...new Set(publicUrls)];
  const results = await Promise.allSettled(unique.map(deleteStoredFileIfUnreferenced));
  for (const result of results) {
    if (result.status === "rejected") {
      await recordFailure("lib/uploadReferences", result.reason, { level: "warn" });
    }
  }
}
