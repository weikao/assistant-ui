"use client";

import { describe, it, expect, vi } from "vitest";
import { createAgUiSubscriber } from "../src/runtime/adapter/subscriber";
import type { AgUiEvent } from "../src/runtime/types";

describe("createAgUiSubscriber", () => {
  it("dispatches typed events without duplication", () => {
    const events: AgUiEvent[] = [];
    const subscriber = createAgUiSubscriber({
      dispatch: (evt) => events.push(evt),
      runId: "run",
    });

    subscriber.onTextMessageContentEvent?.({ event: { delta: "Hi" } });
    subscriber.onEvent?.({
      event: { type: "TEXT_MESSAGE_CONTENT", delta: "ignored" },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "TEXT_MESSAGE_CONTENT",
      delta: "Hi",
    });
  });

  it("dispatches run error and invokes hook", () => {
    const events: AgUiEvent[] = [];
    const onRunFailed = vi.fn();
    const subscriber = createAgUiSubscriber({
      dispatch: (evt) => events.push(evt),
      runId: "run",
      onRunFailed,
    });

    const error = new Error("boom");
    subscriber.onRunFailed?.({ error });

    expect(onRunFailed).toHaveBeenCalledWith(error);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "RUN_ERROR", message: "boom" });
  });

  it("does not synthesize RUN_FINISHED when finalize follows a failed run", () => {
    const events: AgUiEvent[] = [];
    const subscriber = createAgUiSubscriber({
      dispatch: (evt) => events.push(evt),
      runId: "run",
    });

    subscriber.onRunFailed?.({ error: new Error("boom") });
    subscriber.onRunFinalized?.();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "RUN_ERROR", message: "boom" });
  });

  it.each([
    [
      "AbortError name",
      Object.assign(new Error("aborted"), { name: "AbortError" }),
    ],
    ["Fetch is aborted", new Error("Fetch is aborted")],
    [
      "signal is aborted without reason",
      new Error("signal is aborted without reason"),
    ],
    ["component unmounted", new Error("component unmounted")],
  ])(
    "dispatches RUN_CANCELLED instead of RUN_ERROR for abort-shaped errors (%s)",
    (_label, error) => {
      const events: AgUiEvent[] = [];
      const subscriber = createAgUiSubscriber({
        dispatch: (evt) => events.push(evt),
        runId: "run",
      });

      subscriber.onRunFailed?.({ error });
      subscriber.onRunFinalized?.();

      expect(events).toEqual([{ type: "RUN_CANCELLED" }]);
    },
  );

  it("still forwards abort errors to the onRunFailed callback", () => {
    const onRunFailed = vi.fn();
    const events: AgUiEvent[] = [];
    const subscriber = createAgUiSubscriber({
      dispatch: (evt) => events.push(evt),
      runId: "run",
      onRunFailed,
    });

    const error = Object.assign(new Error("aborted"), { name: "AbortError" });
    subscriber.onRunFailed?.({ error });

    expect(onRunFailed).toHaveBeenCalledWith(error);
    expect(events).toEqual([{ type: "RUN_CANCELLED" }]);
  });

  it("dispatches RUN_FINISHED with outcome from onRunFinishedEvent", () => {
    const events: AgUiEvent[] = [];
    const subscriber = createAgUiSubscriber({
      dispatch: (evt) => events.push(evt),
      runId: "run",
    });

    subscriber.onRunFinishedEvent?.({
      event: {
        type: "RUN_FINISHED",
        runId: "run",
        outcome: {
          type: "interrupt",
          interrupts: [{ id: "int-1", reason: "tool_call" }],
        },
      },
    });
    subscriber.onRunFinalized?.();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "RUN_FINISHED",
      runId: "run",
      outcome: {
        type: "interrupt",
        interrupts: [{ id: "int-1", reason: "tool_call" }],
      },
    });
  });

  it("falls back to onRunFinalized when no RunFinishedEvent fires", () => {
    const events: AgUiEvent[] = [];
    const subscriber = createAgUiSubscriber({
      dispatch: (evt) => events.push(evt),
      runId: "run",
    });

    subscriber.onRunFinalized?.();

    expect(events).toEqual([{ type: "RUN_FINISHED", runId: "run" }]);
  });

  it("falls back to onRunFinalized when RunFinishedEvent has no runId", () => {
    const events: AgUiEvent[] = [];
    const subscriber = createAgUiSubscriber({
      dispatch: (evt) => events.push(evt),
      runId: "run",
    });

    subscriber.onRunFinishedEvent?.({
      event: { type: "RUN_FINISHED" },
    });
    subscriber.onRunFinalized?.();

    expect(events).toEqual([{ type: "RUN_FINISHED", runId: "run" }]);
  });

  it("ignores onRunFinishedEvent payloads that parse as a different event type", () => {
    const events: AgUiEvent[] = [];
    const subscriber = createAgUiSubscriber({
      dispatch: (evt) => events.push(evt),
      runId: "run",
    });

    subscriber.onRunFinishedEvent?.({
      event: { type: "TEXT_MESSAGE_CHUNK", delta: "hi" },
    });
    subscriber.onRunFinalized?.();

    expect(events).toEqual([{ type: "RUN_FINISHED", runId: "run" }]);
  });

  it("dispatches activity snapshots without duplication", () => {
    const events: AgUiEvent[] = [];
    const subscriber = createAgUiSubscriber({
      dispatch: (evt) => events.push(evt),
      runId: "run",
    });

    const event = {
      type: "ACTIVITY_SNAPSHOT",
      messageId: "m1",
      activityType: "mcp-apps",
      content: {
        resourceUri: "ui://srv/mcp-app.html",
        toolInput: { city: "sf" },
      },
    };
    subscriber.onActivitySnapshotEvent?.({ event });
    subscriber.onEvent?.({ event });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "ACTIVITY_SNAPSHOT",
      activityType: "mcp-apps",
      content: {
        resourceUri: "ui://srv/mcp-app.html",
        toolInput: { city: "sf" },
      },
    });
  });

  it("only dispatches reasoning once when @ag-ui/client delivers it via onEvent", () => {
    // Regression guard for the whitelist rewrite: @ag-ui/client (>=0.0.57)
    // does NOT invoke onReasoning*Event / onThinking*Event; those events
    // arrive exclusively through onEvent. The subscriber must therefore let
    // them fall through in onEvent instead of blindly returning on any typed
    // payload (which was the previous behavior and silently dropped
    // reasoning updates).
    const events: AgUiEvent[] = [];
    const subscriber = createAgUiSubscriber({
      dispatch: (evt) => events.push(evt),
      runId: "run",
    });

    subscriber.onEvent?.({
      event: {
        type: "REASONING_MESSAGE_CONTENT",
        messageId: "m1",
        delta: "think",
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "REASONING_MESSAGE_CONTENT",
      messageId: "m1",
      delta: "think",
    });
  });

  // === onEvent whitelist behavior (added when @ag-ui/client stopped
  //     dispatching THINKING_*/REASONING_* to typed callbacks) ===

  describe("onEvent whitelist filtering", () => {
    // Types @ag-ui/client is known to deliver via the corresponding typed
    // handler. onEvent must be a no-op for these to prevent double dispatch.
    it.each([
      ["RUN_STARTED", { type: "RUN_STARTED", runId: "run" }],
      ["RUN_FINISHED", { type: "RUN_FINISHED", runId: "run" }],
      ["RUN_ERROR", { type: "RUN_ERROR", message: "err" }],
      ["TEXT_MESSAGE_START", { type: "TEXT_MESSAGE_START", messageId: "m" }],
      [
        "TEXT_MESSAGE_CONTENT",
        { type: "TEXT_MESSAGE_CONTENT", messageId: "m", delta: "hi" },
      ],
      ["TEXT_MESSAGE_END", { type: "TEXT_MESSAGE_END", messageId: "m" }],
      ["TEXT_MESSAGE_CHUNK", { type: "TEXT_MESSAGE_CHUNK", delta: "hi" }],
      ["TOOL_CALL_START", { type: "TOOL_CALL_START", toolCallId: "t" }],
      [
        "TOOL_CALL_ARGS",
        { type: "TOOL_CALL_ARGS", toolCallId: "t", delta: "{" },
      ],
      ["TOOL_CALL_END", { type: "TOOL_CALL_END", toolCallId: "t" }],
      ["TOOL_CALL_CHUNK", { type: "TOOL_CALL_CHUNK", toolCallId: "t" }],
      [
        "TOOL_CALL_RESULT",
        { type: "TOOL_CALL_RESULT", toolCallId: "t", content: "ok" },
      ],
      [
        "ACTIVITY_SNAPSHOT",
        {
          type: "ACTIVITY_SNAPSHOT",
          activityType: "mcp-apps",
          content: { resourceUri: "ui://x" },
        },
      ],
      ["STATE_SNAPSHOT", { type: "STATE_SNAPSHOT", snapshot: { k: 1 } }],
      ["STATE_DELTA", { type: "STATE_DELTA", delta: [] }],
      ["MESSAGES_SNAPSHOT", { type: "MESSAGES_SNAPSHOT", messages: [] }],
      ["CUSTOM", { type: "CUSTOM", name: "foo", value: 1 }],
      ["RAW", { type: "RAW", event: { any: true } }],
      ["STEP_STARTED", { type: "STEP_STARTED", stepName: "s" }],
      ["STEP_FINISHED", { type: "STEP_FINISHED", stepName: "s" }],
    ])("skips whitelisted %s in onEvent (no dispatch)", (_label, event) => {
      const events: AgUiEvent[] = [];
      const subscriber = createAgUiSubscriber({
        dispatch: (evt) => events.push(evt),
        runId: "run",
      });
      subscriber.onEvent?.({ event });
      expect(events).toEqual([]);
    });

    // Types @ag-ui/client is known to deliver ONLY via onEvent. These must
    // fall through so downstream reducers actually receive them.
    it.each([
      ["THINKING_START", { type: "THINKING_START", title: "t" }],
      ["THINKING_TEXT_MESSAGE_START", { type: "THINKING_TEXT_MESSAGE_START" }],
      [
        "THINKING_TEXT_MESSAGE_CONTENT",
        { type: "THINKING_TEXT_MESSAGE_CONTENT", delta: "d" },
      ],
      ["THINKING_TEXT_MESSAGE_END", { type: "THINKING_TEXT_MESSAGE_END" }],
      ["THINKING_END", { type: "THINKING_END" }],
      ["REASONING_START", { type: "REASONING_START", messageId: "r" }],
      [
        "REASONING_MESSAGE_START",
        { type: "REASONING_MESSAGE_START", messageId: "r" },
      ],
      [
        "REASONING_MESSAGE_CONTENT",
        { type: "REASONING_MESSAGE_CONTENT", messageId: "r", delta: "d" },
      ],
      [
        "REASONING_MESSAGE_END",
        { type: "REASONING_MESSAGE_END", messageId: "r" },
      ],
      ["REASONING_END", { type: "REASONING_END", messageId: "r" }],
    ])(
      "dispatches non-whitelisted %s through onEvent (fallback path)",
      (_label, event) => {
        const events: AgUiEvent[] = [];
        const subscriber = createAgUiSubscriber({
          dispatch: (evt) => events.push(evt),
          runId: "run",
        });
        subscriber.onEvent?.({ event });
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ type: event.type });
      },
    );

    it("ignores payloads without a string type field", () => {
      const events: AgUiEvent[] = [];
      const subscriber = createAgUiSubscriber({
        dispatch: (evt) => events.push(evt),
        runId: "run",
      });
      subscriber.onEvent?.({ event: { delta: "no type" } });
      expect(events).toEqual([]);
    });

    it("ignores non-object payloads", () => {
      const events: AgUiEvent[] = [];
      const subscriber = createAgUiSubscriber({
        dispatch: (evt) => events.push(evt),
        runId: "run",
      });
      subscriber.onEvent?.({ event: null });
      subscriber.onEvent?.({ event: "not-an-object" });
      subscriber.onEvent?.({ event: 42 });
      expect(events).toEqual([]);
    });

    it("wraps unknown typed events as RAW via parseAgUiEvent's default branch", () => {
      const events: AgUiEvent[] = [];
      const subscriber = createAgUiSubscriber({
        dispatch: (evt) => events.push(evt),
        runId: "run",
      });
      subscriber.onEvent?.({
        event: { type: "SOME_FUTURE_EVENT", data: "x" },
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "RAW",
        source: "SOME_FUTURE_EVENT",
      });
    });

    it("does not double-dispatch when @ag-ui/client fires both the typed callback and onEvent", () => {
      // Reproduces the real @ag-ui/client contract for whitelisted types:
      // both the typed handler AND onEvent are invoked with the same event.
      const events: AgUiEvent[] = [];
      const subscriber = createAgUiSubscriber({
        dispatch: (evt) => events.push(evt),
        runId: "run",
      });
      const event = {
        type: "TEXT_MESSAGE_CONTENT",
        messageId: "m",
        delta: "hello",
      };
      subscriber.onTextMessageContentEvent?.({ event });
      subscriber.onEvent?.({ event });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "TEXT_MESSAGE_CONTENT",
        delta: "hello",
      });
    });
  });
});
