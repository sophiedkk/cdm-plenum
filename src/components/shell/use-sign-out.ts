// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { m } from "@/i18n/messages";
import { authClient } from "@/lib/auth-client";

/**
 * Signs the user out and goes to the sign-in page; a failure shows a toast. The Query cache is
 * emptied, so nothing the user loaded stays in memory for the next person at the same computer.
 */
export function useSignOut(): { signOut: () => Promise<void>; pending: boolean } {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    const { error } = await authClient.signOut();
    setPending(false);
    if (error) {
      toast.error(m.shell_sign_out_failed());
      return;
    }
    queryClient.clear();
    await router.invalidate();
    await router.navigate({ to: "/sign-in" });
  }

  return { signOut, pending };
}
