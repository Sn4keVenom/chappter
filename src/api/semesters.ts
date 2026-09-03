// src/api/semesters.ts
//
// The mechanism behind "reset all points, but keep the previous ranking for
// reference": points are already scoped per-semester, so starting a new one
// is the reset — see backend/routes/semesters.routes.ts's doc comment.

import { apiClient } from "./client";

export interface Semester {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export async function listSemesters(): Promise<Semester[]> {
  const { data } = await apiClient.get<{ semesters: Semester[] }>("/semesters");
  return data.semesters;
}

export async function createSemester(payload: {
  label: string;
  startDate: string;
  endDate: string;
}): Promise<Semester> {
  const { data } = await apiClient.post<{ semester: Semester }>("/semesters", payload);
  return data.semester;
}
