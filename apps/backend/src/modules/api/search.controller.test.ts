// Transport tests for the search endpoints: the controller maps the host result
// to the response shape and maps domain errors to the right HTTP status codes.

import { Test, type TestingModule } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { SearchController } from "./search.controller.js";
import { SearchExperimentHost, type SearchProgress } from "../experiment/index.js";

const specId = "10000000-0000-4000-8000-000000000001";

function progress(overrides: Partial<SearchProgress> = {}): SearchProgress {
  return {
    status: "running",
    stopReason: null,
    generated: 0,
    submitted: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    inFlight: 0,
    ...overrides
  };
}

async function controllerWith(host: Partial<SearchExperimentHost>): Promise<SearchController> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [SearchController],
    providers: [{ provide: SearchExperimentHost, useValue: host }]
  }).compile();
  return module.get<SearchController>(SearchController);
}

describe("SearchController", () => {
  it("starts a search and returns the initial progress snapshot", async () => {
    const controller = await controllerWith({
      begin: () => Promise.resolve(progress({ submitted: 1, generated: 1, inFlight: 1 }))
    });
    const response = await controller.start(specId);
    expect(response).toEqual({
      specId,
      status: "running",
      stopReason: null,
      generated: 1,
      submitted: 1,
      completed: 0,
      failed: 0,
      cancelled: 0,
      inFlight: 1
    });
  });

  it("maps a second start to 409 Conflict", async () => {
    const controller = await controllerWith({
      begin: () => Promise.reject(new Error(`SEARCH_ALREADY_STARTED: ${specId}`))
    });
    await expect(controller.start(specId)).rejects.toBeInstanceOf(ConflictException);
  });

  it("maps an unknown experiment to 404 Not Found", async () => {
    const controller = await controllerWith({
      progress: () => Promise.reject(new Error(`SEARCH_RUN_NOT_FOUND: ${specId}`))
    });
    await expect(controller.progress(specId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns a stopped run's progress with its reason", async () => {
    const controller = await controllerWith({
      progress: () => Promise.resolve(progress({ status: "stopped", stopReason: "max-candidates", submitted: 2, completed: 2 }))
    });
    const response = await controller.progress(specId);
    expect(response).toMatchObject({ specId, status: "stopped", stopReason: "max-candidates" });
  });

  it("pauses a search and returns the converging snapshot", async () => {
    const controller = await controllerWith({
      pause: () => Promise.resolve(progress({ status: "pausing", submitted: 1, inFlight: 1 }))
    });
    const response = await controller.pause(specId);
    expect(response).toMatchObject({ specId, status: "pausing" });
  });

  it("resumes a search and returns the running snapshot", async () => {
    const controller = await controllerWith({
      resume: () => Promise.resolve(progress({ status: "running", submitted: 2, completed: 2 }))
    });
    const response = await controller.resume(specId);
    expect(response).toMatchObject({ specId, status: "running" });
  });

  it("cancels a search and returns the cancelling snapshot", async () => {
    const controller = await controllerWith({
      cancel: () => Promise.resolve(progress({ status: "cancelling", submitted: 3, completed: 1 }))
    });
    const response = await controller.cancel(specId);
    expect(response).toMatchObject({ specId, status: "cancelling" });
  });

  it("maps an illegal control transition to 409 Conflict", async () => {
    const controller = await controllerWith({
      resume: () => Promise.reject(new Error(`SEARCH_CANNOT_RESUME: ${specId}`))
    });
    await expect(controller.resume(specId)).rejects.toBeInstanceOf(ConflictException);
  });

  it("maps controlling an unknown run to 404 Not Found", async () => {
    const controller = await controllerWith({
      cancel: () => Promise.reject(new Error(`SEARCH_RUN_NOT_FOUND: ${specId}`))
    });
    await expect(controller.cancel(specId)).rejects.toBeInstanceOf(NotFoundException);
  });
});
