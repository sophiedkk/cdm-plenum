// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The project's model type for every page below the project layout: the brainstorm questions and
// the names of the starting groups follow it (EL14, EL18, SC4).
import { createContext, useContext } from "react";
import type { ModelType } from "@/lib/model-types";

const ModelTypeContext = createContext<ModelType | null>(null);

export const ModelTypeProvider = ModelTypeContext.Provider;

/** The model type of the project the page belongs to; null until the facilitator sets one. */
export function useModelType(): ModelType | null {
  return useContext(ModelTypeContext);
}
