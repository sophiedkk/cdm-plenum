// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The brainstorm wording per model type (EL14, EL18, SC4).
import { describe, expect, it } from "vitest";
import { ELEMENT_PROMPTS } from "@/lib/brainstorm";
import { MODEL_TYPES } from "@/lib/model-types";
import { groupName, promptLabel, promptQuestion } from "./labels.ts";

const LOCALES = ["en", "nl"] as const;

const QUESTIONS_EN = {
  observation: [
    "What do you record or measure?",
    "What about the patient do you need to know to interpret it?",
    "How was it measured: method, device or position?",
    "In which situation or for which use is it recorded?",
  ],
  evaluation: [
    "What is concluded or assessed?",
    "What is it based on: findings, evidence or reasoning?",
    "How certain is it, and what is its status?",
    "In which situation or for which use is it recorded?",
  ],
  instruction: [
    "What is asked or ordered?",
    "When and how often should it happen?",
    "Why is it asked?",
    "In which situation or for which use is it recorded?",
  ],
  action: [
    "What was done?",
    "Which step of the process was it, and when?",
    "How was it done: method or device?",
    "In which situation or for which use is it recorded?",
  ],
  cluster: [
    "Which parts make up the sub-block?",
    "What do you need to know about each part?",
    "How was it determined: method or device?",
    "In which models will it be reused?",
  ],
} as const;

const GROUPS_EN = {
  observation: ["The measurement", "The patient's state", "How it was measured", "The situation"],
  evaluation: ["The conclusion", "The basis", "Certainty and status", "The situation"],
  instruction: ["The request", "Timing", "The reason", "The situation"],
  action: ["What was done", "Step and time", "How it was done", "The situation"],
  cluster: ["The parts", "Details of the parts", "How it was determined", "Where it is used"],
} as const;

describe("the wording per model type", () => {
  it("asks the questions of each type in the four slots, in order", () => {
    for (const type of MODEL_TYPES) {
      expect(
        ELEMENT_PROMPTS.map((prompt) => promptQuestion(prompt, type, { locale: "en" })),
      ).toEqual(QUESTIONS_EN[type]);
    }
  });

  it("names the starting groups of each type", () => {
    for (const type of MODEL_TYPES) {
      expect(
        ELEMENT_PROMPTS.map((prompt) => groupName({ name: null, prompt }, type, { locale: "en" })),
      ).toEqual(GROUPS_EN[type]);
    }
  });

  it("reads a project without a type as an observation", () => {
    for (const locale of LOCALES) {
      for (const prompt of ELEMENT_PROMPTS) {
        const options = { locale };
        expect(promptQuestion(prompt, null, options)).toBe(
          promptQuestion(prompt, "observation", options),
        );
        expect(promptLabel(prompt, null, options)).toBe(
          promptLabel(prompt, "observation", options),
        );
        expect(groupName({ name: null, prompt }, null, options)).toBe(
          groupName({ name: null, prompt }, "observation", options),
        );
      }
    }
  });

  it("has a question, a label and a group name in both languages for every type and slot", () => {
    for (const locale of LOCALES) {
      for (const type of MODEL_TYPES) {
        for (const prompt of ELEMENT_PROMPTS) {
          const options = { locale };
          for (const text of [
            promptQuestion(prompt, type, options),
            promptLabel(prompt, type, options),
            groupName({ name: null, prompt }, type, options),
          ]) {
            expect(text.length).toBeGreaterThan(0);
            expect(text).not.toMatch(/^board_/);
          }
        }
      }
    }
  });

  it("keeps the Dutch of a type apart from the English", () => {
    for (const type of MODEL_TYPES) {
      for (const prompt of ELEMENT_PROMPTS) {
        if (type !== "cluster" && prompt === "context") continue;
        expect(promptQuestion(prompt, type, { locale: "nl" })).not.toBe(
          promptQuestion(prompt, type, { locale: "en" }),
        );
      }
    }
  });

  it("keeps a name the facilitator gave when the type changes", () => {
    const renamed = { name: "Our own name", prompt: "recorded" } as const;
    for (const type of MODEL_TYPES) {
      expect(groupName(renamed, type, { locale: "en" })).toBe("Our own name");
    }
    const started = { name: null, prompt: "recorded" } as const;
    expect(groupName(started, "observation", { locale: "en" })).toBe("The measurement");
    expect(groupName(started, "evaluation", { locale: "en" })).toBe("The conclusion");
  });

  it("shows no group name for a group without a name or question", () => {
    expect(groupName({ name: null, prompt: null }, "action")).toBe("");
  });
});
