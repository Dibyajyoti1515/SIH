// dynamicSave.js
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export async function createSessionsForBatch(batchId) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: {
      b_subject: true,
      t_subject: true
    }
  });

  if (!batch) throw new Error("Batch not found: " + batchId);

  const subjectIds = batch.b_subject.map(s => s.id);
  const subjects = await prisma.subject.findMany({
    where: { id: { in: subjectIds } }
  });

  const existing = await prisma.session.findMany({ where: { batchId } });
  if (existing.length > 0) return existing;

  const created = [];
  for (const sub of subjects) {
    const duration = sub.time_taken || 1;
    let teacherId = null;

    if (!sub.isLab && batch.t_subject && batch.t_subject.length > 0) {
      for (const t of batch.t_subject) {
        const teacher = await prisma.teacher.findUnique({
          where: { id: t.id },
          include: { r_subject: true }
        });
        if (teacher && teacher.r_subject.some(rs => rs.id === sub.id)) {
          teacherId = teacher.id;
          break;
        }
      }
      if (!teacherId && batch.t_subject.length > 0) teacherId = batch.t_subject[0].id;
    }

    if (sub.isLab) {
      // labs stay as they are (multi-hour block)
      const sess = await prisma.session.create({
        data: {
          batchId: batch.id,
          subjectId: sub.id,
          teacherId: null,
          duration,
          type: "lab"
        }
      });
      created.push(sess);
    } else {
      // Non-lab subjects: split multi-hour into separate 1-hour sessions
      for (let i = 0; i < duration; i++) {
        const sess = await prisma.session.create({
          data: {
            batchId: batch.id,
            subjectId: sub.id,
            teacherId,
            duration: 1,         // always 1 hour
            type: "class",
            // 🔑 new flag: spreadAcrossDays
            spreadAcrossDays: true
          }
        });
        created.push(sess);
      }
    }
  }

  return created;
}

export async function createSessionsForAllBatchesIfMissing() {
  const batches = await prisma.batch.findMany({ include: { sessions: true } });
  const results = [];
  for (const b of batches) {
    if (!b.sessions || b.sessions.length === 0) {
      results.push({ batchId: b.id, created: await createSessionsForBatch(b.id) });
    }
  }
  return results;
}

export default { createSessionsForBatch, createSessionsForAllBatchesIfMissing };
