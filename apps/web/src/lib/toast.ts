import { toastManager } from "@/components/ui/toast";
import { errorMessage } from "./api";

export const toast = {
  success: (title: string, description?: string) => toastManager.add({ title, description, type: "success" }),
  info: (title: string, description?: string) => toastManager.add({ title, description, type: "info" }),
  warning: (title: string, description?: string) => toastManager.add({ title, description, type: "warning" }),
  error: (titleOrError: unknown, description?: string) =>
    toastManager.add({
      title: typeof titleOrError === "string" ? titleOrError : errorMessage(titleOrError),
      description,
      type: "error",
    }),
};
