import { toastManager } from "@/components/ui/toast";
import { errorMessage } from "./api";

type PromiseOptions<T> = Parameters<typeof toastManager.promise<T>>[1];

export const toast = {
  /** Loading toast that turns into success or error when the promise settles. */
  promise: <T,>(promise: Promise<T>, options: PromiseOptions<T>) => toastManager.promise(promise, options).catch(() => undefined),
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
