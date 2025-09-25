// scheduler.js
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
export const slotsPerDay = 7;

// Convert batch sessions to individual sessions for scheduling
export function expandSessions(batches) {
  const sessions = [];

  batches.forEach(batch => {
    batch.sessions.forEach(s => {
      const teachers = s.teacherId ? [s.teacherId] : [];
      if (s.subject.isLab) {
        sessions.push({
          batchId: batch.id,
          batchName: batch.name,
          batchPriority: batch.priority,
          subjectName: s.subject.name,
          type: "lab",
          teachers,
          hours: s.duration
        });
      } else {
        for (let i = 0; i < s.duration; i++) {
          sessions.push({
            batchId: batch.id,
            batchName: batch.name,
            batchPriority: batch.priority,
            subjectName: s.subject.name,
            type: "class",
            teacher: s.teacherId,
            hours: 1
          });
        }
      }
    });
  });

  return sessions;
}

// Sort sessions by type (labs first), hours, batch priority
export function sortSessions(sessions, teachers) {
  return sessions.sort((a, b) => {
    if (a.type !== b.type) return a.type === "lab" ? -1 : 1;
    if (a.hours !== b.hours) return b.hours - a.hours;
    return a.batchPriority - b.batchPriority;
  });
}

// Schedule sessions using backtracking
export async function scheduleSessions(sessions, teachers) {
  // Map teacherId -> maxHours & usedHours
  const teacherHours = {};
  teachers.forEach(t => {
    teacherHours[t.id] = { used: 0, max: t.maxHours, name: t.name };
  });

  // Initialize timetable
  const timetable = {};
  days.forEach(day => {
    timetable[day] = Array(slotsPerDay).fill(null).map(() => ({}));
  });

  // Check if a session can be placed
  function canPlace(session, day, slot) {
    if (slot + session.hours > slotsPerDay) return false;

    const involvedTeachers = session.type === "class" ? [session.teacher] : session.teachers;

    for (const tId of involvedTeachers) {
      if (!teacherHours[tId]) return false; // teacher doesn't exist
      if (teacherHours[tId].used + session.hours > teacherHours[tId].max) return false;
    }

    for (let i = 0; i < session.hours; i++) {
      if (timetable[day][slot + i][session.batchName]) return false; // batch already has session
      const occupiedTeachers = Object.values(timetable[day][slot + i]);
      if (occupiedTeachers.some(v => involvedTeachers.includes(v.teacherId))) return false;
    }

    return true;
  }

  // Place session in timetable
  function placeSession(session, day, slot) {
    const involvedTeachers = session.type === "class" ? [session.teacher] : session.teachers;

    for (let i = 0; i < session.hours; i++) {
      timetable[day][slot + i][session.batchName] = {
        subject: session.subjectName,
        type: session.type,
        teacher: involvedTeachers.map(tId => teacherHours[tId].name).join(", ")
      };
    }

    involvedTeachers.forEach(tId => {
      teacherHours[tId].used += session.hours;
    });
  }

  // Remove session from timetable (backtracking)
  function removeSession(session, day, slot) {
    const involvedTeachers = session.type === "class" ? [session.teacher] : session.teachers;

    for (let i = 0; i < session.hours; i++) {
      delete timetable[day][slot + i][session.batchName];
    }

    involvedTeachers.forEach(tId => {
      teacherHours[tId].used -= session.hours;
    });
  }

  // Recursive backtracking
  function backtrack(i = 0) {
    if (i === sessions.length) return true;

    const session = sessions[i];
    for (const day of days) {
      for (let slot = 0; slot <= slotsPerDay - session.hours; slot++) {
        if (canPlace(session, day, slot)) {
          placeSession(session, day, slot);
          if (backtrack(i + 1)) return true;
          removeSession(session, day, slot);
        }
      }
    }

    return false;
  }

  const success = backtrack();
  return success ? timetable : null;
}
