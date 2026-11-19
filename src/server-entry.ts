// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Every request renders in the locale from the locale cookie, else Accept-Language, else English.
import handler from "@tanstack/react-start/server-entry";
import { paraglideMiddleware } from "@/i18n/server";

export default {
  fetch(request: Request): Promise<Response> {
    return paraglideMiddleware(request, () => handler.fetch(request));
  },
};
