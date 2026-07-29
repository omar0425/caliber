import { prisma } from "./prisma";
import { deleteStoredFile } from "./upload";

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
      console.error("upload cleanup failed", result.reason);
    }
  }
}
