import express from "express";
import cors from "cors"
import { PrismaClient } from "@prisma/client";
import { expandSessions, sortSessions, scheduleSessions } from "./scheduler.js";
import { createSessionsForBatch, createSessionsForAllBatchesIfMissing } from "./dynamicSave.js";
import { normalizeSessionsForGA, addFillersToReachAllSlots, generateTimetableGA } from "./gaScheduler.js";

const prisma = new PrismaClient();
const app = express();
app.use(cors());
app.use(express.json());

// ------------------ CRUD APIs ---------------------- //
app.post("/teachers", async (req, res) => {
  try {
    const data = Array.isArray(req.body) ? req.body : [req.body];
    let createdCount = 0;

    for (const t of data) {
      // Prepare subjects to connect if any
      const subjectsToConnect = t.r_subject?.map(s => ({ id: s })) || [];

      // Create teacher one by one and connect subjects
      await prisma.teacher.create({
        data: {
          name: t.name,
          maxHours: t.maxHours,
          u_entry: t.u_entry,
          u_leave: t.u_leave,
          r_subject: {
            connect: subjectsToConnect
          }
        }
      });

      createdCount++;
    }

    res.json({ created: createdCount, message: "Teachers created one by one with subjects connected." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/teachers', async (req, res) => {
  try {
    const teachers = await prisma.teacher.findMany();

    const formattedTeachers = teachers.map((t, index) => ({
      id: t.id,
      name: t.name,
      subject: ["Computer Science", "Mathematics", "Physics"][index % 3], 
      phone: `+123456789${index}`, 
      email: `${t.name.toLowerCase().replace(/\s+/g, '')}@school.com`, 
      workload: `${t.maxHours} hrs/week` 
    }));

    res.status(200).json(formattedTeachers);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch teachers" });
  }
});


app.get("/teacher/:id", async (req, res) => {
  try {
    const teacher = await prisma.teacher.findUnique({
      where: { id: req.params.id },
      include: {
        subjects: true,
        classrooms: true,
      },
    });
    res.json(teacher);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch teacher" });
  }
});

app.put("/teacher/:id", async (req, res) => {
  try {
    const { name, maxHours, u_entry, u_leave, subjectIds, classroomIds } = req.body;

    const updatedTeacher = await prisma.teacher.update({
      where: { id: req.params.id },
      data: {
        name,
        maxHours,
        u_entry,
        u_leave,
        subjects: {
          set: subjectIds?.map((id) => ({ id })) || [],
        },
        classrooms: {
          set: classroomIds?.map((id) => ({ id })) || [],
        },
      },
      include: { subjects: true, classrooms: true },
    });

    res.json(updatedTeacher);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update teacher" });
  }
});

app.post("/batches", async (req, res) => {
  try {
    const data = Array.isArray(req.body) ? req.body : [req.body];
    const createdBatches = [];

    for (const b of data) {
      // 🔹 Validate Subjects
      const existingSubjects = b.b_subject?.length
        ? await prisma.subject.findMany({ where: { id: { in: b.b_subject } } })
        : [];
      if (b.b_subject && existingSubjects.length !== b.b_subject.length) {
        return res.status(400).json({
          error: "Some subjects do not exist in the database.",
          missingSubjects: b.b_subject.filter(
            s => !existingSubjects.find(es => es.id === s)
          ),
        });
      }

      // 🔹 Validate Teachers
      const existingTeachers = b.t_subject?.length
        ? await prisma.teacher.findMany({ where: { id: { in: b.t_subject } } })
        : [];
      if (b.t_subject && existingTeachers.length !== b.t_subject.length) {
        return res.status(400).json({
          error: "Some teachers do not exist in the database.",
          missingTeachers: b.t_subject.filter(
            t => !existingTeachers.find(et => et.id === t)
          ),
        });
      }

      // 🔹 Check Classroom; if not exist, create one automatically
      let classroom;
      if (b.classroomId) {
        classroom = await prisma.classroom.findUnique({
          where: { id: b.classroomId },
        });
      }

      if (!classroom) {
        classroom = await prisma.classroom.create({
          data: {
            name: `${b.name} Classroom`,
            type: "Theory",
            capacity: b.strength || 60,  // default 60 if not provided
            equipment: ["Projector", "AC", "Whiteboard"],
          },
        });
      }

      // 🔹 Create Batch
      const batch = await prisma.batch.create({
        data: {
          name: b.name,
          priority: b.priority || 1,
          c_start: b.c_start || 9,
          c_end: b.c_end || 16,
          c_start_day: b.c_start_day, // Must be Mon/Tue/Wed/Thu/Fri/Sat
          c_end_day: b.c_end_day,
          strength: b.strength || 0,
          numLabs: b.numLabs || 0,
          classroomId: classroom.id, // assign classroom automatically
          b_subject: b.b_subject
            ? { connect: b.b_subject.map(s => ({ id: s })) }
            : undefined,
          t_subject: b.t_subject
            ? { connect: b.t_subject.map(t => ({ id: t })) }
            : undefined,
        },
        include: {
          classroom: true,
          b_subject: true,
          t_subject: true,
        },
      });

      createdBatches.push(batch);
    }

    // 🔹 Final Response
    res.json({
      created: createdBatches.length,
      message: "Batches created successfully with classrooms.",
      batches: createdBatches,
    });
  } catch (error) {
    console.error("❌ Error creating batch:", error);
    res.status(500).json({ error: error.message });
  }
});



app.put("/classroom/:id", async (req, res) => {
  try {
    const { name, priority } = req.body;
    const updatedClassroom = await prisma.classroom.update({
      where: { id: req.params.id },
      data: { name, priority },
    });
    res.json(updatedClassroom);
  } catch (err) {
    res.status(500).json({ error: "Failed to update classroom" });
  }
});


app.get("/subjects", async (req, res) => {
  try {
    const subjects = await prisma.subject.findMany({
      select: {
        id: true,
        name: true,
      },
    });

    // Map backend data + fake fields
    const formatted = subjects.map((s, i) => ({
      id: s.id,
      name: s.name,
      code: `FAKE${100 + i}`,
      credits: (i % 4) + 2,
      semester: (i % 8) + 1,
      subject: "General",
    }));

    res.type("text/plain").send(formatted);
  } catch (err) {
    res.status(500).send("Failed to fetch subjects");
  }
});


app.post("/subjects", async (req, res) => {
  try {
    if (Array.isArray(req.body)) {
      // Insert Many
      const data = req.body.map((item) => ({
        ...item,
        time_taken: item.time_taken ? parseInt(item.time_taken, 10) : null,
      }));

      const result = await prisma.subject.createMany({
        data,
        skipDuplicates: true,
      });
      return res.json({ message: "Multiple subjects inserted", result });
    }

    // Insert Single
    const singleData = {
      ...req.body,
      time_taken: req.body.time_taken
        ? parseInt(req.body.time_taken, 10)
        : null,
    };

    const result = await prisma.subject.create({
      data: singleData,
    });

    res.json({ message: "Single subject inserted", result });
  } catch (error) {
    console.error("Error inserting subjects:", error);
    res.status(500).json({ error: "Error inserting subjects" });
  }
});


app.get("/classrooms", async (req, res) => {
  try {
    const classrooms = await prisma.classroom.findMany();
    res.json(classrooms);
  } catch (error) {
    console.error("Error fetching classrooms:", error);
    res.status(500).json({ error: "Error fetching classrooms" });
  }
});

// POST classrooms (single or multiple)
app.post("/classrooms", async (req, res) => {
  try {
    if (Array.isArray(req.body)) {
      // Insert Many
      const data = req.body.map((item) => ({
        ...item,
        capacity: item.capacity ? parseInt(item.capacity, 10) : null,
      }));

      const result = await prisma.classroom.createMany({
        data,
        skipDuplicates: true,
      });
      return res.json({ message: "Multiple classrooms inserted", result });
    }

    // Insert Single
    const singleData = {
      ...req.body,
      capacity: req.body.capacity ? parseInt(req.body.capacity, 10) : null,
    };

    const result = await prisma.classroom.create({
      data: singleData,
    });

    res.json({ message: "Single classroom inserted", result });
  } catch (error) {
    console.error("Error inserting classrooms:", error);
    res.status(500).json({ error: "Error inserting classrooms" });
  }
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

// genetic algorithm timetable
app.get("/timetable-ga", async (req, res) => {
  try {
    // optional: auto-create sessions for all batches that are missing
    await createSessionsForAllBatchesIfMissing();

    // fetch teachers
    const teachers = await prisma.teacher.findMany({
      select: {
        id: true,
        name: true,
        maxHours: true,
        u_entry: true,
        u_leave: true
      }
    });

    // fetch batches + sessions
    const batches = await prisma.batch.findMany({
      include: {
        sessions: { include: { subject: true, teacher: true } },
      }
    });

    console.log(">>>>>>> Teachers; ", teachers);
    console.log(">>>>>>> batches: ", batches);

    // build GA-compatible sessions
    const sessions = [];
    batches.forEach(batch => {
      batch.sessions.forEach(s => {
        sessions.push({
          id: s.id,
          batchId: batch.id,
          batchName: batch.name,
          subjectId: s.subjectId,
          subjectName: s.subject?.name || s.subjectId,
          type: s.type || (s.subject?.isLab ? "lab" : "class"),
          teacher: s.teacherId || null,
          teachers:
            s.type === "lab"
              ? (s.subject?.teachers?.map(t => t.id) || [])
              : (s.teacherId ? [s.teacherId] : []),
          hours: s.duration || s.subject?.time_taken || 1
        });
      });
    });

    console.log(">>>> Batches fetched:", batches.length);
    console.log(">>>> Sessions to schedule:", sessions.length);
    console.log(">>>> Teachers fetched:", teachers.length);

    // debug preview
    console.log("Sessions (preview):", JSON.stringify(sessions.slice(0, 30), null, 2));
    console.log("Teachers (preview):", JSON.stringify(teachers.slice(0, 30), null, 2));

    // optional GA params from querystring
    const opts = {};
    if (req.query.popSize) opts.popSize = parseInt(req.query.popSize);
    if (req.query.generations) opts.generations = parseInt(req.query.generations);
    if (req.query.mutationRate) opts.mutationRate = parseFloat(req.query.mutationRate);

    // run GA
    const timetable = await generateTimetableGA(sessions, teachers, opts);

    // --- NEW STEP: ensure all blanks filled with FREE ---
    for (const day of Object.keys(timetable)) {
      for (let i = 0; i < timetable[day].length; i++) {
        if (Object.keys(timetable[day][i]).length === 0) {
          timetable[day][i] = {
            FREE: {
              subject: "FREE",
              type: "free",
              teacherNames: [],
              teacherIds: []
            }
          };
        }
      }
    }

    // summary log
    console.log("------ TIMETABLE RESULT (summary) ------");
    for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri"]) {
      console.log(d + ":");
      timetable[d].forEach((slot, idx) => {
        console.log(`  Slot ${idx + 1}:`, Object.keys(slot).length ? slot : "{FREE}");
      });
    }

    res.json(timetable || { message: "No valid timetable found (GA)" });
  } catch (err) {
    console.error("Error in /timetable-ga:", err);
    res.status(500).json({ error: err.message });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
