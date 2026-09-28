import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Image src="/brand/organo-healers-logo.png" alt="Organo Healers Plant Studio" width={180} height={36} priority className="h-auto w-[180px]" />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Use your Organo Healers staff account.</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
      <div className="relative hidden overflow-hidden border-l bg-brand-soft lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_100%_0%,color-mix(in_oklch,var(--brand)_22%,transparent),transparent_60%)]" />
        <div className="relative flex h-full flex-col justify-end p-12">
          <p className="max-w-md text-3xl font-semibold leading-tight tracking-tight text-foreground">
            Estimates, invoices, follow-ups and stock for the studio, in one place.
          </p>
          <p className="mt-3 max-w-md text-sm text-muted-foreground">From the first site visit to the final payment.</p>
        </div>
      </div>
    </div>
  );
}
