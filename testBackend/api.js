// api.js
import express from "express";
import { PrismaClient } from "@prisma/client";
import { expandSessions, sortSessions, scheduleSessions } from "./scheduler.js";
import { createSessionsForBatch } from "./dynamicSave.js";

const prisma = new PrismaClient();
const app = express();
app.use(express.json());

// ---------------------- CRUD APIs ---------------------- //
app.post("/teachers", async (req, res) => {
  const data = Array.isArray(req.body) ? req.body : [req.body];
  const result = await prisma.teacher.createMany({ data, skipDuplicates: true });
  res.json(result);
});

app.post("/batches", async (req, res) => {
  const data = Array.isArray(req.body) ? req.body : [req.body];
  const result = await prisma.batch.createMany({ data, skipDuplicates: true });
  res.json(result);
});

app.post("/subjects", async (req, res) => {
  const data = Array.isArray(req.body) ? req.body : [req.body];
  const result = await prisma.subject.createMany({ data, skipDuplicates: true });
  res.json(result);
});

// Generate sessions dynamically for a batch
app.post("/sessions/:batchId", async (req, res) => {
  const batchId = req.params.batchId;
  await createSessionsForBatch(batchId);
  res.json({ message: "Sessions created for batch" });
});

// Generate timetable
app.get("/generate-timetable", async (req, res) => {
  const teachers = await prisma.teacher.findMany({});
  const batches = await prisma.batch.findMany({
    include: { sessions: { include: { subject: true, teacher: true } } }
  });

  const sessions = expandSessions(batches);
  const sortedSessions = sortSessions(sessions, teachers);
  const timetable = await scheduleSessions(sortedSessions, teachers);

  res.json(timetable || { message: "No valid timetable found" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
