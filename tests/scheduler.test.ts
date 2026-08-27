import { describe, expect, it } from "vitest";
import {
  getSchedules,
  getScheduleById,
  upsertSchedule,
  deleteSchedule,
  upsertLead,
} from "../server/store/db";
import type { Schedule, StoredLead } from "../server/store/types";
import { buildScheduleJobInput, scheduler } from "../server/scheduler/scheduler";

function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  const now = new Date().toISOString();
  return {
    id: "sch-1",
    name: "Autopilot Campinas",
    cron: "0 9 * * 1-5",
    jobType: "mcp_autopilot",
    payload: { location: "Campinas", state: "SP", category: "Dentista" },
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("scheduler / schedules (orquestração periódica)", () => {
  it("faz CRUD de agendamentos persistidos no banco compartilhado", () => {
    upsertSchedule(makeSchedule());
    expect(getScheduleById("sch-1")?.name).toBe("Autopilot Campinas");
    expect(getSchedules().length).toBeGreaterThanOrEqual(1);

    upsertSchedule({ ...makeSchedule(), name: "Autopilot Renomeado", enabled: false });
    const u = getScheduleById("sch-1")!;
    expect(u.name).toBe("Autopilot Renomeado");
    expect(u.enabled).toBe(false);

    expect(deleteSchedule("sch-1")).toBe(true);
    expect(getScheduleById("sch-1")).toBeUndefined();
  });

  it("buildScheduleJobInput converte autopilot para o payload correto", () => {
    const input = buildScheduleJobInput(makeSchedule(), 7);
    expect(input.type).toBe("mcp_autopilot");
    expect(input.title).toContain("[Agendado]");
    expect(input.payload).toMatchObject({
      location: "Campinas",
      state: "SP",
      category: "Dentista",
      autoEnrich: true,
      maxLeads: 7,
    });
  });

  it("buildScheduleJobInput converte batch para o payload correto", () => {
    const input = buildScheduleJobInput(
      makeSchedule({
        id: "sch-batch",
        jobType: "batch_prospecting",
        payload: { locations: ["Sorocaba"], state: "SP", categories: ["Oficina"] },
      })
    );
    expect(input.type).toBe("batch_prospecting");
    expect(input.payload).toMatchObject({
      locations: ["Sorocaba"],
      state: "SP",
      categories: ["Oficina"],
      filterNoWebsiteOnly: true,
      autoEnrich: true,
    });
  });

  it("buildScheduleJobInput converte follow_up_reminder para follow_up_batch", () => {
    const input = buildScheduleJobInput(
      makeSchedule({
        id: "sch-follow",
        jobType: "follow_up_reminder",
        payload: {},
      })
    );
    expect(input.type).toBe("follow_up_batch");
    expect(input.payload).toEqual({});
    expect(input.title).toContain("[Agendado]");
  });

  it("enqueueForSchedule enfileira um job follow_up_batch para follow_up_reminder", () => {
    const job = scheduler.enqueueForSchedule(
      makeSchedule({
        id: "sch-follow-enq",
        jobType: "follow_up_reminder",
        payload: {},
      })
    );
    expect(job).not.toBeNull();
    expect(job!.type).toBe("follow_up_batch");
  });
});