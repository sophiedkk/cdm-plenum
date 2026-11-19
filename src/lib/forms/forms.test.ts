// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The form foundation without a DOM: error messages and server refusals in a TanStack FormApi.
import { FieldApi, FormApi } from "@tanstack/react-form";
import { describe, expect, it } from "vitest";
import { errorMessages } from "./errors.ts";
import { applyServerRefusal, fieldRefusalNumber, formRefusal } from "./server-refusal.ts";

describe("errorMessages", () => {
  it("reads strings, Standard Schema issues and nested arrays, once each and in order", () => {
    expect(
      errorMessages(["Enter a name.", [{ message: "Too long." }, { message: "Enter a name." }]]),
    ).toEqual([{ message: "Enter a name." }, { message: "Too long." }]);
  });

  it("skips empty slots and objects without a message", () => {
    expect(errorMessages([undefined, null, "", {}, { message: 3 }, { message: "" }])).toEqual([]);
  });
});

function newForm() {
  const form = new FormApi({ defaultValues: { name: "Blood pressure" } });
  form.mount();
  // The error map reaches a field only once a field component has mounted it.
  new FieldApi({ form, name: "name" }).mount();
  return form;
}

describe("applyServerRefusal", () => {
  it("keeps a form refusal for the values and the submit it was given for", () => {
    const form = newForm();
    applyServerRefusal(form, { form: "Your role does not allow this." });
    expect(formRefusal(form, form.state)?.message).toBe("Your role does not allow this.");
    form.setFieldValue("name", "Allergy");
    expect(formRefusal(form, form.state)).toBeUndefined();
  });

  it("drops the form refusal at the next submit", async () => {
    const form = newForm();
    applyServerRefusal(form, { form: "Refused." });
    await form.handleSubmit();
    expect(formRefusal(form, form.state)).toBeUndefined();
  });

  it("puts a field refusal on the field and numbers each new one", () => {
    const form = newForm();
    expect(fieldRefusalNumber(form)).toBeUndefined();
    applyServerRefusal(form, { fields: { name: "Another group has this name." } });
    const first = fieldRefusalNumber(form);
    expect(form.getFieldMeta("name")?.errorMap.onServer).toBe("Another group has this name.");
    applyServerRefusal(form, { fields: { name: "Another group has this name." } });
    expect(fieldRefusalNumber(form)).toBeGreaterThan(first ?? 0);
  });

  it("clears an earlier form refusal when a refusal has none", () => {
    const form = newForm();
    applyServerRefusal(form, { form: "Refused." });
    applyServerRefusal(form, { fields: { name: "Taken." } });
    expect(formRefusal(form, form.state)).toBeUndefined();
  });
});
