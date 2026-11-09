import { prisma } from "./prisma";
import { deleteStoredFilesBestEffort } from "./uploadReferences";
import { RequestError } from "./security";

// NOT WIRED TO ANY ROUTE. Merging is turned off (app/api/duplicates/route.ts)
// until the review's B1/B2 findings are fixed: reconcile status, headline
// value, a $0 price and typed fields; keep captions and never delete a file;
// snapshot the database and keep an undo record first; merge one pair at a
// time. Do not call this from a route before then.
//
// Folds a duplicate record into the one the collector chose to keep:
//   • photos, documents, valuations, and service records move over (a photo
//     row pointing at a file the kept watch already has is dropped — the file
//     itself stays, since the kept watch still uses it);
//   • collection details the kept record is missing (price, date, condition,
//     owner, nickname, cover photo) are filled from the duplicate; nothing the
//     kept record already has is overwritten; differing notes are appended;
//   • then the duplicate is deleted. One transaction — all or nothing.
export async function mergeWatches(keepId: string, removeId: string): Promise<{ keepId: string }> {
  if (!keepId || !removeId || keepId === removeId) {
    throw new RequestError("Choose two different watches to merge.", 400);
  }

  const removedCover = await prisma.$transaction(async (tx) => {
    const [keep, remove] = await Promise.all([
      tx.watch.findUnique({ where: { id: keepId }, include: { photos: true } }),
      tx.watch.findUnique({ where: { id: removeId }, include: { photos: true } }),
    ]);
    if (!keep || !remove) throw new RequestError("One of these watches no longer exists. Refresh the page.", 404);

    const keptUrls = new Set(keep.photos.map((p) => p.url));
    const duplicatePhotoIds = remove.photos.filter((p) => keptUrls.has(p.url)).map((p) => p.id);
    if (duplicatePhotoIds.length) await tx.photo.deleteMany({ where: { id: { in: duplicatePhotoIds } } });
    await tx.photo.updateMany({ where: { watchId: removeId }, data: { watchId: keepId, caption: null } });
    await tx.document.updateMany({ where: { watchId: removeId }, data: { watchId: keepId } });
    await tx.valuation.updateMany({ where: { watchId: removeId }, data: { watchId: keepId } });
    await tx.serviceRecord.updateMany({ where: { watchId: removeId }, data: { watchId: keepId } });

    const notes =
      remove.notes?.trim() && remove.notes.trim() !== keep.notes?.trim()
        ? [keep.notes?.trim(), `Merged from a duplicate record: ${remove.notes.trim()}`].filter(Boolean).join("\n\n")
        : keep.notes;
    const lastServiced =
      keep.lastServicedDate && remove.lastServicedDate
        ? new Date(Math.max(keep.lastServicedDate.getTime(), remove.lastServicedDate.getTime()))
        : keep.lastServicedDate ?? remove.lastServicedDate;

    await tx.watch.update({
      where: { id: keepId },
      data: {
        purchasePrice: keep.purchasePrice ?? remove.purchasePrice,
        purchaseDate: keep.purchaseDate ?? remove.purchaseDate,
        condition: keep.condition?.trim() ? keep.condition : remove.condition,
        owner: keep.owner?.trim() ? keep.owner : remove.owner,
        nickname: keep.nickname?.trim() ? keep.nickname : remove.nickname,
        imageUrl: keep.imageUrl ?? remove.imageUrl,
        lastServicedDate: lastServiced,
        notes,
      },
    });
    await tx.watch.delete({ where: { id: removeId } });
    return remove.imageUrl;
  });

  // Only removes the duplicate's cover file if nothing (now including the kept
  // watch's moved photos) still references it.
  if (removedCover) await deleteStoredFilesBestEffort([removedCover]);
  return { keepId };
}
